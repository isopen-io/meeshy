"""
QA indépendante — #17002 (une tâche reçue pendant l'arrêt est refusée et
signalée) et #17003 (un refus en masse tient en lignes bornées).

Ce que les témoins du lot ne couvraient pas :
1. Le chemin RÉEL de la passerelle (`_handle_translation_request`) : une
   requête reçue après l'arrêt est signalée UNE fois, sa réserve en vol est
   libérée, et sa relance (même taskId) est signalée à son tour.
2. La `translation_error` publiée est identique OCTET POUR OCTET à celle que
   la passerelle connaît (clé, ordre, séparateurs).
3. Des arrivées CONCURRENTES de l'arrêt, sur toutes les voies (lot, voie
   rapide, sous-titre, directe, « any ») : chaque tâche a exactement une issue.
4. Un lot que le flush final refuse (file pleine), mêlé à des tâches tardives :
   chacune signalée une fois, rien ne reste.
5. Hors arrêt, rien ne change : une tâche entre en file, un refus de file
   pleine directe rend `False` et n'est pas compté comme refus d'arrêt.
6. La ligne de résumé est bornée même pour un nombre de tâches très grand, et
   ne cite jamais de texte.
"""
import asyncio
import json
import logging
import random
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-QA-17002"
CAPTION_ID = "call-caption:65f0c0ffee0000000000abcd:12000"


def _task(task_id: str, conv_id: str = "c1", message_id: str = None, text: str = None):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=message_id or f"msg-{task_id}",
        text=text if text is not None else f"{SENTINEL} " + "y" * 200,
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _manager(normal_pool_size: int = 10000, any_pool_size: int = 10000, batch_max_size: int = 50,
             batching: bool = True, priority: bool = False):
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


def _sent(pub_socket) -> list:
    return [call.args[0] for call in pub_socket.send.call_args_list]


def _signaled_ids(pub_socket) -> list:
    messages = [json.loads(raw.decode("utf-8")) for raw in _sent(pub_socket)]
    assert all(m["type"] == "translation_error" and m["error"] == "translation pool full" for m in messages)
    return [m["taskId"] for m in messages]


def _assert_nothing_left(mgr):
    cm = mgr.connection_manager
    assert cm.get_stats()["pending_batches"] == 0
    assert cm.fast_pool.qsize() == cm.normal_pool.qsize() == cm.any_pool.qsize() == 0


def _request(task_id: str, conv_id: str = "c1") -> dict:
    return {
        "type": "translation",
        "taskId": task_id,
        "messageId": f"msg-{task_id}",
        "text": f"{SENTINEL} bonjour tout le monde " + "z" * 150,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": conv_id,
        "modelType": "basic",
    }


class TestGatewayPathDuringShutdown:
    async def test_request_received_after_stop_is_signaled_once_and_its_retry_is_signaled_again(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager()
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        await mgr.stop_workers()

        await handler._handle_translation_request(_request("late-1"))
        assert _signaled_ids(pub_socket) == ["late-1"]

        await handler._handle_translation_request(_request("late-1"))
        assert _signaled_ids(pub_socket) == ["late-1", "late-1"], "la relance n'est pas avalée par une réserve en vol"
        assert mgr.get_stats()["shutdown_rejections"] == 2
        _assert_nothing_left(mgr)
        for record in caplog.records:
            assert SENTINEL not in record.getMessage()

    async def test_published_error_is_byte_identical_to_the_existing_contract(self):
        mgr = _manager()
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        await mgr.stop_workers()

        await mgr.enqueue_task(_task("t-1", conv_id="conv-9", message_id="m-9"))

        assert _sent(pub_socket) == [
            b'{"type": "translation_error", "taskId": "t-1", "messageId": "m-9", '
            b'"error": "translation pool full", "conversationId": "conv-9"}'
        ]


LANES = ["batched", "fast", "caption", "direct", "any"]


def _lane_task(lane: str, i: int):
    tid = f"{lane}-{i}"
    return {
        "batched": lambda: _task(tid),
        "fast": lambda: _task(tid, text="hi"),
        "caption": lambda: _task(tid, message_id=f"{CAPTION_ID}{i}", text="hi"),
        "direct": lambda: _task(tid),
        "any": lambda: _task(tid, conv_id="any"),
    }[lane]()


class TestConcurrentArrivalsAroundStop:
    @pytest.mark.parametrize("seed", range(8))
    async def test_every_task_racing_the_stop_has_exactly_one_outcome(self, seed):
        rng = random.Random(seed)
        mgr = _manager(batch_max_size=4, priority=True)
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        tasks = [_lane_task(rng.choice(LANES), i) for i in range(120)]

        async def arrive(task):
            for _ in range(rng.randint(0, 3)):
                await asyncio.sleep(0)
            await mgr.enqueue_task(task)

        stop_at = rng.randint(0, len(tasks))
        arrivals = [asyncio.create_task(arrive(t)) for t in tasks[:stop_at]]
        stopping = asyncio.create_task(mgr.stop_workers())
        arrivals += [asyncio.create_task(arrive(t)) for t in tasks[stop_at:]]
        await asyncio.wait_for(asyncio.gather(stopping, *arrivals), timeout=10.0)

        signaled = _signaled_ids(pub_socket)
        assert sorted(signaled) == sorted(t.task_id for t in tasks), "aucune perdue, aucune en double"
        assert mgr.get_stats()["shutdown_rejections"] == len(tasks)
        _assert_nothing_left(mgr)


class TestFinalFlushRefusalAndLateTasks:
    async def test_batch_refused_by_the_final_flush_and_late_tasks_are_each_signaled_once(self):
        mgr = _manager(normal_pool_size=1, batch_max_size=50)
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)
        cm = mgr.connection_manager
        cm.normal_pool.put_nowait(_task("blocker"))
        for i in range(3):
            assert await mgr.enqueue_task(_task(f"acc-{i}")) is True

        await mgr.stop_workers()
        for i in range(2):
            assert await mgr.enqueue_task(_task(f"late-{i}")) is True

        assert sorted(_signaled_ids(pub_socket)) == ["acc-0", "acc-1", "acc-2", "blocker", "late-0", "late-1"]
        assert cm.get_stats()["pool_full_rejections"] == 3
        _assert_nothing_left(mgr)


