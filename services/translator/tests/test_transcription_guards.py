"""Tests des gardes de transcription vide.

Régression production : quand le filtre VAD retire tout l'audio (ou que le
filtre d'hallucination strippe tous les segments), Whisper renvoyait un texte
vide MAIS avec `confidence = language_probability` (~0.69, proba de détection
de langue). Ce résultat vide était émis vers la gateway, traduit (NLLB sur "")
et synthétisé (clonage vocal de rien) → stocké comme transcription `undefined`.
"""

import pytest

from src.services.audio_pipeline.transcription_guards import (
    is_blank_transcription,
    resolve_transcription_confidence,
)


@pytest.mark.unit
class TestIsBlankTranscription:
    def test_none_is_blank(self):
        assert is_blank_transcription(None) is True

    def test_empty_string_is_blank(self):
        assert is_blank_transcription("") is True

    def test_whitespace_only_is_blank(self):
        assert is_blank_transcription("   \n\t ") is True

    def test_real_text_is_not_blank(self):
        assert is_blank_transcription("Bonjour tout le monde") is False

    def test_single_char_is_not_blank(self):
        assert is_blank_transcription("a") is False


@pytest.mark.unit
class TestResolveTranscriptionConfidence:
    def test_blank_text_yields_zero_confidence(self):
        # No speech → honest 0.0, not the misleading language-detection prob.
        assert resolve_transcription_confidence("", 0.6947) == 0.0
        assert resolve_transcription_confidence("   ", 0.6947) == 0.0
        assert resolve_transcription_confidence(None, 0.6947) == 0.0

    def test_real_text_keeps_language_probability(self):
        assert resolve_transcription_confidence("Bonjour", 0.95) == 0.95
