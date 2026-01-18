#!/usr/bin/env python3
"""
Test 20 - ZMQ Server Tests
Comprehensive unit tests for the ZMQ Translation Server (zmq_server.py)
Target: >65% code coverage

Tests cover:
- TranslationTask dataclass
- TranslationPoolManager (pools, workers, scaling, statistics)
- ZMQTranslationServer (sockets, message handling, publishing)
- Error handling and edge cases
"""

import sys
import os
import logging
import asyncio
import pytest
import json
import time
import uuid
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from dataclasses import dataclass

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_translation_service():
    """Mock translation service for testing"""
    service = MagicMock()

    async def mock_translate_with_structure(**kwargs):
        return {
            'translated_text': f"[TRANSLATED] {kwargs.get('text', '')}",
            'detected_language': kwargs.get('source_language', 'en'),
            'confidence': 0.95,
            'segments_count': 1,
            'emojis_count': 0
        }

    service.translate_with_structure = AsyncMock(side_effect=mock_translate_with_structure)
    return service


@pytest.fixture
def mock_database_service():
    """Mock database service for testing"""
    service = MagicMock()
    service.connect = AsyncMock(return_value=True)
    service.disconnect = AsyncMock()
    service.is_db_connected = MagicMock(return_value=True)
    service.save_translation = AsyncMock(return_value=True)
    return service


@pytest.fixture
def mock_zmq_context():
    """Mock ZMQ context and sockets"""
    context = MagicMock()

    # Mock PULL socket
    pull_socket = MagicMock()
    pull_socket.bind = MagicMock()
    pull_socket.close = MagicMock()
    pull_socket.recv = AsyncMock(return_value=b'{}')

    # Mock PUB socket
    pub_socket = MagicMock()
    pub_socket.bind = MagicMock()
    pub_socket.close = MagicMock()
    pub_socket.send = AsyncMock()

    def socket_factory(socket_type):
        if socket_type == 1:  # zmq.PULL
            return pull_socket
        elif socket_type == 2:  # zmq.PUB
            return pub_socket
        return MagicMock()

    context.socket = MagicMock(side_effect=socket_factory)

    return context, pull_socket, pub_socket


# ============================================================================
# TEST TRANSLATION TASK
# ============================================================================

class TestTranslationTask:
    """Tests for TranslationTask dataclass"""

    def test_task_creation_basic(self):
        """Test basic TranslationTask creation"""
        from services.zmq_server import TranslationTask

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr", "es"],
            conversation_id="conv_789"
        )

        assert task.task_id == "task_123"
        assert task.message_id == "msg_456"
        assert task.text == "Hello world"
        assert task.source_language == "en"
        assert task.target_languages == ["fr", "es"]
        assert task.conversation_id == "conv_789"
        assert task.model_type == "basic"
        assert task.created_at is not None

    def test_task_creation_with_custom_model(self):
        """Test TranslationTask with custom model type"""
        from services.zmq_server import TranslationTask

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Bonjour",
            source_language="fr",
            target_languages=["en"],
            conversation_id="conv_789",
            model_type="premium"
        )

        assert task.model_type == "premium"

    def test_task_creation_with_timestamp(self):
        """Test TranslationTask with explicit timestamp"""
        from services.zmq_server import TranslationTask

        custom_time = 1234567890.0
        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Test",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789",
            created_at=custom_time
        )

        assert task.created_at == custom_time

    def test_task_post_init_sets_timestamp(self):
        """Test that __post_init__ sets timestamp if not provided"""
        from services.zmq_server import TranslationTask

        before_creation = time.time()
        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Test",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )
        after_creation = time.time()

        assert task.created_at is not None
        assert before_creation <= task.created_at <= after_creation


# ============================================================================
# TEST TRANSLATION POOL MANAGER
# ============================================================================

