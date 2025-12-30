"""
Pytest Configuration and Fixtures for Audio Services Tests
Provides shared mocks and fixtures for transcription, voice clone, TTS tests
"""

import sys
import os
import pytest
import asyncio
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from unittest.mock import MagicMock, AsyncMock, patch
import json

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


# ═══════════════════════════════════════════════════════════════
# SHARED DATACLASSES (mirrors from services)
# ═══════════════════════════════════════════════════════════════

@dataclass
class MockTranscriptionSegment:
    """Mock segment for testing"""
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.9


@dataclass
class MockTranscriptionResult:
    """Mock transcription result"""
    text: str
    language: str
    confidence: float
    segments: list = field(default_factory=list)
    duration_ms: int = 5000
    source: str = "whisper"
    model: Optional[str] = "whisper-large-v3"
    processing_time_ms: int = 100


@dataclass
class MockVoiceModel:
    """Mock voice model for testing"""
    user_id: str
    embedding_path: str
    audio_count: int = 1
    total_duration_ms: int = 15000
    quality_score: float = 0.7
    version: int = 1
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    next_recalibration_at: Optional[datetime] = None
    embedding: Any = None


@dataclass
class MockTTSResult:
    """Mock TTS result"""
    audio_path: str
    audio_url: str
    duration_ms: int = 3000
    format: str = "mp3"
    language: str = "en"
    voice_cloned: bool = True
    voice_quality: float = 0.8
    processing_time_ms: int = 500
    text_length: int = 50


# ═══════════════════════════════════════════════════════════════
# PYTEST FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files"""
    temp_path = tempfile.mkdtemp(prefix="meeshy_test_")
    yield Path(temp_path)
    # Cleanup
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def mock_audio_file(temp_dir):
    """Create a mock audio file (empty WAV header for testing)"""
    audio_path = temp_dir / "test_audio.wav"

    # Create a minimal WAV file (44 bytes header + silence)
    wav_header = bytes([
        0x52, 0x49, 0x46, 0x46,  # "RIFF"
        0x24, 0x00, 0x00, 0x00,  # File size - 8
        0x57, 0x41, 0x56, 0x45,  # "WAVE"
        0x66, 0x6D, 0x74, 0x20,  # "fmt "
        0x10, 0x00, 0x00, 0x00,  # Chunk size (16)
        0x01, 0x00,              # Audio format (1 = PCM)
        0x01, 0x00,              # Channels (1 = mono)
        0x44, 0xAC, 0x00, 0x00,  # Sample rate (44100)
        0x88, 0x58, 0x01, 0x00,  # Byte rate
        0x02, 0x00,              # Block align
        0x10, 0x00,              # Bits per sample (16)
        0x64, 0x61, 0x74, 0x61,  # "data"
        0x00, 0x00, 0x00, 0x00,  # Data size
    ])

    with open(audio_path, 'wb') as f:
        f.write(wav_header)

    return audio_path


@pytest.fixture
def mock_transcription_service():
    """Create a mock TranscriptionService"""
    mock = MagicMock()
    mock.is_initialized = True
    mock.model_size = "large-v3"
    mock.device = "cpu"
    mock.compute_type = "float16"
    mock.model = MagicMock()  # Mock Whisper model

    async def mock_transcribe(audio_path, mobile_transcription=None, return_timestamps=True):
        if mobile_transcription and mobile_transcription.get('text'):
            return MockTranscriptionResult(
                text=mobile_transcription['text'],
                language=mobile_transcription.get('language', 'en'),
                confidence=mobile_transcription.get('confidence', 0.9),
                source="mobile",
                model=mobile_transcription.get('source', 'mobile')
            )
        return MockTranscriptionResult(
            text="This is a transcribed test message.",
            language="en",
            confidence=0.95,
            segments=[
                MockTranscriptionSegment("This is a", 0, 1000, 0.98),
                MockTranscriptionSegment("transcribed test message.", 1000, 3000, 0.92)
            ],
            duration_ms=3000,
            source="whisper"
        )

    mock.transcribe = AsyncMock(side_effect=mock_transcribe)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={
        "service": "TranscriptionService",
        "initialized": True,
        "whisper_available": True
    })
    mock.close = AsyncMock()

    return mock


@pytest.fixture
def mock_voice_clone_service(temp_dir):
    """Create a mock VoiceCloneService"""
    mock = MagicMock()
    mock.is_initialized = True
    mock.voice_cache_dir = temp_dir / "voice_models"
    mock.voice_cache_dir.mkdir(parents=True, exist_ok=True)
    mock.device = "cpu"
    mock.MIN_AUDIO_DURATION_MS = 10000
    mock.VOICE_MODEL_MAX_AGE_DAYS = 30

    async def mock_get_or_create_voice_model(user_id, current_audio_path=None, current_audio_duration_ms=0):
        model_dir = mock.voice_cache_dir / user_id
        model_dir.mkdir(parents=True, exist_ok=True)
        embedding_path = model_dir / "embedding.pkl"

        # Create fake embedding file
        import pickle
        import numpy as np
        with open(embedding_path, 'wb') as f:
            pickle.dump(np.zeros(256), f)

        return MockVoiceModel(
            user_id=user_id,
            embedding_path=str(embedding_path),
            audio_count=1,
            total_duration_ms=current_audio_duration_ms or 15000,
            quality_score=0.7
        )

    mock.get_or_create_voice_model = AsyncMock(side_effect=mock_get_or_create_voice_model)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={
        "service": "VoiceCloneService",
        "initialized": True,
        "cached_models_count": 0
    })
    mock.close = AsyncMock()

    return mock


