"""Exécution d'un moteur sur un jeu doré, regroupée par direction de langue."""

import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from .engines import Translator
from .golden import GoldenPair
from .latency import LatencySummary, summarize_latencies
from .scoring import chrf


logger = logging.getLogger(__name__)

SHORT_MAX_CHARS = 160
LONG_MIN_CHARS = 400


class Scorer(Protocol):
    def score(
        self, sources: Sequence[str], hypotheses: Sequence[str], references: Sequence[str]
    ) -> float: ...


@dataclass(frozen=True)
class DirectionResult:
    source_lang: str
    target_lang: str
    segments: int
    chrf: float
    comet: float | None
    short: LatencySummary
    long: LatencySummary
    failures: int

    @property
    def label(self) -> str:
        return f"{self.source_lang}→{self.target_lang}"


@dataclass(frozen=True)
class BenchmarkReport:
    engine: str
    directions: tuple[DirectionResult, ...]


@dataclass(frozen=True)
class _Outcome:
    pair: GoldenPair
    hypothesis: str
    duration_ms: float
    failed: bool


def _translate(translator: Translator, pair: GoldenPair, clock: Callable[[], float]) -> _Outcome:
    started = clock()
    try:
        hypothesis = translator.translate(pair.source, pair.source_lang, pair.target_lang)
        failed = False
    except Exception as error:
        logger.warning(
            "[BENCHMARK] échec %s %s→%s : %s", pair.id, pair.source_lang, pair.target_lang, error
        )
        hypothesis = ""
        failed = True
    return _Outcome(pair, hypothesis, (clock() - started) * 1000, failed)


def _latency(outcomes: Sequence[_Outcome], keep: Callable[[int], bool]) -> LatencySummary:
    return summarize_latencies(
        [o.duration_ms for o in outcomes if not o.failed and keep(len(o.pair.source))]
    )


def _direction(outcomes: Sequence[_Outcome], comet: Scorer | None) -> DirectionResult:
    sources = [o.pair.source for o in outcomes]
    hypotheses = [o.hypothesis for o in outcomes]
    references = [o.pair.reference for o in outcomes]
    return DirectionResult(
        source_lang=outcomes[0].pair.source_lang,
        target_lang=outcomes[0].pair.target_lang,
        segments=len(outcomes),
        chrf=chrf(hypotheses, references),
        comet=comet.score(sources, hypotheses, references) if comet else None,
        short=_latency(outcomes, lambda size: size <= SHORT_MAX_CHARS),
        long=_latency(outcomes, lambda size: size >= LONG_MIN_CHARS),
        failures=sum(o.failed for o in outcomes),
    )


def run_benchmark(
    translator: Translator,
    pairs: Sequence[GoldenPair],
    *,
    comet: Scorer | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> BenchmarkReport:
    outcomes = [_translate(translator, pair, clock) for pair in pairs]
    directions = tuple(dict.fromkeys((o.pair.source_lang, o.pair.target_lang) for o in outcomes))
    return BenchmarkReport(
        engine=translator.name,
        directions=tuple(
            _direction(
                [o for o in outcomes if (o.pair.source_lang, o.pair.target_lang) == key], comet
            )
            for key in directions
        ),
    )
