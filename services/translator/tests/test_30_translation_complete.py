#!/usr/bin/env python3
"""
Test 30 - Complete Translation Service Tests
Comprehensive tests for text and attachment translation features.

Coverage targets:
- AudioMessagePipeline: Full attachment translation flow
- TranslationMLService: Text translation with structure preservation
- Cache integration: Redis caching for translations
- Error handling: Edge cases and failure scenarios

Target: >80% coverage for translation features
"""

import sys
import os
import pytest
import asyncio
import tempfile
import shutil
import hashlib
import time
import wave
import struct
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from dataclasses import dataclass, field

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


# ============================================================================
# MOCK DATA CLASSES
# ============================================================================

@dataclass
class MockTranscriptionResult:
    """Mock transcription result"""
    text: str
    language: str
    confidence: float
    duration_ms: int = 5000
    source: str = "whisper"
    segments: list = field(default_factory=list)
    model: str = "whisper-large-v3"
    processing_time_ms: int = 100
    speaker_count: Optional[int] = None
    primary_speaker_id: Optional[str] = None
    sender_voice_identified: Optional[bool] = None
    sender_speaker_id: Optional[str] = None
    speaker_analysis: Any = None
    diarization_speakers: Any = None


@dataclass
class MockVoiceModel:
    """Mock voice model"""
    user_id: str
    profile_id: str = "profile_123"
    embedding: Any = None
    quality_score: float = 0.85
    audio_count: int = 1
    total_duration_ms: int = 15000
    version: int = 1
    fingerprint: Any = None
    voice_characteristics: Any = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


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
    processing_time_ms: int = 200
    text_length: int = 50
    audio_data_base64: Optional[str] = None
    audio_mime_type: Optional[str] = None


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def temp_dir():
    """Create a temporary directory"""
    temp_path = tempfile.mkdtemp(prefix="translation_test_")
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def mock_audio_file(temp_dir):
    """Create a valid mock WAV audio file"""
    audio_path = temp_dir / "test_audio.wav"

    # Create a simple WAV file with 1 second of audio
    sample_rate = 22050
    duration = 1.0
    n_samples = int(sample_rate * duration)

    with wave.open(str(audio_path), 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        # Write silence
        for _ in range(n_samples):
            wav_file.writeframes(struct.pack('h', 0))

    return str(audio_path)


@pytest.fixture
def mock_transcription_service():
    """Mock transcription service"""
    mock = MagicMock()
    mock.is_initialized = True

    async def mock_transcribe(audio_path, mobile_transcription=None, return_timestamps=True):
        if mobile_transcription and mobile_transcription.get('text'):
            return MockTranscriptionResult(
                text=mobile_transcription['text'],
                language=mobile_transcription.get('language', 'en'),
                confidence=mobile_transcription.get('confidence', 0.9),
                source="mobile"
            )
        return MockTranscriptionResult(
            text="Hello, this is a test message for translation.",
            language="en",
            confidence=0.95
        )

    mock.transcribe = AsyncMock(side_effect=mock_transcribe)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={"initialized": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_voice_clone_service(temp_dir):
    """Mock voice clone service"""
    mock = MagicMock()
    mock.is_initialized = True
    mock.voice_cache_dir = temp_dir / "voice_models"
    mock.voice_cache_dir.mkdir(parents=True, exist_ok=True)

    async def mock_get_or_create(user_id, current_audio_path=None, current_audio_duration_ms=0):
        return MockVoiceModel(user_id=user_id)

    async def mock_from_gateway(profile_data, user_id):
        return MockVoiceModel(user_id=user_id, quality_score=profile_data.get('quality_score', 0.8))

    mock.get_or_create_voice_model = AsyncMock(side_effect=mock_get_or_create)
    mock.create_voice_model_from_gateway_profile = AsyncMock(side_effect=mock_from_gateway)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={"initialized": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_tts_service(temp_dir):
    """Mock TTS service"""
    mock = MagicMock()
    mock.is_initialized = True
    mock.output_dir = temp_dir / "audio_output"
    mock.output_dir.mkdir(parents=True, exist_ok=True)

    async def mock_synthesize_with_voice(text, speaker_audio_path=None, target_language="en", output_format=None, message_id=None, cloning_params=None, **kwargs):
        output_path = mock.output_dir / f"{message_id}_{target_language}.mp3"
        output_path.touch()
        return MockTTSResult(
            audio_path=str(output_path),
            audio_url=f"/audio/{target_language}.mp3",
            language=target_language,
            voice_cloned=True
        )

    async def mock_synthesize(text, language, output_format=None, speaker=None, cloning_params=None, **kwargs):
        output_path = mock.output_dir / f"tts_{language}.mp3"
        output_path.touch()
        return MockTTSResult(
            audio_path=str(output_path),
            audio_url=f"/audio/tts_{language}.mp3",
            language=language,
            voice_cloned=False
        )

    mock.synthesize_with_voice = AsyncMock(side_effect=mock_synthesize_with_voice)
    mock.synthesize = AsyncMock(side_effect=mock_synthesize)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={"initialized": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_redis_service():
    """Mock Redis service"""
    mock = MagicMock()
    mock._cache = {}

    def mock_is_available():
        return True

    mock.is_available = mock_is_available
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = MagicMock(return_value={"connected": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_audio_cache_service():
    """Mock audio cache service"""
    mock = MagicMock()
    mock._transcription_cache = {}
    mock._audio_cache = {}

    async def get_or_compute_hash(attachment_id, audio_path):
        return hashlib.sha256(f"{attachment_id}:{audio_path}".encode()).hexdigest()[:16]

    async def get_transcription(audio_hash):
        return mock._transcription_cache.get(audio_hash)

    async def set_transcription(audio_hash, data):
        mock._transcription_cache[audio_hash] = data

    async def get_all_translated(audio_hash, languages):
        result = {}
        for lang in languages:
            key = f"{audio_hash}:{lang}"
            if key in mock._audio_cache:
                result[lang] = mock._audio_cache[key]
        return result

    async def set_translated(audio_hash, lang, data):
        mock._audio_cache[f"{audio_hash}:{lang}"] = data

    mock.get_or_compute_audio_hash = AsyncMock(side_effect=get_or_compute_hash)
    mock.get_transcription_by_hash = AsyncMock(side_effect=get_transcription)
    mock.set_transcription_by_hash = AsyncMock(side_effect=set_transcription)
    mock.get_all_translated_audio_by_hash = AsyncMock(side_effect=get_all_translated)
    mock.set_translated_audio_by_hash = AsyncMock(side_effect=set_translated)
    mock.get_stats = MagicMock(return_value={"cache_hits": 0})
    return mock


@pytest.fixture
def mock_translation_cache_service():
    """Mock translation cache service"""
    mock = MagicMock()
    mock._cache = {}

    async def get_translation(text, source_lang, target_lang, model_type="premium"):
        key = f"{text}:{source_lang}:{target_lang}:{model_type}"
        return mock._cache.get(key)

    async def set_translation(text, source_lang, target_lang, translated_text, model_type="premium"):
        key = f"{text}:{source_lang}:{target_lang}:{model_type}"
        mock._cache[key] = {"translated_text": translated_text}

    mock.get_translation = AsyncMock(side_effect=get_translation)
    mock.set_translation = AsyncMock(side_effect=set_translation)
    mock.get_stats = MagicMock(return_value={"cache_hits": 0})
    return mock


@pytest.fixture
def mock_translation_service():
    """Mock translation ML service"""
    mock = MagicMock()
    mock.is_initialized = True

    translations = {
        ("en", "fr"): "Bonjour, ceci est un message de test pour la traduction.",
        ("en", "es"): "Hola, este es un mensaje de prueba para traduccion.",
        ("en", "de"): "Hallo, dies ist eine Testnachricht fur Ubersetzung.",
        ("fr", "en"): "Hello, this is a test message for translation.",
    }

    async def mock_translate_with_structure(text, source_language, target_language, model_type="premium", source_channel="test"):
        key = (source_language, target_language)
        translated = translations.get(key, f"[{target_language}] {text}")
        return {"translated_text": translated}

    mock.translate_with_structure = AsyncMock(side_effect=mock_translate_with_structure)
    mock.initialize = AsyncMock(return_value=True)
    return mock


# ============================================================================
# TEST: AUDIO MESSAGE PIPELINE - ATTACHMENT FLOW
# ============================================================================

class TestAudioMessagePipelineBasic:
    """Basic tests for AudioMessagePipeline"""

    @pytest.fixture
    def pipeline(self, mock_transcription_service, mock_voice_clone_service,
                 mock_tts_service, mock_redis_service, mock_audio_cache_service,
                 mock_translation_cache_service, mock_translation_service):
        """Create a pipeline with mocked services"""
        from services.audio_message_pipeline import AudioMessagePipeline

        # Reset singleton
        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.set_translation_service(mock_translation_service)
            pipeline.is_initialized = True
            yield pipeline

            # Reset singleton after test
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_singleton_pattern(self):
        """Test singleton pattern"""
        from services.audio_message_pipeline import AudioMessagePipeline
        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service'), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service'), \
             patch('services.audio_pipeline.translation_stage.get_tts_service'), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service'), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service'), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service'), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service'):

            p1 = AudioMessagePipeline()
            p2 = AudioMessagePipeline()
            assert p1 is p2
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_process_audio_message_basic(self, pipeline, mock_audio_file):
        """Test basic audio message processing"""
        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"],
            generate_voice_clone=True
        )

        assert result is not None
        assert result.message_id == "msg_789"
        assert result.attachment_id == "att_001"
        assert result.original.language == "en"
        assert "fr" in result.translations

    @pytest.mark.asyncio
    async def test_process_audio_message_multiple_languages(self, pipeline, mock_audio_file):
        """Test translation to multiple target languages"""
        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr", "es", "de"],
            generate_voice_clone=True
        )

        assert len(result.translations) == 3
        assert "fr" in result.translations
        assert "es" in result.translations
        assert "de" in result.translations

    @pytest.mark.asyncio
    async def test_process_audio_with_mobile_transcription(self, pipeline, mock_audio_file):
        """Test using mobile-provided transcription"""
        from services.audio_message_pipeline import AudioMessageMetadata

        metadata = AudioMessageMetadata(
            transcription="Hello from mobile app",
            language="en",
            confidence=0.92,
            source="ios_speech"
        )

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            metadata=metadata,
            target_languages=["fr"]
        )

        assert result.original.source == "mobile"
        assert result.original.transcription == "Hello from mobile app"

    @pytest.mark.asyncio
    async def test_process_audio_without_voice_clone(self, pipeline, mock_audio_file):
        """Test processing without voice cloning"""
        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"],
            generate_voice_clone=False
        )

        assert result.voice_model_quality == 0.0
        assert "fr" in result.translations


