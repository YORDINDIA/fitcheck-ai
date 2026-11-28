"""Tests for scripts/repair_avatar_links.py (TD-146 avatar link repair).

The script is loaded by path, the same way test_migrate_temp_keys_layout.py loads its
script. The classifier and the planner are pure. The repair flow runs against small
in-memory fakes for the DB and the bucket, so no network is used.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import app

import pytest

BACKEND_ROOT = Path(app.__file__).resolve().parents[1]
SCRIPT_PATH = BACKEND_ROOT / "scripts" / "repair_avatar_links.py"

ROW = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
THIRD = "33333333-3333-3333-3333-333333333333"
FOURTH = "44444444-4444-4444-4444-444444444444"
HEX = "0123456789abcdef0123456789abcdef"
BUCKET = "fitcheck-test"
TARGET = f"users/{ROW}/avatars/me.jpg"
LEGACY_KEY = f"{ROW}/avatars/me.jpg"
NEW_UPLOAD = "https://cdn.example.test/new-upload.jpg"


@pytest.fixture(scope="module")
def script():
    """Load repair_avatar_links.py by path and return the module."""
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    spec = importlib.util.spec_from_file_location("repair_avatar_links", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    # Register before exec: dataclasses look the module up in sys.modules.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------- #
# classify_row (pure)
# --------------------------------------------------------------------------- #
def test_legacy_bare_key_maps_to_users_layout(script):
    plan = script.classify_row(ROW, f"{ROW}/avatars/me.jpg")
    assert plan.status == script.LEGACY
    assert plan.legacy_key == f"{ROW}/avatars/me.jpg"
    assert plan.target_key == TARGET


def test_legacy_supabase_public_url_maps_to_users_layout(script):
    url = f"https://proj.supabase.co/storage/v1/object/public/avatars/{ROW}/avatars/me.jpg"
    plan = script.classify_row(ROW, url)
    assert plan.status == script.LEGACY
    assert plan.target_key == TARGET


def test_legacy_presigned_url_from_old_bucket_maps_to_users_layout(script):
    url = f"https://old.example.test/railway-bucket/{ROW}/avatars/me.jpg?X-Amz-Signature=abc"
    plan = script.classify_row(ROW, url)
    assert plan.status == script.LEGACY
    assert plan.target_key == TARGET


def test_legacy_name_with_hyphen_is_repointed(script):
    plan = script.classify_row(ROW, f"{ROW}/avatars/old-name.jpeg")
    assert plan.status == script.LEGACY
    assert plan.target_key == f"users/{ROW}/avatars/old-name.jpeg"


def test_current_key_is_left_alone(script):
    assert script.classify_row(ROW, f"users/{ROW}/avatars/{HEX}.jpg").status == script.CURRENT


def test_current_presigned_url_is_left_alone(script):
    url = f"https://h.example.test/{BUCKET}/users/{ROW}/avatars/{HEX}.jpg?X-Amz-Signature=abc"
    assert script.classify_row(ROW, url).status == script.CURRENT


def test_external_oauth_picture_is_not_ours(script):
    url = "https://lh3.googleusercontent.com/a/AItbvmkExample=s96-c"
    assert script.classify_row(ROW, url).status == script.EXTERNAL


@pytest.mark.parametrize("value", [None, "", "   "])
def test_empty_value_is_empty(script, value):
    assert script.classify_row(ROW, value).status == script.EMPTY


def test_legacy_key_of_another_user_is_owner_mismatch(script):
    plan = script.classify_row(ROW, f"{OTHER}/avatars/me.jpg")
    assert plan.status == script.OWNER_MISMATCH
    assert plan.target_key is None


def test_legacy_item_key_is_not_an_avatar(script):
    assert script.classify_row(ROW, f"{ROW}/items/{HEX}.jpg").status == script.NOT_AVATAR


def test_legacy_name_outside_the_key_grammar_is_flagged_not_repointed(script):
    # The key grammar takes lower-case image extensions only, so ".JPG" does not parse.
    plan = script.classify_row(ROW, f"{ROW}/avatars/IMG_0001.JPG")
    assert plan.status == script.UNREPAIRABLE_NAME
    assert plan.target_key == f"users/{ROW}/avatars/IMG_0001.JPG"


def test_current_avatar_with_unparseable_name_is_flagged(script):
    assert script.classify_row(ROW, f"users/{ROW}/avatars/Bad Name.jpg").status == script.UNPARSEABLE


# --------------------------------------------------------------------------- #
# build_plan (pure) and paging
# --------------------------------------------------------------------------- #
def test_build_plan_splits_each_action(script):
    rows = [
        {"id": ROW, "avatar_url": LEGACY_KEY},  # target present: repoint
        {"id": OTHER, "avatar_url": f"{OTHER}/avatars/copy.jpg"},  # original present: copy
        {"id": THIRD, "avatar_url": f"{THIRD}/avatars/gone.jpg"},  # nothing left: clear
        {"id": FOURTH, "avatar_url": None},
    ]
    bucket = {TARGET, f"users/{ROW}/avatars/me_thumb.webp", f"{OTHER}/avatars/copy.jpg"}
    plan = script.build_plan(rows, bucket)
    assert plan.rows == 4
    assert [p.target_key for p in plan.repoints] == [TARGET]
    assert [p.target_key for p in plan.copies] == [f"users/{OTHER}/avatars/copy.jpg"]
    assert [p.legacy_key for p in plan.clears] == [f"{THIRD}/avatars/gone.jpg"]
    assert plan.review == []
    assert plan.counts[script.EMPTY] == 1
    assert plan.thumb_missing == set()


def test_build_plan_reports_missing_thumbnail_without_blocking(script):
    plan = script.build_plan([{"id": ROW, "avatar_url": LEGACY_KEY}], {TARGET})
    assert [p.target_key for p in plan.repoints] == [TARGET]
    assert plan.thumb_missing == {ROW}


def test_missing_target_with_original_present_is_a_copy(script):
    plan = script.build_plan([{"id": ROW, "avatar_url": LEGACY_KEY}], {LEGACY_KEY})
    assert [p.target_key for p in plan.copies] == [TARGET]
    assert plan.repoints == [] and plan.clears == [] and plan.review == []


def test_missing_target_and_no_avatar_objects_is_a_clear(script):
    plan = script.build_plan([{"id": ROW, "avatar_url": LEGACY_KEY}], {f"{OTHER}/items/{HEX}.jpg"})
    assert [p.legacy_key for p in plan.clears] == [LEGACY_KEY]
    assert plan.copies == [] and plan.review == []


def test_any_avatar_object_of_the_user_keeps_the_row_for_review(script):
    bucket = {f"users/{ROW}/avatars/other.jpg"}
    plan = script.build_plan([{"id": ROW, "avatar_url": LEGACY_KEY}], bucket)
    assert plan.copies == [] and plan.clears == []
    assert [p.status for p in plan.review] == [script.TARGET_MISSING]


def test_thumbnail_only_avatar_object_blocks_the_clear(script):
    bucket = {f"users/{ROW}/avatars/{HEX}_thumb.webp"}
    plan = script.build_plan([{"id": ROW, "avatar_url": LEGACY_KEY}], bucket)
    assert plan.clears == []
    assert [p.status for p in plan.review] == [script.TARGET_MISSING]


def test_legacy_thumbnail_webp_is_flagged_not_copied(script):
    key = f"{ROW}/avatars/{HEX}_thumb.webp"
    plan = script.build_plan([{"id": ROW, "avatar_url": key}], {key})
    assert plan.copies == [] and plan.repoints == []
    assert [p.status for p in plan.review] == [script.UNREPAIRABLE_NAME]


def test_legacy_name_containing_thumb_is_never_copied(script):
    key = f"{ROW}/avatars/{HEX}_thumb.jpg"
    plan = script.build_plan([{"id": ROW, "avatar_url": key}], {key})
    assert plan.copies == []
    assert [p.status for p in plan.review] == [script.TARGET_MISSING]


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """The slice of the supabase-py query builder that the script uses."""

    def __init__(self, db):
        self._db = db
        self._filters = []
        self._values = None
        self._range = None

    def select(self, _columns):
        return self

    def order(self, _column):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def update(self, values):
        self._values = values
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        db = self._db
        if self._values is None:
            start, end = self._range or (0, len(db.rows) - 1)
            page = db.rows[start : end + 1]
            if db.row_cap is not None:  # a server that answers with fewer rows than asked
                page = page[: db.row_cap]
            return _Result([dict(r) for r in page])
        if db.concurrent_write:  # a write that lands between the read and the update
            for row in db.rows:
                row.update(db.concurrent_write)
            db.concurrent_write = None
        values = dict(self._values)
        db.updates.append(values)
        stored = db.store_transform(values) if db.store_transform else values
        matched = [r for r in db.rows if all(r.get(col) == val for col, val in self._filters)]
        for row in matched:
            row.update(stored)
        return _Result([dict(r) for r in matched])


class _FakeDB:
    def __init__(self, rows):
        self.rows = [dict(r) for r in rows]
        self.updates = []
        self.concurrent_write = None
        self.row_cap = None
        self.store_transform = None

    def table(self, name):
        assert name == "users"
        return _Query(self)


def test_read_all_users_pages_past_the_page_size(script, monkeypatch):
    monkeypatch.setattr(script, "_PAGE_SIZE", 2)
    rows = [{"id": f"00000000-0000-0000-0000-00000000000{i}", "avatar_url": None} for i in range(5)]
    assert len(script._read_all_users(_FakeDB(rows))) == 5


def test_read_all_users_survives_a_server_row_cap(script, monkeypatch):
    monkeypatch.setattr(script, "_PAGE_SIZE", 5)
    rows = [{"id": f"00000000-0000-0000-0000-00000000000{i}", "avatar_url": None} for i in range(7)]
    db = _FakeDB(rows)
    db.row_cap = 3  # the server answers at most 3 rows, although 5 were asked
    assert len(script._read_all_users(db)) == 7


# --------------------------------------------------------------------------- #
# repair flow against in-memory fakes (no network)
# --------------------------------------------------------------------------- #
class _FakeBackend:
    """Bucket stand-in with HEAD, presign, and copy. It has no delete method."""

    def __init__(self, objects, copy_error=None):
        self.objects = set(objects)
        self.copies = []
        self.copy_error = copy_error
        self.presign_value = None  # set to a value that does not reduce to the key

    async def head(self, key):
        return {"size": 1, "etag": "etag-1"} if key in self.objects else None

    async def presign_get(self, key, expires=900):
        if self.presign_value is not None:
            return self.presign_value
        return f"https://h.example.test/{BUCKET}/{key}?X-Amz-Expires={expires}&X-Amz-Signature=secret"

    async def list_keys(self, prefix=""):
        return sorted(self.objects)

    async def copy(self, src_key, dst_key):
        if self.copy_error is not None:
            raise self.copy_error
        if src_key not in self.objects:  # S3 answers NoSuchKey for a missing source
            raise KeyError(src_key)
        self.copies.append((src_key, dst_key))
        self.objects.add(dst_key)


def _repair(script, db, backend, bucket_keys, tmp_path, *, apply):
    audit = tmp_path / "audit.jsonl"
    code = asyncio.run(script.repair(db, backend, apply=apply, audit_path=audit, bucket_keys=bucket_keys))
    return code, audit


def test_dry_run_writes_nothing(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([TARGET])
    code, audit = _repair(script, db, backend, backend.objects, tmp_path, apply=False)
    assert code == 0
    assert db.updates == []
    assert not audit.exists()
    assert db.rows[0]["avatar_url"] == LEGACY_KEY


def test_dry_run_summary_counts_each_action(script, tmp_path, capsys):
    db = _FakeDB(
        [
            {"id": ROW, "avatar_url": LEGACY_KEY},
            {"id": OTHER, "avatar_url": f"{OTHER}/avatars/copy.jpg"},
            {"id": THIRD, "avatar_url": f"{THIRD}/avatars/gone.jpg"},
            {"id": FOURTH, "avatar_url": f"{FOURTH}/avatars/left.jpg"},
        ]
    )
    bucket = {TARGET, f"{OTHER}/avatars/copy.jpg", f"users/{FOURTH}/avatars/x.jpg"}
    code, audit = _repair(script, db, _FakeBackend(bucket), bucket, tmp_path, apply=False)
    out = capsys.readouterr().out
    assert code == 0
    assert "DRY-RUN: 1 to repoint, 1 to copy and repoint, 1 to clear, 1 to review (untouched)." in out
    assert db.updates == []
    assert backend_wrote_nothing(db) and not audit.exists()


def backend_wrote_nothing(db):
    return db.updates == []


def test_apply_repoints_the_row_and_keeps_the_signature_out_of_the_audit(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([TARGET])
    code, audit = _repair(script, db, backend, backend.objects, tmp_path, apply=True)
    assert code == 0
    assert script.key_from_path(db.rows[0]["avatar_url"]) == TARGET
    assert len(db.updates) == 1
    log = audit.read_text(encoding="utf-8")
    assert '"action":"repoint"' in log
    assert "X-Amz-Signature" not in log
    assert "secret" not in log


def test_row_changed_after_read_is_not_overwritten(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    db.concurrent_write = {"avatar_url": NEW_UPLOAD}
    backend = _FakeBackend([TARGET])
    code, audit = _repair(script, db, backend, backend.objects, tmp_path, apply=True)
    assert code == 0
    assert db.rows[0]["avatar_url"] == NEW_UPLOAD
    assert '"action":"skip"' in audit.read_text(encoding="utf-8")


def test_missing_target_with_an_unrelated_avatar_leaves_the_row_untouched(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    bucket = {f"users/{ROW}/avatars/other.jpg"}
    code, _audit = _repair(script, db, _FakeBackend(bucket), bucket, tmp_path, apply=True)
    assert code == 0
    assert db.updates == []
    assert db.rows[0]["avatar_url"] == LEGACY_KEY


def test_target_listed_but_not_on_head_is_skipped(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    code, audit = _repair(script, db, _FakeBackend([]), {TARGET}, tmp_path, apply=True)
    assert code == 0
    assert db.updates == []
    assert "target not found on HEAD" in audit.read_text(encoding="utf-8")


def test_presigned_value_that_does_not_reduce_to_target_fails_without_writing(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([TARGET])
    backend.presign_value = "https://cdn.example.test/unrelated.png"
    code, audit = _repair(script, db, backend, backend.objects, tmp_path, apply=True)
    assert code == 1
    assert db.updates == []
    assert '"action":"fail"' in audit.read_text(encoding="utf-8")


def test_empty_bucket_listing_aborts_before_any_write(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    code, _audit = _repair(script, db, _FakeBackend([]), set(), tmp_path, apply=True)
    assert code == 2
    assert db.updates == []


def test_copy_then_repoint_keeps_the_original_and_logs_both_steps(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([LEGACY_KEY])
    code, audit = _repair(script, db, backend, {LEGACY_KEY}, tmp_path, apply=True)
    assert code == 0
    assert backend.copies == [(LEGACY_KEY, TARGET)]
    assert LEGACY_KEY in backend.objects  # the original stays in the bucket
    assert script.key_from_path(db.rows[0]["avatar_url"]) == TARGET
    actions = [json.loads(line)["action"] for line in audit.read_text(encoding="utf-8").splitlines()]
    assert actions == ["copy", "repoint"]


def test_copy_is_skipped_when_the_target_already_exists(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([LEGACY_KEY])
    backend.objects.add(TARGET)  # the target appeared after the listing
    code, _audit = _repair(script, db, backend, {LEGACY_KEY}, tmp_path, apply=True)
    assert code == 0
    assert backend.copies == []
    assert script.key_from_path(db.rows[0]["avatar_url"]) == TARGET


def test_copy_is_skipped_when_the_original_vanished(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    code, audit = _repair(script, db, _FakeBackend([]), {LEGACY_KEY}, tmp_path, apply=True)
    assert code == 0
    assert db.updates == []
    assert db.rows[0]["avatar_url"] == LEGACY_KEY
    assert "legacy original not found on HEAD" in audit.read_text(encoding="utf-8")


def test_copy_failure_leaves_the_row_untouched(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([LEGACY_KEY], copy_error=RuntimeError("storage unavailable"))
    code, audit = _repair(script, db, backend, {LEGACY_KEY}, tmp_path, apply=True)
    assert code == 1
    assert db.updates == []
    assert db.rows[0]["avatar_url"] == LEGACY_KEY
    assert '"action":"fail"' in audit.read_text(encoding="utf-8")


def test_copy_then_row_changed_keeps_the_copy_and_does_not_overwrite(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    db.concurrent_write = {"avatar_url": NEW_UPLOAD}
    backend = _FakeBackend([LEGACY_KEY])
    code, audit = _repair(script, db, backend, {LEGACY_KEY}, tmp_path, apply=True)
    assert code == 0
    assert db.rows[0]["avatar_url"] == NEW_UPLOAD
    assert backend.copies == [(LEGACY_KEY, TARGET)]  # the copy stays
    assert '"action":"skip"' in audit.read_text(encoding="utf-8")


def test_clear_sets_null_and_logs_no_new_key(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    code, audit = _repair(script, db, _FakeBackend([]), {f"{OTHER}/items/{HEX}.jpg"}, tmp_path, apply=True)
    assert code == 0
    assert db.rows[0]["avatar_url"] is None
    record = json.loads(audit.read_text(encoding="utf-8").splitlines()[0])
    assert record["action"] == "clear"
    assert record["old_key"] == LEGACY_KEY
    assert record["new_key"] is None


def test_clear_is_skipped_when_an_object_appeared_after_the_listing(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([TARGET])  # the target appeared after the listing
    code, audit = _repair(script, db, backend, {f"{OTHER}/items/{HEX}.jpg"}, tmp_path, apply=True)
    assert code == 0
    assert db.updates == []
    assert db.rows[0]["avatar_url"] == LEGACY_KEY
    assert "appeared after the listing" in audit.read_text(encoding="utf-8")


def test_clear_row_changed_after_read_is_not_overwritten(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    db.concurrent_write = {"avatar_url": NEW_UPLOAD}
    code, audit = _repair(script, db, _FakeBackend([]), {f"{OTHER}/items/{HEX}.jpg"}, tmp_path, apply=True)
    assert code == 0
    assert db.rows[0]["avatar_url"] == NEW_UPLOAD
    assert '"action":"skip"' in audit.read_text(encoding="utf-8")


def test_verify_fails_when_the_stored_value_differs_from_the_written_one(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    # Same key, different signature: only the written-versus-stored comparison can catch it.
    db.store_transform = lambda values: {
        "avatar_url": f"https://h.example.test/{BUCKET}/{TARGET}?X-Amz-Signature=changed"
    }
    backend = _FakeBackend([TARGET])
    code, _audit = _repair(script, db, backend, backend.objects, tmp_path, apply=True)
    assert code == 1


def test_verify_fails_when_a_cleared_row_is_not_null(script, tmp_path):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    db.store_transform = lambda values: {"avatar_url": LEGACY_KEY}  # the clear did not stick
    code, _audit = _repair(script, db, _FakeBackend([]), {f"{OTHER}/items/{HEX}.jpg"}, tmp_path, apply=True)
    assert code == 1


# --------------------------------------------------------------------------- #
# _run: the bucket listing comes from list_keys and fails closed
# --------------------------------------------------------------------------- #
def _patch_run(script, monkeypatch, db, backend):
    async def _no_close():
        return None

    monkeypatch.setattr(script, "get_storage_backend", lambda: backend)
    monkeypatch.setattr(script, "close_storage_backend", _no_close)
    monkeypatch.setattr(script.SupabaseDB, "get_service_client", staticmethod(lambda: db))


def test_run_dry_run_lists_the_bucket_and_writes_nothing(script, tmp_path, monkeypatch):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([TARGET])
    _patch_run(script, monkeypatch, db, backend)
    assert asyncio.run(script._run(apply=False, audit_path=tmp_path / "audit.jsonl")) == 0
    assert db.updates == []
    assert not (tmp_path / "audit.jsonl").exists()


def test_listing_failure_stops_before_any_write(script, tmp_path, monkeypatch):
    db = _FakeDB([{"id": ROW, "avatar_url": LEGACY_KEY}])
    backend = _FakeBackend([TARGET])

    async def broken_listing(prefix=""):
        raise RuntimeError("listing dropped mid-way")

    backend.list_keys = broken_listing
    _patch_run(script, monkeypatch, db, backend)
    with pytest.raises(RuntimeError, match="listing dropped"):
        asyncio.run(script._run(apply=True, audit_path=tmp_path / "audit.jsonl"))
    assert db.updates == []
    assert not (tmp_path / "audit.jsonl").exists()


def test_verify_fails_when_the_target_is_not_on_head(script):
    item = script.classify_row(ROW, LEGACY_KEY)
    value = f"https://h.example.test/{BUCKET}/{TARGET}?X-Amz-Signature=secret"
    backend = _FakeBackend([])  # the target is not in the bucket
    assert asyncio.run(script._verified(backend, item, value, value)) is False
    backend.objects.add(TARGET)
    assert asyncio.run(script._verified(backend, item, value, value)) is True
