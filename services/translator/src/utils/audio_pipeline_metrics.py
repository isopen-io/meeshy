"""
Le temps de chaque étape de l'audio d'un message (#11257).

`audio_pipeline_seconds{stage}` — un histogramme Prometheus par étape :
`whisper` (transcription), `nllb` (traduction du texte), `tts` (synthèse).
Le temps se lit sur l'horloge monotone, à la réussite comme à l'échec.
L'étiquette ne prend que ces trois valeurs : aucun texte, aucun identifiant,
aucune langue n'entre dans une série.

Le registre se lit sur `GET /metrics` du traducteur, un port que Traefik ne
route pas : rien n'est poussé, aucune mesure ne quitte le serveur sans qu'un
collecteur interne vienne la lire.
"""

from __future__ import annotations

import functools
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Histogram, generate_latest

AUDIO_STAGES: tuple[str, ...] = ("whisper", "nllb", "tts")

# De 50 ms à 5 min : une traduction se compte en centaines de ms, une transcription de 30 s en secondes.
_BUCKETS_SECONDS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0, 120.0, 300.0)

T = TypeVar("T")


@dataclass(frozen=True)
class AudioPipelineMetrics:
    registry: CollectorRegistry
    histogram: Histogram
    clock: Callable[[], float]

    def timed(self, stage: str) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
        if stage not in AUDIO_STAGES:
            raise ValueError(f"unknown audio pipeline stage: {stage}")

        def decorate(function: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
            @functools.wraps(function)
            async def timed_call(*args: Any, **kwargs: Any) -> T:
                started_at = self.clock()
                try:
                    return await function(*args, **kwargs)
                finally:
                    self.histogram.labels(stage=stage).observe(max(0.0, self.clock() - started_at))

            timed_call.__audio_pipeline_stage__ = stage  # type: ignore[attr-defined]
            return timed_call

        return decorate


def audio_pipeline_metrics(clock: Callable[[], float] = time.perf_counter) -> AudioPipelineMetrics:
    registry = CollectorRegistry(auto_describe=True)
    histogram = Histogram(
        "audio_pipeline_seconds",
        "Durée de chaque étape de l'audio d'un message (#11257).",
        labelnames=("stage",),
        buckets=_BUCKETS_SECONDS,
        registry=registry,
    )
    return AudioPipelineMetrics(registry=registry, histogram=histogram, clock=clock)


PROCESS_AUDIO_PIPELINE_METRICS = audio_pipeline_metrics()


def timed_audio_stage(stage: str) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """L'instance du processus : celle que les étapes alimentent et que `GET /metrics` sert."""
    return PROCESS_AUDIO_PIPELINE_METRICS.timed(stage)


def metrics_router(registry: CollectorRegistry | None = None) -> APIRouter:
    served = registry if registry is not None else PROCESS_AUDIO_PIPELINE_METRICS.registry
    router = APIRouter()

    @router.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(content=generate_latest(served), media_type=CONTENT_TYPE_LATEST)

    return router
