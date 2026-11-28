"""Tests for scripts/_common.list_keys_with_mtime, the shared bucket listing.

Several scripts use this listing to choose what to read, copy, or delete. When the
listing fails partway, it must raise. A partial map would look like a complete
bucket to those scripts.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

import app

BACKEND_ROOT = Path(app.__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts._common import list_keys_with_mtime  # noqa: E402

MTIME = datetime(2026, 11, 1, tzinfo=timezone.utc)
PAGES = [
    {"Contents": [{"Key": "users/u1/a.jpg", "LastModified": MTIME}]},
    {"Contents": [{"Key": "users/u2/b.jpg", "LastModified": MTIME}]},
]


class _Paginator:
    def __init__(self, pages, fail_at):
        self._pages = pages
        self._fail_at = fail_at

    async def paginate(self, **_kwargs):
        for index, page in enumerate(self._pages):
            if index == self._fail_at:
                raise RuntimeError("listing dropped mid-way")
            yield page


class _Client:
    def __init__(self, pages, fail_at):
        self._paginator = _Paginator(pages, fail_at)

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return self._paginator


class _Backend:
    bucket = "fitcheck-test"

    def __init__(self, pages, fail_at=None):
        self._client = _Client(pages, fail_at)

    async def _get_client(self):
        return self._client


def test_listing_returns_every_key_when_it_succeeds():
    keys = asyncio.run(list_keys_with_mtime(_Backend(PAGES)))
    assert set(keys) == {"users/u1/a.jpg", "users/u2/b.jpg"}


def test_listing_that_fails_partway_raises():
    # The first page lists fine and the second page fails. Returning the first
    # page would hand the caller a partial bucket map, so the call must raise.
    with pytest.raises(RuntimeError, match="listing dropped mid-way"):
        asyncio.run(list_keys_with_mtime(_Backend(PAGES, fail_at=1)))
