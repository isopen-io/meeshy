#!/usr/bin/env python3
"""
Test 34 — ZMQ pool: connection_manager / translation_processor / zmq_pool_manager
Targeted files (all ≥92% line+branch):
  src/services/zmq_pool/connection_manager.py
  src/services/zmq_pool/translation_processor.py
  src/services/zmq_pool/zmq_pool_manager.py

Behaviour-focused tests; no 1:1 mapping to implementation.
"""
import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


# ─── shared factory ───────────────────────────────────────────────────────────


def _task(task_id: str = "t1", text: str = "hello world", conv_id: str = "c1", **kw):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id="m1",
        text=text,
        source_language="en",
        target_languages=kw.pop("target_languages", ["fr"]),
        conversation_id=conv_id,
        **kw,
    )


# ─── ConnectionManager ────────────────────────────────────────────────────────


class TestConnectionManagerInit:
    def test_default_queues_have_correct_maxsizes(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        assert cm.normal_pool.maxsize == 10000
        assert cm.any_pool.maxsize == 10000
        assert cm.fast_pool.maxsize == 5000

    def test_custom_pool_sizes(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(normal_pool_size=50, any_pool_size=80, fast_pool_size=30)
        assert cm.normal_pool.maxsize == 50
        assert cm.any_pool.maxsize == 80
        assert cm.fast_pool.maxsize == 30

    def test_batching_disabled_via_env(self, monkeypatch):
        monkeypatch.setenv("TRANSLATOR_BATCH_ENABLED", "false")
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        assert cm.enable_batching is False

    def test_stats_initialised_to_zero(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        assert cm.stats["pool_full_rejections"] == 0
        assert cm.stats["batches_created"] == 0
        assert cm.stats["fast_track_count"] == 0

    def test_batch_flush_task_starts_as_none(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        assert cm._batch_flush_task is None


class TestConnectionManagerStartStop:
    async def test_start_creates_flush_task_when_batching_on(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        assert cm.enable_batching is True
        await cm.start()
        assert cm._batch_flush_task is not None
        cm._batch_flush_task.cancel()
        try:
            await cm._batch_flush_task
        except asyncio.CancelledError:
            pass

    async def test_start_no_flush_task_when_batching_off(self, monkeypatch):
        monkeypatch.setenv("TRANSLATOR_BATCH_ENABLED", "false")
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        await cm.start()
        assert cm._batch_flush_task is None

    async def test_stop_cancels_active_flush_task(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        await cm.start()
        await cm.stop()
        assert cm._batch_flush_task is None or cm._batch_flush_task.done()

    async def test_stop_without_flush_task_is_safe(self, monkeypatch):
        monkeypatch.setenv("TRANSLATOR_BATCH_ENABLED", "false")
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        await cm.stop()  # must not raise


class TestConnectionManagerEnqueueTask:
    async def test_short_text_goes_to_fast_pool(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        # performance module available → priority queue enabled by default
        cm.enable_priority_queue = True
        cm.short_text_threshold = 100
        result = await cm.enqueue_task(_task(text="hi"))  # 2 chars < 100
        assert result is True
        assert cm.fast_pool.qsize() == 1
        assert cm.stats["fast_track_count"] == 1

    async def test_fast_pool_full_falls_through_to_batching(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(fast_pool_size=1)
        cm.enable_priority_queue = True
        cm.short_text_threshold = 100
        await cm.fast_pool.put(_task(text="x"))  # fill the pool
        result = await cm.enqueue_task(_task(text="hi"))
        assert result is True
        # Short text fell through to batch accumulator
        assert cm.fast_pool.qsize() == 1  # original still there

    async def test_batch_accumulation_keeps_task_in_accumulator(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        cm.enable_priority_queue = False
        cm.enable_batching = True
        result = await cm.enqueue_task(_task())
        assert result is True
        assert cm.normal_pool.qsize() == 0  # not yet flushed

    async def test_immediate_flush_at_batch_max_size(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        cm.enable_priority_queue = False
        cm.enable_batching = True
        cm.batch_max_size = 2
        # Two tasks with same batch key trigger an immediate flush
        await cm.enqueue_task(_task(task_id="t1"))
        await cm.enqueue_task(_task(task_id="t2"))
        # Batch should have been flushed to normal_pool
        assert cm.normal_pool.qsize() == 1

    async def test_fallback_enqueue_when_batching_off(self, monkeypatch):
        monkeypatch.setenv("TRANSLATOR_BATCH_ENABLED", "false")
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        cm.enable_priority_queue = False
        result = await cm.enqueue_task(_task())
        assert result is True
        assert cm.normal_pool.qsize() == 1

    async def test_exception_during_enqueue_returns_false(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        cm.enable_priority_queue = False
        # Make the batch lock raise on __aenter__
        cm._batch_lock = MagicMock()
        cm._batch_lock.__aenter__ = AsyncMock(side_effect=RuntimeError("lock broken"))
        cm._batch_lock.__aexit__ = AsyncMock(return_value=False)
        result = await cm.enqueue_task(_task())
        assert result is False


class TestConnectionManagerEnqueueSingleTask:
    async def test_any_conversation_goes_to_any_pool(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        result = await cm._enqueue_single_task(_task(conv_id="any"))
        assert result is True
        assert cm.any_pool.qsize() == 1

    async def test_any_pool_full_rejects_task(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(any_pool_size=1)
        await cm.any_pool.put(_task(conv_id="any"))
        result = await cm._enqueue_single_task(_task(conv_id="any"))
        assert result is False
        assert cm.stats["pool_full_rejections"] == 1

    async def test_normal_conversation_goes_to_normal_pool(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        result = await cm._enqueue_single_task(_task(conv_id="room1"))
        assert result is True
        assert cm.normal_pool.qsize() == 1

    async def test_normal_pool_full_rejects_task(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(normal_pool_size=1)
        await cm.normal_pool.put(_task(conv_id="room1"))
        result = await cm._enqueue_single_task(_task(conv_id="room1"))
        assert result is False
        assert cm.stats["pool_full_rejections"] == 1


class TestConnectionManagerEnqueueBatch:
    async def test_empty_batch_is_no_op(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        await cm._enqueue_batch([])
        assert cm.normal_pool.qsize() == 0
        assert cm.stats["batches_created"] == 0

    async def test_any_batch_goes_to_any_pool(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        tasks = [_task(task_id=f"t{i}", conv_id="any") for i in range(3)]
        await cm._enqueue_batch(tasks)
        assert cm.any_pool.qsize() == 1
        assert cm.stats["batches_created"] == 1

    async def test_normal_batch_goes_to_normal_pool(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        tasks = [_task(task_id=f"t{i}", conv_id="c1") for i in range(3)]
        await cm._enqueue_batch(tasks)
        assert cm.normal_pool.qsize() == 1
        assert cm.stats["batches_created"] == 1

    async def test_any_pool_full_batch_not_counted(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(any_pool_size=1)
        await cm.any_pool.put(_task(conv_id="any"))  # fill pool
        tasks = [_task(task_id=f"t{i}", conv_id="any") for i in range(2)]
        await cm._enqueue_batch(tasks)
        assert cm.stats["batches_created"] == 0

    async def test_normal_pool_full_batch_not_counted(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(normal_pool_size=1)
        await cm.normal_pool.put(_task(conv_id="c1"))  # fill pool
        tasks = [_task(task_id=f"t{i}", conv_id="c1") for i in range(2)]
        await cm._enqueue_batch(tasks)
        assert cm.stats["batches_created"] == 0


class TestConnectionManagerBatchKey:
    def test_key_contains_source_and_sorted_targets_and_model(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        task = _task(target_languages=["fr", "es"])
        key = cm._get_batch_key(task)
        assert "en" in key
        assert "es" in key
        assert "fr" in key

    def test_different_target_orders_produce_same_key(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        t1 = _task(target_languages=["fr", "es"])
        t2 = _task(target_languages=["es", "fr"])
        assert cm._get_batch_key(t1) == cm._get_batch_key(t2)


class TestConnectionManagerBatchFlushLoop:
    async def test_loop_flushes_accumulator_and_breaks_on_cancel(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        cm.batch_window_ms = 10
        async with cm._batch_lock:
            cm._batch_accumulator["k"] = [_task()]
        loop_task = asyncio.create_task(cm._batch_flush_loop())
        await asyncio.sleep(0.05)
        loop_task.cancel()
        try:
            await loop_task
        except asyncio.CancelledError:
            pass
        assert "k" not in cm._batch_accumulator  # flushed

    async def test_loop_survives_flush_exception(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        cm.batch_window_ms = 1
        call_count = {"n": 0}
        original_flush = cm._flush_batches

        async def flaky_flush():
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("transient error")
            await original_flush()

        cm._flush_batches = flaky_flush
        loop_task = asyncio.create_task(cm._batch_flush_loop())
        await asyncio.sleep(0.05)
        loop_task.cancel()
        try:
            await loop_task
        except asyncio.CancelledError:
            pass
        assert call_count["n"] >= 2  # survived the first error


class TestConnectionManagerFlushBatches:
    async def test_empty_accumulator_is_no_op(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        await cm._flush_batches()
        assert cm.normal_pool.qsize() == 0
        assert cm.any_pool.qsize() == 0

    async def test_all_pending_batches_flushed_and_accumulator_cleared(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        async with cm._batch_lock:
            cm._batch_accumulator["k_normal"] = [_task(conv_id="c1")]
            cm._batch_accumulator["k_any"] = [_task(conv_id="any")]
        await cm._flush_batches()
        assert cm.normal_pool.qsize() == 1
        assert cm.any_pool.qsize() == 1
        assert len(cm._batch_accumulator) == 0


class TestConnectionManagerGetStats:
    async def test_reflects_current_queue_sizes(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        await cm._enqueue_single_task(_task(conv_id="c1"))
        await cm._enqueue_single_task(_task(conv_id="any"))
        stats = cm.get_stats()
        assert stats["normal_pool_size"] == 1
        assert stats["any_pool_size"] == 1
        assert stats["fast_pool_size"] == 0

    async def test_pending_batches_counted(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        async with cm._batch_lock:
            cm._batch_accumulator["k"] = [_task(), _task()]
        stats = cm.get_stats()
        assert stats["pending_batches"] == 2


# ─── translation_processor ────────────────────────────────────────────────────


def _translation_svc(translated: str = "Bonjour"):
    svc = MagicMock()
    svc.translate_with_structure = AsyncMock(return_value={
        "translated_text": translated,
        "detected_language": "en",
        "confidence": 0.95,
        "segments_count": 1,
        "emojis_count": 0,
    })
    return svc


def _cache_svc(hit=None):
    cache = MagicMock()
    cache.get_translation = AsyncMock(return_value=hit)
    cache.set_translation = AsyncMock(return_value=None)
    return cache


class TestProcessSingleTranslation:
    async def test_translates_all_target_languages(self):
        from services.zmq_pool.translation_processor import process_single_translation
        svc = _translation_svc()
        publish = AsyncMock()
        task = _task(target_languages=["fr", "es"])
        results = await process_single_translation(task, "w1", svc, None, publish)
        assert len(results) == 2
        assert publish.await_count == 2

    async def test_per_language_error_publishes_error_result(self):
        from services.zmq_pool.translation_processor import process_single_translation
        svc = MagicMock()
        svc.translate_with_structure = AsyncMock(side_effect=RuntimeError("ml crash"))
        publish = AsyncMock()
        task = _task(target_languages=["fr"])
        results = await process_single_translation(task, "w1", svc, None, publish)
        # Error result is published but not in the results list
        assert publish.await_count == 1
        published = publish.call_args[0][1]
        # Error result has low confidence or an error field
        assert published.get("confidenceScore", 1) <= 0.1 or "error" in published

    async def test_outer_exception_returns_empty_list(self):
        from services.zmq_pool.translation_processor import process_single_translation
        publish = AsyncMock()
        task = _task(target_languages=["fr"])

        class _RaisingIterable:
            def __iter__(self):
                raise RuntimeError("target_languages iteration failed")

        # Force an exception outside the per-language try/except (the loop
        # setup itself), which only the outer try/except in
        # process_single_translation can catch.
        task.target_languages = _RaisingIterable()
        results = await process_single_translation(task, "w1", None, None, publish)
        assert results == []


class TestProcessBatchTranslation:
    async def test_empty_tasks_returns_zero(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        result = await process_batch_translation([], "w1", None, AsyncMock())
        assert result == 0

    async def test_uses_ml_translate_batch_when_available(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        svc = MagicMock()
        svc._ml_translate_batch = AsyncMock(return_value=["Bonjour", "Salut"])
        publish = AsyncMock()
        tasks = [_task(task_id=f"t{i}", text=f"text{i}") for i in range(2)]
        count = await process_batch_translation(tasks, "w1", svc, publish)
        assert count == 2
        assert publish.await_count == 2

    async def test_fallback_single_when_no_ml_translate_batch(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        svc = MagicMock(spec=["translate_with_structure"])
        svc.translate_with_structure = AsyncMock(return_value={"translated_text": "Bonjour"})
        publish = AsyncMock()
        tasks = [_task(task_id=f"t{i}") for i in range(2)]
        count = await process_batch_translation(tasks, "w1", svc, publish)
        assert count == 2

    async def test_none_service_triggers_attribute_error_publishes_errors(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        publish = AsyncMock()
        tasks = [_task()]
        count = await process_batch_translation(tasks, "w1", None, publish)
        # AttributeError on None.translate_with_structure → error published per task
        assert publish.await_count == 1
        assert count == 0

    async def test_timeout_in_ml_translate_batch_publishes_errors(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        svc = MagicMock()
        svc._ml_translate_batch = AsyncMock(side_effect=asyncio.TimeoutError())
        publish = AsyncMock()
        tasks = [_task(task_id=f"t{i}") for i in range(2)]
        count = await process_batch_translation(tasks, "w1", svc, publish)
        assert publish.await_count == 2  # one error per task

    async def test_single_fallback_timeout_publishes_errors(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        svc = MagicMock(spec=["translate_with_structure"])
        svc.translate_with_structure = AsyncMock(side_effect=asyncio.TimeoutError())
        publish = AsyncMock()
        tasks = [_task()]
        count = await process_batch_translation(tasks, "w1", svc, publish)
        assert publish.await_count == 1

    async def test_general_language_exception_publishes_errors_for_each_task(self):
        from services.zmq_pool.translation_processor import process_batch_translation
        svc = MagicMock()
        svc._ml_translate_batch = AsyncMock(side_effect=RuntimeError("crash"))
        publish = AsyncMock()
        tasks = [_task(task_id="t1"), _task(task_id="t2")]
        await process_batch_translation(tasks, "w1", svc, publish)
        assert publish.await_count == 2


class TestTranslateSingleLanguage:
    async def test_cache_hit_returns_cached_result(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        cached = {"translated_text": "Bonjour", "source_lang": "en", "model_type": "nllb"}
        cache = _cache_svc(hit=cached)
        result = await _translate_single_language(_task(), "fr", "w1", None, cache)
        assert result["fromCache"] is True
        assert result["translatedText"] == "Bonjour"

    async def test_cache_miss_calls_service_and_writes_cache(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        svc = _translation_svc()
        cache = _cache_svc(hit=None)
        result = await _translate_single_language(_task(), "fr", "w1", svc, cache)
        assert result["fromCache"] is False
        assert result["translatedText"] == "Bonjour"
        cache.set_translation.assert_awaited_once()

    async def test_no_cache_calls_service_directly(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        svc = _translation_svc()
        result = await _translate_single_language(_task(), "fr", "w1", svc, None)
        assert result["translatedText"] == "Bonjour"
        assert "error" not in result

    async def test_inference_timeout_returns_fallback_error(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        svc = MagicMock()
        # When the coroutine itself raises TimeoutError, wait_for propagates it
        svc.translate_with_structure = AsyncMock(side_effect=asyncio.TimeoutError())
        result = await _translate_single_language(_task(), "fr", "w1", svc, None)
        assert "error" in result
        assert result["confidenceScore"] == 0.1

    async def test_service_returns_none_causes_fallback_error(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        svc = MagicMock()
        svc.translate_with_structure = AsyncMock(return_value=None)
        result = await _translate_single_language(_task(), "fr", "w1", svc, None)
        assert "error" in result

    async def test_service_returns_invalid_dict_causes_fallback_error(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        svc = MagicMock()
        svc.translate_with_structure = AsyncMock(return_value={"something": "else"})
        result = await _translate_single_language(_task(), "fr", "w1", svc, None)
        assert "error" in result

    async def test_no_service_returns_fallback_placeholder(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        result = await _translate_single_language(_task(), "fr", "w1", None, None)
        assert result["modelType"] == "fallback"
        assert "error" in result
        assert result["confidenceScore"] == 0.1

    async def test_general_exception_returns_fallback(self):
        from services.zmq_pool.translation_processor import _translate_single_language
        svc = MagicMock()
        svc.translate_with_structure = AsyncMock(side_effect=RuntimeError("boom"))
        result = await _translate_single_language(_task(), "fr", "w1", svc, None)
        assert "error" in result
        assert "boom" in result["error"]


class TestCreateErrorResult:
    def test_correct_error_dict_fields(self):
        from services.zmq_pool.translation_processor import _create_error_result
        task = _task()
        result = _create_error_result(task, "es", "something failed")
        assert result["targetLanguage"] == "es"
        assert result["error"] == "something failed"
        assert result["confidenceScore"] == 0.0
        assert result["processingTime"] == 0.0
        assert "ERROR" in result["translatedText"]
        assert "something failed" in result["translatedText"]


# ─── TranslationPoolManager ───────────────────────────────────────────────────


def _make_manager(**kwargs):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        from services.zmq_pool.zmq_pool_manager import TranslationPoolManager
        return TranslationPoolManager(
            normal_pool_size=100,
            any_pool_size=100,
            normal_workers=2,
            any_workers=2,
            **kwargs,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original


class TestTranslationPoolManagerInit:
    def test_creates_required_subcomponents(self):
        mgr = _make_manager()
        assert mgr.normal_pool is not None
        assert mgr.any_pool is not None
        assert mgr.connection_manager is not None

    def test_stores_translation_service(self):
        svc = MagicMock()
        mgr = _make_manager(translation_service=svc)
        assert mgr.translation_service is svc

    def test_stats_start_at_zero(self):
        mgr = _make_manager()
        assert mgr.stats["tasks_processed"] == 0
        assert mgr.stats["translations_completed"] == 0
        assert mgr.stats["tasks_failed"] == 0

    def test_worker_count_clamped_to_env_minimum(self, monkeypatch):
        monkeypatch.setenv("NORMAL_WORKERS_MIN", "4")
        monkeypatch.setenv("ANY_WORKERS_MIN", "4")
        import services.zmq_pool.zmq_pool_manager as mgr_mod
        original = mgr_mod.CACHE_AVAILABLE
        mgr_mod.CACHE_AVAILABLE = False
        try:
            from services.zmq_pool.zmq_pool_manager import TranslationPoolManager
            mgr = TranslationPoolManager(normal_workers=1, any_workers=1)
            assert mgr.normal_pool.current_workers >= 4
        finally:
            mgr_mod.CACHE_AVAILABLE = original

    def test_cache_wired_when_available(self):
        import services.zmq_pool.zmq_pool_manager as mgr_mod
        mock_redis = MagicMock()
        mock_cache = MagicMock()
        mgr_mod.CACHE_AVAILABLE = True
        mgr_mod.get_redis_service = lambda: mock_redis
        mgr_mod.get_translation_cache_service = lambda: mock_cache
        try:
            from services.zmq_pool.zmq_pool_manager import TranslationPoolManager
            mgr = TranslationPoolManager(normal_workers=2, any_workers=2)
            assert mgr.redis_service is mock_redis
            assert mgr.translation_cache is mock_cache
        finally:
            mgr_mod.CACHE_AVAILABLE = False
            mgr_mod.__dict__.pop("get_redis_service", None)
            mgr_mod.__dict__.pop("get_translation_cache_service", None)


class TestTranslationPoolManagerEnqueueTask:
    async def test_delegates_to_connection_manager(self):
        mgr = _make_manager()
        mgr.connection_manager.enqueue_task = AsyncMock(return_value=True)
        task = _task()
        result = await mgr.enqueue_task(task)
        assert result is True
        mgr.connection_manager.enqueue_task.assert_awaited_once_with(task)


class TestTranslationPoolManagerWorkers:
    async def test_start_workers_returns_combined_task_list(self):
        mgr = _make_manager()
        dummy = asyncio.create_task(asyncio.sleep(0))
        mgr.connection_manager.start = AsyncMock()
        mgr.normal_pool.start_workers = AsyncMock(return_value=[dummy, dummy])
        mgr.any_pool.start_workers = AsyncMock(return_value=[dummy, dummy])
        tasks = await mgr.start_workers()
        assert len(tasks) == 4

    async def test_stop_workers_calls_all_subcomponent_stops(self):
        mgr = _make_manager()
        mgr.normal_pool.stop_workers = AsyncMock()
        mgr.any_pool.stop_workers = AsyncMock()
        mgr.connection_manager.stop = AsyncMock()
        await mgr.stop_workers()
        mgr.normal_pool.stop_workers.assert_awaited_once()
        mgr.any_pool.stop_workers.assert_awaited_once()
        mgr.connection_manager.stop.assert_awaited_once()


class TestTranslationPoolManagerGetNextTask:
    async def test_fast_pool_takes_priority(self):
        mgr = _make_manager()
        fast = asyncio.Queue()
        regular = asyncio.Queue()
        fast_task = _task(task_id="fast")
        regular_task = _task(task_id="regular")
        await fast.put(fast_task)
        await regular.put(regular_task)
        result = await mgr._get_next_task(fast, regular)
        assert result.task_id == "fast"

    async def test_falls_back_to_regular_pool_when_fast_empty(self):
        mgr = _make_manager()
        fast = asyncio.Queue()
        regular = asyncio.Queue()
        regular_task = _task(task_id="regular")
        await regular.put(regular_task)
        result = await mgr._get_next_task(fast, regular)
        assert result.task_id == "regular"

    async def test_returns_none_on_timeout(self):
        mgr = _make_manager()
        result = await mgr._get_next_task(asyncio.Queue(), asyncio.Queue())
        assert result is None


class TestTranslationPoolManagerProcessTask:
    async def test_single_task_processed_and_stats_updated(self):
        mgr = _make_manager()
        mgr._process_single_translation = AsyncMock()
        await mgr._process_task(_task(), "w1")
        mgr._process_single_translation.assert_awaited_once()
        assert mgr.stats["tasks_processed"] == 1

    async def test_batch_task_dispatched_to_batch_handler(self):
        mgr = _make_manager()
        mgr._process_batch_translation = AsyncMock()
        task = _task()
        task._batch_tasks = [_task(task_id="t1"), _task(task_id="t2")]
        await mgr._process_task(task, "w1")
        mgr._process_batch_translation.assert_awaited_once()

    async def test_single_from_batch_uses_first_inner_task(self):
        mgr = _make_manager()
        mgr._process_single_translation = AsyncMock()
        outer = _task(task_id="outer")
        inner = _task(task_id="inner")
        outer._batch_tasks = [inner]  # len == 1 → single path
        await mgr._process_task(outer, "w1")
        mgr._process_single_translation.assert_awaited_once_with(inner, "w1")

    async def test_exception_increments_tasks_failed(self):
        mgr = _make_manager()
        mgr._process_single_translation = AsyncMock(side_effect=RuntimeError("crash"))
        await mgr._process_task(_task(), "w1")
        assert mgr.stats["tasks_failed"] == 1

    async def test_avg_processing_time_updated_after_success(self):
        mgr = _make_manager()
        mgr._process_single_translation = AsyncMock()
        await mgr._process_task(_task(), "w1")
        assert mgr.stats["avg_processing_time"] >= 0


class TestTranslationPoolManagerProcessSingleAndBatch:
    async def test_process_single_updates_translations_completed(self):
        mgr = _make_manager()
        mgr.translation_service = _translation_svc()
        mgr._publish_translation_result = AsyncMock()
        task = _task(target_languages=["fr"])
        await mgr._process_single_translation(task, "w1")
        assert mgr.stats["translations_completed"] == 1

    async def test_process_batch_updates_translations_completed(self):
        mgr = _make_manager()
        svc = MagicMock()
        svc._ml_translate_batch = AsyncMock(return_value=["Bonjour", "Salut"])
        mgr.translation_service = svc
        mgr._publish_translation_result = AsyncMock()
        tasks = [_task(task_id=f"t{i}", text=f"text{i}") for i in range(2)]
        await mgr._process_batch_translation(tasks, "w1")
        assert mgr.stats["translations_completed"] == 2

    async def test_publish_translation_result_is_no_op(self):
        mgr = _make_manager()
        await mgr._publish_translation_result("task1", {"key": "val"}, "fr")


class TestTranslationPoolManagerGetStats:
    def test_stats_include_uptime_seconds(self):
        mgr = _make_manager()
        stats = mgr.get_stats()
        assert stats["uptime_seconds"] >= 0

    def test_stats_include_pool_substats(self):
        mgr = _make_manager()
        stats = mgr.get_stats()
        assert "normal_pool" in stats
        assert "any_pool" in stats

    def test_stats_include_connection_stats(self):
        mgr = _make_manager()
        stats = mgr.get_stats()
        assert "pending_batches" in stats

    def test_memory_usage_included_when_psutil_available(self):
        import services.zmq_pool.zmq_pool_manager as mgr_mod
        mgr = _make_manager()
        original = mgr_mod.PSUTIL_AVAILABLE
        mgr_mod.PSUTIL_AVAILABLE = True
        try:
            stats = mgr.get_stats()
            assert "memory_usage_mb" in stats
        finally:
            mgr_mod.PSUTIL_AVAILABLE = original

    def test_no_memory_usage_when_psutil_unavailable(self):
        import services.zmq_pool.zmq_pool_manager as mgr_mod
        mgr = _make_manager()
        original = mgr_mod.PSUTIL_AVAILABLE
        mgr_mod.PSUTIL_AVAILABLE = False
        try:
            stats = mgr.get_stats()
            assert "memory_usage_mb" not in stats
        finally:
            mgr_mod.PSUTIL_AVAILABLE = original


# ─── Worker loops & QueueEmpty edge-cases (zmq_pool_manager coverage) ─────────


class TestNormalWorkerLoop:
    async def test_loop_runs_two_iterations_and_exits(self):
        mgr = _make_manager()
        call_count = {"n": 0}

        async def get_and_stop(*args):
            call_count["n"] += 1
            if call_count["n"] >= 2:
                mgr.normal_pool.workers_running = False
            return None

        mgr._get_next_task = get_and_stop
        mgr.normal_pool.workers_running = True
        await asyncio.wait_for(mgr._normal_worker_loop("test_w"), timeout=2.0)
        assert call_count["n"] >= 2

    async def test_loop_processes_task_then_exits(self):
        mgr = _make_manager()
        task = _task()
        call_count = {"n": 0}

        async def get_task(*args):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return task
            mgr.normal_pool.workers_running = False
            return None

        mgr._get_next_task = get_task
        mgr._process_task = AsyncMock()
        mgr.normal_pool.workers_running = True
        await asyncio.wait_for(mgr._normal_worker_loop("test_w"), timeout=2.0)
        mgr._process_task.assert_awaited_once_with(task, "test_w")

    async def test_loop_exception_in_process_task_records_failure(self):
        mgr = _make_manager()
        task = _task()
        call_count = {"n": 0}

        async def get_task(*args):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return task
            mgr.normal_pool.workers_running = False
            return None

        mgr._get_next_task = get_task
        mgr._process_task = AsyncMock(side_effect=RuntimeError("processing crash"))
        mgr.normal_pool.workers_running = True
        await asyncio.wait_for(mgr._normal_worker_loop("test_w"), timeout=2.0)
        assert mgr.normal_pool.stats["tasks_failed"] == 1


class TestAnyWorkerLoop:
    async def test_loop_runs_and_exits(self):
        mgr = _make_manager()
        call_count = {"n": 0}

        async def get_and_stop(*args):
            call_count["n"] += 1
            if call_count["n"] >= 2:
                mgr.any_pool.workers_running = False
            return None

        mgr._get_next_task = get_and_stop
        mgr.any_pool.workers_running = True
        await asyncio.wait_for(mgr._any_worker_loop("test_any"), timeout=2.0)
        assert call_count["n"] >= 2

    async def test_loop_processes_task_successfully(self):
        mgr = _make_manager()
        task = _task()
        call_count = {"n": 0}

        async def get_task(*args):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return task
            mgr.any_pool.workers_running = False
            return None

        mgr._get_next_task = get_task
        mgr._process_task = AsyncMock()  # no exception → covers decrement_active success path
        mgr.any_pool.workers_running = True
        await asyncio.wait_for(mgr._any_worker_loop("test_any"), timeout=2.0)
        mgr._process_task.assert_awaited_once_with(task, "test_any")

    async def test_loop_exception_records_failure(self):
        mgr = _make_manager()
        task = _task()
        call_count = {"n": 0}

        async def get_task(*args):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return task
            mgr.any_pool.workers_running = False
            return None

        mgr._get_next_task = get_task
        mgr._process_task = AsyncMock(side_effect=RuntimeError("any crash"))
        mgr.any_pool.workers_running = True
        await asyncio.wait_for(mgr._any_worker_loop("test_any"), timeout=2.0)
        assert mgr.any_pool.stats["tasks_failed"] == 1


class TestGetNextTaskQueueEmptyEdgeCase:
    async def test_queue_empty_exception_falls_through_to_regular_pool(self):
        mgr = _make_manager()
        fast = MagicMock()
        fast.empty = MagicMock(return_value=False)  # appears non-empty
        fast.get_nowait = MagicMock(side_effect=asyncio.QueueEmpty())  # but raises
        regular = asyncio.Queue()
        await regular.put(_task(task_id="from_regular"))
        result = await mgr._get_next_task(fast, regular)
        assert result is not None
        assert result.task_id == "from_regular"


# ─── ConnectionManager: empty-batch-key skip (line 266) ────────────────────────


class TestConnectionManagerFlushBatchesEdgeCases:
    async def test_empty_batch_key_list_is_skipped(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager()
        async with cm._batch_lock:
            cm._batch_accumulator["k_empty"] = []      # triggers `if not tasks: continue`
            cm._batch_accumulator["k_full"] = [_task()]
        await cm._flush_batches()
        assert cm.normal_pool.qsize() == 1  # only the non-empty batch flushed


# ─── translation_processor: per-language task exception (lines 73-79) ─────────


class TestProcessSingleTranslationTaskRaises:
    async def test_per_language_task_exception_publishes_error_result(self):
        import services.zmq_pool.translation_processor as mod
        original = mod._translate_single_language

        async def always_raises(*args, **kw):
            raise RuntimeError("inner task raised")

        mod._translate_single_language = always_raises
        try:
            publish = AsyncMock()
            task = _task(target_languages=["fr"])
            results = await mod.process_single_translation(task, "w1", None, None, publish)
            # per-language except block (lines 73-79) fires: error published, not in results
            assert publish.await_count == 1
            assert results == []
        finally:
            mod._translate_single_language = original
