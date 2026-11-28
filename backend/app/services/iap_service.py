"""
IAP domain service: persistence for the in-app purchase and store webhook routes.

Every PostgREST query used by app/api/v1/iap.py lives here. The route module
keeps the HTTP work: request parsing, Apple and Google notification handling,
JWS verification calls, idempotency decisions, error mapping, logging, and
response shaping.

Each function returns the raw Supabase response the route reads, or runs the
query and returns it. The webhook ledger builders take the client as ``d``
because the route passes them to execute_with_reconnect. Each query keeps the
wrapper it had in the route, so thread and retry behavior are unchanged.
"""

import asyncio
from typing import Any

from app.utils.datetime_util import utcnow_iso


# ============================================================================
# Webhook ledger (apple_iap_events, google_rtdn_events)
# ============================================================================


def insert_webhook_event(
    d: Any, table: str, pk_column: str, pk_value: str, event_type: str, status: str
) -> Any:
    """Insert a new ledger row. Raises on a duplicate primary key."""
    return (
        d.table(table)
        .insert({
            pk_column: pk_value,
            "event_type": event_type,
            "status": status,
            "processing_started_at": utcnow_iso(),
            "attempts": 1,
        })
        .execute()
    )


def select_webhook_event(d: Any, table: str, pk_column: str, pk_value: str) -> Any:
    """Read the status, lease, and attempt count of one ledger row (0 or 1 rows)."""
    return (
        d.table(table)
        .select("status,processing_started_at,attempts")
        .eq(pk_column, pk_value)
        .maybe_single()
        .execute()
    )


def claim_webhook_event(
    d: Any,
    table: str,
    pk_column: str,
    pk_value: str,
    status: str,
    previous_started: Any,
    attempts: int,
) -> Any:
    """Compare-and-swap a ledger row to processing, keyed on its previous lease."""
    query = (
        d.table(table)
        .update({
            "status": status,
            "processing_started_at": utcnow_iso(),
            "attempts": attempts,
        })
        .eq(pk_column, pk_value)
    )
    if previous_started is not None:
        query = query.eq("processing_started_at", previous_started)
    else:
        query = query.is_("processing_started_at", "null")
    return query.execute()


def reclaim_webhook_event(
    d: Any,
    table: str,
    pk_column: str,
    pk_value: str,
    status: str,
    fresh_started: Any,
    fresh_attempts: int,
) -> Any:
    """Second CAS after a lost claim race, keyed on the re-read lease."""
    query = (
        d.table(table)
        .update({
            "status": status,
            "processing_started_at": utcnow_iso(),
            "attempts": fresh_attempts,
        })
        .eq(pk_column, pk_value)
    )
    if fresh_started is not None:
        query = query.eq("processing_started_at", fresh_started)
    else:
        query = query.is_("processing_started_at", "null")
    return query.execute()


async def mark_webhook_event_status(
    db: Any,
    table: str,
    pk_column: str,
    pk_value: str,
    status: str,
    processed_status: str,
    error: Any,
) -> Any:
    """Write the final status of a ledger row. ``processed_status`` is the value that stamps processed_at."""
    return await asyncio.to_thread(
        db.table(table)
        .update({
            "status": status,
            "processed_at": utcnow_iso() if status == processed_status else None,
            "last_error": error,
        })
        .eq(pk_column, pk_value)
        .execute
    )


# ============================================================================
# Purchase and webhook user lookups
# ============================================================================


async def fetch_user_by_id(db: Any, user_id: Any) -> Any:
    """Read the users row whose id matches (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("users")
        .select("id")
        .eq("id", user_id)
        .limit(1)
        .execute
    )


async def fetch_subscription_claimants(db: Any, column: str, identifier: str) -> Any:
    """Read up to two subscription rows that carry a store identifier, newest first."""
    return await asyncio.to_thread(
        db.table("subscriptions")
        .select("user_id,updated_at")
        .eq(column, identifier)
        .order("updated_at", desc=True)
        .limit(2)
        .execute
    )


async def fetch_other_claimant(db: Any, column: str, identifier: str, user_id: str) -> Any:
    """Read one subscription row that carries a store identifier and belongs to another user."""
    return await asyncio.to_thread(
        db.table("subscriptions")
        .select("user_id")
        .eq(column, identifier)
        .neq("user_id", user_id)
        .limit(1)
        .execute
    )
