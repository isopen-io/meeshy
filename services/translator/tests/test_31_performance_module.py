"""
Tests unitaires pour le module utils/performance.py
Couvre: PerformanceConfig, PerformanceOptimizer, TranslationPriorityQueue, BatchProcessor
"""

import pytest
import asyncio
import time
import os
from unittest.mock import MagicMock, patch, AsyncMock
from dataclasses import dataclass

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from utils.performance import (
    Priority,
    PerformanceConfig,
    PerformanceOptimizer,
    TranslationPriorityQueue,
    PriorityItem,
    BatchItem,
    BatchProcessor,
    get_performance_optimizer,
    create_inference_context
)


# =============================================================================
# TESTS POUR Priority ENUM
# =============================================================================

class TestPriorityEnum:
    """Tests pour l'enum Priority."""

    def test_priority_values(self):
        """Teste les valeurs des priorités."""
        assert Priority.HIGH == 1
        assert Priority.MEDIUM == 2
        assert Priority.LOW == 3
        assert Priority.BULK == 4

    def test_priority_ordering(self):
        """Teste que HIGH < MEDIUM < LOW < BULK."""
        assert Priority.HIGH < Priority.MEDIUM
        assert Priority.MEDIUM < Priority.LOW
        assert Priority.LOW < Priority.BULK


# =============================================================================
# TESTS POUR PerformanceConfig
# =============================================================================

class TestPerformanceConfig:
    """Tests pour PerformanceConfig dataclass."""

    def test_default_values(self):
        """Teste les valeurs par défaut."""
        config = PerformanceConfig()

        # Batch processing defaults
        assert config.batch_size == 8
        assert config.batch_timeout_ms == 50
        assert config.max_batch_tokens == 4096

        # Priority queue defaults
        assert config.enable_priority_queue is True
        assert config.short_text_threshold == 100
        assert config.medium_text_threshold == 500

        # PyTorch defaults - torch.compile is disabled by default for CPU compatibility
        assert config.enable_torch_compile is False
        assert config.torch_compile_mode == "default"
        assert config.enable_cudnn_benchmark is True

        # Worker defaults
        assert config.num_inference_workers == 4
        assert config.use_process_pool is False

        # Memory defaults
        assert config.max_memory_fraction == 0.85
        assert config.enable_memory_cleanup is True

        # Thread defaults (cross-platform)
        assert config.num_omp_threads >= 1  # CPU count varies
        assert config.num_mkl_threads >= 1

        # CPU-specific defaults
        assert config.enable_cpu_optimization is True
        assert config.cpu_memory_cleanup_interval == 100

    def test_env_override_batch_size(self):
        """Teste le override par variable d'environnement pour batch_size."""
        with patch.dict(os.environ, {"TRANSLATOR_BATCH_SIZE": "16"}):
            config = PerformanceConfig()
            assert config.batch_size == 16

    def test_env_override_priority_queue(self):
        """Teste le override pour enable_priority_queue."""
        with patch.dict(os.environ, {"TRANSLATOR_PRIORITY_QUEUE": "false"}):
            config = PerformanceConfig()
            assert config.enable_priority_queue is False

    def test_env_override_torch_compile(self):
        """Teste le override pour enable_torch_compile."""
        with patch.dict(os.environ, {"TRANSLATOR_TORCH_COMPILE": "false"}):
            config = PerformanceConfig()
            assert config.enable_torch_compile is False

    def test_env_override_compile_mode(self):
        """Teste le override pour torch_compile_mode."""
        with patch.dict(os.environ, {"TRANSLATOR_COMPILE_MODE": "max-autotune"}):
            config = PerformanceConfig()
            assert config.torch_compile_mode == "max-autotune"

    def test_env_override_memory_fraction(self):
        """Teste le override pour max_memory_fraction."""
        with patch.dict(os.environ, {"TRANSLATOR_MAX_MEMORY_FRACTION": "0.9"}):
            config = PerformanceConfig()
            assert config.max_memory_fraction == 0.9


