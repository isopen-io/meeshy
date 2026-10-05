"""Latence perçue : p50 / p95 au rang le plus proche."""

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class LatencySummary:
    count: int
    p50_ms: float | None
    p95_ms: float | None


def _nearest_rank(ordered: Sequence[float], percentile: float) -> float:
    return ordered[max(1, math.ceil(percentile / 100 * len(ordered))) - 1]


def summarize_latencies(durations_ms: Sequence[float]) -> LatencySummary:
    if not durations_ms:
        return LatencySummary(count=0, p50_ms=None, p95_ms=None)
    ordered = sorted(durations_ms)
    return LatencySummary(
        count=len(ordered),
        p50_ms=_nearest_rank(ordered, 50),
        p95_ms=_nearest_rank(ordered, 95),
    )
