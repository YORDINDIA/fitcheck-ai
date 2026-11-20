"""Profile fields taken from OAuth provider metadata at first login.

Two paths create a profile at first login: ``oauth_sync`` in
``app/api/v1/auth.py`` and ``_provision_profile`` in ``app/api/v1/deps.py``.
Both call this helper, so the stored values and their length limits match.
"""

from collections.abc import Mapping
from typing import Any, Optional

FULL_NAME_MAX_LENGTH = 255  # public.users.full_name is VARCHAR(255), migration 001


def profile_fields_from_metadata(
    user_metadata: Optional[Mapping[str, Any]],
    *,
    full_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    """Return ``(full_name, avatar_url)`` for a new profile row.

    Explicit values win over provider metadata. An empty value falls through to
    the next source. Google sends ``name`` and ``picture`` where other providers
    send ``full_name`` and ``avatar_url``. A missing avatar stays ``None``. The
    name is cut to its column width. The avatar URL is kept whole.
    """
    metadata = user_metadata or {}
    name = full_name or metadata.get("full_name") or metadata.get("name") or ""
    picture = avatar_url or metadata.get("avatar_url") or metadata.get("picture")
    return (
        name[:FULL_NAME_MAX_LENGTH],
        picture,
    )
