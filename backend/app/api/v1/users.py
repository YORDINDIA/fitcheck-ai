"""
User API routes.

Implements:
- GET/PUT /api/v1/users/me
- GET /api/v1/users/bootstrap (app-launch aggregate: me + usage + referral)
- DELETE /api/v1/users/me (account deletion)
- POST /api/v1/users/export (data export archive)
- GET/PUT /api/v1/users/preferences
- GET/PUT /api/v1/users/settings
- GET/PUT /api/v1/users/body-profile
- POST /api/v1/users/me/avatar (upload)
- GET /api/v1/users/dashboard (MVP aggregate)
"""

import asyncio
import json
import re
from app.utils.datetime_util import utcnow, utcnow_iso
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from supabase import Client

from app.core.concurrency import PER_USER_LOCK
from app.core import user_profile_cache
from app.core.exceptions import (
    BodyProfileNotFoundError,
    DatabaseError,
    StorageServiceError,
    UnsupportedMediaTypeError,
    UserNotFoundError,
    ValidationError,
)
from app.core.logging_config import get_context_logger
from app.api.v1.deps import get_active_user_id
from app.core.uploads import read_upload_capped
from app.core.storage_keys import key_from_path, mint_export_key, parse_key
from app.db.connection import get_db
from app.utils.db import execute_with_reconnect
from app.models.user import (
    BodyProfile,
    BodyProfileCreate,
    BodyProfileUpdate,
    UserPreferences,
    UserPreferencesUpdate,
    UserResponse,
    UserSettings,
    UserSettingsUpdate,
    UserUpdate,
)
from app.services import user_service
from app.services.storage_service import MAX_FILE_SIZE, StorageService
from app.services.vector_service import get_vector_service
from app.services.weather_service import get_weather_service
from app.api.v1.images import _is_owned_by_user, materialize_avatar_url, materialize_image_urls

logger = get_context_logger(__name__)

router = APIRouter()


def _is_owned_avatar_key(key: str, user_id: str) -> bool:
    """True when ``key`` is this user's own avatar object (any layout).

    Avatar cleanup must only ever delete the caller's own avatar object — an
    external OAuth picture or another user's key is never touched. Current
    keys are ``users/{user_id}/avatars/...``; legacy keys were
    ``{user_id}/avatars/...`` (non-hex legacy names included), so both are
    matched structurally/positionally.
    """
    ref = parse_key(key)
    if ref is not None and ref.layout == "canonical" and ref.user == user_id:
        return ref.category == "avatars"
    parts = key.split("/")
    # users/{user_id}/avatars/... (current) or {user_id}/avatars/... (legacy).
    if len(parts) >= 3 and parts[0] == "users" and parts[1] == user_id:
        return parts[2] == "avatars"
    return len(parts) >= 2 and parts[0] == user_id and parts[1] == "avatars"


def _extract_missing_users_column(err: Exception) -> Optional[str]:
    """Return missing users.<column> name when Postgres reports undefined column."""
    code = getattr(err, "code", None)
    text = str(err).lower()
    has_missing_column_signal = (
        code in {"42703", "PGRST204"}
        or "42703" in text
        or "could not find the" in text
        or "column users." in text
    )
    if not has_missing_column_signal:
        return None

    match = re.search(r"column\s+users\.([a-z0-9_]+)\s+does\s+not\s+exist", text)
    if match:
        return match.group(1)
    match = re.search(r"could\s+not\s+find\s+the\s+'([a-z0-9_]+)'\s+column\s+of\s+'users'", text)
    if match:
        return match.group(1)
    return None


