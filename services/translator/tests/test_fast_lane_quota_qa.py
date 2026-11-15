"""
#16782 / #16783 — contre-épreuves QA du quota de voie rapide.

Ce que ce fichier prouve, en plus de `test_fast_lane_quota.py` :

1. Sous un flux CONTINU (producteur actif pendant que N workers consomment),
   chaque tâche est prise exactement une fois, et aucune série de prises
   rapides faites pendant que la file régulière attend ne dépasse N × limite.
2. Une annulation (arrêt des workers) ne consomme aucune tâche.
3. Un worker dont la rafale est épuisée, réveillé pour rien puis relevé par un
   dépôt régulier, sert la régulière avant la rapide ; la rafale ne fuit pas
   quand la régulière se vide entre deux prises.
4. Un lot (`_batch_tasks`) pris au titre du quota est remis intact.
5. Échéance tenue par un worker à rafale épuisée devant des files vides.
6. Un sous-titre qui déborde vers une file régulière elle-même pleine est
   compté ET refusé, et ce refus reste compté par `pool_full_rejections`.
"""
import asyncio
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

CAPTION_ID = "call-caption:65f0c0ffee0000000000abcd:12000"


def _task(task_id: str, message_id: str = "65f0c0ffee0000000000beef", conv_id: str = "c1"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=message_id,
        text="hi",
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _lanes():
    from services.zmq_pool.connection_manager import SignalingQueue
    work_arrived = asyncio.Event()
    return SignalingQueue(100000, work_arrived), SignalingQueue(100000, work_arrived), work_arrived


async def _take(fast, regular, work_arrived, burst, timeout=0.05):
    from services.zmq_pool.connection_manager import take_next_task
    return await take_next_task((fast, regular), work_arrived, timeout=timeout, burst=burst)


class TestContinuousMixedStreamWithManyWorkers:
    @pytest.mark.parametrize("workers,limit", [(1, 1), (3, 2), (4, 8)])
    async def test_every_task_is_taken_once_and_no_fast_run_exceeds_workers_times_limit(self, workers, limit):
        from services.zmq_pool.connection_manager import FastLaneBurst
        fast, regular, work_arrived = _lanes()
        rng = random.Random(16782)
        produced = []
        taken = []
        runs = {"current": 0, "max": 0}
        done = asyncio.Event()

        async def producer():
            for i in range(3000):
                lane, prefix = (fast, "f") if rng.random() < 0.85 else (regular, "r")
                task_id = f"{prefix}-{i}"
                produced.append(task_id)
                lane.put_nowait(_task(task_id))
                if i % 7 == 0:
                    await asyncio.sleep(0)
            done.set()

        async def worker():
            burst = FastLaneBurst(limit)
            while not (done.is_set() and fast.empty() and regular.empty()):
                task = await _take(fast, regular, work_arrived, burst, timeout=0.02)
                if task is None:
                    continue
                taken.append(task.task_id)
                if task.task_id.startswith("f") and not regular.empty():
                    runs["current"] += 1
                    runs["max"] = max(runs["max"], runs["current"])
                else:
                    runs["current"] = 0
                await asyncio.sleep(0)

        await asyncio.wait_for(asyncio.gather(producer(), *(worker() for _ in range(workers))), timeout=20)

        assert sorted(taken) == sorted(produced)
        assert len(taken) == len(set(taken))
        assert runs["max"] <= workers * limit

    async def test_a_regular_task_deposited_during_a_live_caption_stream_is_taken_quickly(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        limit = 3
        fast, regular, work_arrived = _lanes()
        for i in range(50):
            fast.put_nowait(_task(f"f-{i}"))
        taken = []
        stop = asyncio.Event()

        async def caption_stream():
            i = 50
            while not stop.is_set():
                for _ in range(5):
                    fast.put_nowait(_task(f"f-{i}"))
                    i += 1
                await asyncio.sleep(0)

        async def worker():
            burst = FastLaneBurst(limit)
            while not stop.is_set():
                task = await _take(fast, regular, work_arrived, burst)
                if task is not None:
                    taken.append(task.task_id)
                    if task.task_id == "regular":
                        stop.set()
                await asyncio.sleep(0)

        stream = asyncio.create_task(caption_stream())
        workers = [asyncio.create_task(worker()) for _ in range(2)]
        await asyncio.sleep(0.01)
        deposited_at = len(taken)
        regular.put_nowait(_task("regular"))
        await asyncio.wait_for(asyncio.gather(*workers), timeout=5)
        stop.set()
        await stream

        assert taken.index("regular") - deposited_at <= 2 * limit + 1
        assert sum(1 for t in taken if t.startswith("f")) > 2 * limit


class TestCancellationConsumesNothing:
    async def test_cancelled_waiting_workers_leave_every_queued_task_in_place(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        fast, regular, work_arrived = _lanes()
        bursts = [FastLaneBurst(1) for _ in range(4)]
        waiters = [asyncio.create_task(_take(fast, regular, work_arrived, b, timeout=5.0)) for b in bursts]
        await asyncio.sleep(0.01)
        for w in waiters:
            w.cancel()
        results = await asyncio.gather(*waiters, return_exceptions=True)
        assert all(isinstance(r, asyncio.CancelledError) for r in results)
        fast.put_nowait(_task("f"))
        regular.put_nowait(_task("r"))
        assert (fast.qsize(), regular.qsize()) == (1, 1)


class TestExhaustedBurstEdgeCases:
    async def test_an_exhausted_worker_woken_for_nothing_serves_the_next_regular_deposit_first(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        limit = 2
        burst = FastLaneBurst(limit)
        fast, regular, work_arrived = _lanes()
        for i in range(limit):
            fast.put_nowait(_task(f"f-{i}"))
        regular.put_nowait(_task("r-stolen"))
        assert [(await _take(fast, regular, work_arrived, burst)).task_id for _ in range(limit)] == ["f-0", "f-1"]
        assert burst.exhausted()

        waiter = asyncio.create_task(_take(fast, regular, work_arrived, burst, timeout=1.0))
        assert regular.get_nowait().task_id == "r-stolen"
        await asyncio.sleep(0)
        regular.put_nowait(_task("r-late"))
        fast.put_nowait(_task("f-late"))
        assert (await waiter).task_id == "r-late"
        assert not burst.exhausted()

    async def test_a_regular_lane_emptied_between_takes_resets_the_burst(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        limit = 2
        burst = FastLaneBurst(limit)
        fast, regular, work_arrived = _lanes()
        for i in range(10):
            fast.put_nowait(_task(f"f-{i}"))
        regular.put_nowait(_task("r-0"))
        await _take(fast, regular, work_arrived, burst)
        await _take(fast, regular, work_arrived, burst)
        assert burst.exhausted()
        regular.get_nowait()
        assert (await _take(fast, regular, work_arrived, burst)).task_id == "f-2"
        assert burst.consecutive == 0
        regular.put_nowait(_task("r-1"))
        taken = [(await _take(fast, regular, work_arrived, burst)).task_id for _ in range(limit + 1)]
        assert taken == ["f-3", "f-4", "r-1"]

    async def test_an_exhausted_worker_before_empty_queues_honours_its_deadline(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        burst = FastLaneBurst(1)
        burst.consecutive = 1
        fast, regular, work_arrived = _lanes()
        loop = asyncio.get_running_loop()
        started = loop.time()
        assert await _take(fast, regular, work_arrived, burst, timeout=0.05) is None
        assert 0.04 <= loop.time() - started < 0.3

    async def test_a_batch_taken_under_the_quota_comes_out_intact(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        burst = FastLaneBurst(1)
        fast, regular, work_arrived = _lanes()
        members = [_task(f"m-{i}") for i in range(3)]
        batch = _task("batch_m-0_3")
        batch._batch_tasks = members
        for i in range(5):
            fast.put_nowait(_task(f"f-{i}"))
        regular.put_nowait(batch)
        first = await _take(fast, regular, work_arrived, burst)
        second = await _take(fast, regular, work_arrived, burst)
        assert first.task_id == "f-0"
        assert second is batch
        assert second._batch_tasks is members


class TestCaptionOverflowOntoAFullRegularLane:
    async def test_the_overflow_is_counted_and_the_refusal_still_said(self):
        from services.zmq_pool.connection_manager import ConnectionManager
        cm = ConnectionManager(normal_pool_size=1, any_pool_size=1, fast_pool_size=1)
        cm.fast_pool.put_nowait(_task("a"))
        cm.normal_pool.put_nowait(_task("b"))
        assert await cm.enqueue_task(_task("cap", message_id=CAPTION_ID)) is False
        stats = cm.get_stats()
        assert stats["caption_fast_lane_overflow"] == 1
        assert stats["pool_full_rejections"] == 1
