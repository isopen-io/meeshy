"""
#16782 / #16783 — la voie rapide ne peut plus affamer la file régulière, et son
débordement se compte.

Depuis #16780 les workers servent la voie rapide d'abord, sans quota : un flux
continu de sous-titres d'appel (ou de textes courts) retenait indéfiniment une
traduction ordinaire. Promesses tenues ici, sur le vrai `asyncio` :

1. Un worker qui a pris N tâches rapides d'affilée ALORS QUE sa file régulière
   attendait prend une tâche régulière : au plus tard à la (N+1)-ième prise.
2. File régulière vide : la voie rapide est servie sans détour ; voie rapide
   vide : la régulière tout de suite, et la rafale repart de zéro.
3. Sans état de rafale, `take_next_task` garde l'ordre strict (rétrocompat).
4. N vient de `TRANSLATOR_FAST_LANE_BURST`, validé (≥ 1), sinon le défaut.
5. Un sous-titre qui déborde d'une voie rapide pleine incrémente
   `caption_fast_lane_overflow`, exposé par les stats, sans journaliser son texte.
"""
import asyncio
import logging
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

CAPTION_ID = "call-caption:65f0c0ffee0000000000abcd:12000"
SENTINEL = "SENTINELLE-SOUS-TITRE-16783"
DEFAULT_BURST = 8


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


def _caption(task_id: str):
    return _task(task_id, text=f"{SENTINEL} {task_id}", message_id=CAPTION_ID)


def _queues(fast: int, regular: int):
    from services.zmq_pool.connection_manager import SignalingQueue
    work_arrived = asyncio.Event()
    fast_pool = SignalingQueue(10000, work_arrived)
    regular_pool = SignalingQueue(10000, work_arrived)
    for i in range(fast):
        fast_pool.put_nowait(_task(f"fast-{i}"))
    for i in range(regular):
        regular_pool.put_nowait(_task(f"regular-{i}"))
    return fast_pool, regular_pool, work_arrived


async def _take_many(count: int, fast_pool, regular_pool, work_arrived, burst=None):
    from services.zmq_pool.connection_manager import take_next_task
    options = {} if burst is None else {"burst": burst}
    taken = []
    for _ in range(count):
        task = await take_next_task((fast_pool, regular_pool), work_arrived, timeout=0.05, **options)
        taken.append(task.task_id if task else None)
    return taken


def _connection_manager(fast_pool_size: int = 2):
    from services.zmq_pool.connection_manager import ConnectionManager
    return ConnectionManager(normal_pool_size=10, any_pool_size=10, fast_pool_size=fast_pool_size)