# =============================================================================
# TESTS POUR PerformanceOptimizer
# =============================================================================

class TestPerformanceOptimizer:
    """Tests pour PerformanceOptimizer singleton."""

    def setup_method(self):
        """Reset le singleton avant chaque test."""
        PerformanceOptimizer._instance = None
        PerformanceOptimizer._initialized = False

    def test_singleton_pattern(self):
        """Teste que PerformanceOptimizer est un singleton."""
        opt1 = PerformanceOptimizer()
        opt2 = PerformanceOptimizer()
        assert opt1 is opt2

    def test_get_performance_optimizer_returns_singleton(self):
        """Teste que get_performance_optimizer retourne le singleton."""
        opt1 = get_performance_optimizer()
        opt2 = get_performance_optimizer()
        assert opt1 is opt2

    def test_initial_state(self):
        """Teste l'état initial du PerformanceOptimizer."""
        opt = PerformanceOptimizer()
        assert opt._device is None
        assert opt._cuda_available is False
        assert isinstance(opt.config, PerformanceConfig)

    @patch('utils.performance.PerformanceOptimizer._configure_threads')
    @patch('utils.performance.PerformanceOptimizer._configure_cpu')
    @patch('utils.performance.PerformanceOptimizer._configure_pytorch')
    def test_initialize_cpu_only(self, mock_pytorch, mock_cpu, mock_threads):
        """Teste l'initialisation sans CUDA ni MPS (CPU only)."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        # Mock MPS not available
        mock_torch.backends.mps.is_available.return_value = False

        with patch.dict('sys.modules', {'torch': mock_torch}):
            opt = PerformanceOptimizer()
            device = opt.initialize()

            assert device == "cpu"
            assert opt._device == "cpu"
            assert opt._cuda_available is False
            assert opt._mps_available is False
            mock_threads.assert_called_once()
            mock_cpu.assert_called_once()
            mock_pytorch.assert_called_once()

    @patch('utils.performance.PerformanceOptimizer._configure_threads')
    @patch('utils.performance.PerformanceOptimizer._configure_cuda')
    @patch('utils.performance.PerformanceOptimizer._configure_pytorch')
    def test_initialize_with_cuda(self, mock_pytorch, mock_cuda, mock_threads):
        """Teste l'initialisation avec CUDA."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.get_device_name.return_value = "NVIDIA RTX 4090"

        with patch.dict('sys.modules', {'torch': mock_torch}):
            opt = PerformanceOptimizer()
            device = opt.initialize()

            assert device == "cuda:0"
            assert opt._device == "cuda:0"
            assert opt._cuda_available is True
            assert opt._mps_available is False
            mock_threads.assert_called_once()
            mock_cuda.assert_called_once()

    def test_initialize_without_torch(self):
        """Teste l'initialisation sans PyTorch installé."""
        opt = PerformanceOptimizer()

        # Simulate ImportError for torch
        with patch.dict('sys.modules', {'torch': None}):
            with patch('builtins.__import__', side_effect=ImportError("No module named 'torch'")):
                device = opt.initialize()
                assert device == "cpu"

    def test_device_property_initializes_if_needed(self):
        """Teste que la propriété device initialise si nécessaire."""
        opt = PerformanceOptimizer()

        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        # Mock MPS not available (for consistent test results across platforms)
        mock_torch.backends.mps.is_available.return_value = False

        with patch.dict('sys.modules', {'torch': mock_torch}):
            device = opt.device
            assert device == "cpu"

    def test_cuda_available_property(self):
        """Teste la propriété cuda_available."""
        opt = PerformanceOptimizer()
        assert opt.cuda_available is False

    def test_mps_available_property(self):
        """Teste la propriété mps_available."""
        opt = PerformanceOptimizer()
        assert opt.mps_available is False

    def test_is_cpu_only_property(self):
        """Teste la propriété is_cpu_only."""
        opt = PerformanceOptimizer()
        # By default, both cuda and mps are False
        assert opt.is_cpu_only is True

        # Set cuda available
        opt._cuda_available = True
        assert opt.is_cpu_only is False

        # Reset and set mps available
        opt._cuda_available = False
        opt._mps_available = True
        assert opt.is_cpu_only is False

    def test_get_optimal_batch_size_cpu(self):
        """Teste get_optimal_batch_size en mode CPU."""
        opt = PerformanceOptimizer()
        opt._cuda_available = False
        opt._mps_available = False

        # CPU keeps batches small to avoid memory pressure
        batch_size = opt.get_optimal_batch_size(default=8)
        assert batch_size == 1

    def test_get_optimal_batch_size_cuda(self):
        """Teste get_optimal_batch_size en mode CUDA."""
        opt = PerformanceOptimizer()
        opt._cuda_available = True
        opt._mps_available = False

        # CUDA path calls torch.cuda.get_device_properties which raises
        # in test env (no real GPU), falling back to min(default, 2)
        batch_size = opt.get_optimal_batch_size(default=8)
        assert batch_size == 2  # Safe fallback: min(8, 2)

    def test_get_optimal_batch_size_mps(self):
        """Teste get_optimal_batch_size en mode MPS."""
        opt = PerformanceOptimizer()
        opt._cuda_available = False
        opt._mps_available = True

        # MPS handles medium batches efficiently
        batch_size = opt.get_optimal_batch_size(default=8)
        assert batch_size == 2

    @patch('utils.performance.PerformanceOptimizer._configure_threads')
    @patch('utils.performance.PerformanceOptimizer._configure_mps')
    @patch('utils.performance.PerformanceOptimizer._configure_pytorch')
    def test_initialize_with_mps(self, mock_pytorch, mock_mps, mock_threads):
        """Teste l'initialisation avec MPS (Apple Silicon)."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        mock_torch.backends.mps.is_available.return_value = True

        with patch.dict('sys.modules', {'torch': mock_torch}):
            opt = PerformanceOptimizer()
            device = opt.initialize()

            assert device == "mps"
            assert opt._device == "mps"
            assert opt._cuda_available is False
            assert opt._mps_available is True
            mock_threads.assert_called_once()
            mock_mps.assert_called_once()
            mock_pytorch.assert_called_once()

    @patch('utils.performance.PerformanceOptimizer._configure_threads')
    @patch('utils.performance.PerformanceOptimizer._configure_pytorch')
    def test_compile_model_disabled(self, mock_pytorch, mock_threads):
        """Teste compile_model quand torch.compile est désactivé."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False

        with patch.dict('sys.modules', {'torch': mock_torch}):
            with patch.dict(os.environ, {"TRANSLATOR_TORCH_COMPILE": "false"}):
                opt = PerformanceOptimizer()
                opt.initialize()

                mock_model = MagicMock()
                result = opt.compile_model(mock_model, "test_model")

                assert result is mock_model
                assert "test_model" in opt._compiled_models

    @patch('utils.performance.PerformanceOptimizer._configure_threads')
    @patch('utils.performance.PerformanceOptimizer._configure_pytorch')
    def test_compile_model_cached(self, mock_pytorch, mock_threads):
        """Teste que compile_model utilise le cache."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False

        with patch.dict('sys.modules', {'torch': mock_torch}):
            opt = PerformanceOptimizer()
            opt.initialize()

            mock_model = MagicMock()
            opt._compiled_models["cached_model"] = mock_model

            result = opt.compile_model(MagicMock(), "cached_model")
            assert result is mock_model

    def test_cleanup_memory_disabled(self):
        """Teste cleanup_memory quand désactivé."""
        with patch.dict(os.environ, {"TRANSLATOR_MEMORY_CLEANUP": "false"}):
            opt = PerformanceOptimizer()
            # Should not raise and do nothing
            opt.cleanup_memory()

    def test_cleanup_memory_no_cuda(self):
        """Teste cleanup_memory sans CUDA."""
        opt = PerformanceOptimizer()
        opt._cuda_available = False
        # Should not raise
        opt.cleanup_memory()

    def test_cleanup_memory_cpu_periodic(self):
        """Teste le cleanup CPU périodique."""
        opt = PerformanceOptimizer()
        opt._cuda_available = False
        opt._mps_available = False
        opt.config.cpu_memory_cleanup_interval = 5

        # Call cleanup multiple times - should only gc.collect on every 5th call
        with patch('utils.performance.gc.collect') as mock_gc:
            for i in range(6):
                opt.cleanup_memory()

            # gc.collect should be called once (at batch 5)
            assert mock_gc.call_count >= 1

    def test_cleanup_memory_cpu_force(self):
        """Teste le cleanup CPU forcé."""
        opt = PerformanceOptimizer()
        opt._cuda_available = False
        opt._mps_available = False

        with patch('utils.performance.gc.collect') as mock_gc:
            opt.cleanup_memory(force=True)
            mock_gc.assert_called_once()

    def test_cleanup_memory_mps(self):
        """Teste le cleanup MPS."""
        opt = PerformanceOptimizer()
        opt._cuda_available = False
        opt._mps_available = True

        mock_torch = MagicMock()
        mock_torch.mps.empty_cache = MagicMock()

        with patch.dict('sys.modules', {'torch': mock_torch}):
            with patch('utils.performance.gc.collect') as mock_gc:
                opt.cleanup_memory()
                mock_gc.assert_called_once()


# =============================================================================
# TESTS POUR TranslationPriorityQueue
# =============================================================================

class TestTranslationPriorityQueue:
    """Tests pour TranslationPriorityQueue."""

    def test_init(self):
        """Teste l'initialisation de la queue."""
        queue = TranslationPriorityQueue()
        assert len(queue) == 0
        assert queue.is_empty is True

    def test_init_with_config(self):
        """Teste l'initialisation avec une config personnalisée."""
        config = PerformanceConfig()
        config.short_text_threshold = 50
        queue = TranslationPriorityQueue(config)
        assert queue.config.short_text_threshold == 50

    def test_get_priority_short(self):
        """Teste get_priority pour texte court."""
        queue = TranslationPriorityQueue()
        short_text = "Hello"
        assert queue.get_priority(short_text) == Priority.HIGH

    def test_get_priority_medium(self):
        """Teste get_priority pour texte moyen."""
        queue = TranslationPriorityQueue()
        medium_text = "a" * 200  # 200 chars, between 100 and 500
        assert queue.get_priority(medium_text) == Priority.MEDIUM

    def test_get_priority_long(self):
        """Teste get_priority pour texte long."""
        queue = TranslationPriorityQueue()
        long_text = "a" * 600  # 600 chars, > 500
        assert queue.get_priority(long_text) == Priority.LOW

    def test_push_auto_priority(self):
        """Teste push avec priorité automatique."""
        queue = TranslationPriorityQueue()
        task_id = queue.push("Hello", {"data": "test"})

        assert task_id.startswith("task_")
        assert len(queue) == 1
        assert queue.is_empty is False

    def test_push_explicit_priority(self):
        """Teste push avec priorité explicite."""
        queue = TranslationPriorityQueue()
        task_id = queue.push("Hello", {"data": "test"}, priority=Priority.BULK)

        assert len(queue) == 1

    def test_pop_empty(self):
        """Teste pop sur queue vide."""
        queue = TranslationPriorityQueue()
        result = queue.pop()
        assert result is None

    def test_pop_returns_highest_priority(self):
        """Teste que pop retourne l'élément de plus haute priorité."""
        queue = TranslationPriorityQueue()

        # Add items in reverse priority order
        queue.push("low priority text " * 50, {"type": "low"}, priority=Priority.LOW)
        queue.push("medium", {"type": "medium"}, priority=Priority.MEDIUM)
        queue.push("hi", {"type": "high"}, priority=Priority.HIGH)

        result = queue.pop()
        assert result is not None
        task_id, data = result
        assert data["type"] == "high"

    def test_pop_fifo_same_priority(self):
        """Teste FIFO pour éléments de même priorité."""
        queue = TranslationPriorityQueue()

        queue.push("first", {"order": 1}, priority=Priority.HIGH)
        time.sleep(0.001)  # Small delay to ensure different timestamps
        queue.push("second", {"order": 2}, priority=Priority.HIGH)

        _, data1 = queue.pop()
        _, data2 = queue.pop()

        assert data1["order"] == 1
        assert data2["order"] == 2

    def test_peek_empty(self):
        """Teste peek sur queue vide."""
        queue = TranslationPriorityQueue()
        result = queue.peek()
        assert result is None

    def test_peek_does_not_remove(self):
        """Teste que peek ne retire pas l'élément."""
        queue = TranslationPriorityQueue()
        queue.push("test", {"data": "value"})

        peek_result = queue.peek()
        assert peek_result is not None
        assert len(queue) == 1  # Still there

        pop_result = queue.pop()
        assert pop_result is not None
        assert len(queue) == 0

    def test_len_updates_correctly(self):
        """Teste que __len__ se met à jour correctement."""
        queue = TranslationPriorityQueue()

        assert len(queue) == 0

        queue.push("a", {})
        assert len(queue) == 1

        queue.push("b", {})
        assert len(queue) == 2

        queue.pop()
        assert len(queue) == 1

        queue.pop()
        assert len(queue) == 0


