"""Watchdog de synthèse TTS.

Borne la durée d'un appel de synthèse pour qu'un `_model.generate()` bloqué
ne retienne pas indéfiniment le verrou de sérialisation Chatterbox — ce qui
faisait deadlocker l'ensemble des workers en production (2026-05-28).
"""

import asyncio
import logging
import os
from typing import Awaitable, TypeVar

logger = logging.getLogger(__name__)

DEFAULT_TTS_SYNTH_TIMEOUT_S = float(os.getenv("TTS_SYNTH_TIMEOUT_S", "180"))

T = TypeVar("T")


class TTSSynthesisTimeout(Exception):
    """Levée quand une synthèse TTS dépasse sa deadline watchdog."""


async def with_synth_watchdog(
    awaitable: Awaitable[T],
    *,
    timeout_s: float = DEFAULT_TTS_SYNTH_TIMEOUT_S,
    label: str = "tts",
) -> T:
    """Attend `awaitable` au plus `timeout_s` secondes.

    En cas de dépassement, annule l'awaitable et lève `TTSSynthesisTimeout`
    pour que l'appelant sorte de son bloc `with synthesis_lock:` et libère
    le verrou global au lieu de bloquer tous les workers.
    """
    try:
        return await asyncio.wait_for(awaitable, timeout=timeout_s)
    except asyncio.TimeoutError as exc:
        logger.error(
            "[TRANSLATOR] [TTS_WATCHDOG] ⏱️ Synthèse '%s' a dépassé %.0fs — "
            "abandon du segment pour libérer le verrou de synthèse",
            label,
            timeout_s,
        )
        raise TTSSynthesisTimeout(
            f"TTS synthesis '{label}' timed out after {timeout_s}s"
        ) from exc
