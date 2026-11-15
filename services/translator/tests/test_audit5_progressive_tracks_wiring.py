"""#13102 — cinquième audit adversarial, câblage de bout en bout : une tâche AU REPOS dont une piste part au fil de l'eau puis qui échoue n'en laisse rien sur le disque."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services import zmq_audio_handler as mod


class FakeFetcher:
    def __init__(self, path):
        self.path = path

    async def acquire_audio(self, **kwargs):
        return str(self.path), "binary"

    def cleanup_temp_file(self, path):
        pass


class FailingPipeline:
    translation_service = object()
    database_service = object()

    def __init__(self, track):
        self.track = track

    async def process_audio_message(self, **kwargs):
        await kwargs["on_translation_ready"]({"message_id": "b" * 24, "attachment_id": "a" * 24, "language": "en",
                                              "translation": SimpleNamespace(audio_path=str(self.track))})
        raise RuntimeError("la langue suivante plante")


@pytest.mark.asyncio
@pytest.mark.parametrize("at_rest,kept", [(True, False), (False, True)])
async def test_a_progressively_published_track_of_a_failing_at_rest_task_leaves_the_disk(tmp_path, monkeypatch, at_rest, kept):
    audio = tmp_path / "in.m4a"
    audio.write_bytes(b"AUDIO")
    track = tmp_path / "out_en.mp3"
    track.write_bytes(b"PISTE TRADUITE")
    monkeypatch.setattr(mod, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(mod, "get_audio_fetcher", lambda: FakeFetcher(audio))
    monkeypatch.setattr(mod, "_retry_audio_pipeline_import", lambda: True)
    monkeypatch.setattr(mod, "get_audio_pipeline", lambda: FailingPipeline(track), raising=False)
    handler = mod.AudioHandler.__new__(mod.AudioHandler)
    handler._publish_translation_ready = AsyncMock()
    handler._publish_transcription_result = AsyncMock()
    handler._publish_audio_error = AsyncMock()
    request = {"messageId": "b" * 24, "attachmentId": "a" * 24, "senderId": "c" * 24, "audioDurationMs": 1000, **({"atRest": True} if at_rest else {})}
    await handler._handle_audio_process_request(request)
    handler._publish_translation_ready.assert_awaited()
    handler._publish_audio_error.assert_awaited()
    assert track.exists() is kept
