#!/usr/bin/env python3
"""
Test 14 - UnifiedTTSService Tests
Tests for the unified multi-model TTS service with hot-loading support

Features tested:
- Multi-model support (Chatterbox, Higgs Audio V2, XTTS)
- Hot-loading of models at runtime
- Background model downloads
- Fallback to Chatterbox when requested model unavailable
- Model status tracking
- Non-blocking startup
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

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import service with graceful fallback
try:
    from services.tts_service import (
        TTSService,
        UnifiedTTSService,
        TTSModel,
        TTSModelInfo,
        TTS_MODEL_INFO,
        ModelStatus,
        TTSResult,
        UnifiedTTSResult,
        BaseTTSBackend,
        ChatterboxBackend,
        get_tts_service,
        get_unified_tts_service,
        check_license_compliance
    )
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"TTSService not available: {e}")
    SERVICE_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def output_dir():
    """Create temporary output directory"""
    temp_dir = tempfile.mkdtemp(prefix="tts_unified_test_")
    output_path = Path(temp_dir)
    (output_path / "translated").mkdir(parents=True)
    (output_path / "models").mkdir(parents=True)
    yield output_path
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def reset_singleton():
    """Reset singleton before each test"""
    if SERVICE_AVAILABLE:
        UnifiedTTSService._instance = None
    yield
    if SERVICE_AVAILABLE:
        UnifiedTTSService._instance = None


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - TTSModel Enum
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tts_model_enum():
    """Test TTSModel enum values and methods"""
    logger.info("Test 14.1: TTSModel enum")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    # Test model values
    assert TTSModel.CHATTERBOX.value == "chatterbox"
    assert TTSModel.CHATTERBOX_TURBO.value == "chatterbox-turbo"
    assert TTSModel.HIGGS_AUDIO_V2.value == "higgs-audio-v2"
    assert TTSModel.XTTS_V2.value == "xtts-v2"

    # Test default and fallback methods
    assert TTSModel.get_default() == TTSModel.CHATTERBOX
    assert TTSModel.get_fallback() == TTSModel.CHATTERBOX

    logger.info("TTSModel enum works correctly")


@pytest.mark.asyncio
async def test_tts_model_info():
    """Test TTS_MODEL_INFO dictionary"""
    logger.info("Test 14.2: TTS_MODEL_INFO")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    # All models should be in the info dict
    for model in TTSModel:
        assert model in TTS_MODEL_INFO
        info = TTS_MODEL_INFO[model]
        assert isinstance(info, TTSModelInfo)
        assert info.name is not None
        assert info.license is not None
        assert info.quality_score > 0
        assert info.speed_score > 0
        assert len(info.languages) > 0

    # Chatterbox should have commercial use allowed
    chatterbox_info = TTS_MODEL_INFO[TTSModel.CHATTERBOX]
    assert chatterbox_info.commercial_use is True
    assert chatterbox_info.license_warning is None

    # Higgs Audio should have license warning
    higgs_info = TTS_MODEL_INFO[TTSModel.HIGGS_AUDIO_V2]
    assert higgs_info.commercial_use is False
    assert higgs_info.license_warning is not None

    logger.info("TTS_MODEL_INFO structure is correct")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - UnifiedTTSService
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_unified_tts_singleton(reset_singleton, output_dir):
    """Test singleton pattern"""
    logger.info("Test 14.3: Singleton pattern")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service1 = UnifiedTTSService(output_dir=str(output_dir))
    service2 = UnifiedTTSService(output_dir=str(output_dir))

    assert service1 is service2
    logger.info("Singleton pattern works correctly")


@pytest.mark.asyncio
async def test_unified_tts_initialization(reset_singleton, output_dir):
    """Test service initialization with mock backends"""
    logger.info("Test 14.4: Service initialization")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Mock the backend creation
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = True
    mock_backend.is_initialized = False
    mock_backend.is_downloading = False
    mock_backend.download_progress = 0.0
    mock_backend.initialize = AsyncMock(return_value=True)

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        with patch.object(service.model_manager, 'download_models_background', new_callable=AsyncMock):
            result = await service.initialize()

    assert result is True
    assert service.is_initialized is True
    logger.info("Service initialized successfully")


@pytest.mark.asyncio
async def test_unified_tts_find_local_model(reset_singleton, output_dir):
    """Test find_local_model method via model_manager"""
    logger.info("Test 14.5: Find local model")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Mock backend that is downloaded
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = True

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        local_model = await service.model_manager.find_local_model(TTSModel.CHATTERBOX)

    assert local_model == TTSModel.CHATTERBOX
    logger.info("Local model found correctly")


@pytest.mark.asyncio
async def test_unified_tts_no_local_model(reset_singleton, output_dir):
    """Test behavior when no local model is available"""
    logger.info("Test 14.6: No local model available")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Mock backend that is NOT downloaded
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = False

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        local_model = await service.model_manager.find_local_model(TTSModel.CHATTERBOX)

    assert local_model is None
    logger.info("Correctly detected no local model")


@pytest.mark.asyncio
async def test_unified_tts_model_status(reset_singleton, output_dir):
    """Test get_model_status method"""
    logger.info("Test 14.7: Model status")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Mock backend
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = True
    mock_backend.is_initialized = False
    mock_backend.is_downloading = False
    mock_backend.download_progress = 0.0

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        status = await service.get_model_status(TTSModel.CHATTERBOX)

    assert isinstance(status, ModelStatus)
    assert status.is_available is True
    assert status.is_downloaded is True
    assert status.is_loaded is False
    assert status.is_downloading is False

    logger.info("Model status retrieved correctly")


@pytest.mark.asyncio
async def test_unified_tts_all_models_status(reset_singleton, output_dir):
    """Test get_all_models_status method"""
    logger.info("Test 14.8: All models status")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Mock backend
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = False
    mock_backend.is_initialized = False
    mock_backend.is_downloading = False
    mock_backend.download_progress = 0.0

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        all_status = await service.get_all_models_status()

    assert len(all_status) == len(TTSModel)
    for model_value, status in all_status.items():
        assert isinstance(status, ModelStatus)

    logger.info("All models status retrieved correctly")


@pytest.mark.asyncio
async def test_unified_tts_is_ready_property(reset_singleton, output_dir):
    """Test is_ready property"""
    logger.info("Test 14.9: is_ready property")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Initially not ready
    assert service.is_ready is False

    # Mock an active backend
    mock_backend = MagicMock()
    mock_backend.is_initialized = True
    service.model_manager.active_backend = mock_backend

    # Now should be ready
    assert service.is_ready is True

    logger.info("is_ready property works correctly")


@pytest.mark.asyncio
async def test_unified_tts_get_stats(reset_singleton, output_dir):
    """Test get_stats method"""
    logger.info("Test 14.10: Get stats")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))
    service.is_initialized = True

    # Mock backend
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = False
    mock_backend.is_initialized = False
    mock_backend.is_downloading = False
    mock_backend.download_progress = 0.0

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        stats = await service.get_stats()

    assert "service" in stats
    assert stats["service"] == "UnifiedTTSService"
    assert "initialized" in stats
    assert "is_ready" in stats
    assert "status" in stats
    assert "requested_model" in stats
    assert "fallback_model" in stats
    assert "models_status" in stats
    assert "disk_space_available_gb" in stats

    logger.info(f"Stats: status={stats['status']}, is_ready={stats['is_ready']}")


@pytest.mark.asyncio
async def test_unified_tts_switch_model(reset_singleton, output_dir):
    """Test switch_model method"""
    logger.info("Test 14.11: Switch model")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Mock backends
    mock_backend = MagicMock(spec=BaseTTSBackend)
    mock_backend.is_available = True
    mock_backend.is_model_downloaded.return_value = True
    mock_backend.is_initialized = False
    mock_backend.is_downloading = False
    mock_backend.download_progress = 0.0
    mock_backend.initialize = AsyncMock(return_value=True)

    with patch.object(service.model_manager, 'create_backend', return_value=mock_backend):
        with patch.object(service.model_manager, 'download_models_background', new_callable=AsyncMock):
            # First initialize
            await service.initialize(TTSModel.CHATTERBOX)
            assert service.model_manager.active_model == TTSModel.CHATTERBOX

            # Switch to another model
            success = await service.switch_model(TTSModel.CHATTERBOX_TURBO)
            assert success is True

    logger.info("Model switching works correctly")


@pytest.mark.asyncio
async def test_unified_tts_license_compliance():
    """Test license compliance check"""
    logger.info("Test 14.12: License compliance")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    # Chatterbox - commercial OK
    is_commercial, warning = check_license_compliance(TTSModel.CHATTERBOX)
    assert is_commercial is True
    assert warning is None

    # Higgs Audio - commercial restricted
    is_commercial, warning = check_license_compliance(TTSModel.HIGGS_AUDIO_V2)
    assert is_commercial is False
    assert warning is not None
    assert "100,000" in warning or "100k" in warning.lower()

    # XTTS - no commercial
    is_commercial, warning = check_license_compliance(TTSModel.XTTS_V2)
    assert is_commercial is False
    assert warning is not None

    logger.info("License compliance checks work correctly")


@pytest.mark.asyncio
async def test_unified_tts_synthesize_pending_mode(reset_singleton, output_dir):
    """Test synthesize waits for model in pending mode"""
    logger.info("Test 14.13: Synthesize in pending mode")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))
    service.is_initialized = True
    service.model_manager.active_backend = None  # Pending mode

    # Mock backend that becomes ready after a delay
    mock_backend = MagicMock()
    mock_backend.is_initialized = True
    mock_backend.synthesize = AsyncMock(return_value=str(output_dir / "test.wav"))

    async def make_ready():
        await asyncio.sleep(0.5)
        service.model_manager.active_backend = mock_backend
        service.model_manager.active_model = TTSModel.CHATTERBOX
        service.model_manager._model_ready_event.set()  # Signal that model is ready

    # Start making the service ready in background
    ready_task = asyncio.create_task(make_ready())

    # Mock additional methods
    with patch.object(service.synthesizer, '_convert_format', new_callable=AsyncMock) as mock_convert:
        mock_convert.return_value = str(output_dir / "test.mp3")
        with patch.object(service.synthesizer, '_get_duration_ms', new_callable=AsyncMock) as mock_duration:
            mock_duration.return_value = 2000

            # This should wait for the model
            try:
                result = await asyncio.wait_for(
                    service.synthesize_with_voice(
                        text="Test",
                        speaker_audio_path=None,
                        target_language="en",
                        max_wait_seconds=5
                    ),
                    timeout=10
                )
                assert result is not None
                logger.info("Synthesize waited for model correctly")
            except asyncio.TimeoutError:
                pytest.fail("Synthesize timed out waiting for model")

    await ready_task


@pytest.mark.asyncio
async def test_unified_tts_close(reset_singleton, output_dir):
    """Test close method"""
    logger.info("Test 14.14: Close method")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))
    service.is_initialized = True

    # Add mock backends
    mock_backend = MagicMock()
    mock_backend.close = AsyncMock()
    service.model_manager.backends = {TTSModel.CHATTERBOX: mock_backend}
    service.model_manager.active_backend = mock_backend

    await service.close()

    assert service.is_initialized is False
    assert service.model_manager.active_backend is None
    assert len(service.model_manager.backends) == 0
    mock_backend.close.assert_called_once()

    logger.info("Close method works correctly")


@pytest.mark.asyncio
async def test_unified_tts_disk_space_check(reset_singleton, output_dir):
    """Test disk space checking"""
    logger.info("Test 14.15: Disk space check")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    service = UnifiedTTSService(output_dir=str(output_dir))

    # Get available disk space
    available_gb = service.model_manager.get_available_disk_space_gb()
    assert available_gb >= 0

    # Check can download model
    can_download = service.model_manager.can_download_model(TTSModel.CHATTERBOX)
    # Should be true if there's enough space (model is ~3.5GB + 2GB buffer)
    logger.info(f"Available disk space: {available_gb:.2f} GB, can download: {can_download}")


# ═══════════════════════════════════════════════════════════════
# BACKEND TESTS
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_chatterbox_backend_availability():
    """Test ChatterboxBackend availability detection"""
    logger.info("Test 14.16: ChatterboxBackend availability")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    backend = ChatterboxBackend(device="cpu", turbo=False)

    # is_available depends on whether chatterbox package is installed
    logger.info(f"ChatterboxBackend available: {backend.is_available}")

    # Test turbo version
    backend_turbo = ChatterboxBackend(device="cpu", turbo=True)
    logger.info(f"ChatterboxBackend Turbo available: {backend_turbo.is_available}")


@pytest.mark.asyncio
async def test_unified_tts_result_dataclass():
    """Test UnifiedTTSResult dataclass"""
    logger.info("Test 14.17: UnifiedTTSResult dataclass")

    if not SERVICE_AVAILABLE:
        pytest.skip("UnifiedTTSService not available")

    result = UnifiedTTSResult(
        audio_path="/tmp/audio.mp3",
        audio_url="/outputs/audio/audio.mp3",
        duration_ms=3500,
        format="mp3",
        language="fr",
        voice_cloned=True,
        voice_quality=0.85,
        processing_time_ms=450,
        text_length=100,
        model_used=TTSModel.CHATTERBOX,
        model_info=TTS_MODEL_INFO[TTSModel.CHATTERBOX]
    )

    assert result.audio_path == "/tmp/audio.mp3"
    assert result.duration_ms == 3500
    assert result.format == "mp3"
    assert result.language == "fr"
    assert result.voice_cloned is True
    assert result.model_used == TTSModel.CHATTERBOX
    assert result.model_info.name == "chatterbox"

    logger.info("UnifiedTTSResult dataclass works correctly")


# ═══════════════════════════════════════════════════════════════
# RUN ALL TESTS
# ═══════════════════════════════════════════════════════════════

async def run_all_tests():
    """Run all UnifiedTTSService tests"""
    logger.info("=" * 70)
    logger.info("Starting UnifiedTTSService Tests (Test 14)")
    logger.info("=" * 70)

    temp_dir = Path(tempfile.mkdtemp())
    (temp_dir / "translated").mkdir(parents=True)

    tests = [
        ("TTSModel enum", test_tts_model_enum),
        ("TTS_MODEL_INFO", test_tts_model_info),
        ("Singleton pattern", test_unified_tts_singleton),
        ("is_ready property", test_unified_tts_is_ready_property),
        ("License compliance", test_unified_tts_license_compliance),
        ("UnifiedTTSResult dataclass", test_unified_tts_result_dataclass),
        ("ChatterboxBackend availability", test_chatterbox_backend_availability),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        logger.info(f"\nTest: {test_name}...")
        try:
            if SERVICE_AVAILABLE:
                UnifiedTTSService._instance = None
            await test_func()
            passed += 1
            logger.info(f"PASSED: {test_name}")
        except Exception as e:
            logger.error(f"FAILED: {test_name} - {e}")
            import traceback
            traceback.print_exc()

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    logger.info("\n" + "=" * 70)
    logger.info(f"Results Test 14: {passed}/{total} tests passed")

    if passed == total:
        logger.info("All UnifiedTTSService tests passed!")
        return True
    else:
        logger.error(f"{total - passed} test(s) failed")
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
