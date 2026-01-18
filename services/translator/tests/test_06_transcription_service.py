#!/usr/bin/env python3
"""
Test 06 - TranscriptionService Unit Tests
Tests for audio transcription with mobile passthrough and Whisper
"""

import sys
import os
import logging
import asyncio
import pytest
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import service with graceful fallback
try:
    from services.transcription_service import (
        TranscriptionService,
        TranscriptionResult,
        TranscriptionSegment,
        get_transcription_service,
        WHISPER_AVAILABLE
    )
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"TranscriptionService not available: {e}")
    SERVICE_AVAILABLE = False
    WHISPER_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - TranscriptionService
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_transcription_service_singleton():
    """Test singleton pattern"""
    logger.info("Test 06.1: Singleton pattern")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    # Create two instances
    service1 = TranscriptionService()
    service2 = TranscriptionService()

    # Should be the same instance
    assert service1 is service2
    logger.info("Singleton pattern works correctly")


@pytest.mark.asyncio
async def test_transcription_service_initialization():
    """Test service initialization"""
    logger.info("Test 06.2: Service initialization")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()

    # Reset state for testing
    service._initialized = True
    service.is_initialized = False

    # Initialize
    result = await service.initialize()

    assert result is True
    assert service.is_initialized is True
    logger.info("Service initialized successfully")


@pytest.mark.asyncio
async def test_transcription_mobile_passthrough(sample_mobile_transcription, mock_audio_file):
    """Test mobile transcription passthrough"""
    logger.info("Test 06.3: Mobile transcription passthrough")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()
    service.is_initialized = True

    # Mock audio duration
    with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
        mock_duration.return_value = 3000

        result = await service.transcribe(
            audio_path=str(mock_audio_file),
            mobile_transcription=sample_mobile_transcription,
            return_timestamps=True
        )

    assert result.text == sample_mobile_transcription['text']
    assert result.language == sample_mobile_transcription['language']
    assert result.source == "mobile"
    assert result.confidence == sample_mobile_transcription['confidence']
    logger.info(f"Mobile passthrough works: '{result.text[:30]}...'")


@pytest.mark.asyncio
async def test_transcription_mobile_with_segments(mock_audio_file):
    """Test mobile transcription with segment parsing"""
    logger.info("Test 06.4: Mobile transcription with segments")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()
    service.is_initialized = True

    mobile_data = {
        "text": "Hello world, this is a test.",
        "language": "en",
        "confidence": 0.88,
        "source": "whisperkit",
        "segments": [
            {"text": "Hello world,", "startMs": 0, "endMs": 1000, "confidence": 0.9},
            {"text": "this is a test.", "startMs": 1000, "endMs": 2500, "confidence": 0.85}
        ]
    }

    with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
        mock_duration.return_value = 2500

        result = await service.transcribe(
            audio_path=str(mock_audio_file),
            mobile_transcription=mobile_data
        )

    assert len(result.segments) == 2
    assert result.segments[0].text == "Hello world,"
    assert result.segments[0].start_ms == 0
    assert result.segments[0].end_ms == 1000
    assert result.segments[1].text == "this is a test."
    logger.info(f"Segments parsed correctly: {len(result.segments)} segments")


@pytest.mark.asyncio
async def test_transcription_whisper_fallback(mock_audio_file):
    """Test Whisper fallback when no mobile transcription"""
    logger.info("Test 06.5: Whisper fallback")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()

    # Mock the Whisper model
    mock_segment = MagicMock()
    mock_segment.text = "Test transcription from Whisper"
    mock_segment.start = 0.0
    mock_segment.end = 2.0
    mock_segment.avg_logprob = 0.9

    mock_info = MagicMock()
    mock_info.language = "en"
    mock_info.language_probability = 0.95
    mock_info.duration = 2.0

    mock_model = MagicMock()
    mock_model.transcribe = MagicMock(return_value=([mock_segment], mock_info))

    # Mock get_stt_model to return our mock (nouveau pattern après refactoring)
    with patch('services.transcription_service.get_stt_model', return_value=mock_model):
        service.is_initialized = True

        result = await service.transcribe(
            audio_path=str(mock_audio_file),
            mobile_transcription=None
        )

    assert result.text == "Test transcription from Whisper"
    assert result.language == "en"
    assert result.source == "whisper"
    assert result.confidence == 0.95
    logger.info(f"Whisper fallback works: '{result.text}'")


@pytest.mark.asyncio
async def test_transcription_error_no_whisper_no_mobile(mock_audio_file):
    """Test error when no Whisper and no mobile transcription"""
    logger.info("Test 06.6: Error handling - no source available")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()
    service.model = None
    service.is_initialized = True

    # Patch WHISPER_AVAILABLE to False
    with patch('services.transcription_service.WHISPER_AVAILABLE', False):
        with pytest.raises(RuntimeError) as excinfo:
            await service.transcribe(
                audio_path=str(mock_audio_file),
                mobile_transcription=None
            )

        assert "Whisper non disponible" in str(excinfo.value) or "no mobile" in str(excinfo.value).lower()
        logger.info("Error handling works correctly")


