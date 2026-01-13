#!/usr/bin/env python3
"""
Test 17 - TTS Models API Tests
Comprehensive unit tests for the TTS Models Management API endpoints.

Endpoints tested:
- GET /v1/tts/models - List all TTS models
- GET /v1/tts/models/current - Get current model
- GET /v1/tts/models/status - Get all models status
- POST /v1/tts/models/switch - Switch TTS model
- POST /v1/tts/models/{model}/download - Download a model
- GET /v1/tts/models/{model}/info - Get model info
- GET /v1/tts/models/{model}/license - Get license info
- GET /v1/tts/models/{model}/languages - Get supported languages
- GET /v1/tts/models/compare - Compare models
- GET /v1/tts/stats - Get TTS statistics
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
from typing import Dict, Any, Optional
from enum import Enum

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Check if FastAPI is real or mocked (conftest.py mocks it for non-API tests)
def _is_fastapi_available():
    """Check if real FastAPI is available (not mocked by conftest)"""
    try:
        import fastapi
        from unittest.mock import MagicMock
        if isinstance(fastapi.APIRouter, MagicMock):
            return False
        if not hasattr(fastapi, '__version__'):
            return False
        return True
    except (ImportError, AttributeError):
        return False

FASTAPI_AVAILABLE = _is_fastapi_available()

# Import the API module
try:
    from api.tts_models_api import (
        create_tts_models_router,
        TTSModelInfoResponse,
        TTSModelStatusResponse,
        TTSAllModelsStatusResponse,
        TTSModelsListResponse,
        TTSModelSwitchRequest,
        TTSModelSwitchResponse,
        TTSModelDownloadRequest,
        TTSModelDownloadResponse,
        TTSLicenseInfoResponse,
        TTSCurrentModelResponse,
    )
    API_AVAILABLE = True
except ImportError as e:
    logger.warning(f"TTS Models API not available: {e}")
    API_AVAILABLE = False

# Import FastAPI test client - only if FastAPI is real
if FASTAPI_AVAILABLE:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
else:
    FastAPI = None
    TestClient = None


# =========================================================================
# MOCK CLASSES - Simulating unified_tts_service types
# =========================================================================

class MockTTSModel(str, Enum):
    """Mock TTSModel enum for testing"""
    CHATTERBOX = "chatterbox"
    CHATTERBOX_TURBO = "chatterbox-turbo"
    HIGGS_AUDIO_V2 = "higgs-audio-v2"
    XTTS_V2 = "xtts-v2"

    @classmethod
    def get_default(cls):
        return cls.CHATTERBOX

    @classmethod
    def get_fallback(cls):
        return cls.CHATTERBOX


@dataclass
class MockTTSModelInfo:
    """Mock model info for testing"""
    name: str
    display_name: str
    license: str
    commercial_use: bool
    license_warning: Optional[str]
    languages: list
    min_audio_seconds: float
    quality_score: int
    speed_score: int
    vram_gb: float
    model_size_gb: float = 3.5


@dataclass
class MockModelStatus:
    """Mock model status for testing"""
    model: MockTTSModel
    is_available: bool
    is_downloaded: bool
    is_loaded: bool
    is_downloading: bool
    download_progress: float
    error: Optional[str] = None


# Mock TTS_MODEL_INFO dictionary
MOCK_TTS_MODEL_INFO = {
    MockTTSModel.CHATTERBOX: MockTTSModelInfo(
        name="chatterbox",
        display_name="Chatterbox (Resemble AI)",
        license="Apache 2.0",
        commercial_use=True,
        license_warning=None,
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru"],
        min_audio_seconds=3.0,
        quality_score=95,
        speed_score=85,
        vram_gb=4.0,
        model_size_gb=3.5
    ),
    MockTTSModel.CHATTERBOX_TURBO: MockTTSModelInfo(
        name="chatterbox-turbo",
        display_name="Chatterbox Turbo (Resemble AI)",
        license="Apache 2.0",
        commercial_use=True,
        license_warning=None,
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru"],
        min_audio_seconds=3.0,
        quality_score=90,
        speed_score=95,
        vram_gb=2.0,
        model_size_gb=1.5
    ),
    MockTTSModel.HIGGS_AUDIO_V2: MockTTSModelInfo(
        name="higgs-audio-v2",
        display_name="Higgs Audio V2 (Boson AI)",
        license="Boson Higgs Audio 2 Community License",
        commercial_use=False,
        license_warning="Commercial use limited to < 100,000 annual active users",
        languages=["en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko"],
        min_audio_seconds=3.0,
        quality_score=98,
        speed_score=75,
        vram_gb=8.0,
        model_size_gb=6.0
    ),
    MockTTSModel.XTTS_V2: MockTTSModelInfo(
        name="xtts-v2",
        display_name="XTTS v2 (Coqui - Legacy)",
        license="Coqui Public Model License",
        commercial_use=False,
        license_warning="NO commercial use allowed. Personal and research use only.",
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru"],
        min_audio_seconds=6.0,
        quality_score=75,
        speed_score=70,
        vram_gb=4.0,
        model_size_gb=3.0
    ),
}


# =========================================================================
# FIXTURES
# =========================================================================

# Skip all tests in this module if FastAPI is mocked
pytestmark = pytest.mark.skipif(
    not FASTAPI_AVAILABLE,
    reason="FastAPI not available (mocked by conftest)"
)


@pytest.fixture
def output_dir():
    """Create temporary output directory"""
    temp_dir = tempfile.mkdtemp(prefix="tts_api_test_")
    output_path = Path(temp_dir)
    (output_path / "translated").mkdir(parents=True)
    (output_path / "models").mkdir(parents=True)
    yield output_path
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def mock_unified_tts_service():
    """Create a mock UnifiedTTSService for testing"""
    mock_service = MagicMock()

    # Set current model
    mock_service.current_model = MockTTSModel.CHATTERBOX
    mock_service.is_initialized = True
    mock_service.backends = {}

    # Mock get_model_status
    async def mock_get_model_status(model):
        return MockModelStatus(
            model=model,
            is_available=True,
            is_downloaded=True,
            is_loaded=(model == MockTTSModel.CHATTERBOX),
            is_downloading=False,
            download_progress=0.0
        )
    mock_service.get_model_status = AsyncMock(side_effect=mock_get_model_status)

    # Mock get_all_models_status
    async def mock_get_all_models_status():
        return {
            model.value: MockModelStatus(
                model=model,
                is_available=True,
                is_downloaded=(model in [MockTTSModel.CHATTERBOX, MockTTSModel.CHATTERBOX_TURBO]),
                is_loaded=(model == MockTTSModel.CHATTERBOX),
                is_downloading=False,
                download_progress=0.0
            )
            for model in MockTTSModel
        }
    mock_service.get_all_models_status = AsyncMock(side_effect=mock_get_all_models_status)

    # Mock switch_model
    mock_service.switch_model = AsyncMock(return_value=True)

    # Mock get_stats
    async def mock_get_stats():
        return {
            "service": "UnifiedTTSService",
            "initialized": True,
            "is_ready": True,
            "status": "ready",
            "current_model": "chatterbox",
            "models_loaded": 1,
            "total_syntheses": 100,
            "average_latency_ms": 250
        }
    mock_service.get_stats = AsyncMock(side_effect=mock_get_stats)

    # Mock disk space methods
    mock_service._get_available_disk_space_gb = MagicMock(return_value=50.0)
    mock_service._can_download_model = MagicMock(return_value=True)

    # Mock _create_backend
    mock_backend = MagicMock()
    mock_backend.download_model = AsyncMock(return_value=True)
    mock_service._create_backend = MagicMock(return_value=mock_backend)

    return mock_service


@pytest.fixture
def mock_imports():
    """Patch the imports inside create_tts_models_router"""
    with patch.dict('sys.modules', {
        'services.unified_tts_service': MagicMock(
            TTSModel=MockTTSModel,
            TTS_MODEL_INFO=MOCK_TTS_MODEL_INFO
        )
    }):
        yield


@pytest.fixture
def test_app(mock_unified_tts_service, mock_imports):
    """Create a FastAPI test application with the TTS models router"""
    app = FastAPI()

    # Patch the import inside the router factory
    with patch('api.tts_models_api.TTSModel', MockTTSModel, create=True):
        with patch('api.tts_models_api.TTS_MODEL_INFO', MOCK_TTS_MODEL_INFO, create=True):
            # Create router with mocked service
            router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

            # Override the closure variables inside the router endpoints
            # This is done by accessing the route functions' __globals__
            for route in router.routes:
                if hasattr(route, 'endpoint'):
                    route.endpoint.__globals__['TTSModel'] = MockTTSModel
                    route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

            app.include_router(router)

    return app


@pytest.fixture
def client(test_app):
    """Create a test client"""
    return TestClient(test_app)


# =========================================================================
# PYDANTIC MODEL TESTS
# =========================================================================

class TestPydanticModels:
    """Test Pydantic response models"""

    def test_tts_model_info_response(self):
        """Test TTSModelInfoResponse model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        response = TTSModelInfoResponse(
            name="chatterbox",
            display_name="Chatterbox",
            license="Apache 2.0",
            commercial_use=True,
            license_warning=None,
            languages=["en", "fr"],
            languages_count=2,
            min_audio_seconds=3.0,
            quality_score=95,
            speed_score=85,
            vram_gb=4.0,
            model_size_gb=3.5,
            is_recommended=True
        )

        assert response.name == "chatterbox"
        assert response.commercial_use is True
        assert response.is_recommended is True
        assert len(response.languages) == 2

    def test_tts_model_status_response(self):
        """Test TTSModelStatusResponse model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        response = TTSModelStatusResponse(
            model="chatterbox",
            is_available=True,
            is_downloaded=True,
            is_loaded=True,
            is_downloading=False,
            download_progress=0.0
        )

        assert response.model == "chatterbox"
        assert response.is_loaded is True
        assert response.download_progress == 0.0

    def test_tts_model_switch_request(self):
        """Test TTSModelSwitchRequest model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        request = TTSModelSwitchRequest(
            model="higgs-audio-v2",
            acknowledge_license=True,
            force=False
        )

        assert request.model == "higgs-audio-v2"
        assert request.acknowledge_license is True
        assert request.force is False

    def test_tts_model_switch_request_defaults(self):
        """Test TTSModelSwitchRequest default values"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        request = TTSModelSwitchRequest(model="chatterbox")

        assert request.acknowledge_license is False
        assert request.force is False

    def test_tts_model_download_request_defaults(self):
        """Test TTSModelDownloadRequest default values"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        request = TTSModelDownloadRequest()

        assert request.background is True

    def test_tts_current_model_response(self):
        """Test TTSCurrentModelResponse model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        response = TTSCurrentModelResponse(
            model="chatterbox",
            display_name="Chatterbox",
            license="Apache 2.0",
            commercial_use=True,
            is_initialized=True,
            is_downloaded=True,
            languages_count=17,
            quality_score=95
        )

        assert response.model == "chatterbox"
        assert response.is_initialized is True

    def test_tts_license_info_response(self):
        """Test TTSLicenseInfoResponse model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        response = TTSLicenseInfoResponse(
            model="xtts-v2",
            license_name="Coqui Public Model License",
            commercial_use_allowed=False,
            restrictions=["NO commercial use allowed"],
            warning="Commercial use prohibited",
            recommendation="Use Chatterbox for commercial applications"
        )

        assert response.model == "xtts-v2"
        assert response.commercial_use_allowed is False
        assert len(response.restrictions) == 1


