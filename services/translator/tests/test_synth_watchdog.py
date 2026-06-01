"""Tests du watchdog de synthèse TTS.

Régression production 2026-05-28 : un appel `_model.generate()` bloqué
indéfiniment retenait le `threading.Lock` global de synthèse Chatterbox,
faisant patienter les 37 workers pour toujours (deadlock total du translator).
Le watchdog borne chaque synthèse pour qu'un segment bloqué libère le lock.
"""

import asyncio

import pytest

from src.services.tts.synth_watchdog import (
    TTSSynthesisTimeout,
    with_synth_watchdog,
)


@pytest.mark.unit
async def test_returns_result_when_synthesis_completes_in_time():
    async def fast():
        await asyncio.sleep(0.01)
        return "wav-bytes"

    result = await with_synth_watchdog(fast(), timeout_s=1.0, label="fast")
    assert result == "wav-bytes"


@pytest.mark.unit
async def test_raises_tts_timeout_when_synthesis_hangs():
    async def hangs():
        await asyncio.sleep(10)
        return "never"

    with pytest.raises(TTSSynthesisTimeout) as exc:
        await with_synth_watchdog(hangs(), timeout_s=0.05, label="chatterbox:multi")

    assert "chatterbox:multi" in str(exc.value)


@pytest.mark.unit
async def test_cancels_the_underlying_awaitable_on_timeout():
    cancelled = {"value": False}

    async def hangs():
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled["value"] = True
            raise

    with pytest.raises(TTSSynthesisTimeout):
        await with_synth_watchdog(hangs(), timeout_s=0.05, label="seg")

    await asyncio.sleep(0.01)
    assert cancelled["value"] is True


@pytest.mark.unit
async def test_propagates_non_timeout_errors_unchanged():
    async def boom():
        raise ValueError("model exploded")

    with pytest.raises(ValueError, match="model exploded"):
        await with_synth_watchdog(boom(), timeout_s=1.0, label="boom")
