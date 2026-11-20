"""
Item domain service: persistence for the wardrobe item routes.

Every PostgREST query and RPC used by app/api/v1/items.py lives here. The
route keeps the HTTP work: parameter parsing, control flow, the embedding,
storage, and vector side effects, error mapping, logging, and the response
envelope. Image URL materialization stays in the route because it needs
app.api.v1.images, which services must not import.

Each function returns the raw Supabase response the route reads. Each query
keeps the wrapper it had in the route (asyncio.to_thread or
execute_with_reconnect), so thread and retry behavior is unchanged.
"""

import asyncio
import json
from typing import Any, List

from app.utils.datetime_util import utcnow_iso
from app.utils.db import (
    escape_ilike_literal,
    execute_with_reconnect,
    jsonb_contains,
    safe_search_term,
)


def _now() -> str:
    return utcnow_iso()


# ============================================================================
# List, search, and browse
# ============================================================================


def _apply_filters(
    q: Any,
    *,
    category: Any,
    condition: Any,
    is_favorite: Any,
    brand: Any,
    color: Any,
    occasion_filter: Any,
    search: Any,
) -> Any:
    """Apply every optional filter to a base query builder."""
    if category:
        categories = [c.strip().lower() for c in category.split(",") if c.strip()]
        q = q.in_("category", categories) if len(categories) > 1 else q.eq("category", categories[0])
    if condition:
        condition_values = [c.strip().lower() for c in condition.split(",") if c.strip()]
        q = (
            q.in_("condition", condition_values)
            if len(condition_values) > 1
            else q.eq("condition", condition_values[0])
        )
    if is_favorite is not None:
        q = q.eq("is_favorite", is_favorite)
    if brand:
        q = q.ilike("brand", f"%{brand}%")
    if color:
        # JSONB array contains: jsonb_contains emits a JSON array
        # literal (["red"]) - plain contains(list) would send a
        # Postgres array literal ({red}) and PostgREST answers 22P02
        # "invalid input syntax for type jsonb" (2026-08-07 /items
        # 500 burst). A comma-joined value (multi-select) ORs the
        # containments so an item matching ANY chosen color shows
        # (A10b-12).
        colors = [c.strip().lower() for c in color.split(",") if c.strip()]
        if len(colors) > 1:
            q = q.or_(
                ",".join(f"colors.cs.{json.dumps([c])}" for c in colors)
            )
        elif colors:
            q = jsonb_contains(q, "colors", [colors[0]])
    if occasion_filter:
        q = jsonb_contains(q, "occasion_tags", [occasion_filter])
    if search:
        # escape_ilike_literal AFTER safe_search_term: a term's own
        # %/_ must match literally, not widen into wildcards (A2-19).
        like = f"%{escape_ilike_literal(safe_search_term(search))}%"
        q = q.or_(f"name.ilike.{like},brand.ilike.{like}")
    return q


async def list_and_count_items(
    d: Any,
    *,
    user_id: str,
    category: Any,
    condition: Any,
    is_favorite: Any,
    brand: Any,
    color: Any,
    occasion_filter: Any,
    search: Any,
    effective_sort_by: str,
    effective_sort_order: str,
    start: int,
    end: int,
) -> List[Any]:
    """Run the count and page reads for list_items concurrently against `d`."""
    # The two reads are independent; running them in parallel halves
    # the page-load latency (count is often the slower of the two on
    # large wardrobes).
    return await asyncio.gather(
        asyncio.to_thread(
            _apply_filters(
                d.table("items").select("id", count="exact").eq("user_id", user_id).eq("is_deleted", False),
                category=category,
                condition=condition,
                is_favorite=is_favorite,
                brand=brand,
                color=color,
                occasion_filter=occasion_filter,
                search=search,
            ).execute
        ),
        asyncio.to_thread(
            _apply_filters(
                d.table("items").select("*, item_images(*)").eq("user_id", user_id).eq("is_deleted", False),
                category=category,
                condition=condition,
                is_favorite=is_favorite,
                brand=brand,
                color=color,
                occasion_filter=occasion_filter,
                search=search,
            )
            .order(effective_sort_by, desc=(effective_sort_order == "desc"))
            .range(start, end)
            .execute
        ),
    )


async def search_items_by_term(db: Any, *, user_id: str, like: str, limit: int) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .or_(f"name.ilike.{like},brand.ilike.{like},notes.ilike.{like}")
        .limit(limit)
        .execute
    )


async def fetch_items_by_category(db: Any, *, user_id: str, cat: str) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("category", cat)
        .order("created_at", desc=True)
        .execute
    )


# ============================================================================
# Single item read, create-side lookups, update, delete
# ============================================================================


