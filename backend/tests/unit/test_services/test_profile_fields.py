"""Unit tests for the first-login profile field helper."""

from app.services.profile_fields import (
    FULL_NAME_MAX_LENGTH,
    profile_fields_from_metadata,
)


def test_app_keys_fill_name_and_avatar():
    assert profile_fields_from_metadata({"full_name": "Ada", "avatar_url": "http://av"}) == ("Ada", "http://av")


def test_google_keys_fill_name_and_avatar_when_app_keys_are_missing():
    assert profile_fields_from_metadata({"name": "Meta Name", "picture": "http://pic"}) == (
        "Meta Name",
        "http://pic",
    )


def test_explicit_values_win_over_metadata():
    fields = profile_fields_from_metadata(
        {"full_name": "Meta", "avatar_url": "http://meta"},
        full_name="Request",
        avatar_url="http://request",
    )
    assert fields == ("Request", "http://request")


def test_empty_explicit_value_falls_back_to_metadata():
    assert profile_fields_from_metadata({"full_name": "Meta"}, full_name="") == ("Meta", None)


def test_missing_metadata_gives_empty_name_and_no_avatar():
    assert profile_fields_from_metadata(None) == ("", None)
    assert profile_fields_from_metadata({}) == ("", None)


def test_name_is_cut_to_column_width():
    name, _ = profile_fields_from_metadata({"full_name": "A" * (FULL_NAME_MAX_LENGTH + 45)})
    assert name == "A" * FULL_NAME_MAX_LENGTH


def test_name_at_exact_limit_is_kept_whole():
    name, _ = profile_fields_from_metadata({"full_name": "B" * FULL_NAME_MAX_LENGTH})
    assert name == "B" * FULL_NAME_MAX_LENGTH


def test_avatar_url_is_kept_whole():
    url = "https://cdn.example.com/avatars/" + "a" * 1000 + ".png"
    _, avatar = profile_fields_from_metadata({"picture": url})
    assert avatar == url
