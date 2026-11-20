"""
Shared outfit feedback queries (moved from app/api/v1/shared_outfits.py).

Each function holds one Supabase chain that used to sit inline in the route.
Chains, filters, wrappers, and their order are unchanged. The route keeps
auth, validation, ownership and expiry checks, logging, error mapping, and
response shaping.
"""

import asyncio
from typing import Any, Dict

from supabase import Client


async def fetch_shared_outfit_feedback_gate(db: Client, share_id_str: str):
    """Read id, allow_feedback, expires_at for a share before feedback is accepted."""
    return await asyncio.to_thread(
        db.table("shared_outfits")
        .select("id, allow_feedback, expires_at")
        .eq("id", share_id_str)
        .maybe_single()
        .execute
    )


async def insert_share_feedback_row(db: Client, insert: Dict[str, Any]):
    """Insert one share_feedback row and return the Supabase response."""
    return await asyncio.to_thread(db.table("share_feedback").insert(insert).execute)