# =========================================================================
# ROUTER FACTORY TESTS
# =========================================================================

class TestRouterFactory:
    """Test router creation and configuration"""

    def test_create_router_without_service(self):
        """Test router creation without TTS service"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        router = create_tts_models_router(unified_tts_service=None)

        assert router is not None
        assert router.prefix == "/v1/tts"
        assert "TTS Models" in router.tags

    def test_create_router_with_service(self, mock_unified_tts_service):
        """Test router creation with TTS service"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        assert router is not None
        assert router.prefix == "/v1/tts"

    def test_router_has_expected_routes(self):
        """Test router has all expected routes"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        router = create_tts_models_router(unified_tts_service=MagicMock())

        route_paths = [route.path for route in router.routes if hasattr(route, 'path')]

        expected_paths = [
            "/models",
            "/models/current",
            "/models/status",
            "/models/switch",
            "/models/{model_name}/download",
            "/models/{model_name}/info",
            "/models/{model_name}/license",
            "/models/{model_name}/languages",
            "/models/compare",
            "/stats"
        ]

        for expected in expected_paths:
            assert any(expected in path for path in route_paths), f"Missing route: {expected}"


# =========================================================================
# ENDPOINT TESTS - List Models
# =========================================================================

class TestListModelsEndpoint:
    """Test GET /v1/tts/models endpoint"""

    @pytest.mark.asyncio
    async def test_list_models_success(self, mock_unified_tts_service):
        """Test successful listing of all models"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()

        # Create a custom router with injected mocks
        from api.tts_models_api import create_tts_models_router

        with patch.object(
            sys.modules.get('api.tts_models_api', MagicMock()),
            'TTSModel',
            MockTTSModel,
            create=True
        ):
            router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

            # Inject mocks into endpoint closures
            for route in router.routes:
                if hasattr(route, 'endpoint'):
                    route.endpoint.__globals__['TTSModel'] = MockTTSModel
                    route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

            app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models")

        assert response.status_code == 200
        data = response.json()

        assert "models" in data
        assert "current_model" in data
        assert "recommended_model" in data
        assert data["recommended_model"] == "chatterbox"

    @pytest.mark.asyncio
    async def test_list_models_service_unavailable(self):
        """Test listing models when service is unavailable"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=None)
        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models")

        assert response.status_code == 503
        assert "TTS service not available" in response.json()["detail"]


# =========================================================================
# ENDPOINT TESTS - Current Model
# =========================================================================

class TestCurrentModelEndpoint:
    """Test GET /v1/tts/models/current endpoint"""

    @pytest.mark.asyncio
    async def test_get_current_model_success(self, mock_unified_tts_service):
        """Test getting current model info"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/current")

        assert response.status_code == 200
        data = response.json()

        assert data["model"] == "chatterbox"
        assert data["is_initialized"] is True
        assert "display_name" in data
        assert "license" in data

    @pytest.mark.asyncio
    async def test_get_current_model_service_unavailable(self):
        """Test getting current model when service unavailable"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=None)
        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/current")

        assert response.status_code == 503


# =========================================================================
# ENDPOINT TESTS - Models Status
# =========================================================================

class TestModelsStatusEndpoint:
    """Test GET /v1/tts/models/status endpoint"""

    @pytest.mark.asyncio
    async def test_get_all_models_status(self, mock_unified_tts_service):
        """Test getting status of all models"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/status")

        assert response.status_code == 200
        data = response.json()

        assert "current_model" in data
        assert "fallback_model" in data
        assert "disk_space_available_gb" in data
        assert "models" in data
        assert data["disk_space_available_gb"] == 50.0


