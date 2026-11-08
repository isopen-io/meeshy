"""
#16819 — à l'arrêt du traducteur, aucune tâche de traduction ne disparaît en silence.
#16820 — un lot ne mélange plus des tâches « any » et des tâches de conversation.

`TranslationPoolManager.stop_workers` arrêtait les workers AVANT le flush final
de l'accumulateur : les lots partaient dans des files que plus personne ne lit,
et les tâches restées dans `fast_pool` / `normal_pool` / `any_pool` ne recevaient
rien non plus. La passerelle attendait son délai.

Promesses tenues ici :
1. Chaque tâche encore dans l'accumulateur ou dans une file au moment de l'arrêt
   est soit traitée, soit signalée par la `translation_error` « translation pool
   full » existante — EXACTEMENT une issue par tâche, jamais zéro.
2. Un lot se déplie en ses tâches d'origine ; la réserve en vol se libère.
3. Le signalement se compte (`shutdown_rejections`) et se journalise sans texte.
4. La clé de lot sépare « any » et conversation ordinaire, sans fragmenter par
   conversation, et chaque lot va dans la file de ses tâches.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-TEXTE-PRIVE-16819"


def _task(task_id: str, conv_id: str = "c1", targets=("fr",), text: str = None):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=text if text is not None else f"{SENTINEL} {task_id} " + "x" * 200,
        source_language="en",
        target_languages=list(targets),
        conversation_id=conv_id,
    )


def _manager(batch_window_ms: int = 60000, batch_max_size: int = 50):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        mgr = mgr_mod.TranslationPoolManager(
            normal_pool_size=10000,
            any_pool_size=10000,
            normal_workers=2,
            any_workers=2,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    cm = mgr.connection_manager
    cm.enable_batching = True
    cm.enable_priority_queue = False
    cm.batch_window_ms = batch_window_ms
    cm.batch_max_size = batch_max_size
    return mgr


def _handler(pool_manager, pub_socket):
    from services.zmq_translation_handler import TranslationHandler
    handler = TranslationHandler(pool_manager=pool_manager, pub_socket=pub_socket)
    handler.cache_service = None
    return handler


def _signaled_ids(pub_socket) -> list:
    sent = [json.loads(call.args[0].decode("utf-8")) for call in pub_socket.send.call_args_list]
    for message in sent:
        assert message["type"] == "translation_error"
        assert message["error"] == "translation pool full"
    return [message["taskId"] for message in sent]


def _assert_no_text_logged(caplog):
    for record in caplog.records:
        assert SENTINEL not in record.getMessage(), f"texte de tâche journalisé : {record.getMessage()!r}"


def _batch_of(tasks):
    from services.zmq_models import TranslationTask
    batch = TranslationTask(
        task_id=f"batch_{tasks[0].task_id}_{len(tasks)}",
        message_id=tasks[0].message_id,
        text="",
        source_language=tasks[0].source_language,
        target_languages=tasks[0].target_languages,
        conversation_id=tasks[0].conversation_id,
    )
    batch._batch_tasks = tasks  # type: ignore
    return batch


class TestNothingIsLostAtShutdown:
    async def test_accumulated_tasks_are_signaled_not_dropped_into_unread_queues(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        for i in range(3):
            assert await mgr.enqueue_task(_task(f"acc-{i}")) is True
        assert mgr.connection_manager.get_stats()["pending_batches"] == 3

        await mgr.stop_workers()

        assert sorted(_signaled_ids(pub_socket)) == ["acc-0", "acc-1", "acc-2"]
        assert mgr.connection_manager.normal_pool.qsize() == 0
        assert mgr.connection_manager.get_stats()["pending_batches"] == 0

    async def test_every_task_is_processed_or_signaled_exactly_once(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        gate = asyncio.Event()
        processed: list = []

        async def slow(task, worker_name):
            await gate.wait()
            for original in getattr(task, "_batch_tasks", None) or [task]:
                processed.append(original.task_id)

        mgr._process_task = slow
        await mgr.start_workers()
        cm = mgr.connection_manager
        expected = []
        for i in range(6):
            cm.normal_pool.put_nowait(_task(f"n-{i}"))
            cm.any_pool.put_nowait(_task(f"a-{i}", conv_id="any"))
            cm.fast_pool.put_nowait(_task(f"f-{i}"))
            expected += [f"n-{i}", f"a-{i}", f"f-{i}"]
        for i in range(4):
            assert await mgr.enqueue_task(_task(f"acc-{i}", conv_id=f"conv-{i}")) is True
            assert await mgr.enqueue_task(_task(f"acc-any-{i}", conv_id="any")) is True
            expected += [f"acc-{i}", f"acc-any-{i}"]
        await asyncio.sleep(0.01)

        stopping = asyncio.create_task(mgr.stop_workers())
        await asyncio.sleep(0.01)
        gate.set()
        await asyncio.wait_for(stopping, timeout=5.0)

        signaled = _signaled_ids(pub_socket)
        outcomes = processed + signaled
        assert sorted(outcomes) == sorted(expected), "chaque tâche a exactement une issue"
        assert len(signaled) > 0
        assert mgr.get_stats()["shutdown_rejections"] == len(signaled)
        _assert_no_text_logged(caplog)

    async def test_tasks_left_in_queues_are_signaled_and_batches_unfolded(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager()
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        cm = mgr.connection_manager
        cm.fast_pool.put_nowait(_task("fast"))
        cm.any_pool.put_nowait(_task("any-1", conv_id="any"))
        cm.normal_pool.put_nowait(_batch_of([_task("b-1"), _task("b-2"), _task("b-3")]))
        for task_id in ("fast", "any-1", "b-1", "b-2", "b-3"):
            assert handler.claim_inflight(task_id, ttl_s=600) is True

        await mgr.stop_workers()

        assert sorted(_signaled_ids(pub_socket)) == ["any-1", "b-1", "b-2", "b-3", "fast"]
        for task_id in ("fast", "any-1", "b-1", "b-2", "b-3"):
            assert handler.claim_inflight(task_id, ttl_s=600) is True, "la réserve en vol est libérée"
        assert mgr.get_stats()["shutdown_rejections"] == 5
        assert cm.fast_pool.qsize() == cm.any_pool.qsize() == cm.normal_pool.qsize() == 0
        logs = " ".join(r.getMessage() for r in caplog.records)
        assert "b-1" in logs and "5" in logs
        _assert_no_text_logged(caplog)

    async def test_without_handler_shutdown_still_counts_and_does_not_raise(self):
        mgr = _manager()
        mgr.connection_manager.normal_pool.put_nowait(_task("orphan"))
        await mgr.stop_workers()
        assert mgr.get_stats()["shutdown_rejections"] == 1

    async def test_shutdown_stat_starts_at_zero(self):
        assert _manager().get_stats()["shutdown_rejections"] == 0


class TestBatchKeySeparatesAnyFromConversation:
    async def test_any_and_conversation_tasks_never_share_a_batch(self):
        mgr = _manager()
        cm = mgr.connection_manager
        await cm.enqueue_task(_task("conv-task", conv_id="c1"))
        await cm.enqueue_task(_task("any-task", conv_id="any"))
        await cm._flush_batches()

        normal = [cm.normal_pool.get_nowait() for _ in range(cm.normal_pool.qsize())]
        any_ = [cm.any_pool.get_nowait() for _ in range(cm.any_pool.qsize())]
        normal_ids = [t.task_id for b in normal for t in b._batch_tasks]
        any_ids = [t.task_id for b in any_ for t in b._batch_tasks]
        assert normal_ids == ["conv-task"]
        assert any_ids == ["any-task"]

    async def test_any_first_does_not_drag_conversation_tasks_into_the_any_pool(self):
        mgr = _manager()
        cm = mgr.connection_manager
        await cm.enqueue_task(_task("any-first", conv_id="any"))
        await cm.enqueue_task(_task("conv-second", conv_id="c1"))
        await cm._flush_batches()
        any_ids = [t.task_id for b in [cm.any_pool.get_nowait() for _ in range(cm.any_pool.qsize())]
                   for t in b._batch_tasks]
        assert "conv-second" not in any_ids

    async def test_different_conversations_still_share_one_batch(self):
        mgr = _manager()
        cm = mgr.connection_manager
        await cm.enqueue_task(_task("c1-task", conv_id="c1"))
        await cm.enqueue_task(_task("c2-task", conv_id="c2"))
        await cm._flush_batches()
        assert cm.normal_pool.qsize() == 1
        batch = cm.normal_pool.get_nowait()
        assert [t.task_id for t in batch._batch_tasks] == ["c1-task", "c2-task"]
