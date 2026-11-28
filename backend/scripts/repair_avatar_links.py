#!/usr/bin/env python3
"""
Repair ``users.avatar_url`` values that still point at the legacy avatar layout.

Background (TD-146). The 2026-08-05 layout migration moved each avatar object to
``users/{user_id}/avatars/{file}`` and kept the file name. Knot 5 then deleted the
legacy key shim, so rows that still hold a legacy key (``{user_id}/avatars/{file}``,
bare or inside a URL) stopped resolving. The first estimate of 34 rows and 66 objects
came from reads capped at 1,000 rows, so it is wrong. A read-only dry run on
2026-11-20 read all 2,446 users rows. It found 57 rows to repoint, 26 to copy and
repoint, and 39 to clear.

For each row whose avatar key is legacy-shaped, the script computes the target
``users/{row_id}/avatars/{file}`` and takes the first action that applies:

  repoint  The target exists. Point the row at it.
  copy     The target is missing and the legacy original exists. Copy the original to
           the target (no thumbnail), then point the row at it.
  clear    The target and the legacy original are both missing, and the user has no
           avatar object in either layout. Set ``avatar_url`` to NULL.
  review   Anything else. The row stays untouched.

SAFETY GUARANTEES

1) DRY-RUN FIRST. Without ``--apply`` the script reads the DB and the bucket and
   writes nothing, not even the audit log.

2) HEAD BEFORE EACH WRITE. A target or an original is checked with HEAD just before
   its copy or row change. A missing object leaves the row untouched.

3) COMPARE-AND-SET. Every UPDATE matches the ``avatar_url`` value that was read. A row
   that changed after the read, for example after a new upload, is skipped.

4) SAME VALUE AS UPLOAD. A repointed row holds the presigned URL that
   ``StorageService.upload_avatar`` stores, so it looks like a new upload.

5) NO OVERWRITES, NO DELETES. A copy runs only when the target does not exist. No
   bucket object is deleted, so the legacy originals stay in the bucket.

6) VERIFY FROM A FRESH READ. After the writes, each row must hold the value that was
   written, or NULL after a clear. Each target must exist on HEAD.

7) AUDIT LOG. Each copy, repoint, clear, skip, and failure is appended to
   ``AUDIT_FILE`` (JSONL) with keys only. Presigned URLs never reach stdout or the log.

USAGE
    cd backend && source .venv/bin/activate
    python scripts/repair_avatar_links.py           # dry-run report
    python scripts/repair_avatar_links.py --apply   # write (owner approval required)

Env: AUDIT_FILE (default backend/logs/repair_avatar_links.jsonl).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Collection, Dict, List, Optional, Set, Tuple

# Make the backend package importable when run from the backend dir.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts._common import _env, _utc_now_iso  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.storage_keys import (  # noqa: E402
    CANONICAL_CATEGORIES,
    USERS_FOLDER,
    key_from_path,
    parse_key,
    thumb_key_for,
)
from app.db.connection import SupabaseDB  # noqa: E402
from app.services.object_storage import close_storage_backend, get_storage_backend  # noqa: E402

_PAGE_SIZE = 1000
_DEFAULT_AUDIT = BACKEND_ROOT / "logs" / "repair_avatar_links.jsonl"

# Row statuses. A legacy row is repointed, copied, cleared, or left for review.
CURRENT = "current"
LEGACY = "legacy"
COPY = "copy"
CLEAR = "clear"
TARGET_MISSING = "target_missing"
UNREPAIRABLE_NAME = "unrepairable_name"
OWNER_MISMATCH = "owner_mismatch"
NOT_AVATAR = "not_avatar"
UNPARSEABLE = "unparseable"
EXTERNAL = "external"
EMPTY = "empty"
_STATUS_ORDER = (
    CURRENT,
    LEGACY,
    COPY,
    CLEAR,
    TARGET_MISSING,
    UNREPAIRABLE_NAME,
    OWNER_MISMATCH,
    NOT_AVATAR,
    UNPARSEABLE,
    EXTERNAL,
    EMPTY,
)
_REVIEW_STATUSES = frozenset({TARGET_MISSING, UNREPAIRABLE_NAME, OWNER_MISMATCH, NOT_AVATAR, UNPARSEABLE})

# Apply outcomes.
REPOINTED = "repointed"
CLEARED = "cleared"
SKIPPED = "skipped"
FAILED = "failed"


@dataclass(frozen=True)
class RowPlan:
    row_id: str
    old_value: Any  # raw stored value, kept for the compare-and-set; never printed
    status: str
    legacy_key: Optional[str] = None
    target_key: Optional[str] = None


@dataclass
class Plan:
    rows: int
    counts: Counter
    repoints: List[RowPlan]
    copies: List[RowPlan]
    clears: List[RowPlan]
    review: List[RowPlan]
    thumb_missing: Set[str]


def _is_own_avatar(ref: Any, row_id: str) -> bool:
    return ref is not None and ref.layout == "canonical" and ref.category == "avatars" and ref.user == row_id


def classify_row(row_id: str, avatar_url: Any) -> RowPlan:
    """Classify one ``users.avatar_url`` value. Pure: no I/O."""
    if not isinstance(avatar_url, str) or not avatar_url.strip():
        return RowPlan(row_id, avatar_url, EMPTY)
    key = key_from_path(avatar_url)
    if not key:
        return RowPlan(row_id, avatar_url, EXTERNAL)
    ref = parse_key(key)
    if ref is not None and ref.layout == "canonical" and ref.category == "avatars":
        return RowPlan(row_id, avatar_url, CURRENT if ref.user == row_id else OWNER_MISMATCH, key)
    parts = key.split("/")
    if len(parts) == 3 and parts[1] == "avatars":  # legacy {user}/avatars/{file}
        if parts[0] != row_id:
            return RowPlan(row_id, avatar_url, OWNER_MISMATCH, key)
        target = f"{USERS_FOLDER}/{row_id}/avatars/{parts[2]}"
        status = LEGACY if _is_own_avatar(parse_key(target), row_id) else UNREPAIRABLE_NAME
        return RowPlan(row_id, avatar_url, status, key, target)
    if len(parts) >= 3 and parts[0] == USERS_FOLDER:
        return RowPlan(row_id, avatar_url, UNPARSEABLE if parts[2] == "avatars" else NOT_AVATAR, key)
    if len(parts) >= 3 and parts[1] in CANONICAL_CATEGORIES:
        return RowPlan(row_id, avatar_url, UNPARSEABLE if parts[1] == "avatars" else NOT_AVATAR, key)
    return RowPlan(row_id, avatar_url, UNPARSEABLE, key)


def _is_thumb_name(key: str) -> bool:
    return "_thumb." in key.rsplit("/", 1)[-1]


def _avatar_objects_per_user(bucket_keys: Collection[str]) -> Counter:
    """Count avatar objects per user in both layouts, thumbnails included. Pure."""
    counts: Counter = Counter()
    for key in bucket_keys:
        parts = key.split("/")
        if len(parts) >= 4 and parts[0] == USERS_FOLDER and parts[2] == "avatars":
            counts[parts[1]] += 1
        elif len(parts) >= 3 and parts[1] == "avatars":
            counts[parts[0]] += 1
    return counts


def build_plan(rows: List[Dict[str, Any]], bucket_keys: Collection[str]) -> Plan:
    """Give each row one action, or leave it for review. Pure: no I/O."""
    avatar_objects = _avatar_objects_per_user(bucket_keys)
    counts: Counter = Counter()
    repoints: List[RowPlan] = []
    copies: List[RowPlan] = []
    clears: List[RowPlan] = []
    review: List[RowPlan] = []
    thumb_missing: Set[str] = set()
    for row in rows:
        row_id = str(row["id"])
        item = classify_row(row_id, row.get("avatar_url"))
        if item.status == LEGACY and item.target_key not in bucket_keys:
            if item.legacy_key in bucket_keys and not _is_thumb_name(item.legacy_key):
                item = replace(item, status=COPY)
            elif item.legacy_key not in bucket_keys and avatar_objects[row_id] == 0:
                item = replace(item, status=CLEAR)
            else:
                item = replace(item, status=TARGET_MISSING)
        counts[item.status] += 1
        if item.status == LEGACY:
            repoints.append(item)
            if thumb_key_for(item.target_key) not in bucket_keys:
                thumb_missing.add(row_id)
        elif item.status == COPY:
            copies.append(item)
        elif item.status == CLEAR:
            clears.append(item)
        elif item.status in _REVIEW_STATUSES:
            review.append(item)
    return Plan(len(rows), counts, repoints, copies, clears, review, thumb_missing)


def _read_all_users(db: Any) -> List[Dict[str, Any]]:
    """Read every users row. Pages until an empty page, so a server row cap below the
    page size cannot cut the read short."""
    rows: List[Dict[str, Any]] = []
    while True:
        resp = (
            db.table("users").select("id,avatar_url").order("id").range(len(rows), len(rows) + _PAGE_SIZE - 1).execute()
        )
        page = resp.data or []
        if not page:
            return rows
        rows.extend(page)


def _print_report(plan: Plan) -> None:
    print(f"  {plan.rows} users row(s) read")
    for status in _STATUS_ORDER:
        print(f"    {status:<18} {plan.counts.get(status, 0)}")
    print(f"  {len(plan.thumb_missing)} repoint candidate(s) have no _thumb sibling (informational)")
    for item in plan.repoints:
        print(f"  repoint  {item.legacy_key} -> {item.target_key}")
    for item in plan.copies:
        print(f"  copy     {item.legacy_key} -> {item.target_key}")
    for item in plan.clears:
        print(f"  clear    {item.legacy_key}")
    for item in plan.review:
        print(f"  review   {item.status:<18} {item.legacy_key or '(no key)'}")


class _Audit:
    """Append-only JSONL log of decisions. Keys only, never URLs."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def write(self, action: str, item: RowPlan, error: str = "", *, cleared: bool = False) -> None:
        record = {
            "ts": _utc_now_iso(),
            "action": action,
            "user_id": item.row_id,
            "old_key": item.legacy_key,
            "new_key": None if cleared else item.target_key,
            "error": error or None,
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, separators=(",", ":")) + "\n")


