"""
Outfits API routes.

Implements outfit CRUD and a lightweight generation-tracking flow.

AI image generation is performed server-side via the AI provider service. The backend
stores generated images in object storage (R2) and records metadata for retrieval.

Persistence lives in ``app.services.outfit_service``. Routes only parse input,
call the service, map errors, and shape responses.
"""

import asyncio
import uuid
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel, Field
from supabase import Client

from app.core.logging_config import get_context_logger
from app.core.exceptions import (
    OutfitNotFoundError,
    ItemNotFoundError,
    ValidationError,
    DatabaseError,
    CollectionNotFoundError,
    ImageNotFoundError,
    UnsupportedMediaTypeError,
    NotFoundError,
    SharedOutfitNotFoundError,
)
from app.api.v1.deps import get_active_user_id
from app.core.uploads import read_upload_capped
from app.core.config import settings
from app.db.connection import get_db
from app.models.common import DataResponse
from app.models.outfit import (
    GenerationRequest,
    GenerationStatus,
    OutfitCreate,
    OutfitListResponse,
    OutfitResponse,
    OutfitUpdate,
    OutfitCollectionCreate,
    OutfitCollectionUpdate,
)
from app.services import outfit_service
from app.services.outfit_service import collection_counts as _collection_counts  # noqa: F401 (test seam)
from app.services.outfit_service import delete_outfit as delete_outfit_service
from app.services.outfit_service import normalize_item_images as _normalize_item_images  # noqa: F401 (test seam)
from app.services.outfit_service import normalize_outfit_images as _normalize_outfit_images
from app.services.storage_service import MAX_FILE_SIZE, StorageService
from app.utils.datetime_util import utcnow, utcnow_iso, parse_utc_datetime
from app.api.v1.images import materialize_image_urls, materialize_parent_images

logger = get_context_logger(__name__)

router = APIRouter()


class BatchDeleteOutfitsRequest(BaseModel):
    outfit_ids: List[str] = Field(default_factory=list, min_length=1)


class AddItemToOutfitRequest(BaseModel):
    item_id: str
    position: Optional[str] = None  # reserved for future visual canvas placement


class ShareOutfitRequest(BaseModel):
    visibility: str = Field(default="public", description="public|friends|private")
    expires_at: Optional[str] = Field(default=None, description="ISO8601 datetime (optional)")
    allow_feedback: bool = Field(default=True)
    custom_caption: Optional[str] = None


class UpdateCollectionOutfitsRequest(BaseModel):
    outfit_ids: List[str] = Field(default_factory=list)


class AddCollectionOutfitRequest(BaseModel):
    outfit_id: str = Field(..., min_length=1)


def _now() -> str:
    return utcnow_iso()