# =========================================================================
# ENDPOINT TESTS - Switch Model
# =========================================================================

class TestSwitchModelEndpoint:
    """Test POST /v1/tts/models/switch endpoint"""

    @pytest.mark.asyncio
    async def test_switch_to_commercial_model(self, mock_unified_tts_service):
        """Test switching to a commercial-friendly model (no license ack needed)"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/switch",
            json={"model": "chatterbox-turbo"}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["new_model"] == "chatterbox-turbo"

    @pytest.mark.asyncio
    async def test_switch_to_restricted_model_without_ack(self, mock_unified_tts_service):
        """Test switching to restricted model without license acknowledgment"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/switch",
            json={"model": "higgs-audio-v2", "acknowledge_license": False}
        )

        assert response.status_code == 400
        data = response.json()
        assert "License acknowledgment required" in str(data["detail"])

    @pytest.mark.asyncio
    async def test_switch_to_restricted_model_with_ack(self, mock_unified_tts_service):
        """Test switching to restricted model with license acknowledgment"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/switch",
            json={"model": "higgs-audio-v2", "acknowledge_license": True}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["new_model"] == "higgs-audio-v2"
        assert data["license_warning"] is not None

    @pytest.mark.asyncio
    async def test_switch_to_invalid_model(self, mock_unified_tts_service):
        """Test switching to an invalid model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/switch",
            json={"model": "invalid-model"}
        )

        assert response.status_code == 400
        assert "Invalid model" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_switch_model_failure(self, mock_unified_tts_service):
        """Test switch model when switch_model returns False"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        mock_unified_tts_service.switch_model = AsyncMock(return_value=False)

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/switch",
            json={"model": "chatterbox-turbo"}
        )

        assert response.status_code == 500
        assert "Failed to switch" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_switch_model_exception(self, mock_unified_tts_service):
        """Test switch model when an exception occurs"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        mock_unified_tts_service.switch_model = AsyncMock(side_effect=Exception("GPU out of memory"))

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/switch",
            json={"model": "chatterbox-turbo"}
        )

        assert response.status_code == 500
        assert "GPU out of memory" in response.json()["detail"]


