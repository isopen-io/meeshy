"""
#17002 — une traduction reçue pendant l'arrêt est refusée et signalée.
#17003 — un refus en masse est journalisé sur des lignes bornées.

`ZMQTranslationServer.stop` garde le socket PULL ouvert pendant
`pool_manager.stop_workers()` : une tâche peut encore arriver une fois l'arrêt
lancé. Elle était acceptée (`True`), restait dans l'accumulateur dont la boucle
de flush était annulée, et ne recevait jamais d'issue.

Promesses tenues ici :
1. Une fois `connection_manager.stop()` commencé, toute tâche passée à
   `enqueue_task` est signalée par la `translation_error` « translation pool
   full » existante, comptée dans `shutdown_rejections`, et ne laisse rien ni
   dans l'accumulateur ni dans une file — quelle que soit sa voie.
2. `stop_workers` ferme l'entrée AVANT de vider : une tâche arrivée pendant la
   vidange (ici, depuis le rappel de rejet) est signalée, pas abandonnée dans une
   file. Chaque tâche a exactement une issue.
3. Un refus de N tâches produit un nombre de lignes de journal indépendant de N,
   chaque ligne citant au plus 20 task_id et le total — jamais de texte.
"""
import asyncio
import json
import logging
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-TEXTE-PRIVE-17003"
CAPTION_ID = "call-caption:65f0c0ffee0000000000abcd:12000"
MAX_IDS_PER_LINE = 20


def _task(task_id: str, conv_id: str = "c1", message_id: str = None, text: str = None):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=message_id or f"msg-{task_id}",
        text=text if text is not None else f"{SENTINEL} {task_id} " + "x" * 200,
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _manager(normal_pool_size: int = 10000, batch_max_size: int = 50, batching: bool = True,
             priority: bool = False):
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
    cm.enable_priority_queue = priority
    cm.batch_window_ms = 60000
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


def _assert_nothing_left(mgr):
    cm = mgr.connection_manager
    assert cm.get_stats()["pending_batches"] == 0, "l'accumulateur ne garde rien après l'arrêt"
    assert cm.fast_pool.qsize() == cm.normal_pool.qsize() == cm.any_pool.qsize() == 0


def _assert_no_text_logged(caplog):
    for record in caplog.records:
        assert SENTINEL not in record.getMessage(), f"texte de tâche journalisé : {record.getMessage()!r}"


