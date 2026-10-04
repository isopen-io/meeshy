"""Sérialisation JSON d'un rapport et rendu en tableau Markdown."""

from collections.abc import Mapping
from dataclasses import asdict
from typing import Any

from .latency import LatencySummary
from .runner import BenchmarkReport, DirectionResult


MARKDOWN_HEADER = (
    "| direction | segments | chrF | COMET | court p50 (ms) | court p95 (ms) "
    "| long p50 (ms) | long p95 (ms) | échecs |\n"
    "|---|---|---|---|---|---|---|---|---|"
)


def report_to_dict(report: BenchmarkReport) -> dict[str, Any]:
    return {
        "engine": report.engine,
        "directions": [asdict(direction) for direction in report.directions],
    }


def _latency(data: Mapping[str, Any]) -> LatencySummary:
    return LatencySummary(count=data["count"], p50_ms=data["p50_ms"], p95_ms=data["p95_ms"])


def _direction(data: Mapping[str, Any]) -> DirectionResult:
    return DirectionResult(
        source_lang=data["source_lang"],
        target_lang=data["target_lang"],
        segments=data["segments"],
        chrf=data["chrf"],
        comet=data["comet"],
        short=_latency(data["short"]),
        long=_latency(data["long"]),
        failures=data["failures"],
    )


def report_from_dict(data: Mapping[str, Any]) -> BenchmarkReport:
    return BenchmarkReport(
        engine=data["engine"],
        directions=tuple(_direction(direction) for direction in data["directions"]),
    )


def _cell(value: float | None, digits: int) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def _row(direction: DirectionResult) -> str:
    cells = (
        direction.label,
        str(direction.segments),
        _cell(direction.chrf, 1),
        _cell(direction.comet, 3),
        _cell(direction.short.p50_ms, 0),
        _cell(direction.short.p95_ms, 0),
        _cell(direction.long.p50_ms, 0),
        _cell(direction.long.p95_ms, 0),
        str(direction.failures),
    )
    return f"| {' | '.join(cells)} |"


def render_markdown(report: BenchmarkReport) -> str:
    rows = "\n".join(_row(direction) for direction in report.directions)
    return f"### Banc de traduction : `{report.engine}`\n\n{MARKDOWN_HEADER}\n{rows}\n"
