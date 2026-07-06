"""
Test 20: Synthesizer._segment_text

Regression tests for the long-text TTS segmentation in
services/tts/synthesizer.py (distinct from utils/text_segmentation.py, covered
by test_19). Focus: no text is ever dropped when a short sentence/fragment
(< MIN_SEGMENT_CHARS) precedes a sentence too large to append without exceeding
max_chars — the F85 data-loss bug.

The import pulls the TTS backends (torch et al.); it is skipped gracefully when
those optional deps are absent so the suite still collects, and runs fully in CI
where the translator ML stack is installed.
"""

import os
import sys

import pytest

# Add src to path (same convention as test_19_text_segmentation.py)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from services.tts.synthesizer import (
        Synthesizer,
        MIN_SEGMENT_CHARS,
        MAX_SEGMENT_CHARS,
    )
    _IMPORT_OK = True
except Exception:  # pragma: no cover - optional heavy ML deps absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(
    not _IMPORT_OK,
    reason="Synthesizer import requires the TTS backend stack (torch/chatterbox)",
)


@pytest.fixture
def segment():
    """_segment_text is pure (uses no instance state); build an uninitialized
    instance via __new__ to avoid loading any TTS model."""
    synth = Synthesizer.__new__(Synthesizer)
    return lambda text, max_chars=MAX_SEGMENT_CHARS: synth._segment_text(text, max_chars)


def test_short_leading_sentence_is_not_dropped(segment):
    # "Hi." (< MIN_SEGMENT_CHARS) followed by one sentence too big to append.
    big = "A" * (MAX_SEGMENT_CHARS - 1) + "."
    segments = segment("Hi. " + big)
    joined = " ".join(segments)
    assert "Hi" in joined
    # The short leading fragment survives as its own segment rather than vanishing.
    assert any(s.startswith("Hi") for s in segments)


def test_every_segment_respects_max_chars(segment):
    big = "A" * (MAX_SEGMENT_CHARS - 1) + "."
    for s in segment("Hi. " + big):
        assert len(s) <= MAX_SEGMENT_CHARS


def test_short_fragment_between_two_large_sentences_survives(segment):
    a = "B" * (MAX_SEGMENT_CHARS - 400)
    c = "C" * (MAX_SEGMENT_CHARS - 400)
    joined = " ".join(segment(f"Yo. {a}. {c}."))
    assert "Yo" in joined and a in joined and c in joined


def test_normal_multi_sentence_text_loses_no_words(segment):
    text = ". ".join(f"Sentence number {i} carries a few words" for i in range(60)) + "."
    segments = segment(text)
    joined = " ".join(segments)
    assert all(len(s) <= MAX_SEGMENT_CHARS for s in segments)
    assert "Sentence number 0 " in joined
    assert "Sentence number 59 " in joined


def test_short_text_returned_as_single_segment(segment):
    assert segment("Just a short line.") == ["Just a short line."]