def _compare_and_set(db: Any, item: RowPlan, new_value: Optional[str]) -> bool:
    """Write ``new_value`` only while the row still holds the value that was read."""
    resp = (
        db.table("users")
        .update({"avatar_url": new_value})
        .eq("id", item.row_id)
        .eq("avatar_url", item.old_value)
        .execute()
    )
    return bool(resp.data)


async def _repoint(db: Any, backend: Any, item: RowPlan, audit: _Audit) -> Tuple[str, Optional[str]]:
    """HEAD-check the target, then compare-and-set the row to the target's presigned URL."""
    target = item.target_key
    try:
        if await backend.head(target) is None:
            audit.write("skip", item, "target not found on HEAD")
            return SKIPPED, None
        # Same call as StorageService.get_public_url, which upload_avatar uses.
        value = await backend.presign_get(target, expires=settings.OBJECT_STORAGE_PRESIGN_TTL)
    except Exception as e:  # noqa: BLE001 - one bad row must not stop the run
        audit.write("fail", item, f"HEAD or presign failed: {type(e).__name__}")
        return FAILED, None
    if key_from_path(value) != target:
        audit.write("fail", item, "presigned value does not reduce to the target key")
        return FAILED, None
    if not _compare_and_set(db, item, value):
        audit.write("skip", item, "row changed after it was read")
        return SKIPPED, None
    audit.write("repoint", item)
    return REPOINTED, value


