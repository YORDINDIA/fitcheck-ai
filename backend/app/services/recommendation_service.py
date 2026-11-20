"""
Recommendation domain service: persistence for the recommendations API.

Every PostgREST query used by app/api/v1/recommendations.py lives here. The
route module keeps the HTTP work: request parsing, the rule-based, weather,
astrology, and vector logic, the embedding budget, logging, error mapping,
and response envelopes.

Each function returns the raw Supabase response the route reads, or a tuple
of them. Each query keeps the asyncio.to_thread wrapper it had in the route,
so thread behavior is unchanged.
"""

import asyncio
from typing import Any, List, Optional


# ============================================================================
# Birth profile (public.users)
# ============================================================================


async def fetch_birth_profile_row(db: Any, user_id: Any) -> Any:
    """Read the three birth columns from public.users in one round-trip."""
    return await asyncio.to_thread(
        db.table("users")
        .select("birth_date, birth_time, birth_place")
        .eq("id", user_id)
        .maybe_single()
        .execute
    )


async def fetch_birth_profile_column(db: Any, user_id: Any, column: str) -> Any:
    """Read one birth column from public.users (partial-schema fallback)."""
    return await asyncio.to_thread(
        db.table("users")
        .select(column)
        .eq("id", user_id)
        .maybe_single()
        .execute
    )


# ============================================================================
# Match pool (items)
# ============================================================================


async def fetch_match_pool(
    db: Any,
    user_id: Any,
    source_ids: List[str],
    category: Optional[str] = None,
) -> tuple[Any, Any]:
    """Fetch the seed items and up to 500 match candidates in one gather.

    The candidate query is built first, then the seed query, as the route
    built them before the move.
    """
    candidates_q = (
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .not_.in_("id", source_ids)
        .order("created_at")
    )
    if category:
        candidates_q = candidates_q.eq("category", category)
    # Exclude laundry/repair/donate by default (docs)
    candidates_q = candidates_q.not_.in_("condition", ["laundry", "repair", "donate"])

    sources_res, candidates_res = await asyncio.gather(
        asyncio.to_thread(
            db.table("items")
            .select("*, item_images(*)")
            .eq("user_id", user_id)
            .eq("is_deleted", False)
            .in_("id", source_ids)
            .execute
        ),
        asyncio.to_thread(candidates_q.limit(500).execute),
    )
    return sources_res, candidates_res


# ============================================================================
# Personalized
# ============================================================================


async def fetch_favorite_items(db: Any, user_id: Any, limit: int) -> Any:
    """Fetch favorited items for the personalized feed."""
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .eq("is_favorite", True)
        .limit(limit)
        .execute
    )


async def fetch_least_worn_items(db: Any, user_id: Any, limit: int) -> Any:
    """Fetch the least-worn items for the personalized feed."""
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .order("usage_times_worn", desc=False)
        .limit(limit)
        .execute
    )


# ============================================================================
# User settings
# ============================================================================


async def fetch_default_location_row(db: Any, user_id: Any) -> Any:
    """Read the default_location setting for the weather route."""
    return await asyncio.to_thread(db.table("user_settings").select("default_location").eq("user_id", user_id).maybe_single().execute)


async def fetch_timezone_row(db: Any, user_id: Any) -> Any:
    """Read the timezone setting for the astrology route."""
    return await asyncio.to_thread(
        db.table("user_settings")
        .select("timezone")
        .eq("user_id", user_id)
        .maybe_single()
        .execute
    )


# ============================================================================
# Astrology and similar items
# ============================================================================


async def fetch_astrology_items(db: Any, user_id: Any) -> Any:
    """Fetch wearable items (up to 600) for the astrology picks."""
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .not_.in_("condition", ["laundry", "repair", "donate"])
        .limit(600)
        .execute
    )


async def fetch_similar_source_item(db: Any, item_id: Any, user_id: Any) -> Any:
    """Fetch the source item for a similar-items request, owner-scoped."""
    return await asyncio.to_thread(db.table("items").select("*").eq("id", item_id).eq("user_id", user_id).maybe_single().execute)


async def fetch_items_with_images_by_ids(db: Any, match_ids: List[str]) -> Any:
    """Fetch the items returned by vector search, with their images."""
    return await asyncio.to_thread(db.table("items").select("*, item_images(*)").in_("id", match_ids).execute)


async def fetch_similar_fallback_candidates(db: Any, user_id: Any, item_id: Any) -> Any:
    """Fetch up to 200 candidates for the rule-based similar fallback."""
    # Same exclusion set as the vector path and the match route:
    # laundry/repair/donate items must not surface as suggestions.
    return await asyncio.to_thread(
        db.table("items")
        .select("*, item_images(*)")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .not_.in_("condition", ["laundry", "repair", "donate"])
        .neq("id", item_id)
        .limit(200)
        .execute
    )


# ============================================================================
# Style, wardrobe gaps, shopping, capsule
# ============================================================================


async def fetch_style_source_item(db: Any, item_id_str: Any, user_id: Any) -> Any:
    """Fetch the item for a style analysis, owner-scoped."""
    return await asyncio.to_thread(db.table("items").select("*").eq("id", item_id_str).eq("user_id", user_id).maybe_single().execute)


async def fetch_wardrobe_category_rows(db: Any, user_id: Any) -> Any:
    """Fetch id and category for each live item (wardrobe gaps)."""
    return await asyncio.to_thread(db.table("items").select("id,category").eq("user_id", user_id).eq("is_deleted", False).execute)


async def fetch_shopping_category_rows(db: Any, user_id: Any) -> Any:
    """Fetch id and category for each live item (shopping)."""
    return await asyncio.to_thread(db.table("items").select("id,category").eq("user_id", user_id).eq("is_deleted", False).execute)


async def fetch_capsule_item_rows(db: Any, user_id: Any, item_count: int) -> Any:
    """Fetch the favorite and most-worn items for the capsule wardrobe."""
    return await asyncio.to_thread(
        db.table("items")
        .select("id,name,category,colors,brand,item_images(storage_path,image_url,thumbnail_url,is_primary)")
        .eq("user_id", user_id)
        .eq("is_deleted", False)
        .order("is_favorite", desc=True)
        .order("usage_times_worn", desc=True)
        .limit(item_count)
        .execute
    )


# ============================================================================
# Ratings
# ============================================================================


async def upsert_recommendation_rating(db: Any, recommendation_id: Any, user_id: Any, request: Any) -> Any:
    """Upsert the rating row for a recommendation, keyed by the client id."""
    return await asyncio.to_thread(db.table("recommendation_logs").upsert(
        {
            "id": str(recommendation_id),
            "user_id": user_id,
            "recommendation_type": "rating",
            "feedback": {"rating": request.rating},
        },
        on_conflict="id",
    ).execute)
