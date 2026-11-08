"""
QA indépendante — #16819 (arrêt sans perte) et #16820 (clé de lot any/conversation).

Ce que les témoins du lot ne couvraient pas :
1. Une tâche refusée par le flush final (file pleine) n'est pas signalée une
   seconde fois par la vidange des files.
2. Un sous-titre d'appel resté dans la voie rapide est signalé, avec son
   identifiant, et sa réserve en vol libérée.
3. Un arrêt appelé deux fois, ou deux arrêts concurrents, ne signalent chaque
   tâche qu'une fois.
4. Un rappel qui lève n'interrompt pas l'arrêt et laisse les files vides.
5. La forme de la `translation_error` est exactement l'existante.
6. Au niveau du serveur, le signalement part par le socket PUB AVANT sa fermeture.
7. Le flush immédiat (lot plein) range aussi chaque lot dans la file de ses tâches.
"""
import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def _task(task_id: str, conv_id: str = "c1", message_id: str = None, text: str = None):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=message_id or f"msg-{task_id}",
        text=text if text is not None else "y" * 200,
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _manager(normal_pool_size: int = 10000, any_pool_size: int = 10000, batch_max_size: int = 50):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        mgr = mgr_mod.TranslationPoolManager(
            normal_pool_size=normal_pool_size,
            any_pool_size=any_pool_size,
            normal_workers=1,
            any_workers=1,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    cm = mgr.connection_manager
    cm.enable_batching = True
    cm.enable_priority_queue = False
    cm.batch_window_ms = 60000
    cm.batch_max_size = batch_max_size
    return mgr


def _handler(pool_manager, pub_socket):
    from services.zmq_translation_handler import TranslationHandler
    handler = TranslationHandler(pool_manager=pool_manager, pub_socket=pub_socket)
    handler.cache_service = None
    return handler


def _sent(pub_socket) -> list:
    return [json.loads(call.args[0].decode("utf-8")) for call in pub_socket.send.call_args_list]


def _signaled_ids(pub_socket) -> list:
    return [message["taskId"] for message in _sent(pub_socket)]


class TestNoDoubleSignal:
    async def test_task_rejected_by_final_flush_is_not_signaled_again_by_the_drain(self):
        mgr = _manager(normal_pool_size=1)
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        cm = mgr.connection_manager
        cm.normal_pool.put_nowait(_task("queued"))
        assert await mgr.enqueue_task(_task("acc-1")) is True
        assert await mgr.enqueue_task(_task("acc-2")) is True

        await mgr.stop_workers()

        signaled = _signaled_ids(pub_socket)
        assert sorted(signaled) == ["acc-1", "acc-2", "queued"]
        assert len(signaled) == len(set(signaled))

    async def test_second_stop_signals_nothing_more(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        mgr.connection_manager.normal_pool.put_nowait(_task("once"))
        assert await mgr.enqueue_task(_task("acc")) is True

        await mgr.stop_workers()
        await mgr.stop_workers()

        assert sorted(_signaled_ids(pub_socket)) == ["acc", "once"]
        assert mgr.get_stats()["shutdown_rejections"] == 2

    async def test_concurrent_stops_signal_each_task_once(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        cm = mgr.connection_manager
        expected = []
        for i in range(5):
            cm.normal_pool.put_nowait(_task(f"n-{i}"))
            cm.any_pool.put_nowait(_task(f"a-{i}", conv_id="any"))
            assert await mgr.enqueue_task(_task(f"acc-{i}")) is True
            expected += [f"n-{i}", f"a-{i}", f"acc-{i}"]

        await asyncio.gather(mgr.stop_workers(), mgr.stop_workers())

        assert sorted(_signaled_ids(pub_socket)) == sorted(expected)


class TestLiveCaptionAtShutdown:
    async def test_caption_left_in_fast_lane_is_signaled_and_its_reservation_released(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        caption = _task("cap-1", conv_id="conv-call", message_id="call-caption:call42:1200", text="bonjour")
        assert await mgr.enqueue_task(caption) is True
        assert mgr.connection_manager.fast_pool.qsize() == 1
        assert handler.claim_inflight("cap-1", ttl_s=600) is True

        await mgr.stop_workers()

        assert _sent(pub_socket) == [{
            "type": "translation_error",
            "taskId": "cap-1",
            "messageId": "call-caption:call42:1200",
            "error": "translation pool full",
            "conversationId": "conv-call",
        }]
        assert handler.claim_inflight("cap-1", ttl_s=600) is True


class TestRobustness:
    async def test_raising_callback_does_not_break_shutdown_and_queues_end_empty(self):
        mgr = _manager()
        cm = mgr.connection_manager

        async def boom(tasks):
            raise RuntimeError("gateway gone")

        mgr.set_rejection_handler(boom)
        cm.normal_pool.put_nowait(_task("n"))
        cm.fast_pool.put_nowait(_task("f"))
        assert await mgr.enqueue_task(_task("acc")) is True

        await mgr.stop_workers()

        assert cm.normal_pool.qsize() == cm.fast_pool.qsize() == cm.any_pool.qsize() == 0
        assert cm.get_stats()["pending_batches"] == 0
        assert mgr.get_stats()["shutdown_rejections"] == 3

    async def test_pub_send_failure_on_one_task_does_not_stop_the_others(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        calls = []

        async def flaky_send(payload):
            message = json.loads(payload.decode("utf-8"))
            calls.append(message["taskId"])
            if message["taskId"] == "n-0":
                raise RuntimeError("EAGAIN")

        pub_socket.send.side_effect = flaky_send
        _handler(mgr, pub_socket)
        for i in range(3):
            mgr.connection_manager.normal_pool.put_nowait(_task(f"n-{i}"))

        await mgr.stop_workers()

        assert calls == ["n-0", "n-1", "n-2"]


class TestServerShutdownOrder:
    async def test_shutdown_signal_leaves_through_pub_before_it_is_closed(self):
        from services.zmq_server_core import ZMQTranslationServer
        server = ZMQTranslationServer.__new__(ZMQTranslationServer)
        mgr = _manager()
        events = []
        pub_socket = AsyncMock()

        async def send(payload):
            events.append(("send", json.loads(payload.decode("utf-8"))["taskId"]))

        pub_socket.send.side_effect = send
        pub_socket.close = MagicMock(side_effect=lambda: events.append(("close-pub", None)))
        pull_socket = MagicMock()
        pull_socket.close = MagicMock(side_effect=lambda: events.append(("close-pull", None)))
        _handler(mgr, pub_socket)
        server.running = True
        server._cpu_update_task = None
        server.active_tasks = set()
        server.pool_manager = mgr
        server.worker_tasks = []
        server.database_service = AsyncMock()
        server.pull_socket = pull_socket
        server.pub_socket = pub_socket
        mgr.connection_manager.normal_pool.put_nowait(_task("left"))
        assert await mgr.enqueue_task(_task("acc")) is True

        await server.stop()

        sends = [e for e in events if e[0] == "send"]
        assert sorted(task_id for _, task_id in sends) == ["acc", "left"]
        assert events.index(("close-pub", None)) > max(events.index(s) for s in sends)


class TestImmediateFlushLane:
    async def test_full_batch_flushed_immediately_goes_to_the_pool_of_its_tasks(self):
        mgr = _manager(batch_max_size=2)
        cm = mgr.connection_manager
        assert await cm.enqueue_task(_task("any-1", conv_id="any")) is True
        assert await cm.enqueue_task(_task("conv-1", conv_id="c1")) is True
        assert await cm.enqueue_task(_task("any-2", conv_id="any")) is True

        assert cm.normal_pool.qsize() == 0
        assert cm.any_pool.qsize() == 1
        batch = cm.any_pool.get_nowait()
        assert [t.task_id for t in batch._batch_tasks] == ["any-1", "any-2"]
        assert all(t.conversation_id == "any" for t in batch._batch_tasks)
        assert cm.get_stats()["pending_batches"] == 1

    async def test_full_any_pool_rejects_only_any_batch_and_spares_the_conversation(self):
        mgr = _manager(any_pool_size=1, batch_max_size=50)
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        cm = mgr.connection_manager
        cm.any_pool.put_nowait(_task("filler", conv_id="any"))
        assert await cm.enqueue_task(_task("conv-ok", conv_id="c1")) is True
        assert await cm.enqueue_task(_task("any-ko", conv_id="any")) is True

        await cm._flush_batches()

        assert _signaled_ids(pub_socket) == ["any-ko"]
        assert cm.normal_pool.qsize() == 1
        assert [t.task_id for t in cm.normal_pool.get_nowait()._batch_tasks] == ["conv-ok"]