class TestTaskArrivingDuringShutdownIsSignaled:
    @pytest.mark.parametrize("lane", ["batched", "fast", "caption", "direct"])
    async def test_task_enqueued_after_stop_workers_is_signaled_and_leaves_nothing(self, lane, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager(batching=lane != "direct", priority=lane == "fast")
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        await mgr.stop_workers()
        late = {
            "batched": _task("late"),
            "fast": _task("late", text="hi"),
            "caption": _task("late", message_id=CAPTION_ID, text="hi"),
            "direct": _task("late"),
        }[lane]
        assert handler.claim_inflight("late", ttl_s=600) is True

        await mgr.enqueue_task(late)

        assert _signaled_ids(pub_socket) == ["late"]
        assert mgr.get_stats()["shutdown_rejections"] == 1
        assert handler.claim_inflight("late", ttl_s=600) is True, "la réserve en vol est libérée"
        _assert_nothing_left(mgr)
        _assert_no_text_logged(caplog)

    async def test_late_task_through_the_gateway_handler_is_signaled_exactly_once(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        await mgr.stop_workers()

        success = await mgr.enqueue_task(_task("late"))
        if not success:
            await handler.publish_pool_full([_task("late")])

        assert _signaled_ids(pub_socket) == ["late"]

    async def test_without_handler_late_task_is_still_counted(self):
        mgr = _manager()
        await mgr.stop_workers()
        await mgr.enqueue_task(_task("late"))
        assert mgr.get_stats()["shutdown_rejections"] == 1
        _assert_nothing_left(mgr)


class TestStopClosesIngressBeforeDraining:
    async def test_task_arriving_during_the_drain_is_signaled_not_left_in_a_queue(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        arrivals = iter([_task("during-drain")])

        async def publish_then_receive_more(tasks):
            await handler.publish_pool_full(tasks)
            next_task = next(arrivals, None)
            if next_task is not None:
                await mgr.enqueue_task(next_task)

        mgr.set_rejection_handler(publish_then_receive_more)
        for i in range(3):
            assert await mgr.enqueue_task(_task(f"acc-{i}")) is True

        await mgr.stop_workers()

        assert sorted(_signaled_ids(pub_socket)) == ["acc-0", "acc-1", "acc-2", "during-drain"]
        assert mgr.get_stats()["shutdown_rejections"] == 4
        _assert_nothing_left(mgr)


    async def test_task_waiting_on_the_batch_lock_when_stop_begins_has_exactly_one_outcome(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        cm = mgr.connection_manager
        await cm._batch_lock.acquire()
        enqueuing = asyncio.create_task(mgr.enqueue_task(_task("racing")))
        await asyncio.sleep(0)
        stopping = asyncio.create_task(mgr.stop_workers())
        await asyncio.sleep(0.01)
        cm._batch_lock.release()

        await asyncio.wait_for(asyncio.gather(enqueuing, stopping), timeout=5.0)

        assert _signaled_ids(pub_socket) == ["racing"]
        assert mgr.get_stats()["shutdown_rejections"] == 1
        _assert_nothing_left(mgr)

def _ids_in(message: str, prefix: str) -> int:
    return len(re.findall(rf"{prefix}-\d+", message))


async def _shutdown_log_lines(caplog, count: int) -> list:
    caplog.clear()
    mgr = _manager()
    _handler(mgr, AsyncMock())
    cm = mgr.connection_manager
    for i in range(count):
        cm.normal_pool.put_nowait(_task(f"mass-{i}"))
    await mgr.stop_workers()
    assert mgr.get_stats()["shutdown_rejections"] == count
    return [r.getMessage() for r in caplog.records]


class TestMassRejectionLogsAreBounded:
    async def test_shutdown_of_many_tasks_logs_a_bounded_number_of_bounded_lines(self, caplog):
        caplog.set_level(logging.DEBUG)
        small = await _shutdown_log_lines(caplog, 30)
        large = await _shutdown_log_lines(caplog, 600)

        assert len(large) == len(small), "le nombre de lignes ne dépend pas du nombre de tâches"
        for message in large:
            assert _ids_in(message, "mass") <= MAX_IDS_PER_LINE, message[:200]
        assert any("600" in m and _ids_in(m, "mass") > 0 for m in large), "le total et un échantillon sont cités"
        _assert_no_text_logged(caplog)

    async def test_full_pool_batch_refusal_line_cites_at_most_20_ids_and_the_total(self, caplog):
        caplog.set_level(logging.DEBUG)
        received = []

        async def on_rejected(tasks):
            received.extend(t.task_id for t in tasks)

        mgr = _manager(normal_pool_size=1, batch_max_size=60)
        cm = mgr.connection_manager
        cm.on_tasks_rejected = on_rejected
        cm.normal_pool.put_nowait(_task("blocker"))
        for i in range(60):
            assert await mgr.enqueue_task(_task(f"mass-{i}")) is True

        assert len(received) == 60
        refusal = [r.getMessage() for r in caplog.records if _ids_in(r.getMessage(), "mass") > 0]
        assert refusal, "le refus nomme ses task_id"
        for message in refusal:
            assert _ids_in(message, "mass") <= MAX_IDS_PER_LINE, message[:200]
        assert any("60" in m for m in refusal)
        _assert_no_text_logged(caplog)

    async def test_publish_pool_full_sends_one_error_per_task_but_logs_a_bounded_summary(self, caplog):
        caplog.set_level(logging.DEBUG)
        pub_socket = AsyncMock()
        handler = _handler(object(), pub_socket)
        tasks = [_task(f"mass-{i}") for i in range(500)]

        await handler.publish_pool_full(tasks)

        assert _signaled_ids(pub_socket) == [t.task_id for t in tasks]
        lines = [r.getMessage() for r in caplog.records if _ids_in(r.getMessage(), "mass") > 0]
        assert 1 <= len(lines) <= 2
        for message in lines:
            assert _ids_in(message, "mass") <= MAX_IDS_PER_LINE, message[:200]
        assert any("500" in m for m in lines)
        _assert_no_text_logged(caplog)

    async def test_failing_sends_are_summarized_on_a_bounded_line(self, caplog):
        caplog.set_level(logging.DEBUG)
        pub_socket = AsyncMock()
        pub_socket.send.side_effect = RuntimeError(f"{SENTINEL} boom")
        handler = _handler(object(), pub_socket)

        await handler.publish_pool_full([_task(f"mass-{i}") for i in range(200)])

        assert pub_socket.send.await_count == 200
        lines = [r.getMessage() for r in caplog.records if _ids_in(r.getMessage(), "mass") > 0]
        assert 1 <= len(lines) <= 2
        for message in lines:
            assert _ids_in(message, "mass") <= MAX_IDS_PER_LINE, message[:200]
        _assert_no_text_logged(caplog)

    async def test_raising_rejection_callback_is_logged_on_a_bounded_line(self, caplog):
        caplog.set_level(logging.DEBUG)

        async def boom(tasks):
            raise RuntimeError("boom")

        mgr = _manager()
        mgr.set_rejection_handler(boom)
        for i in range(100):
            mgr.connection_manager.normal_pool.put_nowait(_task(f"mass-{i}"))

        await mgr.stop_workers()

        for record in caplog.records:
            assert _ids_in(record.getMessage(), "mass") <= MAX_IDS_PER_LINE, record.getMessage()[:200]
