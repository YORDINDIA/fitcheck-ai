"""
Blog API endpoints for FitCheck AI.

Provides CRUD operations for blog posts with public read access
and admin-only write access.
"""

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request, Response, status
from supabase import Client

from app.api.v1.deps import get_db, require_permission
from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.core.logging_config import get_context_logger
from app.models.blog import (
    BlogPost,
    BlogPostCreate,
    BlogPostListParams,
    BlogPostListResponse,
    BlogPostSummary,
    BlogPostUpdate,
)
from app.services import blog_service
from app.services.audit_service import record_audit
from app.utils import maybe_single_data
from app.utils.db import safe_search_term

logger = get_context_logger(__name__)

router = APIRouter()


# =============================================================================
# ADMIN VERIFICATION
# =============================================================================


def verify_admin(user: Dict[str, Any]) -> None:
    """
    Verify that the user has admin privileges.

    Thin wrapper over the shared RBAC gate (app.core.permissions.get_user_role):
    an explicit admin ``role`` wins; otherwise the legacy ``is_admin`` flag
    grants admin (the email-domain bootstrap was removed 2026-08-08).

    Legacy: admin CRUD routes now use the fine-grained
    ``require_permission("content.read"/"content.write")`` dependency (A8-02);
    this helper remains for the direct-call tests and as the coarse gate.
    """
    from app.core.permissions import ADMIN_ROLES, get_user_role

    if get_user_role(user) not in ADMIN_ROLES:
        logger.warning(f"Non-admin user {user.get('id')} attempted admin operation")
        raise PermissionDeniedError("Admin access required for this operation")


def _require_content_permission(user: Dict[str, Any], permission: str) -> None:
    """Fine-grained gate used inside the handlers (A8-02).

    The router-level ``Depends(require_permission(...))`` enforces this at
    request time; the in-handler check keeps direct calls (and tests) honest
    and mirrors the old ``verify_admin`` placement.
    """
    from app.core.permissions import has_permission

    if not has_permission(user, permission):
        logger.warning(
            f"User {user.get('id')} attempted blog operation without permission {permission}"
        )
        raise PermissionDeniedError(f"Permission required: {permission}")


def _audit_context(http_request: Optional[Request]) -> Dict[str, Any]:
    if http_request is None:
        return {"ip": None, "user_agent": None}
    return {
        "ip": http_request.client.host if http_request.client else None,
        "user_agent": http_request.headers.get("user-agent"),
    }


# =============================================================================
# PUBLIC ENDPOINTS
# =============================================================================

# Public blog content is static between deploys; let the browser serve it
# without a round trip for a few minutes. The client refetches on mount anyway
# (baked prerender data is stamped stale), so max-age only helps cold loads —
# the 2026-08-07 PSI measured this endpoint at 3.4 s on the mobile critical
# path.
#
# `private` is REQUIRED, not a taste choice: these responses cross origins, so
# CORSMiddleware stamps each one with an Access-Control-Allow-Origin for the
# caller. A shared cache that ignores `Vary: Origin` (Railway's hikari edge,
# observed 2026-08-29) bakes that header into its URL-keyed entry — an entry
# populated by a no-Origin crawler/monitor is then served to browsers with NO
# allow-origin header ("No 'Access-Control-Allow-Origin'" + net::ERR_FAILED
# 200), and one populated by apex poisons www and vice versa. `private` keeps
# the per-browser cold-load win while forcing shared caches to skip.
BLOG_CACHE_CONTROL = "private, max-age=300, stale-while-revalidate=600"


@router.get("/posts", response_model=Dict[str, Any])
async def list_posts(
    params: BlogPostListParams = Depends(),
    db: Client = Depends(get_db),
    response: Response = None,
):
    """
    List all published blog posts with pagination.

    Returns paginated list of blog post summaries.
    Supports filtering by category and searching by title/excerpt.
    """
    try:
        # Sanitize the search term only when the search filter applies. The
        # term is interpolated into postgrest's .or_() filter syntax; sanitize
        # it exactly like the admin path (A4-20) so a crafted query cannot
        # inject extra filter clauses or 500 the route.
        search_term = None
        if params.search:
            safe_term = safe_search_term(params.search)
            search_term = f"%{safe_term}%"

        # Apply pagination and execute ONCE: PostgREST returns the exact count
        # of the full filtered set alongside the page, so the previous
        # count-then-page pattern (two Supabase round trips) is halved. This
        # endpoint sat on the blog's mobile critical path (3.4 s in the
        # 2026-08-07 PSI run), so the round trip matters.
        offset = (params.page - 1) * params.page_size
        result = await blog_service.fetch_published_posts_page(
            db, params.category, search_term, offset, params.page_size
        )
        total = result.count if hasattr(result, "count") else 0

        # Convert to response models
        posts = [BlogPostSummary(**post) for post in (result.data or [])]

        # Calculate pagination metadata
        total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 1

        response_data = BlogPostListResponse(
            posts=posts,
            total=total,
            page=params.page,
            page_size=params.page_size,
            total_pages=total_pages,
            has_next=params.page < total_pages,
            has_prev=params.page > 1,
        )

        # Success path only: error responses must never inherit a cacheable
        # header (a cached 404 would linger for max-age after a post is
        # published).
        response.headers["Cache-Control"] = BLOG_CACHE_CONTROL
        return {
            "data": response_data.model_dump(mode="json"),
            "message": "OK",
        }

    except Exception as e:
        logger.error(f"Error listing blog posts: {e}")
        raise