@pytest.mark.asyncio
async def test_transcription_result_dataclass():
    """Test TranscriptionResult dataclass"""
    logger.info("Test 06.7: TranscriptionResult dataclass")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    result = TranscriptionResult(
        text="Test text",
        language="en",
        confidence=0.9,
        segments=[
            TranscriptionSegment(text="Test", start_ms=0, end_ms=500, confidence=0.95)
        ],
        duration_ms=500,
        source="whisper",
        model="whisper-large-v3",
        processing_time_ms=100
    )

    assert result.text == "Test text"
    assert result.language == "en"
    assert result.confidence == 0.9
    assert len(result.segments) == 1
    assert result.segments[0].text == "Test"
    assert result.source == "whisper"
    logger.info("TranscriptionResult dataclass works correctly")


@pytest.mark.asyncio
async def test_transcription_get_stats():
    """Test get_stats method"""
    logger.info("Test 06.8: Get stats")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()
    service.is_initialized = True

    stats = await service.get_stats()

    assert "service" in stats
    assert stats["service"] == "TranscriptionService"
    assert "initialized" in stats
    assert "whisper_available" in stats
    assert "model_size" in stats
    assert "device" in stats
    logger.info(f"Stats retrieved: {stats}")


@pytest.mark.asyncio
async def test_transcription_close():
    """Test close method"""
    logger.info("Test 06.9: Close method")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()
    service.model = MagicMock()
    service.is_initialized = True

    await service.close()

    # NOTE: Le modèle est maintenant géré par ModelManager centralisé
    # On ne peut plus vérifier service.model is None
    # On vérifie juste que is_initialized est False
    assert service.is_initialized is False
    logger.info("Close method works correctly")


@pytest.mark.asyncio
async def test_transcription_empty_mobile_text(mock_audio_file):
    """Test behavior with empty mobile transcription text"""
    logger.info("Test 06.10: Empty mobile transcription")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()

    # Mock Whisper for fallback
    mock_segment = MagicMock()
    mock_segment.text = "Fallback text"
    mock_segment.start = 0.0
    mock_segment.end = 1.0
    mock_segment.avg_logprob = 0.85

    mock_info = MagicMock()
    mock_info.language = "en"
    mock_info.language_probability = 0.9
    mock_info.duration = 1.0

    mock_model = MagicMock()
    mock_model.transcribe = MagicMock(return_value=([mock_segment], mock_info))

    # Mock get_stt_model to return our mock (nouveau pattern après refactoring)
    with patch('services.transcription_service.get_stt_model', return_value=mock_model):
        service.is_initialized = True

        # Empty text should trigger Whisper fallback
        result = await service.transcribe(
            audio_path=str(mock_audio_file),
            mobile_transcription={"text": "", "language": "en"}
        )

    # Should use Whisper since mobile text is empty
    assert result.source == "whisper"
    assert result.text == "Fallback text"
    logger.info("Empty mobile text correctly triggers Whisper fallback")


@pytest.mark.asyncio
async def test_transcription_language_detection():
    """Test language detection consistency"""
    logger.info("Test 06.11: Language detection")

    if not SERVICE_AVAILABLE:
        pytest.skip("TranscriptionService not available")

    service = get_transcription_service()
    service.is_initialized = True

    test_cases = [
        ("fr", "Bonjour le monde"),
        ("en", "Hello world"),
        ("es", "Hola mundo"),
        ("de", "Hallo Welt"),
    ]

    for expected_lang, text in test_cases:
        with patch.object(service, '_get_audio_duration_ms', new_callable=AsyncMock) as mock_duration:
            mock_duration.return_value = 1000

            result = await service.transcribe(
                audio_path="/fake/path.wav",
                mobile_transcription={
                    "text": text,
                    "language": expected_lang,
                    "confidence": 0.9
                }
            )

            assert result.language == expected_lang
            logger.info(f"Language {expected_lang}: OK")

    logger.info("Language detection consistency verified")


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

async def run_all_tests():
    """Run all transcription service tests"""
    logger.info("Starting TranscriptionService Tests (Test 06)")
    logger.info("=" * 60)

    tests = [
        ("Singleton pattern", test_transcription_service_singleton),
        ("Service initialization", test_transcription_service_initialization),
        ("Mobile passthrough", test_transcription_mobile_passthrough),
        ("Mobile with segments", test_transcription_mobile_with_segments),
        ("Whisper fallback", test_transcription_whisper_fallback),
        ("Error handling", test_transcription_error_no_whisper_no_mobile),
        ("Result dataclass", test_transcription_result_dataclass),
        ("Get stats", test_transcription_get_stats),
        ("Close method", test_transcription_close),
        ("Empty mobile text", test_transcription_empty_mobile_text),
        ("Language detection", test_transcription_language_detection),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        logger.info(f"\n Test: {test_name}...")
        try:
            await test_func()
            passed += 1
            logger.info(f"PASSED: {test_name}")
        except Exception as e:
            logger.error(f"FAILED: {test_name} - {e}")

    logger.info("\n" + "=" * 60)
    logger.info(f"Results Test 06: {passed}/{total} tests passed")

    if passed == total:
        logger.info("All TranscriptionService tests passed!")
        return True
    else:
        logger.error(f"{total - passed} test(s) failed")
        return False


if __name__ == "__main__":
    # For standalone execution, need to handle fixtures
    import tempfile
    from pathlib import Path

    # Create temp resources
    temp_dir = Path(tempfile.mkdtemp())
    mock_audio = temp_dir / "test.wav"

    # Create minimal wav
    wav_header = bytes([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
        0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
        0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
        0x00, 0x00, 0x00, 0x00,
    ])
    with open(mock_audio, 'wb') as f:
        f.write(wav_header)

    success = asyncio.run(run_all_tests())

    # Cleanup
    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

    sys.exit(0 if success else 1)
