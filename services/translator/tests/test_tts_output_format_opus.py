"""
D1 bandwidth — message-audio TTS defaults to Opus, not MP3.

Message-audio translations are pushed to every recipient, so the TTS container
format is the single biggest audio-payload lever. libopus mono low-band (VoIP)
is ~65% lighter than MP3 for speech with no perceptible loss. These tests pin
the flip: the audio pipeline must default to opus, stay env-overridable, and
must NOT carry the old hardcoded "mp3".
"""

import os
from unittest.mock import MagicMock

import pytest

from services.audio_pipeline.translation_stage import TranslationStage


def _make_stage(**kwargs) -> TranslationStage:
    # Pass every collaborator so no heavy singleton getter is invoked.
    return TranslationStage(
        translation_service=MagicMock(),
        tts_service=MagicMock(),
        voice_clone_service=MagicMock(),
        audio_cache=MagicMock(),
        translation_cache=MagicMock(),
        **kwargs,
    )


@pytest.mark.unit
def test_default_tts_output_format_is_opus(monkeypatch):
    monkeypatch.delenv("AUDIO_PIPELINE_TTS_FORMAT", raising=False)
    stage = _make_stage()
    assert stage.tts_output_format == "opus"


@pytest.mark.unit
def test_tts_output_format_env_override(monkeypatch):
    monkeypatch.setenv("AUDIO_PIPELINE_TTS_FORMAT", "mp3")
    stage = _make_stage()
    assert stage.tts_output_format == "mp3"


@pytest.mark.unit
def test_tts_output_format_explicit_injection_wins(monkeypatch):
    monkeypatch.setenv("AUDIO_PIPELINE_TTS_FORMAT", "mp3")
    stage = _make_stage(tts_output_format="ogg")
    assert stage.tts_output_format == "ogg"


@pytest.mark.unit
def test_no_hardcoded_mp3_in_synthesis_calls():
    """Guard against regressing the flip: the synthesis calls must route through
    `self.tts_output_format`, never a literal "mp3"."""
    import inspect
    from services.audio_pipeline import translation_stage

    source = inspect.getsource(translation_stage.TranslationStage)
    assert 'output_format="mp3"' not in source
    assert "output_format=self.tts_output_format" in source
