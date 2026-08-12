"""
Test 32: total translation failure must be reported, never silent

When every target language fails (TTS crash, watchdog timeout, ...),
`translation_stage` swallows the per-language exception and the pipeline
returns a result with an empty `translations` dict. The ZMQ audio handler used
to treat that as a success and publish an empty `audio_result`, so the gateway
never emitted `audio:translation-failed` and clients (iOS) stayed stuck on
"traduction en cours" forever with no error.

`AudioMessageResult.requested_languages` disambiguates the two zero-translation
cases:
  - empty  → transcription-only, no translation was ever requested (legitimate)
  - filled → translations were requested and ALL of them failed (must report)

The import pulls the ML stack; it is skipped gracefully when those optional
deps are absent so the suite still collects.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from services.zmq_audio_handler import AudioHandler
    from services.audio_pipeline.audio_message_pipeline import (
        AudioMessageResult,
        OriginalAudio,
    )
    _IMPORT_OK = True
except Exception:  # pragma: no cover - optional heavy ML deps absent
    _IMPORT_OK = False

pytestmark = pytest.mark.skipif(
    not _IMPORT_OK,
    reason="Handler import requires the translator ML stack",
)


def _result(translations, requested_languages):
    return AudioMessageResult(
        message_id="msg1",
        attachment_id="att1",
        original=OriginalAudio(
            audio_path="/tmp/a.wav",
            audio_url="",
            transcription="bonjour tout le monde",
            language="fr",
            duration_ms=2000,
            confidence=0.9,
            source="whisper",
            segments=[],
        ),
        translations=translations,
        voice_model_user_id="u1",
        voice_model_quality=0.7,
        processing_time_ms=1234,
        requested_languages=requested_languages,
    )


@pytest.fixture
def handler():
    h = AudioHandler.__new__(AudioHandler)
    h.published_errors = []
    h.published_results = []

    async def fake_publish_error(task_id, message_id, attachment_id, error, error_code):
        h.published_errors.append(
            {"task_id": task_id, "message_id": message_id, "error": error, "error_code": error_code}
        )

    async def fake_publish_result(task_id, result, processing_time):
        h.published_results.append(task_id)

    h._publish_audio_error = fake_publish_error
    h._publish_audio_result = fake_publish_result
    return h


def test_result_carries_requested_languages():
    """The pipeline result must expose what was asked for, so a caller can tell
    'nothing requested' apart from 'everything failed'."""
    r = _result({}, ["en", "es"])
    assert r.requested_languages == ["en", "es"]


def test_transcription_only_result_requests_nothing():
    """Default keeps the legitimate transcription-only case reporting-free."""
    r = _result({}, [])
    assert r.requested_languages == []


@pytest.mark.asyncio
async def test_all_languages_failed_publishes_error(handler):
    """Zero translations while languages were requested = failure to report."""
    result = _result({}, ["en"])

    await handler._report_total_translation_failure(
        task_id="task1", request_data={"messageId": "msg1", "attachmentId": "att1"}, result=result
    )

    assert len(handler.published_errors) == 1
    published = handler.published_errors[0]
    assert published["error_code"] == "translation_failed"
    assert "en" in published["error"]


@pytest.mark.asyncio
async def test_transcription_only_publishes_no_error(handler):
    """No language requested → transcription-only success, nothing to report."""
    result = _result({}, [])

    await handler._report_total_translation_failure(
        task_id="task1", request_data={"messageId": "msg1", "attachmentId": "att1"}, result=result
    )

    assert handler.published_errors == []


@pytest.mark.asyncio
async def test_partial_success_publishes_no_error(handler):
    """At least one language delivered → not a total failure."""
    result = _result({"en": object()}, ["en", "es"])

    await handler._report_total_translation_failure(
        task_id="task1", request_data={"messageId": "msg1", "attachmentId": "att1"}, result=result
    )

    assert handler.published_errors == []
