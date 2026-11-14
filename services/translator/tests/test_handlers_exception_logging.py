"""
#18571 — les handlers audio, transcription et voix du traducteur ne
journalisent jamais le message d'une exception.

Le message d'une exception peut porter le contenu d'une requête (une URL
signée, un extrait de transcription, un jeton). Les handlers écrivaient
`{e}` dans les logs et imprimaient un traceback complet sur stderr ; ils
publiaient aussi `str(e)` dans le champ `error` des événements d'échec, que
la passerelle journalise, renvoie à l'appelant HTTP et diffuse aux clients.

Attendu à chaque site : seul le NOM du type de l'exception est journalisé,
aucun traceback n'est imprimé, et une charge d'erreur publiée garde un
`error` NON VIDE (rétrocompatibilité avec une ancienne passerelle) sans le
message brut.
"""

import base64
import json
import logging
from types import SimpleNamespace

import pytest

import services.zmq_audio_handler as audio_module
import services.zmq_transcription_handler as transcription_module
from services.zmq_audio_handler import AudioHandler
from services.zmq_transcription_handler import TranscriptionHandler
from services.zmq_voice_handler import VoiceHandler

SECRET = "SECRET-TOKEN-xyz-18571"


class SecretError(RuntimeError):
    pass


def _boom(*_args, **_kwargs):
    raise SecretError(SECRET)


class CapturingSocket:
    def __init__(self):
        self.sent = []

    async def send(self, data):
        self.sent.append(json.loads(data.decode("utf-8")))

    async def send_multipart(self, frames):
        self.sent.append(json.loads(frames[0].decode("utf-8")))

    async def send_json(self, payload):
        self.sent.append(payload)


class FailingSocket:
    async def send(self, _data):
        raise SecretError(SECRET)

    async def send_multipart(self, _frames):
        raise SecretError(SECRET)

    async def send_json(self, _payload):
        raise SecretError(SECRET)


class Exploding:
    def __getattr__(self, _name):
        raise SecretError(SECRET)

    def __getitem__(self, _key):
        raise SecretError(SECRET)


def _audio_handler(socket) -> AudioHandler:
    handler = AudioHandler.__new__(AudioHandler)
    handler.pub_socket = socket
    handler.db = None
    handler.audio_pipeline = None
    return handler


def _transcription_handler(socket) -> TranscriptionHandler:
    handler = TranscriptionHandler.__new__(TranscriptionHandler)
    handler.pub_socket = socket
    handler.db = None
    handler.transcription_service = None
    return handler


def _voice_handler(socket) -> VoiceHandler:
    handler = VoiceHandler.__new__(VoiceHandler)
    handler.pub_socket = socket
    handler.db = None
    handler.voice_api_handler = SimpleNamespace(handle_request=_async_boom)
    handler.voice_profile_handler = SimpleNamespace(handle_request=_async_boom)
    handler._in_flight_voice_translates = set()
    return handler


async def _async_boom(*_args, **_kwargs):
    raise SecretError(SECRET)


def _assert_no_secret_logged(caplog, capsys):
    captured = capsys.readouterr()
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert SECRET not in logged
    assert SECRET not in captured.out
    assert SECRET not in captured.err
    assert "Traceback" not in captured.err
    assert "SecretError" in logged


def _assert_error_payload(payload, expected_type):
    assert payload["type"] == expected_type
    assert isinstance(payload["error"], str)
    assert payload["error"].strip()
    assert SECRET not in json.dumps(payload)


