"""#19749 — le son d'un post ou d'une story revient au post qui l'a demandé.

La passerelle envoie, pour l'audio d'un post, `postId` et `postMediaId` en plus
de `messageId` / `attachmentId` (qui valent tous deux le `postMediaId`). Sans
ces deux clés dans `transcription_ready` et `audio_process_completed`, elle
range le résultat sur la voie MESSAGE et le perd (« Attachment non trouvé »).
Une requête de message ne les porte pas : les événements n'en portent pas non
plus (forme inchangée pour les messages).
"""
import json
from types import SimpleNamespace

import pytest

from services import zmq_audio_handler as mod
from services.audio_pipeline.audio_message_pipeline import AudioMessageResult, OriginalAudio

POST_ID = "p" * 24
POST_MEDIA_ID = "m" * 24


class CapturingSocket:
    def __init__(self):
        self.frames = []

    async def send_multipart(self, frames):
        self.frames.append(frames)

    async def send_json(self, payload):
        self.frames.append([json.dumps(payload).encode("utf-8")])

    def metadata(self):
        return {json.loads(frames[0].decode("utf-8"))["type"]: json.loads(frames[0].decode("utf-8")) for frames in self.frames}


class FakeFetcher:
    def __init__(self, path):
        self.path = path

    async def acquire_audio(self, **kwargs):
        return str(self.path), "binary"

    def cleanup_temp_file(self, path):
        pass


def _transcription():
    return SimpleNamespace(
        text="Bonjour à tous", language="fr", confidence=0.9, source="whisper", segments=[],
        duration_ms=2000, speaker_count=None, primary_speaker_id=None, sender_voice_identified=None,
        sender_speaker_id=None, speaker_analysis=None,
    )


class SucceedingPipeline:
    translation_service = object()
    database_service = object()

    async def process_audio_message(self, **kwargs):
        await kwargs["on_transcription_ready"]({
            "message_id": kwargs["message_id"], "attachment_id": kwargs["attachment_id"],
            "transcription": _transcription(), "processing_time_ms": 12,
        })
        return AudioMessageResult(
            message_id=kwargs["message_id"],
            attachment_id=kwargs["attachment_id"],
            original=OriginalAudio(
                audio_path="/tmp/a.wav", audio_url="", transcription="Bonjour à tous", language="fr",
                duration_ms=2000, confidence=0.9, source="whisper", segments=[],
            ),
            translations={},
            voice_model_user_id="u1",
            voice_model_quality=0.7,
            processing_time_ms=10,
            requested_languages=[],
        )


async def _published_events(tmp_path, monkeypatch, request):
    audio = tmp_path / "in.m4a"
    audio.write_bytes(b"AUDIO")
    monkeypatch.setattr(mod, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(mod, "get_audio_fetcher", lambda: FakeFetcher(audio))
    monkeypatch.setattr(mod, "_retry_audio_pipeline_import", lambda: True)
    monkeypatch.setattr(mod, "get_audio_pipeline", lambda: SucceedingPipeline(), raising=False)
    handler = mod.AudioHandler.__new__(mod.AudioHandler)
    handler.pub_socket = CapturingSocket()
    await handler._handle_audio_process_request(request)
    return handler.pub_socket.metadata()


def _request(**extra):
    return {"messageId": POST_MEDIA_ID, "attachmentId": POST_MEDIA_ID, "senderId": "c" * 24,
            "conversationId": f"post_{POST_ID}", "audioDurationMs": 1000, **extra}


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["transcription_ready", "audio_process_completed"])
async def test_an_event_answering_a_post_request_names_the_post_and_its_media(tmp_path, monkeypatch, event_type):
    events = await _published_events(tmp_path, monkeypatch, _request(postId=POST_ID, postMediaId=POST_MEDIA_ID))

    assert events[event_type]["postId"] == POST_ID
    assert events[event_type]["postMediaId"] == POST_MEDIA_ID


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["transcription_ready", "audio_process_completed"])
async def test_an_event_answering_a_message_request_carries_no_post_key(tmp_path, monkeypatch, event_type):
    events = await _published_events(tmp_path, monkeypatch, _request())

    assert "postId" not in events[event_type]
    assert "postMediaId" not in events[event_type]