async def _copy_then_repoint(db: Any, backend: Any, item: RowPlan, audit: _Audit) -> Tuple[str, Optional[str]]:
    """Copy the legacy original to the target, then repoint the row.

    The copy runs only when HEAD shows no target, so it never overwrites an object.
    """
    try:
        if await backend.head(item.target_key) is None:
            if await backend.head(item.legacy_key) is None:
                audit.write("skip", item, "legacy original not found on HEAD")
                return SKIPPED, None
            await backend.copy(item.legacy_key, item.target_key)
            audit.write("copy", item)
    except Exception as e:  # noqa: BLE001 - one bad row must not stop the run
        audit.write("fail", item, f"copy failed: {type(e).__name__}")
        return FAILED, None
    return await _repoint(db, backend, item, audit)


async def _clear(db: Any, backend: Any, item: RowPlan, audit: _Audit) -> Tuple[str, Optional[str]]:
    """Set avatar_url to NULL, but only while neither object exists."""
    try:
        if await backend.head(item.legacy_key) is not None or await backend.head(item.target_key) is not None:
            audit.write("skip", item, "avatar object appeared after the listing", cleared=True)
            return SKIPPED, None
    except Exception as e:  # noqa: BLE001 - one bad row must not stop the run
        audit.write("fail", item, f"HEAD failed: {type(e).__name__}", cleared=True)
        return FAILED, None
    if not _compare_and_set(db, item, None):
        audit.write("skip", item, "row changed after it was read", cleared=True)
        return SKIPPED, None
    audit.write("clear", item, cleared=True)
    return CLEARED, None


