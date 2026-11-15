"""
#18535 — QA : un report abandonné à l'arrêt ne survit pas à `stop()`, et sa
ligne compte les tâches de TOUS les lots refusés, pas du premier seulement.
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def _task(task_id: str, source_language: str = "en"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text="q" * 200,
        source_language=source_language,
        target_languages=["fr"],
        conversation_id="c1",
    )


def _manager(grace_s: float):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        mgr = mgr_mod.TranslationPoolManager(
            normal_pool_size=1,
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
    cm.rejected_report_grace_s = grace_s
    return mgr


def _blocked_handler(calls, cancelled):
    never = asyncio.Event()

    async def handler(tasks):
        calls.append([t.task_id for t in tasks])
        try:
            await never.wait()
        except asyncio.CancelledError:
            cancelled.append([t.task_id for t in tasks])
            raise
    return handler


async def _stop_with_blocked_report(mgr, tasks):
    cm = mgr.connection_manager
    calls, cancelled = [], []
    cm.on_tasks_rejected = _blocked_handler(calls, cancelled)
    cm.normal_pool.put_nowait(_task("blocker"))
    for task in tasks:
        await mgr.enqueue_task(task)
    await cm.start()
    await asyncio.sleep(0.05)
    stopping = asyncio.create_task(cm.stop())
    done, _ = await asyncio.wait({stopping}, timeout=2.0)
    await asyncio.sleep(0)
    return stopping, done, calls, cancelled


class TestAbandonedReportDoesNotOutliveStop:
    async def test_the_blocked_callback_is_cancelled_once_stop_returns(self):
        mgr = _manager(grace_s=0.1)
        stopping, done, calls, cancelled = await _stop_with_blocked_report(
            mgr, [_task(f"acc-{i}") for i in range(3)]
        )

        assert stopping in done
        assert calls == [["acc-0", "acc-1", "acc-2"]]
        assert cancelled == calls, "le report abandonné tourne encore après l'arrêt"


class TestAbandonLineCountsEveryRefusedBatch:
    async def test_two_refused_batches_are_counted_together(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager(grace_s=0.1)
        tasks = [_task(f"en-{i}", "en") for i in range(2)] + [_task(f"es-{i}", "es") for i in range(3)]

        stopping, done, calls, _ = await _stop_with_blocked_report(mgr, tasks)

        assert stopping in done
        assert len(calls) == 1, "le premier lot bloque : le second n'est jamais remis"
        lines = [r.getMessage() for r in caplog.records if "abandon" in r.getMessage().lower()]
        assert len(lines) == 1, lines
        assert lines[0].endswith(": 5 tasks"), lines[0]
