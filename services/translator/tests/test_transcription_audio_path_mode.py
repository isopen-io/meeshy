"""
#18599 — une transcription demandée par simple chemin de fichier doit
aboutir au traducteur.

`_handle_transcription_only_request` réimportait `Path` dans trois blocs de
la fonction : Python en faisait une variable LOCALE de toute la fonction, et
le mode « fichier direct » (requête qui ne porte que `audioPath`) levait
`UnboundLocalError` sur `Path(audio_path).exists()`, publiant
`transcription_failed`.

Attendu : en mode `audioPath`, le service de transcription reçoit le chemin
et un `transcription_completed` part ; les modes `_audioBinary` et base64
continuent d'aboutir et nettoient leur fichier temporaire.
"""

import base64
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

import services.zmq_transcription_handler as transcription_module
from services.zmq_transcription_handler import TranscriptionHandler


class CapturingSocket:
    def __init__(self):
        self.sent = []

    async def send(self, data):
        self.sent.append(json.loads(data.decode("utf-8")))


class RecordingTranscriptionService:
    def __init__(self):
        self.is_initialized = True
        self.calls = []

    async def transcribe(self, audio_path, mobile_transcription=None, return_timestamps=False):
        self.calls.append({"audio_path": audio_path, "exists": Path(audio_path).exists()})
        return SimpleNamespace(
            text="bonjour",
            language="fr",
            confidence=0.9,
            duration_ms=1000,
            source="whisper",
            model="whisper",
            segments=None,
        )


def _handler(socket) -> TranscriptionHandler:
    handler = TranscriptionHandler.__new__(TranscriptionHandler)
    handler.pub_socket = socket
    handler.db = None
    handler.transcription_service = None
    return handler


@pytest.fixture
def transcription_service(monkeypatch):
    service = RecordingTranscriptionService()
    monkeypatch.setattr(transcription_module, "TRANSCRIPTION_SERVICE_AVAILABLE", True)
    monkeypatch.setattr(transcription_module, "get_transcription_service", lambda: service, raising=False)
    return service


def _temp_file_for(task_id: str, audio_format: str = "wav") -> Path:
    return Path(tempfile.gettempdir()) / "transcription_temp" / f"trans_{task_id}.{audio_format}"


async def test_audio_path_only_request_reaches_the_transcription_service(transcription_service, tmp_path, monkeypatch):
    # #18628 — le mode fichier ne lit que sous une racine autorisée : le
    # témoin déclare la sienne au lieu de compter sur le répertoire temporaire.
    monkeypatch.setenv("TRANSLATOR_AUDIO_PATH_ROOTS", str(tmp_path))
    audio_file = tmp_path / "voice.wav"
    audio_file.write_bytes(b"RIFF0000WAVE")
    socket = CapturingSocket()

    await _handler(socket)._handle_transcription_only_request(
        {"taskId": "t-path", "messageId": "m1", "attachmentId": "a1", "audioPath": str(audio_file)}
    )

    assert transcription_service.calls == [{"audio_path": str(audio_file.resolve()), "exists": True}]
    assert len(socket.sent) == 1
    assert socket.sent[0]["type"] == "transcription_completed"
    assert socket.sent[0].get("errorCode") != "transcription_failed"
    assert socket.sent[0]["transcription"]["text"] == "bonjour"
    assert audio_file.exists()


@pytest.mark.parametrize(
    "source",
    [
        {"_audioBinary": b"RIFF0000WAVE"},
        {"audioData": base64.b64encode(b"RIFF0000WAVE").decode("ascii")},
    ],
    ids=["audio_binary", "audio_base64"],
)
async def test_inline_audio_is_transcribed_from_a_temp_file_then_cleaned_up(transcription_service, source):
    task_id = f"t-inline-18599-{next(iter(source))}"
    temp_file = _temp_file_for(task_id)
    socket = CapturingSocket()

    try:
        await _handler(socket)._handle_transcription_only_request(
            {"taskId": task_id, "messageId": "m1", "attachmentId": "a1", **source}
        )
    finally:
        leftover = temp_file.exists()
        temp_file.unlink(missing_ok=True)

    assert transcription_service.calls == [{"audio_path": str(temp_file), "exists": True}]
    assert socket.sent[0]["type"] == "transcription_completed"
    assert not leftover