def _extract_birth_patch(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {field: payload[field] for field in ("birth_date", "birth_time", "birth_place") if field in payload}


def _normalize_user_birth_fields(row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize user row for response. birth_date is the canonical field."""
    return dict(row or {})


def _get_auth_user_metadata(db: Client, user_id: str) -> Dict[str, Any]:
    try:
        admin = getattr(db.auth, "admin", None)
        if not admin or not hasattr(admin, "get_user_by_id"):
            return {}
        auth_user = admin.get_user_by_id(user_id)
        if auth_user and getattr(auth_user, "user", None):
            return dict(getattr(auth_user.user, "user_metadata", {}) or {})
    except Exception:
        return {}
    return {}


def _update_auth_user_metadata(db: Client, user_id: str, patch: Dict[str, Any]) -> None:
    if not patch:
        return
    admin = getattr(db.auth, "admin", None)
    if not admin or not hasattr(admin, "update_user_by_id"):
        return
    merged = _get_auth_user_metadata(db, user_id)
    merged.update(patch)
    admin.update_user_by_id(user_id, {"user_metadata": merged})


def _handle_db_error(
    operation: str,
    user_id: str,
    error: Exception,
    extra_context: Optional[Dict[str, Any]] = None,
) -> None:
    """Log error and raise standardized DatabaseError."""
    context = {"user_id": user_id, "error": str(error)}
    if extra_context:
        context.update(extra_context)
    logger.error(f"Failed to {operation}", **context)
    raise DatabaseError(f"Failed to {operation}")


def _first_row(result_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Extract first row from query result."""
    return (result_data or [None])[0] if result_data else None


T = Dict[str, Any]


def _sync_birth_fields_to_auth(
    db: Client,
    user_id: str,
    birth_patch: Dict[str, Any],
) -> None:
    """Sync birth fields to auth metadata with error logging."""
    if not birth_patch:
        return
    try:
        _update_auth_user_metadata(db, user_id, birth_patch)
    except Exception as metadata_error:
        logger.warning(
            "Failed to sync birth fields to auth metadata",
            user_id=user_id,
            error=str(metadata_error),
        )


# ============================================================================
# PROFILE
# ============================================================================


@router.get("/me", response_model=Dict[str, Any])
async def get_current_user(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        rows = await user_service.fetch_user_row(db, user_id=user_id)
        if not rows:
            raise UserNotFoundError(user_id=user_id)

        user = UserResponse.model_validate(_normalize_user_birth_fields(rows[0]))
        user_data = user.model_dump(mode="json")

        # Fallback for projects that haven't applied astrology profile migration yet.
        if not all(user_data.get(field) for field in ("birth_date", "birth_time", "birth_place")):
            meta = _get_auth_user_metadata(db, user_id)
            for field in ("birth_date", "birth_time", "birth_place"):
                if not user_data.get(field):
                    user_data[field] = meta.get(field)

        # Regenerate a fresh avatar URL at read time. The DB stores a bucket
        # key, a presigned URL (expires after OBJECT_STORAGE_PRESIGN_TTL), a
        # legacy Supabase public URL — or an EXTERNAL https URL (OAuth
        # provider picture). Only our own objects are re-materialized; an
        # external URL must pass through untouched, never be reduced to a
        # bucket key and presigned/minted (key_from_path would mangle
        # e.g. https://lh3.googleusercontent.com/a/... into a bogus key).
        # The UUID first-segment guard lives in materialize_avatar_url (images.py)
        # so this, ai.py and the leaderboard share one implementation.
        avatar_url = user_data.get("avatar_url")
        if avatar_url:
            try:
                fresh = await materialize_avatar_url(avatar_url)
                if fresh:
                    user_data["avatar_url"] = fresh
            except Exception as e:
                logger.warning("Failed to materialize avatar URL", user_id=user_id, error=str(e))

        return {"data": user_data, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("fetch user", user_id, e)


@router.put("/me", response_model=Dict[str, Any])
async def update_current_user(
    update_data: UserUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        update_dict = update_data.model_dump(mode="json", exclude_unset=True)
        if not update_dict:
            return await get_current_user(user_id=user_id, db=db)

        birth_patch = _extract_birth_patch(update_dict)
        update_payload = dict(update_dict)
        skipped_fields: List[str] = []

        # Admin-only fields are never client-settable: a user must not be
        # able to (un)suspend themselves, change their own role, or set an
        # admin flag / quota override through the self-service profile route
        # (the admin panel owns those via /api/v1/admin/users). They are
        # stripped from the payload — not errors — so a stale client sending
        # them degrades gracefully.
        for admin_only in ("is_active", "role", "is_admin", "custom_daily_quota"):
            update_payload.pop(admin_only, None)

        while True:
            update_payload["updated_at"] = utcnow_iso()
            try:
                rows = await user_service.update_user_row(db, user_id=user_id, update_payload=update_payload)
                break
            except Exception as e:
                missing_col = _extract_missing_users_column(e)
                if not missing_col or missing_col not in update_payload:
                    raise
                if missing_col == "birth_date":
                    # Support legacy schema that still uses users.date_of_birth.
                    update_payload["date_of_birth"] = update_payload.get("birth_date")
                    update_payload.pop("birth_date", None)
                    logger.warning(
                        "users.birth_date missing, retrying update using users.date_of_birth",
                        user_id=user_id,
                    )
                    continue
                skipped_fields.append(missing_col)
                update_payload.pop(missing_col, None)
                logger.warning(
                    "Skipping update for missing users column",
                    user_id=user_id,
                    skipped_column=missing_col,
                )
                # Avoid empty update (only updated_at left).
                if set(update_payload.keys()) <= {"updated_at"}:
                    _sync_birth_fields_to_auth(db, user_id, birth_patch)
                    return {
                        "data": (await get_current_user(user_id=user_id, db=db))["data"],
                        "message": "No schema-compatible profile fields to update",
                        "meta": {"skipped_fields": skipped_fields},
                    }

        row = _first_row(rows)
        if not row:
            raise DatabaseError("Failed to update user")

        # The auth hot path caches this row; drop the stale copy so the next
        # request reads the updated profile.
        user_profile_cache.invalidate(user_id)

        _sync_birth_fields_to_auth(db, user_id, birth_patch)

        user = UserResponse.model_validate(_normalize_user_birth_fields(row))
        response: Dict[str, Any] = {"data": user.model_dump(mode="json"), "message": "Updated"}
        if skipped_fields:
            response["meta"] = {"skipped_fields": skipped_fields}
        return response

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("update user", user_id, e)


@router.get("/bootstrap", response_model=Dict[str, Any])
async def get_bootstrap(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """One-roundtrip app-launch aggregate.

    The mobile/web launch sequence used to fire 5+ parallel reads
    (/users/me, /items, /outfits, /subscription/usage, /referral/code);
    each paid its own auth-profile lookup and DB roundtrip, which showed up
    in the Aug 2026 logs as 400-1500 ms cold-start clusters. This endpoint
    returns the same payloads under one request. The individual routes stay
    for compatibility and partial refreshes.
    """
    from app.services.referral_service import ReferralService
    from app.services.subscription_service import SubscriptionService

    try:
        # Stage 1: profile + usage concurrently (independent reads). Stage 2
        # needs the profile's full_name (referral-code generation), so the
        # referral read runs after me. Cache means me + usage share the
        # already-warmed profile; with the old 5-endpoint fan-out each paid
        # its own profile lookup.
        me_response, usage_response = await asyncio.gather(
            get_current_user(user_id=user_id, db=db),
            SubscriptionService.get_usage(user_id, db),
        )
        referral_data = await ReferralService.get_or_create_referral_code(
            user_id=user_id,
            full_name=me_response["data"].get("full_name"),
            db=db,
        )
        return {
            "data": {
                "me": me_response["data"],
                "usage": usage_response.model_dump(mode="json"),
                "referral_code": referral_data.model_dump(mode="json"),
            },
            "message": "OK",
        }
    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("bootstrap", user_id, e)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Delete the current user's account and data.

    External vectors/storage are cleaned before the public user row is removed.
    The public row is deleted before Auth so an Auth outage cannot leave a live
    user profile and wardrobe behind. Auth and Postgres still cannot share a
    transaction; every boundary fails loudly and the operation is safe to
    retry with the same authenticated session.
    """
    try:
        # Resolve owned storage paths through the parent rows. Child image
        # tables do not carry user_id and the backend uses a service client.
        owned = await StorageService.resolve_owned_storage_paths(db, user_id)
        storage_paths = owned["storage_paths"]

        tickets_rows = await user_service.list_support_ticket_attachments(db, user_id=user_id)
        for ticket_row in tickets_rows:
            for path in (ticket_row.get("attachment_storage_paths") or []):
                if path:
                    storage_paths.append(str(path))

        # The avatar is referenced only by URL on the user row; resolve it to
        # its storage object so deletion does not orphan it in Storage.
        # `key_from_path` reduces the stored (presigned) URL to its bucket key
        # (replaces the removed `url_to_storage_path`); the S3 backend uses a
        # single configured bucket, so the key is appended to the shared list.
        avatar_row = await user_service.fetch_avatar_row(db, user_id=user_id)
        avatar_key = key_from_path(
            (avatar_row or {}).get("avatar_url")
        )
        # A2-02: ``users.avatar_url`` is user-settable (PUT /me persists it
        # verbatim) and other users' avatar URLs are observable via the
        # leaderboard's presigned re-mints — only delete an object this user
        # actually owns. External OAuth picture URLs already yield no key
        # from key_from_path; this guard closes the cross-user key case.
        if avatar_key and _is_owned_by_user(avatar_key, user_id):
            storage_paths.append(avatar_key)

        # The data-export archive is a single deterministic key per user
        # (POST /users/export overwrites it), so its object is known without a
        # bucket listing; delete it with the rest of the owned storage. A
        # missing object is a no-op delete on the S3 side.
        storage_paths.append(mint_export_key(user_id))
        # Database rows only reference durable objects. A user can also have
        # short-lived generated or temporary images that are never attached
        # to a row, so enumerate their owned namespace before deletion.
        storage_paths.extend(
            await StorageService.list_owned_user_storage_paths(user_id)
        )
        storage_paths = list(dict.fromkeys(storage_paths))

        async def _delete_storage() -> None:
            if storage_paths:  # pragma: no cover - export path always appended above
                await StorageService.delete_multiple_images(db=db, storage_paths=storage_paths)

        async def _delete_vectors() -> None:
            if user_service.has_items_select(db):  # pragma: no cover - real clients always have select
                try:
                    await get_vector_service().delete_user_items(user_id)
                except Exception as error:
                    raise DatabaseError("Failed to delete wardrobe embeddings", operation="delete_vectors") from error

        # Storage and vector cleanup are independent of each other; the user
        # row delete stays last so an Auth outage cannot leave a live profile.
        await asyncio.gather(_delete_storage(), _delete_vectors())

        await user_service.anonymize_support_tickets(db, user_id=user_id)

        await user_service.delete_user_row(db, user_id=user_id)
        # The row is gone; a cached copy must not serve later requests.
        user_profile_cache.invalidate(user_id)

        admin = getattr(getattr(db, "auth", None), "admin", None)
        if not admin or not hasattr(admin, "delete_user"):
            raise DatabaseError("Auth account deletion is unavailable", operation="delete_auth_user")
        await asyncio.to_thread(admin.delete_user, user_id)

        return None

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("delete account", user_id, e)


# ============================================================================
# DATA EXPORT
# ============================================================================


@router.post("/export", response_model=Dict[str, Any])
async def export_user_data(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Generate a JSON archive of the current user's data and return a
    short-lived presigned download URL.

    Metadata only: rows carry their storage keys (``storage_path``); image
    bytes are never included. The archive is written to a single
    deterministic key per user (``users/{user_id}/export/data.json``, overwritten on
    each call - the same key account deletion cleans up), and served as a
    short-lived presigned GET URL (the repo's ~15-minute pattern). Every call
    returns a fresh URL, so repeat requests never hand out a stale link.
    """
    try:
        user_rows = await user_service.fetch_user_row_for_export(db, user_id=user_id)
        if not user_rows:
            raise UserNotFoundError(user_id=user_id)

        async def _rows(table: str) -> List[Dict[str, Any]]:
            return await user_service.list_user_rows(db, table=table, user_id=user_id)

        # Sections are independent; read them concurrently (same pattern as
        # the dashboard aggregate and the deletion cascade).
        preferences, settings, body_profiles, items, outfits, calendar_events, subscriptions = await asyncio.gather(
            _rows("user_preferences"),
            _rows("user_settings"),
            _rows("body_profiles"),
            _rows("items"),
            _rows("outfits"),
            _rows("calendar_events"),
            _rows("subscriptions"),
        )

        payload = {
            "generated_at": utcnow_iso(),
            "note": "Metadata export: image files are not included; rows carry their storage keys.",
            "user": user_rows[0],
            "preferences": (preferences or [None])[0],
            "settings": (settings or [None])[0],
            "body_profiles": body_profiles,
            "items": items,
            "outfits": outfits,
            "calendar_events": calendar_events,
            # Billing summary only - provider-side identifiers are the user's
            # own data but add nothing to a wardrobe export.
            "subscriptions": [
                {
                    "id": row.get("id"),
                    "plan_type": row.get("plan_type"),
                    "status": row.get("status"),
                    "current_period_start": row.get("current_period_start"),
                    "current_period_end": row.get("current_period_end"),
                    "cancel_at_period_end": row.get("cancel_at_period_end"),
                }
                for row in subscriptions
            ],
        }

        export_bytes = json.dumps(payload, default=str, indent=2).encode("utf-8")
        upload = await StorageService.upload_file(
            db=db,
            file_data=export_bytes,
            file_path=mint_export_key(user_id),
            content_type="application/json",
            # Short cache TTL: the archive is personal data, so a CDN edge
            # must never keep serving a previous export for long (upload_file
            # docstring: pass a short value when overwriting an existing key).
            cache_control="60",
        )
        return {"data": {"export_url": upload["public_url"]}, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError, StorageServiceError):
        raise
    except Exception as e:
        _handle_db_error("export user data", user_id, e)


@router.post("/me/avatar", response_model=Dict[str, Any])
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise UnsupportedMediaTypeError(message="Avatar must be an image file")

        # Capture the CURRENT avatar before it is overwritten: replacing it
        # without removing the old object leaks the previous avatar forever
        # (measured: 47 orphan avatar objects / 53MB in the bucket).
        old_avatar_url = None
        try:
            avatar_row = await user_service.fetch_current_avatar_row(db, user_id=user_id)
            old_avatar_url = (avatar_row or {}).get("avatar_url") if avatar_row else None
        except Exception as e:
            logger.warning("Failed to read current avatar before replace", user_id=user_id, error=str(e))

        file_bytes = await read_upload_capped(file, MAX_FILE_SIZE)
        avatar_url = await StorageService.upload_avatar(
            db=db, user_id=user_id, filename=file.filename or "avatar.png", file_data=file_bytes
        )

        try:
            await user_service.set_user_avatar(db, user_id=user_id, avatar_url=avatar_url)
            # Keep the auth-path profile cache coherent with the new avatar.
            user_profile_cache.invalidate(user_id)
        except Exception:
            # A2-07: the row update failed after the new avatar object was
            # uploaded — best-effort delete of the orphan before surfacing
            # the error, so a failed replace does not leak the object.
            try:
                new_key = key_from_path(avatar_url)
                if new_key and _is_owned_avatar_key(new_key, user_id):
                    await StorageService.delete_image(db=db, storage_path=new_key)
            except Exception as cleanup_error:
                logger.warning(
                    "Failed to clean up orphaned avatar after users row update failure",
                    user_id=user_id,
                    error=str(cleanup_error),
                )
            raise

        # Best-effort removal of the replaced avatar object. Only our own
        # bucket key is deleted: an external OAuth picture URL must pass
        # through untouched (key_from_path would mangle it), and a key from
        # another user is never touched. Never fails the request.
        if old_avatar_url:
            try:
                old_key = key_from_path(old_avatar_url)
                if old_key and _is_owned_avatar_key(old_key, user_id) and old_key != key_from_path(avatar_url):
                    await StorageService.delete_image(db=db, storage_path=old_key)
            except Exception as e:
                logger.warning(
                    "Failed to delete replaced avatar",
                    user_id=user_id,
                    error=str(e),
                )

        return {"data": {"avatar_url": avatar_url}, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError, UnsupportedMediaTypeError, StorageServiceError):
        raise
    except Exception as e:
        _handle_db_error("upload avatar", user_id, e, {"file_name": file.filename})


# ============================================================================
# PREFERENCES
# ============================================================================


_PREFERENCES_DEFAULTS = {
    "favorite_colors": [],
    "preferred_styles": [],
    "liked_brands": [],
    "disliked_patterns": [],
    "preferred_occasions": [],
    "color_temperature": None,
    "style_personality": None,
    "data_points_collected": 0,
    "last_updated": None,  # Set by _get_or_create_record
}


@router.get("/preferences", response_model=Dict[str, Any])
async def get_user_preferences(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        prefs_data, _ = user_service.get_or_create_record(
            db, "user_preferences", user_id, _PREFERENCES_DEFAULTS, UserPreferences
        )
        prefs_data["last_updated"] = utcnow_iso()
        return {"data": prefs_data, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("fetch preferences", user_id, e)


@router.put("/preferences", response_model=Dict[str, Any])
async def update_user_preferences(
    update_data: UserPreferencesUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        prefs_data = user_service.upsert_record(
            db,
            "user_preferences",
            user_id,
            update_data,
            UserPreferences,
            _PREFERENCES_DEFAULTS,
            updated_field="last_updated",
            created_field=None,
        )
        return {"data": prefs_data, "message": "Updated"}

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("update preferences", user_id, e)


# ============================================================================
# SETTINGS
# ============================================================================


_SETTINGS_DEFAULTS = {
    "default_location": None,
    "timezone": None,
    "language": "en",
    "language_explicit": False,
    "measurement_units": "imperial",
    "notifications_enabled": True,
    "email_marketing": False,
    "dark_mode": False,
}


def _derive_language_explicit(update_data: Any) -> None:
    """Make `language_explicit` follow the payload in place.

    The client's wire contract (migration 065):

    - `language: "hi"` → the user picked Hindi: ``language_explicit = TRUE``.
    - `language: null` → "follow the device": the column keeps its default
      `'en'` (it is what `UserSettingsBase` reads back) and the flag is
      cleared, so `Accept-Language` decides again.
    - no `language` key at all → the client did not touch the picker; the
      stored pair is left exactly as it was.

    An explicit `language_explicit` in the payload overrides the derivation,
    so a client that states its intent directly (and can therefore distinguish
    the three cases itself) is not second-guessed.
    """
    fields_set = getattr(update_data, "model_fields_set", set())
    if "language" not in fields_set:
        return
    stated = update_data.language_explicit
    if update_data.language is None:
        # "Follow the device": never write NULL into the column (the response
        # model types it `str`), clear the flag instead.
        update_data.language = _SETTINGS_DEFAULTS["language"]
        update_data.language_explicit = False if stated is None else stated
    elif stated is None:
        update_data.language_explicit = True


@router.get("/settings", response_model=Dict[str, Any])
async def get_user_settings(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        settings_data, _ = user_service.get_or_create_record(
            db, "user_settings", user_id, _SETTINGS_DEFAULTS, UserSettings
        )
        return {"data": settings_data, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("fetch settings", user_id, e)


@router.put("/settings", response_model=Dict[str, Any])
async def update_user_settings(
    update_data: UserSettingsUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        # `language: null` means "follow the device"; this turns that into
        # `language_explicit = FALSE` so the next request defers to
        # `Accept-Language` instead of pinning the stored default 'en'.
        _derive_language_explicit(update_data)
        settings_data = user_service.upsert_record(
            db, "user_settings", user_id, update_data, UserSettings, _SETTINGS_DEFAULTS
        )
        # The profile embed (`user_settings(language)`) that the auth
        # dependencies read their AI language from is cached for 30 s; drop it
        # so a language switch applies to the very next request instead of the
        # next cache window.
        user_profile_cache.invalidate(user_id)
        return {"data": settings_data, "message": "Updated"}

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("update settings", user_id, e)


# ============================================================================
# BODY PROFILE
# ============================================================================


@router.get("/body-profiles", response_model=Dict[str, Any])
async def list_body_profiles(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """List all body profiles for the user."""
    try:
        rows = await user_service.list_body_profile_rows(db, user_id=user_id)
        profiles = [BodyProfile.model_validate(r).model_dump(mode="json") for r in rows]
        return {"data": {"body_profiles": profiles}, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError, BodyProfileNotFoundError):
        raise
    except Exception as e:
        _handle_db_error("fetch body profiles", user_id, e)


@router.post("/body-profiles", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_body_profile(
    request: BodyProfileCreate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Create a new body profile."""
    # The "first profile becomes the default" decision is a read-modify-write
    # on the profile count: two concurrent creates both see count == 0 and
    # both set is_default=True, leaving the user with TWO defaults (A1-17).
    # The per-user lock serializes the check-and-insert within this process.
    async with PER_USER_LOCK(user_id):
        try:
            now = utcnow_iso()
            count = await user_service.count_body_profiles(db, user_id=user_id)

            payload = request.model_dump()
            if count == 0:
                payload["is_default"] = True

            row = await user_service.create_body_profile_row(db, user_id=user_id, payload=payload, now=now)

            profile = BodyProfile.model_validate(row)
            return {"data": profile.model_dump(mode="json"), "message": "Created"}

        except (UserNotFoundError, ValidationError, DatabaseError, BodyProfileNotFoundError):
            raise
        except Exception as e:
            _handle_db_error("create body profile", user_id, e)


@router.put("/body-profiles/{profile_id}", response_model=Dict[str, Any])
async def update_body_profile(
    profile_id: UUID,
    update_data: BodyProfileUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Update an existing body profile."""
    try:
        profile_id_str = str(profile_id)
        row = await user_service.update_body_profile_row(
            db, user_id=user_id, profile_id_str=profile_id_str, update_data=update_data
        )

        profile = BodyProfile.model_validate(row)
        return {"data": profile.model_dump(mode="json"), "message": "Updated"}

    except (UserNotFoundError, ValidationError, DatabaseError, BodyProfileNotFoundError):
        raise
    except Exception as e:
        _handle_db_error("update body profile", user_id, e, {"profile_id": profile_id_str})


@router.delete("/body-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_body_profile(
    profile_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Delete a body profile."""
    try:
        profile_id_str = str(profile_id)
        await user_service.delete_body_profile_row(db, user_id=user_id, profile_id_str=profile_id_str)

        return None

    except (UserNotFoundError, ValidationError, DatabaseError, BodyProfileNotFoundError):
        raise
    except Exception as e:
        _handle_db_error("delete body profile", user_id, e, {"profile_id": profile_id_str})


@router.get("/body-profile", response_model=Dict[str, Any])
async def get_body_profile(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        row = await user_service.fetch_latest_body_profile(db, user_id=user_id)
        if not row:
            raise BodyProfileNotFoundError()

        profile = BodyProfile.model_validate(row)
        return {"data": profile.model_dump(mode="json"), "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError, BodyProfileNotFoundError):
        raise
    except Exception as e:
        _handle_db_error("fetch body profile", user_id, e)


@router.put("/body-profile", response_model=Dict[str, Any])
async def upsert_body_profile(
    update_data: BodyProfileUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        row, created = await user_service.upsert_body_profile_row(db, user_id=user_id, update_data=update_data)
        profile = BodyProfile.model_validate(row)
        return {"data": profile.model_dump(mode="json"), "message": "Created" if created else "Updated"}

    except (UserNotFoundError, ValidationError, DatabaseError, BodyProfileNotFoundError):
        raise
    except Exception as e:
        _handle_db_error("save body profile", user_id, e)


# ============================================================================
# DASHBOARD (MVP)
# ============================================================================


def _get_count_from_result(result: Any) -> int:
    """Extract count from Supabase result, handling different response formats."""
    return getattr(result, "count", len(result.data or []))


def _primary_image_url(images: List[Dict]) -> Optional[str]:
    """Pick the primary (else first) image URL, preferring the thumbnail.

    Mirrors the items/outfits list endpoints: ``thumbnail_url`` is sized for
    grid tiles while ``image_url`` is the full-res asset. The caller must have
    already materialized fresh presigned URLs (private buckets store durable
    ``storage_path`` keys, never URLs).
    """
    if not images:
        return None
    primary = next((i for i in images if i.get("is_primary")), images[0])
    return (primary or {}).get("thumbnail_url") or (primary or {}).get("image_url")


def _primary_storage_path(images: List[Dict]) -> Optional[str]:
    """Pick the durable storage key of the primary (else first) image.

    Siblings the URL picker above so clients can re-mint a fresh short-lived
    URL when the one they hold expires while a screen stays open.
    """
    if not images:
        return None
    primary = next((i for i in images if i.get("is_primary")), images[0])
    return (primary or {}).get("storage_path")


async def _build_recent_activity(
    items: List[Dict], outfits: List[Dict], owner_user_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Build combined recent activity list from items and outfits.

    Rows carry nested ``item_images`` / ``outfit_images``; their ``storage_path``
    is materialized into a fresh short-lived presigned URL here so activity
    thumbnails never render an expired URL. Rows without ``storage_path``
    (legacy) keep their stored URL unless ``owner_user_id`` enables the
    URL-derivation fallback (see materialize_image_urls).
    """
    activity: List[Dict[str, Any]] = []

    for it in items:
        images = it.get("item_images") or []
        await materialize_image_urls(images, owner_user_id=owner_user_id)
        activity.append({
            "type": "item_created",
            "description": f"Added {it.get('name')}",
            "timestamp": it.get("created_at"),
            "image_url": _primary_image_url(images),
            "storage_path": _primary_storage_path(images),
        })

    for o in outfits:
        images = o.get("outfit_images") or []
        await materialize_image_urls(images, owner_user_id=owner_user_id)
        activity.append({
            "type": "outfit_created",
            "description": f"Created {o.get('name')}",
            "timestamp": o.get("created_at"),
            "image_url": _primary_image_url(images),
            "storage_path": _primary_storage_path(images),
        })

    return sorted(activity, key=lambda a: a.get("timestamp") or "", reverse=True)[:10]


async def _get_weather_suggestion(user_id: str, db: Client) -> Optional[Dict[str, Any]]:
    """Get weather-based suggestion for user."""
    try:
        settings_rows = await user_service.fetch_default_location_rows(db, user_id=user_id)
        location = settings_rows[0].get("default_location") if (settings_rows and len(settings_rows) > 0) else None
        if not location:
            return None

        service = get_weather_service()
        weather = await service.get_weather(location=str(location), units="imperial")
        if not weather:
            return None

        temp_f = float(weather.get("temperature", 0))
        temp_c = round((temp_f - 32.0) * 5.0 / 9.0, 1)

        if temp_c < 5:
            recommendation = "Wear a warm coat and layered outfit."
        elif temp_c > 27:
            recommendation = "Choose breathable fabrics and lighter colors."
        else:
            recommendation = "Consider light layers."

        return {"temperature": temp_c, "recommendation": recommendation}
    except Exception:
        return None


async def _get_outfit_of_the_day(user_id: str, db: Client) -> Optional[Dict[str, Any]]:
    """Get the most recently updated outfit for the user."""
    try:
        outfit = await user_service.fetch_outfit_of_the_day_rows(db, user_id=user_id)

        if not outfit:
            return None

        o = outfit[0]
        images = o.get("outfit_images") or []
        # Private buckets: the DB stores durable storage_path keys, so a fresh
        # short-lived presigned URL is regenerated at read time (same contract
        # as the items/outfits list endpoints) — the stored image_url would be
        # stale/expired and render a broken card image.
        await materialize_image_urls(images, owner_user_id=user_id)
        primary = next((i for i in images if i.get("is_primary")), images[0] if images else None)
        return {
            "id": o.get("id"),
            "name": o.get("name"),
            "image_url": (primary or {}).get("thumbnail_url") or (primary or {}).get("image_url"),
            # Durable key so clients can re-mint a fresh URL if this one
            # expires while the dashboard stays open.
            "storage_path": (primary or {}).get("storage_path"),
        }
    except Exception:
        return None


@router.get("/dashboard", response_model=Dict[str, Any])
async def get_dashboard(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Aggregate endpoint for the dashboard UI."""
    async def _dashboard_data(d: Any) -> Dict[str, Any]:
        now_dt = utcnow()
        month_start = now_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

        (
            user_row,
            items_count,
            outfits_count,
            items_added_month,
            outfits_created_month,
            most_worn_item,
            fav_items,
            fav_outfits,
            recent_items,
            recent_outfits,
        ) = await user_service.fetch_dashboard_results(d, user_id=user_id, month_start=month_start)
        if not user_row.data:
            raise UserNotFoundError(user_id=user_id)

        most_worn_item = most_worn_item.data or []

        # Activity materialization, weather and outfit-of-the-day are
        # independent of each other; run them concurrently.
        recent_activity, weather_based, outfit_of_the_day = await asyncio.gather(
            _build_recent_activity(
                recent_items.data or [],
                recent_outfits.data or [],
                owner_user_id=user_id,
            ),
            _get_weather_suggestion(user_id, d),
            _get_outfit_of_the_day(user_id, d),
        )

        return {
            "user": user_row.data,
            "statistics": {
                "total_items": _get_count_from_result(items_count),
                "total_outfits": _get_count_from_result(outfits_count),
                "items_added_this_month": _get_count_from_result(items_added_month),
                "outfits_created_this_month": _get_count_from_result(outfits_created_month),
                "most_worn_item": (
                    {"name": most_worn_item[0].get("name"), "times_worn": int(most_worn_item[0].get("usage_times_worn") or 0)}
                    if most_worn_item
                    else None
                ),
                "favorite_items_count": _get_count_from_result(fav_items),
                "favorite_outfits_count": _get_count_from_result(fav_outfits),
            },
            "recent_activity": recent_activity,
            "suggestions": {
                "weather_based": weather_based,
                "outfit_of_the_day": outfit_of_the_day,
            },
        }

    try:
        payload = await execute_with_reconnect(
            lambda d: _dashboard_data(d),
            db,
            extra={"operation": "get_dashboard", "user_id": user_id},
            max_retries=2,
        )
        return {"data": payload, "message": "OK"}

    except (UserNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        _handle_db_error("fetch dashboard", user_id, e)