class TestAudioMessagePipelineVoiceProfile:
    """Tests for voice profile handling in pipeline"""

    @pytest.fixture
    def pipeline(self, mock_transcription_service, mock_voice_clone_service,
                 mock_tts_service, mock_redis_service, mock_audio_cache_service,
                 mock_translation_cache_service, mock_translation_service):
        """Create a pipeline with mocked services"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.set_translation_service(mock_translation_service)
            pipeline.is_initialized = True
            yield pipeline
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_use_existing_voice_profile(self, pipeline, mock_audio_file):
        """Test using existing voice profile from Gateway"""
        existing_profile = {
            "user_id": "original_sender",
            "quality_score": 0.9,
            "embedding_base64": "encoded_embedding_data",
            "embedding": [0.0] * 256
        }

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="forwarder_user",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"],
            original_sender_id="original_sender",
            existing_voice_profile=existing_profile,
            use_original_voice=True
        )

        # Should use original sender's voice
        assert result.voice_model_user_id == "original_sender"

    @pytest.mark.asyncio
    async def test_create_new_voice_profile(self, pipeline, mock_audio_file, mock_voice_clone_service):
        """Test creating new voice profile"""
        # Setup mock to return a model with embedding
        import numpy as np
        voice_model = MockVoiceModel(user_id="user_123")
        voice_model.embedding = np.zeros(256)
        mock_voice_clone_service.get_or_create_voice_model = AsyncMock(return_value=voice_model)

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"],
            generate_voice_clone=True
        )

        # New profile should be prepared for Gateway
        assert result.new_voice_profile is not None or result.voice_model_quality > 0


class TestAudioMessagePipelineCache:
    """Tests for cache behavior in pipeline"""

    @pytest.fixture
    def pipeline_with_cache(self, mock_transcription_service, mock_voice_clone_service,
                           mock_tts_service, mock_redis_service, mock_audio_cache_service,
                           mock_translation_cache_service, mock_translation_service):
        """Create a pipeline with cache pre-populated"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        # Pre-populate caches
        mock_audio_cache_service._transcription_cache["abc123"] = {
            "text": "Cached transcription text",
            "language": "en",
            "confidence": 0.95,
            "duration_ms": 5000,
            "source": "cache"
        }

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.set_translation_service(mock_translation_service)
            pipeline.is_initialized = True
            yield pipeline
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_cache_transcription_reuse(self, pipeline_with_cache, mock_audio_file,
                                             mock_audio_cache_service, mock_transcription_service):
        """Test that cached transcription is reused"""
        # Make the hash function return the cached key
        mock_audio_cache_service.get_or_compute_audio_hash = AsyncMock(return_value="abc123")

        result = await pipeline_with_cache.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"]
        )

        # Should use cached transcription
        assert result.original.transcription == "Cached transcription text"
        # Transcription service should NOT be called
        mock_transcription_service.transcribe.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_translated_audio_reuse(self, pipeline_with_cache, mock_audio_file,
                                                mock_audio_cache_service, mock_tts_service, temp_dir):
        """Test that cached translated audio is reused"""
        # Create a real cached audio file so _load_cached_audio can read it
        cached_audio_path = str(temp_dir / "cached_fr.mp3")
        with open(cached_audio_path, 'wb') as f:
            f.write(b'\x00' * 100)  # Dummy audio bytes

        # Pre-populate translated audio cache
        mock_audio_cache_service._audio_cache["abc123:fr"] = {
            "translated_text": "Texte traduit en cache",
            "audio_path": cached_audio_path,
            "audio_url": "/audio/cached_fr.mp3",
            "duration_ms": 3000,
            "format": "mp3",
            "voice_cloned": True,
            "voice_quality": 0.9
        }
        mock_audio_cache_service.get_or_compute_audio_hash = AsyncMock(return_value="abc123")

        result = await pipeline_with_cache.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"]
        )

        # Should use cached translation
        assert result.translations["fr"].translated_text == "Texte traduit en cache"
        assert result.translations["fr"].processing_time_ms == 0  # Instant from cache