async def _apply_one(db: Any, backend: Any, item: RowPlan, audit: _Audit) -> Tuple[str, Optional[str]]:
    if item.status == COPY:
        return await _copy_then_repoint(db, backend, item, audit)
    if item.status == CLEAR:
        return await _clear(db, backend, item, audit)
    return await _repoint(db, backend, item, audit)


async def _verified(backend: Any, item: RowPlan, stored: Any, written: Optional[str]) -> bool:
    """Check one row from a fresh read.

    A clear must read NULL. A repoint or copy must read back the exact value that was
    written, reduce to its target, parse as an avatar of the same user, and exist on HEAD.
    """
    if item.status == CLEAR:
        return stored is None
    if not isinstance(stored, str) or stored != written:
        return False
    key = key_from_path(stored)
    if key != item.target_key or not _is_own_avatar(parse_key(key), item.row_id):
        return False
    return await backend.head(item.target_key) is not None


async def repair(db: Any, backend: Any, *, apply: bool, audit_path: Path, bucket_keys: Collection[str]) -> int:
    """Print the report and, with ``apply``, write the changes. Returns the exit code."""
    if not bucket_keys:
        print("ERROR: the bucket listing is empty or failed. Nothing was changed.", file=sys.stderr)
        return 2
    plan = build_plan(_read_all_users(db), bucket_keys)
    _print_report(plan)
    if not apply:
        print(
            f"\nDRY-RUN: {len(plan.repoints)} to repoint, {len(plan.copies)} to copy and repoint, "
            f"{len(plan.clears)} to clear, {len(plan.review)} to review (untouched). "
            "Re-run with --apply to execute."
        )
        return 0

    audit = _Audit(audit_path)
    outcomes: Counter = Counter()
    done: List[Tuple[RowPlan, Optional[str]]] = []
    work = [*plan.copies, *plan.repoints, *plan.clears]
    print(f"\nAPPLYING {len(work)} row(s) (HEAD check, then compare-and-set)...")
    for item in work:
        outcome, written = await _apply_one(db, backend, item, audit)
        outcomes[outcome] += 1
        if outcome in (REPOINTED, CLEARED):
            done.append((item, written))
        new = "(NULL)" if item.status == CLEAR else item.target_key
        print(f"  {outcome.upper():<9} {item.legacy_key} -> {new}")

    # Verify from a fresh read, after every write.
    after = {str(row["id"]): row.get("avatar_url") for row in _read_all_users(db)}
    verified = 0
    for item, written in done:
        if await _verified(backend, item, after.get(item.row_id), written):
            verified += 1
        else:
            new = "(NULL)" if item.status == CLEAR else item.target_key
            print(f"  VERIFY FAILED {item.legacy_key} -> {new}")
    print(
        f"\nrepointed={outcomes[REPOINTED]} cleared={outcomes[CLEARED]} "
        f"skipped={outcomes[SKIPPED]} failed={outcomes[FAILED]} "
        f"verified={verified}/{len(done)} audit={audit_path}"
    )
    return 0 if outcomes[FAILED] == 0 and verified == len(done) else 1


async def _run(apply: bool, audit_path: Path) -> int:
    backend = get_storage_backend()
    db = SupabaseDB.get_service_client()
    try:
        print("Listing bucket objects...")
        # list_keys raises when the listing fails, before any read or write. A partial
        # key set would make a row with a live avatar look like it has none (CLEAR).
        bucket_keys = set(await backend.list_keys(""))
        print(f"  {len(bucket_keys)} object(s) in bucket")
        return await repair(db, backend, apply=apply, audit_path=audit_path, bucket_keys=bucket_keys)
    finally:
        await close_storage_backend()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Repair legacy users.avatar_url values (dry-run by default; each row "
        "changes only after its object is in place and verified)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the changes (default is dry-run).",
    )
    parser.add_argument(
        "--audit-file",
        default=_env("AUDIT_FILE", str(_DEFAULT_AUDIT)),
        help="JSONL audit log, written with --apply only.",
    )
    args = parser.parse_args()
    return asyncio.run(_run(apply=args.apply, audit_path=Path(args.audit_file)))


if __name__ == "__main__":
    raise SystemExit(main())
