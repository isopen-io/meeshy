"""Second audit #13102 — témoin rouge (NON committé) : la transcription d'une tâche au repos part dans les journaux."""
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_privacy import at_rest_scope
from services import zmq_audio_handler as module

SECRET = "Le code du coffre est 4471, porte B."


@pytest.mark.unit
async def test_publishing_an_at_rest_audio_result_never_logs_its_transcription(caplog):
    handler = module.AudioHandler.__new__(module.AudioHandler)
    handler.pub_socket = SimpleNamespace(send_multipart=AsyncMock(), send=AsyncMock(), send_json=AsyncMock())
    handler.db = None
    segments = [SimpleNamespace(text=SECRET, start_ms=0, end_ms=500, confidence=0.9, speaker_id="s0", language="fr"),
                SimpleNamespace(text=SECRET, start_ms=500, end_ms=900, confidence=0.9, speaker_id="s1", language="fr")]
    original = SimpleNamespace(transcription=SECRET, language="fr", confidence=0.9, source="whisper", segments=segments,
                               duration_ms=900, speaker_count=2, primary_speaker_id="s0", sender_voice_identified=None,
                               sender_speaker_id=None, speaker_analysis=None)
    result = SimpleNamespace(message_id="b" * 24, attachment_id="a" * 24, original=original, translations={}, new_voice_profile=None)
    caplog.set_level(logging.INFO)
    with at_rest_scope(True):
        await handler._publish_audio_result("task", result, 10)
    assert SECRET[:12] not in caplog.text
