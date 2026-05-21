#!/usr/bin/env python3
"""
Test 28 - ZMQ Voice Handler Dedup

Regression coverage for the production CPU saturation we observed:
the Gateway used to resend voice_translate every 30 s when the long pipeline
(Whisper + NLLB + Chatterbox) hadn't replied yet, and each resend pushed a
brand new worker-pool job into the translator. 4 parallel duplicates ×
~7 min each = saturated CPU and never-completing jobs.

The Gateway now sends voice_translate once (no retry), but defense in depth:
the translator's VoiceHandler MUST dedup by taskId so an accidental
duplicate PUSH never reaches the worker pool twice.
"""
import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


@pytest.fixture
def voice_handler_with_mocks():
    """A VoiceHandler wired to mocked pub_socket + voice_api_handler.

    The voice_api_handler.handle_request is async and sleeps briefly so we
    can deterministically observe overlap between two concurrent calls.
    """
    from services.zmq_voice_handler import VoiceHandler

    pub_socket = MagicMock()
    pub_socket.send = AsyncMock()

    handler = VoiceHandler(pub_socket=pub_socket)

    # Make the underlying VoiceAPIHandler.handle_request controllable.
    api_handler = MagicMock()
    api_handler.handle_request = AsyncMock(return_value={
        'type': 'voice_api_success',
        'taskId': 'shared-task',
        'result': {'translationId': 'shared-task'},
    })
    handler.voice_api_handler = api_handler

    return handler, api_handler, pub_socket


@pytest.mark.asyncio
async def test_duplicate_voice_translate_is_deduped(voice_handler_with_mocks):
    """Two concurrent voice_translate requests with the same taskId must
    only reach the underlying VoiceAPIHandler once.
    """
    handler, api_handler, pub_socket = voice_handler_with_mocks

    # Force the first request to "hang" a moment so the second one arrives
    # while it's still in-flight.
    started = asyncio.Event()
    can_finish = asyncio.Event()

    async def slow_handle_request(_request_data):
        started.set()
        await can_finish.wait()
        return {
            'type': 'voice_api_success',
            'taskId': 'dup-task',
            'result': {'translationId': 'dup-task'},
        }

    api_handler.handle_request = AsyncMock(side_effect=slow_handle_request)

    request = {'type': 'voice_translate', 'taskId': 'dup-task'}

    first = asyncio.create_task(handler._handle_voice_api_request(request))
    await started.wait()

    # While the first one is running, fire the duplicate.
    await handler._handle_voice_api_request(request)

    # Duplicate must NOT have called handle_request.
    assert api_handler.handle_request.await_count == 1

    # Let the first request finish.
    can_finish.set()
    await first

    # Only one publish overall (only the first request published its result).
    assert pub_socket.send.await_count == 1


@pytest.mark.asyncio
async def test_dedup_releases_after_completion(voice_handler_with_mocks):
    """Once a voice_translate finishes, the same taskId can be reused without
    being treated as a duplicate (the in-flight set is cleaned up)."""
    handler, api_handler, _pub = voice_handler_with_mocks

    request = {'type': 'voice_translate', 'taskId': 'reusable-task'}

    await handler._handle_voice_api_request(request)
    await handler._handle_voice_api_request(request)

    assert api_handler.handle_request.await_count == 2


@pytest.mark.asyncio
async def test_dedup_does_not_apply_to_fast_voice_ops(voice_handler_with_mocks):
    """Fast Voice API ops (voice_health, voice_list, ...) are NOT deduped — they
    don't go through the worker pool and the duplicate-by-design retry path
    must keep working for them.
    """
    handler, api_handler, _pub = voice_handler_with_mocks

    started = asyncio.Event()
    can_finish = asyncio.Event()

    async def slow_handle_request(_request_data):
        started.set()
        await can_finish.wait()
        return {
            'type': 'voice_api_success',
            'taskId': 'fast-task',
            'result': {},
        }

    api_handler.handle_request = AsyncMock(side_effect=slow_handle_request)

    request = {'type': 'voice_health', 'taskId': 'fast-task'}

    first = asyncio.create_task(handler._handle_voice_api_request(request))
    await started.wait()

    # Concurrent duplicate of a fast op — let it run a tick.
    second = asyncio.create_task(handler._handle_voice_api_request(request))
    await asyncio.sleep(0)

    # Both must be reaching the handler (not deduped).
    can_finish.set()
    await asyncio.gather(first, second)

    assert api_handler.handle_request.await_count == 2


@pytest.mark.asyncio
async def test_dedup_set_is_resilient_to_handler_exception(voice_handler_with_mocks):
    """If the underlying VoiceAPIHandler raises, the in-flight slot MUST still
    be released so the same taskId can be retried later.
    """
    handler, api_handler, _pub = voice_handler_with_mocks
    api_handler.handle_request = AsyncMock(side_effect=RuntimeError("boom"))

    request = {'type': 'voice_translate', 'taskId': 'errors-task'}

    # First call: pipeline raises, _handle_voice_api_request swallows + publishes error.
    await handler._handle_voice_api_request(request)
    assert 'errors-task' not in handler._in_flight_voice_translates

    # Second call must NOT be treated as a duplicate.
    await handler._handle_voice_api_request(request)
    assert api_handler.handle_request.await_count == 2
