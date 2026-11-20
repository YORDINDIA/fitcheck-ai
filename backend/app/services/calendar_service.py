"""
Calendar domain service: persistence for the calendar API.

Every PostgREST query used by app/api/v1/calendar.py lives here. The route
module keeps the HTTP work: request parsing, validation, the time-window and
date-bound checks, the insert dict, branch logic between queries, logging,
error mapping, and response envelopes.

Each function returns the raw Supabase response the route reads. Each query
keeps the asyncio.to_thread wrapper it had in the route, so thread behavior
is unchanged.
"""

import asyncio
from typing import Any, Optional


# ============================================================================
# Calendar connections (public.calendar_connections)
# ============================================================================


async def fetch_connection_by_provider(db: Any, user_id: Any, provider: str) -> Any:
    """Read the user's connection row for one provider (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("calendar_connections")
        .select("id")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .maybe_single()
        .execute
    )


async def update_connection_row(db: Any, existing_row: Any, update: dict) -> Any:
    """Apply an update dict to the connection row the route already loaded."""
    return await asyncio.to_thread(
        db.table("calendar_connections")
        .update(update)
        .eq("id", existing_row["id"])
        .execute
    )


async def insert_connection(db: Any, insert: dict) -> Any:
    """Insert one connection row."""
    return await asyncio.to_thread(db.table("calendar_connections").insert(insert).execute)


async def fetch_connections(db: Any, user_id: Any) -> Any:
    """List all connection rows for the user, newest first."""
    return await asyncio.to_thread(
        db.table("calendar_connections")
        .select("*")
        .eq("user_id", user_id)
        .order("connected_at", desc=True)
        .execute
    )


async def fetch_owned_connection(db: Any, connection_id: str, user_id: Any) -> Any:
    """Read one connection row if it belongs to the user (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("calendar_connections")
        .select("id")
        .eq("id", connection_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def deactivate_connection(db: Any, connection_id: str, now: str) -> Any:
    """Soft-disable one connection row (is_active = False)."""
    return await asyncio.to_thread(
        db.table("calendar_connections").update({"is_active": False, "updated_at": now}).eq("id", connection_id).execute
    )


# ============================================================================
# Calendar events (public.calendar_events)
# ============================================================================


async def fetch_events_page(
    db: Any,
    user_id: Any,
    start_bound: Optional[str],
    end_bound: Optional[str],
    offset: int,
    limit: int,
) -> Any:
    """Read one page of the user's events, ordered by start_time ascending.

    The route validates the date filters and passes the converted bounds.
    A None bound means the route decided that filter does not apply.
    Fetches limit + 1 rows from offset so the route can tell has_more.
    """
    query = db.table("calendar_events").select("*").eq("user_id", user_id)

    if start_bound:
        query = query.gte("start_time", start_bound)
    if end_bound:
        query = query.lte("start_time", end_bound)

    return await asyncio.to_thread(query.order("start_time", desc=False).range(offset, offset + limit).execute)


async def insert_event(db: Any, insert: dict) -> Any:
    """Insert one event row."""
    return await asyncio.to_thread(db.table("calendar_events").insert(insert).execute)


async def fetch_event_window(db: Any, event_id: str, user_id: Any) -> Any:
    """Read the id and time-window fields of one owned event."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .select("id,start_time,end_time,is_all_day")
        .eq("id", event_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def fetch_event_row(db: Any, event_id: str) -> Any:
    """Read the full row of one event by id, without an owner filter."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .select("*")
        .eq("id", event_id)
        .maybe_single()
        .execute
    )


async def update_event(db: Any, event_id: str, update_data: dict) -> Any:
    """Apply an update dict to one event row by id."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .update(update_data)
        .eq("id", event_id)
        .execute
    )


async def fetch_owned_event_id(db: Any, event_id: str, user_id: Any) -> Any:
    """Read the id of one event before delete (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .select("id")
        .eq("id", event_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def delete_event(db: Any, event_id: str) -> Any:
    """Delete one event row by id."""
    return await asyncio.to_thread(db.table("calendar_events").delete().eq("id", event_id).execute)


async def fetch_owned_event_for_outfit(db: Any, event_id: str, user_id: Any) -> Any:
    """Read the id of one event before an outfit assignment (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .select("id")
        .eq("id", event_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


# ============================================================================
# Outfit ownership and outfit assignment
# ============================================================================


async def fetch_owned_outfit(db: Any, request: Any, user_id: Any) -> Any:
    """Read the id of the requested outfit if it belongs to the user (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("outfits")
        .select("id")
        .eq("id", str(request.outfit_id))
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def set_event_outfit(db: Any, event_id: str, request: Any, now: str) -> Any:
    """Set the outfit_id of one event to the requested outfit."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .update({"outfit_id": request.outfit_id, "updated_at": now})
        .eq("id", event_id)
        .execute
    )


async def clear_event_outfit(db: Any, event_id: str, user_id: Any, now: str) -> Any:
    """Clear the outfit_id of one event owned by the user."""
    return await asyncio.to_thread(
        db.table("calendar_events")
        .update({"outfit_id": None, "updated_at": now})
        .eq("id", event_id)
        .eq("user_id", user_id)
        .execute
    )
