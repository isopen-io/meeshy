"""
QA indépendante de #17063 / #17064 — trous laissés par les témoins du lot :

- l'arrêt rend la main dès la fin du report (l'annulation est bien rendue à la
  boucle de flush, qui ne tourne plus ensuite) ;
- un appelant qui rebranche UN SEUL rappel après le handler reçoit aussi les
  refus d'arrivée tardive (rétrocompatibilité de `set_rejection_handler`) ;
- un rappel qui lève pendant le report protégé n'empêche ni l'arrêt ni le
  comptage, et son journal ne porte pas le texte ;
- réserve documentée : une SECONDE annulation (l'arrêt lui-même annulé pendant
  le report) perd encore le lot.
"""
import asyncio
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-QA-17063"


def _task(task_id: str, source: str = "en"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=f"{SENTINEL} " + "q" * 200,
        source_language=source,
        target_languages=["fr"],
        conversation_id="c1",
    )


def _manager(normal_pool_size: int = 10000):
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
    cm.enable_batching = True
    cm.enable_priority_queue = False
    cm.batch_window_ms = 5
    cm.batch_max_size = 50
    return mgr


async def _flush_loop_reporting(mgr, handler):
    cm = mgr.connection_manager
    cm.on_tasks_rejected = handler
    cm.normal_pool.put_nowait(_task("blocker"))
    for i in range(3):
        await mgr.enqueue_task(_task(f"acc-{i}"))
    await cm.start()
    await asyncio.sleep(0.05)


class TestStopReturnsAsSoonAsTheReportEnds:
    async def test_stop_returns_promptly_and_the_flush_loop_is_finished(self):
        mgr = _manager(normal_pool_size=1)
        cm = mgr.connection_manager
        gate = asyncio.Event()
        signaled = []

        async def slow(tasks):
            await gate.wait()
            signaled.extend(t.task_id for t in tasks)

        await _flush_loop_reporting(mgr, slow)
        loop_task = cm._batch_flush_task
        stopping = asyncio.create_task(cm.stop())
        await asyncio.sleep(0)
        gate.set()

        done, _ = await asyncio.wait({stopping}, timeout=1.0)
        assert stopping in done, "l'annulation n'a pas été rendue : la boucle de flush tourne encore"
        assert loop_task.done()
        assert sorted(signaled) == ["acc-0", "acc-1", "acc-2"]


class TestSingleCallbackStillReceivesEverything:
    async def test_rebinding_one_callback_after_the_handler_receives_late_refusals(self):
        from services.zmq_translation_handler import TranslationHandler
        mgr = _manager()
        TranslationHandler(pool_manager=mgr, pub_socket=AsyncMock()).cache_service = None
        received = []

        async def only(tasks):
            received.extend(t.task_id for t in tasks)

        mgr.set_rejection_handler(only)
        await mgr.stop_workers()
        await mgr.enqueue_task(_task("late"))

        assert received == ["late"]


class TestFailingCallbackUnderShield:
    async def test_stop_completes_counts_once_and_logs_ids_without_text(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager(normal_pool_size=1)
        cm = mgr.connection_manager
        gate = asyncio.Event()

        async def boom(tasks):
            await gate.wait()
            raise RuntimeError("publish failed")

        await _flush_loop_reporting(mgr, boom)
        stopping = asyncio.create_task(cm.stop())
        await asyncio.sleep(0)
        gate.set()
        await asyncio.wait_for(stopping, timeout=1.0)

        assert cm.get_stats()["pool_full_rejections"] == 3
        assert cm.get_stats()["pending_batches"] == 0
        errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR]
        assert any("acc-0" in line for line in errors)
        assert all(SENTINEL not in r.getMessage() for r in caplog.records)


class TestSecondCancellation:
    @pytest.mark.xfail(strict=True, reason=(
        "Réserve QA (#17063) : si `stop()` est lui-même annulé pendant le report "
        "protégé, l'annulation se propage à la boucle de flush, qui attend alors "
        "le report SANS bouclier ; le lot, déjà compté, n'est jamais signalé."
    ))
    async def test_refused_batch_is_signaled_even_if_stop_is_cancelled(self):
        mgr = _manager(normal_pool_size=1)
        cm = mgr.connection_manager
        gate = asyncio.Event()
        signaled = []

        async def slow(tasks):
            await gate.wait()
            signaled.extend(t.task_id for t in tasks)

        await _flush_loop_reporting(mgr, slow)
        stopping = asyncio.create_task(cm.stop())
        await asyncio.sleep(0.01)
        stopping.cancel()
        await asyncio.sleep(0)
        gate.set()
        await asyncio.gather(stopping, return_exceptions=True)
        await asyncio.sleep(0.05)

        assert sorted(signaled) == ["acc-0", "acc-1", "acc-2"]
