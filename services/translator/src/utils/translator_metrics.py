"""
Ce que le traducteur fait de ses traductions texte (#3649).

- `translation_cache_requests_total{result}` : chaque lecture du cache de
  traduction texte, `hit` ou `miss`. Le taux de hit en est le rapport.
- `translator_pool_rejections_total{pool}` : chaque tâche refusée parce que sa
  file est pleine, une par tâche pour un lot refusé.
- `translator_queue_depth{pool}` : la profondeur vivante de chaque file, lue à
  l'instant où un collecteur vient lire `GET /metrics`.

Les séries vivent dans le registre que `GET /metrics` sert déjà (celui de
`audio_pipeline_seconds`). Les étiquettes sont fermées : aucun texte, aucun
identifiant, aucune langue n'entre dans une série.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from prometheus_client import CollectorRegistry, Counter, Gauge

from utils.audio_pipeline_metrics import PROCESS_AUDIO_PIPELINE_METRICS

CACHE_RESULTS: tuple[str, ...] = ("hit", "miss")
QUEUE_POOLS: tuple[str, ...] = ("normal", "any", "fast")


def _closed(value: str, allowed: tuple[str, ...], what: str) -> str:
    if value not in allowed:
        raise ValueError(f"unknown {what}: {value}")
    return value


@dataclass(frozen=True)
class TranslatorMetrics:
    registry: CollectorRegistry
    cache_requests: Counter
    pool_rejections: Counter
    queue_depth: Gauge

    def count_cache(self, result: str) -> None:
        self.cache_requests.labels(result=_closed(result, CACHE_RESULTS, "cache result")).inc()

    def count_rejections(self, pool: str, count: int) -> None:
        self.pool_rejections.labels(pool=_closed(pool, QUEUE_POOLS, "pool")).inc(count)

    def watch_queue_depth(self, pool: str, size: Callable[[], int]) -> None:
        self.queue_depth.labels(pool=_closed(pool, QUEUE_POOLS, "pool")).set_function(size)


def translator_metrics(registry: CollectorRegistry) -> TranslatorMetrics:
    cache_requests = Counter(
        "translation_cache_requests",
        "Lectures du cache de traduction texte, hit ou miss (#3649).",
        labelnames=("result",),
        registry=registry,
    )
    pool_rejections = Counter(
        "translator_pool_rejections",
        "Tâches de traduction refusées par une file pleine (#3649).",
        labelnames=("pool",),
        registry=registry,
    )
    queue_depth = Gauge(
        "translator_queue_depth",
        "Tâches en attente dans chaque file de traduction (#3649).",
        labelnames=("pool",),
        registry=registry,
    )
    for result in CACHE_RESULTS:
        cache_requests.labels(result=result)
    for pool in QUEUE_POOLS:
        pool_rejections.labels(pool=pool)
        queue_depth.labels(pool=pool)
    return TranslatorMetrics(
        registry=registry,
        cache_requests=cache_requests,
        pool_rejections=pool_rejections,
        queue_depth=queue_depth,
    )


PROCESS_TRANSLATOR_METRICS = translator_metrics(PROCESS_AUDIO_PIPELINE_METRICS.registry)