# =========================================================================
# ENDPOINT TESTS - Download Model
# =========================================================================

class TestDownloadModelEndpoint:
    """Test POST /v1/tts/models/{model}/download endpoint"""

    @pytest.mark.asyncio
    async def test_download_already_downloaded_model(self, mock_unified_tts_service):
        """Test downloading an already downloaded model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post("/v1/tts/models/chatterbox/download", json={})

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "already_downloaded"
        assert data["model"] == "chatterbox"

    @pytest.mark.asyncio
    async def test_download_model_in_progress(self, mock_unified_tts_service):
        """Test downloading a model that's already being downloaded"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        # Modify mock to return downloading status
        async def mock_get_status(model):
            return MockModelStatus(
                model=model,
                is_available=True,
                is_downloaded=False,
                is_loaded=False,
                is_downloading=True,
                download_progress=45.5
            )
        mock_unified_tts_service.get_model_status = AsyncMock(side_effect=mock_get_status)

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post("/v1/tts/models/higgs-audio-v2/download", json={})

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "downloading"
        assert "45.5" in data["message"]

    @pytest.mark.asyncio
    async def test_download_invalid_model(self, mock_unified_tts_service):
        """Test downloading an invalid model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post("/v1/tts/models/invalid-model/download", json={})

        assert response.status_code == 404
        assert "Model not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_download_model_package_not_installed(self, mock_unified_tts_service):
        """Test downloading when Python package is not installed"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        async def mock_get_status(model):
            return MockModelStatus(
                model=model,
                is_available=False,  # Package not installed
                is_downloaded=False,
                is_loaded=False,
                is_downloading=False,
                download_progress=0.0
            )
        mock_unified_tts_service.get_model_status = AsyncMock(side_effect=mock_get_status)

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post("/v1/tts/models/xtts-v2/download", json={})

        assert response.status_code == 400
        assert "not installed" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_download_model_insufficient_disk_space(self, mock_unified_tts_service):
        """Test downloading when disk space is insufficient"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        async def mock_get_status(model):
            return MockModelStatus(
                model=model,
                is_available=True,
                is_downloaded=False,
                is_loaded=False,
                is_downloading=False,
                download_progress=0.0
            )
        mock_unified_tts_service.get_model_status = AsyncMock(side_effect=mock_get_status)
        mock_unified_tts_service._can_download_model = MagicMock(return_value=False)
        mock_unified_tts_service._get_available_disk_space_gb = MagicMock(return_value=1.0)

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post("/v1/tts/models/higgs-audio-v2/download", json={})

        assert response.status_code == 507
        assert "Insufficient disk space" in str(response.json()["detail"])

    @pytest.mark.asyncio
    async def test_download_model_synchronous_success(self, mock_unified_tts_service):
        """Test synchronous model download success"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        async def mock_get_status(model):
            return MockModelStatus(
                model=model,
                is_available=True,
                is_downloaded=False,
                is_loaded=False,
                is_downloading=False,
                download_progress=0.0
            )
        mock_unified_tts_service.get_model_status = AsyncMock(side_effect=mock_get_status)

        mock_backend = MagicMock()
        mock_backend.download_model = AsyncMock(return_value=True)
        mock_unified_tts_service._create_backend = MagicMock(return_value=mock_backend)

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/xtts-v2/download",
            json={"background": False}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"

    @pytest.mark.asyncio
    async def test_download_model_synchronous_failure(self, mock_unified_tts_service):
        """Test synchronous model download failure"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        async def mock_get_status(model):
            return MockModelStatus(
                model=model,
                is_available=True,
                is_downloaded=False,
                is_loaded=False,
                is_downloading=False,
                download_progress=0.0
            )
        mock_unified_tts_service.get_model_status = AsyncMock(side_effect=mock_get_status)

        mock_backend = MagicMock()
        mock_backend.download_model = AsyncMock(return_value=False)
        mock_unified_tts_service._create_backend = MagicMock(return_value=mock_backend)

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.post(
            "/v1/tts/models/xtts-v2/download",
            json={"background": False}
        )

        assert response.status_code == 500


# =========================================================================
# ENDPOINT TESTS - Model Info
# =========================================================================

class TestModelInfoEndpoint:
    """Test GET /v1/tts/models/{model}/info endpoint"""

    @pytest.mark.asyncio
    async def test_get_model_info_success(self, mock_unified_tts_service):
        """Test getting model info for a valid model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/chatterbox/info")

        assert response.status_code == 200
        data = response.json()

        assert data["name"] == "chatterbox"
        assert data["commercial_use"] is True
        assert data["quality_score"] == 95
        assert data["is_recommended"] is True

    @pytest.mark.asyncio
    async def test_get_model_info_invalid_model(self, mock_unified_tts_service):
        """Test getting model info for an invalid model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/nonexistent/info")

        assert response.status_code == 404
        assert "Model not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_model_info_all_models(self, mock_unified_tts_service):
        """Test getting model info for all available models"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)

        # Test all models
        for model in MockTTSModel:
            response = client.get(f"/v1/tts/models/{model.value}/info")
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == model.value


