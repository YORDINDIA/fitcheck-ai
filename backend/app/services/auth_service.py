"""
Auth domain service: persistence for the register, login, and OAuth sync flows.

Keeps routes thin per the repo rule "routes thin, logic in services"
(ARCHITECTURE.md / AGENTS.md). Every PostgREST query used by the auth API
(app/api/v1/auth.py) lives here. The route module parses input, runs the
Supabase Auth calls, applies the profile retry loop, logs, maps errors, and
shapes responses.

Functions return the Supabase response value the route reads. Logger calls,
error mapping, and response envelopes stay in the route.
"""

import asyncio
from typing import Any, Dict

from app.utils.datetime_util import utcnow_iso
from app.utils.db import execute_with_reconnect


# ============================================================================
# Schema probe
# ============================================================================


def probe_schema_tables(db: Any) -> None:
    """Run the four schema probes. PostgREST errors propagate to the route."""
    db.table("users").select("id").limit(1).execute()
    db.table("user_preferences").select("preferred_occasions").limit(1).execute()
    db.table("items").select("material").limit(1).execute()
    db.table("outfits").select("is_public").limit(1).execute()


# ============================================================================
# public.users profile
# ============================================================================


async def upsert_user_profile_once(db: Any, payload: Dict[str, Any]) -> None:
    """Single upsert attempt. The route owns the FK retry loop."""
    # Query built outside the callable so the retry loop can't capture a
    # stale binding; to_thread keeps the sync client off the event loop.
    upsert = db.table("users").upsert(payload, on_conflict="id")
    await asyncio.to_thread(upsert.execute)


async def fetch_user_id_for_fallback(db: Any, payload: Dict[str, Any]) -> Any:
    """Existence check used after the FK retry loop gives up."""
    return await asyncio.to_thread(
        db.table("users")
        .select("id")
        .eq("id", payload.get("id"))
        .limit(1)
        .execute
    )


async def fetch_user_id_row(db: Any, user: Any) -> Any:
    """Login path: check whether the public.users row exists."""
    return await asyncio.to_thread(db.table("users").select("id").eq("id", user.id).execute)


async def update_user_profile(db: Any, user: Any, updates: Dict[str, Any]) -> None:
    """Login path: update last_login_at (and email_verified when confirmed)."""
    await asyncio.to_thread(
        db.table("users").update(updates).eq("id", user.id).execute
    )


async def fetch_user_profile_row(db: Any, user: Any) -> Any:
    """Login path: read the full profile row."""
    return await asyncio.to_thread(db.table("users").select("*").eq("id", user.id).execute)


# ============================================================================
# Default preferences and settings
# ============================================================================


async def upsert_default_preferences(db: Any, user_id: Any) -> None:
    """Register path: default user_preferences row."""
    await asyncio.to_thread(db.table("user_preferences").upsert({
        "user_id": user_id,
        "favorite_colors": [],
        "preferred_styles": [],
        "liked_brands": [],
        "disliked_patterns": [],
        "preferred_occasions": [],
        "data_points_collected": 0,
    }, on_conflict="user_id").execute)


async def upsert_default_settings(db: Any, user_id: Any) -> None:
    """Register path: default user_settings row."""
    await asyncio.to_thread(db.table("user_settings").upsert({
        "user_id": user_id,
        "language": "en",
        "measurement_units": "imperial",
        "notifications_enabled": True,
        "email_marketing": False,
        "dark_mode": False,
    }, on_conflict="user_id").execute)


async def upsert_login_default_preferences(db: Any, user: Any) -> None:
    """Login path: default user_preferences row for a missing profile."""
    await asyncio.to_thread(db.table("user_preferences").upsert({
        "user_id": user.id,
        "favorite_colors": [],
        "preferred_styles": [],
        "liked_brands": [],
        "disliked_patterns": [],
        "preferred_occasions": [],
        "data_points_collected": 0,
    }, on_conflict="user_id").execute)


async def upsert_login_default_settings(db: Any, user: Any) -> None:
    """Login path: default user_settings row for a missing profile."""
    await asyncio.to_thread(db.table("user_settings").upsert({
        "user_id": user.id,
        "language": "en",
        "measurement_units": "imperial",
        "notifications_enabled": True,
        "email_marketing": False,
        "dark_mode": False,
    }, on_conflict="user_id").execute)


# ============================================================================
# OAuth sync (execute_with_reconnect, one labelled call per query)
# ============================================================================


async def fetch_user_row_for_sync_lookup(db: Any, user_id: Any) -> Any:
    return await execute_with_reconnect(
        lambda d: d.table("users").select("*").eq("id", user_id).execute(),
        db,
        extra={"operation": "oauth_sync.lookup", "user_id": user_id},
    )


async def upsert_oauth_default_preferences(db: Any, user_id: Any) -> None:
    await execute_with_reconnect(
        lambda d: d.table("user_preferences").upsert({
            "user_id": user_id,
            "favorite_colors": [],
            "preferred_styles": [],
            "liked_brands": [],
            "disliked_patterns": [],
            "preferred_occasions": [],
            "data_points_collected": 0,
        }, on_conflict="user_id").execute(),
        db,
        extra={"operation": "oauth_sync.upsert_preferences", "user_id": user_id},
    )


async def upsert_oauth_default_settings(db: Any, user_id: Any) -> None:
    await execute_with_reconnect(
        lambda d: d.table("user_settings").upsert({
            "user_id": user_id,
            "language": "en",
            "measurement_units": "imperial",
            "notifications_enabled": True,
            "email_marketing": False,
            "dark_mode": False,
        }, on_conflict="user_id").execute(),
        db,
        extra={"operation": "oauth_sync.upsert_settings", "user_id": user_id},
    )


async def fetch_user_row_after_create(db: Any, user_id: Any) -> Any:
    return await execute_with_reconnect(
        lambda d: d.table("users").select("*").eq("id", user_id).execute(),
        db,
        extra={"operation": "oauth_sync.fetch_profile", "user_id": user_id},
    )


async def touch_oauth_last_login(db: Any, user_id: Any) -> None:
    await execute_with_reconnect(
        lambda d: d.table("users").update({
            "last_login_at": utcnow_iso()
        }).eq("id", user_id).execute(),
        db,
        extra={"operation": "oauth_sync.touch_login", "user_id": user_id},
    )
