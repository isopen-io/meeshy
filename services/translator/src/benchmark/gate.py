"""Porte de non-régression : un rapport comparé à sa référence."""

from dataclasses import dataclass

from .runner import BenchmarkReport, DirectionResult


@dataclass(frozen=True)
class Regression:
    direction: str
    metric: str
    baseline: float | None
    current: float | None


def _quality(
    current: DirectionResult,
    baseline: DirectionResult,
    chrf_tolerance: float,
    comet_tolerance: float,
) -> list[Regression]:
    found = []
    if current.chrf < baseline.chrf - chrf_tolerance:
        found.append(Regression(baseline.label, "chrf", baseline.chrf, current.chrf))
    if (
        current.comet is not None
        and baseline.comet is not None
        and current.comet < baseline.comet - comet_tolerance
    ):
        found.append(Regression(baseline.label, "comet", baseline.comet, current.comet))
    if current.failures > baseline.failures:
        found.append(Regression(baseline.label, "failures", baseline.failures, current.failures))
    return found


def _latency(
    current: DirectionResult, baseline: DirectionResult, tolerance: float | None
) -> list[Regression]:
    if tolerance is None:
        return []
    found = []
    for bucket in ("short", "long"):
        before = getattr(baseline, bucket).p95_ms
        after = getattr(current, bucket).p95_ms
        if before is not None and after is not None and after > before * (1 + tolerance):
            found.append(Regression(baseline.label, f"{bucket}_p95_ms", before, after))
    return found


def find_regressions(
    current: BenchmarkReport,
    baseline: BenchmarkReport,
    *,
    chrf_tolerance: float = 1.0,
    comet_tolerance: float = 0.01,
    latency_tolerance: float | None = None,
) -> tuple[Regression, ...]:
    measured = {direction.label: direction for direction in current.directions}
    found: list[Regression] = []
    for reference in baseline.directions:
        candidate = measured.get(reference.label)
        if candidate is None:
            found.append(Regression(reference.label, "missing", None, None))
            continue
        found.extend(_quality(candidate, reference, chrf_tolerance, comet_tolerance))
        found.extend(_latency(candidate, reference, latency_tolerance))
    return tuple(found)
