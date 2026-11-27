"""
#3649 — le traducteur se voit sur `GET /metrics` au-delà de l'audio :

1. `translation_cache_requests_total{result}` compte chaque lecture du cache de
   traduction texte, `hit` ou `miss` ; une tâche au repos, qui ne lit rien, ne
   compte rien.
2. `translator_pool_rejections_total{pool}` compte chaque tâche refusée par une
   file pleine, tâche par tâche pour un lot refusé.
3. `translator_queue_depth{pool}` lit la profondeur vivante des trois files.

Les étiquettes sont fermées (`hit|miss`, `normal|any|fast`) : aucun texte, aucun
identifiant, aucune langue n'entre dans une série.
"""

import asyncio
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from prometheus_client import CollectorRegistry

from utils.audio_pipeline_metrics import PROCESS_AUDIO_PIPELINE_METRICS, metrics_router
from utils.translator_metrics import (
    CACHE_RESULTS,
    QUEUE_POOLS,
    PROCESS_TRANSLATOR_METRICS,
    translator_metrics,
)

SENTINEL = "SENTINELLE-TEXTE-PRIVE-3649"


def _metrics():
    return translator_metrics(CollectorRegistry(auto_describe=True))


def _sample(metrics, name: str, labels: dict) -> float:
    return metrics.registry.get_sample_value(name, labels) or 0.0


class _FakeRedis:
    def __init__(self, store=None):
        self.store = dict(store or {})

    async def get(self, key):
        return self.store.get(key)


def _cache(metrics, store=None):
    from services.redis_service import TranslationCacheService

    return TranslationCacheService(_FakeRedis(store), metrics=metrics)


@pytest.fixture
def ordinary_regime():
    from services.task_privacy import at_rest_scope

    with at_rest_scope(False):
        yield


def test_labels_are_closed_sets():
    assert CACHE_RESULTS == ("hit", "miss")
    assert QUEUE_POOLS == ("normal", "any", "fast")
    metrics = _metrics()
    with pytest.raises(ValueError):
        metrics.count_cache("expired")
    with pytest.raises(ValueError):
        metrics.count_rejections("priority", 1)


def test_a_cache_miss_then_a_hit_are_counted(ordinary_regime):
    metrics = _metrics()
    cache = _cache(metrics)

    assert asyncio.run(cache.get_translation(SENTINEL, "en", "fr")) is None
    cache_hash = cache._compute_hash(SENTINEL, "en", "fr", "premium")
    cache.redis.store[cache.key_pattern.format(hash=cache_hash)] = json.dumps({"translated_text": "Bonjour"})
    assert asyncio.run(cache.get_translation(SENTINEL, "en", "fr"))["translated_text"] == "Bonjour"

    assert _sample(metrics, "translation_cache_requests_total", {"result": "miss"}) == 1
    assert _sample(metrics, "translation_cache_requests_total", {"result": "hit"}) == 1


def test_a_premium_fallback_counts_one_hit_not_a_miss(ordinary_regime):
    metrics = _metrics()
    cache = _cache(metrics)
    premium_hash = cache._compute_hash(SENTINEL, "en", "fr", "premium")
    cache.redis.store[cache.key_pattern.format(hash=premium_hash)] = json.dumps({"translated_text": "Salut"})

    assert asyncio.run(cache.get_translation(SENTINEL, "en", "fr", "basic"))["translated_text"] == "Salut"

    assert _sample(metrics, "translation_cache_requests_total", {"result": "hit"}) == 1
    assert _sample(metrics, "translation_cache_requests_total", {"result": "miss"}) == 0


def test_a_task_at_rest_reads_nothing_and_counts_nothing():
    from services.task_privacy import at_rest_scope

    metrics = _metrics()
    cache = _cache(metrics)
    with at_rest_scope(True):
        assert asyncio.run(cache.get_translation(SENTINEL, "en", "fr")) is None

    assert _sample(metrics, "translation_cache_requests_total", {"result": "miss"}) == 0
    assert _sample(metrics, "translation_cache_requests_total", {"result": "hit"}) == 0


def _task(task_id: str, conv_id: str = "c1"):
    from services.zmq_models import TranslationTask

    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=f"{SENTINEL} {task_id}",
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _manager(metrics):
    from services.zmq_pool.connection_manager import ConnectionManager

    manager = ConnectionManager(normal_pool_size=1, any_pool_size=1, fast_pool_size=1, metrics=metrics)
    manager.enable_batching = False
    manager.enable_priority_queue = False
    return manager


def test_a_full_pool_counts_each_refused_task_by_pool():
    metrics = _metrics()
    manager = _manager(metrics)

    async def scenario():
        assert await manager._enqueue_single_task(_task("n1")) is True
        assert await manager._enqueue_single_task(_task("n2")) is False
        assert await manager._enqueue_single_task(_task("a1", "any")) is True
        assert await manager._enqueue_single_task(_task("a2", "any")) is False
        assert await manager._enqueue_batch([_task("b1"), _task("b2"), _task("b3")]) is False

    asyncio.run(scenario())

    assert _sample(metrics, "translator_pool_rejections_total", {"pool": "normal"}) == 4
    assert _sample(metrics, "translator_pool_rejections_total", {"pool": "any"}) == 1
    assert manager.stats["pool_full_rejections"] == 5


def test_queue_depth_reads_the_live_size_of_each_pool():
    metrics = _metrics()
    manager = _manager(metrics)
    manager.normal_pool.put_nowait(_task("n1"))
    manager.fast_pool.put_nowait(_task("f1"))

    assert _sample(metrics, "translator_queue_depth", {"pool": "normal"}) == 1
    assert _sample(metrics, "translator_queue_depth", {"pool": "fast"}) == 1
    assert _sample(metrics, "translator_queue_depth", {"pool": "any"}) == 0

    manager.normal_pool.get_nowait()
    assert _sample(metrics, "translator_queue_depth", {"pool": "normal"}) == 0


def test_get_metrics_serves_the_new_series_without_any_text(ordinary_regime):
    metrics = _metrics()
    cache = _cache(metrics)
    _manager(metrics)
    asyncio.run(cache.get_translation(SENTINEL, "en", "fr"))
    app = FastAPI()
    app.include_router(metrics_router(metrics.registry))

    body = TestClient(app).get("/metrics").text

    assert 'translation_cache_requests_total{result="miss"} 1.0' in body
    assert 'translator_queue_depth{pool="normal"} 0.0' in body
    assert "translator_pool_rejections_total" in body
    assert SENTINEL not in body


def test_the_process_metrics_live_in_the_registry_get_metrics_serves():
    assert PROCESS_TRANSLATOR_METRICS.registry is PROCESS_AUDIO_PIPELINE_METRICS.registry
