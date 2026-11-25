"""
User domain service: persistence for the user profile lifecycle.

Keeps routes thin per the repo rule "routes thin, logic in services"
(ARCHITECTURE.md / AGENTS.md). Every PostgREST query used by the users API
(app/api/v1/users.py) lives here. The route module parses input, applies the
per-user lock, maps errors, materializes image URLs, and shapes responses.

Functions return raw rows or the Supabase response value the route reads.
Presigned URLs, storage cleanup, and the response envelope stay in the route.
"""

import asyncio
import uuid
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError as PydanticValidationError

from app.core.exceptions import BodyProfileNotFoundError, DatabaseError, ValidationError
from app.core.logging_config import get_context_logger
from app.models.user import BodyProfileCreate
from app.utils import maybe_single_data
from app.utils.datetime_util import utcnow_iso
from app.utils.db import execute_with_reconnect, run_sync_with_reconnect

logger = get_context_logger(__name__)


def _first_row(result_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Extract first row from query result."""
    return (result_data or [None])[0] if result_data else None


# ============================================================================
# Generic record helpers (preferences, settings)
# ============================================================================


def get_or_create_record(
    db: Any,
    table: str,
    user_id: str,
    defaults: Dict[str, Any],
    model_class: Any,
) -> Tuple[Dict[str, Any], bool]:
    """
    Get existing record or create with defaults.
    Returns (record_data, was_created).
    """
    # Read side rebuilds + retries once on a dead pooled Supabase connection
    # (ConnectionTerminated 500s on GET /users/settings 2026-08-03). The
    # insert goes through the same wrapper: `user_id` is the PK (migration
    # 001), so the upsert is exact-once — a lost response after a committed
    # insert collapses onto the existing row instead of duplicating or 500ing
    # on the stale dead client.
    result = run_sync_with_reconnect(
        lambda d: d.table(table).select("*").eq("user_id", user_id).execute(),
        db,
        extra={"operation": f"get_or_create_{table}", "user_id": user_id},
    )
    if result.data:
        return model_class.model_validate(result.data[0]).model_dump(mode="json"), False

    insert_defaults = {**defaults, "user_id": user_id}
    run_sync_with_reconnect(
        lambda d: d.table(table)
        .upsert(insert_defaults, on_conflict="user_id", ignore_duplicates=True)
        .execute(),
        db,
        extra={"operation": f"create_{table}", "user_id": user_id},
    )
    # Re-read so the returned row reflects the actual stored record (a
    # concurrent create could have won the upsert with different values).
    result = run_sync_with_reconnect(
        lambda d: d.table(table).select("*").eq("user_id", user_id).execute(),
        db,
        extra={"operation": f"get_or_create_{table}_reload", "user_id": user_id},
    )
    row = _first_row(result.data or [])
    if not row:
        raise DatabaseError(f"Failed to create {table}")
    return model_class.model_validate(row).model_dump(mode="json"), True


def upsert_record(
    db: Any,
    table: str,
    user_id: str,
    update_data: Any,
    model_class: Any,
    defaults: Optional[Dict[str, Any]] = None,
    *,
    updated_field: Optional[str] = "updated_at",
    created_field: Optional[str] = "created_at",
) -> Dict[str, Any]:
    """
    Upsert a record for user: update if exists, insert if not.
    Returns validated record data.
    """
    update_dict = update_data.model_dump(exclude_unset=True)
    if updated_field:
        update_dict[updated_field] = utcnow_iso()

    existing = run_sync_with_reconnect(
        lambda d: d.table(table).select("user_id").eq("user_id", user_id).execute(),
        db,
        extra={"operation": f"upsert_{table}_lookup", "user_id": user_id},
    )

    if existing.data:
        result = run_sync_with_reconnect(
            lambda d: d.table(table).update(update_dict).eq("user_id", user_id).execute(),
            db,
            extra={"operation": f"upsert_{table}_update", "user_id": user_id},
        )
    else:
        insert = {
            "user_id": user_id,
            **(defaults or {}),
            **update_dict,
        }
        if created_field:
            insert[created_field] = utcnow_iso()
        if updated_field:
            insert[updated_field] = utcnow_iso()
        # Same reconnect treatment as the update branch: the insert is an
        # upsert on the user_id PK, so a retry after a lost response
        # collapses onto the existing row (exact-once) instead of running on
        # the stale dead client.
        result = run_sync_with_reconnect(
            lambda d: d.table(table)
            .upsert(insert, on_conflict="user_id")
            .execute(),
            db,
            extra={"operation": f"upsert_{table}_insert", "user_id": user_id},
        )

    row = _first_row(result.data or [])
    if not row:
        raise DatabaseError(f"Failed to update {table}")
    return model_class.model_validate(row).model_dump(mode="json")


# ============================================================================
# Profile
# ============================================================================


async def fetch_user_row(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    result = await execute_with_reconnect(
        lambda d: d.table("users").select("*").eq("id", user_id).execute(),
        db,
        extra={"operation": "get_current_user", "user_id": user_id},
        max_retries=2,
    )
    return result.data or []


async def update_user_row(db: Any, *, user_id: str, update_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    result = await asyncio.to_thread(db.table("users").update(update_payload).eq("id", user_id).execute)
    return result.data or []


# ============================================================================
# Account deletion
# ============================================================================


async def list_support_ticket_attachments(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    # Feedback/service-ticket attachments are tracked by their durable
    # bucket keys (support_tickets.attachment_storage_paths) so their
    # objects are not orphaned on account deletion. attachment_urls holds
    # only short-lived presigned URLs and must not be used as the durable
    # reference. Read-only; routed through execute_with_reconnect so a
    # dead pooled connection (observed 2026-08-04: "Failed to delete
    # account" 500s) heals instead of failing the whole deletion.
    tickets_result = await execute_with_reconnect(
        lambda d: d.table("support_tickets")
        .select("attachment_storage_paths")
        .eq("user_id", user_id)
        .execute(),
        db,
        extra={"operation": "delete_account.tickets", "user_id": user_id},
    )
    return tickets_result.data or []


async def fetch_avatar_row(db: Any, *, user_id: str) -> Optional[Dict[str, Any]]:
    # The avatar is referenced only by URL on the user row; the route resolves
    # it to its storage object so deletion does not orphan it in Storage.
    avatar_result = await execute_with_reconnect(
        lambda d: d.table("users")
        .select("avatar_url")
        .eq("id", user_id)
        .maybe_single()
        .execute(),
        db,
        extra={"operation": "delete_account.avatar", "user_id": user_id},
    )
    return maybe_single_data(avatar_result)


async def anonymize_support_tickets(db: Any, *, user_id: str) -> None:
    # ANONYMIZE, do not delete. support_tickets.user_id is ON DELETE SET
    # NULL because 009_support_tickets supports anonymous tickets, and the
    # table also holds in-app CONTENT REPORTS about other users plus open
    # support/billing threads. Hard-deleting the requester's rows destroys
    # the only record of a third party's violation (the reported user is
    # never actioned and the content stays up) and any unresolved dispute
    # support still needs.
    #
    # Erasure applies to the requester's personal data, not to the ticket
    # itself: clearing user_id and contact_email severs every link back to
    # them while the body/category/status survive for moderation. Their
    # attachment objects were already deleted by the route.
    await execute_with_reconnect(
        lambda d: d.table("support_tickets")
        .update({"user_id": None, "contact_email": None})
        .eq("user_id", user_id)
        .execute(),
        db,
        extra={"operation": "delete_account.support_tickets", "user_id": user_id},
    )


async def delete_user_row(db: Any, *, user_id: str) -> None:
    # The user-row delete is idempotent (a replayed delete is a no-op), so
    # it is safe through the reconnect retry: a dead pooled connection
    # mid-delete rebuilds the client and completes (2026-08-04 RCA).
    await execute_with_reconnect(
        lambda d: d.table("users").delete().eq("id", user_id).execute(),
        db,
        extra={"operation": "delete_account.user_row", "user_id": user_id},
    )


def has_items_select(db: Any) -> bool:
    """True when the items builder exposes select(). Real clients always do."""
    return hasattr(db.table("items"), "select")


# ============================================================================
# Data export
# ============================================================================


async def fetch_user_row_for_export(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    result = await execute_with_reconnect(
        lambda d: d.table("users").select("*").eq("id", user_id).execute(),
        db,
        extra={"operation": "export_user_data.user", "user_id": user_id},
        max_retries=2,
    )
    return result.data or []


async def list_user_rows(db: Any, *, table: str, user_id: str) -> List[Dict[str, Any]]:
    result = await execute_with_reconnect(
        lambda d: d.table(table).select("*").eq("user_id", user_id).execute(),
        db,
        extra={"operation": f"export_user_data.{table}", "user_id": user_id},
        max_retries=2,
    )
    return result.data or []


# ============================================================================
# Avatar
# ============================================================================


async def fetch_current_avatar_row(db: Any, *, user_id: str) -> Optional[Dict[str, Any]]:
    row = await asyncio.to_thread(
        db.table("users").select("avatar_url").eq("id", user_id).maybe_single().execute
    )
    return maybe_single_data(row)


async def set_user_avatar(db: Any, *, user_id: str, avatar_url: str) -> None:
    await asyncio.to_thread(db.table("users").update({"avatar_url": avatar_url, "updated_at": utcnow_iso()}).eq("id", user_id).execute)


# ============================================================================
# Body profiles
# ============================================================================


async def list_body_profile_rows(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    res = await asyncio.to_thread(
        db.table("body_profiles")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .execute
    )
    return res.data or []


async def count_body_profiles(db: Any, *, user_id: str) -> int:
    existing_count = await asyncio.to_thread(db.table("body_profiles").select("id", count="exact").eq("user_id", user_id).execute)
    return getattr(existing_count, "count", len(existing_count.data or []))


async def create_body_profile_row(db: Any, *, user_id: str, payload: Dict[str, Any], now: str) -> Dict[str, Any]:
    if payload.get("is_default"):
        await asyncio.to_thread(db.table("body_profiles").update({"is_default": False}).eq("user_id", user_id).execute)

    profile_id = str(uuid.uuid4())
    insert = {"id": profile_id, "user_id": user_id, **payload, "created_at": now, "updated_at": now}
    res = await asyncio.to_thread(db.table("body_profiles").insert(insert).execute)
    row = _first_row(res.data or [])
    if not row:
        raise DatabaseError("Failed to create body profile")

    if payload.get("is_default"):
        await asyncio.to_thread(db.table("users").update({"body_profile_id": profile_id}).eq("id", user_id).execute)

    return row


async def update_body_profile_row(db: Any, *, user_id: str, profile_id_str: str, update_data: Any) -> Dict[str, Any]:
    existing = await asyncio.to_thread(db.table("body_profiles").select("*").eq("id", profile_id_str).eq("user_id", user_id).execute)
    if not existing.data:
        raise BodyProfileNotFoundError(profile_id=profile_id_str)

    update = update_data.model_dump(exclude_unset=True)
    update["updated_at"] = utcnow_iso()

    if update.get("is_default") is True:
        await asyncio.to_thread(db.table("body_profiles").update({"is_default": False}).eq("user_id", user_id).execute)

    res = await asyncio.to_thread(db.table("body_profiles").update(update).eq("id", profile_id_str).eq("user_id", user_id).execute)
    row = _first_row(res.data or [])
    if not row:
        raise DatabaseError("Failed to update body profile")

    if update.get("is_default") is True:
        await asyncio.to_thread(db.table("users").update({"body_profile_id": profile_id_str}).eq("id", user_id).execute)

    return row


async def delete_body_profile_row(db: Any, *, user_id: str, profile_id_str: str) -> None:
    existing = await asyncio.to_thread(db.table("body_profiles").select("id,is_default").eq("id", profile_id_str).eq("user_id", user_id).execute)
    if not existing.data:
        raise BodyProfileNotFoundError(profile_id=profile_id_str)

    was_default = existing.data[0].get("is_default") if existing.data else False

    await asyncio.to_thread(db.table("body_profiles").delete().eq("id", profile_id_str).eq("user_id", user_id).execute)

    # If deleting the default profile, promote the newest remaining profile (if any)
    if was_default:
        remaining = await asyncio.to_thread(
            db.table("body_profiles")
            .select("id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute
        )
        if remaining.data:
            new_default_id = remaining.data[0]["id"]
            await asyncio.to_thread(db.table("body_profiles").update({"is_default": True, "updated_at": utcnow_iso()}).eq("id", new_default_id).execute)
            await asyncio.to_thread(db.table("users").update({"body_profile_id": new_default_id}).eq("id", user_id).execute)
        else:
            await asyncio.to_thread(db.table("users").update({"body_profile_id": None}).eq("id", user_id).execute)


async def fetch_latest_body_profile(db: Any, *, user_id: str) -> Optional[Dict[str, Any]]:
    result = await asyncio.to_thread(
        db.table("body_profiles")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute
    )
    return maybe_single_data(result)


async def upsert_body_profile_row(db: Any, *, user_id: str, update_data: Any) -> Tuple[Dict[str, Any], bool]:
    """Create or update the user's latest body profile. Returns (row, created)."""
    existing = await asyncio.to_thread(
        db.table("body_profiles")
        .select("id, is_default")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute
    )

    now = utcnow_iso()
    if not existing or not existing.data:
        # Creating requires full payload; validate via BodyProfileCreate.
        # A partial payload raises pydantic's ValidationError, which is
        # NOT the app's ValidationError — translate it so the client gets
        # a clean 422 instead of a 500 (B3-09).
        try:
            create = BodyProfileCreate(**update_data.model_dump(exclude_unset=True))
        except PydanticValidationError as exc:
            invalid_fields = [
                list(e.get("loc", ()))
                for e in exc.errors()
            ]
            raise ValidationError(
                "First body-profile save requires a full profile "
                "(name, height_cm, weight_kg, body_shape, skin_tone)",
                details={"missing_or_invalid_fields": invalid_fields},
            ) from exc
        insert = {
            "user_id": user_id,
            **create.model_dump(),
            "is_default": True,
            "created_at": now,
            "updated_at": now,
        }
        result = await asyncio.to_thread(db.table("body_profiles").insert(insert).execute)
        row = _first_row(result.data or [])
        if not row:
            raise DatabaseError("Failed to create body profile")
        profile_id = row["id"]
        # Link default profile
        await asyncio.to_thread(db.table("users").update({"body_profile_id": profile_id}).eq("id", user_id).execute)
        return row, True

    profile_id = existing.data["id"]
    update_dict = update_data.model_dump(exclude_unset=True)
    update_dict["updated_at"] = now

    if update_dict.get("is_default") is True:
        await asyncio.to_thread(db.table("body_profiles").update({"is_default": False}).eq("user_id", user_id).execute)

    result = await asyncio.to_thread(db.table("body_profiles").update(update_dict).eq("id", profile_id).execute)
    row = _first_row(result.data or [])
    if not row:
        raise DatabaseError("Failed to update body profile")

    # If user toggles is_default, keep users.body_profile_id updated
    if update_dict.get("is_default") is True:
        await asyncio.to_thread(db.table("users").update({"body_profile_id": profile_id}).eq("id", user_id).execute)

    return row, False


# ============================================================================
# Dashboard
# ============================================================================


async def fetch_default_location_rows(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    settings_row = await asyncio.to_thread(db.table("user_settings").select("default_location").eq("user_id", user_id).execute)
    return settings_row.data or []


async def fetch_outfit_of_the_day_rows(db: Any, *, user_id: str) -> List[Dict[str, Any]]:
    return (await asyncio.to_thread(
        db.table("outfits")
        .select("id,name,outfit_images(storage_path,image_url,thumbnail_url,is_primary)")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .limit(1)
        .execute
    )).data or []


async def fetch_dashboard_results(d: Any, *, user_id: str, month_start: str) -> List[Any]:
    # All count/recent queries are independent reads; run them concurrently
    # so the home-screen endpoint waits on the slowest query, not their sum
    # (the export path uses the same pattern on the same client).
    # Returns the raw responses in this order: user, items count, outfits
    # count, items added this month, outfits created this month, most worn
    # item, favorite items count, favorite outfits count, recent items,
    # recent outfits.
    return await asyncio.gather(
        asyncio.to_thread(d.table("users").select("*").eq("id", user_id).execute),
        asyncio.to_thread(d.table("items").select("id", count="exact").eq("user_id", user_id).eq("is_deleted", False).execute),
        asyncio.to_thread(d.table("outfits").select("id", count="exact").eq("user_id", user_id).execute),
        asyncio.to_thread(
            d.table("items")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("is_deleted", False)
            .gte("created_at", month_start)
            .execute
        ),
        asyncio.to_thread(
            d.table("outfits")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", month_start)
            .execute
        ),
        asyncio.to_thread(
            d.table("items")
            .select("name,usage_times_worn")
            .eq("user_id", user_id)
            .eq("is_deleted", False)
            # nullslast: NULL wear count must not outrank every real count
            # (Postgres sorts NULLs first under DESC by default).
            .order("usage_times_worn", desc=True, nullsfirst=False)
            .limit(1)
            .execute
        ),
        asyncio.to_thread(d.table("items").select("id", count="exact").eq("user_id", user_id).eq("is_favorite", True).eq("is_deleted", False).execute),
        asyncio.to_thread(d.table("outfits").select("id", count="exact").eq("user_id", user_id).eq("is_favorite", True).execute),
        # Recent activity (images are needed so the activity feed can render
        # thumbnails; storage_path is materialized to a fresh presigned URL in
        # the route's _build_recent_activity).
        asyncio.to_thread(
            d.table("items")
            .select("id,name,created_at,item_images(storage_path,image_url,thumbnail_url,is_primary)")
            .eq("user_id", user_id)
            .eq("is_deleted", False)
            .order("created_at", desc=True)
            .limit(5)
            .execute
        ),
        asyncio.to_thread(
            d.table("outfits")
            .select("id,name,created_at,outfit_images(storage_path,image_url,thumbnail_url,is_primary)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute
        ),
    )


# ============================================================================
# Auth dependency (app/api/v1/deps.py): user row lookups and first-login
# provisioning writes. Chains moved verbatim. deps.py keeps the embed
# fallback, the provisioning order, and error mapping.
# ============================================================================


async def select_user_row_for_auth(db: Any, *, columns: str, user_id: str, operation: str) -> Any:
    return await execute_with_reconnect(
        lambda d: d.table("users").select(columns).eq("id", user_id).maybe_single().execute(),
        db,
        extra={"operation": operation, "user_id": user_id},
    )


async def select_user_row_reduced_embed(db: Any, *, columns: str, user_id: str, operation: str) -> Any:
    return await execute_with_reconnect(
        lambda d: d.table("users").select(columns).eq("id", user_id).maybe_single().execute(),
        db,
        extra={"operation": operation, "user_id": user_id, "embed": "reduced"},
    )


async def select_user_row_no_embed(db: Any, *, columns: str, user_id: str, operation: str) -> Any:
    return await execute_with_reconnect(
        lambda d: d.table("users").select(columns).eq("id", user_id).maybe_single().execute(),
        db,
        extra={"operation": operation, "user_id": user_id, "embed": "none"},
    )


def upsert_user_profile(db: Any, *, profile: Dict[str, Any]) -> None:
    db.table("users").upsert(profile, on_conflict="id").execute()


def upsert_default_preferences(db: Any, *, token_data: Any) -> None:
    db.table("user_preferences").upsert({
        "user_id": token_data.sub,
        "favorite_colors": [],
        "preferred_styles": [],
        "liked_brands": [],
        "disliked_patterns": [],
        "preferred_occasions": [],
        "data_points_collected": 0,
    }, on_conflict="user_id").execute()


def upsert_default_settings(db: Any, *, token_data: Any) -> None:
    db.table("user_settings").upsert({
        "user_id": token_data.sub,
        "language": "en",
        "measurement_units": "imperial",
        "notifications_enabled": True,
        "email_marketing": False,
        "dark_mode": False,
    }, on_conflict="user_id").execute()