# =========================================================================
# ENDPOINT TESTS - License Info
# =========================================================================

class TestLicenseInfoEndpoint:
    """Test GET /v1/tts/models/{model}/license endpoint"""

    @pytest.mark.asyncio
    async def test_get_license_chatterbox(self, mock_unified_tts_service):
        """Test getting license info for Chatterbox (Apache 2.0)"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/chatterbox/license")

        assert response.status_code == 200
        data = response.json()

        assert data["model"] == "chatterbox"
        assert data["commercial_use_allowed"] is True
        assert data["license_name"] == "Apache 2.0"

    @pytest.mark.asyncio
    async def test_get_license_higgs(self, mock_unified_tts_service):
        """Test getting license info for Higgs Audio (restricted)"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/higgs-audio-v2/license")

        assert response.status_code == 200
        data = response.json()

        assert data["model"] == "higgs-audio-v2"
        assert data["commercial_use_allowed"] is False
        assert len(data["restrictions"]) > 0
        assert data["recommendation"] is not None

    @pytest.mark.asyncio
    async def test_get_license_xtts(self, mock_unified_tts_service):
        """Test getting license info for XTTS (non-commercial)"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/xtts-v2/license")

        assert response.status_code == 200
        data = response.json()

        assert data["model"] == "xtts-v2"
        assert data["commercial_use_allowed"] is False

    @pytest.mark.asyncio
    async def test_get_license_invalid_model(self, mock_unified_tts_service):
        """Test getting license info for invalid model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/invalid/license")

        assert response.status_code == 404


