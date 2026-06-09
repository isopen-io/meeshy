"""
On-demand TTS language policy (bandwidth lever #5) — PURE decision logic.

Today the audio pipeline eagerly synthesizes TTS audio for EVERY target
language of a conversation, even languages no connected recipient is currently
consuming. TTS is the heaviest stage (and the audio is the heaviest payload),
so generating it for unused languages wastes both CPU and storage/bandwidth.

This module decides which languages to synthesize NOW (eager) vs DEFER (text
translation still produced; audio generated on first real request). It is pure
(no ML, no I/O) so it can be unit-tested without the model stack, and so the
heavy pipeline simply consumes its verdict.

Modes (env `TTS_GENERATION_MODE`, default `all` = current behaviour):
  - "all"     : synthesize every target language up front (no change).
  - "active"  : synthesize only languages an online recipient needs now; defer
                the rest until requested.
  - "bounded" : synthesize at most `max_eager` languages; defer the rest.
"""

from dataclasses import dataclass
from typing import Iterable, List, Optional


@dataclass(frozen=True)
class TTSLanguageSelection:
    """Languages to synthesize now vs defer to on-demand."""
    eager: List[str]
    deferred: List[str]


def _dedupe_lower(values: Optional[Iterable[str]]) -> List[str]:
    out: List[str] = []
    seen = set()
    for v in values or []:
        if not v:
            continue
        lv = v.strip().lower()
        if lv and lv not in seen:
            seen.add(lv)
            out.append(lv)
    return out


def select_eager_tts_languages(
    target_languages: Iterable[str],
    *,
    active_languages: Optional[Iterable[str]] = None,
    max_eager: Optional[int] = None,
    mode: str = "all",
) -> TTSLanguageSelection:
    """Split target languages into (eager, deferred). Deterministic, order-preserving."""
    targets = _dedupe_lower(target_languages)

    if not targets:
        return TTSLanguageSelection(eager=[], deferred=[])

    if mode == "active":
        active = set(_dedupe_lower(active_languages))
        eager = [l for l in targets if l in active]
        deferred = [l for l in targets if l not in active]
        # Safety: if nothing is active (e.g. recipients offline) don't defer the
        # whole set into silence — keep the first language eager so the message
        # always has at least one synthesized audio.
        if not eager:
            eager = targets[:1]
            deferred = targets[1:]
        return TTSLanguageSelection(eager=eager, deferred=deferred)

    if mode == "bounded":
        n = max_eager if (max_eager is not None and max_eager > 0) else len(targets)
        return TTSLanguageSelection(eager=targets[:n], deferred=targets[n:])

    # "all" or any unknown mode → safe default: synthesize everything.
    return TTSLanguageSelection(eager=targets, deferred=[])