@pytest.fixture
def mock_tts_service(temp_dir):
    """Create a mock TTSService"""
    mock = MagicMock()
    mock.is_initialized = True
    mock.output_dir = temp_dir / "audio_output"
    mock.output_dir.mkdir(parents=True, exist_ok=True)
    (mock.output_dir / "translated").mkdir(parents=True, exist_ok=True)
    mock.device = "cpu"
    mock.model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
    mock.default_format = "mp3"

    async def mock_synthesize_with_voice(text, voice_model, target_language, output_format=None, message_id=None):
        output_format = output_format or "mp3"
        file_id = message_id or "test_id"
        output_filename = f"{file_id}_{target_language}.{output_format}"
        output_path = mock.output_dir / "translated" / output_filename

        # Create empty audio file
        output_path.touch()

        return MockTTSResult(
            audio_path=str(output_path),
            audio_url=f"/outputs/audio/translated/{output_filename}",
            duration_ms=int(len(text) * 50),
            format=output_format,
            language=target_language,
            voice_cloned=True,
            voice_quality=voice_model.quality_score,
            processing_time_ms=200,
            text_length=len(text)
        )

    async def mock_synthesize(text, language, output_format=None, speaker=None):
        output_format = output_format or "mp3"
        output_filename = f"tts_test.{output_format}"
        output_path = mock.output_dir / output_filename
        output_path.touch()

        return MockTTSResult(
            audio_path=str(output_path),
            audio_url=f"/outputs/audio/{output_filename}",
            duration_ms=int(len(text) * 50),
            format=output_format,
            language=language,
            voice_cloned=False,
            voice_quality=0.0,
            processing_time_ms=150,
            text_length=len(text)
        )

    mock.synthesize_with_voice = AsyncMock(side_effect=mock_synthesize_with_voice)
    mock.synthesize = AsyncMock(side_effect=mock_synthesize)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={
        "service": "TTSService",
        "initialized": True,
        "tts_available": True
    })
    mock.close = AsyncMock()

    return mock


@pytest.fixture
def mock_translation_service():
    """Create a mock translation service"""
    mock = MagicMock()

    async def mock_translate(text, source_lang, target_lang, model_type="basic"):
        translations = {
            "en": {"fr": "Ceci est un message de test traduit."},
            "fr": {"en": "This is a translated test message."}
        }
        translated = translations.get(source_lang, {}).get(target_lang, f"[{target_lang}] {text}")
        return {
            "translated_text": translated,
            "source_language": source_lang,
            "target_language": target_lang,
            "confidence": 0.92
        }

    mock.translate = AsyncMock(side_effect=mock_translate)
    mock.initialize = AsyncMock(return_value=True)

    return mock


@pytest.fixture
def mock_database_service():
    """Create a mock database service with Prisma"""
    mock = MagicMock()
    mock.prisma = MagicMock()

    # Mock messageattachment queries
    mock.prisma.messageattachment = MagicMock()
    mock.prisma.messageattachment.find_many = AsyncMock(return_value=[])

    # Mock message queries
    mock.prisma.message = MagicMock()
    mock.prisma.message.find_unique = AsyncMock(return_value=None)

    # Mock conversation queries
    mock.prisma.conversation = MagicMock()
    mock.prisma.conversation.find_unique = AsyncMock(return_value=None)

    return mock


@pytest.fixture
def sample_mobile_transcription():
    """Sample mobile transcription data"""
    return {
        "text": "Bonjour, comment allez-vous aujourd'hui?",
        "language": "fr",
        "confidence": 0.92,
        "source": "ios_speech",
        "segments": [
            {"text": "Bonjour,", "startMs": 0, "endMs": 800, "confidence": 0.95},
            {"text": "comment allez-vous", "startMs": 800, "endMs": 2000, "confidence": 0.90},
            {"text": "aujourd'hui?", "startMs": 2000, "endMs": 3000, "confidence": 0.88}
        ]
    }


@pytest.fixture
def sample_audio_message_request():
    """Sample audio message processing request"""
    return {
        "message_id": "msg_12345",
        "attachment_id": "att_67890",
        "conversation_id": "conv_abc123",
        "sender_id": "user_sender",
        "audio_duration_ms": 15000,
        "target_languages": ["en", "es"],
        "generate_voice_clone": True,
        "model_type": "medium"
    }


# ═══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def create_test_audio_file(path: Path, duration_seconds: float = 1.0) -> Path:
    """Create a test audio file with silence"""
    import wave
    import struct

    sample_rate = 44100
    n_samples = int(sample_rate * duration_seconds)

    with wave.open(str(path), 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        # Write silence
        for _ in range(n_samples):
            wav_file.writeframes(struct.pack('h', 0))

    return path


def assert_transcription_result_valid(result):
    """Assert that a transcription result has all required fields"""
    assert hasattr(result, 'text')
    assert hasattr(result, 'language')
    assert hasattr(result, 'confidence')
    assert hasattr(result, 'source')
    assert isinstance(result.text, str)
    assert len(result.text) > 0
    assert result.confidence >= 0 and result.confidence <= 1


def assert_tts_result_valid(result, temp_dir=None):
    """Assert that a TTS result has all required fields"""
    assert hasattr(result, 'audio_path')
    assert hasattr(result, 'audio_url')
    assert hasattr(result, 'duration_ms')
    assert hasattr(result, 'format')
    assert hasattr(result, 'language')
    assert isinstance(result.audio_path, str)
    assert result.format in ['mp3', 'wav', 'ogg']
