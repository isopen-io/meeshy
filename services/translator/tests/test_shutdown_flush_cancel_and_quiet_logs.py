"""
#17063 — un lot refusé par la boucle de flush pendant que `stop()` l'annule
est signalé jusqu'au bout, une seule fois, et l'arrêt attend ce signalement.

#17064 — pendant l'arrêt, N tâches refusées à l'entrée produisent un nombre de
lignes WARNING indépendant de N ; chacune reste signalée à la passerelle, et
un refus de file pleine en régime garde sa WARNING.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-17064"


def _task(task_id: str, source: str = "en"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=f"{SENTINEL} " + "y" * 200,
        source_language=source,
        target_languages=["fr"],
        conversation_id="c1",
    )


def _manager(normal_pool_size: int = 10000, batching: bool = True):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        mgr = mgr_mod.TranslationPoolManager(
            normal_pool_size=normal_pool_size,
            any_pool_size=10000,
            normal_workers=1,
            any_workers=1,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    cm = mgr.connection_manager
    cm.enable_batching = batching
    cm.enable_priority_queue = False
    cm.batch_window_ms = 60000
    cm.batch_max_size = 50
    return mgr


def _handler(pool_manager, pub_socket):
    from services.zmq_translation_handler import TranslationHandler
    handler = TranslationHandler(pool_manager=pool_manager, pub_socket=pub_socket)
    handler.cache_service = None
    return handler


def _request(task_id: str) -> dict:
    return {
        "type": "translation",
        "taskId": task_id,
        "messageId": f"msg-{task_id}",
        "text": f"{SENTINEL} bonjour " + "z" * 150,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "c1",
        "modelType": "basic",
    }


def _signaled_ids(pub_socket) -> list:
    messages = [json.loads(call.args[0].decode("utf-8")) for call in pub_socket.send.call_args_list]
    assert all(m["type"] == "translation_error" and m["error"] == "translation pool full" for m in messages)
    return [m["taskId"] for m in messages]


async def _cancelled_while_reporting(mgr, batches: int):
    cm = mgr.connection_manager
    cm.batch_window_ms = 5
    signaled = []
    gate = asyncio.Event()

    async def slow_publish(tasks):
        await gate.wait()
        signaled.extend(t.task_id for t in tasks)

    cm.on_tasks_rejected = slow_publish
    cm.normal_pool.put_nowait(_task("blocker"))
    for b in range(batches):
        for i in range(3):
            await mgr.enqueue_task(_task(f"acc-{b}-{i}", source=f"l{b}"))
    await cm.start()
    await asyncio.sleep(0.05)
    return signaled, gate


class TestFlushLoopCancelledWhileReporting:
    @pytest.mark.parametrize("batches", [1, 3])
    async def test_every_refused_batch_is_signaled_exactly_once_and_counted_once(self, batches):
        mgr = _manager(normal_pool_size=1)
        signaled, gate = await _cancelled_while_reporting(mgr, batches)

        stopping = asyncio.create_task(mgr.stop_workers())
        await asyncio.sleep(0)
        gate.set()
        await asyncio.wait_for(stopping, timeout=5.0)

        expected = sorted([f"acc-{b}-{i}" for b in range(batches) for i in range(3)] + ["blocker"])
        assert sorted(signaled) == expected
        stats = mgr.get_stats()
        assert stats["pool_full_rejections"] == 3 * batches
        assert stats["shutdown_rejections"] == 1

    async def test_stop_does_not_return_before_the_refused_batch_is_signaled(self):
        mgr = _manager(normal_pool_size=1)
        signaled, gate = await _cancelled_while_reporting(mgr, 1)

        stopping = asyncio.create_task(mgr.connection_manager.stop())
        await asyncio.sleep(0.05)
        assert not stopping.done(), "l'arrêt continuait pendant que le report tournait"
        assert signaled == []

        gate.set()
        await asyncio.wait_for(stopping, timeout=5.0)
        assert sorted(signaled) == ["acc-0-0", "acc-0-1", "acc-0-2"]


async def _warnings_for_late_arrivals(caplog, count: int) -> list:
    mgr = _manager()
    pub_socket = AsyncMock()
    handler = _handler(mgr, pub_socket)
    await mgr.stop_workers()
    caplog.clear()

    for i in range(count):
        await handler._handle_translation_request(_request(f"late-{i:04d}"))

    assert _signaled_ids(pub_socket) == [f"late-{i:04d}" for i in range(count)]
    assert mgr.get_stats()["shutdown_rejections"] == count
    for record in caplog.records:
        assert SENTINEL not in record.getMessage()
    return [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]


class TestQuietRefusalsDuringShutdown:
    async def test_warning_count_does_not_depend_on_the_number_of_late_arrivals(self, caplog):
        caplog.set_level(logging.DEBUG)
        few = await _warnings_for_late_arrivals(caplog, 5)
        many = await _warnings_for_late_arrivals(caplog, 500)

        assert len(few) == len(many)
        assert len(many) <= 1

    async def test_each_late_refusal_is_still_traced_at_debug_by_its_task_id(self, caplog):
        caplog.set_level(logging.DEBUG)
        await _warnings_for_late_arrivals(caplog, 3)

        debug = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        for i in range(3):
            assert any(f"late-{i:04d}" in line for line in debug)

    async def test_published_error_is_unchanged_during_shutdown(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        await mgr.stop_workers()

        await mgr.enqueue_task(_task("late"))

        raw = pub_socket.send.call_args_list[0].args[0]
        assert raw == json.dumps({
            "type": "translation_error",
            "taskId": "late",
            "messageId": "msg-late",
            "error": "translation pool full",
            "conversationId": "c1",
        }).encode("utf-8")

    async def test_full_pool_refusal_outside_shutdown_keeps_its_warning(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager(normal_pool_size=1, batching=False)
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        mgr.connection_manager.normal_pool.put_nowait(_task("blocker"))
        caplog.clear()

        await handler._handle_translation_request(_request("refused"))

        assert _signaled_ids(pub_socket) == ["refused"]
        warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
        assert any("Pool pleine" in line and "refused" in line for line in warnings)
