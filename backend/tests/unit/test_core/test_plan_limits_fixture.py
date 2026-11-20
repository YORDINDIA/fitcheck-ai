"""Keep the committed plan limits in step with the backend.

docs/generated/plan-limits.json is the snapshot that the web marketing
constants are checked against (frontend/src/lib/__tests__/plan-limits.test.ts).
These tests keep the snapshot equal to the settings defaults, and keep /plans
serving every value in it.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.api.v1.subscription import get_plans
from app.core.config import Settings, settings

FIXTURE = (
    Path(__file__).resolve().parents[4] / "docs" / "generated" / "plan-limits.json"
)
TIERS = ("free", "plus", "pro")
LIMIT_SETTINGS = {
    "monthly_extractions": "MONTHLY_EXTRACTIONS",
    "monthly_generations": "MONTHLY_GENERATIONS",
    "monthly_embeddings": "MONTHLY_EMBEDDINGS",
    "daily_photoshoot_images": "DAILY_PHOTOSHOOT_IMAGES",
}


def _setting_name(tier: str, key: str) -> str:
    return f"PLAN_{tier.upper()}_{LIMIT_SETTINGS[key]}"


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_fixture_matches_settings_defaults():
    expected = {
        tier: {
            key: Settings.model_fields[_setting_name(tier, key)].default
            for key in LIMIT_SETTINGS
        }
        for tier in TIERS
    }
    assert _fixture() == expected


@pytest.mark.asyncio
async def test_plans_payload_serves_every_fixture_limit():
    fixture = _fixture()
    overrides = {
        _setting_name(tier, key): value
        for tier, limits in fixture.items()
        for key, value in limits.items()
    }
    with patch.multiple(settings, **overrides):
        result = await get_plans()

    plans = {plan["id"]: plan for plan in result["data"]["plans"]}
    for tier, limits in fixture.items():
        assert plans[tier]["limits"] == limits
        for key, value in limits.items():
            # Flutter reads the flattened keys next to the nested dict.
            assert plans[tier][key] == value