class TestRegularTaskIsTakenWithinTheBurst:
    @pytest.mark.parametrize("limit", [1, 3, DEFAULT_BURST])
    async def test_both_lanes_busy_a_regular_task_comes_out_by_the_n_plus_one_th_take(self, limit):
        from services.zmq_pool.connection_manager import FastLaneBurst
        fast_pool, regular_pool, work_arrived = _queues(fast=500, regular=50)
        taken = await _take_many(limit + 1, fast_pool, regular_pool, work_arrived, FastLaneBurst(limit))
        assert taken[:limit] == [f"fast-{i}" for i in range(limit)]
        assert taken[limit] == "regular-0"

    async def test_under_saturation_exactly_one_regular_task_every_n_plus_one_takes(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        limit = 4
        fast_pool, regular_pool, work_arrived = _queues(fast=500, regular=50)
        taken = await _take_many(5 * (limit + 1), fast_pool, regular_pool, work_arrived, FastLaneBurst(limit))
        regular_positions = [i for i, t in enumerate(taken) if t.startswith("regular")]
        assert regular_positions == [limit + k * (limit + 1) for k in range(5)]

    async def test_an_empty_regular_lane_changes_nothing(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        limit = 3
        fast_pool, regular_pool, work_arrived = _queues(fast=limit + 5, regular=0)
        taken = await _take_many(limit + 5, fast_pool, regular_pool, work_arrived, FastLaneBurst(limit))
        assert taken == [f"fast-{i}" for i in range(limit + 5)]

    async def test_an_empty_fast_lane_serves_the_regular_lane_at_once_and_resets_the_burst(self):
        from services.zmq_pool.connection_manager import FastLaneBurst
        limit = 3
        burst = FastLaneBurst(limit)
        fast_pool, regular_pool, work_arrived = _queues(fast=limit - 1, regular=2)
        taken = await _take_many(limit, fast_pool, regular_pool, work_arrived, burst)
        assert taken == ["fast-0", "fast-1", "regular-0"]
        for i in range(10):
            fast_pool.put_nowait(_task(f"more-{i}"))
        taken = await _take_many(limit + 1, fast_pool, regular_pool, work_arrived, burst)
        assert taken == ["more-0", "more-1", "more-2", "regular-1"]

    async def test_without_a_burst_state_the_order_stays_strict(self):
        limit = DEFAULT_BURST
        fast_pool, regular_pool, work_arrived = _queues(fast=limit + 5, regular=1)
        taken = await _take_many(limit + 6, fast_pool, regular_pool, work_arrived)
        assert taken == [f"fast-{i}" for i in range(limit + 5)] + ["regular-0"]

    async def test_a_waiting_take_with_a_burst_wakes_on_a_deposit_and_honours_its_deadline(self):
        from services.zmq_pool.connection_manager import FastLaneBurst, take_next_task
        fast_pool, regular_pool, work_arrived = _queues(fast=0, regular=0)
        loop = asyncio.get_running_loop()
        started = loop.time()
        assert await take_next_task((fast_pool, regular_pool), work_arrived, timeout=0.05, burst=FastLaneBurst(2)) is None
        assert loop.time() - started < 0.2
        waiter = asyncio.create_task(
            take_next_task((fast_pool, regular_pool), work_arrived, timeout=1.0, burst=FastLaneBurst(2))
        )
        await asyncio.sleep(0.01)
        regular_pool.put_nowait(_task("late"))
        assert (await waiter).task_id == "late"


class TestBurstLimitFromEnvironment:
    def test_the_default_is_eight(self, monkeypatch):
        monkeypatch.delenv("TRANSLATOR_FAST_LANE_BURST", raising=False)
        assert _connection_manager().fast_lane_burst == DEFAULT_BURST

    def test_a_valid_value_is_respected(self, monkeypatch):
        monkeypatch.setenv("TRANSLATOR_FAST_LANE_BURST", "3")
        assert _connection_manager().fast_lane_burst == 3

    @pytest.mark.parametrize("raw", ["0", "-2", "abc", "", "2.5"])
    def test_an_invalid_value_falls_back_to_the_default(self, monkeypatch, raw):
        monkeypatch.setenv("TRANSLATOR_FAST_LANE_BURST", raw)
        assert _connection_manager().fast_lane_burst == DEFAULT_BURST


class TestCaptionOverflowIsCounted:
    async def test_the_counter_is_exposed_at_zero(self):
        assert _connection_manager().get_stats()["caption_fast_lane_overflow"] == 0

    async def test_a_caption_overflowing_a_full_fast_lane_is_counted_and_lands_in_the_regular_lane(self):
        cm = _connection_manager()
        cm.fast_pool.put_nowait(_task("a"))
        cm.fast_pool.put_nowait(_task("b"))
        assert await cm.enqueue_task(_caption("cap")) is True
        assert cm.get_stats()["caption_fast_lane_overflow"] == 1
        assert cm.normal_pool.get_nowait().task_id == "cap"

    async def test_a_caption_with_room_in_the_fast_lane_is_not_counted(self):
        cm = _connection_manager()
        assert await cm.enqueue_task(_caption("cap")) is True
        assert cm.get_stats()["caption_fast_lane_overflow"] == 0

    async def test_an_ordinary_short_text_on_a_full_fast_lane_is_not_counted(self):
        cm = _connection_manager()
        cm.enable_priority_queue = True
        cm.fast_pool.put_nowait(_task("a"))
        cm.fast_pool.put_nowait(_task("b"))
        assert await cm.enqueue_task(_task("short")) is True
        assert cm.get_stats()["caption_fast_lane_overflow"] == 0

    async def test_the_overflow_log_names_the_task_never_its_text(self, caplog):
        cm = _connection_manager()
        cm.fast_pool.put_nowait(_task("a"))
        cm.fast_pool.put_nowait(_task("b"))
        with caplog.at_level(logging.DEBUG):
            await cm.enqueue_task(_caption("cap-overflow"))
        assert SENTINEL not in caplog.text
        assert "cap-overflow" in caplog.text

    async def test_the_pool_manager_stats_carry_the_counter(self):
        mgr = _manager()
        assert mgr.get_stats()["caption_fast_lane_overflow"] == 0


def _manager():
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        return mgr_mod.TranslationPoolManager(
            normal_pool_size=10000,
            any_pool_size=10000,
            normal_workers=2,
            any_workers=2,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original


async def _wait_until(predicate, timeout: float = 5.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not predicate():
        if loop.time() > deadline:
            return False
        await asyncio.sleep(0.001)
    return True


class TestRealWorkersServeRegularWorkDuringACaptionStream:
    @pytest.mark.parametrize("regular_lane", ["normal", "any"])
    async def test_a_regular_task_is_processed_while_captions_keep_flowing(self, monkeypatch, regular_lane):
        monkeypatch.delenv("TRANSLATOR_FAST_LANE_BURST", raising=False)
        mgr = _manager()
        cm = mgr.connection_manager
        taken: list = []

        async def record(task, worker_name):
            taken.append((task.task_id, cm.fast_pool.qsize()))
            await asyncio.sleep(0)

        mgr._process_task = record
        captions = 2000
        for i in range(captions):
            assert await mgr.enqueue_task(_caption(f"cap-{i}")) is True
        conv_id = "any" if regular_lane == "any" else "c1"
        regular_pool = cm.any_pool if regular_lane == "any" else cm.normal_pool
        regular_pool.put_nowait(_task("regular", text="x" * 400, conv_id=conv_id))

        await mgr.start_workers()
        try:
            assert await _wait_until(lambda: any(t == "regular" for t, _ in taken), timeout=10.0)
        finally:
            await mgr.stop_workers()

        position = next(i for i, (t, _) in enumerate(taken) if t == "regular")
        fast_left = next(q for t, q in taken if t == "regular")
        workers = mgr.normal_pool.current_workers + mgr.any_pool.current_workers
        assert position <= workers * (DEFAULT_BURST + 1)
        assert fast_left > captions // 2