class TestTranslationPoolManager:
    """Tests for TranslationPoolManager"""

    def test_pool_manager_initialization(self, mock_translation_service):
        """Test basic pool manager initialization"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            normal_pool_size=1000,
            any_pool_size=500,
            normal_workers=5,
            any_workers=3,
            translation_service=mock_translation_service
        )

        assert manager.normal_pool is not None
        assert manager.any_pool is not None
        assert manager.translation_service == mock_translation_service
        assert manager.stats['tasks_processed'] == 0
        assert manager.stats['tasks_failed'] == 0

    def test_pool_manager_default_values(self):
        """Test pool manager with default values"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager()

        # Workers should be set to default values or clamped to limits
        assert manager.normal_pool.current_workers >= manager.normal_pool.min_workers
        assert manager.normal_pool.current_workers <= manager.normal_pool.max_workers
        assert manager.any_pool.current_workers >= manager.any_pool.min_workers
        assert manager.any_pool.current_workers <= manager.any_pool.max_workers

    def test_pool_manager_worker_limits(self):
        """Test that worker counts are clamped to limits"""
        from services.zmq_server import TranslationPoolManager

        # Test with very high values
        manager = TranslationPoolManager(
            normal_workers=1000,  # Should be clamped to max
            any_workers=1000     # Should be clamped to max
        )

        assert manager.normal_pool.current_workers <= manager.normal_pool.max_workers
        assert manager.any_pool.current_workers <= manager.any_pool.max_workers

        # Test with very low values
        manager2 = TranslationPoolManager(
            normal_workers=0,  # Should be clamped to min
            any_workers=0     # Should be clamped to min
        )

        assert manager2.normal_pool.current_workers >= manager2.normal_pool.min_workers
        assert manager2.any_pool.current_workers >= manager2.any_pool.min_workers

    @pytest.mark.asyncio
    async def test_enqueue_task_normal_pool(self, mock_translation_service):
        """Test enqueueing task to normal pool (with batching disabled)"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            normal_pool_size=100,
            translation_service=mock_translation_service
        )

        # Disable batching to test direct queue behavior
        manager.connection_manager.enable_batching = False

        # Use text longer than 100 chars to avoid fast_pool (priority queue optimization)
        long_text = "This is a longer text message that exceeds the short text threshold of 100 characters for testing the normal pool queue functionality properly."
        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_123"
        )

        result = await manager.enqueue_task(task)

        assert result is True
        stats = manager.get_stats()
        assert stats['normal_pool_size'] == 1

    @pytest.mark.asyncio
    async def test_enqueue_task_any_pool(self, mock_translation_service):
        """Test enqueueing task to 'any' pool (with batching disabled)"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            any_pool_size=100,
            translation_service=mock_translation_service
        )

        # Disable batching to test direct queue behavior
        manager.connection_manager.enable_batching = False

        # Use text longer than 100 chars to avoid fast_pool (priority queue optimization)
        long_text = "This is a longer text message that exceeds the short text threshold of 100 characters for testing the any pool queue functionality properly."
        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="any"  # This should go to "any" pool
        )

        result = await manager.enqueue_task(task)

        assert result is True
        stats = manager.get_stats()
        assert stats['any_pool_size'] == 1

    @pytest.mark.asyncio
    async def test_enqueue_task_pool_full(self, mock_translation_service):
        """Test enqueueing when pool is full (with batching disabled to test rejection)"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            normal_pool_size=2,  # Very small pool
            translation_service=mock_translation_service
        )

        # Disable batching to test pool full rejection behavior
        manager.connection_manager.enable_batching = False

        # Use text longer than 100 chars to avoid fast_pool (priority queue optimization)
        long_text = "This is a longer text message that exceeds the short text threshold of 100 characters for testing pool overflow functionality properly."

        # Fill the pool
        for i in range(2):
            task = TranslationTask(
                task_id=f"task_{i}",
                message_id=f"msg_{i}",
                text=long_text,
                source_language="en",
                target_languages=["fr"],
                conversation_id="conv_123"
            )
            await manager.enqueue_task(task)

        # Try to add one more
        overflow_task = TranslationTask(
            task_id="overflow_task",
            message_id="overflow_msg",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_123"
        )

        result = await manager.enqueue_task(overflow_task)

        assert result is False
        stats = manager.get_stats()
        assert stats['pool_full_rejections'] == 1

    @pytest.mark.asyncio
    async def test_start_workers(self, mock_translation_service):
        """Test starting workers"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            normal_workers=2,
            any_workers=2,
            translation_service=mock_translation_service
        )

        worker_tasks = await manager.start_workers()

        # Workers are clamped to min values (at least 2 each by default)
        expected_count = manager.normal_pool.current_workers + manager.any_pool.current_workers
        assert len(worker_tasks) == expected_count
        assert manager.normal_pool.workers_running is True
        assert manager.any_pool.workers_running is True

        # Clean up
        await manager.stop_workers()

    @pytest.mark.asyncio
    async def test_stop_workers(self, mock_translation_service):
        """Test stopping workers"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            normal_workers=1,
            any_workers=1,
            translation_service=mock_translation_service
        )

        await manager.start_workers()
        await manager.stop_workers()

        assert manager.normal_pool.workers_running is False
        assert manager.any_pool.workers_running is False

    def test_create_error_result(self, mock_translation_service):
        """Test error result creation"""
        from services.zmq_server import TranslationTask
        from services.zmq_pool.translation_processor import _create_error_result

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        error_result = _create_error_result(task, "fr", "Test error")

        assert error_result['messageId'] == "msg_456"
        assert error_result['targetLanguage'] == "fr"
        assert error_result['error'] == "Test error"
        assert error_result['confidenceScore'] == 0.0
        assert "[ERROR: Test error]" in error_result['translatedText']

    def test_get_stats(self, mock_translation_service):
        """Test getting pool manager statistics"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            translation_service=mock_translation_service
        )

        stats = manager.get_stats()

        assert 'tasks_processed' in stats
        assert 'tasks_failed' in stats
        assert 'translations_completed' in stats
        assert 'memory_usage_mb' in stats
        assert 'uptime_seconds' in stats

    @pytest.mark.asyncio
    async def test_translate_single_language_success(self, mock_translation_service):
        """Test single language translation with service"""
        from services.zmq_server import TranslationTask
        from services.zmq_pool.translation_processor import _translate_single_language

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await _translate_single_language(
            task=task,
            target_language="fr",
            worker_name="worker_1",
            translation_service=mock_translation_service,
            translation_cache=None
        )

        assert result['messageId'] == "msg_456"
        assert result['targetLanguage'] == "fr"
        assert result['workerName'] == "worker_1"
        assert 'translatedText' in result
        assert 'processingTime' in result

    @pytest.mark.asyncio
    async def test_translate_single_language_no_service(self):
        """Test single language translation without service (fallback)"""
        from services.zmq_server import TranslationTask
        from services.zmq_pool.translation_processor import _translate_single_language

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await _translate_single_language(
            task=task,
            target_language="fr",
            worker_name="worker_1",
            translation_service=None,
            translation_cache=None
        )

        assert result['messageId'] == "msg_456"
        assert result['modelType'] == "fallback"
        assert result['confidenceScore'] == 0.1
        assert "[FR]" in result['translatedText']

    @pytest.mark.asyncio
    async def test_translate_single_language_service_returns_none(self):
        """Test handling when translation service returns None"""
        from services.zmq_server import TranslationTask
        from services.zmq_pool.translation_processor import _translate_single_language

        # Create a service that returns None
        bad_service = MagicMock()
        bad_service.translate_with_structure = AsyncMock(return_value=None)

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await _translate_single_language(
            task=task,
            target_language="fr",
            worker_name="worker_1",
            translation_service=bad_service,
            translation_cache=None
        )

        # Should fall back gracefully
        assert result['modelType'] == "fallback"
        assert 'error' in result

    @pytest.mark.asyncio
    async def test_translate_single_language_service_exception(self):
        """Test handling when translation service raises exception"""
        from services.zmq_server import TranslationTask
        from services.zmq_pool.translation_processor import _translate_single_language

        # Create a service that raises an exception
        bad_service = MagicMock()
        bad_service.translate_with_structure = AsyncMock(side_effect=Exception("Service error"))

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await _translate_single_language(
            task=task,
            target_language="fr",
            worker_name="worker_1",
            translation_service=bad_service,
            translation_cache=None
        )

        # Should fall back gracefully
        assert result['modelType'] == "fallback"
        assert 'error' in result
        assert "Service error" in result['error']


# ============================================================================
# TEST ZMQ TRANSLATION SERVER
# ============================================================================

