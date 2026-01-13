#!/usr/bin/env python3
"""
Test 22 - Health API Tests
Comprehensive unit tests for the Health API (health.py)
Target: >65% code coverage

Tests cover:
- set_services function for service configuration
- check_database_health function with various states
- check_zmq_health function with various states
- check_models_health function with various states
- /health endpoint (comprehensive_health_check)
- /ready endpoint (readiness_check)
- /live endpoint (liveness_check)
- Error handling and edge cases
"""

import sys
import os
import logging
import asyncio
import pytest
import time
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


# Check if FastAPI is real or mocked (conftest.py mocks it for non-API tests)
def _is_fastapi_available():
    """Check if real FastAPI is available (not mocked by conftest)"""
    try:
        import fastapi
        from unittest.mock import MagicMock as MM
        if isinstance(fastapi.APIRouter, MM):
            return False
        if not hasattr(fastapi, '__version__'):
            return False
        return True
    except (ImportError, AttributeError):
        return False

FASTAPI_AVAILABLE = _is_fastapi_available()

# Import FastAPI test client - only if FastAPI is real
if FASTAPI_AVAILABLE:
    from fastapi import HTTPException
    from fastapi.testclient import TestClient
else:
    HTTPException = Exception
    TestClient = None

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============================================================================
# FIXTURES
# ============================================================================

# Skip all tests in this module if FastAPI is mocked
pytestmark = pytest.mark.skipif(
    not FASTAPI_AVAILABLE,
    reason="FastAPI not available (mocked by conftest)"
)


@pytest.fixture(autouse=True)
def reset_health_module():
    """Reset health module globals before each test"""
    from api import health
    health.translation_service = None
    health.database_service = None
    health.zmq_server = None
    yield
    # Reset after test as well
    health.translation_service = None
    health.database_service = None
    health.zmq_server = None


@pytest.fixture
def mock_database_service():
    """Mock database service for testing"""
    service = MagicMock()
    service.is_connected = True
    service.health_check = AsyncMock(return_value={
        "connected": True,
        "status": "healthy",
        "type": "mongodb"
    })
    return service


@pytest.fixture
def mock_database_service_disconnected():
    """Mock disconnected database service"""
    service = MagicMock()
    service.is_connected = False
    service.health_check = AsyncMock(return_value={
        "connected": False,
        "status": "disconnected",
        "error": "Database not connected"
    })
    return service


@pytest.fixture
def mock_database_service_no_health_check():
    """Mock database service without health_check method"""
    service = MagicMock()
    service.is_connected = True
    # Remove health_check attribute
    del service.health_check
    return service


@pytest.fixture
def mock_zmq_server():
    """Mock ZMQ server for testing"""
    server = MagicMock()
    server.is_running = True
    server.port = 5555
    return server


@pytest.fixture
def mock_zmq_server_stopped():
    """Mock stopped ZMQ server"""
    server = MagicMock()
    server.is_running = False
    server.port = 5555
    return server


@pytest.fixture
def mock_zmq_server_with_context():
    """Mock ZMQ server with context"""
    server = MagicMock()
    # Remove is_running attribute
    del server.is_running
    server.context = MagicMock()
    server.context.closed = False
    server.port = 5558
    return server


@pytest.fixture
def mock_zmq_server_minimal():
    """Mock minimal ZMQ server (no is_running, no context)"""
    server = MagicMock()
    # Remove is_running and context
    del server.is_running
    del server.context
    server.port = 5560
    return server


@pytest.fixture
def mock_translation_service():
    """Mock translation service with models loaded"""
    service = MagicMock()
    service.models = {
        "en-fr": MagicMock(),
        "fr-en": MagicMock(),
        "en-es": MagicMock()
    }
    service.pipelines = {
        "en-fr": MagicMock(),
        "fr-en": MagicMock()
    }
    service.degraded_mode = False
    return service


@pytest.fixture
def mock_translation_service_no_models():
    """Mock translation service with no models loaded"""
    service = MagicMock()
    service.models = {}
    service.pipelines = {}
    service.degraded_mode = True
    return service


@pytest.fixture
def mock_translation_service_pipelines_only():
    """Mock translation service with pipelines only (no models)"""
    service = MagicMock()
    service.models = {}
    service.pipelines = {
        "en-fr": MagicMock(),
        "fr-en": MagicMock(),
        "en-de": MagicMock()
    }
    service.degraded_mode = False
    return service


