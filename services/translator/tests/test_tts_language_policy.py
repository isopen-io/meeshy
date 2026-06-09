"""Tests for the on-demand TTS language policy (pure — no ML stack required)."""

import pytest

from services.audio_pipeline.tts_language_policy import (
    select_eager_tts_languages,
    TTSLanguageSelection,
)


@pytest.mark.unit
def test_mode_all_synthesizes_everything():
    sel = select_eager_tts_languages(["en", "fr", "es"], mode="all")
    assert sel == TTSLanguageSelection(eager=["en", "fr", "es"], deferred=[])


@pytest.mark.unit
def test_default_mode_is_all():
    sel = select_eager_tts_languages(["en", "fr"])
    assert sel.deferred == []
    assert sel.eager == ["en", "fr"]


@pytest.mark.unit
def test_dedupes_and_lowercases_preserving_order():
    sel = select_eager_tts_languages(["EN", "fr", " en ", "Fr", "es"], mode="all")
    assert sel.eager == ["en", "fr", "es"]


@pytest.mark.unit
def test_mode_active_defers_languages_no_one_needs():
    sel = select_eager_tts_languages(
        ["en", "fr", "es", "de"], active_languages=["fr", "de"], mode="active"
    )
    assert sel.eager == ["fr", "de"]
    assert sel.deferred == ["en", "es"]


@pytest.mark.unit
def test_mode_active_with_no_active_keeps_first_eager_not_silence():
    sel = select_eager_tts_languages(["en", "fr"], active_languages=[], mode="active")
    assert sel.eager == ["en"]
    assert sel.deferred == ["fr"]


@pytest.mark.unit
def test_mode_bounded_caps_eager_count():
    sel = select_eager_tts_languages(["en", "fr", "es", "de"], max_eager=2, mode="bounded")
    assert sel.eager == ["en", "fr"]
    assert sel.deferred == ["es", "de"]


@pytest.mark.unit
def test_bounded_without_max_synthesizes_all():
    sel = select_eager_tts_languages(["en", "fr"], mode="bounded")
    assert sel.deferred == []


@pytest.mark.unit
def test_empty_targets():
    sel = select_eager_tts_languages([], mode="active", active_languages=["en"])
    assert sel == TTSLanguageSelection(eager=[], deferred=[])


@pytest.mark.unit
def test_unknown_mode_falls_back_to_all():
    sel = select_eager_tts_languages(["en", "fr"], mode="wat")
    assert sel.eager == ["en", "fr"]
    assert sel.deferred == []
