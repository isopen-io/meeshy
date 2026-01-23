#!/usr/bin/env python3
"""
Test 09 - AudioMessagePipeline Integration Tests
Tests for the complete audio processing pipeline with mocked dependencies
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
import contextlib
from pathlib import Path
from datetime import datetime
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass, field
import numpy as np

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import with fallbacks
try:
    from services.audio_message_pipeline import (
        AudioMessagePipeline,
        AudioMessageResult,
        AudioMessageMetadata,
        OriginalAudio,
        TranslatedAudioVersion,
        get_audio_pipeline
    )
    from services.transcription_service import TranscriptionResult, TranscriptionSegment
    from services.voice_clone_service import VoiceModel
    from services.tts_service import TTSResult
    PIPELINE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"AudioMessagePipeline not available: {e}")
    PIPELINE_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# CI/LOCAL ENVIRONMENT DETECTION
# ═══════════════════════════════════════════════════════════════
# In CI: Mock cache services to avoid Redis connection timeouts
# In local: Allow real services for integration testing (if Redis available)
IS_CI = os.getenv('CI', 'false').lower() == 'true'

if IS_CI:
    logger.info("🔧 CI Environment detected - Using mocked cache services")
else:
    logger.info("💻 Local Environment detected - Real services will be used (if available)")


# ═══════════════════════════════════════════════════════════════
# MOCK HELPERS
# ═══════════════════════════════════════════════════════════════

@contextlib.contextmanager
def conditional_cache_patches(cache_mocks):
    """
    Context manager that applies cache service patches ONLY in CI.
    In local environment, returns a no-op context manager.

    Usage:
        with conditional_cache_patches(mock_cache_services_if_ci):
            # Test code here
            # - CI: Uses mocked cache services
            # - Local: Uses real cache services (if available)
    """
    if cache_mocks is None:
        # Local environment - no mocking
        yield
        return

    # CI environment - apply all cache service patches
    with patch('services.audio_message_pipeline.get_audio_cache_service', return_value=cache_mocks['audio_cache']):
        with patch('services.audio_message_pipeline.get_translation_cache_service', return_value=cache_mocks['translation_cache']):
            with patch('services.audio_message_pipeline.get_redis_service', return_value=cache_mocks['redis']):
                yield


def create_mock_transcription_result(text="Test transcribed text", language="en"):
    """Create a mock TranscriptionResult"""
    return TranscriptionResult(
        text=text,
        language=language,
        confidence=0.95,
        segments=[
            TranscriptionSegment(text=text, start_ms=0, end_ms=2000, confidence=0.95)
        ],
        duration_ms=2000,
        source="whisper",
        model="whisper-large-v3",
        processing_time_ms=100
    )


def create_mock_voice_model(user_id="test_user"):
    """Create a mock VoiceModel"""
    return VoiceModel(
        user_id=user_id,
        embedding_path=f"/tmp/voice_models/{user_id}/embedding.pkl",
        audio_count=2,
        total_duration_ms=20000,
        quality_score=0.75,
        version=1,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        embedding=np.zeros(256)
    )


def create_mock_tts_result(language="fr", voice_cloned=True):
    """Create a mock TTSResult"""
    return TTSResult(
        audio_path=f"/tmp/outputs/audio/translated/msg_{language}.mp3",
        audio_url=f"/outputs/audio/translated/msg_{language}.mp3",
        duration_ms=2500,
        format="mp3",
        language=language,
        voice_cloned=voice_cloned,
        voice_quality=0.75 if voice_cloned else 0.0,
        processing_time_ms=200,
        text_length=50
    )


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def temp_dir():
    """Create temporary directory"""
    temp_path = tempfile.mkdtemp(prefix="pipeline_test_")
    yield Path(temp_path)
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def mock_audio_file(temp_dir):
    """Create a mock audio file"""
    audio_path = temp_dir / "test_message.m4a"
    audio_path.touch()
    return audio_path


@pytest.fixture
def mock_transcription_service():
    """Create mock transcription service"""
    mock = MagicMock()
    mock.is_initialized = True

    async def transcribe(audio_path, mobile_transcription=None, return_timestamps=True):
        if mobile_transcription and mobile_transcription.get('text'):
            return TranscriptionResult(
                text=mobile_transcription['text'],
                language=mobile_transcription.get('language', 'en'),
                confidence=mobile_transcription.get('confidence', 0.9),
                segments=[],
                duration_ms=3000,
                source="mobile",
                model="mobile",
                processing_time_ms=10
            )
        return create_mock_transcription_result()

    mock.transcribe = AsyncMock(side_effect=transcribe)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={"initialized": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_voice_clone_service():
    """Create mock voice clone service"""
    mock = MagicMock()
    mock.is_initialized = True

    async def get_or_create_voice_model(user_id, current_audio_path=None, current_audio_duration_ms=0):
        return create_mock_voice_model(user_id)

    mock.get_or_create_voice_model = AsyncMock(side_effect=get_or_create_voice_model)
    mock.initialize = AsyncMock(return_value=True)
    mock.set_database_service = MagicMock()
    mock.get_stats = AsyncMock(return_value={"initialized": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_tts_service():
    """Create mock TTS service"""
    mock = MagicMock()
    mock.is_initialized = True

    async def synthesize_with_voice(text, voice_model, target_language, output_format="mp3", message_id=None):
        return create_mock_tts_result(target_language, voice_cloned=True)

    async def synthesize(text, language, output_format="mp3", speaker=None):
        return create_mock_tts_result(language, voice_cloned=False)

    mock.synthesize_with_voice = AsyncMock(side_effect=synthesize_with_voice)
    mock.synthesize = AsyncMock(side_effect=synthesize)
    mock.initialize = AsyncMock(return_value=True)
    mock.get_stats = AsyncMock(return_value={"initialized": True})
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_translation_service():
    """Create mock translation service"""
    mock = MagicMock()

    translations = {
        ("en", "fr"): "Ceci est un texte de test traduit.",
        ("en", "es"): "Este es un texto de prueba traducido.",
        ("en", "de"): "Dies ist ein ubersetzter Testtext.",
        ("fr", "en"): "This is a translated test text.",
    }

    async def translate_with_structure(text, source_language, target_language, model_type="medium", source_channel=None):
        key = (source_language, target_language)
        translated = translations.get(key, f"[{target_language}] {text}")
        return {"translated_text": translated, "confidence": 0.9}

    mock.translate_with_structure = AsyncMock(side_effect=translate_with_structure)
    return mock


@pytest.fixture
def mock_database_service():
    """Create mock database service"""
    mock = MagicMock()
    mock.prisma = MagicMock()

    # Mock conversation members query
    mock_member = MagicMock()
    mock_member.user = MagicMock()
    mock_member.user.useCustomDestination = False
    mock_member.user.translateToSystemLanguage = True
    mock_member.user.systemLanguage = "fr"
    mock_member.user.translateToRegionalLanguage = False
    mock_member.user.regionalLanguage = "fr"

    mock.prisma.conversationmember = MagicMock()
    mock.prisma.conversationmember.find_many = AsyncMock(return_value=[mock_member])

    # Mock transcription create
    mock.prisma.messageaudiotranscription = MagicMock()
    mock.prisma.messageaudiotranscription.create = AsyncMock(return_value=MagicMock())

    # Mock translated audio create
    mock.prisma.messagetranslatedaudio = MagicMock()
    mock.prisma.messagetranslatedaudio.create = AsyncMock(return_value=MagicMock())

    return mock


@pytest.fixture
def mock_cache_services_if_ci():
    """
    Create mock cache services ONLY in CI environment.
    Returns None in local environment to allow real services.

    Pattern: Use this fixture to avoid Redis connection timeouts in CI
    while allowing integration tests with real Redis in local dev.
    """
    if not IS_CI:
        return None

    # Mock audio cache service
    mock_audio_cache = MagicMock()
    mock_audio_cache.get_or_compute_audio_hash = AsyncMock(return_value="test_hash")
    mock_audio_cache.get_transcription_by_hash = AsyncMock(return_value=None)
    mock_audio_cache.set_transcription_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_all_translated_audio_by_hash = AsyncMock(return_value={})
    mock_audio_cache.set_translated_audio_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_stats = MagicMock(return_value={})

    # Mock translation cache service
    mock_translation_cache = MagicMock()
    mock_translation_cache.get_translation = AsyncMock(return_value=None)
    mock_translation_cache.set_translation = AsyncMock(return_value=True)
    mock_translation_cache.get_stats = MagicMock(return_value={})

    # Mock redis service
    mock_redis = MagicMock()
    mock_redis.is_available = MagicMock(return_value=False)
    mock_redis.get_stats = MagicMock(return_value={})
    mock_redis.initialize = AsyncMock(return_value=True)
    mock_redis.close = AsyncMock()

    return {
        'audio_cache': mock_audio_cache,
        'translation_cache': mock_translation_cache,
        'redis': mock_redis
    }


# ═══════════════════════════════════════════════════════════════
# INTEGRATION TESTS
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_pipeline_singleton():
    """Test singleton pattern"""
    logger.info("Test 09.1: Singleton pattern")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    pipeline1 = AudioMessagePipeline()
    pipeline2 = AudioMessagePipeline()

    assert pipeline1 is pipeline2
    logger.info("Singleton pattern works correctly")


@pytest.mark.asyncio
async def test_pipeline_initialization(
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service
):
    """Test pipeline initialization"""
    logger.info("Test 09.2: Pipeline initialization")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
        with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
            with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                pipeline = AudioMessagePipeline()
                pipeline._initialized = True
                pipeline.is_initialized = False

                result = await pipeline.initialize()

    assert result is True
    assert pipeline.is_initialized is True
    logger.info("Pipeline initialized successfully")


@pytest.mark.asyncio
async def test_pipeline_full_flow_with_mobile_transcription(
    mock_audio_file,
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service,
    mock_database_service,
    mock_cache_services_if_ci
):
    """Test complete pipeline with mobile transcription"""
    logger.info("Test 09.3: Full flow with mobile transcription")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with conditional_cache_patches(mock_cache_services_if_ci):
        with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
            with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
                with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                    pipeline = AudioMessagePipeline(
                        translation_service=mock_translation_service,
                        database_service=mock_database_service
                    )
                    pipeline.is_initialized = True

                    # Process with mobile metadata
                    metadata = AudioMessageMetadata(
                        transcription="Hello, this is a test message from mobile.",
                        language="en",
                        confidence=0.92,
                        source="ios_speech"
                    )

                    result = await pipeline.process_audio_message(
                        audio_path=str(mock_audio_file),
                        audio_url="/uploads/test.m4a",
                        sender_id="sender_123",
                        conversation_id="conv_456",
                        message_id="msg_789",
                        attachment_id="att_012",
                        audio_duration_ms=3000,
                        metadata=metadata,
                        target_languages=["fr", "es"],
                        generate_voice_clone=True
                    )

    assert result is not None
    assert result.message_id == "msg_789"
    assert result.original.source == "mobile"
    assert result.original.transcription == "Hello, this is a test message from mobile."
    assert "fr" in result.translations
    assert "es" in result.translations
    assert result.translations["fr"].voice_cloned is True
    assert result.voice_model_quality > 0

    logger.info(f"Pipeline processed successfully: {len(result.translations)} translations")


@pytest.mark.asyncio
async def test_pipeline_full_flow_with_whisper(
    mock_audio_file,
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service
):
    """Test complete pipeline with Whisper transcription (no mobile data)"""
    logger.info("Test 09.4: Full flow with Whisper")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    # Create mock audio cache to prevent cache interference
    mock_audio_cache = MagicMock()
    mock_audio_cache.get_or_compute_audio_hash = AsyncMock(return_value="whisper_test_hash")
    mock_audio_cache.get_transcription_by_hash = AsyncMock(return_value=None)  # No cached transcription
    mock_audio_cache.set_transcription_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_all_translated_audio_by_hash = AsyncMock(return_value={})  # No cached translations
    mock_audio_cache.set_translated_audio_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_stats = MagicMock(return_value={})

    # Create mock translation cache
    mock_translation_cache = MagicMock()
    mock_translation_cache.get_translation = AsyncMock(return_value=None)
    mock_translation_cache.set_translation = AsyncMock(return_value=True)
    mock_translation_cache.get_stats = MagicMock(return_value={})

    # Create mock redis service
    mock_redis = MagicMock()
    mock_redis.is_available = MagicMock(return_value=False)
    mock_redis.get_stats = MagicMock(return_value={})
    mock_redis.initialize = AsyncMock(return_value=True)
    mock_redis.close = AsyncMock()

    with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
        with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
            with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                with patch('services.audio_message_pipeline.get_audio_cache_service', return_value=mock_audio_cache):
                    with patch('services.audio_message_pipeline.get_translation_cache_service', return_value=mock_translation_cache):
                        with patch('services.audio_message_pipeline.get_redis_service', return_value=mock_redis):
                            pipeline = AudioMessagePipeline(translation_service=mock_translation_service)
                            pipeline.is_initialized = True

                            result = await pipeline.process_audio_message(
                                audio_path=str(mock_audio_file),
                                audio_url="/uploads/test.m4a",
                                sender_id="sender_456",
                                conversation_id="conv_789",
                                message_id="msg_012",
                                attachment_id="att_345",
                                metadata=None,  # No mobile data
                                target_languages=["fr"]
                            )

    assert result is not None
    assert result.original.source == "whisper"
    assert "fr" in result.translations

    logger.info("Pipeline with Whisper works correctly")


@pytest.mark.asyncio
async def test_pipeline_without_voice_cloning(
    mock_audio_file,
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service
):
    """Test pipeline without voice cloning"""
    logger.info("Test 09.5: Pipeline without voice cloning")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    # Create mock audio cache to prevent cache interference
    mock_audio_cache = MagicMock()
    mock_audio_cache.get_or_compute_audio_hash = AsyncMock(return_value="no_voice_clone_hash")
    mock_audio_cache.get_transcription_by_hash = AsyncMock(return_value=None)  # No cached transcription
    mock_audio_cache.set_transcription_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_all_translated_audio_by_hash = AsyncMock(return_value={})  # No cached translations
    mock_audio_cache.set_translated_audio_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_stats = MagicMock(return_value={})

    # Create mock translation cache
    mock_translation_cache = MagicMock()
    mock_translation_cache.get_translation = AsyncMock(return_value=None)
    mock_translation_cache.set_translation = AsyncMock(return_value=True)
    mock_translation_cache.get_stats = MagicMock(return_value={})

    # Create mock redis service
    mock_redis = MagicMock()
    mock_redis.is_available = MagicMock(return_value=False)
    mock_redis.get_stats = MagicMock(return_value={})
    mock_redis.initialize = AsyncMock(return_value=True)
    mock_redis.close = AsyncMock()

    with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
        with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
            with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                with patch('services.audio_message_pipeline.get_audio_cache_service', return_value=mock_audio_cache):
                    with patch('services.audio_message_pipeline.get_translation_cache_service', return_value=mock_translation_cache):
                        with patch('services.audio_message_pipeline.get_redis_service', return_value=mock_redis):
                            pipeline = AudioMessagePipeline(translation_service=mock_translation_service)
                            pipeline.is_initialized = True

                            result = await pipeline.process_audio_message(
                                audio_path=str(mock_audio_file),
                                audio_url="/uploads/test.m4a",
                                sender_id="sender_789",
                                conversation_id="conv_012",
                                message_id="msg_345",
                                attachment_id="att_678",
                                target_languages=["fr"],
                                generate_voice_clone=False  # Disable voice cloning
                            )

    assert result is not None
    assert result.voice_model_quality == 0.0
    assert result.translations["fr"].voice_cloned is False

    logger.info("Pipeline without voice cloning works correctly")


@pytest.mark.asyncio
async def test_pipeline_multiple_languages(
    mock_audio_file,
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service,
    mock_cache_services_if_ci
):
    """Test pipeline with multiple target languages"""
    logger.info("Test 09.6: Multiple target languages")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with conditional_cache_patches(mock_cache_services_if_ci):
        with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
            with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
                with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                    pipeline = AudioMessagePipeline(translation_service=mock_translation_service)
                    pipeline.is_initialized = True

                    target_langs = ["fr", "es", "de"]

                    result = await pipeline.process_audio_message(
                        audio_path=str(mock_audio_file),
                        audio_url="/uploads/test.m4a",
                        sender_id="sender_multi",
                        conversation_id="conv_multi",
                        message_id="msg_multi",
                        attachment_id="att_multi",
                        target_languages=target_langs
                    )

    assert result is not None
    assert len(result.translations) == 3
    for lang in target_langs:
        assert lang in result.translations
        assert result.translations[lang].language == lang

    logger.info(f"Multiple languages processed: {list(result.translations.keys())}")


@pytest.mark.asyncio
async def test_pipeline_voice_clone_failure_fallback(
    mock_audio_file,
    mock_transcription_service,
    mock_tts_service,
    mock_translation_service
):
    """Test fallback when voice cloning fails"""
    logger.info("Test 09.7: Voice clone failure fallback")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    # Create voice clone service that fails
    mock_voice_clone = MagicMock()
    mock_voice_clone.is_initialized = True
    mock_voice_clone.get_or_create_voice_model = AsyncMock(side_effect=Exception("Voice clone failed"))
    mock_voice_clone.initialize = AsyncMock(return_value=True)
    mock_voice_clone.set_database_service = MagicMock()
    mock_voice_clone.get_stats = AsyncMock(return_value={})
    mock_voice_clone.close = AsyncMock()

    # Create mock audio cache to prevent cache interference
    mock_audio_cache = MagicMock()
    mock_audio_cache.get_or_compute_audio_hash = AsyncMock(return_value="voice_clone_fail_hash")
    mock_audio_cache.get_transcription_by_hash = AsyncMock(return_value=None)  # No cached transcription
    mock_audio_cache.set_transcription_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_all_translated_audio_by_hash = AsyncMock(return_value={})  # No cached translations
    mock_audio_cache.set_translated_audio_by_hash = AsyncMock(return_value=True)
    mock_audio_cache.get_stats = MagicMock(return_value={})

    # Create mock translation cache
    mock_translation_cache = MagicMock()
    mock_translation_cache.get_translation = AsyncMock(return_value=None)
    mock_translation_cache.set_translation = AsyncMock(return_value=True)
    mock_translation_cache.get_stats = MagicMock(return_value={})

    # Create mock redis service
    mock_redis = MagicMock()
    mock_redis.is_available = MagicMock(return_value=False)
    mock_redis.get_stats = MagicMock(return_value={})
    mock_redis.initialize = AsyncMock(return_value=True)
    mock_redis.close = AsyncMock()

    with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
        with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone):
            with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                with patch('services.audio_message_pipeline.get_audio_cache_service', return_value=mock_audio_cache):
                    with patch('services.audio_message_pipeline.get_translation_cache_service', return_value=mock_translation_cache):
                        with patch('services.audio_message_pipeline.get_redis_service', return_value=mock_redis):
                            pipeline = AudioMessagePipeline(translation_service=mock_translation_service)
                            pipeline.is_initialized = True

                            result = await pipeline.process_audio_message(
                                audio_path=str(mock_audio_file),
                                audio_url="/uploads/test.m4a",
                                sender_id="sender_fail",
                                conversation_id="conv_fail",
                                message_id="msg_fail",
                                attachment_id="att_fail",
                                target_languages=["fr"],
                                generate_voice_clone=True
                            )

    assert result is not None
    assert result.voice_model_quality == 0.0
    assert result.translations["fr"].voice_cloned is False

    logger.info("Voice clone failure fallback works correctly")


@pytest.mark.asyncio
async def test_pipeline_result_to_dict(
    mock_audio_file,
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service,
    mock_cache_services_if_ci
):
    """Test result serialization to dict"""
    logger.info("Test 09.8: Result to_dict serialization")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with conditional_cache_patches(mock_cache_services_if_ci):
        with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
            with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
                with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                    pipeline = AudioMessagePipeline(translation_service=mock_translation_service)
                    pipeline.is_initialized = True

                    result = await pipeline.process_audio_message(
                        audio_path=str(mock_audio_file),
                        audio_url="/uploads/test.m4a",
                        sender_id="sender_dict",
                        conversation_id="conv_dict",
                        message_id="msg_dict",
                        attachment_id="att_dict",
                        target_languages=["fr"]
                    )

                    result_dict = result.to_dict()

    assert isinstance(result_dict, dict)
    assert "message_id" in result_dict
    assert "original" in result_dict
    assert "translations" in result_dict
    assert "processing_time_ms" in result_dict
    assert result_dict["original"]["language"] == "en"

    logger.info("Result serialization works correctly")


@pytest.mark.asyncio
async def test_pipeline_get_stats(
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service,
    mock_cache_services_if_ci
):
    """Test get_stats method"""
    logger.info("Test 09.9: Get stats")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with conditional_cache_patches(mock_cache_services_if_ci):
        with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
            with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
                with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                    pipeline = AudioMessagePipeline(translation_service=mock_translation_service)
                    pipeline.is_initialized = True

                    stats = await pipeline.get_stats()

    assert "service" in stats
    assert stats["service"] == "AudioMessagePipeline"
    assert "transcription" in stats
    assert "voice_clone" in stats
    assert "tts" in stats
    assert "translation_available" in stats
    assert stats["translation_available"] is True

    logger.info(f"Stats: {stats}")


@pytest.mark.asyncio
async def test_pipeline_close(
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service
):
    """Test close method"""
    logger.info("Test 09.10: Close method")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
        with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
            with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                pipeline = AudioMessagePipeline()
                pipeline.is_initialized = True

                await pipeline.close()

    mock_transcription_service.close.assert_called_once()
    mock_voice_clone_service.close.assert_called_once()
    mock_tts_service.close.assert_called_once()
    assert pipeline.is_initialized is False

    logger.info("Close method works correctly")


@pytest.mark.asyncio
async def test_pipeline_auto_language_detection(
    mock_audio_file,
    mock_transcription_service,
    mock_voice_clone_service,
    mock_tts_service,
    mock_translation_service,
    mock_database_service,
    mock_cache_services_if_ci
):
    """Test automatic target language detection from conversation members"""
    logger.info("Test 09.11: Auto language detection")

    if not PIPELINE_AVAILABLE:
        pytest.skip("AudioMessagePipeline not available")

    AudioMessagePipeline._instance = None

    with conditional_cache_patches(mock_cache_services_if_ci):
        with patch('services.audio_message_pipeline.get_transcription_service', return_value=mock_transcription_service):
            with patch('services.audio_message_pipeline.get_voice_clone_service', return_value=mock_voice_clone_service):
                with patch('services.audio_message_pipeline.get_tts_service', return_value=mock_tts_service):
                    pipeline = AudioMessagePipeline(
                        translation_service=mock_translation_service,
                        database_service=mock_database_service
                    )
                    pipeline.is_initialized = True

                    # Don't provide target_languages - should auto-detect
                    result = await pipeline.process_audio_message(
                        audio_path=str(mock_audio_file),
                        audio_url="/uploads/test.m4a",
                        sender_id="sender_auto",
                        conversation_id="conv_auto",
                        message_id="msg_auto",
                        attachment_id="att_auto",
                        target_languages=None  # Auto-detect
                    )

    assert result is not None
    assert len(result.translations) > 0
    # The mock returns "fr" as the member's language
    assert "fr" in result.translations

    logger.info("Auto language detection works correctly")


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

async def run_all_tests():
    """Run all pipeline integration tests"""
    logger.info("Starting AudioMessagePipeline Integration Tests (Test 09)")
    logger.info("=" * 60)

    passed = 0
    total = 11

    # Would need pytest to run properly - this is just for standalone execution
    logger.info("Run with: pytest test_09_audio_pipeline_integration.py -v")

    return True


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