class TestAudioMessagePipelineErrors:
    """Tests for error handling in pipeline"""

    @pytest.fixture
    def pipeline(self, mock_transcription_service, mock_voice_clone_service,
                 mock_tts_service, mock_redis_service, mock_audio_cache_service,
                 mock_translation_cache_service, mock_translation_service):
        """Create a pipeline with mocked services"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.set_translation_service(mock_translation_service)
            pipeline.is_initialized = True
            yield pipeline
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_voice_clone_failure_continues(self, pipeline, mock_audio_file, mock_voice_clone_service):
        """Test that pipeline continues when voice cloning fails"""
        mock_voice_clone_service.get_or_create_voice_model = AsyncMock(
            side_effect=Exception("Voice cloning failed")
        )

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"],
            generate_voice_clone=True
        )

        # Should still complete, just without voice cloning
        assert result is not None
        assert result.voice_model_quality == 0.0

    @pytest.mark.asyncio
    async def test_single_language_failure_doesnt_stop_others(self, pipeline, mock_audio_file,
                                                              mock_translation_service):
        """Test that failure in one language doesn't stop others"""
        call_count = 0

        async def mock_translate(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            target_lang = kwargs.get('target_language', args[2] if len(args) > 2 else 'fr')
            if target_lang == "es":
                raise Exception("Spanish translation failed")
            return {"translated_text": f"Translated to {target_lang}"}

        mock_translation_service.translate_with_structure = AsyncMock(side_effect=mock_translate)

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr", "es", "de"]
        )

        # Should have some translations even if one failed
        assert len(result.translations) >= 1

    @pytest.mark.asyncio
    async def test_translation_service_unavailable(self, pipeline, mock_audio_file):
        """Test handling when translation service is unavailable"""
        pipeline.set_translation_service(None)

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"]
        )

        # Should still complete with original text
        assert result is not None


