#!/usr/bin/env python3
"""
Test 15 - Voice Profile Handler Tests
Tests for the internal ZMQ voice profile processing handler

Features tested:
- VoiceProfileHandler initialization
- Message type routing
- Voice profile analysis (mocked audio processing)
- Voice profile verification
- Fingerprint comparison
- Error handling
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import base64
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import handler with graceful fallback
try:
    from services.voice_profile_handler import (
        VoiceProfileHandler,
        VoiceProfileAnalysisResult,
        VoiceProfileVerifyResult,
        get_voice_profile_handler,
        MIN_PROFILE_AUDIO_DURATION_MS,
        UPDATE_SIMILARITY_THRESHOLD
    )
    HANDLER_AVAILABLE = True
except ImportError as e:
    logger.warning(f"VoiceProfileHandler not available: {e}")
    HANDLER_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def handler():
    """Create a voice profile handler with mocked services"""
    if not HANDLER_AVAILABLE:
        pytest.skip("VoiceProfileHandler not available")

    mock_voice_clone_service = MagicMock()
    mock_voice_clone_service._get_audio_duration_ms = AsyncMock(return_value=15000)
    mock_voice_clone_service._create_voice_model = AsyncMock()
    mock_voice_clone_service._save_model_to_cache = AsyncMock()

    handler = VoiceProfileHandler(voice_clone_service=mock_voice_clone_service)
    return handler


@pytest.fixture
def sample_audio_base64():
    """Create a sample base64 encoded audio (just for testing)"""
    # Create a minimal WAV header + silence
    wav_header = bytes([
        0x52, 0x49, 0x46, 0x46,  # "RIFF"
        0x24, 0x00, 0x00, 0x00,  # File size - 8
        0x57, 0x41, 0x56, 0x45,  # "WAVE"
        0x66, 0x6D, 0x74, 0x20,  # "fmt "
        0x10, 0x00, 0x00, 0x00,  # Subchunk1 size (16)
        0x01, 0x00,              # Audio format (1 = PCM)
        0x01, 0x00,              # Num channels (1)
        0x44, 0xAC, 0x00, 0x00,  # Sample rate (44100)
        0x88, 0x58, 0x01, 0x00,  # Byte rate
        0x02, 0x00,              # Block align
        0x10, 0x00,              # Bits per sample (16)
        0x64, 0x61, 0x74, 0x61,  # "data"
        0x00, 0x00, 0x00, 0x00   # Data size
    ])
    return base64.b64encode(wav_header).decode('utf-8')


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Constants
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_constants():
    """Test 15.1: Verify constants are defined correctly"""
    logger.info("Test 15.1: Constants verification")

    if not HANDLER_AVAILABLE:
        pytest.skip("VoiceProfileHandler not available")

    assert MIN_PROFILE_AUDIO_DURATION_MS == 10000  # 10 seconds
    assert UPDATE_SIMILARITY_THRESHOLD == 0.80  # 80% match

    logger.info("Constants verified correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Result Dataclasses
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analysis_result_dataclass():
    """Test 15.2: VoiceProfileAnalysisResult dataclass"""
    logger.info("Test 15.2: VoiceProfileAnalysisResult dataclass")

    if not HANDLER_AVAILABLE:
        pytest.skip("VoiceProfileHandler not available")

    result = VoiceProfileAnalysisResult(
        success=True,
        user_id="test_user",
        profile_id="vp_test123",
        quality_score=0.85,
        audio_duration_ms=15000
    )

    assert result.success is True
    assert result.user_id == "test_user"
    assert result.profile_id == "vp_test123"
    assert result.quality_score == 0.85
    assert result.audio_duration_ms == 15000
    assert result.error is None

    # Test to_dict
    result_dict = result.to_dict()
    assert isinstance(result_dict, dict)
    assert result_dict['success'] is True
    assert result_dict['profile_id'] == "vp_test123"

    logger.info("VoiceProfileAnalysisResult works correctly")


@pytest.mark.asyncio
async def test_verify_result_dataclass():
    """Test 15.3: VoiceProfileVerifyResult dataclass"""
    logger.info("Test 15.3: VoiceProfileVerifyResult dataclass")

    if not HANDLER_AVAILABLE:
        pytest.skip("VoiceProfileHandler not available")

    result = VoiceProfileVerifyResult(
        success=True,
        user_id="test_user",
        is_match=True,
        similarity_score=0.92,
        threshold=0.80
    )

    assert result.success is True
    assert result.is_match is True
    assert result.similarity_score == 0.92
    assert result.threshold == 0.80

    # Test to_dict
    result_dict = result.to_dict()
    assert result_dict['is_match'] is True
    assert result_dict['similarity_score'] == 0.92

    logger.info("VoiceProfileVerifyResult works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Handler Initialization
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_handler_initialization(handler):
    """Test 15.4: Handler initialization"""
    logger.info("Test 15.4: Handler initialization")

    assert handler is not None
    assert handler.voice_clone_service is not None
    assert handler.temp_dir.exists()

    logger.info("Handler initialized correctly")


@pytest.mark.asyncio
async def test_singleton_pattern():
    """Test 15.5: Singleton pattern for handler"""
    logger.info("Test 15.5: Singleton pattern")

    if not HANDLER_AVAILABLE:
        pytest.skip("VoiceProfileHandler not available")

    # Reset singleton
    import services.voice_profile_handler as module
    module._handler_instance = None

    handler1 = get_voice_profile_handler()
    handler2 = get_voice_profile_handler()

    assert handler1 is handler2

    # Cleanup
    module._handler_instance = None

    logger.info("Singleton pattern works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Message Type Routing
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_is_voice_profile_request(handler):
    """Test 15.6: Message type detection"""
    logger.info("Test 15.6: Message type detection")

    # Valid types
    assert handler.is_voice_profile_request('voice_profile_analyze') is True
    assert handler.is_voice_profile_request('voice_profile_verify') is True
    assert handler.is_voice_profile_request('voice_profile_compare') is True

    # Invalid types
    assert handler.is_voice_profile_request('translation') is False
    assert handler.is_voice_profile_request('audio_process') is False
    assert handler.is_voice_profile_request('voice_api') is False

    logger.info("Message type detection works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Handle Request Routing
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_handle_request_unknown_type(handler):
    """Test 15.7: Handle unknown message type"""
    logger.info("Test 15.7: Unknown message type handling")

    request = {
        'type': 'unknown_type',
        'request_id': 'req_123'
    }

    result = await handler.handle_request(request)

    assert result['success'] is False
    assert 'Unknown message type' in result['error']
    assert result['type'] == 'unknown_type_result'

    logger.info("Unknown message type handled correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Analyze Handler
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analyze_missing_user_id(handler):
    """Test 15.8: Analyze with missing user_id"""
    logger.info("Test 15.8: Analyze missing user_id")

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'audio_data': 'base64data',
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is False
    assert 'user_id is required' in result['error']

    logger.info("Missing user_id handled correctly")


@pytest.mark.asyncio
async def test_analyze_missing_audio_data(handler):
    """Test 15.9: Analyze with missing audio_data"""
    logger.info("Test 15.9: Analyze missing audio_data")

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is False
    assert 'audio_data is required' in result['error']

    logger.info("Missing audio_data handled correctly")


@pytest.mark.asyncio
async def test_analyze_invalid_base64(handler):
    """Test 15.10: Analyze with invalid base64 audio"""
    logger.info("Test 15.10: Analyze invalid base64")

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': 'not_valid_base64!!!',
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is False
    assert 'Invalid base64' in result['error']

    logger.info("Invalid base64 handled correctly")


@pytest.mark.asyncio
async def test_analyze_audio_too_short(handler, sample_audio_base64):
    """Test 15.11: Analyze with audio too short"""
    logger.info("Test 15.11: Analyze audio too short")

    # Mock to return short duration
    handler.voice_clone_service._get_audio_duration_ms = AsyncMock(return_value=5000)

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': sample_audio_base64,
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is False
    assert 'Audio too short' in result['error']
    assert result['audio_duration_ms'] == 5000

    logger.info("Short audio handled correctly")


@pytest.mark.asyncio
async def test_analyze_no_voice_clone_service():
    """Test 15.12: Analyze without voice clone service"""
    logger.info("Test 15.12: Analyze without voice clone service")

    if not HANDLER_AVAILABLE:
        pytest.skip("VoiceProfileHandler not available")

    handler = VoiceProfileHandler(voice_clone_service=None)

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': 'base64data',
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is False
    assert 'not available' in result['error']

    logger.info("Missing service handled correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Verify Handler
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_verify_missing_user_id(handler):
    """Test 15.13: Verify with missing user_id"""
    logger.info("Test 15.13: Verify missing user_id")

    request = {
        'type': 'voice_profile_verify',
        'request_id': 'req_123',
        'audio_data': 'base64data',
        'audio_format': 'wav',
        'existing_fingerprint': {'signature': 'test'}
    }

    result = await handler.handle_verify(request)

    assert result['success'] is False
    assert 'user_id is required' in result['error']

    logger.info("Missing user_id handled correctly")


@pytest.mark.asyncio
async def test_verify_missing_fingerprint(handler):
    """Test 15.14: Verify with missing fingerprint"""
    logger.info("Test 15.14: Verify missing fingerprint")

    request = {
        'type': 'voice_profile_verify',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': 'base64data',
        'audio_format': 'wav'
    }

    result = await handler.handle_verify(request)

    assert result['success'] is False
    assert 'existing_fingerprint is required' in result['error']

    logger.info("Missing fingerprint handled correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Compare Handler
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_compare_missing_fingerprints(handler):
    """Test 15.15: Compare with missing fingerprints"""
    logger.info("Test 15.15: Compare missing fingerprints")

    request = {
        'type': 'voice_profile_compare',
        'request_id': 'req_123',
        'fingerprint_a': {'signature': 'test'}
    }

    result = await handler.handle_compare(request)

    assert result['success'] is False
    assert 'fingerprint_a and fingerprint_b are required' in result['error']

    logger.info("Missing fingerprints handled correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Full Flow (Mocked)
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analyze_success_flow(handler, sample_audio_base64):
    """Test 15.16: Full analyze success flow (mocked)"""
    logger.info("Test 15.16: Full analyze success flow")

    # Setup mocks
    handler.voice_clone_service._get_audio_duration_ms = AsyncMock(return_value=15000)

    mock_model = MagicMock()
    mock_model.profile_id = "vp_test123"
    mock_model.quality_score = 0.85
    mock_model.total_duration_ms = 15000
    mock_model.embedding_path = "/path/to/embedding.pkl"
    mock_model.voice_characteristics = MagicMock()
    mock_model.voice_characteristics.to_dict = MagicMock(return_value={'pitch': 120})
    mock_model.fingerprint = MagicMock()
    mock_model.fingerprint.to_dict = MagicMock(return_value={'signature': 'abc123'})
    mock_model.fingerprint.fingerprint_id = "vfp_123"
    mock_model.fingerprint.signature_short = "abc123def456"
    mock_model.generate_fingerprint = MagicMock()

    handler.voice_clone_service._create_voice_model = AsyncMock(return_value=mock_model)
    handler.voice_clone_service._save_model_to_cache = AsyncMock()

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': sample_audio_base64,
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is True
    assert result['profile_id'] == "vp_test123"
    assert result['quality_score'] == 0.85
    assert result['audio_duration_ms'] == 15000

    logger.info("Full analyze flow works correctly")


@pytest.mark.asyncio
async def test_request_routing(handler):
    """Test 15.17: Request routing to correct handler"""
    logger.info("Test 15.17: Request routing")

    # Patch handlers
    with patch.object(handler, 'handle_analyze', new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = {'success': True}

        request = {
            'type': 'voice_profile_analyze',
            'request_id': 'req_123',
            'user_id': 'user_123'
        }

        await handler.handle_request(request)
        mock_analyze.assert_called_once()

    with patch.object(handler, 'handle_verify', new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {'success': True}

        request = {
            'type': 'voice_profile_verify',
            'request_id': 'req_124',
            'user_id': 'user_123'
        }

        await handler.handle_request(request)
        mock_verify.assert_called_once()

    with patch.object(handler, 'handle_compare', new_callable=AsyncMock) as mock_compare:
        mock_compare.return_value = {'success': True}

        request = {
            'type': 'voice_profile_compare',
            'request_id': 'req_125'
        }

        await handler.handle_request(request)
        mock_compare.assert_called_once()

    logger.info("Request routing works correctly")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Error Cases
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_analyze_exception_handling(handler, sample_audio_base64):
    """Test 15.18: Exception handling in analyze"""
    logger.info("Test 15.18: Exception handling")

    handler.voice_clone_service._get_audio_duration_ms = AsyncMock(
        side_effect=Exception("Test error")
    )

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': sample_audio_base64,
        'audio_format': 'wav'
    }

    result = await handler.handle_analyze(request)

    assert result['success'] is False
    assert 'Test error' in result['error']

    logger.info("Exception handling works correctly")


@pytest.mark.asyncio
async def test_temp_file_cleanup(handler, sample_audio_base64):
    """Test 15.19: Temp file cleanup after processing"""
    logger.info("Test 15.19: Temp file cleanup")

    handler.voice_clone_service._get_audio_duration_ms = AsyncMock(return_value=5000)

    request = {
        'type': 'voice_profile_analyze',
        'request_id': 'req_123',
        'user_id': 'user_123',
        'audio_data': sample_audio_base64,
        'audio_format': 'wav'
    }

    # Get temp dir file count before
    before_count = len(list(handler.temp_dir.glob('*')))

    await handler.handle_analyze(request)

    # Get temp dir file count after
    after_count = len(list(handler.temp_dir.glob('*')))

    # Should be same (file created and deleted)
    assert before_count == after_count

    logger.info("Temp file cleanup works correctly")


# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_summary():
    """Test 15.20: Summary of voice profile handler tests"""
    logger.info("=" * 60)
    logger.info("Voice Profile Handler Tests Summary")
    logger.info("=" * 60)
    logger.info("Tests cover:")
    logger.info("  - Constants verification")
    logger.info("  - Result dataclasses (AnalysisResult, VerifyResult)")
    logger.info("  - Handler initialization")
    logger.info("  - Singleton pattern")
    logger.info("  - Message type detection")
    logger.info("  - Request routing")
    logger.info("  - Analyze endpoint (validation, error cases, success)")
    logger.info("  - Verify endpoint (validation, error cases)")
    logger.info("  - Compare endpoint (validation)")
    logger.info("  - Exception handling")
    logger.info("  - Temp file cleanup")
    logger.info("=" * 60)
