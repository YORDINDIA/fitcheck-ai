"""
Blog domain service: persistence for the blog API.

Every PostgREST query used by app/api/v1/blog.py lives here. The route
module keeps the HTTP work: request parsing, the admin and permission gates,
slug and validation checks, the insert and update dicts, the filter
decisions, pagination metadata, logging, error mapping, and response
envelopes.

Each function returns the raw Supabase response the route reads, or the
value the route reads from it. Each query keeps the asyncio.to_thread wrapper
it had in the route, so thread behavior is unchanged.
"""

import asyncio
from typing import Any, Optional


# ============================================================================
# Public reads (published posts only)
# ============================================================================


async def fetch_published_posts_page(
    db: Any,
    category: Optional[str],
    search_term: Optional[str],
    offset: int,
    page_size: int,
) -> Any:
    """Read one page of published posts with the exact total count.

    The route sanitizes the search term and passes the ilike pattern. A None
    value means the route decided that filter does not apply.
    """
    query = db.table("blog_posts").select("*", count="exact").eq("is_published", True)

    if category:
        query = query.eq("category", category)

    if search_term:
        query = query.or_(f"title.ilike.{search_term},excerpt.ilike.{search_term}")

    query = query.order("date", desc=True)

    return await asyncio.to_thread(query.range(offset, offset + page_size - 1).execute)


async def fetch_published_post_by_slug(db: Any, slug: str) -> Any:
    """Read one published post by slug (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", True)
        .maybe_single()
        .execute
    )


async def fetch_published_categories(db: Any) -> Any:
    """Read the category column of every published post."""
    return await asyncio.to_thread(
        db.table("blog_posts")
        .select("category")
        .eq("is_published", True)
        .execute
    )


# ============================================================================
# Admin writes
# ============================================================================


async def fetch_slug_taken_for_create(db: Any, post_data: Any) -> Any:
    """Read the id of any post that already uses the create slug (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("blog_posts")
        .select("id")
        .eq("slug", post_data.slug)
        .maybe_single()
        .execute
    )


async def insert_post_row(db: Any, insert_data: dict) -> Any:
    """Insert one post row."""
    return await asyncio.to_thread(db.table("blog_posts").insert(insert_data).execute)


async def fetch_post_row_for_update(db: Any, slug: str) -> Any:
    """Read the full row of the post to update (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("blog_posts")
        .select("*")
        .eq("slug", slug)
        .maybe_single()
        .execute
    )


async def fetch_slug_taken_for_update(db: Any, post_data: Any) -> Any:
    """Read the id of any post that already uses the new slug (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("blog_posts")
        .select("id")
        .eq("slug", post_data.slug)
        .maybe_single()
        .execute
    )


async def update_post_row(db: Any, slug: str, update_data: dict) -> Any:
    """Apply an update dict to one post row by slug."""
    return await asyncio.to_thread(db.table("blog_posts").update(update_data).eq("slug", slug).execute)


async def fetch_post_id_for_delete(db: Any, slug: str) -> Any:
    """Read the id of the post to delete (0 or 1 rows)."""
    return await asyncio.to_thread(
        db.table("blog_posts")
        .select("id")
        .eq("slug", slug)
        .maybe_single()
        .execute
    )


async def delete_post_row(db: Any, slug: str) -> Any:
    """Delete one post row by slug."""
    return await asyncio.to_thread(db.table("blog_posts").delete().eq("slug", slug).execute)


# ============================================================================
# Admin list (includes unpublished posts)
# ============================================================================


async def fetch_admin_posts_page(
    db: Any,
    published_only: bool,
    category: Optional[str],
    search_term: Optional[str],
    status_filter: Optional[bool],
    offset: int,
    page_size: int,
) -> tuple[Any, Any]:
    """Read the exact total count, then one page, of the admin post list.

    The route decides each filter and passes plain values:
    - published_only: True applies is_published = True.
    - category: None when no category filter applies.
    - search_term: the sanitized ilike pattern, or None.
    - status_filter: True for published, False for draft, None for no filter.

    Returns (count_result, page_result). The count query runs before the
    range is applied, as the route did at HEAD.
    """
    query = db.table("blog_posts").select("*", count="exact")

    if published_only:
        query = query.eq("is_published", True)

    if category:
        query = query.eq("category", category)

    if search_term:
        query = query.or_(
            f"title.ilike.{search_term},excerpt.ilike.{search_term},author.ilike.{search_term},slug.ilike.{search_term}"
        )

    if status_filter is not None:
        query = query.eq("is_published", status_filter)

    query = query.order("updated_at", desc=True)

    count_result = await asyncio.to_thread(query.execute)

    query = query.range(offset, offset + page_size - 1)

    result = await asyncio.to_thread(query.execute)
    return count_result, result