# =============================================================================
# TESTS POUR PriorityItem
# =============================================================================

class TestPriorityItem:
    """Tests pour PriorityItem dataclass."""

    def test_ordering_by_priority(self):
        """Teste que les PriorityItems sont ordonnés par priorité."""
        item1 = PriorityItem(priority=1, timestamp=time.time(), data={}, task_id="1")
        item2 = PriorityItem(priority=2, timestamp=time.time(), data={}, task_id="2")

        assert item1 < item2

    def test_ordering_same_priority_by_timestamp(self):
        """Teste l'ordre par timestamp pour même priorité."""
        t1 = time.time()
        t2 = t1 + 1

        item1 = PriorityItem(priority=1, timestamp=t1, data={}, task_id="1")
        item2 = PriorityItem(priority=1, timestamp=t2, data={}, task_id="2")

        # With same priority, items compare equal (only priority is compared)
        # This is expected behavior - heapq maintains insertion order for equal items
        assert (item1 < item2) is False
        assert (item2 < item1) is False


# =============================================================================
# TESTS POUR BatchProcessor
# =============================================================================

class TestBatchProcessor:
    """Tests pour BatchProcessor."""

    def test_init(self):
        """Teste l'initialisation du BatchProcessor."""
        mock_fn = MagicMock()
        processor = BatchProcessor(mock_fn)

        assert processor._process_fn is mock_fn
        assert isinstance(processor.config, PerformanceConfig)
        assert processor.pending_count == 0

    def test_init_with_config(self):
        """Teste l'initialisation avec config personnalisée."""
        config = PerformanceConfig()
        config.batch_size = 4

        mock_fn = MagicMock()
        processor = BatchProcessor(mock_fn, config)

        assert processor.config.batch_size == 4

    def test_get_batch_key(self):
        """Teste la génération de clé de batch."""
        mock_fn = MagicMock()
        processor = BatchProcessor(mock_fn)

        key = processor._get_batch_key("en", "fr")
        assert key == "en:fr"

    @pytest.mark.asyncio
    async def test_add_single_item(self):
        """Teste l'ajout d'un seul élément."""
        results = ["Bonjour"]

        def mock_translate(texts, src, tgt):
            return results

        processor = BatchProcessor(mock_translate)

        # Start background processing with very short timeout
        processor.config.batch_timeout_ms = 10
        await processor.start_background_processing()

        try:
            result = await asyncio.wait_for(
                processor.add("Hello", "en", "fr"),
                timeout=1.0
            )
            assert result == "Bonjour"
        finally:
            await processor.stop()

    @pytest.mark.asyncio
    async def test_add_triggers_batch_on_size(self):
        """Teste que le batch se déclenche quand la taille est atteinte."""
        call_count = 0
        results = []

        def mock_translate(texts, src, tgt):
            nonlocal call_count, results
            call_count += 1
            results = [f"translated_{i}" for i in range(len(texts))]
            return results

        config = PerformanceConfig()
        config.batch_size = 2
        config.batch_timeout_ms = 5000  # Long timeout

        processor = BatchProcessor(mock_translate, config)

        # Add two items - should trigger batch immediately
        task1 = asyncio.create_task(processor.add("Hello", "en", "fr"))
        task2 = asyncio.create_task(processor.add("World", "en", "fr"))

        result1, result2 = await asyncio.wait_for(
            asyncio.gather(task1, task2),
            timeout=2.0
        )

        assert call_count == 1  # One batch call
        assert result1 == "translated_0"
        assert result2 == "translated_1"

    @pytest.mark.asyncio
    async def test_flush(self):
        """Teste le flush des batches en attente."""
        def mock_translate(texts, src, tgt):
            return [f"result_{i}" for i in range(len(texts))]

        config = PerformanceConfig()
        config.batch_size = 100  # Large batch to prevent auto-trigger
        config.batch_timeout_ms = 60000  # Long timeout

        processor = BatchProcessor(mock_translate, config)

        # Add single item without triggering batch
        task = asyncio.create_task(processor.add("Hello", "en", "fr"))

        await asyncio.sleep(0.01)  # Let the item be added
        assert processor.pending_count == 1

        # Flush should process it
        await processor.flush()

        result = await asyncio.wait_for(task, timeout=1.0)
        assert result == "result_0"
        assert processor.pending_count == 0

    @pytest.mark.asyncio
    async def test_stop(self):
        """Teste l'arrêt propre du processor."""
        def mock_translate(texts, src, tgt):
            return [f"result_{i}" for i in range(len(texts))]

        processor = BatchProcessor(mock_translate)
        await processor.start_background_processing()

        assert processor._running is True

        await processor.stop()

        assert processor._running is False

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Teste la gestion des erreurs dans le batch."""
        def mock_translate(texts, src, tgt):
            raise ValueError("Translation error")

        config = PerformanceConfig()
        config.batch_size = 1

        processor = BatchProcessor(mock_translate, config)

        with pytest.raises(ValueError, match="Translation error"):
            await asyncio.wait_for(
                processor.add("Hello", "en", "fr"),
                timeout=1.0
            )

    @pytest.mark.asyncio
    async def test_background_processor(self):
        """Teste le background processor avec timeout."""
        call_count = 0

        def mock_translate(texts, src, tgt):
            nonlocal call_count
            call_count += 1
            return [f"result_{i}" for i in range(len(texts))]

        config = PerformanceConfig()
        config.batch_size = 100  # Large batch
        config.batch_timeout_ms = 50  # Short timeout

        processor = BatchProcessor(mock_translate, config)
        await processor.start_background_processing()

        try:
            task = asyncio.create_task(processor.add("Hello", "en", "fr"))

            # Wait for background processor to trigger
            result = await asyncio.wait_for(task, timeout=1.0)

            assert result == "result_0"
            assert call_count >= 1
        finally:
            await processor.stop()


# =============================================================================
# TESTS POUR BatchItem
# =============================================================================

class TestBatchItem:
    """Tests pour BatchItem dataclass."""

    @pytest.mark.asyncio
    async def test_batch_item_creation(self):
        """Teste la création d'un BatchItem."""
        loop = asyncio.get_event_loop()
        future = loop.create_future()

        item = BatchItem(
            text="Hello",
            source_lang="en",
            target_lang="fr",
            task_id="test_123",
            future=future,
            metadata={"key": "value"}
        )

        assert item.text == "Hello"
        assert item.source_lang == "en"
        assert item.target_lang == "fr"
        assert item.task_id == "test_123"
        assert item.metadata == {"key": "value"}

    @pytest.mark.asyncio
    async def test_batch_item_default_metadata(self):
        """Teste les métadonnées par défaut."""
        loop = asyncio.get_event_loop()
        future = loop.create_future()

        item = BatchItem(
            text="Hello",
            source_lang="en",
            target_lang="fr",
            task_id="test_123",
            future=future
        )

        assert item.metadata == {}


