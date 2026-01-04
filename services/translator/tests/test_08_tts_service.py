#!/usr/bin/env python3
"""
Test 08 - TTSService Unit Tests
Tests for text-to-speech synthesis with voice cloning support
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass
from datetime import datetime
import numpy as np

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import service with graceful fallback
try:
    from services.tts_service import (
        TTSService,
        TTSResult,
        get_tts_service,
        TTS_AVAILABLE,
        AUDIO_PROCESSING_AVAILABLE
    )
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"TTSService not available: {e}")
    SERVICE_AVAILABLE = False
    TTS_AVAILABLE = False
    AUDIO_PROCESSING_AVAILABLE = False


# Mock VoiceModel for testing
@dataclass
class MockVoiceModel:
    user_id: str
    embedding_path: str
    quality_score: float = 0.8
    embedding: any = None


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def output_dir():
    """Create temporary output directory"""
    temp_dir = tempfile.mkdtemp(prefix="tts_output_")
    output_path = Path(temp_dir)
    (output_path / "translated").mkdir(parents=True)
    yield output_path
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def mock_voice_model(output_dir):
    """Create a mock voice model with audio file"""
    user_id = "test_voice_user"
    voice_dir = output_dir / "voice_models" / user_id
    voice_dir.mkdir(parents=True)

    # Create combined audio file (required by TTS for cloning)
    combined_audio = voice_dir / "combined_audio.wav"

    # Create minimal WAV file
    wav_header = bytes([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
        0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
        0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
        0x00, 0x00, 0x00, 0x00,
    ])
    with open(combined_audio, 'wb') as f:
        f.write(wav_header)

    return MockVoiceModel(
        user_id=user_id,
        embedding_path=str(voice_dir / "embedding.pkl"),
        quality_score=0.75,
        embedding=np.zeros(256)
    )


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - TTSService
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tts_service_singleton(output_dir):
    """Test singleton pattern"""
    logger.info("Test 08.1: Singleton pattern")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    # Reset singleton for testing
    TTSService._instance = None

    service1 = TTSService(output_dir=str(output_dir))
    service2 = TTSService()

    assert service1 is service2
    logger.info("Singleton pattern works correctly")


@pytest.mark.asyncio
async def test_tts_service_initialization(output_dir):
    """Test service initialization"""
    logger.info("Test 08.2: Service initialization")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service._initialized = True
    service.is_initialized = False

    # Mock the TTS model loading
    with patch.object(service, '_load_tts_model'):
        result = await service.initialize()

    assert result is True
    assert service.is_initialized is True
    logger.info("Service initialized successfully")


@pytest.mark.asyncio
async def test_tts_result_dataclass():
    """Test TTSResult dataclass"""
    logger.info("Test 08.3: TTSResult dataclass")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    result = TTSResult(
        audio_path="/tmp/audio.mp3",
        audio_url="/outputs/audio/audio.mp3",
        duration_ms=3500,
        format="mp3",
        language="fr",
        voice_cloned=True,
        voice_quality=0.85,
        processing_time_ms=450,
        text_length=100
    )

    assert result.audio_path == "/tmp/audio.mp3"
    assert result.duration_ms == 3500
    assert result.format == "mp3"
    assert result.language == "fr"
    assert result.voice_cloned is True
    assert result.voice_quality == 0.85

    logger.info("TTSResult dataclass works correctly")


@pytest.mark.asyncio
async def test_tts_language_mapping(output_dir):
    """Test language code mapping to XTTS codes"""
    logger.info("Test 08.4: Language mapping")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))

    test_cases = [
        ("fr", "fr"),
        ("en", "en"),
        ("es", "es"),
        ("de", "de"),
        ("zh", "zh-cn"),
        ("zh-cn", "zh-cn"),
        ("zh-tw", "zh-cn"),
        ("ja", "ja"),
        ("ko", "ko"),
        ("unknown", "en"),  # Default fallback
    ]

    for input_lang, expected_xtts in test_cases:
        result = service._map_language_code(input_lang)
        assert result == expected_xtts, f"Expected {expected_xtts} for {input_lang}, got {result}"
        logger.info(f"Language {input_lang} -> {result}")

    logger.info("Language mapping works correctly")


@pytest.mark.asyncio
async def test_tts_synthesize_simple(output_dir):
    """Test simple TTS synthesis without voice cloning"""
    logger.info("Test 08.5: Simple synthesis")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    # Mock the TTS model
    mock_tts = MagicMock()
    mock_tts.tts_to_file = MagicMock()
    service.tts_model = mock_tts

    # Mock audio duration
    with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
        mock_duration.return_value = 2500

        # Mock audio format conversion (no-op)
        with patch.object(service, '_convert_audio_format', new_callable=AsyncMock) as mock_convert:
            async def passthrough(path, fmt):
                return path.with_suffix(f".{fmt}")
            mock_convert.side_effect = passthrough

            result = await service.synthesize(
                text="Hello, this is a test.",
                language="en",
                output_format="mp3"
            )

    assert result is not None
    assert result.language == "en"
    assert result.voice_cloned is False
    assert result.text_length == len("Hello, this is a test.")
    assert "tts_" in result.audio_path

    logger.info(f"Simple synthesis works: {result.audio_url}")


@pytest.mark.asyncio
async def test_tts_synthesize_with_voice_cloning(output_dir, mock_voice_model):
    """Test TTS synthesis with voice cloning"""
    logger.info("Test 08.6: Synthesis with voice cloning")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    # Mock the TTS model
    mock_tts = MagicMock()
    mock_tts.tts_to_file = MagicMock()
    service.tts_model = mock_tts

    # Mock audio duration
    with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
        mock_duration.return_value = 3000

        with patch.object(service, '_convert_audio_format', new_callable=AsyncMock) as mock_convert:
            async def passthrough(path, fmt):
                # Create the output file
                new_path = path.with_suffix(f".{fmt}")
                new_path.touch()
                return new_path
            mock_convert.side_effect = passthrough

            result = await service.synthesize_with_voice(
                text="Bonjour, ceci est un test.",
                voice_model=mock_voice_model,
                target_language="fr",
                output_format="mp3",
                message_id="msg_test_123"
            )

    assert result is not None
    assert result.language == "fr"
    assert result.voice_cloned is True
    assert result.voice_quality == mock_voice_model.quality_score
    assert "msg_test_123_fr" in result.audio_path
    assert "/translated/" in result.audio_url

    logger.info(f"Voice cloning synthesis works: {result.audio_url}")


@pytest.mark.asyncio
async def test_tts_synthesize_fallback_no_voice_file(output_dir):
    """Test fallback when no voice audio file exists"""
    logger.info("Test 08.7: Fallback without voice file")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    # Create voice model without combined audio file
    voice_model = MockVoiceModel(
        user_id="no_audio_user",
        embedding_path="/nonexistent/path/embedding.pkl",
        quality_score=0.5
    )

    # Mock the TTS model
    mock_tts = MagicMock()
    mock_tts.tts_to_file = MagicMock()
    service.tts_model = mock_tts

    with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
        mock_duration.return_value = 2000

        with patch.object(service, '_convert_audio_format', new_callable=AsyncMock) as mock_convert:
            async def passthrough(path, fmt):
                new_path = path.with_suffix(f".{fmt}")
                new_path.touch()
                return new_path
            mock_convert.side_effect = passthrough

            result = await service.synthesize_with_voice(
                text="Test without voice file",
                voice_model=voice_model,
                target_language="en"
            )

    # Should synthesize without cloning since no voice file
    assert result is not None
    assert result.voice_cloned is False
    assert result.voice_quality == 0.0

    logger.info("Fallback without voice file works correctly")


@pytest.mark.asyncio
async def test_tts_supported_languages(output_dir):
    """Test getting supported languages"""
    logger.info("Test 08.8: Supported languages")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))

    languages = service.get_supported_languages()

    assert isinstance(languages, list)
    assert len(languages) > 0
    assert "en" in languages
    assert "fr" in languages
    assert "es" in languages
    assert "zh" in languages

    logger.info(f"Supported languages: {languages}")


@pytest.mark.asyncio
async def test_tts_get_stats(output_dir):
    """Test get_stats method"""
    logger.info("Test 08.9: Get stats")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    stats = await service.get_stats()

    assert "service" in stats
    assert stats["service"] == "TTSService"
    assert "initialized" in stats
    assert "tts_available" in stats
    assert "model_name" in stats
    assert "device" in stats
    assert "supported_languages" in stats

    logger.info(f"Stats: {stats}")


@pytest.mark.asyncio
async def test_tts_close(output_dir):
    """Test close method"""
    logger.info("Test 08.10: Close method")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.tts_model = MagicMock()
    service.is_initialized = True

    await service.close()

    assert service.tts_model is None
    assert service.is_initialized is False

    logger.info("Close method works correctly")


@pytest.mark.asyncio
async def test_tts_output_formats(output_dir):
    """Test different output formats"""
    logger.info("Test 08.11: Output formats")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    mock_tts = MagicMock()
    mock_tts.tts_to_file = MagicMock()
    service.tts_model = mock_tts

    formats = ["mp3", "wav", "ogg"]

    for fmt in formats:
        with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
            mock_duration.return_value = 1000

            with patch.object(service, '_convert_audio_format', new_callable=AsyncMock) as mock_convert:
                async def passthrough(path, target_fmt):
                    new_path = path.with_suffix(f".{target_fmt}")
                    new_path.touch()
                    return new_path
                mock_convert.side_effect = passthrough

                result = await service.synthesize(
                    text="Test",
                    language="en",
                    output_format=fmt
                )

                assert result.format == fmt
                logger.info(f"Format {fmt}: OK")

    logger.info("Output formats work correctly")


@pytest.mark.asyncio
async def test_tts_error_handling(output_dir):
    """Test error handling"""
    logger.info("Test 08.12: Error handling")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    # No model loaded
    service.tts_model = None

    # Should raise error
    with pytest.raises(RuntimeError):
        with patch('services.tts_service.TTS_AVAILABLE', False):
            await service.synthesize(
                text="This should fail",
                language="en"
            )

    logger.info("Error handling works correctly")


@pytest.mark.asyncio
async def test_tts_long_text(output_dir):
    """Test synthesis of longer text"""
    logger.info("Test 08.13: Long text handling")

    if not SERVICE_AVAILABLE:
        pytest.skip("TTSService not available")

    TTSService._instance = None
    service = TTSService(output_dir=str(output_dir))
    service.is_initialized = True

    mock_tts = MagicMock()
    mock_tts.tts_to_file = MagicMock()
    service.tts_model = mock_tts

    long_text = "This is a longer text that simulates a real voice message. " * 10

    with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
        mock_duration.return_value = 15000

        with patch.object(service, '_convert_audio_format', new_callable=AsyncMock) as mock_convert:
            async def passthrough(path, fmt):
                new_path = path.with_suffix(f".{fmt}")
                new_path.touch()
                return new_path
            mock_convert.side_effect = passthrough

            result = await service.synthesize(
                text=long_text,
                language="en"
            )

    assert result.text_length == len(long_text)
    assert result.duration_ms == 15000

    logger.info(f"Long text ({len(long_text)} chars) handled correctly")


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

async def run_all_tests():
    """Run all TTS service tests"""
    logger.info("Starting TTSService Tests (Test 08)")
    logger.info("=" * 60)

    # Create temp dirs for tests
    temp_dir = Path(tempfile.mkdtemp())
    (temp_dir / "translated").mkdir(parents=True)

    tests = [
        ("Singleton pattern", test_tts_service_singleton),
        ("Service initialization", lambda: test_tts_service_initialization(temp_dir)),
        ("TTSResult dataclass", test_tts_result_dataclass),
        ("Language mapping", test_tts_language_mapping),
        ("Simple synthesis", lambda: test_tts_synthesize_simple(temp_dir)),
        ("Supported languages", test_tts_supported_languages),
        ("Get stats", lambda: test_tts_get_stats(temp_dir)),
        ("Close method", lambda: test_tts_close(temp_dir)),
        ("Output formats", lambda: test_tts_output_formats(temp_dir)),
        ("Long text handling", lambda: test_tts_long_text(temp_dir)),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        logger.info(f"\n Test: {test_name}...")
        try:
            # Reset singleton before each test
            if SERVICE_AVAILABLE:
                TTSService._instance = None

            result = test_func()
            if asyncio.iscoroutine(result):
                await result
            passed += 1
            logger.info(f"PASSED: {test_name}")
        except Exception as e:
            logger.error(f"FAILED: {test_name} - {e}")
            import traceback
            traceback.print_exc()

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    logger.info("\n" + "=" * 60)
    logger.info(f"Results Test 08: {passed}/{total} tests passed")

    if passed == total:
        logger.info("All TTSService tests passed!")
        return True
    else:
        logger.error(f"{total - passed} test(s) failed")
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
