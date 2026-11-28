"""
Gamification domain service: persistence for the gamification routes.

Every PostgREST query used by app/api/v1/gamification.py lives here. The route
module keeps the HTTP work: request parsing, response shaping, neutral payloads,
error mapping, logging, avatar materialization, and rank math.

Each function runs its query with asyncio.to_thread and returns the raw
Supabase response the route reads. Each query keeps the table, filters, order,
limit, and wrapper it had in the route.
"""

import asyncio
from typing import Any, List

from supabase import Client


# ============================================================================
# user_streaks
# ============================================================================


async def get_user_streak_row(db: Client, user_id: str) -> Any:
    """Read the full streak row for one user (0 or 1 rows)."""
    return await asyncio.to_thread(db.table("user_streaks").select("*").eq("user_id", user_id).maybe_single().execute)


async def upsert_user_streak_row(db: Client, insert: dict) -> Any:
    """Create the streak row, keyed on user_id, so a concurrent first read cannot duplicate it."""
    return await asyncio.to_thread(
        db.table("user_streaks").upsert(insert, on_conflict="user_id").execute
    )


async def get_top_streak_rows(db: Client) -> Any:
    """Read the top 25 streak rows by current streak, highest first."""
    return await asyncio.to_thread(
        db.table("user_streaks")
        .select("user_id,current_streak")
        .order("current_streak", desc=True)
        .limit(25)
        .execute
    )


async def get_user_current_streak_row(db: Client, user_id: str) -> Any:
    """Read only current_streak for one user (0 or 1 rows)."""
    return await asyncio.to_thread(db.table("user_streaks").select("current_streak").eq("user_id", user_id).maybe_single().execute)


async def count_streaks_above(db: Client, streak: int) -> Any:
    """Count streak rows whose current_streak is greater than ``streak``."""
    return await asyncio.to_thread(db.table("user_streaks").select("user_id", count="exact").gt("current_streak", streak).execute)


async def count_all_streaks(db: Client) -> Any:
    """Count all streak rows."""
    return await asyncio.to_thread(db.table("user_streaks").select("user_id", count="exact").execute)


# ============================================================================
# user_achievements
# ============================================================================


async def get_user_achievement_rows(db: Client, user_id: str) -> Any:
    """Read all achievement rows for one user, newest first."""
    return await asyncio.to_thread(db.table("user_achievements").select("*").eq("user_id", user_id).order("earned_at", desc=True).execute)


# ============================================================================
# users (profile fields for leaderboard display)
# ============================================================================


async def get_profile_rows(db: Client, user_ids: List[Any]) -> Any:
    """Read id, full_name, and avatar_url for the given user ids."""
    return await asyncio.to_thread(
        db.table("users")
        .select("id,full_name,avatar_url")
        .in_("id", user_ids)
        .execute
    )