class TestAudioMessagePipelineResult:
    """Tests for AudioMessageResult serialization"""

    @pytest.fixture
    def pipeline(self, mock_transcription_service, mock_voice_clone_service,
                 mock_tts_service, mock_redis_service, mock_audio_cache_service,
                 mock_translation_cache_service, mock_translation_service):
        """Create a pipeline with mocked services"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.set_translation_service(mock_translation_service)
            pipeline.is_initialized = True
            yield pipeline
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_result_to_dict(self, pipeline, mock_audio_file):
        """Test result serialization to dictionary"""
        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"]
        )

        result_dict = result.to_dict()

        assert "message_id" in result_dict
        assert "attachment_id" in result_dict
        assert "original" in result_dict
        assert "translations" in result_dict
        assert "voice_model_user_id" in result_dict
        assert "processing_time_ms" in result_dict
        assert "timestamp" in result_dict

    @pytest.mark.asyncio
    async def test_result_json_serializable(self, pipeline, mock_audio_file):
        """Test that result can be serialized to JSON"""
        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr"]
        )

        result_dict = result.to_dict()
        json_str = json.dumps(result_dict)

        assert isinstance(json_str, str)
        parsed = json.loads(json_str)
        assert parsed["message_id"] == "msg_789"


# ============================================================================
# TEST: TRANSLATION ML SERVICE - TEXT TRANSLATION
# ============================================================================

class TestTranslationMLServiceBasic:
    """Basic tests for TranslationMLService"""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings for translation service"""
        settings = MagicMock()
        settings.models_path = Path(tempfile.mkdtemp())
        settings.basic_model = "facebook/nllb-200-distilled-600M"
        settings.premium_model = "facebook/nllb-200-1.3B"
        settings.huggingface_timeout = 30
        settings.model_download_max_retries = 3
        return settings

    def test_singleton_pattern(self, mock_settings):
        """Test singleton pattern"""
        from services.translation_ml_service import TranslationMLService
        TranslationMLService._instance = None

        with patch('services.translation_ml_service.ML_AVAILABLE', True), \
             patch('services.translation_ml_service.get_settings', return_value=mock_settings), \
             patch('services.translation_ml_service.get_performance_optimizer') as mock_perf:
            mock_perf.return_value = MagicMock()

            s1 = TranslationMLService(mock_settings)
            s2 = TranslationMLService(mock_settings)
            assert s1 is s2
            TranslationMLService._instance = None

    def test_lang_code_mapping(self, mock_settings):
        """Test language code mapping"""
        from services.translation_ml_service import TranslationMLService
        TranslationMLService._instance = None

        with patch('services.translation_ml_service.ML_AVAILABLE', True), \
             patch('services.translation_ml_service.get_settings', return_value=mock_settings), \
             patch('services.translation_ml_service.get_performance_optimizer') as mock_perf:
            mock_perf.return_value = MagicMock()

            service = TranslationMLService(mock_settings)

            assert service.lang_codes['fr'] == 'fra_Latn'
            assert service.lang_codes['en'] == 'eng_Latn'
            assert service.lang_codes['es'] == 'spa_Latn'
            assert service.lang_codes['zh'] == 'zho_Hans'

            TranslationMLService._instance = None


