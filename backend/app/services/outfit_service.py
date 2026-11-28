"""
Outfit domain service: persistence for the outfit lifecycle.

Keeps routes thin per the repo rule "routes thin, logic in services"
(ARCHITECTURE.md / AGENTS.md). Every PostgREST query used by the outfits
API lives here. The route module only parses input, calls these functions,
maps errors, and shapes responses.

Delete orchestration: an ownership-scoped row delete plus best-effort cleanup
of the outfit's owned image storage paths. Storage failures are logged, never
fatal. The DB row is the source of truth and the delete is idempotent.
"""

import asyncio
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.core.concurrency import KeyedLock
from app.core.exceptions import CollectionNotFoundError, OutfitNotFoundError, ValidationError
from app.core.logging_config import get_context_logger
from app.models.outfit import GenerationStatus
from app.services.storage_service import StorageService
from app.utils.datetime_util import utcnow_iso
from app.utils.db import (
    execute_with_reconnect,
    is_pgrst202_missing_rpc,
    jsonb_contains,
    safe_search_term,
)

logger = get_context_logger(__name__)


# ============================================================================
# Shape helpers (pure dict transforms)
# ============================================================================


def normalize_item_images(item: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize Supabase nested relation naming to the API contract.

    Emits BOTH keys on nested outfit items: ``item_images`` (the key the
    Flutter ItemModel parses via @JsonKey(name: 'item_images')) and
    ``images`` (consumed by materialize_parent_images, which walks
    ``nested.get("images")`` to re-mint presigned URLs in place). Both keys
    reference the SAME list object, so the in-place URL materialization is
    visible under either name.
    """
    if not isinstance(item, dict):
        return item
    images = item.pop("item_images", None)
    if images is None:
        images = item.get("images")
    item["images"] = images or []
    item["item_images"] = item["images"]
    return item


def normalize_outfit_images(outfit: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize Supabase nested relation naming to API contract."""
    if not isinstance(outfit, dict):
        return outfit
    images = outfit.pop("outfit_images", None)
    if images is None:
        images = outfit.get("images")
    outfit["images"] = images or []
    return outfit


def is_unique_violation(error: Exception) -> bool:
    """True when a postgrest error reports a unique-constraint violation (23505)."""
    error_info = getattr(error, "json", lambda: {})() or {}
    code = error_info.get("code") or getattr(error, "code", None)
    if code == "23505":
        return True
    text = str(error).lower()
    return "duplicate key" in text or "unique constraint" in text


# ============================================================================
# Per-outfit write serialization (mark_worn)
#
# Migration 044 defines atomic RPCs for add/remove/toggle but no outfit
# wear-count variant. worn_count is a read-modify-write on the outfit row;
# two concurrent wear calls can both read N and write N+1. Serialize per
# outfit with an in-process lock. KeyedLock (A3b-05) bounds the registry.
# ============================================================================

_wear_locks = KeyedLock()


def _wear_lock(outfit_id: str):
    """Async context manager serializing wear writes per outfit (A3b-05)."""
    return _wear_locks(outfit_id)


# ============================================================================
# Ownership and single-row reads
# ============================================================================


async def fetch_owned_outfit_row(
    db: Any,
    *,
    outfit_id: str,
    user_id: str,
    columns: str,
    operation: Optional[str] = None,
) -> Any:
    """Return the maybe_single response for an outfit owned by ``user_id``.

    ``operation`` selects the reconnect-wrapped path (used where the route
    labels the lookup for logs); otherwise the plain worker-thread path runs.
    The caller checks ``.data``.
    """
    if operation is not None:
        return await execute_with_reconnect(
            lambda d: d.table("outfits")
            .select(columns)
            .eq("id", outfit_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute(),
            db,
            extra={"operation": operation, "outfit_id": outfit_id},
        )
    return await asyncio.to_thread(
        db.table("outfits")
        .select(columns)
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


async def fetch_outfit(
    db: Any,
    *,
    user_id: str,
    outfit_id: str,
    include_items: bool = False,
) -> Optional[Dict[str, Any]]:
    """Fetch an outfit with images, normalized for the API contract."""
    result = await execute_with_reconnect(
        lambda d: d.table("outfits")
        .select("*, outfit_images(*)")
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute(),
        db,
        extra={"operation": "fetch_outfit.lookup", "user_id": user_id},
    )
    if not result or not result.data:
        return None

    outfit = normalize_outfit_images(result.data)
    if include_items:
        item_ids = outfit.get("item_ids") or []
        if item_ids:
            # A3b-03: scope the batch by user_id too. An id-only items fetch
            # would return foreign rows (incl. storage paths) for corrupted
            # or legacy item_ids.
            items_res = await execute_with_reconnect(
                lambda d: d.table("items")
                .select("*, item_images(*)")
                .in_("id", item_ids)
                .eq("user_id", user_id)
                .execute(),
                db,
                extra={"operation": "fetch_outfit.items", "user_id": user_id},
            )
            for i in items_res.data or []:
                # Flutter ItemImage requires non-null `url`: synthesize it here
                # like the list path does.
                for img in i.get("item_images") or []:
                    img["url"] = img.get("image_url") or img.get("thumbnail_url") or ""
            outfit["items"] = [normalize_item_images(i) for i in (items_res.data or [])]
        else:
            outfit["items"] = []
    return outfit


async def fetch_owned_item_row(db: Any, *, item_id: str, user_id: str) -> Any:
    """Return the maybe_single response for an item owned by ``user_id``."""
    return await asyncio.to_thread(
        db.table("items").select("id").eq("id", item_id).eq("user_id", user_id).maybe_single().execute
    )


async def fetch_owned_item_ids(db: Any, *, user_id: str, item_ids: List[str]) -> List[str]:
    """Return the subset of ``item_ids`` that the user owns (worker thread)."""
    items_res = await asyncio.to_thread(
        db.table("items").select("id").eq("user_id", user_id).in_("id", item_ids).execute
    )
    return [row["id"] for row in (items_res.data or [])]


async def fetch_owned_item_ids_for_create(db: Any, *, user_id: str, item_ids: List[str]) -> List[Dict[str, Any]]:
    """Return owned item rows for outfit create (reconnect-wrapped)."""
    items_res = await execute_with_reconnect(
        lambda d: d.table("items").select("id").eq("user_id", user_id).in_("id", item_ids).execute(),
        db,
        extra={"operation": "create_outfit.verify_items", "user_id": user_id},
    )
    return items_res.data or []


async def fetch_owned_body_profile(db: Any, *, profile_id: str, user_id: str) -> Any:
    """Return the maybe_single response for a body profile owned by the user."""
    return await asyncio.to_thread(
        db.table("body_profiles")
        .select("id")
        .eq("id", profile_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


# ============================================================================
# Outfit writes and reads
# ============================================================================


async def insert_outfit_row(db: Any, *, insert: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
    """Upsert a new outfit row and return it (or None when nothing came back)."""
    res = await execute_with_reconnect(
        lambda d: d.table("outfits").upsert(insert, on_conflict="id").execute(),
        db,
        extra={"operation": "create_outfit.insert", "user_id": user_id},
    )
    return (res.data or [None])[0]


async def list_outfit_page(
    db: Any,
    *,
    user_id: str,
    page: int,
    page_size: int,
    effective_favorite: Optional[bool],
    effective_styles: List[str],
    effective_seasons: List[str],
    drafts_value: Optional[bool],
    tag_list: List[str],
    search: Optional[str],
) -> Tuple[List[Dict[str, Any]], int, Dict[str, Dict[str, Any]]]:
    """Return (outfits, total, items_map) for one page of the caller's outfits.

    The count, page, and item batch run in ONE reconnect-wrapped coroutine so
    a dead pooled connection replays the whole read through a fresh client.
    """

    def _apply_outfit_filters(q: Any) -> Any:
        if effective_favorite is not None:
            q = q.eq("is_favorite", effective_favorite)
        if effective_styles:
            q = q.in_("style", effective_styles)
        if effective_seasons:
            q = q.in_("season", effective_seasons)
        if drafts_value is not None:
            q = q.eq("is_draft", drafts_value)
        if tag_list:
            # jsonb_contains emits a JSON array literal; plain contains(list)
            # sends a Postgres array literal and PostgREST answers 22P02.
            q = jsonb_contains(q, "tags", tag_list)
        if search:
            like = f"%{safe_search_term(search)}%"
            q = q.or_(f"name.ilike.{like},description.ilike.{like}")
        return q

    start = (page - 1) * page_size
    end = start + page_size - 1

    def _build_list_query(d: Any, *, count_only: bool = False, page_range: bool = False) -> Any:
        if count_only:
            q = d.table("outfits").select("id", count="exact").eq("user_id", user_id)
        else:
            q = d.table("outfits").select("*, outfit_images(*)").eq("user_id", user_id)
        q = _apply_outfit_filters(q)
        if page_range:
            q = q.order("created_at", desc=True).range(start, end)
        return q

    async def _list_outfits_data(d: Any) -> Tuple[Any, int, Dict[str, Dict[str, Any]]]:
        # Count + page are independent reads; run them concurrently.
        count_res, res = await asyncio.gather(
            asyncio.to_thread(_build_list_query(d, count_only=True).execute),
            asyncio.to_thread(_build_list_query(d, page_range=True).execute),
        )
        total = getattr(count_res, "count", len(count_res.data or []))

        outfits = [normalize_outfit_images(o) for o in (res.data or [])]

        # Fetch all items for all outfits in a single batch query
        all_item_ids: List[str] = []
        for outfit in outfits:
            all_item_ids.extend(outfit.get("item_ids") or [])
        all_item_ids = list(set(all_item_ids))  # dedupe

        items_map: Dict[str, Dict[str, Any]] = {}
        if all_item_ids:
            # A3b-03: user-scope the batch fetch. See fetch_outfit.
            items_res = await asyncio.to_thread(
                d.table("items")
                .select("*, item_images(*)")
                .in_("id", all_item_ids)
                .eq("user_id", user_id)
                .execute
            )
            for item in items_res.data or []:
                # Transform item_images to have 'url' field for Flutter compatibility
                item_images = item.get("item_images") or []
                for img in item_images:
                    img["url"] = img.get("image_url") or img.get("thumbnail_url") or ""
                items_map[str(item["id"])] = normalize_item_images(item)

        return outfits, total, items_map

    return await execute_with_reconnect(
        lambda d: _list_outfits_data(d),
        db,
        extra={"operation": "list_outfits", "user_id": user_id},
    )


async def fetch_available_item_rows(
    db: Any,
    *,
    user_id: str,
    id_list: Optional[List[str]],
) -> List[Dict[str, Any]]:
    """Return picker rows for the caller's items (optionally a subset)."""

    def _build_available_items_query(d: Any) -> Any:
        q = (
            d.table("items")
            .select("id,name,category,colors,item_images(storage_path,image_url,thumbnail_url,is_primary)")
            .eq("user_id", user_id)
            .eq("is_deleted", False)
        )
        if id_list is not None:
            q = q.in_("id", id_list).order("created_at", desc=True)
        else:
            q = q.order("created_at", desc=True).limit(500)
        return q

    res = await execute_with_reconnect(
        lambda d: _build_available_items_query(d).execute(),
        db,
        extra={"operation": "available_items.select", "user_id": user_id},
    )
    return list(res.data or [])


async def fetch_latest_public_share(db: Any, *, outfit_id: str) -> Optional[Dict[str, Any]]:
    """Return the newest public share row for an outfit, or None."""
    share = await asyncio.to_thread(
        db.table("shared_outfits")
        .select("id, expires_at")
        .eq("outfit_id", outfit_id)
        .eq("visibility", "public")
        .order("created_at", desc=True)
        .limit(1)
        .execute
    )
    return (share.data or [None])[0]


async def fetch_public_outfit_row(db: Any, *, outfit_id: str) -> Optional[Dict[str, Any]]:
    """Return the public outfit row (is_public=true), or None."""
    result = await asyncio.to_thread(
        db.table("outfits")
        .select("id,name,description,style,season,occasion,tags,created_at,updated_at,item_ids,outfit_images(*)")
        .eq("id", outfit_id)
        .eq("is_public", True)
        .maybe_single()
        .execute
    )
    if not result or not result.data:
        return None
    return result.data


async def increment_shared_outfit_views(db: Any, *, share_id: str) -> None:
    """Atomic view increment via the service-role RPC (migration 044)."""
    await asyncio.to_thread(
        db.rpc("increment_shared_outfit_views", {"share_uuid": share_id}).execute
    )


async def fetch_item_summaries(db: Any, *, item_ids: List[str]) -> List[Dict[str, Any]]:
    """Return public-safe item summaries for a shared outfit."""
    items_res = await asyncio.to_thread(
        db.table("items")
        .select("id,name,category,colors,brand,item_images(storage_path,image_url,thumbnail_url,is_primary)")
        .in_("id", item_ids)
        .execute
    )
    return items_res.data or []


async def update_outfit_row(
    db: Any,
    *,
    outfit_id: str,
    user_id: str,
    update_dict: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """User-scoped outfit update. Returns the updated row or None."""
    result = await asyncio.to_thread(
        db.table("outfits").update(update_dict).eq("id", outfit_id).eq("user_id", user_id).execute
    )
    return (result.data or [None])[0]


async def upsert_shared_outfit_rpc(
    db: Any,
    *,
    outfit_id: str,
    user_id: str,
    visibility: str,
    expires_at: Optional[str],
    caption: Optional[str],
    allow_feedback: bool,
    share_url: str,
) -> Optional[Dict[str, Any]]:
    """Atomic share via the service-role RPC (migration 045)."""
    rpc_res = await asyncio.to_thread(
        db.rpc(
            "upsert_shared_outfit",
            {
                "outfit_uuid": outfit_id,
                "user_uuid": user_id,
                "p_visibility": visibility,
                "p_expires_at": expires_at,
                "p_caption": caption,
                "p_allow_feedback": allow_feedback,
                "p_share_url": share_url,
            },
        ).execute
    )
    return (rpc_res.data or [None])[0]


async def delete_outfit(db: Any, *, user_id: str, outfit_id: str) -> None:
    """Delete a user's outfit and best-effort remove its images from storage.

    Ownership is enforced by scoping every query to ``user_id`` (the caller
    uses a service-role client with RLS bypassed, so ``outfit_id`` alone must
    not be trusted). Raises ``OutfitNotFoundError`` when no owned row exists;
    the route maps it to 404.

    Storage paths are resolved BEFORE the row is deleted: deleting the row
    first leaks the objects forever (measured: 296 orphans / 192MB in the
    bucket). Path resolution and deletion are best-effort. A failure is
    logged with context and never fails the request.
    """
    outfit_id_str = str(outfit_id)
    existing = await execute_with_reconnect(
        lambda d: d.table("outfits")
        .select("id")
        .eq("id", outfit_id_str)
        .eq("user_id", user_id)
        .maybe_single()
        .execute(),
        db,
        extra={"operation": "delete_outfit.load", "outfit_id": outfit_id_str},
    )
    if not existing or not existing.data:
        raise OutfitNotFoundError(outfit_id=outfit_id_str)

    # Collect owned outfit-image storage paths (with _thumb siblings)
    # BEFORE the row is gone; deleting the row without this leaks the
    # objects forever (measured: 296 orphans / 192MB in the bucket).
    storage_paths: List[str] = []
    try:
        owned = await StorageService.resolve_owned_storage_paths(
            db, user_id, outfit_ids=[outfit_id_str]
        )
        storage_paths = owned["storage_paths"]
    except Exception as e:
        logger.warning(
            "Failed to resolve storage paths for outfit delete",
            outfit_id=outfit_id_str,
            error=str(e),
        )

    # Idempotent delete: a retry after a lost response is a no-op, so a
    # dead pooled Supabase connection is healed by one rebuild + retry
    # instead of surfacing a 500 (observed 2026-08-07: DELETE /outfits
    # failed with DATABASE_ERROR in a gateway-blip window; the library
    # only retries GET/HEAD, never DELETE).
    await execute_with_reconnect(
        lambda d: d.table("outfits")
        .delete()
        .eq("id", outfit_id_str)
        .eq("user_id", user_id)
        .execute(),
        db,
        extra={"operation": "delete_outfit.delete", "outfit_id": outfit_id_str},
    )

    if storage_paths:
        try:
            await StorageService.delete_multiple_images(db=db, storage_paths=storage_paths)
        except Exception as e:
            logger.warning(
                "Failed to delete outfit images from storage",
                outfit_id=outfit_id_str,
                object_count=len(storage_paths),
                error=str(e),
            )


async def delete_outfits_by_ids(db: Any, *, user_id: str, outfit_ids: List[str]) -> List[Dict[str, Any]]:
    """Delete the caller's outfits by id. Returns the deleted rows."""
    delete_res = await asyncio.to_thread(
        db.table("outfits").delete().eq("user_id", user_id).in_("id", outfit_ids).execute
    )
    return delete_res.data or []


async def toggle_outfit_favorite_rpc(db: Any, *, outfit_id: str, user_id: str) -> None:
    """Atomic favorite flip via the service-role RPC (migration 044)."""
    await asyncio.to_thread(
        db.rpc(
            "toggle_outfit_favorite",
            {"outfit_uuid": outfit_id, "user_uuid": user_id},
        ).execute
    )


async def record_outfit_wear(db: Any, *, user_id: str, outfit_id: str) -> Dict[str, Any]:
    """Increment worn_count, stamp last_worn_at, and log wear history.

    Serialized per outfit by ``_wear_lock``. Raises ``OutfitNotFoundError``
    when the outfit is missing or not owned. Wear-history insert failures
    are logged and never fail the call.
    """
    async with _wear_lock(outfit_id):
        existing = await fetch_owned_outfit_row(
            db, outfit_id=outfit_id, user_id=user_id, columns="worn_count"
        )
        if not existing or not existing.data:
            raise OutfitNotFoundError(outfit_id=outfit_id)

        current = int(existing.data.get("worn_count") or 0)
        now = utcnow_iso()

        # A3b-06: the write is user-scoped. The ownership read and this
        # statement are separate, so a row deleted in between would
        # otherwise let the response fabricate a wear count.
        update_res = await asyncio.to_thread(
            db.table("outfits")
            .update({"worn_count": current + 1, "last_worn_at": now, "updated_at": now})
            .eq("id", outfit_id)
            .eq("user_id", user_id)
            .execute
        )
        if not update_res.data:
            raise OutfitNotFoundError(outfit_id=outfit_id)

        wear_record = {
            "id": str(uuid.uuid4()),
            "outfit_id": outfit_id,
            "user_id": user_id,
            "worn_at": now,
            "created_at": now,
        }
        try:
            await asyncio.to_thread(db.table("outfit_wear_history").insert(wear_record).execute)
        except Exception as hist_err:
            # Log but don't fail if wear history table doesn't exist yet
            logger.warning("Could not insert wear history record", outfit_id=outfit_id, error=str(hist_err))

    return {"worn_count": current + 1, "last_worn_at": now}


async def list_wear_history(db: Any, *, outfit_id: str) -> List[Dict[str, Any]]:
    """Return up to 100 wear-history rows, newest first. Empty on query failure."""
    try:
        history = await asyncio.to_thread(
            db.table("outfit_wear_history")
            .select("*")
            .eq("outfit_id", outfit_id)
            .order("worn_at", desc=True)
            .limit(100)
            .execute
        )
        return history.data or []
    except Exception as e:
        # Table might not exist yet
        logger.warning("Failed to fetch wear history", outfit_id=outfit_id, error=str(e))
        return []


async def insert_outfit_copy(db: Any, *, source: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
    """Insert a draft copy of ``source`` owned by ``user_id``. Returns the new row."""
    now = utcnow_iso()
    insert = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": f"Copy of {source.get('name') or 'Outfit'}",
        "description": source.get("description"),
        "item_ids": source.get("item_ids") or [],
        "style": source.get("style"),
        "season": source.get("season"),
        "occasion": source.get("occasion"),
        "tags": source.get("tags") or [],
        "is_favorite": False,
        "is_draft": True,
        "is_public": False,
        "worn_count": 0,
        "last_worn_at": None,
        "created_at": now,
        "updated_at": now,
    }
    res = await asyncio.to_thread(db.table("outfits").insert(insert).execute)
    return (res.data or [None])[0]


async def add_outfit_item_rpc(db: Any, *, outfit_id: str, item_id: str, user_id: str) -> None:
    """Atomic append via the service-role RPC (migration 044)."""
    await asyncio.to_thread(
        db.rpc(
            "add_outfit_item",
            {"outfit_uuid": outfit_id, "item_uuid": item_id, "user_uuid": user_id},
        ).execute
    )


async def remove_outfit_item_rpc(db: Any, *, outfit_id: str, item_id: str, user_id: str) -> Any:
    """Atomic removal via the service-role RPC (migration 044).

    Returns the integer status: 0 = missing/unowned, 1 = removed, 2 = would
    leave the outfit empty. remove_outfit_item RETURNS INTEGER (scalar);
    PostgREST delivers it as a bare value in ``data``. The legacy list shape
    some test doubles emit is tolerated.
    """
    remove_result = await asyncio.to_thread(
        db.rpc(
            "remove_outfit_item",
            {"outfit_uuid": outfit_id, "item_uuid": item_id, "user_uuid": user_id},
        ).execute
    )
    remove_status = getattr(remove_result, "data", None)
    if isinstance(remove_status, (list, tuple)):
        remove_status = remove_status[0] if remove_status else None
    return remove_status


# ============================================================================
# Collections
# ============================================================================


def collection_counts(db: Any, collection_ids: List[str]) -> Dict[str, int]:
    """Member counts keyed by collection id (sync; run in a worker thread)."""
    if not collection_ids:
        return {}
    res = (
        db.table("outfit_collection_items")
        .select("collection_id")
        .in_("collection_id", collection_ids)
        .execute()
    )
    counts: Dict[str, int] = {}
    for row in res.data or []:
        cid = str(row.get("collection_id") or "")
        if cid:
            counts[cid] = counts.get(cid, 0) + 1
    return counts


async def assert_owned_collection(db: Any, *, collection_id: str, user_id: str) -> None:
    """Raise ``CollectionNotFoundError`` unless the caller owns the collection."""
    existing = await asyncio.to_thread(
        db.table("outfit_collections")
        .select("id")
        .eq("id", collection_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )
    if not existing or not existing.data:
        raise CollectionNotFoundError(collection_id=collection_id)


async def collection_member_ids(db: Any, *, collection_id: str) -> List[str]:
    """Ordered outfit_ids currently in a collection."""
    member_res = await asyncio.to_thread(
        db.table("outfit_collection_items")
        .select("outfit_id")
        .eq("collection_id", collection_id)
        .execute
    )
    return [
        str(member.get("outfit_id"))
        for member in (member_res.data or [])
        if member.get("outfit_id")
    ]


async def collection_count(db: Any, *, collection_id: str) -> int:
    """Member count for a single collection."""
    counts = await asyncio.to_thread(collection_counts, db, [collection_id])
    return counts.get(collection_id, 0)


async def fetch_collection_row(db: Any, *, collection_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Return the caller's collection row, or None."""
    row_res = await asyncio.to_thread(
        db.table("outfit_collections")
        .select("*")
        .eq("id", collection_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )
    return row_res.data if row_res else None


async def insert_collection_row(db: Any, *, insert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Insert a collection row and return it, or None."""
    res = await asyncio.to_thread(db.table("outfit_collections").insert(insert).execute)
    return (res.data or [None])[0]


async def list_collection_rows(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    """Return the caller's collections, newest first."""
    res = await asyncio.to_thread(
        db.table("outfit_collections")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute
    )
    return res.data or []


async def fetch_collection_member_rows(db: Any, *, collection_ids: List[str]) -> List[Dict[str, Any]]:
    """Return (collection_id, outfit_id) member rows for the given collections."""
    member_res = await asyncio.to_thread(
        db.table("outfit_collection_items")
        .select("collection_id, outfit_id")
        .in_("collection_id", collection_ids)
        .execute
    )
    return member_res.data or []


async def update_collection_row(db: Any, *, collection_id: str, update_dict: Dict[str, Any]) -> None:
    """Apply a partial update to a collection row (ownership checked by caller)."""
    await asyncio.to_thread(
        db.table("outfit_collections").update(update_dict).eq("id", collection_id).execute
    )


async def delete_collection_row(db: Any, *, collection_id: str, user_id: str) -> None:
    """Delete the caller's collection row."""
    await asyncio.to_thread(
        db.table("outfit_collections").delete().eq("id", collection_id).eq("user_id", user_id).execute
    )


async def fetch_collection_membership(db: Any, *, collection_id: str, outfit_id: str) -> Any:
    """Return the maybe_single membership response for one outfit in a collection."""
    return await asyncio.to_thread(
        db.table("outfit_collection_items")
        .select("outfit_id")
        .eq("collection_id", collection_id)
        .eq("outfit_id", outfit_id)
        .maybe_single()
        .execute
    )


async def add_collection_membership(db: Any, *, collection_id: str, outfit_id: str) -> None:
    """Idempotent membership add (upsert on the junction PK)."""
    await asyncio.to_thread(
        db.table("outfit_collection_items")
        .upsert(
            {"collection_id": collection_id, "outfit_id": outfit_id},
            on_conflict="collection_id,outfit_id",
        )
        .execute
    )


async def delete_collection_membership(db: Any, *, collection_id: str, outfit_id: str) -> None:
    """Remove one outfit from a collection."""
    await asyncio.to_thread(
        db.table("outfit_collection_items")
        .delete()
        .eq("collection_id", collection_id)
        .eq("outfit_id", outfit_id)
        .execute
    )


async def sync_collection_items(
    db: Any,
    *,
    user_id: str,
    collection_id: str,
    outfit_ids: List[str],
) -> None:
    """Replace a collection's membership with ``outfit_ids``.

    Inserts the new membership first, then deletes the rows no longer wanted.
    A failed delete restores the collection to its previous membership
    (best-effort, see A3-11).
    """
    # Validate outfits belong to the user
    if outfit_ids:
        res = await asyncio.to_thread(
            db.table("outfits")
            .select("id")
            .eq("user_id", user_id)
            .in_("id", outfit_ids)
            .execute
        )
        found = {str(row["id"]) for row in (res.data or [])}
        missing = [oid for oid in outfit_ids if oid not in found]
        if missing:
            raise ValidationError(
                "One or more outfits not found",
                details={"missing_outfit_ids": missing}
            )

    # Replace items WITHOUT a delete-then-insert window: the old order emptied
    # the collection first, so a failed insert left a valid collection
    # permanently empty.
    current_res = await asyncio.to_thread(
        db.table("outfit_collection_items")
        .select("outfit_id")
        .eq("collection_id", collection_id)
        .execute
    )
    current_ids = {
        str(r["outfit_id"]) for r in (current_res.data or []) if r.get("outfit_id")
    }
    target_ids = set(outfit_ids)
    to_add = [oid for oid in outfit_ids if oid not in current_ids]
    to_remove = [oid for oid in current_ids if oid not in target_ids]

    if to_add:
        rows = [{"collection_id": collection_id, "outfit_id": oid} for oid in to_add]
        # Upsert (not insert): a concurrent add/retry can pass the read above
        # and collide on the junction PK. A failed insert leaves the old
        # membership intact, so there is nothing to restore.
        await asyncio.to_thread(
            db.table("outfit_collection_items")
            .upsert(rows, on_conflict="collection_id,outfit_id")
            .execute
        )
    if to_remove:
        try:
            await asyncio.to_thread(
                db.table("outfit_collection_items")
                .delete()
                .eq("collection_id", collection_id)
                .in_("outfit_id", sorted(to_remove))
                .execute
            )
        except Exception:
            # The delete failed after the insert succeeded: restore the
            # pre-sync membership so the collection is never left half-applied.
            if to_add:
                logger.warning(
                    "Restoring collection membership after failed sync delete",
                    collection_id=collection_id,
                    user_id=user_id,
                )
                try:
                    await asyncio.to_thread(
                        db.table("outfit_collection_items")
                        .upsert(
                            [{"collection_id": collection_id, "outfit_id": oid} for oid in to_add],
                            on_conflict="collection_id,outfit_id",
                        )
                        .execute
                    )
                except Exception as restore_error:
                    logger.error(
                        "Failed to restore collection membership after sync failure",
                        collection_id=collection_id,
                        error=str(restore_error),
                    )
            raise


# ============================================================================
# Generations
# ============================================================================


async def insert_generation_row(db: Any, *, insert: Dict[str, Any]) -> None:
    """Insert a generation tracking row."""
    await asyncio.to_thread(db.table("outfit_generations").insert(insert).execute)


async def fetch_generation_row(db: Any, *, generation_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Return the caller's generation row, or None."""
    result = await asyncio.to_thread(
        db.table("outfit_generations")
        .select("*")
        .eq("id", generation_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )
    if not result or not result.data:
        return None
    return result.data


async def mark_generation_completed(
    db: Any,
    *,
    generation_id: str,
    user_id: str,
    outfit_id: str,
    image_url: str,
    completed_at: str,
) -> None:
    """Mark a generation complete. Scoped by id, user, and outfit."""
    await asyncio.to_thread(db.table("outfit_generations").update(
        {
            "status": GenerationStatus.COMPLETED.value,
            "progress": 100,
            "image_urls": [image_url],
            "completed_at": completed_at,
        }
    ).eq("id", generation_id).eq("user_id", user_id).eq("outfit_id", outfit_id).execute)


# ============================================================================
# Outfit images
# ============================================================================


async def find_outfit_image_by_client_request_id(
    db: Any, outfit_id: str, client_request_id: str
) -> Optional[Dict[str, Any]]:
    """Fetch the outfit image created with an idempotency key (F1-07).

    ``None`` when no replay target exists. The upload proceeds normally.
    """
    result = await execute_with_reconnect(
        lambda d: (
            d.table("outfit_images")
            .select("*")
            .eq("outfit_id", outfit_id)
            .eq("client_request_id", client_request_id)
            .maybe_single()
            .execute()
        ),
        db,
        extra={"operation": "upload_outfit_image.replay_lookup", "outfit_id": outfit_id},
        max_retries=1,
    )
    if not result or not result.data:
        return None
    return result.data


async def fetch_outfit_image_by_id(db: Any, *, image_id: str, outfit_id: str) -> Optional[Dict[str, Any]]:
    """Return an outfit image by id within an outfit, or None."""
    winner_result = await asyncio.to_thread(
        db.table("outfit_images")
        .select("*")
        .eq("id", image_id)
        .eq("outfit_id", outfit_id)
        .maybe_single()
        .execute
    )
    return getattr(winner_result, "data", None)


async def save_outfit_image(
    db: Any,
    *,
    outfit_id: str,
    user_id: str,
    img_row: Dict[str, Any],
    is_primary: bool,
    client_request_id: Optional[str],
) -> Tuple[Dict[str, Any], bool]:
    """Persist an outfit image row and its primary flag.

    Returns ``(result_row, collapsed)``. ``collapsed`` is True when a
    concurrent same-key upload won the race and the winner row is returned.
    The caller then skips the generation-complete update.

    A4-17: the insert and the primary reassignment commit as ONE transaction
    (``add_outfit_image_and_set_primary``, migration 045). The two-step
    insert-then-clear survives only as the fallback for the migration gap
    (RPC missing -> PGRST202).
    """
    try:
        rpc_params = {
            "p_outfit_uuid": outfit_id,
            "p_user_uuid": user_id,
            "p_image_id": img_row["id"],
            "p_image_url": img_row["image_url"],
            "p_thumbnail_url": img_row.get("thumbnail_url"),
            "p_storage_path": img_row.get("storage_path"),
            "p_pose": img_row["pose"],
            "p_lighting": img_row.get("lighting"),
            "p_body_profile_id": img_row.get("body_profile_id"),
            "p_generation_type": img_row.get("generation_type") or "ai",
            "p_is_primary": bool(is_primary),
            "p_width": img_row.get("width"),
            "p_height": img_row.get("height"),
            "p_generation_metadata": img_row.get("generation_metadata"),
            "p_client_request_id": img_row.get("client_request_id"),
            "p_created_at": img_row["created_at"],
        }
        # Build the RPC inside the worker thread so a same-key race actually
        # contends on the fake/real mutation, not on the event-loop thread.
        rpc_result = await asyncio.to_thread(
            lambda: db.rpc(
                "add_outfit_image_and_set_primary",
                rpc_params,
            ).execute()
        )
    except Exception as e:
        if not is_pgrst202_missing_rpc(e):
            raise
        logger.warning(
            "add_outfit_image_and_set_primary RPC missing (migration 045 "
            "not applied); falling back to two-step insert + primary clear",
            outfit_id=outfit_id,
        )
        # Two concurrent uploads with the SAME client_request_id both missed
        # the replay lookup and raced to insert; the loser hits the unique
        # index (23505). Replay the winner's row rather than a 500 (F1-07).
        try:
            insert_result = await asyncio.to_thread(db.table("outfit_images").insert(img_row).execute)
        except Exception as insert_err:
            if client_request_id and is_unique_violation(insert_err):
                winner = await find_outfit_image_by_client_request_id(
                    db, outfit_id, client_request_id
                )
                if winner:
                    logger.info(
                        "Upload outfit image race collapsed onto client_request_id winner",
                        user_id=user_id,
                        outfit_id=outfit_id,
                        image_id=winner["id"],
                    )
                    return winner, True
            raise
        new_image_id = insert_result.data[0]["id"] if insert_result.data else None

        if is_primary and new_image_id:
            try:
                await asyncio.to_thread(
                    db.rpc(
                        "set_primary_outfit_image",
                        {"outfit_uuid": outfit_id, "image_uuid": new_image_id},
                    ).execute
                )
            except Exception as primary_err:
                if not is_pgrst202_missing_rpc(primary_err):
                    raise
                # Clear is_primary on all OTHER images for this outfit
                await asyncio.to_thread(
                    db.table("outfit_images")
                    .update({"is_primary": False})
                    .eq("outfit_id", outfit_id)
                    .neq("id", new_image_id)
                    .execute
                )
    else:
        # add_outfit_image_and_set_primary RETURNS UUID (scalar): PostgREST
        # delivers it as a bare value in `data`. Tolerate the legacy list
        # shape some test doubles emit.
        rpc_value = getattr(rpc_result, "data", None)
        if isinstance(rpc_value, (list, tuple)):
            new_image_id = rpc_value[0] if rpc_value else img_row["id"]
        else:
            new_image_id = rpc_value or img_row["id"]

    # The RPC resolves a client_request_id replay to the WINNER row and
    # returns its id, but the locally-built img_row is the LOSER's. If they
    # differ, re-fetch the winner (F1-07).
    result_row = img_row
    if new_image_id and new_image_id != img_row["id"]:
        winner_row = await fetch_outfit_image_by_id(
            db, image_id=new_image_id, outfit_id=outfit_id
        )
        if winner_row:
            result_row = winner_row
            logger.info(
                "Upload outfit image returned RPC winner row",
                user_id=user_id,
                outfit_id=outfit_id,
                winner_image_id=new_image_id,
                loser_image_id=img_row["id"],
            )
    return result_row, False


async def fetch_outfit_image_for_delete(db: Any, *, outfit_id: str, image_id: str) -> Any:
    """Return the image response (id, storage_path) for a delete, reconnect-wrapped."""
    return await execute_with_reconnect(
        lambda d: d.table("outfit_images")
        .select("id, storage_path")
        .eq("id", image_id)
        .eq("outfit_id", outfit_id)
        .maybe_single()
        .execute(),
        db,
        extra={"operation": "delete_outfit_image.load_image", "outfit_id": outfit_id, "image_id": image_id},
    )


async def delete_outfit_image_row(db: Any, *, outfit_id: str, image_id: str) -> None:
    """Idempotent image row delete (reconnect-wrapped)."""
    await execute_with_reconnect(
        lambda d: d.table("outfit_images")
        .delete()
        .eq("id", image_id)
        .eq("outfit_id", outfit_id)
        .execute(),
        db,
        extra={"operation": "delete_outfit_image.delete", "outfit_id": outfit_id, "image_id": image_id},
    )


# ============================================================================
# Reads for stats, shelves, and suggestions
# ============================================================================


async def list_outfit_stat_rows(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    """Return the minimal outfit columns used by the stats endpoint."""
    res = await asyncio.to_thread(
        db.table("outfits")
        .select("id,name,style,season,worn_count,created_at")
        .eq("user_id", user_id)
        .execute
    )
    return res.data or []


async def list_recently_worn_outfit_rows(db: Any, *, user_id: str, limit: int) -> List[Dict[str, Any]]:
    """Return outfits with a last_worn_at, most recent first."""
    res = await asyncio.to_thread(
        db.table("outfits")
        .select("*, outfit_images(*)")
        .eq("user_id", user_id)
        .not_.is_("last_worn_at", "null")
        .order("last_worn_at", desc=True)
        .limit(limit)
        .execute
    )
    return res.data or []


async def list_favorite_outfit_rows(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    """Return the caller's favorite outfits (max 100), most recently updated first."""
    res = await asyncio.to_thread(
        db.table("outfits")
        .select("*, outfit_images(*)")
        .eq("user_id", user_id)
        .eq("is_favorite", True)
        .order("updated_at", desc=True)
        .limit(100)
        .execute
    )
    return res.data or []


async def list_recent_outfit_rows(db: Any, *, user_id: str, limit: int) -> List[Dict[str, Any]]:
    """Return the caller's most recently updated outfits (for weather suggestions)."""
    res = await asyncio.to_thread(
        db.table("outfits")
        .select("*, outfit_images(*)")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .limit(limit)
        .execute
    )
    return res.data or []