class TestNominalPathUnchanged:
    async def test_before_stop_a_task_is_queued_and_nothing_is_signaled(self):
        mgr = _manager(batching=False)
        pub_socket = AsyncMock()
        _handler(mgr, pub_socket)

        assert await mgr.enqueue_task(_task("ok")) is True

        assert mgr.connection_manager.normal_pool.qsize() == 1
        assert pub_socket.send.await_count == 0
        assert mgr.get_stats()["shutdown_rejections"] == 0

    async def test_direct_full_pool_still_returns_false_and_is_not_a_shutdown_rejection(self):
        mgr = _manager(normal_pool_size=1, batching=False)
        pub_socket = AsyncMock()
        handler = _handler(mgr, pub_socket)
        mgr.connection_manager.normal_pool.put_nowait(_task("blocker"))

        await handler._handle_translation_request(_request("refused"))

        assert _signaled_ids(pub_socket) == ["refused"]
        stats = mgr.get_stats()
        assert stats["pool_full_rejections"] == 1
        assert stats["shutdown_rejections"] == 0


class TestSummaryLineIsBounded:
    def test_summary_of_a_huge_refusal_has_a_fixed_size_and_cites_the_total(self):
        from services.zmq_pool.connection_manager import summarize_task_ids
        small = summarize_task_ids([_task(f"id-{i:06d}") for i in range(25)])
        huge = summarize_task_ids([_task(f"id-{i:06d}") for i in range(50000)])

        assert len(re.findall(r"id-\d{6}", huge)) == 20
        assert huge.startswith("50000 tasks")
        assert "+49980" in huge
        assert len(huge) - len(small) <= 8, "la taille ne dépend que du nombre de chiffres du total et du reste"
        assert SENTINEL not in huge

    def test_summary_at_the_limit_has_no_remainder(self):
        from services.zmq_pool.connection_manager import summarize_task_ids
        line = summarize_task_ids([_task(f"id-{i}") for i in range(20)])
        assert line.startswith("20 tasks")
        assert "autres" not in line
        assert summarize_task_ids([]) == "0 tasks []"


class TestResidualFlushLoopCancellation:
    @pytest.mark.xfail(strict=True, reason=(
        "Réserve QA préexistante (déjà sur dev) : `stop()` annule la boucle de flush "
        "pendant qu'elle remet un lot refusé (file pleine) au rappel ; le lot, déjà "
        "retiré de l'accumulateur et compté dans pool_full_rejections, n'est jamais "
        "signalé. Improbable avec un PUB zmq (send non bloquant), mais non garanti."
    ))
    async def test_batch_refused_by_the_flush_loop_while_stop_cancels_it_is_still_signaled(self):
        mgr = _manager(normal_pool_size=1)
        cm = mgr.connection_manager
        cm.batch_window_ms = 5
        signaled = []
        gate = asyncio.Event()

        async def slow_publish(tasks):
            await gate.wait()
            signaled.extend(t.task_id for t in tasks)

        cm.on_tasks_rejected = slow_publish
        cm.normal_pool.put_nowait(_task("blocker"))
        for i in range(3):
            await mgr.enqueue_task(_task(f"acc-{i}"))
        await cm.start()
        await asyncio.sleep(0.05)

        stopping = asyncio.create_task(mgr.stop_workers())
        await asyncio.sleep(0)
        gate.set()
        await asyncio.wait_for(stopping, timeout=5.0)

        assert sorted(signaled) == ["acc-0", "acc-1", "acc-2", "blocker"]