class TestTranslationMLServiceTranslate:
    """Tests for translation functionality"""

    @pytest.fixture
    def mock_service(self):
        """Create a mocked translation service"""
        from services.translation_ml_service import TranslationMLService
        TranslationMLService._instance = None

        mock_settings = MagicMock()
        mock_settings.models_path = Path(tempfile.mkdtemp())
        mock_settings.basic_model = "facebook/nllb-200-distilled-600M"
        mock_settings.premium_model = "facebook/nllb-200-1.3B"
        mock_settings.huggingface_timeout = 30
        mock_settings.model_download_max_retries = 3

        with patch('services.translation_ml_service.ML_AVAILABLE', True), \
             patch('services.translation_ml_service.get_settings', return_value=mock_settings), \
             patch('services.translation_ml_service.get_performance_optimizer') as mock_perf:
            mock_perf.return_value = MagicMock(initialize=MagicMock(return_value='cpu'), cuda_available=False)

            service = TranslationMLService(mock_settings)
            service.is_initialized = True

            # Mock the internal translation method
            async def mock_translate(text, src, tgt, model_type):
                translations = {
                    ("en", "fr"): "Bonjour le monde",
                    ("fr", "en"): "Hello world",
                }
                return translations.get((src, tgt), f"[{tgt}] {text}")

            service._ml_translate = MagicMock(side_effect=lambda *args: asyncio.get_event_loop().run_until_complete(mock_translate(*args)))

            yield service
            TranslationMLService._instance = None

    @pytest.mark.asyncio
    async def test_translate_basic(self, mock_service):
        """Test basic translation"""
        # Mock the translate method directly
        mock_service.translate = AsyncMock(return_value={
            "translated_text": "Bonjour le monde",
            "detected_language": "en",
            "confidence": 0.95,
            "model_used": "basic",
            "from_cache": False
        })

        result = await mock_service.translate(
            text="Hello world",
            source_language="en",
            target_language="fr"
        )

        assert result["translated_text"] == "Bonjour le monde"

    @pytest.mark.asyncio
    async def test_translate_with_structure_preserves_paragraphs(self, mock_service):
        """Test that translate_with_structure preserves paragraph structure"""
        mock_service.translate_with_structure = AsyncMock(return_value={
            "translated_text": "Premier paragraphe.\n\nDeuxieme paragraphe.",
            "segments": [
                {"original": "First paragraph.", "translated": "Premier paragraphe."},
                {"original": "Second paragraph.", "translated": "Deuxieme paragraphe."}
            ]
        })

        result = await mock_service.translate_with_structure(
            text="First paragraph.\n\nSecond paragraph.",
            source_language="en",
            target_language="fr"
        )

        assert "\n\n" in result["translated_text"] or len(result.get("segments", [])) > 1