# ============================================================================
# CRUD
# ============================================================================


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_outfit(
    request: OutfitCreate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id = str(uuid.uuid4())
        now = _now()

        # Verify items exist and belong to user
        item_ids = [str(i) for i in request.item_ids]
        items_rows = await outfit_service.fetch_owned_item_ids_for_create(
            db, user_id=user_id, item_ids=item_ids
        )
        found_ids = {row["id"] for row in items_rows}
        missing = [iid for iid in item_ids if iid not in found_ids]
        if missing:
            raise ValidationError(
                "One or more items not found",
                details={"missing_item_ids": missing}
            )

        insert = {
            "id": outfit_id,
            "user_id": user_id,
            "name": request.name,
            "description": request.description,
            "item_ids": item_ids,
            "style": request.style,
            "season": request.season,
            "occasion": request.occasion,
            "tags": request.tags,
            "is_favorite": request.is_favorite,
            "is_draft": request.is_draft,
            "is_public": request.is_public,
            "worn_count": 0,
            "last_worn_at": None,
            "created_at": now,
            "updated_at": now,
        }

        row = await outfit_service.insert_outfit_row(db, insert=insert, user_id=user_id)
        if not row:
            raise DatabaseError("Failed to create outfit", operation="insert")

        row["images"] = []
        return {"data": row, "message": "Created"}

    except (ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Create outfit error", user_id=user_id, error=str(e))
        raise DatabaseError("Failed to create outfit", operation="insert")


@router.get("", response_model=DataResponse[OutfitListResponse])
async def list_outfits(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_favorite: Optional[bool] = Query(None),
    style: Optional[str] = Query(None),
    season: Optional[str] = Query(None),
    styles: Optional[str] = Query(None, description="Comma-separated style filters"),
    seasons: Optional[str] = Query(None, description="Comma-separated season filters"),
    favorites_only: Optional[bool] = Query(None),
    drafts_only: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        styles_value = styles if isinstance(styles, str) else None
        seasons_value = seasons if isinstance(seasons, str) else None
        favorites_value = favorites_only if isinstance(favorites_only, bool) else None
        drafts_value = drafts_only if isinstance(drafts_only, bool) else None
        effective_favorite = is_favorite if is_favorite is not None else favorites_value
        effective_styles = [value.strip() for value in (styles_value or "").split(",") if value.strip()]
        effective_seasons = [value.strip() for value in (seasons_value or "").split(",") if value.strip()]
        if style:
            effective_styles = [style]
        if season:
            effective_seasons = [season]
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        outfits, total, items_map = await outfit_service.list_outfit_page(
            db,
            user_id=user_id,
            page=page,
            page_size=page_size,
            effective_favorite=effective_favorite,
            effective_styles=effective_styles,
            effective_seasons=effective_seasons,
            drafts_value=drafts_value,
            tag_list=tag_list,
            search=search,
        )

        # Private buckets: materialize fresh short-lived presigned URLs from
        # storage_path at read time (the DB stores keys, not URLs) for both the
        # outfit images and the nested item images.
        await asyncio.gather(
            materialize_parent_images(outfits, owner_user_id=user_id),
            materialize_parent_images(list(items_map.values()), owner_user_id=user_id),
        )

        # Attach items to each outfit
        for outfit in outfits:
            outfit["items"] = [
                items_map.get(str(iid))
                for iid in (outfit.get("item_ids") or [])
                if str(iid) in items_map
            ]

        total_pages = max(1, (total + page_size - 1) // page_size)
        return {
            "data": {
                "outfits": outfits,
                "total": total,
                "page": page,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
            "message": "OK",
        }

    except Exception as e:
        logger.error("List outfits error", user_id=user_id, page=page, error=str(e))
        raise DatabaseError("Failed to fetch outfits", operation="select")


@router.get("/available-items", response_model=Dict[str, Any])
async def available_items(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
    ids: Optional[str] = Query(
        None,
        description=(
            "Optional comma-separated item UUIDs to restrict the picker to. "
            "Callers that only need a known subset (e.g. an outfit's item_ids) "
            "should pass them instead of fetching the whole closet."
        ),
    ),
):
    """Return simplified items list suitable for outfit-building UIs."""
    try:
        # Opt-in subset filter (backward compatible: absent ids = whole closet).
        # Invalid entries are ignored; an empty parsed set short-circuits to [].
        # Guard: when this endpoint is invoked directly (tests/other routes),
        # the FastAPI Query() default arrives as a ParamInfo/Query object, not
        # None -- only a real str enables the filter. Any real str, including
        # an explicitly empty/blank "?ids=", enables the filter: an explicitly
        # requested empty subset must not silently widen to the whole closet.
        id_list: Optional[List[str]] = None
        if isinstance(ids, str):
            valid: List[str] = []
            for raw in ids.split(","):
                # uuid.UUID("") raises ValueError, so blanks are skipped too.
                try:
                    uuid.UUID(raw.strip())
                except ValueError:
                    continue
                valid.append(raw.strip())
            # Dedupe (harmless to .in_() but keeps the cap honest) and cap.
            id_list = list(dict.fromkeys(valid))[:100]
            if not id_list:
                return {"data": [], "message": "OK"}

        rows = await outfit_service.fetch_available_item_rows(
            db, user_id=user_id, id_list=id_list
        )
        items = []
        # Independent per-row presign passes run concurrently; the list is
        # small (<=500, or the requested subset) and each pass is local S3
        # signing, so a gather here shortens picker latency to the slowest
        # row instead of the sum of rows.
        image_lists = [row.get("item_images") or [] for row in rows]
        await asyncio.gather(
            *(
                materialize_image_urls(images, owner_user_id=user_id)
                for images in image_lists
            )
        )
        for row, images in zip(rows, image_lists):
            primary = next((i for i in images if i.get("is_primary")), images[0] if images else None)
            items.append(
                {
                    "id": row["id"],
                    "name": row.get("name"),
                    "category": row.get("category"),
                    "colors": row.get("colors") or [],
                    "image_url": (primary or {}).get("thumbnail_url") or (primary or {}).get("image_url"),
                }
            )
        return {"data": items, "message": "OK"}
    except Exception as e:
        logger.error("Available items error", user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch available items", operation="select")


@router.get("/{outfit_id:uuid}", response_model=DataResponse[OutfitResponse])
async def get_outfit(
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        outfit = await outfit_service.fetch_outfit(
            db=db, user_id=user_id, outfit_id=outfit_id_str, include_items=True
        )
        if not outfit:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)
        # Private buckets: materialize fresh presigned URLs at read time.
        outfit = (await materialize_parent_images([outfit], owner_user_id=user_id))[0]
        return {"data": outfit, "message": "OK"}

    except OutfitNotFoundError:
        raise
    except Exception as e:
        logger.error("Get outfit error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch outfit", operation="select")


@router.get("/public/{outfit_id}", response_model=Dict[str, Any])
async def get_public_outfit(
    outfit_id: UUID,
    db: Client = Depends(get_db),
):
    """Public outfit view for share links (no auth).

    Only returns data when the outfit has an active shared_outfits row AND
    `is_public=true` on the outfit record. The share row is the source of
    truth: an outfit without one is not shared, even if is_public somehow
    got set (legacy/crash residue).
    """
    try:
        outfit_id_str = str(outfit_id)
        share_row = await outfit_service.fetch_latest_public_share(db, outfit_id=outfit_id_str)
        if not share_row:
            raise SharedOutfitNotFoundError(share_id=outfit_id_str)
        expires_at = parse_utc_datetime(share_row.get("expires_at"))
        if expires_at and expires_at < utcnow():
            raise SharedOutfitNotFoundError(share_id=outfit_id_str)

        outfit = await outfit_service.fetch_public_outfit_row(db, outfit_id=outfit_id_str)
        if not outfit:
            raise SharedOutfitNotFoundError(share_id=outfit_id_str)

        # Atomic view increment via the service-role RPC (migration 044).
        await outfit_service.increment_shared_outfit_views(db, share_id=share_row["id"])

        item_ids = outfit.get("item_ids") or []
        items_summary: List[Dict[str, Any]] = []
        if item_ids:
            items_summary = await outfit_service.fetch_item_summaries(db, item_ids=item_ids)
            # Anonymous share link: mint fresh presigned URLs for the item
            # thumbnails too (same treatment as the outfit images below), so
            # the mobile shared page's item gallery never serves expired
            # stored URLs. No owner_user_id -- this endpoint is public.
            if items_summary:
                await asyncio.gather(
                    *[
                        materialize_image_urls(item.get("item_images") or [], presigned=True)
                        for item in items_summary
                    ]
                )

        # Private buckets: materialize fresh short-lived presigned URLs at read
        # time so the share link never serves an expired stored URL. Forced
        # presigned (even in worker mode): this endpoint is anonymous -- a
        # share-link visitor or a social crawler cannot present the app's JWT
        # to the images Worker, so a stable Worker URL would 404 for them.
        await materialize_image_urls(outfit.get("outfit_images") or [], presigned=True)

        public = {
            "id": outfit.get("id"),
            "name": outfit.get("name"),
            "description": outfit.get("description"),
            "style": outfit.get("style"),
            "season": outfit.get("season"),
            "occasion": outfit.get("occasion"),
            "tags": outfit.get("tags") or [],
            "created_at": outfit.get("created_at"),
            "updated_at": outfit.get("updated_at"),
            "images": outfit.get("outfit_images") or [],
            "items": items_summary,
        }
        return {"data": public, "message": "OK"}

    except (NotFoundError, SharedOutfitNotFoundError):
        raise
    except Exception as e:
        logger.error("Get public outfit error", outfit_id=str(outfit_id), error=str(e))
        raise DatabaseError("Failed to fetch shared outfit", operation="select")


@router.put("/{outfit_id}", response_model=Dict[str, Any])
async def update_outfit(
    outfit_id: UUID,
    update: OutfitUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        existing = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id"
        )
        if not existing or not existing.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        update_dict = update.model_dump(exclude_unset=True)
        if "item_ids" in update_dict and update_dict["item_ids"] is not None:
            item_ids = [str(i) for i in update_dict["item_ids"]]
            found_ids = set(
                await outfit_service.fetch_owned_item_ids(db, user_id=user_id, item_ids=item_ids)
            )
            missing = [iid for iid in item_ids if iid not in found_ids]
            if missing:
                raise ValidationError(
                    "One or more items not found",
                    details={"missing_item_ids": missing}
                )
            update_dict["item_ids"] = item_ids

        update_dict["updated_at"] = _now()
        row = await outfit_service.update_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, update_dict=update_dict
        )
        if not row:
            raise DatabaseError("Failed to update outfit", operation="update")

        outfit = await outfit_service.fetch_outfit(db=db, user_id=user_id, outfit_id=outfit_id_str)
        if not outfit:
            raise DatabaseError("Failed to fetch updated outfit", operation="select")
        # Private buckets: materialize fresh presigned URLs at read time.
        outfit = (await materialize_parent_images([outfit], owner_user_id=user_id))[0]
        return {"data": outfit, "message": "Updated"}

    except (OutfitNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Update outfit error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to update outfit", operation="update")


@router.post("/{outfit_id}/share", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def share_outfit(
    outfit_id: UUID,
    request: ShareOutfitRequest,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Enable public sharing for an outfit and return a share URL.

    MVP: only `public` visibility is supported; anything else is rejected
    rather than persisted (the public route could never serve it).
    """
    try:
        outfit_id_str = str(outfit_id)
        existing = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id"
        )
        if not existing or not existing.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        # MVP: only public visibility is supported; reject anything else
        # instead of writing a row the public route can never serve.
        if request.visibility != "public":
            raise ValidationError(
                "Only 'public' visibility is supported",
                details={"visibility": request.visibility},
            )

        # A3-12: expires_at is a free-form ISO string that the RPC casts to
        # TIMESTAMP -- a malformed value would 500 with SQLSTATE 22P02 instead
        # of a clean 422. Validate (and normalize) it before the RPC.
        validated_expires_at: Optional[str] = None
        if request.expires_at:
            parsed_expires_at = parse_utc_datetime(request.expires_at)
            if parsed_expires_at is None:
                raise ValidationError(
                    "expires_at must be an ISO-8601 datetime",
                    details={"field": "expires_at", "value": request.expires_at},
                )
            validated_expires_at = parsed_expires_at.isoformat()

        share_url = f"{settings.FRONTEND_URL.rstrip('/')}/shared/outfits/{outfit_id_str}"

        # Atomic share via the service-role RPC (migration 045): outfits
        # is_public and the shared_outfits row are written in ONE transaction.
        share_row = await outfit_service.upsert_shared_outfit_rpc(
            db,
            outfit_id=outfit_id_str,
            user_id=user_id,
            visibility=request.visibility,
            expires_at=validated_expires_at,
            caption=request.custom_caption,
            allow_feedback=request.allow_feedback,
            share_url=share_url,
        )
        if not share_row:
            # Ownership and visibility were verified above; a zero-row return
            # means the outfit vanished between the check and the RPC.
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        return {
            "data": {
                "share_link": {
                    "url": share_url,
                    "qr_code_url": None,
                    "expires_at": share_row.get("expires_at"),
                    "views": share_row.get("view_count") or 0,
                }
            },
            "message": "Created",
        }
    except (OutfitNotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error("Share outfit error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to share outfit", operation="insert")


@router.delete("/{outfit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outfit(
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Delete an outfit and best-effort remove its images from storage."""
    try:
        await delete_outfit_service(db, user_id=user_id, outfit_id=str(outfit_id))
        return None
    except OutfitNotFoundError:
        raise
    except Exception as e:
        logger.error("Delete outfit error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to delete outfit", operation="delete")


# ============================================================================
# COLLECTIONS
# ============================================================================


@router.post("/collections", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_collection(
    request: OutfitCollectionCreate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        collection_id = str(uuid.uuid4())
        now = _now()
        insert = {
            "id": collection_id,
            "user_id": user_id,
            "name": request.name,
            "description": request.description,
            "is_favorite": request.is_favorite,
            "created_at": now,
            "updated_at": now,
        }
        row = await outfit_service.insert_collection_row(db, insert=insert)
        if not row:
            raise DatabaseError("Failed to create collection", operation="insert")

        outfit_ids = [str(i) for i in (request.outfit_ids or [])]
        if outfit_ids:
            await outfit_service.sync_collection_items(
                db, user_id=user_id, collection_id=collection_id, outfit_ids=outfit_ids
            )

        row["outfit_count"] = len(outfit_ids)
        row["outfit_ids"] = outfit_ids
        return {"data": row, "message": "Created"}
    except (ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Create collection error", user_id=user_id, error=str(e))
        raise DatabaseError("Failed to create collection", operation="insert")


@router.get("/collections", response_model=Dict[str, Any])
async def list_collections(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        rows = await outfit_service.list_collection_rows(db, user_id=user_id)
        collection_ids = [str(r.get("id")) for r in rows if r.get("id")]
        # Counts and member ids are derived from ONE member-row download; the
        # previous count query re-downloaded the same rows.
        counts: Dict[str, int] = {}
        members: Dict[str, List[str]] = {}
        if collection_ids:
            member_rows = await outfit_service.fetch_collection_member_rows(
                db, collection_ids=collection_ids
            )
            for member in member_rows:
                cid = str(member.get("collection_id") or "")
                if not cid:
                    continue
                counts[cid] = counts.get(cid, 0) + 1
                outfit_id = member.get("outfit_id")
                if outfit_id:
                    members.setdefault(cid, []).append(str(outfit_id))
        for row in rows:
            collection_id = str(row.get("id"))
            row["outfit_count"] = counts.get(collection_id, 0)
            row["outfit_ids"] = members.get(collection_id, [])
        return {"data": {"collections": rows}, "message": "OK"}
    except Exception as e:
        logger.error("List collections error", user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch collections", operation="select")


@router.put("/collections/{collection_id}", response_model=Dict[str, Any])
async def update_collection(
    collection_id: UUID,
    update: OutfitCollectionUpdate,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        collection_id_str = str(collection_id)
        await outfit_service.assert_owned_collection(
            db, collection_id=collection_id_str, user_id=user_id
        )

        update_dict = update.model_dump(exclude_unset=True)
        outfit_ids = update_dict.pop("outfit_ids", None)
        if update_dict:
            update_dict["updated_at"] = _now()
            await outfit_service.update_collection_row(
                db, collection_id=collection_id_str, update_dict=update_dict
            )

        if outfit_ids is not None:
            await outfit_service.sync_collection_items(
                db,
                user_id=user_id,
                collection_id=collection_id_str,
                outfit_ids=[str(i) for i in outfit_ids],
            )

        row = await outfit_service.fetch_collection_row(
            db, collection_id=collection_id_str, user_id=user_id
        )
        if not row:
            raise CollectionNotFoundError(collection_id=collection_id_str)

        row["outfit_count"] = await outfit_service.collection_count(
            db, collection_id=collection_id_str
        )
        row["outfit_ids"] = (
            [str(i) for i in outfit_ids]
            if outfit_ids is not None
            else await outfit_service.collection_member_ids(db, collection_id=collection_id_str)
        )
        return {"data": row, "message": "Updated"}
    except (CollectionNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Update collection error", collection_id=str(collection_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to update collection", operation="update")


@router.put("/collections/{collection_id}/outfits", response_model=Dict[str, Any])
async def replace_collection_outfits(
    collection_id: UUID,
    request: UpdateCollectionOutfitsRequest,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        collection_id_str = str(collection_id)
        await outfit_service.assert_owned_collection(
            db, collection_id=collection_id_str, user_id=user_id
        )

        await outfit_service.sync_collection_items(
            db,
            user_id=user_id,
            collection_id=collection_id_str,
            outfit_ids=[str(i) for i in (request.outfit_ids or [])],
        )

        row = await outfit_service.fetch_collection_row(
            db, collection_id=collection_id_str, user_id=user_id
        )
        if not row:
            raise CollectionNotFoundError(collection_id=collection_id_str)
        row["outfit_count"] = await outfit_service.collection_count(
            db, collection_id=collection_id_str
        )
        row["outfit_ids"] = await outfit_service.collection_member_ids(
            db, collection_id=collection_id_str
        )
        return {"data": row, "message": "Updated"}
    except (CollectionNotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error("Replace collection outfits error", collection_id=str(collection_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to update collection outfits", operation="update")


@router.post("/collections/{collection_id}/outfits", response_model=Dict[str, Any])
async def add_collection_outfit(
    collection_id: UUID,
    request: AddCollectionOutfitRequest,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Add one owned outfit to a collection without replacing existing members."""
    collection_id_str = str(collection_id)
    try:
        await outfit_service.assert_owned_collection(
            db, collection_id=collection_id_str, user_id=user_id
        )

        outfit = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=request.outfit_id, user_id=user_id, columns="id"
        )
        if not outfit or not outfit.data:
            raise ValidationError("Outfit not found", details={"outfit_id": request.outfit_id})

        membership = await outfit_service.fetch_collection_membership(
            db, collection_id=collection_id_str, outfit_id=request.outfit_id
        )
        if not membership or not membership.data:
            # Upsert (not insert): two concurrent add/retry requests can both
            # pass the membership read above; the upsert is idempotent.
            await outfit_service.add_collection_membership(
                db, collection_id=collection_id_str, outfit_id=request.outfit_id
            )

        count = await outfit_service.collection_count(db, collection_id=collection_id_str)
        return {
            "data": {
                "collection_id": collection_id_str,
                "outfit_id": request.outfit_id,
                "outfit_count": count,
            },
            "message": "Added",
        }
    except (CollectionNotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error("Add collection outfit error", collection_id=collection_id_str, user_id=user_id, error=str(e))
        raise DatabaseError("Failed to add outfit to collection", operation="insert")


@router.delete("/collections/{collection_id}/outfits/{outfit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collection_outfit(
    collection_id: UUID,
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Remove one outfit from an owned collection."""
    collection_id_str = str(collection_id)
    outfit_id_str = str(outfit_id)
    try:
        await outfit_service.assert_owned_collection(
            db, collection_id=collection_id_str, user_id=user_id
        )

        await outfit_service.delete_collection_membership(
            db, collection_id=collection_id_str, outfit_id=outfit_id_str
        )
        return None
    except CollectionNotFoundError:
        raise
    except Exception as e:
        logger.error("Remove collection outfit error", collection_id=collection_id_str, user_id=user_id, error=str(e))
        raise DatabaseError("Failed to remove outfit from collection", operation="delete")


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        collection_id_str = str(collection_id)
        await outfit_service.assert_owned_collection(
            db, collection_id=collection_id_str, user_id=user_id
        )

        await outfit_service.delete_collection_row(
            db, collection_id=collection_id_str, user_id=user_id
        )
        return None
    except CollectionNotFoundError:
        raise
    except Exception as e:
        logger.error("Delete collection error", collection_id=str(collection_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to delete collection", operation="delete")


# ============================================================================
# EXTRA ACTIONS (favorite, wear, duplicate, composition)
# ============================================================================


@router.post("/{outfit_id}/favorite", response_model=Dict[str, Any])
async def toggle_favorite(
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        existing = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="is_favorite"
        )
        if not existing or not existing.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        # Atomic toggle via the service-role RPC (migration 044).
        await outfit_service.toggle_outfit_favorite_rpc(
            db, outfit_id=outfit_id_str, user_id=user_id
        )

        # The RPC owns the flip; re-read so the response reflects the new
        # value instead of guessing (two concurrent toggles = one flip).
        refreshed = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="is_favorite"
        )
        new_value = bool((refreshed.data or {}).get("is_favorite", False)) if refreshed else False
        return {"data": {"id": outfit_id_str, "is_favorite": new_value}, "message": "OK"}
    except OutfitNotFoundError:
        raise
    except Exception as e:
        logger.error("Toggle outfit favorite error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to toggle favorite", operation="update")


@router.post("/{outfit_id}/wear", response_model=Dict[str, Any])
async def mark_worn(
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        # The service serializes per outfit so concurrent /wear calls cannot
        # both read N and write N+1 (see outfit_service._wear_lock).
        result = await outfit_service.record_outfit_wear(
            db, user_id=user_id, outfit_id=outfit_id_str
        )
        return {
            "data": {
                "id": outfit_id_str,
                "worn_count": result["worn_count"],
                "last_worn_at": result["last_worn_at"],
            },
            "message": "OK",
        }
    except OutfitNotFoundError:
        raise
    except Exception as e:
        logger.error("Mark outfit worn error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to update wear count", operation="update")


@router.get("/{outfit_id}/wear-history", response_model=Dict[str, Any])
async def get_wear_history(
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Get wear history for an outfit."""
    try:
        outfit_id_str = str(outfit_id)

        # Verify outfit exists and belongs to user
        outfit = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id"
        )
        if not outfit or not outfit.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        wear_history = await outfit_service.list_wear_history(db, outfit_id=outfit_id_str)

        return {
            "data": {
                "wear_history": wear_history
            },
            "message": "OK"
        }
    except OutfitNotFoundError:
        raise
    except Exception as e:
        logger.error("Get wear history error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch wear history", operation="select")


@router.post("/{outfit_id}/duplicate", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def duplicate_outfit(
    outfit_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        existing = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="*"
        )
        if not existing or not existing.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        row = await outfit_service.insert_outfit_copy(
            db, source=existing.data, user_id=user_id
        )
        if not row:
            raise DatabaseError("Failed to duplicate outfit", operation="insert")
        row["images"] = []
        return {"data": row, "message": "Created"}
    except (OutfitNotFoundError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Duplicate outfit error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to duplicate outfit", operation="insert")


@router.post("/{outfit_id}/items", response_model=Dict[str, Any])
async def add_item_to_outfit(
    outfit_id: UUID,
    request: AddItemToOutfitRequest,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        outfit = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id,item_ids"
        )
        if not outfit or not outfit.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        item_id = request.item_id
        item = await outfit_service.fetch_owned_item_row(db, item_id=item_id, user_id=user_id)
        if not item or not item.data:
            raise ItemNotFoundError(item_id=item_id)

        item_ids = list(outfit.data.get("item_ids") or [])
        if item_id in item_ids:
            current = await outfit_service.fetch_outfit(
                db=db, user_id=user_id, outfit_id=outfit_id_str
            )
            if current:
                # Private buckets: materialize fresh presigned URLs at read time.
                current = (await materialize_parent_images([current], owner_user_id=user_id))[0]
            return {"data": current or {"id": outfit_id_str, "item_ids": item_ids, "images": []}, "message": "OK"}

        # Atomic append via the service-role RPC (migration 044).
        await outfit_service.add_outfit_item_rpc(
            db, outfit_id=outfit_id_str, item_id=item_id, user_id=user_id
        )

        updated = await outfit_service.fetch_outfit(db=db, user_id=user_id, outfit_id=outfit_id_str)
        if not updated:
            raise DatabaseError("Failed to fetch updated outfit", operation="select")
        # Private buckets: materialize fresh presigned URLs at read time.
        updated = (await materialize_parent_images([updated], owner_user_id=user_id))[0]
        return {"data": updated, "message": "Updated"}
    except (OutfitNotFoundError, ItemNotFoundError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Add item to outfit error", outfit_id=str(outfit_id), item_id=request.item_id, user_id=user_id, error=str(e))
        raise DatabaseError("Failed to add item to outfit", operation="update")


@router.delete("/{outfit_id}/items/{item_id}", response_model=Dict[str, Any])
async def remove_item_from_outfit(
    outfit_id: UUID,
    item_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        outfit_id_str = str(outfit_id)
        item_id_str = str(item_id)
        outfit = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id,item_ids"
        )
        if not outfit or not outfit.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        item_ids = [str(i) for i in (outfit.data.get("item_ids") or [])]
        if item_id_str not in item_ids:
            current = await outfit_service.fetch_outfit(
                db=db, user_id=user_id, outfit_id=outfit_id_str
            )
            if current:
                # Private buckets: materialize fresh presigned URLs at read time.
                current = (await materialize_parent_images([current], owner_user_id=user_id))[0]
            return {"data": current or {"id": outfit_id_str, "item_ids": item_ids, "images": []}, "message": "OK"}

        new_item_ids = [i for i in item_ids if i != item_id_str]
        if not new_item_ids:
            raise ValidationError(
                "Outfit must contain at least one item",
                details={"outfit_id": outfit_id_str}
            )

        # Atomic removal via the service-role RPC (migration 044). The RPC
        # enforces the >=1-member rule UNDER the row lock and returns an
        # integer status: 0 = missing/unowned, 1 = removed, 2 = would leave
        # the outfit empty. The unlocked pre-check above is only a fast path.
        remove_status = await outfit_service.remove_outfit_item_rpc(
            db, outfit_id=outfit_id_str, item_id=item_id_str, user_id=user_id
        )
        if remove_status == 2:
            raise ValidationError(
                "Outfit must contain at least one item",
                details={"outfit_id": outfit_id_str}
            )

        updated = await outfit_service.fetch_outfit(db=db, user_id=user_id, outfit_id=outfit_id_str)
        if not updated:
            raise DatabaseError("Failed to fetch updated outfit", operation="select")
        # Private buckets: materialize fresh presigned URLs at read time.
        updated = (await materialize_parent_images([updated], owner_user_id=user_id))[0]
        return {"data": updated, "message": "Updated"}
    except (OutfitNotFoundError, ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error("Remove item from outfit error", outfit_id=str(outfit_id), item_id=str(item_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to remove item from outfit", operation="update")


# ============================================================================
# GENERATION TRACKING (client-side AI)
# ============================================================================


@router.post("/{outfit_id}/generate", response_model=Dict[str, Any], status_code=status.HTTP_202_ACCEPTED)
async def start_generation(
    outfit_id: UUID,
    request: GenerationRequest,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Create a generation record and return a generation_id.

    The frontend performs generation via the backend AI service and then uploads the
    resulting image(s) to `/outfits/{outfit_id}/images` including the returned
    generation_id to mark completion.
    """
    try:
        outfit_id_str = str(outfit_id)
        outfit = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id"
        )
        if not outfit or not outfit.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        generation_id = str(uuid.uuid4())
        now = _now()

        insert = {
            "id": generation_id,
            "user_id": user_id,
            "outfit_id": outfit_id_str,
            "status": GenerationStatus.PROCESSING.value,
            "progress": 0,
            "pose": request.pose,
            "lighting": request.lighting,
            "body_profile_id": str(request.body_profile_id) if request.body_profile_id else None,
            "variations": request.variations,
            "image_urls": [],
            "error": None,
            "created_at": now,
            "started_at": now,
            "completed_at": None,
        }
        await outfit_service.insert_generation_row(db, insert=insert)

        return {
            "data": {"generation_id": generation_id, "status": "processing", "estimated_time": 30},
            "message": "Accepted",
        }
    except OutfitNotFoundError:
        raise
    except Exception as e:
        logger.error("Start generation error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to start generation", operation="insert")


@router.get("/generation/{generation_id}", response_model=Dict[str, Any])
async def get_generation_status(
    generation_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        generation_id_str = str(generation_id)
        row = await outfit_service.fetch_generation_row(
            db, generation_id=generation_id_str, user_id=user_id
        )
        if not row:
            raise NotFoundError(
                "Generation not found",
                resource_type="generation",
                resource_id=generation_id_str
            )

        return {
            "data": {
                "status": row.get("status"),
                "progress": row.get("progress"),
                "images": row.get("image_urls") or [],
                "error": row.get("error"),
            },
            "message": "OK",
        }
    except NotFoundError:
        raise
    except Exception as e:
        logger.error("Get generation status error", generation_id=str(generation_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch generation status", operation="select")


# ============================================================================
# OUTFIT IMAGES
# ============================================================================


@router.post("/{outfit_id}/images", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def upload_outfit_image(
    outfit_id: UUID,
    file: UploadFile = File(...),
    pose: str = Form("front", max_length=20),
    lighting: Optional[str] = Form(None, max_length=50),
    body_profile_id: Optional[str] = Form(None),
    generation_id: Optional[str] = Form(None),
    is_primary: bool = Form(True),
    client_request_id: Optional[str] = Form(None, max_length=64),
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Upload an outfit image and create an outfit_images record."""
    try:
        # Form(max_length=20) already 422s this through FastAPI; the explicit
        # check keeps the direct-call path honest too (the DB column is
        # VARCHAR(20), migration 001 -- an overlong pose would 500 with 22001).
        # The isinstance guard skips the raw Form(...) default that direct
        # calls receive (FastAPI resolves it to a real string at request time).
        if isinstance(pose, str) and len(pose) > 20:
            raise ValidationError("pose must be at most 20 characters")

        # The DB column is UUID: a non-UUID string would 500 with 22P02.
        # Parse here (422 on garbage) and verify the profile belongs to the
        # caller before the row is written.
        body_profile_id_value: Optional[str] = None
        if isinstance(body_profile_id, str) and body_profile_id:
            try:
                parsed_profile_id = uuid.UUID(body_profile_id)
            except (ValueError, AttributeError, TypeError):
                raise ValidationError("body_profile_id must be a valid UUID")
            profile = await outfit_service.fetch_owned_body_profile(
                db, profile_id=str(parsed_profile_id), user_id=user_id
            )
            if not profile or not profile.data:
                raise ValidationError("body_profile_id does not belong to the current user")
            body_profile_id_value = str(parsed_profile_id)

        outfit_id_str = str(outfit_id)
        outfit = await outfit_service.fetch_owned_outfit_row(
            db, outfit_id=outfit_id_str, user_id=user_id, columns="id"
        )
        if not outfit or not outfit.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        # F1-07: client idempotency. A repeated client_request_id replays the
        # original row instead of inserting a duplicate image and storage
        # object. The generation-complete update is re-issued too (idempotent,
        # scoped) so a generation never stays stuck in `processing`.
        if client_request_id:
            existing = await outfit_service.find_outfit_image_by_client_request_id(
                db, outfit_id_str, client_request_id
            )
            if existing:
                logger.info(
                    "Upload outfit image replay via client_request_id",
                    user_id=user_id,
                    outfit_id=outfit_id_str,
                    image_id=existing["id"],
                )
                if generation_id:
                    await outfit_service.mark_generation_completed(
                        db,
                        generation_id=generation_id,
                        user_id=user_id,
                        outfit_id=outfit_id_str,
                        image_url=existing["image_url"],
                        completed_at=_now(),
                    )
                return {"data": existing, "message": "Created"}

        if not file.content_type or not file.content_type.startswith("image/"):
            raise UnsupportedMediaTypeError()

        file_bytes = await read_upload_capped(file, MAX_FILE_SIZE)
        upload = await StorageService.upload_outfit_image(
            db=db,
            user_id=user_id,
            filename=file.filename or "outfit.png",
            file_data=file_bytes,
            generation_type="ai",
        )

        now = _now()
        img_row = {
            "id": str(uuid.uuid4()),
            "outfit_id": outfit_id_str,
            "image_url": upload.get("image_url"),
            "thumbnail_url": upload.get("thumbnail_url"),
            "storage_path": upload.get("storage_path"),
            "pose": pose,
            "lighting": lighting,
            "body_profile_id": body_profile_id_value,
            "generation_type": upload.get("generation_type") or "ai",
            "is_primary": bool(is_primary),
            "width": upload.get("width"),
            "height": upload.get("height"),
            "generation_metadata": upload.get("metadata"),
            "client_request_id": client_request_id,
            "created_at": now,
        }

        # Persist the row and primary flag (see outfit_service.save_outfit_image).
        # ``collapsed`` is True when a concurrent same-key upload won the race;
        # the winner row is returned and the generation update is skipped.
        result_row, collapsed = await outfit_service.save_outfit_image(
            db,
            outfit_id=outfit_id_str,
            user_id=user_id,
            img_row=img_row,
            is_primary=bool(is_primary),
            client_request_id=client_request_id,
        )
        if collapsed:
            return {"data": result_row, "message": "Created"}

        # Mark generation complete if provided. The update is scoped by the
        # outfit as well as the id/user (see outfit_service.mark_generation_completed).
        if generation_id:
            await outfit_service.mark_generation_completed(
                db,
                generation_id=generation_id,
                user_id=user_id,
                outfit_id=outfit_id_str,
                image_url=result_row["image_url"],
                completed_at=now,
            )

        return {"data": result_row, "message": "Created"}

    except (OutfitNotFoundError, UnsupportedMediaTypeError, ValidationError):
        raise
    except Exception as e:
        logger.error("Upload outfit image error", outfit_id=str(outfit_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to upload outfit image", operation="insert")


@router.delete("/{outfit_id}/images/{image_id}", response_model=Dict[str, Any])
async def delete_outfit_image(
    outfit_id: UUID,
    image_id: UUID,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Delete an outfit image and best-effort remove it from storage."""
    try:
        outfit_id_str = str(outfit_id)
        image_id_str = str(image_id)

        outfit = await outfit_service.fetch_owned_outfit_row(
            db,
            outfit_id=outfit_id_str,
            user_id=user_id,
            columns="id",
            operation="delete_outfit_image.load_outfit",
        )
        if not outfit or not outfit.data:
            raise OutfitNotFoundError(outfit_id=outfit_id_str)

        img = await outfit_service.fetch_outfit_image_for_delete(
            db, outfit_id=outfit_id_str, image_id=image_id_str
        )
        if not img or not img.data:
            raise ImageNotFoundError(image_id=image_id_str)

        storage_path = img.data.get("storage_path")
        if storage_path:
            try:
                await StorageService.delete_image(db=db, storage_path=storage_path)
            except Exception as e:
                logger.warning("Failed to delete outfit image from storage", storage_path=storage_path, error=str(e))

        # Idempotent delete (see delete_outfit): heal a dead pooled
        # Supabase connection with one rebuild + retry instead of a 500.
        await outfit_service.delete_outfit_image_row(
            db, outfit_id=outfit_id_str, image_id=image_id_str
        )
        return {"data": {"deleted": True}, "message": "OK"}
    except (OutfitNotFoundError, ImageNotFoundError):
        raise
    except Exception as e:
        logger.error("Delete outfit image error", outfit_id=str(outfit_id), image_id=str(image_id), user_id=user_id, error=str(e))
        raise DatabaseError("Failed to delete outfit image", operation="delete")


@router.get("/stats", response_model=Dict[str, Any])
async def get_outfit_stats(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Compute outfit statistics for analytics/dashboard."""
    try:
        outfits = await outfit_service.list_outfit_stat_rows(db, user_id=user_id)

        total_outfits = len(outfits)
        outfits_by_style: Dict[str, int] = {}
        outfits_by_season: Dict[str, int] = {}
        for o in outfits:
            st = (o.get("style") or "other").lower()
            outfits_by_style[st] = outfits_by_style.get(st, 0) + 1
            se = (o.get("season") or "unknown").lower()
            outfits_by_season[se] = outfits_by_season.get(se, 0) + 1

        most_worn = sorted(outfits, key=lambda o: int(o.get("worn_count") or 0), reverse=True)[:5]
        recent = sorted(outfits, key=lambda o: o.get("created_at") or "", reverse=True)[:5]

        return {
            "data": {
                "total_outfits": total_outfits,
                "outfits_by_style": outfits_by_style,
                "outfits_by_season": outfits_by_season,
                "most_worn_outfits": [
                    {"id": o["id"], "name": o.get("name"), "times_worn": int(o.get("worn_count") or 0)}
                    for o in most_worn
                ],
                "recent_outfits": [{"id": o["id"], "name": o.get("name"), "created_at": o.get("created_at")} for o in recent],
            },
            "message": "OK",
        }
    except Exception as e:
        logger.error("Outfit stats error", user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch outfit stats", operation="select")


@router.post("/batch-delete", response_model=Dict[str, Any])
async def batch_delete_outfits(
    request: BatchDeleteOutfitsRequest,
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Batch delete outfits and best-effort remove their images from storage."""
    outfit_ids = list(dict.fromkeys([i for i in request.outfit_ids if i]))
    if not outfit_ids:
        raise ValidationError("outfit_ids is required", details={"field": "outfit_ids"})

    try:
        # Resolve owned parent rows before reading child image paths. This API
        # uses the service-role client, so the child query must not trust
        # outfit_id alone for authorization.
        owned = await StorageService.resolve_owned_storage_paths(
            db, user_id, outfit_ids=outfit_ids
        )
        storage_paths = owned["storage_paths"]
        if storage_paths:
            try:
                await StorageService.delete_multiple_images(db=db, storage_paths=storage_paths)
            except Exception as e:
                # object_count, not image_count: storage_paths includes the
                # derived _thumb siblings, so this is ~2x the image count.
                logger.warning("Failed to delete outfit images from storage", object_count=len(storage_paths), error=str(e))

        deleted_rows = await outfit_service.delete_outfits_by_ids(
            db, user_id=user_id, outfit_ids=outfit_ids
        )
        deleted_count = len(deleted_rows)
        return {"data": {"deleted_count": deleted_count}, "message": "OK"}
    except ValidationError:
        raise
    except Exception as e:
        logger.error("Batch delete outfits error", user_id=user_id, outfit_count=len(outfit_ids), error=str(e))
        raise DatabaseError("Failed to batch delete outfits", operation="delete")


@router.get("/recently-worn", response_model=Dict[str, Any])
async def recently_worn(
    limit: int = Query(5, ge=1, le=20),
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        rows = await outfit_service.list_recently_worn_outfit_rows(
            db, user_id=user_id, limit=limit
        )
        outfits = [_normalize_outfit_images(o) for o in rows]
        # Private buckets: materialize fresh presigned URLs at read time.
        outfits = await materialize_parent_images(outfits, owner_user_id=user_id)
        return {"data": {"outfits": outfits}, "message": "OK"}
    except Exception as e:
        logger.error("Recently worn outfits error", user_id=user_id, limit=limit, error=str(e))
        raise DatabaseError("Failed to fetch recently worn outfits", operation="select")


@router.get("/favorites", response_model=Dict[str, Any])
async def favorites(
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    try:
        rows = await outfit_service.list_favorite_outfit_rows(db, user_id=user_id)
        outfits = [_normalize_outfit_images(o) for o in rows]
        # Private buckets: materialize fresh presigned URLs at read time.
        outfits = await materialize_parent_images(outfits, owner_user_id=user_id)
        return {"data": {"outfits": outfits}, "message": "OK"}
    except Exception as e:
        logger.error("Favorite outfits error", user_id=user_id, error=str(e))
        raise DatabaseError("Failed to fetch favorite outfits", operation="select")


@router.get("/suggestions/weather", response_model=Dict[str, Any])
async def weather_suggestions(
    temperature: float = Query(..., description="Current temperature in Celsius"),
    weather_condition: Optional[str] = Query(None),
    user_id: str = Depends(get_active_user_id),
    db: Client = Depends(get_db),
):
    """Return simple outfit suggestions based on temperature and seasonal tags."""
    try:
        season = "all-season"
        if temperature < 5:
            season = "winter"
        elif temperature > 25:
            season = "summer"

        rows = await outfit_service.list_recent_outfit_rows(db, user_id=user_id, limit=50)
        outfits = [_normalize_outfit_images(o) for o in rows]
        # Private buckets: materialize fresh presigned URLs at read time.
        outfits = await materialize_parent_images(outfits, owner_user_id=user_id)

        tagged = [
            o
            for o in outfits
            if season in (o.get("tags") or []) or season == (o.get("season") or "").lower()
        ]
        selected = (tagged or outfits)[:3]

        reasoning = f"Suggested based on {temperature}°C and season '{season}'."
        if weather_condition:
            reasoning += f" Condition: {weather_condition}."

        return {
            "data": {"suggestions": {"items": [], "outfits": selected, "reasoning": reasoning}},
            "message": "OK",
        }
    except Exception as e:
        logger.error("Weather outfit suggestions error", user_id=user_id, temperature=temperature, weather_condition=weather_condition, error=str(e))
        raise DatabaseError("Failed to fetch weather suggestions", operation="select")