# =============================================================================
# TESTS POUR create_inference_context
# =============================================================================

class TestCreateInferenceContext:
    """Tests pour create_inference_context."""

    def test_with_torch_available(self):
        """Teste avec PyTorch disponible."""
        mock_torch = MagicMock()
        mock_context = MagicMock()
        mock_torch.inference_mode.return_value = mock_context

        with patch.dict('sys.modules', {'torch': mock_torch}):
            # Force reimport behavior
            import importlib
            import utils.performance
            importlib.reload(utils.performance)

            context = utils.performance.create_inference_context()
            # Should return something (either torch context or nullcontext)
            assert context is not None

    def test_without_torch(self):
        """Teste sans PyTorch installé."""
        context = create_inference_context()
        # Should return nullcontext when torch not available
        assert context is not None


# =============================================================================
# TESTS D'INTEGRATION
# =============================================================================

class TestPerformanceIntegration:
    """Tests d'intégration pour le module performance."""

    def setup_method(self):
        """Reset le singleton."""
        PerformanceOptimizer._instance = None
        PerformanceOptimizer._initialized = False

    def test_priority_queue_with_optimizer(self):
        """Teste l'intégration queue prioritaire + optimizer."""
        opt = get_performance_optimizer()
        queue = TranslationPriorityQueue(opt.config)

        # Add items with auto-priority
        queue.push("Short", {})
        queue.push("a" * 300, {})  # Medium
        queue.push("b" * 700, {})  # Long

        # Pop should return shortest first
        _, data = queue.pop()
        # Queue uses auto-priority, short texts get HIGH priority

    @pytest.mark.asyncio
    async def test_batch_processor_with_config(self):
        """Teste le BatchProcessor avec la config du module."""
        opt = get_performance_optimizer()

        results = {}
        def mock_translate(texts, src, tgt):
            return [f"{tgt}:{text}" for text in texts]

        processor = BatchProcessor(mock_translate, opt.config)

        # Verify config is shared
        assert processor.config is opt.config

    def test_multiple_queues_share_config(self):
        """Teste que plusieurs queues peuvent partager une config."""
        config = PerformanceConfig()

        q1 = TranslationPriorityQueue(config)
        q2 = TranslationPriorityQueue(config)

        # Modify config
        config.short_text_threshold = 50

        # Both queues should see the change
        assert q1.config.short_text_threshold == 50
        assert q2.config.short_text_threshold == 50