@router.get("/posts/{slug}", response_model=Dict[str, Any])
async def get_post(
    slug: str,
    db: Client = Depends(get_db),
    response: Response = None,
):
    """
    Get a single blog post by slug.

    Returns the full blog post including content.
    Only returns published posts for public access.
    """
    try:
        result = await blog_service.fetch_published_post_by_slug(db, slug)

        if not result or not result.data:
            raise NotFoundError(
                message=f"Blog post '{slug}' not found",
                resource_type="blog_post",
                resource_id=slug,
            )

        post = BlogPost(**result.data)

        # Success path only — a NotFound 404 must not carry the cache header
        # (see list_posts).
        response.headers["Cache-Control"] = BLOG_CACHE_CONTROL
        return {
            "data": post.model_dump(mode="json"),
            "message": "OK",
        }

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error fetching blog post {slug}: {e}")
        raise


@router.get("/categories", response_model=Dict[str, Any])
async def get_categories(
    db: Client = Depends(get_db),
    response: Response = None,
):
    """
    Get all unique categories from published blog posts.

    Returns a sorted list of category names.
    """
    try:
        # Get distinct categories from published posts
        result = await blog_service.fetch_published_categories(db)

        categories = sorted(list(set(row["category"] for row in (result.data or []))))

        # Success path only (see list_posts).
        response.headers["Cache-Control"] = BLOG_CACHE_CONTROL
        return {
            "data": {"categories": categories},
            "message": "OK",
        }

    except Exception as e:
        logger.error(f"Error fetching blog categories: {e}")
        raise


# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================