# =========================================================================
# ENDPOINT TESTS - Languages
# =========================================================================

class TestLanguagesEndpoint:
    """Test GET /v1/tts/models/{model}/languages endpoint"""

    @pytest.mark.asyncio
    async def test_get_model_languages(self, mock_unified_tts_service):
        """Test getting languages for a model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/chatterbox/languages")

        assert response.status_code == 200
        data = response.json()

        assert data["model"] == "chatterbox"
        assert "languages" in data
        assert "count" in data
        assert len(data["languages"]) == data["count"]
        assert "en" in data["languages"]

    @pytest.mark.asyncio
    async def test_get_languages_invalid_model(self, mock_unified_tts_service):
        """Test getting languages for invalid model"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/invalid/languages")

        assert response.status_code == 404


# =========================================================================
# ENDPOINT TESTS - Compare Models
# =========================================================================

class TestCompareModelsEndpoint:
    """Test GET /v1/tts/models/compare endpoint"""

    @pytest.mark.asyncio
    async def test_compare_default_models(self, mock_unified_tts_service):
        """Test comparing default models"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/compare")

        assert response.status_code == 200
        data = response.json()

        assert "comparison" in data
        assert "recommendation" in data
        assert "best_quality" in data["recommendation"]
        assert "best_speed" in data["recommendation"]
        assert "best_commercial" in data["recommendation"]

    @pytest.mark.asyncio
    async def test_compare_specific_models(self, mock_unified_tts_service):
        """Test comparing specific models"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/compare?models=chatterbox,xtts-v2")

        assert response.status_code == 200
        data = response.json()

        assert "chatterbox" in data["comparison"]
        assert "xtts-v2" in data["comparison"]

    @pytest.mark.asyncio
    async def test_compare_with_invalid_model(self, mock_unified_tts_service):
        """Test comparing with an invalid model in the list"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/models/compare?models=chatterbox,invalid-model")

        assert response.status_code == 200
        data = response.json()

        assert "chatterbox" in data["comparison"]
        assert "invalid-model" in data["comparison"]
        assert "error" in data["comparison"]["invalid-model"]


# =========================================================================
# ENDPOINT TESTS - Stats
# =========================================================================

class TestStatsEndpoint:
    """Test GET /v1/tts/stats endpoint"""

    @pytest.mark.asyncio
    async def test_get_stats_success(self, mock_unified_tts_service):
        """Test getting TTS statistics"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/stats")

        assert response.status_code == 200
        data = response.json()

        assert data["service"] == "UnifiedTTSService"
        assert data["initialized"] is True

    @pytest.mark.asyncio
    async def test_get_stats_service_unavailable(self):
        """Test getting stats when service unavailable"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=None)
        app.include_router(router)

        client = TestClient(app)
        response = client.get("/v1/tts/stats")

        assert response.status_code == 503


# =========================================================================
# INTEGRATION TESTS
# =========================================================================

class TestAPIIntegration:
    """Integration tests for the TTS Models API"""

    @pytest.mark.asyncio
    async def test_full_workflow(self, mock_unified_tts_service):
        """Test a full workflow: list -> info -> switch"""
        if not API_AVAILABLE:
            pytest.skip("TTS Models API not available")

        app = FastAPI()
        router = create_tts_models_router(unified_tts_service=mock_unified_tts_service)

        for route in router.routes:
            if hasattr(route, 'endpoint'):
                route.endpoint.__globals__['TTSModel'] = MockTTSModel
                route.endpoint.__globals__['TTS_MODEL_INFO'] = MOCK_TTS_MODEL_INFO

        app.include_router(router)
        client = TestClient(app)

        # 1. List all models
        list_response = client.get("/v1/tts/models")
        assert list_response.status_code == 200
        models = list_response.json()["models"]
        assert len(models) > 0

        # 2. Get current model
        current_response = client.get("/v1/tts/models/current")
        assert current_response.status_code == 200
        current = current_response.json()
        assert current["model"] == "chatterbox"

        # 3. Get info about a different model
        info_response = client.get("/v1/tts/models/chatterbox-turbo/info")
        assert info_response.status_code == 200
        info = info_response.json()
        assert info["speed_score"] > info_response.json().get("quality_score", 0) - 10  # Turbo is faster

        # 4. Switch to the turbo model
        switch_response = client.post(
            "/v1/tts/models/switch",
            json={"model": "chatterbox-turbo"}
        )
        assert switch_response.status_code == 200
        assert switch_response.json()["success"] is True

        # 5. Get stats
        stats_response = client.get("/v1/tts/stats")
        assert stats_response.status_code == 200


# =========================================================================
# RUN ALL TESTS
# =========================================================================

async def run_all_tests():
    """Run all TTS Models API tests"""
    logger.info("=" * 70)
    logger.info("Starting TTS Models API Tests (Test 17)")
    logger.info("=" * 70)

    if not API_AVAILABLE:
        logger.error("TTS Models API not available, cannot run tests")
        return False

    tests = [
        ("Pydantic Models", TestPydanticModels),
        ("Router Factory", TestRouterFactory),
        ("List Models Endpoint", TestListModelsEndpoint),
        ("Current Model Endpoint", TestCurrentModelEndpoint),
        ("Models Status Endpoint", TestModelsStatusEndpoint),
        ("Switch Model Endpoint", TestSwitchModelEndpoint),
        ("Download Model Endpoint", TestDownloadModelEndpoint),
        ("Model Info Endpoint", TestModelInfoEndpoint),
        ("License Info Endpoint", TestLicenseInfoEndpoint),
        ("Languages Endpoint", TestLanguagesEndpoint),
        ("Compare Models Endpoint", TestCompareModelsEndpoint),
        ("Stats Endpoint", TestStatsEndpoint),
        ("API Integration", TestAPIIntegration),
    ]

    logger.info(f"Total test classes: {len(tests)}")
    logger.info("Run with: pytest test_17_tts_models_api.py -v")

    return True


if __name__ == "__main__":
    import asyncio
    asyncio.run(run_all_tests())
    # Run pytest
    pytest.main([__file__, "-v", "--tb=short"])
