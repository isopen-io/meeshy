"""
#16780 — un sous-titre d'appel est pris par un worker dès son arrivée.

Trois promesses, tenues par la vraie boucle de worker et le vrai `asyncio`,
sans modèle ML (`_process_task` est remplacé par un enregistreur) :

1. Pool au repos, une tâche de la voie rapide est prise en moins de 50 ms —
   les workers ne dorment plus jusqu'à 1 s sur la seule file régulière.
2. Un sous-titre (`is_live_call_caption`) prend la voie rapide quelle que soit
   sa longueur, sans jamais passer par l'accumulateur de lots, et sans
   dépendre de `utils.performance`. Voie rapide pleine : la file régulière
   directe, et un refus qui se dit (jamais une perte silencieuse).
3. Sous concurrence, chaque tâche est prise exactement une fois.
"""
import asyncio
import statistics
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

CAPTION_ID = "call-caption:65f0c0ffee0000000000abcd:12000"
LONG_TEXT = "x" * 400


def _task(task_id: str, text: str = "hi", message_id: str = "65f0c0ffee0000000000beef", conv_id: str = "c1"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=message_id,
        text=text,
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _manager(normal_workers: int = 2, any_workers: int = 2):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        return mgr_mod.TranslationPoolManager(
            normal_pool_size=10000,
            any_pool_size=10000,
            normal_workers=normal_workers,
            any_workers=any_workers,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original


def _recording(mgr):
    loop = asyncio.get_running_loop()
    taken: list = []

    async def record(task, worker_name):
        taken.append((task, worker_name, loop.time()))

    mgr._process_task = record
    return taken


async def _wait_until(predicate, timeout: float = 5.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not predicate():
        if loop.time() > deadline:
            return False
        await asyncio.sleep(0.001)
    return True


def _connection_manager():
    from services.zmq_pool.connection_manager import ConnectionManager
    return ConnectionManager(normal_pool_size=10, any_pool_size=10, fast_pool_size=2)


class TestIdlePoolTakesFastLaneAtOnce:
    async def test_idle_workers_take_a_fast_lane_task_within_50_ms(self):
        mgr = _manager()
        taken = _recording(mgr)
        loop = asyncio.get_running_loop()
        await mgr.start_workers()
        delays = []
        try:
            for i in range(20):
                await asyncio.sleep(0.03)
                sent_at = loop.time()
                await mgr.connection_manager.fast_pool.put(_task(f"fast-{i}"))
                assert await _wait_until(lambda: len(taken) == i + 1, timeout=2.0)
                delays.append((taken[-1][2] - sent_at) * 1000)
        finally:
            await mgr.stop_workers()
        print(
            f"\n[#16780] fast-lane pickup ms p50={statistics.median(delays):.2f} "
            f"max={max(delays):.2f} raw={[round(d, 2) for d in delays]}"
        )
        assert max(delays) < 50

    async def test_an_idle_pool_still_takes_a_regular_task_at_once(self):
        mgr = _manager()
        taken = _recording(mgr)
        loop = asyncio.get_running_loop()
        await mgr.start_workers()
        try:
            await asyncio.sleep(0.03)
            sent_at = loop.time()
            await mgr.connection_manager.normal_pool.put(_task("regular"))
            assert await _wait_until(lambda: len(taken) == 1, timeout=2.0)
        finally:
            await mgr.stop_workers()
        assert (taken[0][2] - sent_at) * 1000 < 50

    async def test_the_fast_lane_is_served_before_the_regular_pool(self):
        mgr = _manager(normal_workers=2, any_workers=2)
        cm = mgr.connection_manager
        await cm.normal_pool.put(_task("regular"))
        await cm.fast_pool.put(_task("fast"))
        assert (await mgr._get_next_task(cm.fast_pool, cm.normal_pool)).task_id == "fast"
        assert (await mgr._get_next_task(cm.fast_pool, cm.normal_pool)).task_id == "regular"


class TestLiveCaptionAlwaysTakesTheFastLane:
    async def test_a_long_caption_goes_to_the_fast_lane(self):
        cm = _connection_manager()
        cm.enable_priority_queue = True
        assert await cm.enqueue_task(_task("cap", text=LONG_TEXT, message_id=CAPTION_ID)) is True
        assert cm.fast_pool.qsize() == 1
        assert cm._batch_accumulator == {}

    async def test_a_caption_takes_the_fast_lane_without_the_performance_module(self):
        cm = _connection_manager()
        cm.enable_priority_queue = False
        assert await cm.enqueue_task(_task("cap", text="hi", message_id="call-65f0c0ffee-12000")) is True
        assert cm.fast_pool.qsize() == 1
        assert cm._batch_accumulator == {}

    async def test_a_caption_never_lands_in_the_batch_accumulator_when_the_fast_lane_is_full(self):
        cm = _connection_manager()
        await cm.fast_pool.put(_task("a"))
        await cm.fast_pool.put(_task("b"))
        assert await cm.enqueue_task(_task("cap", text=LONG_TEXT, message_id=CAPTION_ID)) is True
        assert cm._batch_accumulator == {}
        assert cm.normal_pool.get_nowait().task_id == "cap"

    async def test_a_caption_refused_everywhere_is_reported_not_dropped(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(normal_pool_size=1, any_pool_size=1, fast_pool_size=1)
        await cm.fast_pool.put(_task("a"))
        await cm.normal_pool.put(_task("b"))
        assert await cm.enqueue_task(_task("cap", text=LONG_TEXT, message_id=CAPTION_ID)) is False
        assert cm.stats["pool_full_rejections"] == 1
        assert cm._batch_accumulator == {}

    async def test_an_ordinary_long_message_keeps_the_batch_path(self):
        cm = _connection_manager()
        cm.enable_priority_queue = True
        assert await cm.enqueue_task(_task("msg", text=LONG_TEXT)) is True
        assert cm.fast_pool.qsize() == 0
        assert sum(len(v) for v in cm._batch_accumulator.values()) == 1


class TestEveryTaskIsTakenExactlyOnce:
    async def test_tasks_spread_over_three_queues_and_many_workers_are_each_taken_once(self):
        mgr = _manager(normal_workers=6, any_workers=4)
        taken = _recording(mgr)
        cm = mgr.connection_manager
        await mgr.start_workers()
        queues = (cm.fast_pool, cm.normal_pool, cm.any_pool)
        expected = []
        try:
            for wave in range(40):
                for i in range(25):
                    task_id = f"w{wave}-{i}"
                    expected.append(task_id)
                    await queues[(wave + i) % 3].put(_task(task_id))
                await asyncio.sleep(0 if wave % 2 else 0.002)
            assert await _wait_until(lambda: len(taken) >= len(expected), timeout=10.0)
            await asyncio.sleep(0.05)
        finally:
            await mgr.stop_workers()
        ids = [task.task_id for task, _, _ in taken]
        assert len(ids) == len(expected)
        assert sorted(ids) == sorted(expected)
        assert all(q.qsize() == 0 for q in queues)

    async def test_a_worker_stopped_while_idle_consumes_nothing(self):
        mgr = _manager(normal_workers=2, any_workers=2)
        taken = _recording(mgr)
        cm = mgr.connection_manager
        tasks = await mgr.start_workers()
        await asyncio.sleep(0.02)
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await cm.fast_pool.put(_task("after-stop"))
        assert taken == []
        assert cm.fast_pool.qsize() == 1
