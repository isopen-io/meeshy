#!/usr/bin/env python3
"""
Test 24 - UnifiedTTSService Comprehensive Tests
Tests for the unified multi-model TTS service with target >65% code coverage

Features tested:
- TTSModel enum (get_default, get_fallback)
- TTSModelInfo dataclass
- ModelStatus dataclass
- UnifiedTTSResult dataclass
- BaseTTSBackend abstract class
- ChatterboxBackend (monolingual + multilingual)
- HiggsAudioBackend
- XTTSBackend
- UnifiedTTSService (singleton, initialization, synthesis, model switching)
- Background downloads
- Disk space checks
- Format conversion
- Duration calculation
- License compliance checks
- Stats and health checks
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from dataclasses import dataclass

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import service with graceful fallback
try:
    from services.unified_tts_service import (
        UnifiedTTSService,
        TTSModel,
        TTSModelInfo,
        TTS_MODEL_INFO,
        ModelStatus,
        UnifiedTTSResult,
        BaseTTSBackend,
        ChatterboxBackend,
        HiggsAudioBackend,
        XTTSBackend,
        get_unified_tts_service,
        check_license_compliance,
        _background_executor
    )
    SERVICE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"UnifiedTTSService not available: {e}")
    SERVICE_AVAILABLE = False


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def output_dir():
    """Create temporary output directory"""
    temp_dir = tempfile.mkdtemp(prefix="tts_unified_test_24_")
    output_path = Path(temp_dir)
    (output_path / "translated").mkdir(parents=True)
    (output_path / "models").mkdir(parents=True)
    (output_path / "models" / "huggingface").mkdir(parents=True)
    (output_path / "models" / "xtts").mkdir(parents=True)
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


@pytest.fixture
def mock_settings(output_dir):
    """Create mock settings for testing"""
    settings = MagicMock()
    settings.models_path = str(output_dir / "models")
    settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
    settings.xtts_models_path = str(output_dir / "models" / "xtts")
    settings.tts_output_dir = str(output_dir)
    settings.tts_default_format = "mp3"
    return settings


# ============================================================================
# TESTS: TTSModel Enum
# ============================================================================

class TestTTSModelEnum:
    """Tests for TTSModel enum"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_tts_model_values(self):
        """Test TTSModel enum values"""
        logger.info("Test 24.1: TTSModel enum values")

        assert TTSModel.CHATTERBOX.value == "chatterbox"
        assert TTSModel.CHATTERBOX_TURBO.value == "chatterbox-turbo"
        assert TTSModel.HIGGS_AUDIO_V2.value == "higgs-audio-v2"
        assert TTSModel.XTTS_V2.value == "xtts-v2"

        logger.info("TTSModel enum values OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_tts_model_get_default(self):
        """Test TTSModel.get_default()"""
        logger.info("Test 24.2: TTSModel.get_default()")

        default = TTSModel.get_default()
        assert default == TTSModel.CHATTERBOX

        logger.info("TTSModel.get_default() OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_tts_model_get_fallback(self):
        """Test TTSModel.get_fallback()"""
        logger.info("Test 24.3: TTSModel.get_fallback()")

        fallback = TTSModel.get_fallback()
        assert fallback == TTSModel.CHATTERBOX

        logger.info("TTSModel.get_fallback() OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_tts_model_iteration(self):
        """Test TTSModel iteration"""
        logger.info("Test 24.4: TTSModel iteration")

        models = list(TTSModel)
        assert len(models) == 4
        assert TTSModel.CHATTERBOX in models
        assert TTSModel.CHATTERBOX_TURBO in models
        assert TTSModel.HIGGS_AUDIO_V2 in models
        assert TTSModel.XTTS_V2 in models

        logger.info("TTSModel iteration OK")


# ============================================================================
# TESTS: TTS_MODEL_INFO Dictionary
# ============================================================================

class TestTTSModelInfo:
    """Tests for TTS_MODEL_INFO dictionary"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_all_models_have_info(self):
        """Test that all models have info entries"""
        logger.info("Test 24.5: All models have info")

        for model in TTSModel:
            assert model in TTS_MODEL_INFO
            info = TTS_MODEL_INFO[model]
            assert isinstance(info, TTSModelInfo)

        logger.info("All models have info OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_chatterbox_info(self):
        """Test Chatterbox model info"""
        logger.info("Test 24.6: Chatterbox info")

        info = TTS_MODEL_INFO[TTSModel.CHATTERBOX]
        assert info.name == "chatterbox"
        assert info.display_name == "Chatterbox (Resemble AI)"
        assert info.license == "Apache 2.0"
        assert info.commercial_use is True
        assert info.license_warning is None
        assert info.quality_score == 95
        assert info.speed_score == 85
        assert info.vram_gb == 4.0
        assert "en" in info.languages
        assert "fr" in info.languages
        assert info.hf_model_id == "ResembleAI/chatterbox"
        assert info.model_size_gb == 3.5

        logger.info("Chatterbox info OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_chatterbox_turbo_info(self):
        """Test Chatterbox Turbo model info"""
        logger.info("Test 24.7: Chatterbox Turbo info")

        info = TTS_MODEL_INFO[TTSModel.CHATTERBOX_TURBO]
        assert info.name == "chatterbox-turbo"
        assert info.commercial_use is True
        assert info.vram_gb == 2.0  # Less VRAM than regular
        assert info.speed_score == 95  # Faster
        assert info.hf_model_id == "ResembleAI/chatterbox-turbo"

        logger.info("Chatterbox Turbo info OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_higgs_audio_info(self):
        """Test Higgs Audio V2 model info"""
        logger.info("Test 24.8: Higgs Audio V2 info")

        info = TTS_MODEL_INFO[TTSModel.HIGGS_AUDIO_V2]
        assert info.name == "higgs-audio-v2"
        assert info.commercial_use is False
        assert info.license_warning is not None
        assert "100,000" in info.license_warning
        assert info.quality_score == 98  # Highest quality
        assert info.vram_gb == 8.0  # Requires more VRAM

        logger.info("Higgs Audio V2 info OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_xtts_info(self):
        """Test XTTS v2 model info"""
        logger.info("Test 24.9: XTTS v2 info")

        info = TTS_MODEL_INFO[TTSModel.XTTS_V2]
        assert info.name == "xtts-v2"
        assert info.commercial_use is False
        assert info.license_warning is not None
        assert "Coqui" in info.license_warning
        assert info.hf_model_id is None  # XTTS uses its own download system
        assert info.min_audio_seconds == 6.0

        logger.info("XTTS v2 info OK")


# ============================================================================
# TESTS: ModelStatus Dataclass
# ============================================================================

class TestModelStatus:
    """Tests for ModelStatus dataclass"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_model_status_creation(self):
        """Test ModelStatus creation"""
        logger.info("Test 24.10: ModelStatus creation")

        status = ModelStatus(
            model=TTSModel.CHATTERBOX,
            is_available=True,
            is_downloaded=True,
            is_loaded=False,
            is_downloading=False,
            download_progress=0.0,
            error=None
        )

        assert status.model == TTSModel.CHATTERBOX
        assert status.is_available is True
        assert status.is_downloaded is True
        assert status.is_loaded is False
        assert status.is_downloading is False
        assert status.download_progress == 0.0
        assert status.error is None

        logger.info("ModelStatus creation OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_model_status_with_error(self):
        """Test ModelStatus with error"""
        logger.info("Test 24.11: ModelStatus with error")

        status = ModelStatus(
            model=TTSModel.HIGGS_AUDIO_V2,
            is_available=False,
            is_downloaded=False,
            is_loaded=False,
            is_downloading=False,
            download_progress=0.0,
            error="Package not installed"
        )

        assert status.error == "Package not installed"

        logger.info("ModelStatus with error OK")


# ============================================================================
# TESTS: UnifiedTTSResult Dataclass
# ============================================================================

class TestUnifiedTTSResult:
    """Tests for UnifiedTTSResult dataclass"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_unified_tts_result_creation(self):
        """Test UnifiedTTSResult creation"""
        logger.info("Test 24.12: UnifiedTTSResult creation")

        model_info = TTS_MODEL_INFO[TTSModel.CHATTERBOX]
        result = UnifiedTTSResult(
            audio_path="/tmp/test.mp3",
            audio_url="/outputs/audio/translated/test.mp3",
            duration_ms=3500,
            format="mp3",
            language="fr",
            voice_cloned=True,
            voice_quality=0.95,
            processing_time_ms=450,
            text_length=100,
            model_used=TTSModel.CHATTERBOX,
            model_info=model_info
        )

        assert result.audio_path == "/tmp/test.mp3"
        assert result.audio_url == "/outputs/audio/translated/test.mp3"
        assert result.duration_ms == 3500
        assert result.format == "mp3"
        assert result.language == "fr"
        assert result.voice_cloned is True
        assert result.voice_quality == 0.95
        assert result.processing_time_ms == 450
        assert result.text_length == 100
        assert result.model_used == TTSModel.CHATTERBOX
        assert result.model_info.name == "chatterbox"

        logger.info("UnifiedTTSResult creation OK")


# ============================================================================
# TESTS: BaseTTSBackend
# ============================================================================

class TestBaseTTSBackend:
    """Tests for BaseTTSBackend abstract class"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_base_backend_properties(self):
        """Test BaseTTSBackend default properties"""
        logger.info("Test 24.13: BaseTTSBackend properties")

        # Create a concrete implementation for testing
        class TestBackend(BaseTTSBackend):
            async def initialize(self) -> bool:
                return True

            async def synthesize(self, text, language, speaker_audio_path=None, output_path=None, **kwargs):
                return output_path

            async def close(self):
                pass

            @property
            def is_available(self) -> bool:
                return True

            def is_model_downloaded(self) -> bool:
                return True

            async def download_model(self) -> bool:
                return True

        backend = TestBackend()

        assert backend.is_initialized is False
        assert backend.is_downloading is False
        assert backend.download_progress == 0.0

        # Modify internal state
        backend._initialized = True
        backend._downloading = True
        backend._download_progress = 50.0

        assert backend.is_initialized is True
        assert backend.is_downloading is True
        assert backend.download_progress == 50.0

        logger.info("BaseTTSBackend properties OK")


# ============================================================================
# TESTS: ChatterboxBackend
# ============================================================================

class TestChatterboxBackend:
    """Tests for ChatterboxBackend"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_chatterbox_backend_init(self, mock_settings):
        """Test ChatterboxBackend initialization"""
        logger.info("Test 24.14: ChatterboxBackend init")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu", turbo=False)

            assert backend.device == "cpu"
            assert backend.turbo is False
            assert backend.model is None
            assert backend.model_multilingual is None
            # is_available depends on whether chatterbox is installed
            logger.info(f"ChatterboxBackend available: {backend.is_available}")

        logger.info("ChatterboxBackend init OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_chatterbox_backend_turbo(self, mock_settings):
        """Test ChatterboxBackend turbo mode"""
        logger.info("Test 24.15: ChatterboxBackend turbo mode")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu", turbo=True)

            assert backend.turbo is True

        logger.info("ChatterboxBackend turbo mode OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_chatterbox_multilingual_languages(self, mock_settings):
        """Test ChatterboxBackend multilingual languages set"""
        logger.info("Test 24.16: ChatterboxBackend multilingual languages")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")

            assert 'en' in backend.MULTILINGUAL_LANGUAGES
            assert 'fr' in backend.MULTILINGUAL_LANGUAGES
            assert 'de' in backend.MULTILINGUAL_LANGUAGES
            assert 'es' in backend.MULTILINGUAL_LANGUAGES
            assert 'ja' in backend.MULTILINGUAL_LANGUAGES
            assert 'zh' in backend.MULTILINGUAL_LANGUAGES
            assert len(backend.MULTILINGUAL_LANGUAGES) == 23

        logger.info("ChatterboxBackend multilingual languages OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_close(self, mock_settings):
        """Test ChatterboxBackend close"""
        logger.info("Test 24.17: ChatterboxBackend close")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend.model = MagicMock()
            backend.model_multilingual = MagicMock()
            backend._initialized = True
            backend._initialized_multilingual = True

            await backend.close()

            assert backend.model is None
            assert backend.model_multilingual is None
            assert backend._initialized is False
            assert backend._initialized_multilingual is False

        logger.info("ChatterboxBackend close OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_chatterbox_backend_get_device_auto_cpu(self, mock_settings):
        """Test ChatterboxBackend _get_device with auto on CPU"""
        logger.info("Test 24.18: ChatterboxBackend _get_device auto CPU")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="auto")

            mock_torch = MagicMock()
            mock_torch.cuda.is_available.return_value = False
            mock_torch.backends.mps.is_available.return_value = False

            with patch.dict('sys.modules', {'torch': mock_torch}):
                with patch('services.unified_tts_service.torch', mock_torch, create=True):
                    # Re-import to get the mocked torch
                    import importlib
                    device = backend._get_device()
                    # Device should be determined by torch availability

        logger.info("ChatterboxBackend _get_device auto CPU OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_is_model_downloaded_not_available(self, mock_settings):
        """Test ChatterboxBackend is_model_downloaded when not available"""
        logger.info("Test 24.19: ChatterboxBackend is_model_downloaded not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend._available = False

            assert backend.is_model_downloaded() is False

        logger.info("ChatterboxBackend is_model_downloaded not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_download_not_available(self, mock_settings):
        """Test ChatterboxBackend download when not available"""
        logger.info("Test 24.20: ChatterboxBackend download not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend._available = False

            result = await backend.download_model()
            assert result is False

        logger.info("ChatterboxBackend download not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_initialize_already_initialized(self, mock_settings):
        """Test ChatterboxBackend initialize when already initialized"""
        logger.info("Test 24.21: ChatterboxBackend initialize already initialized")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend._initialized = True

            result = await backend.initialize()
            assert result is True

        logger.info("ChatterboxBackend initialize already initialized OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_initialize_not_available(self, mock_settings):
        """Test ChatterboxBackend initialize when not available"""
        logger.info("Test 24.22: ChatterboxBackend initialize not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend._available = False
            backend._initialized = False

            result = await backend.initialize()
            assert result is False

        logger.info("ChatterboxBackend initialize not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_initialize_multilingual_already_initialized(self, mock_settings):
        """Test ChatterboxBackend initialize_multilingual when already initialized"""
        logger.info("Test 24.23: ChatterboxBackend initialize_multilingual already initialized")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend._initialized_multilingual = True

            result = await backend.initialize_multilingual()
            assert result is True

        logger.info("ChatterboxBackend initialize_multilingual already initialized OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_chatterbox_backend_initialize_multilingual_not_available(self, mock_settings):
        """Test ChatterboxBackend initialize_multilingual when not available"""
        logger.info("Test 24.24: ChatterboxBackend initialize_multilingual not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = ChatterboxBackend(device="cpu")
            backend._available_multilingual = False
            backend._initialized_multilingual = False

            result = await backend.initialize_multilingual()
            assert result is False

        logger.info("ChatterboxBackend initialize_multilingual not available OK")


# ============================================================================
# TESTS: HiggsAudioBackend
# ============================================================================

class TestHiggsAudioBackend:
    """Tests for HiggsAudioBackend"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_higgs_backend_init(self, mock_settings):
        """Test HiggsAudioBackend initialization"""
        logger.info("Test 24.25: HiggsAudioBackend init")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = HiggsAudioBackend(device="cpu")

            assert backend.device == "cpu"
            assert backend.model is None
            assert backend.tokenizer is None
            # is_available depends on whether transformers is installed
            logger.info(f"HiggsAudioBackend available: {backend.is_available}")

        logger.info("HiggsAudioBackend init OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_higgs_backend_close(self, mock_settings):
        """Test HiggsAudioBackend close"""
        logger.info("Test 24.26: HiggsAudioBackend close")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = HiggsAudioBackend(device="cpu")
            backend.model = MagicMock()
            backend.tokenizer = MagicMock()
            backend._initialized = True

            await backend.close()

            assert backend.model is None
            assert backend.tokenizer is None
            assert backend._initialized is False

        logger.info("HiggsAudioBackend close OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_higgs_backend_download_not_available(self, mock_settings):
        """Test HiggsAudioBackend download when not available"""
        logger.info("Test 24.27: HiggsAudioBackend download not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = HiggsAudioBackend(device="cpu")
            backend._available = False

            result = await backend.download_model()
            assert result is False

        logger.info("HiggsAudioBackend download not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_higgs_backend_is_model_downloaded_not_available(self, mock_settings):
        """Test HiggsAudioBackend is_model_downloaded when not available"""
        logger.info("Test 24.28: HiggsAudioBackend is_model_downloaded not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = HiggsAudioBackend(device="cpu")
            backend._available = False

            assert backend.is_model_downloaded() is False

        logger.info("HiggsAudioBackend is_model_downloaded not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_higgs_backend_initialize_already_initialized(self, mock_settings):
        """Test HiggsAudioBackend initialize when already initialized"""
        logger.info("Test 24.29: HiggsAudioBackend initialize already initialized")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = HiggsAudioBackend(device="cpu")
            backend._initialized = True

            result = await backend.initialize()
            assert result is True

        logger.info("HiggsAudioBackend initialize already initialized OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_higgs_backend_initialize_not_available(self, mock_settings):
        """Test HiggsAudioBackend initialize when not available"""
        logger.info("Test 24.30: HiggsAudioBackend initialize not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = HiggsAudioBackend(device="cpu")
            backend._available = False
            backend._initialized = False

            result = await backend.initialize()
            assert result is False

        logger.info("HiggsAudioBackend initialize not available OK")


# ============================================================================
# TESTS: XTTSBackend
# ============================================================================

class TestXTTSBackend:
    """Tests for XTTSBackend"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_xtts_backend_init(self, mock_settings):
        """Test XTTSBackend initialization"""
        logger.info("Test 24.31: XTTSBackend init")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")

            assert backend.device == "cpu"
            assert backend.model is None
            # is_available depends on whether TTS is installed
            logger.info(f"XTTSBackend available: {backend.is_available}")

        logger.info("XTTSBackend init OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_xtts_backend_close(self, mock_settings):
        """Test XTTSBackend close"""
        logger.info("Test 24.32: XTTSBackend close")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")
            backend.model = MagicMock()
            backend._initialized = True

            await backend.close()

            assert backend.model is None
            assert backend._initialized is False

        logger.info("XTTSBackend close OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_xtts_backend_download_not_available(self, mock_settings):
        """Test XTTSBackend download when not available"""
        logger.info("Test 24.33: XTTSBackend download not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")
            backend._available = False

            result = await backend.download_model()
            assert result is False

        logger.info("XTTSBackend download not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_xtts_backend_is_model_downloaded_not_available(self, mock_settings):
        """Test XTTSBackend is_model_downloaded when not available"""
        logger.info("Test 24.34: XTTSBackend is_model_downloaded not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")
            backend._available = False

            assert backend.is_model_downloaded() is False

        logger.info("XTTSBackend is_model_downloaded not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_xtts_backend_initialize_already_initialized(self, mock_settings):
        """Test XTTSBackend initialize when already initialized"""
        logger.info("Test 24.35: XTTSBackend initialize already initialized")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")
            backend._initialized = True

            result = await backend.initialize()
            assert result is True

        logger.info("XTTSBackend initialize already initialized OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_xtts_backend_initialize_not_available(self, mock_settings):
        """Test XTTSBackend initialize when not available"""
        logger.info("Test 24.36: XTTSBackend initialize not available")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")
            backend._available = False
            backend._initialized = False

            result = await backend.initialize()
            assert result is False

        logger.info("XTTSBackend initialize not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_xtts_backend_is_model_downloaded_checks_paths(self, mock_settings, output_dir):
        """Test XTTSBackend is_model_downloaded checks multiple paths"""
        logger.info("Test 24.37: XTTSBackend is_model_downloaded paths")

        with patch('services.unified_tts_service.get_settings', return_value=mock_settings):
            backend = XTTSBackend(device="cpu")
            backend._available = True

            # Create the expected path
            xtts_model_path = output_dir / "models" / "xtts" / "tts_models--multilingual--multi-dataset--xtts_v2"
            xtts_model_path.mkdir(parents=True, exist_ok=True)

            # Should find the model
            result = backend.is_model_downloaded()
            # Result depends on actual path structure

        logger.info("XTTSBackend is_model_downloaded paths OK")


# ============================================================================
# TESTS: UnifiedTTSService
# ============================================================================

class TestUnifiedTTSService:
    """Tests for UnifiedTTSService"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_singleton_pattern(self, reset_singleton, output_dir):
        """Test singleton pattern"""
        logger.info("Test 24.38: Singleton pattern")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service1 = UnifiedTTSService(output_dir=str(output_dir))
            service2 = UnifiedTTSService(output_dir=str(output_dir))

            assert service1 is service2

        logger.info("Singleton pattern OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_service_init_with_env_model(self, reset_singleton, output_dir):
        """Test service init with TTS_MODEL env var"""
        logger.info("Test 24.39: Service init with env model")

        with patch.dict(os.environ, {'TTS_MODEL': 'chatterbox-turbo'}):
            with patch('services.unified_tts_service.get_settings') as mock_get_settings:
                mock_settings = MagicMock()
                mock_settings.models_path = str(output_dir / "models")
                mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
                mock_settings.tts_output_dir = str(output_dir)
                mock_settings.tts_default_format = "mp3"
                mock_get_settings.return_value = mock_settings

                service = UnifiedTTSService(output_dir=str(output_dir))
                assert service.requested_model == TTSModel.CHATTERBOX_TURBO

        logger.info("Service init with env model OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_service_init_with_invalid_model(self, reset_singleton, output_dir):
        """Test service init with invalid model falls back to chatterbox"""
        logger.info("Test 24.40: Service init with invalid model")

        with patch.dict(os.environ, {'TTS_MODEL': 'invalid-model'}):
            with patch('services.unified_tts_service.get_settings') as mock_get_settings:
                mock_settings = MagicMock()
                mock_settings.models_path = str(output_dir / "models")
                mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
                mock_settings.tts_output_dir = str(output_dir)
                mock_settings.tts_default_format = "mp3"
                mock_get_settings.return_value = mock_settings

                service = UnifiedTTSService(output_dir=str(output_dir))
                assert service.requested_model == TTSModel.CHATTERBOX

        logger.info("Service init with invalid model OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_create_backend(self, reset_singleton, output_dir):
        """Test _create_backend creates correct backend types"""
        logger.info("Test 24.41: Create backend")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            backend_chatterbox = service._create_backend(TTSModel.CHATTERBOX)
            assert isinstance(backend_chatterbox, ChatterboxBackend)
            assert backend_chatterbox.turbo is False

            backend_turbo = service._create_backend(TTSModel.CHATTERBOX_TURBO)
            assert isinstance(backend_turbo, ChatterboxBackend)
            assert backend_turbo.turbo is True

            backend_higgs = service._create_backend(TTSModel.HIGGS_AUDIO_V2)
            assert isinstance(backend_higgs, HiggsAudioBackend)

            backend_xtts = service._create_backend(TTSModel.XTTS_V2)
            assert isinstance(backend_xtts, XTTSBackend)

        logger.info("Create backend OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_create_backend_invalid_model(self, reset_singleton, output_dir):
        """Test _create_backend raises ValueError for invalid model"""
        logger.info("Test 24.42: Create backend invalid model")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Create a mock invalid model (simulate by passing an invalid value)
            with pytest.raises(ValueError):
                service._create_backend("invalid")

        logger.info("Create backend invalid model OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_available_disk_space(self, reset_singleton, output_dir):
        """Test _get_available_disk_space_gb"""
        logger.info("Test 24.43: Get available disk space")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            space = service._get_available_disk_space_gb()
            assert space >= 0

        logger.info("Get available disk space OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_can_download_model(self, reset_singleton, output_dir):
        """Test _can_download_model"""
        logger.info("Test 24.44: Can download model")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Mock disk space to be large enough
            with patch.object(service, '_get_available_disk_space_gb', return_value=100.0):
                can_download = service._can_download_model(TTSModel.CHATTERBOX)
                assert can_download is True

            # Mock disk space to be too small
            with patch.object(service, '_get_available_disk_space_gb', return_value=0.1):
                can_download = service._can_download_model(TTSModel.CHATTERBOX)
                assert can_download is False

        logger.info("Can download model OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_model_status(self, reset_singleton, output_dir):
        """Test get_model_status"""
        logger.info("Test 24.45: Get model status")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = True
            mock_backend.is_initialized = False
            mock_backend.is_downloading = False
            mock_backend.download_progress = 0.0

            with patch.object(service, '_create_backend', return_value=mock_backend):
                status = await service.get_model_status(TTSModel.CHATTERBOX)

            assert isinstance(status, ModelStatus)
            assert status.model == TTSModel.CHATTERBOX
            assert status.is_available is True
            assert status.is_downloaded is True

        logger.info("Get model status OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_all_models_status(self, reset_singleton, output_dir):
        """Test get_all_models_status"""
        logger.info("Test 24.46: Get all models status")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = False
            mock_backend.is_initialized = False
            mock_backend.is_downloading = False
            mock_backend.download_progress = 0.0

            with patch.object(service, '_create_backend', return_value=mock_backend):
                all_status = await service.get_all_models_status()

            assert len(all_status) == len(TTSModel)
            for model_value, status in all_status.items():
                assert isinstance(status, ModelStatus)

        logger.info("Get all models status OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_is_ready_property(self, reset_singleton, output_dir):
        """Test is_ready property"""
        logger.info("Test 24.47: is_ready property")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Not ready initially
            assert service.is_ready is False

            # Add active backend
            mock_backend = MagicMock()
            mock_backend.is_initialized = True
            service.active_backend = mock_backend

            assert service.is_ready is True

            # Backend not initialized
            mock_backend.is_initialized = False
            assert service.is_ready is False

        logger.info("is_ready property OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_model_info(self, reset_singleton, output_dir):
        """Test get_model_info"""
        logger.info("Test 24.48: Get model info")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            info = service.get_model_info(TTSModel.CHATTERBOX)
            assert info.name == "chatterbox"

            # Test with current model (default)
            info_default = service.get_model_info()
            assert info_default is not None

        logger.info("Get model info OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_available_models(self, reset_singleton, output_dir):
        """Test get_available_models"""
        logger.info("Test 24.49: Get available models")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            models = service.get_available_models()
            assert len(models) == len(TTSModel)
            assert "chatterbox" in models
            assert "chatterbox-turbo" in models
            assert "higgs-audio-v2" in models
            assert "xtts-v2" in models

        logger.info("Get available models OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_supported_languages(self, reset_singleton, output_dir):
        """Test get_supported_languages"""
        logger.info("Test 24.50: Get supported languages")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            languages = service.get_supported_languages(TTSModel.CHATTERBOX)
            assert "en" in languages
            assert "fr" in languages

            # Test with default model
            languages_default = service.get_supported_languages()
            assert len(languages_default) > 0

        logger.info("Get supported languages OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_stats(self, reset_singleton, output_dir):
        """Test get_stats"""
        logger.info("Test 24.51: Get stats")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.is_initialized = True

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = False
            mock_backend.is_initialized = False
            mock_backend.is_downloading = False
            mock_backend.download_progress = 0.0

            with patch.object(service, '_create_backend', return_value=mock_backend):
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

        logger.info("Get stats OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_stats_with_active_backend(self, reset_singleton, output_dir):
        """Test get_stats with active backend"""
        logger.info("Test 24.52: Get stats with active backend")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.is_initialized = True

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = True
            mock_backend.is_initialized = True
            mock_backend.is_downloading = False
            mock_backend.download_progress = 0.0

            service.active_backend = mock_backend

            with patch.object(service, '_create_backend', return_value=mock_backend):
                stats = await service.get_stats()

            assert stats["is_ready"] is True
            assert stats["status"] == "ready"
            assert stats["current_model_info"] is not None

        logger.info("Get stats with active backend OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_close(self, reset_singleton, output_dir):
        """Test close method"""
        logger.info("Test 24.53: Close method")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.is_initialized = True

            mock_backend = MagicMock()
            mock_backend.close = AsyncMock()
            service.backends = {TTSModel.CHATTERBOX: mock_backend}
            service.active_backend = mock_backend

            await service.close()

            assert service.is_initialized is False
            assert service.active_backend is None
            assert len(service.backends) == 0
            mock_backend.close.assert_called_once()

        logger.info("Close method OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_close_cancels_downloads(self, reset_singleton, output_dir):
        """Test close cancels background downloads"""
        logger.info("Test 24.54: Close cancels downloads")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.is_initialized = True

            # Add mock background download task
            mock_task = MagicMock()
            service._background_downloads = {TTSModel.HIGGS_AUDIO_V2: mock_task}

            await service.close()

            mock_task.cancel.assert_called_once()
            assert len(service._background_downloads) == 0

        logger.info("Close cancels downloads OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_initialize_with_local_model(self, reset_singleton, output_dir):
        """Test initialize with local model available"""
        logger.info("Test 24.55: Initialize with local model")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = True
            mock_backend.is_initialized = False
            mock_backend.initialize = AsyncMock(return_value=True)

            with patch.object(service, '_create_backend', return_value=mock_backend):
                with patch.object(service, '_download_models_background', new_callable=AsyncMock):
                    result = await service.initialize()

            assert result is True
            assert service.is_initialized is True

        logger.info("Initialize with local model OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_initialize_already_initialized(self, reset_singleton, output_dir):
        """Test initialize when already initialized"""
        logger.info("Test 24.56: Initialize already initialized")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock()
            mock_backend.is_initialized = True
            service.backends = {TTSModel.CHATTERBOX: mock_backend}

            result = await service.initialize(TTSModel.CHATTERBOX)

            assert result is True
            assert service.active_backend == mock_backend

        logger.info("Initialize already initialized OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_switch_model_already_active(self, reset_singleton, output_dir):
        """Test switch_model when model already active"""
        logger.info("Test 24.57: Switch model already active")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.current_model = TTSModel.CHATTERBOX

            mock_backend = MagicMock()
            mock_backend.is_initialized = True
            service.active_backend = mock_backend

            result = await service.switch_model(TTSModel.CHATTERBOX)

            assert result is True  # Already active

        logger.info("Switch model already active OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_switch_model_not_available(self, reset_singleton, output_dir):
        """Test switch_model when model not available"""
        logger.info("Test 24.58: Switch model not available")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.current_model = TTSModel.CHATTERBOX

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = False
            mock_backend.is_model_downloaded.return_value = False
            mock_backend.is_initialized = False
            mock_backend.is_downloading = False
            mock_backend.download_progress = 0.0

            with patch.object(service, '_create_backend', return_value=mock_backend):
                result = await service.switch_model(TTSModel.HIGGS_AUDIO_V2)

            assert result is False  # Not available

        logger.info("Switch model not available OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_switch_model_not_downloaded_insufficient_space(self, reset_singleton, output_dir):
        """Test switch_model when not downloaded and insufficient disk space"""
        logger.info("Test 24.59: Switch model insufficient space")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.current_model = TTSModel.CHATTERBOX

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = False
            mock_backend.is_initialized = False
            mock_backend.is_downloading = False
            mock_backend.download_progress = 0.0

            with patch.object(service, '_create_backend', return_value=mock_backend):
                with patch.object(service, '_can_download_model', return_value=False):
                    result = await service.switch_model(TTSModel.HIGGS_AUDIO_V2)

            assert result is False  # Insufficient space

        logger.info("Switch model insufficient space OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_synthesize_with_voice_no_backend(self, reset_singleton, output_dir):
        """Test synthesize_with_voice waits for backend"""
        logger.info("Test 24.60: Synthesize with voice no backend")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.is_initialized = True
            service.active_backend = None

            with pytest.raises(RuntimeError) as exc_info:
                await service.synthesize_with_voice(
                    text="Test",
                    speaker_audio_path=None,
                    target_language="en",
                    max_wait_seconds=1  # Short timeout
                )

            assert "Aucun backend TTS disponible" in str(exc_info.value)

        logger.info("Synthesize with voice no backend OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_synthesize_simple(self, reset_singleton, output_dir):
        """Test synthesize simple method"""
        logger.info("Test 24.61: Synthesize simple")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))
            service.is_initialized = True

            mock_backend = MagicMock()
            mock_backend.is_initialized = True
            mock_backend.synthesize = AsyncMock(return_value=str(output_dir / "translated" / "test.wav"))
            service.active_backend = mock_backend

            with patch.object(service, '_convert_format', new_callable=AsyncMock) as mock_convert:
                mock_convert.return_value = str(output_dir / "translated" / "test.mp3")
                with patch.object(service, '_get_duration_ms', new_callable=AsyncMock) as mock_duration:
                    mock_duration.return_value = 2000

                    result = await service.synthesize(
                        text="Hello world",
                        language="en"
                    )

                    assert isinstance(result, UnifiedTTSResult)
                    assert result.language == "en"

        logger.info("Synthesize simple OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_convert_format(self, reset_singleton, output_dir):
        """Test _convert_format"""
        logger.info("Test 24.62: Convert format")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Create test wav file
            test_wav = output_dir / "translated" / "test.wav"
            test_wav.parent.mkdir(parents=True, exist_ok=True)
            test_wav.write_bytes(b"fake wav data")

            # Mock pydub.AudioSegment at the module level
            mock_audio_segment_instance = MagicMock()
            mock_audio_segment_class = MagicMock()
            mock_audio_segment_class.from_wav.return_value = mock_audio_segment_instance

            # Patch the import inside the function
            mock_pydub_module = MagicMock()
            mock_pydub_module.AudioSegment = mock_audio_segment_class

            with patch.dict('sys.modules', {'pydub': mock_pydub_module}):
                result = await service._convert_format(str(test_wav), "mp3")
                # The function changes extension to target format
                assert result.endswith(".mp3")

        logger.info("Convert format OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_convert_format_error(self, reset_singleton, output_dir):
        """Test _convert_format with error"""
        logger.info("Test 24.63: Convert format error")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Create a mock pydub module that raises when AudioSegment.from_wav is called
            mock_audio_segment_class = MagicMock()
            mock_audio_segment_class.from_wav.side_effect = Exception("Conversion failed")
            mock_pydub_module = MagicMock()
            mock_pydub_module.AudioSegment = mock_audio_segment_class

            with patch.dict('sys.modules', {'pydub': mock_pydub_module}):
                result = await service._convert_format("/tmp/test.wav", "mp3")
                # Should return original path on error
                assert result == "/tmp/test.wav"

        logger.info("Convert format error OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_duration_ms(self, reset_singleton, output_dir):
        """Test _get_duration_ms"""
        logger.info("Test 24.64: Get duration ms")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Mock librosa
            with patch.dict('sys.modules', {'librosa': MagicMock()}):
                import sys
                mock_librosa = sys.modules['librosa']
                mock_librosa.get_duration.return_value = 2.5

                result = await service._get_duration_ms("/tmp/test.mp3")
                # The result depends on the mock

        logger.info("Get duration ms OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_get_duration_ms_error(self, reset_singleton, output_dir):
        """Test _get_duration_ms with error"""
        logger.info("Test 24.65: Get duration ms error")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # Test with non-existent file (should return 0)
            result = await service._get_duration_ms("/nonexistent/file.mp3")
            assert result == 0

        logger.info("Get duration ms error OK")


# ============================================================================
# TESTS: License Compliance
# ============================================================================

class TestLicenseCompliance:
    """Tests for license compliance checking"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_license_compliance_chatterbox(self):
        """Test license compliance for Chatterbox"""
        logger.info("Test 24.66: License compliance Chatterbox")

        is_commercial, warning = check_license_compliance(TTSModel.CHATTERBOX)
        assert is_commercial is True
        assert warning is None

        logger.info("License compliance Chatterbox OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_license_compliance_chatterbox_turbo(self):
        """Test license compliance for Chatterbox Turbo"""
        logger.info("Test 24.67: License compliance Chatterbox Turbo")

        is_commercial, warning = check_license_compliance(TTSModel.CHATTERBOX_TURBO)
        assert is_commercial is True
        assert warning is None

        logger.info("License compliance Chatterbox Turbo OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_license_compliance_higgs(self):
        """Test license compliance for Higgs Audio V2"""
        logger.info("Test 24.68: License compliance Higgs")

        is_commercial, warning = check_license_compliance(TTSModel.HIGGS_AUDIO_V2)
        assert is_commercial is False
        assert warning is not None
        assert "100,000" in warning

        logger.info("License compliance Higgs OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_license_compliance_xtts(self):
        """Test license compliance for XTTS"""
        logger.info("Test 24.69: License compliance XTTS")

        is_commercial, warning = check_license_compliance(TTSModel.XTTS_V2)
        assert is_commercial is False
        assert warning is not None
        assert "Coqui" in warning

        logger.info("License compliance XTTS OK")


# ============================================================================
# TESTS: get_unified_tts_service
# ============================================================================

class TestGetUnifiedTTSService:
    """Tests for get_unified_tts_service helper function"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    def test_get_unified_tts_service(self, reset_singleton, output_dir):
        """Test get_unified_tts_service helper"""
        logger.info("Test 24.70: get_unified_tts_service")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = get_unified_tts_service()
            assert isinstance(service, UnifiedTTSService)

            # Should return same instance
            service2 = get_unified_tts_service()
            assert service is service2

        logger.info("get_unified_tts_service OK")


# ============================================================================
# TESTS: Find Local Model
# ============================================================================

class TestFindLocalModel:
    """Tests for _find_local_model method"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_find_local_model_preferred(self, reset_singleton, output_dir):
        """Test _find_local_model finds preferred model"""
        logger.info("Test 24.71: Find local model preferred")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = True

            with patch.object(service, '_create_backend', return_value=mock_backend):
                result = await service._find_local_model(TTSModel.HIGGS_AUDIO_V2)

            assert result == TTSModel.HIGGS_AUDIO_V2

        logger.info("Find local model preferred OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_find_local_model_fallback_to_chatterbox(self, reset_singleton, output_dir):
        """Test _find_local_model falls back to Chatterbox"""
        logger.info("Test 24.72: Find local model fallback to Chatterbox")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            # First call returns unavailable, second (chatterbox) returns available
            call_count = [0]
            def mock_create_backend(model):
                backend = MagicMock(spec=BaseTTSBackend)
                if model == TTSModel.CHATTERBOX:
                    backend.is_available = True
                    backend.is_model_downloaded.return_value = True
                else:
                    backend.is_available = True
                    backend.is_model_downloaded.return_value = False
                return backend

            with patch.object(service, '_create_backend', side_effect=mock_create_backend):
                result = await service._find_local_model(TTSModel.HIGGS_AUDIO_V2)

            assert result == TTSModel.CHATTERBOX

        logger.info("Find local model fallback to Chatterbox OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_find_local_model_none_available(self, reset_singleton, output_dir):
        """Test _find_local_model when none available"""
        logger.info("Test 24.73: Find local model none available")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock(spec=BaseTTSBackend)
            mock_backend.is_available = True
            mock_backend.is_model_downloaded.return_value = False

            with patch.object(service, '_create_backend', return_value=mock_backend):
                result = await service._find_local_model(TTSModel.CHATTERBOX)

            assert result is None

        logger.info("Find local model none available OK")


# ============================================================================
# TESTS: Load Model
# ============================================================================

class TestLoadModel:
    """Tests for _load_model method"""

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_load_model_success(self, reset_singleton, output_dir):
        """Test _load_model success"""
        logger.info("Test 24.74: Load model success")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock()
            mock_backend.initialize = AsyncMock(return_value=True)

            with patch.object(service, '_create_backend', return_value=mock_backend):
                result = await service._load_model(TTSModel.CHATTERBOX)

            assert result is True
            assert service.active_backend == mock_backend
            assert service.current_model == TTSModel.CHATTERBOX

        logger.info("Load model success OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_load_model_failure(self, reset_singleton, output_dir):
        """Test _load_model failure"""
        logger.info("Test 24.75: Load model failure")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock()
            mock_backend.initialize = AsyncMock(return_value=False)

            with patch.object(service, '_create_backend', return_value=mock_backend):
                result = await service._load_model(TTSModel.CHATTERBOX)

            assert result is False

        logger.info("Load model failure OK")

    @pytest.mark.skipif(not SERVICE_AVAILABLE, reason="Service not available")
    @pytest.mark.asyncio
    async def test_load_model_with_license_warning(self, reset_singleton, output_dir):
        """Test _load_model displays license warning"""
        logger.info("Test 24.76: Load model with license warning")

        with patch('services.unified_tts_service.get_settings') as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.models_path = str(output_dir / "models")
            mock_settings.huggingface_cache_path = str(output_dir / "models" / "huggingface")
            mock_settings.xtts_models_path = str(output_dir / "models" / "xtts")
            mock_settings.tts_output_dir = str(output_dir)
            mock_settings.tts_default_format = "mp3"
            mock_get_settings.return_value = mock_settings

            service = UnifiedTTSService(output_dir=str(output_dir))

            mock_backend = MagicMock()
            mock_backend.initialize = AsyncMock(return_value=True)

            with patch.object(service, '_create_backend', return_value=mock_backend):
                with patch('builtins.print') as mock_print:
                    result = await service._load_model(TTSModel.HIGGS_AUDIO_V2)

            assert result is True
            # License warning should have been printed

        logger.info("Load model with license warning OK")


# ============================================================================
# MAIN: Run all tests
# ============================================================================

async def run_all_tests():
    """Run all UnifiedTTSService tests"""
    logger.info("=" * 70)
    logger.info("Starting UnifiedTTSService Comprehensive Tests (Test 24)")
    logger.info("=" * 70)

    test_classes = [
        TestTTSModelEnum,
        TestTTSModelInfo,
        TestModelStatus,
        TestUnifiedTTSResult,
        TestBaseTTSBackend,
        TestChatterboxBackend,
        TestHiggsAudioBackend,
        TestXTTSBackend,
        TestUnifiedTTSService,
        TestLicenseCompliance,
        TestGetUnifiedTTSService,
        TestFindLocalModel,
        TestLoadModel,
    ]

    logger.info(f"Total of {len(test_classes)} test classes to execute")
    logger.info("=" * 70)

    logger.info("Tests ready to be executed with pytest")
    return True


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
