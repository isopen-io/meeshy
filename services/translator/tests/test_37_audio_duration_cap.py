"""
Test 37: audio duration cap (#3668)

No cap existed on the duration of an audio message going through
transcription/translation/TTS — only the TTS synthesis step had a watchdog
(180s, TTS_SYNTH_TIMEOUT_S), which does not bound transcription or
translation. `_handle_audio_process_request` must refuse an audio above
`MessageLimits.MAX_AUDIO_DURATION_MS` cleanly — publishing `audio_process_error`
with a clear message — BEFORE acquiring the audio file, which is the cost a
too-long audio would otherwise make everyone pay for nothing.

The import pulls the ML stack; it is skipped gracefully when those optional
deps are absent, matching test_32's pattern.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from services.zmq_audio_handler import AudioHandler
    _IMPORT_OK = True
except Exception:  # pragma: no cover - optional heavy ML deps absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(
    not _IMPORT_OK,
    reason="Handler import requires the translator ML stack",
)


@pytest.fixture
def handler():
    h = AudioHandler.__new__(AudioHandler)
    h.published_errors = []

    async def fake_publish_error(task_id, message_id, attachment_id, error, error_code):
        h.published_errors.append(
            {"task_id": task_id, "message_id": message_id, "error": error, "error_code": error_code}
        )

    h._publish_audio_error = fake_publish_error
    return h


@pytest.mark.asyncio
async def test_audio_over_limit_is_rejected_without_acquiring_audio(handler, monkeypatch):
    from services import zmq_audio_handler as mod
    from config.message_limits import MessageLimits

    # A truthy AudioFetcher would prove the early-return by raising on any call.
    class ExplodingFetcher:
        async def acquire_audio(self, **kwargs):
            raise AssertionError("audio acquisition must not run for an over-limit audio")

    monkeypatch.setattr(mod, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(mod, "get_audio_fetcher", lambda: ExplodingFetcher())
    monkeypatch.setattr(mod, "_retry_audio_pipeline_import", lambda: True)

    request_data = {
        "messageId": "msg1",
        "attachmentId": "att1",
        "senderId": "sender1",
        "audioDurationMs": MessageLimits.MAX_AUDIO_DURATION_MS + 1000,
    }

    await handler._handle_audio_process_request(request_data)

    assert len(handler.published_errors) == 1
    published = handler.published_errors[0]
    assert published["error_code"] == "audio_too_long"
    assert published["message_id"] == "msg1"
    assert published["error"] is not None


@pytest.mark.asyncio
async def test_audio_within_limit_is_not_rejected_for_duration(handler, monkeypatch):
    """Sanity check: a valid duration must reach audio acquisition (and fail
    there, since no real audio is provided) rather than being rejected for
    its duration."""
    from services import zmq_audio_handler as mod
    from config.message_limits import MessageLimits

    class RefusingFetcher:
        async def acquire_audio(self, **kwargs):
            return None, None  # simulate "could not acquire" -> ValueError downstream

    monkeypatch.setattr(mod, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(mod, "get_audio_fetcher", lambda: RefusingFetcher())
    monkeypatch.setattr(mod, "_retry_audio_pipeline_import", lambda: True)

    request_data = {
        "messageId": "msg2",
        "attachmentId": "att2",
        "senderId": "sender1",
        "audioDurationMs": MessageLimits.MAX_AUDIO_DURATION_MS,
    }

    await handler._handle_audio_process_request(request_data)

    assert len(handler.published_errors) == 1
    published = handler.published_errors[0]
    assert published["error_code"] != "audio_too_long"
