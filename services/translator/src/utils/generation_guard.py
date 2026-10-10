"""Bornes de la génération NLLB : un message court ne monopolise plus le modèle (#9309).

Deux gardes, mesurées sur FLORES-200 devtest (justification chiffrée :
`decisions/2026-10-05-generation-nllb-bornee-par-la-source-et-coupee-sur-boucle-9309.md`) :

- un BUDGET de jetons proportionnel à la source, jamais les 256 d'un plafond fixe ;
- un ARRÊT dès que la queue générée répète le même bloc de jetons quatre fois de suite,
  la boucle typique de NLLB sur les langues peu dotées, dont on ne garde qu'une copie.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any


GENERATION_CEILING = 256
GENERATION_FLOOR = 16
TOKENS_PER_SOURCE_TOKEN = 2.5
TOKEN_MARGIN = 10
LOOP_MAX_PERIOD = 16
LOOP_COPIES = 4


def generation_budget(source_tokens: int, ceiling: int = GENERATION_CEILING) -> int:
    proportional = math.ceil(TOKENS_PER_SOURCE_TOKEN * source_tokens + TOKEN_MARGIN)
    return min(ceiling, max(GENERATION_FLOOR, proportional))


def trailing_loop_period(
    ids: Sequence[int], max_period: int = LOOP_MAX_PERIOD, copies: int = LOOP_COPIES
) -> int | None:
    for period in range(1, max_period + 1):
        span = period * copies
        if len(ids) < span:
            return None
        tail = list(ids[-span:])
        block = tail[:period]
        if all(tail[k * period:(k + 1) * period] == block for k in range(copies)):
            return period
    return None


def strip_padding(ids: Sequence[int], pad_id: int | None) -> list[int]:
    kept = list(ids)
    while pad_id is not None and kept and kept[-1] == pad_id:
        kept.pop()
    return kept


def collapse_trailing_loop(ids: Sequence[int], pad_id: int | None = None) -> list[int]:
    kept = strip_padding(ids, pad_id)
    period = trailing_loop_period(kept)
    if period is None:
        return kept
    while len(kept) >= 2 * period and kept[-period:] == kept[-2 * period:-period]:
        kept = kept[:-period]
    return kept


class RepetitionLoopStop:
    """Critère d'arrêt de `generate()` : une ligne s'arrête quand sa queue boucle."""

    def __call__(self, input_ids: Any, scores: Any = None, **kwargs: Any) -> Any:
        flags = [trailing_loop_period(row) is not None for row in input_ids.tolist()]
        return input_ids.new_tensor(flags).bool()


@dataclass(frozen=True)
class GenerationOutcome:
    generated_tokens: int
    budget: int
    looped: bool

    @property
    def hit_budget(self) -> bool:
        return self.generated_tokens >= self.budget


def settle_generation(
    row: Sequence[int], budget: int, pad_id: int | None = None
) -> tuple[list[int], GenerationOutcome]:
    generated = strip_padding(row, pad_id)
    kept = collapse_trailing_loop(generated)
    outcome = GenerationOutcome(
        generated_tokens=max(0, len(generated) - 1),
        budget=budget,
        looped=len(kept) < len(generated),
    )
    return kept, outcome


def greedy_generation_kwargs(source_tokens: int, ceiling: int = GENERATION_CEILING) -> dict[str, Any]:
    return {
        "max_new_tokens": generation_budget(source_tokens, ceiling),
        "num_beams": 1,
        "do_sample": False,
        "stopping_criteria": [RepetitionLoopStop()],
    }