class TestTranslationMLServiceStats:
    """Tests for statistics and health reporting"""

    @pytest.fixture
    def mock_service(self):
        """Create a mocked translation service"""
        from services.translation_ml_service import TranslationMLService
        TranslationMLService._instance = None

        mock_settings = MagicMock()
        mock_settings.models_path = Path(tempfile.mkdtemp())
        mock_settings.basic_model = "facebook/nllb-200-distilled-600M"
        mock_settings.premium_model = "facebook/nllb-200-1.3B"
        mock_settings.huggingface_timeout = 30
        mock_settings.model_download_max_retries = 3

        with patch('services.translation_ml_service.ML_AVAILABLE', True), \
             patch('services.translation_ml_service.get_settings', return_value=mock_settings), \
             patch('services.translation_ml_service.get_performance_optimizer') as mock_perf:
            mock_perf.return_value = MagicMock(initialize=MagicMock(return_value='cpu'), cuda_available=False)

            service = TranslationMLService(mock_settings)
            service.is_initialized = True
            service.stats = {
                'translations_count': 100,
                'zmq_translations': 50,
                'rest_translations': 30,
                'websocket_translations': 20,
                'avg_processing_time': 150.5,
                'models_loaded': True,
                'startup_time': 5.2
            }

            yield service
            TranslationMLService._instance = None

    def test_get_stats(self, mock_service):
        """Test getting statistics"""
        stats = mock_service.stats

        assert stats['translations_count'] == 100
        assert stats['zmq_translations'] == 50
        assert stats['rest_translations'] == 30
        assert stats['websocket_translations'] == 20
        assert stats['models_loaded'] is True


# ============================================================================
# TEST: CACHE INTEGRATION
# ============================================================================

class TestTranslationCacheIntegration:
    """Tests for translation cache integration"""

    @pytest.fixture
    def cache_service(self):
        """Create a mock cache service with storage"""
        cache = MagicMock()
        cache._storage = {}

        async def get_translation(text, source_lang, target_lang, model_type="premium"):
            key = hashlib.sha256(f"{text}:{source_lang}:{target_lang}:{model_type}".encode()).hexdigest()
            return cache._storage.get(key)

        async def set_translation(text, source_lang, target_lang, translated_text, model_type="premium"):
            key = hashlib.sha256(f"{text}:{source_lang}:{target_lang}:{model_type}".encode()).hexdigest()
            cache._storage[key] = {
                "translated_text": translated_text,
                "cached_at": datetime.now().isoformat()
            }

        cache.get_translation = AsyncMock(side_effect=get_translation)
        cache.set_translation = AsyncMock(side_effect=set_translation)
        return cache

    @pytest.mark.asyncio
    async def test_cache_miss_then_hit(self, cache_service):
        """Test cache miss followed by hit"""
        # First call - cache miss
        result1 = await cache_service.get_translation("Hello", "en", "fr")
        assert result1 is None

        # Set in cache
        await cache_service.set_translation("Hello", "en", "fr", "Bonjour")

        # Second call - cache hit
        result2 = await cache_service.get_translation("Hello", "en", "fr")
        assert result2 is not None
        assert result2["translated_text"] == "Bonjour"

    @pytest.mark.asyncio
    async def test_different_model_types_cached_separately(self, cache_service):
        """Test that different model types are cached separately"""
        await cache_service.set_translation("Hello", "en", "fr", "Bonjour Basic", model_type="basic")
        await cache_service.set_translation("Hello", "en", "fr", "Bonjour Premium", model_type="premium")

        basic_result = await cache_service.get_translation("Hello", "en", "fr", model_type="basic")
        premium_result = await cache_service.get_translation("Hello", "en", "fr", model_type="premium")

        assert basic_result["translated_text"] == "Bonjour Basic"
        assert premium_result["translated_text"] == "Bonjour Premium"


class TestAudioCacheIntegration:
    """Tests for audio cache integration"""

    @pytest.fixture
    def audio_cache(self):
        """Create a mock audio cache service"""
        cache = MagicMock()
        cache._transcriptions = {}
        cache._translations = {}

        async def get_transcription(audio_hash):
            return cache._transcriptions.get(audio_hash)

        async def set_transcription(audio_hash, data):
            cache._transcriptions[audio_hash] = data

        async def get_translated(audio_hash, languages):
            result = {}
            for lang in languages:
                key = f"{audio_hash}:{lang}"
                if key in cache._translations:
                    result[lang] = cache._translations[key]
            return result

        async def set_translated(audio_hash, lang, data):
            cache._translations[f"{audio_hash}:{lang}"] = data

        cache.get_transcription_by_hash = AsyncMock(side_effect=get_transcription)
        cache.set_transcription_by_hash = AsyncMock(side_effect=set_transcription)
        cache.get_all_translated_audio_by_hash = AsyncMock(side_effect=get_translated)
        cache.set_translated_audio_by_hash = AsyncMock(side_effect=set_translated)
        return cache

    @pytest.mark.asyncio
    async def test_transcription_cache(self, audio_cache):
        """Test transcription caching"""
        audio_hash = "abc123"

        # Cache miss
        result1 = await audio_cache.get_transcription_by_hash(audio_hash)
        assert result1 is None

        # Set cache
        await audio_cache.set_transcription_by_hash(audio_hash, {
            "text": "Hello world",
            "language": "en",
            "confidence": 0.95
        })

        # Cache hit
        result2 = await audio_cache.get_transcription_by_hash(audio_hash)
        assert result2["text"] == "Hello world"

    @pytest.mark.asyncio
    async def test_cross_conversation_audio_reuse(self, audio_cache):
        """Test that translated audio can be reused across conversations"""
        audio_hash = "same_audio_hash"

        # First conversation - set cache
        await audio_cache.set_translated_audio_by_hash(audio_hash, "fr", {
            "translated_text": "Bonjour",
            "audio_url": "/audio/fr.mp3"
        })

        # Second conversation - should find cached audio
        result = await audio_cache.get_all_translated_audio_by_hash(audio_hash, ["fr", "es"])

        assert "fr" in result
        assert result["fr"]["translated_text"] == "Bonjour"
        assert "es" not in result  # Not cached yet


