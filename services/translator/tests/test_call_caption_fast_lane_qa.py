"""
#16780 — vérification indépendante (QA) : l'attente sur le drapeau partagé
garde ses bornes. Un réveil pour rien ne prolonge jamais l'attente au-delà de
son échéance, sans quoi un worker excédentaire (scale DOWN) ou un arrêt
pourraient ne jamais revenir tant qu'une autre file reçoit du travail.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def _task(task_id: str):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id="65f0c0ffee0000000000beef",
        text="hi",
        source_language="en",
        target_languages=["fr"],
        conversation_id="any",
    )


class TestSpuriousWakesNeverExtendTheWait:
    async def test_work_arriving_in_an_unserved_queue_does_not_hold_the_worker_past_its_deadline(self):
        from services.zmq_pool.connection_manager import ConnectionManager, take_next_task
        cm = ConnectionManager(normal_pool_size=1000, any_pool_size=1000, fast_pool_size=1000)
        loop = asyncio.get_running_loop()
        stop = False

        async def feed_unserved_queue():
            i = 0
            while not stop:
                await cm.any_pool.put(_task(f"any-{i}"))
                i += 1
                await asyncio.sleep(0.02)

        feeder = asyncio.create_task(feed_unserved_queue())
        started = loop.time()
        try:
            result = await asyncio.wait_for(
                take_next_task((cm.fast_pool, cm.normal_pool), cm.work_arrived, timeout=0.3),
                timeout=2.0,
            )
        finally:
            stop = True
            await feeder
        elapsed = loop.time() - started
        assert result is None
        assert elapsed < 0.4
        assert cm.any_pool.qsize() > 0

    async def test_a_worker_scaled_down_exits_while_the_fast_lane_keeps_waking_it(self):
        import services.zmq_pool.zmq_pool_manager as mgr_mod
        original = mgr_mod.CACHE_AVAILABLE
        mgr_mod.CACHE_AVAILABLE = False
        try:
            mgr = mgr_mod.TranslationPoolManager(
                normal_pool_size=1000, any_pool_size=1000,
                normal_workers=2, any_workers=1, enable_dynamic_scaling=False,
            )
        finally:
            mgr_mod.CACHE_AVAILABLE = original

        async def record(task, worker_name):
            return None

        mgr._process_task = record
        tasks = await mgr.start_workers()
        normal_tasks = tasks[:2]
        try:
            mgr.normal_pool.current_workers = 1
            await mgr.connection_manager.fast_pool.put(_task("wake"))
            done, _ = await asyncio.wait({normal_tasks[1]}, timeout=1.5)
            assert normal_tasks[1] in done
            assert not normal_tasks[0].done()
        finally:
            await mgr.stop_workers()
