"""Tests for dict-or-object safe segment serialization (Chantier A)."""

import sys
import os
from dataclasses import dataclass
from typing import Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.zmq_audio_handler import _segment_to_dict
from services.transcription_service import TranscriptionSegment


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


@pytest.mark.unit
def test_segment_to_dict_real_transcription_segment_camelcase_output():
    """Real TranscriptionSegment (confidence defaults to 0.0) serialises correctly,
    including voiceSimilarityScore with a concrete float value."""
    seg = TranscriptionSegment(
        text="salut le monde",
        start_ms=0,
        end_ms=1500,
        confidence=0.95,
        speaker_id="spk_0",
        voice_similarity_score=0.85,
        language="fr",
    )
    result = _segment_to_dict(seg)
    assert result["text"] == "salut le monde"
    assert result["startMs"] == 0
    assert result["endMs"] == 1500
    assert result["confidence"] == 0.95
    assert result["speakerId"] == "spk_0"
    assert result["voiceSimilarityScore"] == 0.85
    assert result["language"] == "fr"


@pytest.mark.unit
def test_segment_to_dict_real_transcription_segment_confidence_default():
    """TranscriptionSegment.confidence defaults to 0.0 (not None); _segment_to_dict
    must propagate that default rather than masking it."""
    seg = TranscriptionSegment(text="ok", start_ms=10, end_ms=200)
    result = _segment_to_dict(seg)
    assert result["confidence"] == 0.0


@dataclass
class _FakeTranscription:
    text: str
    language: str
    confidence: float
    source: str
    segments: list
    duration_ms: int
    speaker_count: Optional[int] = None
    primary_speaker_id: Optional[str] = None
    sender_voice_identified: Optional[bool] = None
    sender_speaker_id: Optional[str] = None
    speaker_analysis: Optional[dict] = None


@pytest.mark.unit
async def test_publish_transcription_result_serializes_dict_segments():
    """Cache-hit path: segments arrive as dicts; the published payload must
    keep non-empty text/startMs/endMs (regression for the 4 stub audios)."""
    from services.zmq_audio_handler import AudioHandler

    captured = {}

    class _FakePubSocket:
        async def send_json(self, payload):
            captured['payload'] = payload

    handler = AudioHandler(pub_socket=_FakePubSocket())

    dict_segments = [
        {"text": "bonjour", "startMs": 0, "endMs": 800, "confidence": 0.9},
        {"text": "le monde", "startMs": 800, "endMs": 1600, "confidence": 0.88},
    ]
    transcription = _FakeTranscription(
        text="bonjour le monde", language="fr", confidence=0.89,
        source="cache", segments=dict_segments, duration_ms=1600,
    )
    transcription_data = {
        'transcription': transcription,
        'message_id': 'msg_1',
        'attachment_id': 'att_1',
        'processing_time_ms': 12,
    }

    await handler._publish_transcription_result('task_1', transcription_data)

    published = captured['payload']['transcription']['segments']
    assert len(published) == 2
    assert published[0]['text'] == "bonjour"
    assert published[0]['startMs'] == 0
    assert published[0]['endMs'] == 800
    assert published[1]['text'] == "le monde"
    assert published[1]['startMs'] == 800
    assert published[1]['endMs'] == 1600