async def fetch_item_with_images(db: Any, *, item_id_str: str, user_id: str) -> Any:
    # maybe_single (not single): postgrest-py's single() RAISES APIError
    # (406/PGRST116) when the query matches zero rows, so the not-found
    # branch in the route was dead code and a deleted or not-owned item 500'd
    # instead of 404ing (observed 2026-08-09 on GET /items/{id}).
    return await execute_with_reconnect(
        lambda d: (
            d.table("items")
            .select("*, item_images(*)")
            .eq("id", item_id_str)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        ),
        db,
        extra={"operation": "get_item", "user_id": user_id, "item_id": item_id_str},
        max_retries=2,
    )


async def fetch_item_id_for_update(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await execute_with_reconnect(
        lambda d: (
            d.table("items")
            .select("id")
            .eq("id", item_id_str)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        ),
        db,
        extra={"operation": "update_item.exists", "user_id": user_id, "item_id": item_id_str},
    )


async def update_item_row(db: Any, *, item_id_str: str, user_id: str, update_dict: Any) -> Any:
    return await execute_with_reconnect(
        lambda d: (
            d.table("items")
            .update(update_dict)
            .eq("id", item_id_str)
            .eq("user_id", user_id)
            .execute()
        ),
        db,
        extra={"operation": "update_item.update", "user_id": user_id, "item_id": item_id_str},
    )


async def fetch_item_with_images_for_update(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("id", item_id_str)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def fetch_item_id_for_delete(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(db.table("items").select("id").eq("id", item_id_str).eq("user_id", user_id).maybe_single().execute)


async def delete_item_row(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(db.table("items").delete().eq("id", item_id_str).eq("user_id", user_id).execute)


async def fetch_item_favorite_state(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(db.table("items").select("is_favorite").eq("id", item_id_str).eq("user_id", user_id).maybe_single().execute)


async def set_item_favorite(db: Any, *, item_id_str: str, user_id: str, new_value: bool) -> Any:
    return await asyncio.to_thread(db.table("items").update({"is_favorite": new_value, "updated_at": _now()}).eq("id", item_id_str).eq("user_id", user_id).execute)


# ============================================================================
# Wear count
# ============================================================================


async def increment_item_worn_rpc(db: Any, *, item_id_str: str, user_id: str) -> Any:
    # Atomic increment via the service-role RPC (migration 044): the old
    # Python read-modify-write lost increments under concurrency (two
    # requests both read N and both wrote N+1). The RPC performs the +1
    # inside one UPDATE under the row lock and returns the updated row
    # (RETURNING *), so the response's count is the true post-increment
    # value with no second read.
    return await asyncio.to_thread(
        db.rpc(
            "increment_item_worn",
            {"item_uuid": item_id_str, "user_uuid": user_id},
        ).execute
    )


async def fetch_item_usage_worn(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("usage_times_worn")
        .eq("id", item_id_str)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def update_item_usage_worn(db: Any, *, item_id_str: str, user_id: str, update: Any) -> Any:
    return await asyncio.to_thread(db.table("items").update(update).eq("id", item_id_str).eq("user_id", user_id).execute)


# ============================================================================
# Item images
# ============================================================================


async def fetch_item_id_for_upload(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(db.table("items").select("id").eq("id", item_id_str).eq("user_id", user_id).maybe_single().execute)


async def insert_item_image_row(db: Any, *, img_row: Any) -> Any:
    return await asyncio.to_thread(db.table("item_images").insert(img_row).execute)


async def set_primary_item_image_rpc(db: Any, *, item_id_str: str, new_image_id: Any) -> Any:
    # set_primary_item_image (migration 044) flips every flag for the item
    # inside ONE statement/transaction: is_primary = (id = image_uuid).
    return await asyncio.to_thread(
        db.rpc(
            "set_primary_item_image",
            {"item_uuid": item_id_str, "image_uuid": new_image_id},
        ).execute
    )


async def clear_inserted_image_primary(db: Any, *, new_image_id: Any) -> Any:
    return await asyncio.to_thread(
        db.table("item_images")
        .update({"is_primary": False})
        .eq("id", new_image_id)
        .execute
    )


async def clear_other_primary_images(db: Any, *, item_id_str: str, new_image_id: Any) -> Any:
    return await asyncio.to_thread(db.table("item_images").update({"is_primary": False}).eq("item_id", item_id_str).neq("id", new_image_id).execute)


async def fetch_item_image_row(db: Any, *, image_id_str: str, item_id_str: str) -> Any:
    return await asyncio.to_thread(
        db.table("item_images")
        .select("id, storage_path")
        .eq("id", image_id_str)
        .eq("item_id", item_id_str)
        .maybe_single()
        .execute
    )


async def fetch_item_id_for_image_delete(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(db.table("items").select("id").eq("id", item_id_str).eq("user_id", user_id).maybe_single().execute)


async def delete_item_image_row(db: Any, *, image_id_str: str, item_id_str: str) -> Any:
    return await asyncio.to_thread(db.table("item_images").delete().eq("id", image_id_str).eq("item_id", item_id_str).execute)


# ============================================================================
# Bulk delete
# ============================================================================


async def delete_items_by_ids(db: Any, *, user_id: str, item_ids: List[str]) -> Any:
    return await asyncio.to_thread(db.table("items").delete().eq("user_id", user_id).in_("id", item_ids).execute)


# ============================================================================
# Stats
# ============================================================================


async def fetch_legacy_stats_rows(db: Any, *, user_id: str) -> Any:
    """Pre-migration-064 fallback read: up to 1000 active rows for the Python rollup."""
    return await asyncio.to_thread(
        db.table("items")
        .select("category,colors,condition,price")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .limit(1000)  # Limit to prevent fetching thousands of items
        .execute
    )


async def count_active_items(db: Any, *, user_id: str) -> Any:
    return await asyncio.to_thread(
        db.table("items").select("id", count="exact").eq("user_id", user_id).eq("is_deleted", False).execute
    )


async def fetch_most_worn_items(db: Any, *, user_id: str) -> Any:
    # nullslast: a NULL wear count must rank as "never worn"
    # (Postgres puts NULLs first under DESC by default).
    return await asyncio.to_thread(
        db.table("items")
        .select("id,name,usage_times_worn")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .order("usage_times_worn", desc=True, nullsfirst=False)
        .limit(5)
        .execute
    )


async def fetch_least_worn_items(db: Any, *, user_id: str) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("id,name,usage_times_worn")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .order("usage_times_worn", nullsfirst=False)
        .limit(5)
        .execute
    )


async def get_item_stats_aggregate_rpc(db: Any, *, user_id: str) -> Any:
    # Migration 064 aggregate: one GROUP BY instead of a 1000-row Python loop.
    return await asyncio.to_thread(
        db.rpc(
            "get_item_stats_aggregate",
            {"user_uuid": user_id},
        ).execute
    )


# ============================================================================
# Categorization
# ============================================================================


async def fetch_item_row_for_categorize(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("*")
        .eq("id", item_id_str)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def update_item_metadata(db: Any, *, item_id_str: str, user_id: str, update: Any) -> Any:
    return await asyncio.to_thread(db.table("items").update(update).eq("id", item_id_str).eq("user_id", user_id).execute)


async def fetch_item_id_for_categories(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(db.table("items").select("id").eq("id", item_id_str).eq("user_id", user_id).maybe_single().execute)


async def update_item_categories_row(db: Any, *, item_id_str: str, user_id: str, update: Any) -> Any:
    return await asyncio.to_thread(db.table("items").update(update).eq("id", item_id_str).eq("user_id", user_id).execute)


async def fetch_item_with_images_for_categories(db: Any, *, item_id_str: str, user_id: str) -> Any:
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("id", item_id_str)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


# ============================================================================
# Duplicate detection
# ============================================================================


async def count_wardrobe_items(db: Any, *, user_id: str) -> Any:
    # Empty wardrobe: no duplicates possible. Skip embedding + Pinecone
    # (observed 6–10s per check during first-time batch saves).
    return await asyncio.to_thread(
        db.table("items")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .limit(1)
        .execute
    )


async def fetch_duplicate_candidates(db: Any, *, item_ids: List[str], user_id: str) -> Any:
    # Fetch full item details for matches (read-only; rebuild + retry
    # once on a dead pooled connection - the 2026-08-03
    # /items/check-duplicates 500s happened during the same
    # gateway-restart window as the other ConnectionTerminated
    # bursts).
    return await execute_with_reconnect(
        lambda d: d.table("items")
        .select("*, item_images(*)")
        .in_("id", item_ids)
        .eq("user_id", user_id)
        .execute(),
        db,
        extra={"operation": "check_duplicates_items", "user_id": user_id},
    )


async def fetch_fallback_candidates(
    db: Any,
    *,
    user_id: str,
    request: Any,
    name_pattern: str,
    limit: int,
) -> Any:
    # Search by name similarity and same category. The name pattern is
    # escaped by the caller (escape_ilike_literal, A2-19).
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("category", request.category.lower())
        .ilike("name", name_pattern)
        .limit(limit)
        .execute
    )


async def fetch_active_source_item(db: Any, *, item_id_str: str, user_id: str) -> Any:
    # Fetch the source item. is_deleted filter: a soft-deleted item has no
    # detail surface anymore, so asking for its similar items is a 404 —
    # and its vector may still be live in the store, which must not leak
    # into other users' strips either (results query below).
    return await asyncio.to_thread(
        db.table("items")
        .select("*")
        .eq("id", item_id_str)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .maybe_single()
        .execute
    )


async def fetch_similar_item_rows(db: Any, *, similar_ids: List[str], user_id: str) -> Any:
    # Fetch full item details. is_deleted filter: the vector store can
    # lag a delete, so a soft-deleted row may still be returned by the
    # search — the DB read is the source of truth and drops it here.
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .in_("id", similar_ids)
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .execute
    )
