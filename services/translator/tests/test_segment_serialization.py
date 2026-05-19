"""Tests for dict-or-object safe segment serialization (Chantier A)."""

import sys
import os
from dataclasses import dataclass
from typing import Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.zmq_audio_handler import _segment_to_dict


@dataclass
class _FakeSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: Optional[float] = None
    speaker_id: Optional[str] = None
    voice_similarity_score: Optional[float] = None
    language: Optional[str] = None


@pytest.mark.unit
def test_segment_to_dict_dataclass_preserves_values():
    seg = _FakeSegment(text="bonjour", start_ms=100, end_ms=900,
                       confidence=0.92, speaker_id="spk_0", language="fr")
    result = _segment_to_dict(seg)
    assert result["text"] == "bonjour"
    assert result["startMs"] == 100
    assert result["endMs"] == 900
    assert result["confidence"] == 0.92
    assert result["speakerId"] == "spk_0"
    assert result["language"] == "fr"


@pytest.mark.unit
def test_segment_to_dict_camelcase_dict_preserves_values():
    seg = {"text": "hello", "startMs": 200, "endMs": 1100,
           "confidence": 0.81, "speakerId": "spk_1", "language": "en"}
    result = _segment_to_dict(seg)
    assert result["text"] == "hello"
    assert result["startMs"] == 200
    assert result["endMs"] == 1100
    assert result["confidence"] == 0.81
    assert result["speakerId"] == "spk_1"
    assert result["language"] == "en"


@pytest.mark.unit
def test_segment_to_dict_snakecase_dict_preserves_values():
    seg = {"text": "hola", "start_ms": 300, "end_ms": 1300, "speaker_id": "spk_2"}
    result = _segment_to_dict(seg)
    assert result["text"] == "hola"
    assert result["startMs"] == 300
    assert result["endMs"] == 1300
    assert result["speakerId"] == "spk_2"


@pytest.mark.unit
def test_segment_to_dict_dict_and_dataclass_equal_for_same_data():
    obj = _FakeSegment(text="x", start_ms=10, end_ms=20, confidence=0.5)
    dct = {"text": "x", "startMs": 10, "endMs": 20, "confidence": 0.5}
    assert _segment_to_dict(obj) == _segment_to_dict(dct)