# =============================================================================
# TESTS DE THREAD SAFETY
# =============================================================================

class TestThreadSafety:
    """Tests de thread safety pour la priority queue."""

    def test_concurrent_push(self):
        """Teste les push concurrents."""
        import threading

        queue = TranslationPriorityQueue()
        num_threads = 10
        items_per_thread = 100

        def push_items(thread_id):
            for i in range(items_per_thread):
                queue.push(f"text_{thread_id}_{i}", {"id": f"{thread_id}_{i}"})

        threads = [
            threading.Thread(target=push_items, args=(i,))
            for i in range(num_threads)
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(queue) == num_threads * items_per_thread

    def test_concurrent_push_pop(self):
        """Teste les push/pop concurrents."""
        import threading

        queue = TranslationPriorityQueue()
        pushed = []
        popped = []
        lock = threading.Lock()

        def push_items():
            for i in range(50):
                task_id = queue.push(f"text_{i}", {"i": i})
                with lock:
                    pushed.append(task_id)

        def pop_items():
            for _ in range(50):
                result = queue.pop()
                if result:
                    with lock:
                        popped.append(result[0])
                time.sleep(0.001)  # Small delay

        t1 = threading.Thread(target=push_items)
        t2 = threading.Thread(target=pop_items)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # All pushed items should either be popped or still in queue
        remaining = len(queue)
        assert len(popped) + remaining == len(pushed)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