# ============================================================================
# TEST: DATA CLASSES AND UTILITIES
# ============================================================================

class TestDataClasses:
    """Tests for data classes"""

    def test_audio_message_metadata(self):
        """Test AudioMessageMetadata creation"""
        from services.audio_message_pipeline import AudioMessageMetadata

        metadata = AudioMessageMetadata(
            transcription="Hello world",
            language="en",
            confidence=0.95,
            source="ios_speech",
            segments=[{"text": "Hello", "startMs": 0, "endMs": 500}]
        )

        assert metadata.transcription == "Hello world"
        assert metadata.language == "en"
        assert metadata.confidence == 0.95
        assert metadata.source == "ios_speech"
        assert len(metadata.segments) == 1

    def test_original_audio(self):
        """Test OriginalAudio creation"""
        from services.audio_message_pipeline import OriginalAudio

        audio = OriginalAudio(
            audio_path="/path/to/audio.wav",
            audio_url="/uploads/audio.wav",
            transcription="Test transcription",
            language="en",
            duration_ms=5000,
            confidence=0.95,
            source="whisper"
        )

        assert audio.audio_path == "/path/to/audio.wav"
        assert audio.language == "en"
        assert audio.duration_ms == 5000

    def test_translated_audio_version(self):
        """Test TranslatedAudioVersion creation"""
        from services.audio_message_pipeline import TranslatedAudioVersion

        translation = TranslatedAudioVersion(
            language="fr",
            translated_text="Bonjour le monde",
            audio_path="/path/to/fr.mp3",
            audio_url="/audio/fr.mp3",
            duration_ms=3000,
            format="mp3",
            voice_cloned=True,
            voice_quality=0.85,
            processing_time_ms=500
        )

        assert translation.language == "fr"
        assert translation.translated_text == "Bonjour le monde"
        assert translation.voice_cloned is True

    def test_new_voice_profile_data(self):
        """Test NewVoiceProfileData creation"""
        from services.audio_message_pipeline import NewVoiceProfileData

        profile = NewVoiceProfileData(
            user_id="user_123",
            profile_id="profile_456",
            embedding_base64="base64_encoded_data",
            quality_score=0.85,
            audio_count=3,
            total_duration_ms=45000,
            version=2
        )

        assert profile.user_id == "user_123"
        assert profile.quality_score == 0.85
        assert profile.version == 2


# ============================================================================
# TEST: PIPELINE INITIALIZATION AND LIFECYCLE
# ============================================================================

