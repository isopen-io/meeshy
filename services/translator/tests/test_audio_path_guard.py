"""
#18628 — un `audioPath` reçu par le socket PULL ZMQ (non authentifié) n'est
ouvert que s'il désigne un fichier régulier SOUS une racine autorisée.

Trois sites lisaient un chemin fourni par la requête sans le borner :
`transcription_only` (mode « fichier direct »), `audio_process` (repli legacy
de l'AudioFetcher) et la Voice API (`audioPath`, `audioPath_1/_2`). Un émetteur
du port 5555 pouvait donc faire lire `/etc/passwd`, ou tout fichier du
conteneur, au service ML.

Le garde partagé (`utils.audio_path_guard`) résout le chemin (liens compris),
exige qu'il tombe sous une racine de `TRANSLATOR_AUDIO_PATH_ROOTS`, et refuse
sinon, fail-closed. Les handlers traduisent le refus en erreur publiée
`AUDIO_PATH_REJECTED`, sans jamais journaliser le chemin.
"""

import json
import logging
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from utils.audio_path_guard import (
    AUDIO_PATH_REJECTED,
    ROOTS_ENV,
    AudioPathRejected,
    allowed_audio_roots,
    guard_requested_audio_path,
)


@pytest.fixture
def root(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    monkeypatch.setenv(ROOTS_ENV, str(allowed))
    return allowed


@pytest.fixture
def outside(tmp_path):
    secret = tmp_path / "secret.wav"
    secret.write_bytes(b"RIFF-secret")
    return secret


def _inside(root: Path, name: str = "voice.wav") -> Path:
    audio = root / name
    audio.write_bytes(b"RIFF0000WAVE")
    return audio


class CapturingSocket:
    def __init__(self):
        self.sent = []

    async def send(self, data):
        self.sent.append(json.loads(data.decode("utf-8")))


# ═══════════════════════════════════════════════════════════════════════════
# LE GARDE SEUL
# ═══════════════════════════════════════════════════════════════════════════

def test_a_regular_file_under_the_root_is_accepted(root):
    audio = _inside(root)

    assert guard_requested_audio_path(str(audio)) == str(audio.resolve())


def test_a_traversal_out_of_the_root_is_rejected(root, outside):
    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(str(root / ".." / outside.name))

    assert rejected.value.reason == "outside_roots"


def test_a_relative_traversal_to_etc_passwd_is_rejected(root, monkeypatch):
    monkeypatch.chdir(root)

    with pytest.raises(AudioPathRejected):
        guard_requested_audio_path("../../../../../../../../etc/passwd")


def test_an_absolute_path_outside_every_root_is_rejected(root, outside):
    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(str(outside))

    assert rejected.value.reason == "outside_roots"


def test_a_symlink_under_the_root_pointing_outside_is_rejected(root, outside):
    link = root / "innocent.wav"
    link.symlink_to(outside)

    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(str(link))

    assert rejected.value.reason == "outside_roots"


def test_the_guard_hands_back_the_checked_target_not_the_requested_spelling(root):
    # Le consommateur doit ouvrir CE QUI A ÉTÉ VÉRIFIÉ : rendre la graphie
    # demandée laisserait un lien de la racine être re-résolu plus tard,
    # après une substitution, hors de tout contrôle.
    audio = _inside(root)
    (root / "sub").mkdir()
    link = root / "alias.wav"
    link.symlink_to(audio)

    assert guard_requested_audio_path(str(link)) == str(audio.resolve())
    assert guard_requested_audio_path(str(root / "sub" / ".." / "voice.wav")) == str(audio.resolve())


def test_a_directory_under_the_root_is_rejected(root):
    folder = root / "folder"
    folder.mkdir()

    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(str(folder))

    assert rejected.value.reason == "not_a_file"


def test_a_missing_file_is_rejected(root):
    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(str(root / "absent.wav"))

    assert rejected.value.reason == "not_found"


def test_a_null_byte_is_rejected(root):
    audio = _inside(root)

    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(f"{audio}\x00.png")

    assert rejected.value.reason == "null_byte"


@pytest.mark.parametrize("value", ["", None, 42, b"/etc/passwd", ["/etc/passwd"]])
def test_an_empty_or_non_string_path_is_rejected(root, value):
    with pytest.raises(AudioPathRejected):
        guard_requested_audio_path(value)


def test_a_sibling_prefix_of_the_root_is_not_under_it(root):
    sibling = root.parent / f"{root.name}-evil"
    sibling.mkdir()
    audio = _inside(sibling)

    with pytest.raises(AudioPathRejected):
        guard_requested_audio_path(str(audio))


def test_the_rejection_message_never_carries_the_path(root, outside):
    with pytest.raises(AudioPathRejected) as rejected:
        guard_requested_audio_path(str(outside))

    assert str(outside) not in str(rejected.value)
    assert outside.name not in repr(rejected.value)


def test_roots_are_read_from_the_environment_separated_by_pathsep(tmp_path, monkeypatch):
    first, second = tmp_path / "a", tmp_path / "b"
    first.mkdir()
    second.mkdir()
    monkeypatch.setenv(ROOTS_ENV, os.pathsep.join([str(first), "", str(second)]))

    assert allowed_audio_roots() == (first.resolve(), second.resolve())
    assert guard_requested_audio_path(str(_inside(second))) == str((second / "voice.wav").resolve())


def test_the_temp_dir_is_not_a_default_root(monkeypatch):
    # Le traducteur y garde l'audio EN COURS des autres utilisateurs, sous des
    # noms prévisibles (/tmp/meeshy_audio/audio_{attachmentId}_{ts}) : aucun
    # producteur légitime n'envoie de chemin sous /tmp.
    import tempfile

    monkeypatch.delenv(ROOTS_ENV, raising=False)
    monkeypatch.delenv("UPLOAD_PATH", raising=False)

    roots = allowed_audio_roots()

    assert Path(tempfile.gettempdir()).resolve() not in roots
    assert roots == (Path("/app/uploads").resolve(),)


def test_a_file_under_the_temp_dir_is_rejected_without_configuration(monkeypatch):
    import tempfile

    monkeypatch.delenv(ROOTS_ENV, raising=False)
    monkeypatch.delenv("UPLOAD_PATH", raising=False)
    with tempfile.NamedTemporaryFile(suffix=".wav") as someone_elses_audio:
        with pytest.raises(AudioPathRejected) as rejected:
            guard_requested_audio_path(someone_elses_audio.name)

    assert rejected.value.reason == "outside_roots"


def test_a_root_entry_that_resolves_to_the_filesystem_root_is_ignored(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    monkeypatch.setenv(ROOTS_ENV, os.pathsep.join(["/", str(allowed), "/tmp/.."]))

    assert allowed_audio_roots() == (allowed.resolve(),)


def test_a_relative_root_entry_is_ignored(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "rel").mkdir()
    monkeypatch.setenv(ROOTS_ENV, "rel")

    assert allowed_audio_roots() == ()


def test_root_entries_are_stripped(tmp_path, monkeypatch):
    monkeypatch.setenv(ROOTS_ENV, f" {tmp_path} ")

    assert allowed_audio_roots() == (tmp_path.resolve(),)


def test_the_retained_roots_are_logged_once_per_configuration(tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="utils.audio_path_guard")
    monkeypatch.setenv(ROOTS_ENV, os.pathsep.join([str(tmp_path), "rel", "/"]))

    allowed_audio_roots()
    allowed_audio_roots()

    retained = [r for r in caplog.records if r.name == "utils.audio_path_guard" and "racine" in r.getMessage()]
    assert len(retained) == 1
    assert "1 racine" in retained[0].getMessage()


def test_the_upload_root_follows_the_gateway_upload_path(tmp_path, monkeypatch):
    monkeypatch.delenv(ROOTS_ENV, raising=False)
    monkeypatch.setenv("UPLOAD_PATH", str(tmp_path / "uploads"))

    assert (tmp_path / "uploads").resolve() in allowed_audio_roots()


# ═══════════════════════════════════════════════════════════════════════════
# SITE 1 — transcription_only
# ═══════════════════════════════════════════════════════════════════════════

class RecordingTranscriptionService:
    def __init__(self):
        self.is_initialized = True
        self.calls = []

    async def transcribe(self, audio_path, mobile_transcription=None, return_timestamps=False):
        self.calls.append(audio_path)
        return SimpleNamespace(
            text="bonjour", language="fr", confidence=0.9, duration_ms=1000,
            source="whisper", model="whisper", segments=None,
        )


@pytest.fixture
def transcription(monkeypatch):
    import services.zmq_transcription_handler as module
    from services.zmq_transcription_handler import TranscriptionHandler

    service = RecordingTranscriptionService()
    monkeypatch.setattr(module, "TRANSCRIPTION_SERVICE_AVAILABLE", True)
    monkeypatch.setattr(module, "get_transcription_service", lambda: service, raising=False)
    socket = CapturingSocket()
    handler = TranscriptionHandler.__new__(TranscriptionHandler)
    handler.pub_socket = socket
    handler.db = None
    handler.transcription_service = None
    return SimpleNamespace(handler=handler, service=service, socket=socket)


async def test_transcription_never_hands_an_outside_path_to_whisper(root, outside, transcription, caplog):
    caplog.set_level(logging.DEBUG)

    await transcription.handler._handle_transcription_only_request(
        {"taskId": "t-out", "messageId": "m1", "attachmentId": "a1", "audioPath": str(outside)}
    )

    assert transcription.service.calls == []
    assert [m["type"] for m in transcription.socket.sent] == ["transcription_error"]
    assert transcription.socket.sent[0]["errorCode"] == AUDIO_PATH_REJECTED
    assert str(outside) not in caplog.text
    assert str(outside) not in json.dumps(transcription.socket.sent)
    assert outside.read_bytes() == b"RIFF-secret"


async def test_transcription_still_reads_a_path_under_the_root(root, transcription):
    audio = _inside(root)

    await transcription.handler._handle_transcription_only_request(
        {"taskId": "t-in", "messageId": "m1", "attachmentId": "a1", "audioPath": str(audio)}
    )

    assert transcription.service.calls == [str(audio.resolve())]
    assert transcription.socket.sent[0]["type"] == "transcription_completed"


async def test_transcription_binary_mode_ignores_a_hostile_path_it_does_not_read(root, outside, transcription):
    await transcription.handler._handle_transcription_only_request(
        {"taskId": "t-bin-18628", "messageId": "m1", "attachmentId": "a1",
         "_audioBinary": b"RIFF0000WAVE", "audioPath": str(outside)}
    )

    assert len(transcription.service.calls) == 1
    assert transcription.service.calls[0] != str(outside)
    assert transcription.socket.sent[0]["type"] == "transcription_completed"


# ═══════════════════════════════════════════════════════════════════════════
# SITE 2 — audio_process (repli legacy de l'AudioFetcher)
# ═══════════════════════════════════════════════════════════════════════════

async def test_the_fetcher_legacy_fallback_rejects_an_outside_path(root, outside):
    from services.audio_fetcher import AudioFetcherService

    with pytest.raises(AudioPathRejected):
        await AudioFetcherService().acquire_audio(attachment_id="a1", audio_path=str(outside))


async def test_the_fetcher_legacy_fallback_accepts_a_path_under_the_root(root):
    from services.audio_fetcher import AudioFetcherService

    audio = _inside(root)

    assert await AudioFetcherService().acquire_audio(attachment_id="a1", audio_path=str(audio)) == (
        str(audio.resolve()),
        "path",
    )


async def test_audio_process_publishes_a_rejection_and_never_runs_the_pipeline(root, outside, monkeypatch, caplog):
    import services.zmq_audio_handler as module
    from services.audio_fetcher import AudioFetcherService

    pipeline = SimpleNamespace(
        translation_service=object(),
        database_service=object(),
        process_audio_message=AsyncMock(),
    )
    monkeypatch.setattr(module, "_retry_audio_pipeline_import", lambda: True)
    monkeypatch.setattr(module, "get_audio_pipeline", lambda: pipeline, raising=False)
    monkeypatch.setattr(module, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(module, "get_audio_fetcher", lambda: AudioFetcherService())
    caplog.set_level(logging.DEBUG)
    socket = CapturingSocket()
    handler = module.AudioHandler.__new__(module.AudioHandler)
    handler.pub_socket = socket
    handler.db = None

    await handler._handle_audio_process_request(
        {"messageId": "m1", "attachmentId": "a1", "senderId": "u1", "audioPath": str(outside)}
    )

    pipeline.process_audio_message.assert_not_awaited()
    assert [m["type"] for m in socket.sent] == ["audio_process_error"]
    assert socket.sent[0]["errorCode"] == AUDIO_PATH_REJECTED
    assert str(outside) not in caplog.text
    assert str(outside) not in json.dumps(socket.sent)


# ═══════════════════════════════════════════════════════════════════════════
# SITE 3 — Voice API
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture
def voice_api():
    from services.voice_api.voice_api_handler import VoiceAPIHandler

    handler = VoiceAPIHandler()
    ops = handler.operation_handlers
    for name in ("handle_translate", "handle_translate_async", "handle_analyze",
                 "handle_compare", "handle_profile_create", "handle_profile_update"):
        setattr(ops, name, AsyncMock(name=name))
    return handler


def _voice_request(request_type: str, path: str) -> dict:
    base = {"type": request_type, "taskId": "t-voice", "userId": "u1"}
    if request_type == "voice_compare":
        return {**base, "audioPath_1": path, "audioPath_2": path}
    return {**base, "audioPath": path, "targetLanguages": ["fr"], "name": "Ma voix", "profileId": "p1"}


VOICE_PATH_OPERATIONS = [
    ("voice_translate", "handle_translate"),
    ("voice_translate_async", "handle_translate_async"),
    ("voice_analyze", "handle_analyze"),
    ("voice_compare", "handle_compare"),
    ("voice_profile_create", "handle_profile_create"),
    ("voice_profile_update", "handle_profile_update"),
]


@pytest.mark.parametrize("request_type,operation", VOICE_PATH_OPERATIONS)
async def test_voice_api_rejects_an_outside_path_before_any_ml_service(
    root, outside, voice_api, request_type, operation, caplog
):
    caplog.set_level(logging.DEBUG)

    response = await voice_api.handle_request(_voice_request(request_type, str(outside)))

    getattr(voice_api.operation_handlers, operation).assert_not_awaited()
    assert response["type"] == "voice_api_error"
    assert response["errorCode"] == AUDIO_PATH_REJECTED
    assert str(outside) not in json.dumps(response)
    assert str(outside) not in caplog.text


@pytest.mark.parametrize("request_type,operation", VOICE_PATH_OPERATIONS)
async def test_voice_api_still_hands_a_path_under_the_root_to_the_operation(
    root, voice_api, request_type, operation
):
    audio = _inside(root)

    await voice_api.handle_request(_voice_request(request_type, str(audio)))

    call = getattr(voice_api.operation_handlers, operation).await_args
    handed = [v for k, v in call.kwargs.items() if k.startswith("audio_path")]
    assert handed and all(v == str(audio.resolve()) for v in handed)


async def test_voice_compare_rejects_when_only_the_second_path_is_outside(root, outside, voice_api):
    audio = _inside(root)

    response = await voice_api.handle_request(
        {"type": "voice_compare", "taskId": "t", "audioPath_1": str(audio), "audioPath_2": str(outside)}
    )

    voice_api.operation_handlers.handle_compare.assert_not_awaited()
    assert response["errorCode"] == AUDIO_PATH_REJECTED


async def test_voice_profile_update_without_audio_is_untouched_by_the_guard(root, voice_api):
    await voice_api.handle_request(
        {"type": "voice_profile_update", "taskId": "t", "userId": "u1", "profileId": "p1", "name": "x"}
    )

    assert voice_api.operation_handlers.handle_profile_update.await_args.kwargs["audio_path"] is None


def test_request_handler_extract_audio_paths_guards_the_requested_path(root, outside):
    from services.voice_api.request_handler import RequestHandler

    with pytest.raises(AudioPathRejected):
        RequestHandler().extract_audio_paths({"audioPath": str(outside)})


async def test_transcription_never_logs_the_accepted_path(root, transcription, caplog):
    caplog.set_level(logging.DEBUG)
    audio = _inside(root, "accepted-18628.wav")

    await transcription.handler._handle_transcription_only_request(
        {"taskId": "t-log", "messageId": "m1", "attachmentId": "a1", "audioPath": str(audio)}
    )

    assert transcription.socket.sent[0]["type"] == "transcription_completed"
    assert "accepted-18628" not in caplog.text


async def test_audio_process_never_logs_the_accepted_path(root, monkeypatch, caplog):
    import services.zmq_audio_handler as module
    from services.audio_fetcher import AudioFetcherService

    pipeline = SimpleNamespace(
        translation_service=object(),
        database_service=object(),
        process_audio_message=AsyncMock(side_effect=RuntimeError("stop")),
    )
    monkeypatch.setattr(module, "_retry_audio_pipeline_import", lambda: True)
    monkeypatch.setattr(module, "get_audio_pipeline", lambda: pipeline, raising=False)
    monkeypatch.setattr(module, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(module, "get_audio_fetcher", lambda: AudioFetcherService())
    caplog.set_level(logging.DEBUG)
    audio = _inside(root, "accepted-18628.wav")
    handler = module.AudioHandler.__new__(module.AudioHandler)
    handler.pub_socket = CapturingSocket()
    handler.db = None

    await handler._handle_audio_process_request(
        {"messageId": "m1", "attachmentId": "a1", "senderId": "u1", "audioPath": str(audio)}
    )

    assert "accepted-18628" not in caplog.text
