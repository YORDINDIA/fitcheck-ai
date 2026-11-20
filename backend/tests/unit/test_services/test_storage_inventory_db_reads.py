"""Tests for the DB key reads in scripts/storage_inventory.py.

PostgREST returns at most 1,000 rows per request. The script used to read each
table with one unpaginated call, so the key set silently missed most live
photos. The orphan math then flagged them, and ``--delete`` would have removed
them. These tests pin two rules:

  * every table is read to the end, past the 1,000-row cap;
  * a failed read stops the run before any report or deletion.

The database is an in-memory fake that enforces the same row cap. The bucket is
a fake too. Nothing touches the network.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import app

import pytest

BACKEND_ROOT = Path(app.__file__).resolve().parents[1]
SCRIPT_PATH = BACKEND_ROOT / "scripts" / "storage_inventory.py"
SERVER_ROW_CAP = 1000
OLD = datetime(2020, 1, 1, tzinfo=timezone.utc)  # far past any grace window
ORPHAN = "users/u1/items/orphan.jpg"


@pytest.fixture(scope="module")
def script():
    """Load storage_inventory.py by path and return the module object."""
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    spec = importlib.util.spec_from_file_location("storage_inventory_db", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _FakeDB:
    """Stands in for the Supabase client. Each response stops at the row cap."""

    def __init__(self, rows=None, failing=()):
        self.rows = rows or {}
        self.failing = set(failing)

    def table(self, name):
        return _FakeTable(self, name)


class _FakeTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def select(self, columns):
        return _FakeQuery(self)


class _FakeQuery:
    def __init__(self, table):
        self.table = table
        self.after = None
        self.limit_to = SERVER_ROW_CAP

    def gt(self, column, value):
        assert column == "id"
        self.after = value
        return self

    def order(self, column):
        assert column == "id"
        return self

    def limit(self, count):
        self.limit_to = min(count, SERVER_ROW_CAP)
        return self

    def execute(self):
        name = self.table.name
        if name in self.table.db.failing:
            raise RuntimeError(f"{name} is unavailable")
        rows = sorted(self.table.db.rows.get(name, []), key=lambda row: row["id"])
        if self.after is not None:
            rows = [row for row in rows if row["id"] > self.after]
        return SimpleNamespace(data=rows[: self.limit_to])


class _FakeBackend:
    endpoint_url = "https://storage.example"
    bucket = "fake-bucket"

    def __init__(self):
        self.deleted = []

    async def delete_many(self, keys):
        self.deleted.extend(keys)
        return len(keys)

    async def close(self):
        return None


def _item_rows(count):
    """``count`` item_images rows. Each one points at its own bucket key."""
    return [{"id": f"{i:05d}", "storage_path": f"users/u1/items/item-{i:05d}.jpg"} for i in range(count)]


def _run_once(script, monkeypatch, tmp_path, db, delete):
    """Run the inventory against ``db``. Returns ``(exit_code, backend, audit)``."""
    backend = _FakeBackend()
    # Every referenced item is in the bucket, and one orphan is too.
    listing = {row["storage_path"]: OLD for row in db.rows.get("item_images", [])}
    listing[ORPHAN] = OLD

    async def fake_listing(_backend):
        return dict(listing)

    monkeypatch.setattr(script, "SupabaseDB", SimpleNamespace(get_service_client=lambda: db))
    monkeypatch.setattr(script, "_list_with_mtime", fake_listing)
    audit = tmp_path / "audit.jsonl"
    code = asyncio.run(
        script._run(
            delete=delete,
            audit_path=audit,
            orphan_list=None,
            min_age_hours=2,
            backend=backend,
        )
    )
    return code, backend, audit


def test_fake_database_enforces_the_row_cap():
    # Guard on the fake itself. A single read must come back short.
    db = _FakeDB({"item_images": _item_rows(2500)})
    page = db.table("item_images").select("id").execute().data
    assert len(page) == SERVER_ROW_CAP


def test_select_all_reads_past_the_row_cap(script):
    db = _FakeDB({"item_images": _item_rows(2500)})
    rows = script._select_all(db, "item_images", "id, storage_path")
    assert len(rows) == 2500
    assert len({row["id"] for row in rows}) == 2500


def test_collect_db_keys_counts_every_page(script):
    db = _FakeDB({"item_images": _item_rows(2500)})
    failures = []
    keys = script.collect_db_keys(db, failures)
    assert failures == []
    assert len(keys) == 2500
    assert "users/u1/items/item-02499.jpg" in keys


def test_failed_table_read_is_recorded(script):
    db = _FakeDB({"item_images": _item_rows(3)}, failing={"items"})
    failures = []
    keys = script.collect_db_keys(db, failures)
    assert len(keys) == 3
    assert len(failures) == 1
    assert failures[0].startswith("items.")


@pytest.mark.parametrize("table", ["item_images", "outfit_images", "items", "users", "support_tickets"])
def test_any_failed_read_blocks_delete(script, monkeypatch, tmp_path, table):
    db = _FakeDB({"item_images": _item_rows(3)}, failing={table})
    code, backend, audit = _run_once(script, monkeypatch, tmp_path, db, delete=True)
    assert code == 2
    assert backend.deleted == []
    assert not audit.exists()


def test_failed_read_stops_the_dry_run_report(script, monkeypatch, tmp_path, capsys):
    db = _FakeDB({"item_images": _item_rows(3)}, failing={"users"})
    code, backend, _audit = _run_once(script, monkeypatch, tmp_path, db, delete=False)
    out, err = capsys.readouterr()
    assert code == 2
    assert backend.deleted == []
    assert "ORPHAN" not in out
    assert "DB read(s) failed" in err


def test_delete_removes_only_the_orphan_when_reads_succeed(script, monkeypatch, tmp_path):
    db = _FakeDB({"item_images": _item_rows(3)})
    code, backend, audit = _run_once(script, monkeypatch, tmp_path, db, delete=True)
    assert code == 0
    # Referenced items stay. Only the unreferenced orphan is deleted.
    assert backend.deleted == [ORPHAN]
    assert audit.exists()
