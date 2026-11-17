"""
#18535 — un arrêt du traducteur se termine même si le rappel de rejet ne rend
jamais la main.

Depuis #17132, le report des lots refusés survit à chaque annulation de la
boucle de flush. Il est désormais borné, mais seulement une fois une annulation
reçue : le délai part de la PREMIÈRE annulation, une annulation suivante ne le
relance pas, et un report qui finit dans le délai n'est jamais abandonné.
"""
import asyncio
import logging
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-QA-18535"


def _task(task_id: str):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=f"{SENTINEL} " + "q" * 200,
        source_language="en",
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


async def _flush_loop_reporting(mgr, handler):
    cm = mgr.connection_manager
    cm.on_tasks_rejected = handler
    cm.normal_pool.put_nowait(_task("blocker"))
    for i in range(3):
        await mgr.enqueue_task(_task(f"acc-{i}"))
    await cm.start()
    await asyncio.sleep(0.05)


def _blocked_forever(started):
    never = asyncio.Event()

    async def handler(tasks):
        started.set()
        await never.wait()
    return handler


def _abandon_lines(caplog):
    return [
        r for r in caplog.records
        if r.levelno >= logging.WARNING and "abandon" in r.getMessage().lower()
    ]


class TestDefaultGrace:
    def test_the_grace_is_a_named_module_constant_of_a_few_seconds(self):
        from services.zmq_pool import connection_manager as module
        assert 1.0 <= module.REJECTED_REPORT_SHUTDOWN_GRACE_S <= 10.0
        fresh = module.ConnectionManager(normal_pool_size=1, any_pool_size=1)
        assert fresh.rejected_report_grace_s == module.REJECTED_REPORT_SHUTDOWN_GRACE_S


@pytest.mark.parametrize("extra_cancels", [0, 1, 2])
class TestBlockedCallbackNoLongerHangsStop:
    async def test_stop_completes_and_logs_one_line_without_secret(self, caplog, extra_cancels):
        caplog.set_level(logging.DEBUG)
        mgr = _manager(grace_s=0.1)
        cm = mgr.connection_manager
        started = asyncio.Event()

        await _flush_loop_reporting(mgr, _blocked_forever(started))
        stopping = asyncio.create_task(cm.stop())
        await asyncio.wait_for(started.wait(), timeout=1.0)
        for _ in range(extra_cancels):
            stopping.cancel()
            await asyncio.sleep(0)
        done, _ = await asyncio.wait({stopping}, timeout=1.0)

        assert stopping in done, "un rappel bloqué empêche encore l'arrêt de se terminer"
        assert cm._batch_flush_task.done()
        lines = _abandon_lines(caplog)
        assert len(lines) == 1, [r.getMessage() for r in lines]
        message = lines[0].getMessage()
        assert message.startswith("[TRANSLATOR]")
        assert "3 tasks" in message
        assert lines[0].exc_info is None
        assert all(SENTINEL not in r.getMessage() for r in caplog.records)
        assert all("acc-" not in r.getMessage() for r in lines)


class TestGraceStartsAtTheFirstCancellation:
    async def test_repeated_cancellations_do_not_extend_the_grace(self):
        mgr = _manager(grace_s=0.2)
        cm = mgr.connection_manager
        started = asyncio.Event()
        loop = asyncio.get_running_loop()

        await _flush_loop_reporting(mgr, _blocked_forever(started))
        stopping = asyncio.create_task(cm.stop())
        await asyncio.wait_for(started.wait(), timeout=1.0)
        first = loop.time()
        while not stopping.done() and loop.time() - first < 1.5:
            stopping.cancel()
            await asyncio.sleep(0.02)

        assert stopping.done(), "chaque annulation relance le délai : l'arrêt ne finit jamais"
        assert loop.time() - first < 0.6

    async def test_a_report_finishing_within_the_grace_is_never_abandoned(self, caplog):
        caplog.set_level(logging.DEBUG)
        mgr = _manager(grace_s=0.5)
        cm = mgr.connection_manager
        signaled = []

        async def slow(tasks):
            await asyncio.sleep(0.15)
            signaled.extend(t.task_id for t in tasks)

        await _flush_loop_reporting(mgr, slow)
        stopping = asyncio.create_task(cm.stop())
        await asyncio.sleep(0.01)
        for _ in range(3):
            stopping.cancel()
            await asyncio.sleep(0.02)
        done, _ = await asyncio.wait({stopping}, timeout=1.0)

        assert stopping in done
        assert sorted(signaled) == ["acc-0", "acc-1", "acc-2"]
        assert _abandon_lines(caplog) == []


class TestWithoutCancellationNothingChanges:
    async def test_the_report_error_is_raised_as_is(self):
        mgr = _manager(grace_s=0.01)
        cm = mgr.connection_manager

        async def raising_report(batches):
            await asyncio.sleep(0.05)
            raise RuntimeError("as is")

        cm._report_batches = raising_report
        with pytest.raises(RuntimeError, match="as is"):
            await cm._report_through_cancellation([[_task("x")]])