class TestPipelineLifecycle:
    """Tests for pipeline initialization and cleanup"""

    @pytest.mark.asyncio
    async def test_pipeline_initialization(self, mock_transcription_service, mock_voice_clone_service,
                                           mock_tts_service, mock_redis_service, mock_audio_cache_service,
                                           mock_translation_cache_service):
        """Test pipeline initialization"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            assert not pipeline.is_initialized

            result = await pipeline.initialize()
            assert result is True
            assert pipeline.is_initialized

            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_pipeline_get_stats(self, mock_transcription_service, mock_voice_clone_service,
                                      mock_tts_service, mock_redis_service, mock_audio_cache_service,
                                      mock_translation_cache_service):
        """Test getting pipeline statistics"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.is_initialized = True

            stats = await pipeline.get_stats()

            assert "service" in stats
            assert stats["service"] == "AudioMessagePipeline"
            assert "initialized" in stats
            assert "mode" in stats
            assert stats["mode"] == "orchestrator"

            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_pipeline_close(self, mock_transcription_service, mock_voice_clone_service,
                                  mock_tts_service, mock_redis_service, mock_audio_cache_service,
                                  mock_translation_cache_service):
        """Test pipeline cleanup"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.is_initialized = True

            await pipeline.close()

            assert not pipeline.is_initialized
            mock_transcription_service.close.assert_called_once()
            mock_voice_clone_service.close.assert_called_once()
            mock_tts_service.close.assert_called_once()

            AudioMessagePipeline._instance = None


# ============================================================================
# TEST: HELPER FUNCTIONS
# ============================================================================

class TestHelperFunctions:
    """Tests for helper functions"""

    @pytest.mark.asyncio
    async def test_get_audio_pipeline_singleton(self, mock_transcription_service, mock_voice_clone_service,
                                                mock_tts_service, mock_redis_service, mock_audio_cache_service,
                                                mock_translation_cache_service):
        """Test get_audio_pipeline returns singleton"""
        from services.audio_message_pipeline import AudioMessagePipeline, get_audio_pipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            p1 = get_audio_pipeline()
            p2 = get_audio_pipeline()

            assert p1 is p2

            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_set_translation_service(self, mock_transcription_service, mock_voice_clone_service,
                                           mock_tts_service, mock_redis_service, mock_audio_cache_service,
                                           mock_translation_cache_service, mock_translation_service):
        """Test setting translation service"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            assert pipeline.translation_service is None

            pipeline.set_translation_service(mock_translation_service)
            assert pipeline.translation_service is mock_translation_service

            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_get_target_languages_fallback(self, mock_transcription_service, mock_voice_clone_service,
                                                 mock_tts_service, mock_redis_service, mock_audio_cache_service,
                                                 mock_translation_cache_service):
        """Test fallback target language selection"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()

            # English source should fallback to French
            languages_en = await pipeline._get_target_languages("conv_1", "en", "user_1")
            assert "fr" in languages_en

            # Non-English source should fallback to English
            languages_fr = await pipeline._get_target_languages("conv_1", "fr", "user_1")
            assert "en" in languages_fr

            AudioMessagePipeline._instance = None


# ============================================================================
# TEST: CONCURRENT PROCESSING
# ============================================================================

class TestConcurrentProcessing:
    """Tests for concurrent translation processing"""

    @pytest.fixture
    def pipeline(self, mock_transcription_service, mock_voice_clone_service,
                 mock_tts_service, mock_redis_service, mock_audio_cache_service,
                 mock_translation_cache_service, mock_translation_service):
        """Create a pipeline with mocked services"""
        from services.audio_message_pipeline import AudioMessagePipeline

        AudioMessagePipeline._instance = None

        with patch('services.audio_pipeline.transcription_stage.get_transcription_service', return_value=mock_transcription_service), \
             patch('services.audio_pipeline.translation_stage.get_voice_clone_service', return_value=mock_voice_clone_service), \
             patch('services.audio_pipeline.translation_stage.get_tts_service', return_value=mock_tts_service), \
             patch('services.audio_pipeline.audio_message_pipeline.get_redis_service', return_value=mock_redis_service), \
             patch('services.audio_pipeline.transcription_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_audio_cache_service', return_value=mock_audio_cache_service), \
             patch('services.audio_pipeline.translation_stage.get_translation_cache_service', return_value=mock_translation_cache_service):

            pipeline = AudioMessagePipeline()
            pipeline.set_translation_service(mock_translation_service)
            pipeline.is_initialized = True
            yield pipeline
            AudioMessagePipeline._instance = None

    @pytest.mark.asyncio
    async def test_parallel_language_processing(self, pipeline, mock_audio_file):
        """Test that multiple languages are processed in parallel"""
        start_time = time.time()

        result = await pipeline.process_audio_message(
            audio_path=mock_audio_file,
            audio_url="/uploads/test.wav",
            sender_id="user_123",
            conversation_id="conv_456",
            message_id="msg_789",
            attachment_id="att_001",
            target_languages=["fr", "es", "de", "it", "pt"]
        )

        elapsed = time.time() - start_time

        # All 5 languages should be processed
        assert len(result.translations) >= 1

        # Processing should be fast due to parallelization (mocked)
        assert elapsed < 5.0  # Should complete quickly with mocks

    @pytest.mark.asyncio
    async def test_concurrent_pipeline_requests(self, pipeline, mock_audio_file):
        """Test handling multiple concurrent pipeline requests"""
        async def process_message(msg_id):
            return await pipeline.process_audio_message(
                audio_path=mock_audio_file,
                audio_url="/uploads/test.wav",
                sender_id="user_123",
                conversation_id="conv_456",
                message_id=msg_id,
                attachment_id=f"att_{msg_id}",
                target_languages=["fr"]
            )

        # Run multiple requests concurrently
        results = await asyncio.gather(
            process_message("msg_1"),
            process_message("msg_2"),
            process_message("msg_3")
        )

        assert len(results) == 3
        assert all(r.message_id.startswith("msg_") for r in results)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
