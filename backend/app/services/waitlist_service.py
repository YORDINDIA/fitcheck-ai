"""
Waitlist queries (moved from app/api/v1/waitlist.py).

The Supabase chain that used to sit inline in the route now lives here.
The chain, table, wrapper, and order are unchanged. The route keeps the
payload build, empty-result check, logging, error mapping, and response
shaping.
"""

import asyncio
from typing import Any, Dict

from supabase import Client


async def insert_waitlist_row(db: Client, insert_data: Dict[str, Any]):
    """Insert one waitlist row and return the Supabase response."""
    return await asyncio.to_thread(db.table("waitlist").insert(insert_data).execute)