# ============================================================================
# TEST SET_SERVICES FUNCTION
# ============================================================================

class TestSetServices:
    """Tests for set_services function"""

    def test_set_all_services(self, mock_translation_service, mock_database_service, mock_zmq_server):
        """Test setting all services at once"""
        from api.health import set_services, translation_service, database_service, zmq_server
        from api import health

        set_services(
            trans_service=mock_translation_service,
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        assert health.translation_service == mock_translation_service
        assert health.database_service == mock_database_service
        assert health.zmq_server == mock_zmq_server

    def test_set_translation_service_only(self, mock_translation_service):
        """Test setting only translation service"""
        from api.health import set_services
        from api import health

        set_services(trans_service=mock_translation_service)

        assert health.translation_service == mock_translation_service
        assert health.database_service is None
        assert health.zmq_server is None

    def test_set_database_service_only(self, mock_database_service):
        """Test setting only database service"""
        from api.health import set_services
        from api import health

        set_services(db_service=mock_database_service)

        assert health.translation_service is None
        assert health.database_service == mock_database_service
        assert health.zmq_server is None

    def test_set_zmq_server_only(self, mock_zmq_server):
        """Test setting only ZMQ server"""
        from api.health import set_services
        from api import health

        set_services(zmq_srv=mock_zmq_server)

        assert health.translation_service is None
        assert health.database_service is None
        assert health.zmq_server == mock_zmq_server

    def test_set_services_with_none_values(self):
        """Test that None values don't overwrite existing services"""
        from api.health import set_services
        from api import health

        # First set a service
        mock_service = MagicMock()
        set_services(trans_service=mock_service)

        # Then call with None - should not overwrite
        set_services(trans_service=None)

        assert health.translation_service == mock_service

    def test_set_services_multiple_calls(self, mock_translation_service, mock_database_service):
        """Test multiple calls to set_services"""
        from api.health import set_services
        from api import health

        set_services(trans_service=mock_translation_service)
        assert health.translation_service == mock_translation_service

        set_services(db_service=mock_database_service)
        assert health.database_service == mock_database_service
        assert health.translation_service == mock_translation_service


# ============================================================================
# TEST CHECK_DATABASE_HEALTH
# ============================================================================

class TestCheckDatabaseHealth:
    """Tests for check_database_health function"""

    @pytest.mark.asyncio
    async def test_database_not_initialized(self):
        """Test database health when service not initialized"""
        from api.health import check_database_health

        result = await check_database_health()

        assert result["connected"] is False
        assert result["status"] == "service_not_initialized"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_database_healthy(self, mock_database_service):
        """Test database health when healthy"""
        from api.health import set_services, check_database_health

        set_services(db_service=mock_database_service)
        result = await check_database_health()

        assert result["connected"] is True
        assert result["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_database_disconnected(self, mock_database_service_disconnected):
        """Test database health when disconnected"""
        from api.health import set_services, check_database_health

        set_services(db_service=mock_database_service_disconnected)
        result = await check_database_health()

        assert result["connected"] is False
        assert result["status"] == "disconnected"

    @pytest.mark.asyncio
    async def test_database_no_health_check_method(self, mock_database_service_no_health_check):
        """Test database health when service has no health_check method"""
        from api.health import set_services, check_database_health

        set_services(db_service=mock_database_service_no_health_check)
        result = await check_database_health()

        assert result["status"] == "degraded_mode"
        assert result["mode"] == "temporary_service"
        assert "note" in result

    @pytest.mark.asyncio
    async def test_database_no_health_check_not_connected(self):
        """Test database health when service has no health_check and no is_connected"""
        from api.health import set_services, check_database_health

        service = MagicMock()
        del service.health_check
        del service.is_connected

        set_services(db_service=service)
        result = await check_database_health()

        assert result["status"] == "degraded_mode"
        assert result["connected"] is False

    @pytest.mark.asyncio
    async def test_database_health_check_exception(self, mock_database_service):
        """Test database health when health_check raises exception"""
        from api.health import set_services, check_database_health

        mock_database_service.health_check = AsyncMock(side_effect=Exception("Connection timeout"))

        set_services(db_service=mock_database_service)
        result = await check_database_health()

        assert result["connected"] is False
        assert result["status"] == "error"
        assert "Connection timeout" in result["error"]


# ============================================================================
# TEST CHECK_ZMQ_HEALTH
# ============================================================================

class TestCheckZMQHealth:
    """Tests for check_zmq_health function"""

    @pytest.mark.asyncio
    async def test_zmq_not_initialized(self):
        """Test ZMQ health when server not initialized"""
        from api.health import check_zmq_health

        result = await check_zmq_health()

        assert result["running"] is False
        assert result["status"] == "service_not_initialized"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_zmq_running(self, mock_zmq_server):
        """Test ZMQ health when running"""
        from api.health import set_services, check_zmq_health

        set_services(zmq_srv=mock_zmq_server)
        result = await check_zmq_health()

        assert result["running"] is True
        assert result["status"] == "healthy"
        assert result["port"] == 5555

    @pytest.mark.asyncio
    async def test_zmq_stopped(self, mock_zmq_server_stopped):
        """Test ZMQ health when stopped"""
        from api.health import set_services, check_zmq_health

        set_services(zmq_srv=mock_zmq_server_stopped)
        result = await check_zmq_health()

        assert result["running"] is False
        assert result["status"] == "stopped"

    @pytest.mark.asyncio
    async def test_zmq_with_context(self, mock_zmq_server_with_context):
        """Test ZMQ health using context.closed check"""
        from api.health import set_services, check_zmq_health

        set_services(zmq_srv=mock_zmq_server_with_context)
        result = await check_zmq_health()

        assert result["running"] is True
        assert result["status"] == "healthy"
        assert result["port"] == 5558

    @pytest.mark.asyncio
    async def test_zmq_with_closed_context(self):
        """Test ZMQ health when context is closed"""
        from api.health import set_services, check_zmq_health

        server = MagicMock()
        del server.is_running
        server.context = MagicMock()
        server.context.closed = True
        server.port = 5560

        set_services(zmq_srv=server)
        result = await check_zmq_health()

        assert result["running"] is False
        assert result["status"] == "stopped"

    @pytest.mark.asyncio
    async def test_zmq_minimal_server(self, mock_zmq_server_minimal):
        """Test ZMQ health with minimal server (no is_running, no context)"""
        from api.health import set_services, check_zmq_health

        set_services(zmq_srv=mock_zmq_server_minimal)
        result = await check_zmq_health()

        # Should fall back to checking if server is not None
        assert result["running"] is True
        assert result["status"] == "healthy"
        assert result["port"] == 5560

    @pytest.mark.asyncio
    async def test_zmq_health_exception(self, mock_zmq_server):
        """Test ZMQ health when checking raises exception"""
        from api.health import set_services, check_zmq_health

        # Make is_running raise an exception
        type(mock_zmq_server).is_running = property(lambda self: (_ for _ in ()).throw(Exception("ZMQ error")))

        set_services(zmq_srv=mock_zmq_server)
        result = await check_zmq_health()

        assert result["running"] is False
        assert result["status"] == "error"
        assert "ZMQ error" in result["error"]

    @pytest.mark.asyncio
    async def test_zmq_default_port(self):
        """Test ZMQ health uses default port when not specified"""
        from api.health import set_services, check_zmq_health

        server = MagicMock()
        server.is_running = True
        del server.port  # No port attribute

        set_services(zmq_srv=server)
        result = await check_zmq_health()

        assert result["port"] == 5555  # Default port
        assert "tcp://0.0.0.0:5555" in result["address"]


# ============================================================================
# TEST CHECK_MODELS_HEALTH
# ============================================================================

class TestCheckModelsHealth:
    """Tests for check_models_health function"""

    @pytest.mark.asyncio
    async def test_models_not_initialized(self):
        """Test models health when service not initialized"""
        from api.health import check_models_health

        result = await check_models_health()

        assert result["loaded"] is False
        assert result["count"] == 0
        assert result["models"] == {}
        assert result["status"] == "service_not_initialized"

    @pytest.mark.asyncio
    async def test_models_healthy(self, mock_translation_service):
        """Test models health when models are loaded"""
        from api.health import set_services, check_models_health

        set_services(trans_service=mock_translation_service)
        result = await check_models_health()

        assert result["loaded"] is True
        assert result["models_count"] == 3
        assert result["pipelines_count"] == 2
        assert result["status"] == "healthy"
        assert result["degraded_mode"] is False
        assert "en-fr" in result["models"]

    @pytest.mark.asyncio
    async def test_models_none_loaded(self, mock_translation_service_no_models):
        """Test models health when no models loaded"""
        from api.health import set_services, check_models_health

        set_services(trans_service=mock_translation_service_no_models)
        result = await check_models_health()

        assert result["loaded"] is False
        assert result["count"] == 0
        assert result["status"] == "degraded_mode"
        assert result["degraded_mode"] is True

    @pytest.mark.asyncio
    async def test_models_pipelines_only(self, mock_translation_service_pipelines_only):
        """Test models health with pipelines only"""
        from api.health import set_services, check_models_health

        set_services(trans_service=mock_translation_service_pipelines_only)
        result = await check_models_health()

        assert result["loaded"] is True
        assert result["models_count"] == 0
        assert result["pipelines_count"] == 3
        assert result["count"] == 3
        assert result["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_models_no_models_attribute(self):
        """Test models health when service has no models attribute"""
        from api.health import set_services, check_models_health

        service = MagicMock()
        del service.models
        del service.pipelines
        del service.degraded_mode

        set_services(trans_service=service)
        result = await check_models_health()

        assert result["loaded"] is False
        assert result["status"] == "degraded_mode"

    @pytest.mark.asyncio
    async def test_models_exception_on_models_check(self):
        """Test models health when checking models raises exception"""
        from api.health import set_services, check_models_health

        service = MagicMock()
        # Make models property raise exception
        type(service).models = property(lambda self: (_ for _ in ()).throw(Exception("Models error")))
        service.pipelines = {}
        service.degraded_mode = False

        set_services(trans_service=service)
        result = await check_models_health()

        # Should continue with pipelines check
        assert result["status"] in ["healthy", "degraded_mode", "unknown"]

    @pytest.mark.asyncio
    async def test_models_exception_on_pipelines_check(self):
        """Test models health when checking pipelines raises exception"""
        from api.health import set_services, check_models_health

        service = MagicMock()
        service.models = {"en-fr": MagicMock()}
        # Make pipelines property raise exception
        type(service).pipelines = property(lambda self: (_ for _ in ()).throw(Exception("Pipelines error")))
        service.degraded_mode = False

        set_services(trans_service=service)
        result = await check_models_health()

        assert result["models_count"] == 1
        assert result["pipelines_count"] == 0

    @pytest.mark.asyncio
    async def test_models_exception_on_degraded_mode_check(self):
        """Test models health when checking degraded_mode raises exception"""
        from api.health import set_services, check_models_health

        service = MagicMock()
        service.models = {"en-fr": MagicMock()}
        service.pipelines = {}
        # Make degraded_mode property raise exception
        type(service).degraded_mode = property(lambda self: (_ for _ in ()).throw(Exception("Mode error")))

        set_services(trans_service=service)
        result = await check_models_health()

        assert result["loaded"] is True
        assert result["degraded_mode"] is False  # Default on error

    @pytest.mark.asyncio
    async def test_models_full_exception(self):
        """Test models health when outer try block catches exception"""
        from api.health import set_services, check_models_health
        from api import health

        # Create a service that will cause an exception in the outer try block
        # by causing max() to fail with an unexpected type
        service = MagicMock()
        service.models = {"en-fr": MagicMock()}
        service.pipelines = {}
        service.degraded_mode = False

        set_services(trans_service=service)

        # Patch the max function to raise an exception (simulating outer try block error)
        original_max = max
        def broken_max(*args, **kwargs):
            if args and isinstance(args[0], int):
                raise RuntimeError("Fatal error in max")
            return original_max(*args, **kwargs)

        with patch('builtins.max', side_effect=RuntimeError("Fatal error")):
            result = await check_models_health()

        # The exception is caught by outer try block and returns error status
        assert result["loaded"] is False
        assert result["status"] == "error"
        assert "error" in result
        assert "Fatal error" in result["error"]

    @pytest.mark.asyncio
    async def test_models_inner_exception_continues(self):
        """Test that inner exceptions don't stop health check"""
        from api.health import set_services, check_models_health

        # Create a service where models.keys() throws
        service = MagicMock()
        mock_models = MagicMock()
        mock_models.__bool__ = MagicMock(return_value=True)  # Makes it truthy
        mock_models.__len__ = MagicMock(return_value=1)
        mock_models.keys = MagicMock(side_effect=RuntimeError("Keys error"))
        service.models = mock_models
        service.pipelines = {}
        service.degraded_mode = False

        set_services(trans_service=service)
        result = await check_models_health()

        # Should continue and return a result (inner exception caught)
        # models_count stays 0 because exception is caught before len()
        assert result["status"] in ["degraded_mode", "healthy"]

    @pytest.mark.asyncio
    async def test_models_pipeline_already_in_models(self, mock_translation_service):
        """Test that pipeline info is added to existing model info"""
        from api.health import set_services, check_models_health

        set_services(trans_service=mock_translation_service)
        result = await check_models_health()

        # en-fr should have both model and pipeline
        assert result["models"]["en-fr"]["loaded"] is True
        assert result["models"]["en-fr"]["pipeline_ready"] is True


# ============================================================================
# TEST COMPREHENSIVE HEALTH CHECK ENDPOINT
# ============================================================================

class TestComprehensiveHealthCheck:
    """Tests for /health endpoint (comprehensive_health_check)"""

    @pytest.mark.asyncio
    async def test_health_all_healthy(self, mock_translation_service, mock_database_service, mock_zmq_server):
        """Test health endpoint when all services healthy"""
        from api.health import set_services, comprehensive_health_check

        set_services(
            trans_service=mock_translation_service,
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        assert result["status"] == "healthy"
        assert result["service"] == "meeshy-translator"
        assert result["version"] == "1.0.0"
        assert "timestamp" in result
        assert "uptime_seconds" in result
        assert "components" in result
        assert "summary" in result
        assert result["summary"]["database_connected"] is True
        assert result["summary"]["zmq_running"] is True
        assert result["summary"]["models_loaded"] is True

    @pytest.mark.asyncio
    async def test_health_no_services(self):
        """Test health endpoint with no services configured"""
        from api.health import comprehensive_health_check

        result = await comprehensive_health_check()

        assert result["status"] == "unhealthy"
        assert result["summary"]["database_connected"] is False
        assert result["summary"]["zmq_running"] is False

    @pytest.mark.asyncio
    async def test_health_db_degraded_mode(self, mock_translation_service, mock_zmq_server):
        """Test health endpoint with DB in degraded mode"""
        from api.health import set_services, comprehensive_health_check

        # Create DB service in degraded mode
        db_service = MagicMock()
        del db_service.health_check
        db_service.is_connected = True

        set_services(
            trans_service=mock_translation_service,
            db_service=db_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        # Degraded mode still counts as OK
        assert result["summary"]["database_connected"] is True

    @pytest.mark.asyncio
    async def test_health_models_loading(self, mock_database_service, mock_zmq_server):
        """Test health endpoint when models are loading"""
        from api.health import set_services, comprehensive_health_check

        # Create service with no models yet (still loading)
        trans_service = MagicMock()
        trans_service.models = {}
        trans_service.pipelines = {}
        trans_service.degraded_mode = False

        set_services(
            trans_service=trans_service,
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        # Should still be healthy while models load
        assert result["status"] == "healthy"
        assert result["models_loading"] is True

    @pytest.mark.asyncio
    async def test_health_db_and_zmq_healthy_models_error(self, mock_database_service, mock_zmq_server):
        """Test health endpoint with DB/ZMQ healthy but models in error"""
        from api.health import set_services, comprehensive_health_check

        # Create service that will have an error
        trans_service = MagicMock()
        trans_service.models = {}
        trans_service.pipelines = {}
        trans_service.degraded_mode = True  # Degraded mode = loading failed

        set_services(
            trans_service=trans_service,
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        # Should be degraded when models fail
        # Actually, degraded_mode=True means models_ok should be True (line 199)
        assert result["summary"]["models_loaded"] is True

    @pytest.mark.asyncio
    async def test_health_exception_in_check(self, mock_database_service, mock_zmq_server):
        """Test health endpoint handles exceptions gracefully"""
        from api.health import set_services, comprehensive_health_check

        # Make DB health check raise exception
        mock_database_service.health_check = AsyncMock(side_effect=Exception("DB crash"))

        set_services(
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        # Should handle exception and return error status for that component
        assert result["components"]["database"]["status"] == "error"

    @pytest.mark.asyncio
    async def test_health_exception_returns_error_status(self):
        """Test health endpoint returns error status on major exception"""
        from api.health import comprehensive_health_check

        # Patch asyncio.gather to raise exception
        with patch('asyncio.gather', side_effect=Exception("Gather failed")):
            result = await comprehensive_health_check()

            assert result["status"] == "error"
            assert "error" in result
            assert "Gather failed" in result["error"]

    @pytest.mark.asyncio
    async def test_health_uptime_calculation(self, mock_database_service, mock_zmq_server, mock_translation_service):
        """Test that uptime is calculated correctly"""
        from api import health
        from api.health import set_services, comprehensive_health_check

        # Set a known startup time
        original_startup = health.startup_time
        health.startup_time = time.time() - 100  # 100 seconds ago

        set_services(
            trans_service=mock_translation_service,
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        assert result["uptime_seconds"] >= 100
        assert result["uptime_seconds"] < 110  # Allow some margin

        # Restore
        health.startup_time = original_startup


# ============================================================================
# TEST READINESS CHECK ENDPOINT
# ============================================================================

class TestReadinessCheck:
    """Tests for /ready endpoint (readiness_check)"""

    @pytest.mark.asyncio
    async def test_ready_all_services_ok(self, mock_database_service, mock_zmq_server):
        """Test readiness when all critical services ready"""
        from api.health import set_services, readiness_check

        set_services(
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await readiness_check()

        assert result["status"] == "ready"
        assert result["database_ready"] is True
        assert result["zmq_ready"] is True

    @pytest.mark.asyncio
    async def test_ready_db_not_ready(self, mock_zmq_server):
        """Test readiness when database not ready"""
        from api.health import set_services, readiness_check

        set_services(zmq_srv=mock_zmq_server)

        with pytest.raises(HTTPException) as exc_info:
            await readiness_check()

        assert exc_info.value.status_code == 503
        assert exc_info.value.detail["database_ready"] is False

    @pytest.mark.asyncio
    async def test_ready_zmq_not_ready(self, mock_database_service):
        """Test readiness when ZMQ not ready"""
        from api.health import set_services, readiness_check

        set_services(db_service=mock_database_service)

        with pytest.raises(HTTPException) as exc_info:
            await readiness_check()

        assert exc_info.value.status_code == 503
        assert exc_info.value.detail["zmq_ready"] is False

    @pytest.mark.asyncio
    async def test_ready_nothing_configured(self):
        """Test readiness when nothing configured"""
        from api.health import readiness_check

        with pytest.raises(HTTPException) as exc_info:
            await readiness_check()

        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_ready_db_degraded_mode(self, mock_zmq_server):
        """Test readiness with DB in degraded mode (should be ready)"""
        from api.health import set_services, readiness_check

        db_service = MagicMock()
        del db_service.health_check
        db_service.is_connected = True

        set_services(
            db_service=db_service,
            zmq_srv=mock_zmq_server
        )

        result = await readiness_check()

        assert result["status"] == "ready"
        assert result["database_ready"] is True

    @pytest.mark.asyncio
    async def test_ready_exception_handling(self, mock_database_service, mock_zmq_server):
        """Test readiness handles exceptions properly"""
        from api.health import set_services, readiness_check, check_database_health
        from api import health

        set_services(
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        # Patch check_database_health to raise an exception that bypasses HTTPException handling
        with patch('api.health.check_database_health', side_effect=RuntimeError("Unexpected error")):
            with pytest.raises(HTTPException) as exc_info:
                await readiness_check()

            assert exc_info.value.status_code == 503
            assert "Readiness check failed" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_ready_db_error_returns_not_ready(self, mock_database_service, mock_zmq_server):
        """Test readiness when DB health check returns error status"""
        from api.health import set_services, readiness_check

        # Make health check return error status (not raise exception)
        mock_database_service.health_check = AsyncMock(return_value={
            "connected": False,
            "status": "error",
            "error": "Connection timeout"
        })

        set_services(
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        with pytest.raises(HTTPException) as exc_info:
            await readiness_check()

        assert exc_info.value.status_code == 503
        assert exc_info.value.detail["database_ready"] is False


# ============================================================================
# TEST LIVENESS CHECK ENDPOINT
# ============================================================================

class TestLivenessCheck:
    """Tests for /live endpoint (liveness_check)"""

    @pytest.mark.asyncio
    async def test_live_always_alive(self):
        """Test liveness check always returns alive"""
        from api.health import liveness_check

        result = await liveness_check()

        assert result["status"] == "alive"
        assert result["service"] == "meeshy-translator"
        assert "timestamp" in result
        assert "uptime_seconds" in result

    @pytest.mark.asyncio
    async def test_live_no_services_needed(self):
        """Test liveness doesn't depend on any services"""
        from api.health import liveness_check

        # No services configured
        result = await liveness_check()

        assert result["status"] == "alive"

    @pytest.mark.asyncio
    async def test_live_uptime_calculation(self):
        """Test liveness uptime calculation"""
        from api import health
        from api.health import liveness_check

        original_startup = health.startup_time
        health.startup_time = time.time() - 50  # 50 seconds ago

        result = await liveness_check()

        assert result["uptime_seconds"] >= 50
        assert result["uptime_seconds"] < 60

        health.startup_time = original_startup


# ============================================================================
# TEST HEALTH ROUTER INTEGRATION
# ============================================================================

class TestHealthRouterIntegration:
    """Integration tests using FastAPI TestClient"""

    @pytest.fixture
    def test_app(self):
        """Create test FastAPI app with health router"""
        from fastapi import FastAPI
        from api.health import health_router

        app = FastAPI()
        app.include_router(health_router)
        return app

    @pytest.fixture
    def client(self, test_app):
        """Create test client"""
        return TestClient(test_app)

    def test_health_endpoint_exists(self, client):
        """Test /health endpoint exists"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "service" in data

    def test_ready_endpoint_503_when_not_ready(self, client):
        """Test /ready returns 503 when not ready"""
        response = client.get("/ready")
        assert response.status_code == 503

    def test_live_endpoint_always_200(self, client):
        """Test /live always returns 200"""
        response = client.get("/live")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"

    def test_health_endpoint_response_structure(self, client):
        """Test /health response has correct structure"""
        response = client.get("/health")
        data = response.json()

        assert "status" in data
        assert "service" in data
        assert "version" in data
        assert "timestamp" in data
        assert "uptime_seconds" in data
        assert "components" in data
        assert "summary" in data

    def test_live_endpoint_response_structure(self, client):
        """Test /live response has correct structure"""
        response = client.get("/live")
        data = response.json()

        assert "status" in data
        assert "service" in data
        assert "timestamp" in data
        assert "uptime_seconds" in data


# ============================================================================
# EDGE CASES AND ERROR SCENARIOS
# ============================================================================

class TestEdgeCases:
    """Test edge cases and error scenarios"""

    @pytest.mark.asyncio
    async def test_concurrent_health_checks(self, mock_database_service, mock_zmq_server, mock_translation_service):
        """Test concurrent health check calls"""
        from api.health import set_services, comprehensive_health_check

        set_services(
            trans_service=mock_translation_service,
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        # Run multiple health checks concurrently
        tasks = [comprehensive_health_check() for _ in range(5)]
        results = await asyncio.gather(*tasks)

        for result in results:
            assert result["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_asyncio_gather_with_exceptions(self, mock_database_service, mock_zmq_server):
        """Test that asyncio.gather exceptions are handled"""
        from api.health import set_services, comprehensive_health_check

        # Make one check raise exception
        mock_database_service.health_check = AsyncMock(side_effect=ValueError("Test error"))

        set_services(
            db_service=mock_database_service,
            zmq_srv=mock_zmq_server
        )

        result = await comprehensive_health_check()

        # Should handle the exception gracefully
        assert result["components"]["database"]["status"] == "error"

    @pytest.mark.asyncio
    async def test_models_with_empty_dict_vs_none(self):
        """Test models health distinguishes empty dict from None"""
        from api.health import set_services, check_models_health

        # Empty dict
        service = MagicMock()
        service.models = {}
        service.pipelines = {}
        service.degraded_mode = False

        set_services(trans_service=service)
        result = await check_models_health()

        assert result["loaded"] is False
        assert result["status"] == "degraded_mode"

    @pytest.mark.asyncio
    async def test_zmq_context_none(self):
        """Test ZMQ health when context is None"""
        from api.health import set_services, check_zmq_health

        server = MagicMock()
        del server.is_running
        server.context = None
        server.port = 5555

        set_services(zmq_srv=server)
        result = await check_zmq_health()

        # Should fall back to checking server is not None
        assert result["running"] is True

    @pytest.mark.asyncio
    async def test_startup_time_very_recent(self):
        """Test uptime when startup was very recent"""
        from api import health
        from api.health import liveness_check

        original = health.startup_time
        health.startup_time = time.time()

        result = await liveness_check()

        assert result["uptime_seconds"] >= 0
        assert result["uptime_seconds"] < 1

        health.startup_time = original


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
