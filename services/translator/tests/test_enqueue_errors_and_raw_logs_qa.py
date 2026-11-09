"""
QA #16822 — témoins indépendants de bout en bout.

1. Par le VRAI chemin passerelle (TranslationHandler + TranslationPoolManager) :
   une entrée de lot qui lève produit exactement UNE `translation_error` par
   tâche du lot (jamais deux : `enqueue_task` rend True, le rappel signale),
   au format inchangé, et la réserve en vol de chaque tâche est libérée.
2. Le flush final de `stop()` : un lot dont l'entrée lève est signalé une fois,
   compté dans `enqueue_error_rejections` et jamais recompté par la vidange
   `reject_pending_at_shutdown`.
3. La boucle de flush annulée par `stop()` pendant le signalement d'un lot
   dont l'entrée a levé : le signalement va au bout, une fois.
4. Le couloir « any » suit la même règle.
5. `get_stats()` du gestionnaire de pools garde ses clés et expose la nouvelle.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SECRET = "SECRET-QA-16822"


def _task(task_id: str, source: str = "en", conversation_id: str = "c1"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=f"{SECRET} " + "x" * 200,
        source_language=source,
        target_languages=["fr"],
        conversation_id=conversation_id,
    )


def _pool_manager(batch_max_size: int = 3, batch_window_ms: int = 60000):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        mgr = mgr_mod.TranslationPoolManager(
            normal_pool_size=100,
            any_pool_size=100,
            normal_workers=1,
            any_workers=1,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    cm = mgr.connection_manager
    cm.enable_batching = True
    cm.enable_priority_queue = False
    cm.batch_max_size = batch_max_size
    cm.batch_window_ms = batch_window_ms
    return mgr


def _raising_put(queue):
    async def put(item):
        raise RuntimeError(f"{SECRET} put")

    queue.put = put


def _request(task_id: str) -> dict:
    return {
        "type": "translation",
        "taskId": task_id,
        "messageId": f"msg-{task_id}",
        "text": f"{SECRET} bonjour " + "z" * 150,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "c1",
        "modelType": "basic",
    }


def _published(pub_socket) -> list:
    return [json.loads(call.args[0].decode("utf-8")) for call in pub_socket.send.call_args_list]


def _no_secret_logged(caplog):
    leaked = [r.getMessage() for r in caplog.records if SECRET in r.getMessage()]
    assert not leaked, leaked


async def test_gateway_path_signals_each_task_of_a_raising_batch_exactly_once(caplog):
    from services.zmq_translation_handler import TranslationHandler
    mgr = _pool_manager(batch_max_size=3)
    _raising_put(mgr.connection_manager.normal_pool)
    pub_socket = AsyncMock()
    handler = TranslationHandler(pool_manager=mgr, pub_socket=pub_socket)
    handler.cache_service = None

    with caplog.at_level(logging.DEBUG):
        for i in range(3):
            await handler._handle_translation_request(_request(f"g{i}"))

    messages = _published(pub_socket)
    assert sorted(m["taskId"] for m in messages) == ["g0", "g1", "g2"]
    assert all(
        set(m) == {"type", "taskId", "messageId", "error", "conversationId"}
        and m["type"] == "translation_error"
        and m["error"] == "translation pool full"
        for m in messages
    )
    assert all(handler.claim_inflight(f"g{i}", ttl_s=30) for i in range(3))
    _no_secret_logged(caplog)


async def test_final_flush_of_stop_signals_raising_batch_once_and_drain_does_not_recount(caplog):
    mgr = _pool_manager(batch_max_size=50)
    cm = mgr.connection_manager
    received = []

    async def on_rejected(tasks):
        received.append(sorted(t.task_id for t in tasks))

    cm.on_tasks_rejected = on_rejected
    for i in range(4):
        assert await cm.enqueue_task(_task(f"s{i}"))
    _raising_put(cm.normal_pool)

    with caplog.at_level(logging.DEBUG):
        await cm.stop()
        drained = await cm.reject_pending_at_shutdown()

    assert received == [["s0", "s1", "s2", "s3"]]
    assert drained == 0
    stats = cm.get_stats()
    assert stats["enqueue_error_rejections"] == 4
    assert stats["shutdown_rejections"] == 0
    assert stats["pool_full_rejections"] == 0
    assert stats["pending_batches"] == 0
    _no_secret_logged(caplog)


async def test_flush_loop_cancelled_while_signaling_a_raising_batch_finishes_the_signal():
    mgr = _pool_manager(batch_max_size=50, batch_window_ms=5)
    cm = mgr.connection_manager
    signaled = []
    gate = asyncio.Event()

    async def slow(tasks):
        await gate.wait()
        signaled.extend(t.task_id for t in tasks)

    cm.on_tasks_rejected = slow
    for i in range(3):
        await cm.enqueue_task(_task(f"c{i}"))
    _raising_put(cm.normal_pool)
    await cm.start()
    await asyncio.sleep(0.05)

    stopping = asyncio.create_task(cm.stop())
    await asyncio.sleep(0)
    gate.set()
    await asyncio.wait_for(stopping, timeout=5.0)

    assert sorted(signaled) == ["c0", "c1", "c2"]
    assert cm.get_stats()["enqueue_error_rejections"] == 3


async def test_any_lane_raising_batch_is_signaled_once():
    mgr = _pool_manager(batch_max_size=2)
    cm = mgr.connection_manager
    received = []

    async def on_rejected(tasks):
        received.append([t.task_id for t in tasks])

    cm.on_tasks_rejected = on_rejected
    _raising_put(cm.any_pool)

    results = [await cm.enqueue_task(_task(f"a{i}", conversation_id="any")) for i in range(2)]

    assert results == [True, True]
    assert received == [["a0", "a1"]]
    assert cm.normal_pool.qsize() == 0


def test_pool_manager_stats_keep_existing_keys_and_expose_the_new_counter():
    stats = _pool_manager().get_stats()
    for key in (
        "pool_full_rejections",
        "batches_created",
        "fast_track_count",
        "caption_fast_lane_overflow",
        "shutdown_rejections",
        "pending_batches",
        "enqueue_error_rejections",
    ):
        assert key in stats, key
    assert stats["enqueue_error_rejections"] == 0