@pytest.fixture
def audio_fetcher_raising(monkeypatch):
    fetcher = SimpleNamespace(acquire_audio=_async_boom, cleanup_temp_file=lambda _path: None)
    monkeypatch.setattr(audio_module, "_retry_audio_pipeline_import", lambda: True)
    monkeypatch.setattr(audio_module, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(audio_module, "get_audio_fetcher", lambda: fetcher)


async def test_audio_process_failure_logs_type_and_publishes_generic_error(
    audio_fetcher_raising, caplog, capsys
):
    caplog.set_level(logging.DEBUG)
    socket = CapturingSocket()
    handler = _audio_handler(socket)

    await handler._handle_audio_process_request(
        {"messageId": "m1", "attachmentId": "a1", "senderId": "s1", "audioDurationMs": 1000}
    )

    _assert_no_secret_logged(caplog, capsys)
    assert len(socket.sent) == 1
    _assert_error_payload(socket.sent[0], "audio_process_error")
    assert socket.sent[0]["errorCode"] == "processing_failed"
    assert socket.sent[0]["messageId"] == "m1"
    assert socket.sent[0]["attachmentId"] == "a1"


@pytest.mark.parametrize(
    "publish",
    [
        lambda h: h._publish_audio_result("t1", Exploding(), 10),
        lambda h: h._publish_transcription_result("t1", Exploding()),
        lambda h: h._publish_translation_ready("t1", Exploding()),
    ],
    ids=["audio_result", "transcription_ready", "translation_ready"],
)
async def test_audio_publication_failure_logs_only_the_type(publish, caplog, capsys):
    caplog.set_level(logging.DEBUG)

    await publish(_audio_handler(CapturingSocket()))

    _assert_no_secret_logged(caplog, capsys)


async def test_audio_error_publication_failure_logs_only_the_type(caplog, capsys):
    caplog.set_level(logging.DEBUG)

    await _audio_handler(FailingSocket())._publish_audio_error(
        task_id="t1", message_id="m1", attachment_id="a1", error="x", error_code="c"
    )

    _assert_no_secret_logged(caplog, capsys)


def _translation(language="fr"):
    return SimpleNamespace(
        language=language,
        audio_path="/nowhere.wav",
        audio_url=None,
        audio_data_base64=None,
        audio_bytes=None,
        translated_text="bonjour",
        segments=None,
        duration_ms=10,
        voice_cloned=False,
        voice_quality=0.0,
        audio_mime_type="audio/wav",
    )


async def test_audio_translated_track_read_failure_logs_only_the_type(monkeypatch, caplog, capsys):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(audio_module, "read_audio_bytes", _boom)

    await _audio_handler(CapturingSocket())._publish_translation_ready(
        "t1",
        {"message_id": "m1", "attachment_id": "a1", "language": "fr", "translation": _translation()},
    )
    await _audio_handler(CapturingSocket())._publish_audio_result(
        "t1",
        SimpleNamespace(
            message_id="m1",
            attachment_id="a1",
            translations={"fr": _translation()},
            new_voice_profile=None,
        ),
        10,
    )

    captured = capsys.readouterr()
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert SECRET not in logged + captured.out + captured.err
    assert "Traceback" not in captured.err
    assert logged.count("SecretError") >= 2


async def test_audio_embedding_decode_failure_logs_only_the_type(monkeypatch, caplog, capsys):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(base64, "b64decode", _boom)

    await _audio_handler(CapturingSocket())._publish_audio_result(
        "t1",
        SimpleNamespace(
            message_id="m1",
            attachment_id="a1",
            translations={},
            new_voice_profile=SimpleNamespace(embedding_base64="AAAA"),
        ),
        10,
    )

    _assert_no_secret_logged(caplog, capsys)


@pytest.fixture
def transcription_service_raising(monkeypatch):
    service = SimpleNamespace(is_initialized=True, transcribe=_async_boom)
    monkeypatch.setattr(transcription_module, "TRANSCRIPTION_SERVICE_AVAILABLE", True)
    monkeypatch.setattr(transcription_module, "get_transcription_service", lambda: service, raising=False)


async def test_transcription_failure_logs_type_and_publishes_generic_error(
    transcription_service_raising, caplog, capsys
):
    caplog.set_level(logging.DEBUG)
    socket = CapturingSocket()

    await _transcription_handler(socket)._handle_transcription_only_request(
        {"taskId": "t1", "messageId": "m1", "attachmentId": "a1", "_audioBinary": b"RIFF"}
    )

    _assert_no_secret_logged(caplog, capsys)
    assert len(socket.sent) == 1
    _assert_error_payload(socket.sent[0], "transcription_error")
    assert socket.sent[0]["errorCode"] == "transcription_failed"
    assert socket.sent[0]["taskId"] == "t1"


async def test_transcription_base64_decode_failure_never_carries_the_message(
    transcription_service_raising, monkeypatch, caplog, capsys
):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(base64, "b64decode", _boom)
    socket = CapturingSocket()

    await _transcription_handler(socket)._handle_transcription_only_request(
        {"taskId": "t1", "messageId": "m1", "attachmentId": "a1", "audioData": "Zm9v"}
    )

    _assert_no_secret_logged(caplog, capsys)
    _assert_error_payload(socket.sent[0], "transcription_error")


@pytest.mark.parametrize(
    "publish",
    [
        lambda h: h._publish_transcription_result(
            task_id="t1", message_id="m1", attachment_id="a1", result=Exploding(), processing_time=1
        ),
        lambda h: h._publish_transcription_error(
            task_id="t1", message_id="m1", attachment_id="a1", error="x", error_code="c"
        ),
    ],
    ids=["result", "error"],
)
async def test_transcription_publication_failure_logs_only_the_type(publish, caplog, capsys):
    caplog.set_level(logging.DEBUG)

    await publish(_transcription_handler(FailingSocket()))

    _assert_no_secret_logged(caplog, capsys)


async def test_voice_api_failure_logs_type_and_publishes_generic_error(caplog, capsys):
    caplog.set_level(logging.DEBUG)
    socket = CapturingSocket()

    await _voice_handler(socket)._handle_voice_api_request(
        {"type": "voice_translate", "taskId": "t1"}
    )

    _assert_no_secret_logged(caplog, capsys)
    assert len(socket.sent) == 1
    payload = socket.sent[0]
    _assert_error_payload(payload, "voice_api_error")
    assert payload["errorCode"] == "INTERNAL_ERROR"
    assert payload["taskId"] == "t1"
    assert payload["requestType"] == "voice_translate"


async def test_voice_profile_failure_logs_type_and_publishes_generic_error(caplog, capsys):
    caplog.set_level(logging.DEBUG)
    socket = CapturingSocket()

    await _voice_handler(socket)._handle_voice_profile_request(
        {"request_id": "r1", "user_id": "u1"}
    )

    _assert_no_secret_logged(caplog, capsys)
    assert len(socket.sent) == 1
    payload = socket.sent[0]
    _assert_error_payload(payload, "voice_profile_error")
    assert payload["success"] is False
    assert payload["errorCode"] == "INTERNAL_ERROR"
    assert payload["request_id"] == "r1"
    assert payload["user_id"] == "u1"


async def test_voice_job_publication_failure_logs_only_the_type(caplog, capsys):
    caplog.set_level(logging.DEBUG)
    job = SimpleNamespace(
        id="j1", status=SimpleNamespace(value="completed"), user_id="u1", result={"ok": True}, error=None
    )

    await _voice_handler(FailingSocket())._on_translation_job_completed(job)

    _assert_no_secret_logged(caplog, capsys)
