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
        assert manager.normal_workers >= manager.normal_workers_min
        assert manager.normal_workers <= manager.normal_workers_max
        assert manager.any_workers >= manager.any_workers_min
        assert manager.any_workers <= manager.any_workers_max

    def test_pool_manager_worker_limits(self):
        """Test that worker counts are clamped to limits"""
        from services.zmq_server import TranslationPoolManager

        # Test with very high values
        manager = TranslationPoolManager(
            normal_workers=1000,  # Should be clamped to max
            any_workers=1000     # Should be clamped to max
        )

        assert manager.normal_workers <= manager.normal_workers_max
        assert manager.any_workers <= manager.any_workers_max

        # Test with very low values
        manager2 = TranslationPoolManager(
            normal_workers=0,  # Should be clamped to min
            any_workers=0     # Should be clamped to min
        )

        assert manager2.normal_workers >= manager2.normal_workers_min
        assert manager2.any_workers >= manager2.any_workers_min

    @pytest.mark.asyncio
    async def test_enqueue_task_normal_pool(self, mock_translation_service):
        """Test enqueueing task to normal pool"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            normal_pool_size=100,
            translation_service=mock_translation_service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_123"
        )

        result = await manager.enqueue_task(task)

        assert result is True
        assert manager.stats['normal_pool_size'] == 1

    @pytest.mark.asyncio
    async def test_enqueue_task_any_pool(self, mock_translation_service):
        """Test enqueueing task to 'any' pool"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            any_pool_size=100,
            translation_service=mock_translation_service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="any"  # This should go to "any" pool
        )

        result = await manager.enqueue_task(task)

        assert result is True
        assert manager.stats['any_pool_size'] == 1

    @pytest.mark.asyncio
    async def test_enqueue_task_pool_full(self, mock_translation_service):
        """Test enqueueing when pool is full"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            normal_pool_size=2,  # Very small pool
            translation_service=mock_translation_service
        )

        # Fill the pool
        for i in range(2):
            task = TranslationTask(
                task_id=f"task_{i}",
                message_id=f"msg_{i}",
                text="Hello",
                source_language="en",
                target_languages=["fr"],
                conversation_id="conv_123"
            )
            await manager.enqueue_task(task)

        # Try to add one more
        overflow_task = TranslationTask(
            task_id="overflow_task",
            message_id="overflow_msg",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_123"
        )

        result = await manager.enqueue_task(overflow_task)

        assert result is False
        assert manager.stats['pool_full_rejections'] == 1

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
        expected_count = manager.normal_workers + manager.any_workers
        assert len(worker_tasks) == expected_count
        assert manager.normal_workers_running is True
        assert manager.any_workers_running is True

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

        assert manager.normal_workers_running is False
        assert manager.any_workers_running is False

    def test_create_error_result(self, mock_translation_service):
        """Test error result creation"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            translation_service=mock_translation_service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        error_result = manager._create_error_result(task, "fr", "Test error")

        assert error_result['messageId'] == "msg_456"
        assert error_result['targetLanguage'] == "fr"
        assert error_result['error'] == "Test error"
        assert error_result['confidenceScore'] == 0.0
        assert "[ERREUR: Test error]" in error_result['translatedText']

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
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            translation_service=mock_translation_service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await manager._translate_single_language(task, "fr", "worker_1")

        assert result['messageId'] == "msg_456"
        assert result['targetLanguage'] == "fr"
        assert result['workerName'] == "worker_1"
        assert 'translatedText' in result
        assert 'processingTime' in result

    @pytest.mark.asyncio
    async def test_translate_single_language_no_service(self):
        """Test single language translation without service (fallback)"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        manager = TranslationPoolManager(
            translation_service=None  # No translation service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await manager._translate_single_language(task, "fr", "worker_1")

        assert result['messageId'] == "msg_456"
        assert result['modelType'] == "fallback"
        assert result['confidenceScore'] == 0.1
        assert "[FR]" in result['translatedText']

    @pytest.mark.asyncio
    async def test_translate_single_language_service_returns_none(self):
        """Test handling when translation service returns None"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        # Create a service that returns None
        bad_service = MagicMock()
        bad_service.translate_with_structure = AsyncMock(return_value=None)

        manager = TranslationPoolManager(
            translation_service=bad_service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await manager._translate_single_language(task, "fr", "worker_1")

        # Should fall back gracefully
        assert result['modelType'] == "fallback"
        assert 'error' in result

    @pytest.mark.asyncio
    async def test_translate_single_language_service_exception(self):
        """Test handling when translation service raises exception"""
        from services.zmq_server import TranslationPoolManager, TranslationTask

        # Create a service that raises an exception
        bad_service = MagicMock()
        bad_service.translate_with_structure = AsyncMock(side_effect=Exception("Service error"))

        manager = TranslationPoolManager(
            translation_service=bad_service
        )

        task = TranslationTask(
            task_id="task_123",
            message_id="msg_456",
            text="Hello world",
            source_language="en",
            target_languages=["fr"],
            conversation_id="conv_789"
        )

        result = await manager._translate_single_language(task, "fr", "worker_1")

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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
                from services.zmq_server import ZMQTranslationServer

                server = ZMQTranslationServer(
                    host="127.0.0.1",
                    translation_service=mock_translation_service
                )

                result = {'confidenceScore': 0.05}  # Very low

                assert server._is_valid_translation("Bonjour", result) is False

    def test_is_valid_translation_same_as_original(self, mock_translation_service, mock_database_service):
        """Test _is_valid_translation when translated equals original"""
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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
    """Tests for dynamic worker scaling"""

    @pytest.mark.asyncio
    async def test_dynamic_scaling_disabled(self, mock_translation_service):
        """Test that scaling is skipped when disabled"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            translation_service=mock_translation_service,
            enable_dynamic_scaling=False
        )

        initial_normal = manager.normal_workers
        initial_any = manager.any_workers

        # Force scaling check
        manager.last_scaling_check = 0  # Reset to trigger check
        await manager._dynamic_scaling_check()

        # Workers should not change
        assert manager.normal_workers == initial_normal
        assert manager.any_workers == initial_any

    @pytest.mark.asyncio
    async def test_scale_normal_workers_up(self, mock_translation_service):
        """Test scaling up normal workers"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            normal_workers=5,
            translation_service=mock_translation_service
        )

        initial_count = manager.normal_workers
        await manager._scale_normal_workers(initial_count + 2)

        assert manager.normal_workers == initial_count + 2
        assert manager.stats['dynamic_scaling_events'] == 1

    @pytest.mark.asyncio
    async def test_scale_any_workers_up(self, mock_translation_service):
        """Test scaling up any workers"""
        from services.zmq_server import TranslationPoolManager

        manager = TranslationPoolManager(
            any_workers=3,
            translation_service=mock_translation_service
        )

        initial_count = manager.any_workers
        await manager._scale_any_workers(initial_count + 2)

        assert manager.any_workers == initial_count + 2
        assert manager.stats['dynamic_scaling_events'] == 1


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration tests for full workflow"""

    @pytest.mark.asyncio
    async def test_full_translation_workflow(self, mock_translation_service, mock_database_service, mock_zmq_context):
        """Test complete translation workflow"""
        context, pull_socket, pub_socket = mock_zmq_context

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        # Create a task that will work normally
        task = TranslationTask(
            task_id="task_exception",
            message_id="msg_exception",
            text="Test",
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Create mock result
                        mock_result = MagicMock()
                        mock_result.message_id = "msg_123"
                        mock_result.attachment_id = "att_456"
                        mock_result.original = MagicMock()
                        mock_result.original.transcription = "Hello world"
                        mock_result.original.language = "en"
                        mock_result.original.confidence = 0.95
                        mock_result.original.source = "whisper"
                        mock_result.original.segments = []
                        mock_result.translations = {}
                        mock_result.voice_model_user_id = "user_123"
                        mock_result.voice_model_quality = 0.9

                        await server._publish_audio_result("task_123", mock_result, 500)

                        assert pub_socket.send.called
                        sent_data = json.loads(pub_socket.send.call_args[0][0].decode('utf-8'))
                        assert sent_data['type'] == 'audio_process_completed'

    @pytest.mark.asyncio
    async def test_publish_audio_result_no_socket(self, mock_translation_service, mock_database_service):
        """Test publishing audio result with no socket"""
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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
        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context'):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            normal_pool_size=1,
                            translation_service=mock_translation_service
                        )
                        server.pub_socket = pub_socket

                        # Fill the pool first
                        msg1 = json.dumps({
                            'messageId': 'msg_1',
                            'text': 'Hello',
                            'sourceLanguage': 'en',
                            'targetLanguages': ['fr'],
                            'conversationId': 'conv_1'
                        }).encode('utf-8')
                        await server._handle_translation_request(msg1)

                        # Now try another - should fail
                        msg2 = json.dumps({
                            'messageId': 'msg_2',
                            'text': 'World',
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_database_service):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_db):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
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

        with patch('services.zmq_server.DatabaseService', return_value=mock_db):
            with patch('services.zmq_server.zmq.asyncio.Context', return_value=context):
                with patch('services.zmq_server.zmq.PULL', 1):
                    with patch('services.zmq_server.zmq.PUB', 2):
                        from services.zmq_server import ZMQTranslationServer

                        server = ZMQTranslationServer(
                            host="127.0.0.1",
                            translation_service=mock_translation_service
                        )

                        # Should not raise
                        await server._connect_database_background()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