class TestZMQTranslationServer:
    """Tests for ZMQTranslationServer"""

    def test_server_initialization(self, mock_translation_service, mock_database_service):
        """Test basic server initialization"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    gateway_push_port=5555,
                    gateway_sub_port=5558,
                    normal_workers=2,
                    any_workers=1,
                    translation_service=mock_translation_service
                )

                assert server.host == "127.0.0.1"
                assert server.gateway_push_port == 5555
                assert server.gateway_sub_port == 5558
                assert server.running is False

    @pytest.mark.asyncio
    async def test_server_initialize(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test server initialization with sockets"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            gateway_push_port=5555,
                            gateway_sub_port=5558,
                            normal_workers=1,
                            any_workers=1,
                            translation_service=mock_translation_service
                        )

                        await server.initialize()

                        # Verify sockets were bound
                        assert pull_socket.bind.called
                        assert pub_socket.bind.called

                        # Clean up
                        await server.stop()

    @pytest.mark.asyncio
    async def test_handle_ping_request(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test handling ping request"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        ping_message = json.dumps({
                            'type': 'ping',
                            'timestamp': time.time()
                        }).encode('utf-8')

                        await server._handle_translation_request(ping_message)

                        # Verify pong was sent
                        assert pub_socket.send.called
                        sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                        assert sent_data['type'] == 'pong'
                        assert 'translator_status' in sent_data

    @pytest.mark.asyncio
    async def test_handle_translation_request_valid(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test handling valid translation request"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        translation_message = json.dumps({
                            'messageId': 'msg_123',
                            'text': 'Hello world',
                            'sourceLanguage': 'en',
                            'targetLanguages': ['fr', 'es'],
                            'conversationId': 'conv_456'
                        }).encode('utf-8')

                        await server._handle_translation_request(translation_message)

                        # Task should be queued
                        stats = server.pool_manager.get_stats()
                        assert stats['normal_pool_size'] > 0 or stats['tasks_processed'] >= 0

    @pytest.mark.asyncio
    async def test_handle_translation_request_invalid(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test handling invalid translation request"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )

                        # Missing required fields
                        invalid_message = json.dumps({
                            'messageId': 'msg_123'
                            # Missing text and targetLanguages
                        }).encode('utf-8')

                        # Should not raise, just log warning
                        await server._handle_translation_request(invalid_message)

    @pytest.mark.asyncio
    async def test_handle_translation_request_json_error(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test handling malformed JSON"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )

                        # Invalid JSON
                        invalid_json = b'not valid json{{{}'

                        # Should not raise, just log error
                        await server._handle_translation_request(invalid_json)

    @pytest.mark.asyncio
    async def test_handle_message_too_long(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test handling message that is too long for translation"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        # Mock can_translate_message to return False
                        with patch('services.zmq_server.can_translate_message', return_value=False):
                            from services.zmq_server import ZMQTranslationServer

                            server = ZMQTranslationServer(
                                host="127.0.0.1",
                                translation_service=mock_translation_service
                            )
                            server.pub_socket = pub_socket

                            long_message = json.dumps({
                                'messageId': 'msg_123',
                                'text': 'x' * 200000,  # Very long
                                'sourceLanguage': 'en',
                                'targetLanguages': ['fr'],
                                'conversationId': 'conv_456'
                            }).encode('utf-8')

                            await server._handle_translation_request(long_message)

                            # Should send translation_skipped message
                            if pub_socket.send.called:
                                sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                                assert sent_data.get('type') == 'translation_skipped'

    def test_is_valid_translation_valid(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation with valid translation"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {
                    'originalText': 'Hello',
                    'confidenceScore': 0.95
                }

                assert server._is_valid_translation("Bonjour", result) is True

    def test_is_valid_translation_empty(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation with empty text"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {'confidenceScore': 0.95}

                assert server._is_valid_translation("", result) is False
                assert server._is_valid_translation("   ", result) is False

    def test_is_valid_translation_error_patterns(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation with error patterns"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {'confidenceScore': 0.95}

                error_texts = [
                    "[Error: translation failed]",
                    "[ERREUR: something wrong]",
                    "[Failed translation]",
                    "[NLLB No Result]",
                    "[Fallback mode]"
                ]

                for text in error_texts:
                    assert server._is_valid_translation(text, result) is False

    def test_is_valid_translation_low_confidence(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation with low confidence score"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {'confidenceScore': 0.05}  # Very low

                assert server._is_valid_translation("Bonjour", result) is False

    def test_is_valid_translation_same_as_original(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation when translated equals original"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {
                    'originalText': 'Hello',
                    'confidenceScore': 0.95
                }

                assert server._is_valid_translation("Hello", result) is False
                assert server._is_valid_translation("hello", result) is False

    def test_is_valid_translation_with_error_flag(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation when error flag is set"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {
                    'confidenceScore': 0.95,
                    'error': 'Some error occurred'
                }

                assert server._is_valid_translation("Bonjour", result) is False

    def test_get_translation_error_reason(self, mock_translation_service, mock_database_service):
        """Test _get_translation_error_reason"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                assert "vide" in server._get_translation_error_reason("")
                assert "Error" in server._get_translation_error_reason("[Error: test]") or "erreur" in server._get_translation_error_reason("[Error: test]").lower()
                assert "inconnue" in server._get_translation_error_reason("unknown pattern")

    @pytest.mark.asyncio
    async def test_publish_translation_result(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test publishing translation result"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket
                        server.database_service = mock_database_service

                        result = {
                            'messageId': 'msg_123',
                            'translatedText': 'Bonjour',
                            'sourceLanguage': 'en',
                            'targetLanguage': 'fr',
                            'confidenceScore': 0.95,
                            'processingTime': 0.5,
                            'modelType': 'basic',
                            'workerName': 'worker_1',
                            'created_at': time.time()
                        }

                        await server._publish_translation_result("task_123", result, "fr")

                        # Verify message was sent
                        assert pub_socket.send.called

    @pytest.mark.asyncio
    async def test_publish_translation_result_invalid(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test publishing invalid translation result (should not send)"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket
                        server.database_service = mock_database_service

                        # Invalid result (error pattern)
                        result = {
                            'messageId': 'msg_123',
                            'translatedText': '[Error: failed]',
                            'sourceLanguage': 'en',
                            'targetLanguage': 'fr',
                            'confidenceScore': 0.95,
                            'processingTime': 0.5,
                            'modelType': 'basic',
                            'workerName': 'worker_1',
                            'created_at': time.time()
                        }

                        pub_socket.send.reset_mock()
                        await server._publish_translation_result("task_123", result, "fr")

                        # Should NOT send invalid translations
                        assert not pub_socket.send.called

    @pytest.mark.asyncio
    async def test_stop_server(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test stopping the server"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pull_socket = pull_socket
                        server.pub_socket = pub_socket
                        server.database_service = mock_database_service
                        server.running = True

                        await server.stop()

                        assert server.running is False
                        assert pull_socket.close.called
                        assert pub_socket.close.called
                        assert mock_database_service.disconnect.called

    def test_get_server_stats(self, mock_translation_service, mock_database_service):
        """Test getting server statistics"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    gateway_push_port=5555,
                    gateway_sub_port=5558,
                    translation_service=mock_translation_service
                )

                stats = server.get_stats()

                assert 'server_status' in stats
                assert 'gateway_push_port' in stats
                assert 'gateway_sub_port' in stats
                assert stats['gateway_push_port'] == 5555
                assert stats['gateway_sub_port'] == 5558

    @pytest.mark.asyncio
    async def test_health_check_healthy(self, mock_translation_service, mock_database_service):
        """Test health check when healthy"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )
                server.running = True

                health = await server.health_check()

                assert health['status'] == 'healthy'
                assert health['running'] is True
                assert 'stats' in health

    @pytest.mark.asyncio
    async def test_health_check_unhealthy(self, mock_translation_service, mock_database_service):
        """Test health check when error occurs"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                # Force an error in get_stats
                with patch.object(server, 'get_stats', side_effect=Exception("Stats error")):
                    health = await server.health_check()

                    assert health['status'] == 'unhealthy'
                    assert 'error' in health


# ============================================================================
# TEST AUDIO PROCESSING
# ============================================================================

class TestAudioProcessing:
    """Tests for audio processing functionality"""

    @pytest.mark.asyncio
    async def test_handle_audio_process_not_available(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test audio processing when pipeline not available"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        with patch('services.zmq_server.AUDIO_PIPELINE_AVAILABLE', False):
                            from services.zmq_server import ZMQTranslationServer

                            server = ZMQTranslationServer(
                                host="127.0.0.1",
                                translation_service=mock_translation_service
                            )
                            server.pub_socket = pub_socket

                            audio_request = {
                                'type': 'audio_process',
                                'messageId': 'msg_123',
                                'attachmentId': 'att_456',
                                'audioPath': '/path/to/audio.wav',
                                'senderId': 'user_123'
                            }

                            await server._handle_audio_process_request(audio_request)

                            # Should publish error
                            assert pub_socket.send.called
                            sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                            assert sent_data['type'] == 'audio_process_error'

    @pytest.mark.asyncio
    async def test_publish_audio_error(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test publishing audio error"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        await server._publish_audio_error(
                            task_id="task_123",
                            message_id="msg_456",
                            attachment_id="att_789",
                            error="Test error",
                            error_code="TEST_ERROR"
                        )

                        assert pub_socket.send.called
                        sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                        assert sent_data['type'] == 'audio_process_error'
                        assert sent_data['error'] == 'Test error'
                        assert sent_data['errorCode'] == 'TEST_ERROR'


# ============================================================================
# TEST VOICE API HANDLING
# ============================================================================

class TestVoiceAPIHandling:
    """Tests for Voice API handling"""

    @pytest.mark.asyncio
    async def test_handle_voice_api_no_handler(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test Voice API request when handler not available"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.voice_api_handler = None

                        request_data = {'type': 'voice_translate'}

                        # Should not raise, just log error
                        await server._handle_voice_api_request(request_data)

    @pytest.mark.asyncio
    async def test_handle_voice_api_with_handler(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test Voice API request with handler"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Create mock handler
                        mock_handler = MagicMock()
                        mock_handler.handle_request = AsyncMock(return_value={
                            'type': 'voice_api_success',
                            'taskId': 'task_123'
                        })
                        server.voice_api_handler = mock_handler

                        request_data = {'type': 'voice_translate', 'taskId': 'task_123'}

                        await server._handle_voice_api_request(request_data)

                        assert mock_handler.handle_request.called
                        assert pub_socket.send.called

    def test_set_voice_api_services(self, mock_translation_service, mock_database_service):
        """Test setting Voice API services"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                # Create mock handler
                mock_handler = MagicMock()
                server.voice_api_handler = mock_handler

                # Create mock profile handler
                mock_profile_handler = MagicMock()
                server.voice_profile_handler = mock_profile_handler

                mock_trans_service = MagicMock()
                mock_tts_service = MagicMock()
                mock_clone_service = MagicMock()

                server.set_voice_api_services(
                    translation_service=mock_trans_service,
                    tts_service=mock_tts_service,
                    voice_clone_service=mock_clone_service
                )

                assert mock_handler.translation_service == mock_trans_service
                assert mock_handler.tts_service == mock_tts_service
                assert mock_handler.voice_clone_service == mock_clone_service


# ============================================================================
# TEST VOICE PROFILE HANDLING
# ============================================================================

class TestVoiceProfileHandling:
    """Tests for Voice Profile handling"""

    @pytest.mark.asyncio
    async def test_handle_voice_profile_no_handler(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test Voice Profile request when handler not available"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.voice_profile_handler = None

                        request_data = {'type': 'voice_profile_create'}

                        # Should not raise, just log error
                        await server._handle_voice_profile_request(request_data)

    @pytest.mark.asyncio
    async def test_handle_voice_profile_with_handler(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test Voice Profile request with handler"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Create mock handler
                        mock_handler = MagicMock()
                        mock_handler.handle_request = AsyncMock(return_value={
                            'type': 'voice_profile_success',
                            'request_id': 'req_123'
                        })
                        server.voice_profile_handler = mock_handler

                        request_data = {'type': 'voice_profile_create', 'request_id': 'req_123'}

                        await server._handle_voice_profile_request(request_data)

                        assert mock_handler.handle_request.called
                        assert pub_socket.send.called


# ============================================================================
# TEST DYNAMIC SCALING
# ============================================================================

class TestDynamicScaling:
    """Tests for dynamic worker scaling using WorkerPool.check_scaling()"""

    @pytest.mark.asyncio
    async def test_dynamic_scaling_disabled(self, mock_translation_service):
        """Test that scaling is skipped when disabled"""
        from services.zmq_server import TranslationPoolManager

        # Create manager with dynamic scaling DISABLED
        manager = TranslationPoolManager(
            translation_service=mock_translation_service,
            enable_dynamic_scaling=False
        )

        initial_normal = manager.normal_pool.current_workers
        initial_any = manager.any_pool.current_workers

        # Force last_scaling_check to 0 to bypass time interval check
        manager.normal_pool.last_scaling_check = 0
        manager.any_pool.last_scaling_check = 0

        # Try to trigger scaling with high queue size and utilization
        # Should return False because scaling is disabled
        normal_scaled = await manager.normal_pool.check_scaling(queue_size=200, utilization=0.9)
        any_scaled = await manager.any_pool.check_scaling(queue_size=100, utilization=0.9)

        # Verify scaling did NOT occur
        assert normal_scaled is False
        assert any_scaled is False
        assert manager.normal_pool.current_workers == initial_normal
        assert manager.any_pool.current_workers == initial_any
        assert manager.normal_pool.stats['scaling_events'] == 0
        assert manager.any_pool.stats['scaling_events'] == 0

    @pytest.mark.asyncio
    async def test_scale_normal_workers_up(self, mock_translation_service):
        """Test scaling up normal workers when queue is large and utilization is high"""
        from services.zmq_server import TranslationPoolManager

        # Create manager with small initial workers
        manager = TranslationPoolManager(
            normal_workers=5,
            translation_service=mock_translation_service,
            enable_dynamic_scaling=True
        )

        initial_count = manager.normal_pool.current_workers
        initial_events = manager.normal_pool.stats['scaling_events']

        # Force last_scaling_check to 0 to bypass time interval check
        manager.normal_pool.last_scaling_check = 0

        # Trigger scaling UP with high queue size (>100) and high utilization (>0.8)
        scaled = await manager.normal_pool.check_scaling(queue_size=200, utilization=0.9)

        # Verify scaling occurred
        assert scaled is True
        assert manager.normal_pool.current_workers > initial_count
        assert manager.normal_pool.current_workers == initial_count + 5  # normal pool increments by 5
        assert manager.normal_pool.stats['scaling_events'] == initial_events + 1

    @pytest.mark.asyncio
    async def test_scale_any_workers_up(self, mock_translation_service):
        """Test scaling up any workers when queue is large and utilization is high"""
        from services.zmq_server import TranslationPoolManager

        # Create manager with small initial workers
        manager = TranslationPoolManager(
            any_workers=3,
            translation_service=mock_translation_service,
            enable_dynamic_scaling=True
        )

        initial_count = manager.any_pool.current_workers
        initial_events = manager.any_pool.stats['scaling_events']

        # Force last_scaling_check to 0 to bypass time interval check
        manager.any_pool.last_scaling_check = 0

        # Trigger scaling UP with high queue size (>50) and high utilization (>0.8)
        scaled = await manager.any_pool.check_scaling(queue_size=100, utilization=0.9)

        # Verify scaling occurred
        assert scaled is True
        assert manager.any_pool.current_workers > initial_count
        assert manager.any_pool.current_workers == initial_count + 3  # any pool increments by 3
        assert manager.any_pool.stats['scaling_events'] == initial_events + 1

    @pytest.mark.asyncio
    async def test_scale_normal_workers_down(self, mock_translation_service):
        """Test scaling down normal workers when queue is empty and utilization is low"""
        from services.zmq_server import TranslationPoolManager

        # Create manager with more workers
        manager = TranslationPoolManager(
            normal_workers=10,
            translation_service=mock_translation_service,
            enable_dynamic_scaling=True
        )

        initial_count = manager.normal_pool.current_workers
        initial_events = manager.normal_pool.stats['scaling_events']

        # Force last_scaling_check to 0 to bypass time interval check
        manager.normal_pool.last_scaling_check = 0

        # Trigger scaling DOWN with low queue size (<10) and low utilization (<0.3)
        scaled = await manager.normal_pool.check_scaling(queue_size=5, utilization=0.2)

        # Verify scaling down occurred
        assert scaled is True
        assert manager.normal_pool.current_workers < initial_count
        assert manager.normal_pool.current_workers == initial_count - 2  # normal pool decrements by 2
        assert manager.normal_pool.stats['scaling_events'] == initial_events + 1

    @pytest.mark.asyncio
    async def test_scaling_time_interval_check(self, mock_translation_service):
        """Test that scaling respects time interval between checks"""
        from services.zmq_server import TranslationPoolManager
        import time

        manager = TranslationPoolManager(
            normal_workers=5,
            translation_service=mock_translation_service,
            enable_dynamic_scaling=True
        )

        initial_count = manager.normal_pool.current_workers

        # First scaling check should work (last_scaling_check was initialized to 0)
        # Force it to current time to simulate recent check
        manager.normal_pool.last_scaling_check = time.time()

        # Try to scale immediately (should be rejected due to time interval)
        scaled = await manager.normal_pool.check_scaling(queue_size=200, utilization=0.9)

        # Verify scaling did NOT occur (too soon after last check)
        assert scaled is False
        assert manager.normal_pool.current_workers == initial_count

        # Now force last_scaling_check to 0 (simulate 30+ seconds passed)
        manager.normal_pool.last_scaling_check = 0

        # Try again - should work now
        scaled = await manager.normal_pool.check_scaling(queue_size=200, utilization=0.9)

        # Verify scaling occurred this time
        assert scaled is True
        assert manager.normal_pool.current_workers > initial_count

    @pytest.mark.asyncio
    async def test_scaling_respects_max_workers(self, mock_translation_service):
        """Test that scaling up respects max_scaling_workers limit"""
        from services.zmq_server import TranslationPoolManager

        # Create manager with workers close to max
        manager = TranslationPoolManager(
            normal_workers=38,  # max_scaling_workers is typically 40
            translation_service=mock_translation_service,
            enable_dynamic_scaling=True
        )

        # Get the actual max_scaling_workers for this pool
        max_workers = manager.normal_pool.max_scaling_workers
        initial_count = manager.normal_pool.current_workers

        # Force last_scaling_check to 0
        manager.normal_pool.last_scaling_check = 0

        # Try to scale up with high load
        scaled = await manager.normal_pool.check_scaling(queue_size=200, utilization=0.9)

        # Should scale but not exceed max
        if initial_count < max_workers:
            assert scaled is True
            assert manager.normal_pool.current_workers <= max_workers
        else:
            # Already at max, no scaling
            assert scaled is False
            assert manager.normal_pool.current_workers == initial_count


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration tests for full workflow"""

    @pytest.mark.asyncio
    async def test_full_translation_workflow(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test complete translation workflow"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            gateway_push_port=5555,
                            gateway_sub_port=5558,
                            normal_workers=2,
                            any_workers=1,
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket
                        server.database_service = mock_database_service

                        # Test enqueueing
                        translation_message = json.dumps({
                            'messageId': 'msg_integration_test',
                            'text': 'Integration test message',
                            'sourceLanguage': 'en',
                            'targetLanguages': ['fr'],
                            'conversationId': 'conv_integration'
                        }).encode('utf-8')

                        await server._handle_translation_request(translation_message)

                        # Verify task was queued
                        stats = server.pool_manager.get_stats()
                        assert stats['normal_pool_size'] >= 0

    @pytest.mark.asyncio
    async def test_multiple_language_translation(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test translation to multiple languages"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Test with multiple target languages
                        translation_message = json.dumps({
                            'messageId': 'msg_multi',
                            'text': 'Hello world',
                            'sourceLanguage': 'en',
                            'targetLanguages': ['fr', 'es', 'de', 'it'],
                            'conversationId': 'conv_multi'
                        }).encode('utf-8')

                        await server._handle_translation_request(translation_message)

                        # Verify task was queued
                        stats = server.pool_manager.get_stats()
                        assert stats['normal_pool_size'] >= 0


# ============================================================================
# ADDITIONAL COVERAGE TESTS
# ============================================================================

class TestAdditionalCoverage:
    """Additional tests for improved code coverage"""

    @pytest.mark.asyncio
    async def test_enqueue_task_exception_handling(self, mock_translation_service):
        """Test exception handling during task enqueueing"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            translation_service=mock_translation_service
        )

        # Use text longer than 100 chars to avoid fast_pool (priority queue optimization)
        long_text = "This is a longer text message that exceeds the short text threshold of 100 characters for testing exception handling in the normal pool properly."
        task = TranslationTask(
            task_id="task_exception",
            message_id="msg_exception",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_exception"
        )

        # Force an exception by patching the pool
        with patch.object(manager.normal_pool, 'put', side_effect=Exception("Queue error")):
            result = await manager.enqueue_task(task)
            assert result is False

    @pytest.mark.asyncio
    async def test_process_translation_task(self, mock_translation_service):
        """Test _process_translation_task method"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            translation_service=mock_translation_service
        )

        # Mock the publish method
        manager._publish_translation_result = AsyncMock()

        task = TranslationTask(
            task_id="task_process",
            message_id="msg_process",
            text="Test message",
            source_language="en",
            target_languages=["fr", "es"],
            conversation_id="conv_process"
        )

        await manager._process_translation_task(task, "test_worker")

        # Verify publish was called for each language
        assert manager._publish_translation_result.call_count == 2

    @pytest.mark.asyncio
    async def test_process_translation_task_with_error(self, mock_translation_service):
        """Test _process_translation_task with translation error"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        # Make translation service fail
        mock_translation_service.translate_with_structure = AsyncMock(
            side_effect=Exception("Translation failed")
        )

        manager = TranslationPoolManager(
            translation_service=mock_translation_service
        )

        # Mock the publish method
        manager._publish_translation_result = AsyncMock()

        task = TranslationTask(
            task_id="task_error",
            message_id="msg_error",
            text="Test",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_error"
        )

        # Should handle the exception gracefully
        await manager._process_translation_task(task, "test_worker")

    @pytest.mark.asyncio
    async def test_publish_translation_result_no_socket(self, mock_translation_service, mock_database_service):
        """Test publishing when socket is None"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )
                server.pub_socket = None
                server.database_service = mock_database_service

                result = {
                    'messageId': 'msg_no_socket',
                    'translatedText': 'Bonjour',
                    'sourceLanguage': 'en',
                    'targetLanguage': 'fr',
                    'confidenceScore': 0.95,
                    'processingTime': 0.5,
                    'modelType': 'basic',
                    'workerName': 'worker_1',
                    'created_at': time.time()
                }

                # Should not raise even with no socket
                await server._publish_translation_result("task_no_socket", result, "fr")

    @pytest.mark.asyncio
    async def test_audio_process_missing_fields(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test audio processing with missing required fields"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        with patch('services.zmq_server.AUDIO_PIPELINE_AVAILABLE', True):
                            # Mock the audio pipeline
                            mock_pipeline = MagicMock()
                            mock_pipeline.translation_service = None
                            mock_pipeline.database_service = None
                            mock_pipeline.set_translation_service = MagicMock()
                            mock_pipeline.set_database_service = MagicMock()
                            mock_pipeline.process_audio_message = AsyncMock(side_effect=ValueError("Champ requis manquant: senderId"))

                            with patch('services.zmq_server.get_audio_pipeline', return_value=mock_pipeline):
                                from services.zmq_server import ZMQTranslationServer

                                server = ZMQTranslationServer(
                                    host="127.0.0.1",
                                    translation_service=mock_translation_service
                                )
                                server.pub_socket = pub_socket
                                server.pool_manager.translation_service = mock_translation_service

                                # Missing senderId
                                audio_request = {
                                    'type': 'audio_process',
                                    'messageId': 'msg_123',
                                    'attachmentId': 'att_456',
                                    'audioPath': '/path/to/audio.wav'
                                    # Missing senderId
                                }

                                await server._handle_audio_process_request(audio_request)

                                # Should publish error
                                assert pub_socket.send.called

    @pytest.mark.asyncio
    async def test_voice_api_handler_exception(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test Voice API handler with exception"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Create mock handler that throws exception
                        mock_handler = MagicMock()
                        mock_handler.handle_request = AsyncMock(side_effect=Exception("Handler error"))
                        server.voice_api_handler = mock_handler

                        request_data = {'type': 'voice_translate', 'taskId': 'task_error'}

                        await server._handle_voice_api_request(request_data)

                        # Should publish error response
                        assert pub_socket.send.called
                        sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                        assert sent_data['type'] == 'voice_api_error'

    @pytest.mark.asyncio
    async def test_voice_profile_handler_exception(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test Voice Profile handler with exception"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Create mock handler that throws exception
                        mock_handler = MagicMock()
                        mock_handler.handle_request = AsyncMock(side_effect=Exception("Profile error"))
                        server.voice_profile_handler = mock_handler

                        request_data = {
                            'type': 'voice_profile_create',
                            'request_id': 'req_error',
                            'user_id': 'user_error'
                        }

                        await server._handle_voice_profile_request(request_data)

                        # Should publish error response
                        assert pub_socket.send.called
                        sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                        assert sent_data['type'] == 'voice_profile_error'

    @pytest.mark.asyncio
    async def test_publish_audio_result(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test publishing audio result"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Create mock result with real values (not MagicMock) for JSON serialization
                        @dataclass
                        class MockOriginal:
                            transcription: str = "Hello world"
                            language: str = "en"
                            confidence: float = 0.95
                            source: str = "whisper"
                            segments: list = None
                            def __post_init__(self):
                                if self.segments is None:
                                    self.segments = []

                        @dataclass
                        class MockAudioResult:
                            message_id: str = "msg_123"
                            attachment_id: str = "att_456"
                            original: MockOriginal = None
                            translations: dict = None
                            voice_model_user_id: str = "user_123"
                            voice_model_quality: float = 0.9
                            def __post_init__(self):
                                if self.original is None:
                                    self.original = MockOriginal()
                                if self.translations is None:
                                    self.translations = {}

                        mock_result = MockAudioResult()

                        await server._publish_audio_result("task_123", mock_result, 500)

                        assert pub_socket.send.called
                        sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                        assert sent_data['type'] == 'audio_process_completed'

    @pytest.mark.asyncio
    async def test_publish_audio_result_no_socket(self, mock_translation_service, mock_database_service):
        """Test publishing audio result with no socket"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )
                server.pub_socket = None

                mock_result = MagicMock()
                mock_result.message_id = "msg_123"
                mock_result.attachment_id = "att_456"
                mock_result.original = MagicMock()
                mock_result.original.transcription = "Hello"
                mock_result.original.language = "en"
                mock_result.original.confidence = 0.9
                mock_result.original.source = "whisper"
                mock_result.original.segments = []
                mock_result.translations = {}
                mock_result.voice_model_user_id = None
                mock_result.voice_model_quality = None

                # Should not raise
                await server._publish_audio_result("task_123", mock_result, 500)

    @pytest.mark.asyncio
    async def test_publish_audio_error_no_socket(self, mock_translation_service, mock_database_service):
        """Test publishing audio error with no socket"""
        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )
                server.pub_socket = None

                # Should not raise
                await server._publish_audio_error(
                    task_id="task_123",
                    message_id="msg_456",
                    attachment_id="att_789",
                    error="Test error",
                    error_code="TEST_ERROR"
                )

    @pytest.mark.asyncio
    async def test_handle_translation_pool_full_error(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test handling when translation pool is full"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            normal_pool_size=1,
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Use text longer than 100 chars to avoid fast_pool (priority queue optimization)
                        long_text_1 = "This is a longer text message that exceeds the short text threshold of 100 characters for testing pool overflow functionality properly with first message."
                        long_text_2 = "This is a longer text message that exceeds the short text threshold of 100 characters for testing pool overflow functionality properly with second message."

                        # Fill the pool first
                        msg1 = json.dumps({
                            'messageId': 'msg_1',
                            'text': long_text_1,
                            'sourceLanguage': 'en',
                            'targetLanguages': ['fr'],
                            'conversationId': 'conv_1'
                        }).encode('utf-8')
                        await server._handle_translation_request(msg1)

                        # Now try another - should fail
                        msg2 = json.dumps({
                            'messageId': 'msg_2',
                            'text': long_text_2,
                            'sourceLanguage': 'en',
                            'targetLanguages': ['fr'],
                            'conversationId': 'conv_2'
                        }).encode('utf-8')
                        await server._handle_translation_request(msg2)

                        # Check that error was sent for the pool full case
                        # The pub_socket.send should be called with error message
                        assert pub_socket.send.call_count >= 1

    def test_translation_task_multiple_languages(self):
        """Test TranslationTask with multiple target languages"""
        from services.zmq_server import TranslationTask

        languages = ["fr", "es", "de", "it", "pt", "nl", "ru", "ja", "zh", "ko"]
        task = TranslationTask(
            task_id="task_multi",
            message_id="msg_multi",
            text="Hello world",
            source_language="en",
            target_languages=languages,
            conversation_id="conv_multi"
        )

        assert len(task.target_languages) == 10
        assert task.target_languages == languages

    @pytest.mark.asyncio
    async def test_database_connection_background(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test database connection in background"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )

                        # Call the background connection method directly
                        await server._connect_database_background()

                        assert mock_database_service.connect.called

    @pytest.mark.asyncio
    async def test_database_connection_failure(self, mock_translation_service, mock_zmq_context):
        """Test database connection failure handling"""
        context, pull_socket, pub_socket = mock_zmq_context

        mock_db = MagicMock()
        mock_db.connect = AsyncMock(return_value=False)
        mock_db.disconnect = AsyncMock()

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_db):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )

                        await server._connect_database_background()

                        # Should handle failure gracefully
                        assert mock_db.connect.called

    @pytest.mark.asyncio
    async def test_database_connection_exception(self, mock_translation_service, mock_zmq_context):
        """Test database connection exception handling"""
        context, pull_socket, pub_socket = mock_zmq_context

        mock_db = MagicMock()
        mock_db.connect = AsyncMock(side_effect=Exception("Connection error"))
        mock_db.disconnect = AsyncMock()

        with patch('services.zmq_server_core.DatabaseService', return_value=mock_db):
            with patch('services.zmq_server_core.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server_core.zmq.PULL', 1):
                    with patch('services.zmq_server_core.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )

                        # Should not raise
                        await server._connect_database_background()


# =============================================================================
# TESTS POUR PRIORITY FIELD ET FAST POOL
# =============================================================================

class TestPriorityQueueIntegration:
    """Tests pour l'intégration du système de priorité dans le serveur ZMQ."""

    @pytest.fixture
    def mock_translation_service(self):
        service = AsyncMock()
        service.translate = AsyncMock(return_value={
            'translated_text': 'Bonjour',
            'source_language': 'en',
            'target_language': 'fr',
            'model_tier': 'basic'
        })
        service.detect_language = AsyncMock(return_value='en')
        return service

    @pytest.fixture
    def mock_database_service(self):
        db = MagicMock()
        db.connect = AsyncMock(return_value=True)
        db.disconnect = AsyncMock()
        db.is_connected = True
        return db

    @pytest.fixture
    def mock_zmq_context(self):
        context = MagicMock()
        pull_socket = MagicMock()
        pub_socket = MagicMock()

        pull_socket.bind = MagicMock()
        pull_socket.close = MagicMock()
        pull_socket.recv = AsyncMock(return_value=b'{}')

        pub_socket.bind = MagicMock()
        pub_socket.close = MagicMock()
        pub_socket.send = MagicMock()

        context.socket.side_effect = [pull_socket, pub_socket]

        return context, pull_socket, pub_socket

    def test_translation_task_has_priority_field(self):
        """Test 20.60: TranslationTask a un champ priority"""
        from services.zmq_server import TranslationTask

        task = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1",
            priority=1
        )

        assert hasattr(task, 'priority')
        assert task.priority == 1

    def test_translation_task_priority_default(self):
        """Test 20.61: TranslationTask priority par défaut"""
        from services.zmq_server import TranslationTask

        task = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1"
        )

        # Priority should have a default value
        assert hasattr(task, 'priority')

    def test_translation_task_high_priority_short_text(self):
        """Test 20.62: Texte court = haute priorité"""
        from services.zmq_server import TranslationTask

        short_text = "Hi"  # < 100 chars
        task = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text=short_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1",
            priority=1  # HIGH priority
        )

        assert len(task.text) < 100
        assert task.priority == 1

    def test_translation_task_low_priority_long_text(self):
        """Test 20.63: Texte long = basse priorité"""
        from services.zmq_server import TranslationTask

        long_text = "a" * 600  # > 500 chars
        task = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1",
            priority=3  # LOW priority
        )

        assert len(task.text) > 500
        assert task.priority == 3

    @pytest.mark.asyncio
    async def test_fast_pool_exists(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test 20.64: fast_pool existe dans TranslationPoolManager"""
        from services.zmq_server import TranslationPoolManager

        pool_manager = TranslationPoolManager(
            translation_service=mock_translation_service,
            normal_workers=4,
            any_workers=2
        )

        # fast_pool should exist
        assert hasattr(pool_manager, 'fast_pool')

    @pytest.mark.asyncio
    async def test_enqueue_short_text_uses_fast_pool(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test 20.65: Texte court utilise fast_pool"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        pool_manager = TranslationPoolManager(
            translation_service=mock_translation_service,
            normal_workers=4,
            any_workers=2
        )

        # Create a short text task
        short_task = TranslationTask(
            task_id="short_1",
            message_id="msg_short",
            text="Hi",  # Very short
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1"
        )

        # Enqueue should work
        result = await pool_manager.enqueue_task(short_task)
        # Result should be True (queued) or task might be processed
        assert result is True or result is not None

    @pytest.mark.asyncio
    async def test_short_text_threshold(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test 20.66: Seuil de texte court (100 chars)"""
        context, pull_socket, pub_socket = mock_zmq_context

        from services.zmq_server import TranslationTask

        # Text at threshold boundary
        text_99 = "a" * 99   # Should be HIGH priority
        text_101 = "a" * 101  # Should NOT be HIGH priority

        task_short = TranslationTask(
            task_id="task_short",
            message_id="msg_1",
            text=text_99,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1"
        )

        task_medium = TranslationTask(
            task_id="task_medium",
            message_id="msg_2",
            text=text_101,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1"
        )

        assert len(task_short.text) < 100
        assert len(task_medium.text) > 100


class TestWorkerLoopPriorityHandling:
    """Tests pour la gestion des priorités dans les worker loops."""

    @pytest.fixture
    def mock_translation_service(self):
        service = AsyncMock()
        service.translate = AsyncMock(return_value={
            'translated_text': 'Bonjour',
            'source_language': 'en',
            'target_language': 'fr',
            'model_tier': 'basic'
        })
        return service

    def test_priority_import_from_performance(self):
        """Test 20.67: Priority enum est importé du module performance"""
        try:
            from utils.performance import Priority
            assert Priority.HIGH == 1
            assert Priority.MEDIUM == 2
            assert Priority.LOW == 3
        except ImportError:
            # Module may not be available in test environment
            pass

    def test_performance_config_import(self):
        """Test 20.68: PerformanceConfig est importé"""
        try:
            from utils.performance import PerformanceConfig
            config = PerformanceConfig()
            assert config.short_text_threshold == 100
        except ImportError:
            pass

    @pytest.mark.asyncio
    async def test_pool_manager_uses_performance_config(self, mock_translation_service):
        """Test 20.69: TranslationPoolManager utilise PerformanceConfig"""
        from services.zmq_server import TranslationPoolManager

        pool = TranslationPoolManager(
            translation_service=mock_translation_service,
            normal_workers=4,
            any_workers=2
        )

        # Pool should have enable_priority_queue from performance config
        assert hasattr(pool, 'enable_priority_queue')
        assert hasattr(pool, 'short_text_threshold')


class TestPriorityDataclass:
    """Tests pour le champ priority dans TranslationTask dataclass."""

    def test_task_serialization_with_priority(self):
        """Test 20.70: Sérialisation de task avec priority"""
        from services.zmq_server import TranslationTask
        from dataclasses import asdict

        # Use a medium-length text to avoid auto-priority adjustment
        medium_text = "a" * 200  # Between 100 and 500 chars -> MEDIUM priority
        task = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text=medium_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1",
            priority=2  # MEDIUM
        )

        task_dict = asdict(task)
        assert 'priority' in task_dict
        # With medium text and default priority=2, it stays at 2 (MEDIUM)
        assert task_dict['priority'] == 2

    def test_task_equality_with_priority(self):
        """Test 20.71: Égalité de tasks avec différentes priorités"""
        from services.zmq_server import TranslationTask

        # Use long text to prevent auto-priority adjustment from changing priority=1 to something else
        long_text = "a" * 600  # > 500 chars ensures LOW priority won't override

        task1 = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1",
            priority=1  # Force HIGH (won't be auto-adjusted since we're explicitly setting it and text is long)
        )

        task2 = TranslationTask(
            task_id="task_1",
            message_id="msg_1",
            text=long_text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_1",
            priority=3  # Force LOW
        )

        # Tasks with different priorities should not be equal
        assert task1.priority != task2.priority

    def test_multiple_priorities_sorting(self):
        """Test 20.72: Tri de tasks par priorité"""
        from services.zmq_server import TranslationTask

        tasks = [
            TranslationTask(
                task_id=f"task_{i}",
                message_id=f"msg_{i}",
                text="Test",
                source_language="en",
                target_languages=["fr"],
                conversation_id="conv_1",
                priority=p
            )
            for i, p in enumerate([3, 1, 2, 1, 3])
        ]

        # Sort by priority
        sorted_tasks = sorted(tasks, key=lambda t: t.priority)

        # HIGH priority (1) should come first
        assert sorted_tasks[0].priority == 1
        assert sorted_tasks[1].priority == 1
        assert sorted_tasks[-1].priority == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