@router.post("/posts", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_post(
    post_data: BlogPostCreate,
    http_request: Request = None,
    user=Depends(require_permission("content.write")),
    db: Client = Depends(get_db),
):
    """
    Create a new blog post.

    **Content editors and admins only** (``content.write``, A8-02).
    Creates a new blog post with the provided data. Slug must be unique.
    Audited as ``blog.created``.
    """
    _require_content_permission(user, "content.write")

    try:
        # Check for duplicate slug
        existing = await blog_service.fetch_slug_taken_for_create(db, post_data)

        if maybe_single_data(existing):
            raise ValidationError(
                message=f"A post with slug '{post_data.slug}' already exists",
                details={"field": "slug", "value": post_data.slug},
            )

        # Insert the new post
        insert_data = post_data.model_dump()
        result = await blog_service.insert_post_row(db, insert_data)

        if not result.data:
            raise Exception("Failed to create blog post")

        created_post = BlogPost(**result.data[0])

        logger.info(f"Admin {user.get('id')} created blog post: {post_data.slug}")
        await record_audit(
            db,
            actor_id=user.get("id"),
            action="blog.created",
            entity_type="blog_post",
            entity_id=str(created_post.id or created_post.slug),
            payload={"slug": created_post.slug},
            **_audit_context(http_request),
        )

        return {
            "data": created_post.model_dump(mode="json"),
            "message": "Blog post created successfully",
        }

    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error creating blog post: {e}")
        raise


@router.put("/posts/{slug}", response_model=Dict[str, Any])
async def update_post(
    slug: str,
    post_data: BlogPostUpdate,
    http_request: Request = None,
    user=Depends(require_permission("content.write")),
    db: Client = Depends(get_db),
):
    """
    Update an existing blog post.

    **Content editors and admins only** (``content.write``, A8-02).
    Updates the blog post identified by slug.
    If slug is being changed, the new slug must be unique.
    Audited as ``blog.updated``.
    """
    _require_content_permission(user, "content.write")

    try:
        # Check if post exists
        existing = await blog_service.fetch_post_row_for_update(db, slug)

        if not maybe_single_data(existing):
            raise NotFoundError(
                message=f"Blog post '{slug}' not found",
                resource_type="blog_post",
                resource_id=slug,
            )

        # If changing slug, check new slug is unique
        if post_data.slug and post_data.slug != slug:
            slug_check = await blog_service.fetch_slug_taken_for_update(db, post_data)

            if maybe_single_data(slug_check):
                raise ValidationError(
                    message=f"A post with slug '{post_data.slug}' already exists",
                    details={"field": "slug", "value": post_data.slug},
                )

        # Build update data - only fields the client actually sent, so a PATCH
        # that omits a field doesn't get conflated with explicitly clearing it.
        update_data = post_data.model_dump(exclude_unset=True)

        if not update_data:
            raise ValidationError(
                message="No fields provided for update",
                details={"fields": "At least one field must be provided"},
            )

        # Update the post
        result = await blog_service.update_post_row(db, slug, update_data)

        if not result.data:
            raise Exception("Failed to update blog post")

        updated_post = BlogPost(**result.data[0])

        logger.info(f"Admin {user.get('id')} updated blog post: {slug}")
        await record_audit(
            db,
            actor_id=user.get("id"),
            action="blog.updated",
            entity_type="blog_post",
            entity_id=str(updated_post.id or updated_post.slug),
            payload={"slug": updated_post.slug, "updated_fields": list(update_data.keys())},
            **_audit_context(http_request),
        )

        return {
            "data": updated_post.model_dump(mode="json"),
            "message": "Blog post updated successfully",
        }

    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating blog post {slug}: {e}")
        raise


@router.delete("/posts/{slug}", response_model=Dict[str, Any])
async def delete_post(
    slug: str,
    http_request: Request = None,
    user=Depends(require_permission("content.write")),
    db: Client = Depends(get_db),
):
    """
    Delete a blog post.

    **Content editors and admins only** (``content.write``, A8-02).
    Permanently deletes the blog post identified by slug.
    This action cannot be undone. Audited as ``blog.deleted``.
    """
    _require_content_permission(user, "content.write")

    try:
        # Check if post exists
        existing = await blog_service.fetch_post_id_for_delete(db, slug)

        if not maybe_single_data(existing):
            raise NotFoundError(
                message=f"Blog post '{slug}' not found",
                resource_type="blog_post",
                resource_id=slug,
            )
        existing_row = maybe_single_data(existing)

        # Delete the post
        await blog_service.delete_post_row(db, slug)

        logger.info(f"Admin {user.get('id')} deleted blog post: {slug}")
        await record_audit(
            db,
            actor_id=user.get("id"),
            action="blog.deleted",
            entity_type="blog_post",
            entity_id=str(existing_row.get("id") or slug),
            payload={"slug": slug},
            **_audit_context(http_request),
        )

        return {
            "data": {"slug": slug, "deleted": True},
            "message": "Blog post deleted successfully",
        }

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting blog post {slug}: {e}")
        raise


# =============================================================================
# ADMIN LIST ENDPOINT (includes unpublished posts)
# =============================================================================


@router.get("/admin/posts", response_model=Dict[str, Any])
async def list_all_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    include_unpublished: bool = Query(True),
    category: str | None = Query(None, min_length=1),
    search: str | None = Query(None, min_length=1),
    post_status: Literal["published", "draft", "all"] | None = Query(None, alias="status"),
    user=Depends(require_permission("content.read")),
    db: Client = Depends(get_db),
):
    """
    List all blog posts including unpublished ones.

    **Content readers and admins only** (``content.read``, A8-02).
    Returns all blog posts with pagination.
    Useful for content management.
    """
    _require_content_permission(user, "content.read")

    try:
        # Sanitize the search term only when the search filter applies. The
        # term is interpolated into postgrest's .or_() filter syntax; strip
        # characters that would inject extra filter clauses (`,` , `(`, `)`,
        # the `*` wildcard) or break the ilike value (`.` and `:` are
        # PostgREST-reserved separators) while keeping % and _ as the intended
        # ilike wildcards.
        search_term = None
        if search:
            safe_term = safe_search_term(search)
            search_term = f"%{safe_term}%"

        # Map the status filter to a plain value. None means no filter applies.
        status_filter = None
        if post_status == "published":
            status_filter = True
        elif post_status == "draft":
            status_filter = False

        # Apply pagination
        offset = (page - 1) * page_size

        # Count query and page query run in the service, as at HEAD
        count_result, result = await blog_service.fetch_admin_posts_page(
            db,
            published_only=not include_unpublished,
            category=category,
            search_term=search_term,
            status_filter=status_filter,
            offset=offset,
            page_size=page_size,
        )
        total = count_result.count if hasattr(count_result, "count") else 0

        # Convert to response models (use full BlogPost for admin)
        posts = [BlogPost(**post) for post in (result.data or [])]

        # Calculate pagination
        total_pages = (total + page_size - 1) // page_size if total > 0 else 1

        return {
            "data": {
                "posts": [post.model_dump(mode="json") for post in posts],
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
            "message": "OK",
        }

    except Exception as e:
        logger.error(f"Error listing all blog posts: {e}")
        raise
