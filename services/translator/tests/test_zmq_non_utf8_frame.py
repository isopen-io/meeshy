"""
#17205 — un premier frame multipart qui n'est pas un objet JSON UTF-8 est
refusé proprement.

Le routeur `ZMQTranslationServer` décodait le frame de métadonnées sans garde :
un `b'\\xff\\xfe'` levait `UnicodeDecodeError`, un JSON tronqué
`JSONDecodeError`, un JSON valide non-objet (`[]`, `"x"`, `3`)
`AttributeError` sur `request_data.get`. L'exception remontait à la boucle de
réception, qui la journalisait en entier (`Erreur inattendue: {e}`) et
imprimait un traceback. Le handler de traduction, appelé directement pour
`ping` et `translation`, n'attrapait que `JSONDecodeError`.

Refus attendu, aux deux sites : une seule ligne `[TRANSLATOR]` qui ne porte
que le TYPE de l'erreur, aucun traceback, rien ne remonte, rien n'est routé ni
publié, et la boucle de réception continue.
"""

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, create_autospec

import pytest
import zmq

from services.zmq_pool_manager import TranslationPoolManager
from services.zmq_server_core import ZMQTranslationServer
from services.zmq_translation_handler import TranslationHandler

SECRET = "secret-du-message-17205"

REJECTED_FRAMES = [
    pytest.param(b"\xff\xfe" + SECRET.encode("utf-8"), "UnicodeDecodeError", id="non-utf8"),
    pytest.param(('{"type": "translation", "text": "' + SECRET).encode("utf-8"), "JSONDecodeError", id="json-tronque"),
    pytest.param(json.dumps([SECRET]).encode("utf-8"), "list", id="tableau"),
    pytest.param(json.dumps(SECRET).encode("utf-8"), "str", id="chaine"),
    pytest.param(b"3", "int", id="nombre"),
    pytest.param(b"null", "NoneType", id="null"),
]


def _core() -> ZMQTranslationServer:
    core = ZMQTranslationServer.__new__(ZMQTranslationServer)
    core.active_tasks = set()
    core.translation_handler = create_autospec(TranslationHandler, instance=True)
    core.audio_handler = MagicMock()
    core.transcription_handler = MagicMock()
    core.voice_handler = None
    core._create_tracked_task = MagicMock()
    core._inject_binary_frames = MagicMock()
    return core


def _handler() -> tuple[TranslationHandler, SimpleNamespace, MagicMock]:
    pool = create_autospec(TranslationPoolManager, instance=True)
    socket = SimpleNamespace(send=AsyncMock(), send_multipart=AsyncMock())
    return TranslationHandler(pool_manager=pool, pub_socket=socket), socket, pool


def _translator_lines(caplog) -> list[logging.LogRecord]:
    return [record for record in caplog.records if "[TRANSLATOR]" in record.getMessage()]


def _assert_single_type_only_line(caplog, frame: bytes, error_type: str) -> None:
    lines = _translator_lines(caplog)
    assert len(lines) == 1, [record.getMessage() for record in caplog.records]
    message = lines[0].getMessage()
    assert error_type in message
    assert SECRET not in caplog.text
    assert frame.decode("utf-8", errors="replace") not in message
    assert all(record.exc_info is None for record in caplog.records)


@pytest.mark.unit
@pytest.mark.parametrize("frame, error_type", REJECTED_FRAMES)
async def test_the_router_refuses_a_bad_metadata_frame_with_its_type_only(caplog, frame, error_type):
    core = _core()
    caplog.set_level(logging.DEBUG)

    await core._handle_translation_request_multipart([frame, b"\x00binaire"])

    _assert_single_type_only_line(caplog, frame, error_type)
    core._create_tracked_task.assert_not_called()
    core._inject_binary_frames.assert_not_called()
    core.translation_handler._handle_translation_request_multipart.assert_not_called()


@pytest.mark.unit
@pytest.mark.parametrize("frame, error_type", REJECTED_FRAMES)
async def test_the_handler_refuses_a_bad_metadata_frame_with_its_type_only(caplog, frame, error_type):
    handler, socket, pool = _handler()
    caplog.set_level(logging.DEBUG)

    await handler._handle_translation_request_multipart([frame])

    _assert_single_type_only_line(caplog, frame, error_type)
    socket.send.assert_not_called()
    socket.send_multipart.assert_not_called()
    pool.enqueue_task.assert_not_called()


@pytest.mark.unit
async def test_a_valid_frame_is_still_routed_after_a_refused_one():
    core = _core()

    await core._handle_translation_request_multipart([b"\xff\xfe"])
    await core._handle_translation_request_multipart([json.dumps({"type": "translation", "text": "Bonjour"}).encode("utf-8")])

    core._create_tracked_task.assert_called_once()
    _, label = core._create_tracked_task.call_args[0]
    assert label == "translation"


@pytest.mark.unit
async def test_the_receive_loop_keeps_running_without_a_traceback(caplog, capsys):
    core = _core()
    core.pull_socket = SimpleNamespace(
        recv_multipart=AsyncMock(
            side_effect=[
                [b"\xff\xfe" + SECRET.encode("utf-8")],
                [json.dumps({"type": "translation", "text": "Bonjour"}).encode("utf-8")],
                zmq.ZMQError(),
            ]
        )
    )
    core.pub_socket = object()
    core._update_cpu_usage_background = AsyncMock()
    core._cleanup_temp_files_background = AsyncMock()
    core.stop = AsyncMock()
    caplog.set_level(logging.DEBUG)

    await core.start()

    assert core.pull_socket.recv_multipart.await_count == 3
    _, label = core._create_tracked_task.call_args[0]
    assert label == "translation"
    assert "Erreur inattendue" not in caplog.text
    assert SECRET not in caplog.text
    assert "Traceback" not in capsys.readouterr().err


@pytest.mark.unit
async def test_an_unconfirmed_forget_logs_its_type_without_any_identifier(monkeypatch, caplog):
    from services import cache_forget
    from services.redis_service import ErasureNotConfirmedError

    request = {"type": "cache_forget", "requestId": "req-17205", "attachmentIds": ["att-17205"], "messageIds": ["msg-17205"]}

    async def refuse(*_args, **_kwargs):
        raise ErasureNotConfirmedError("req-17205 att-17205 msg-17205")

    monkeypatch.setattr(cache_forget, "forget_cached_content", refuse)
    handler, socket, _pool = _handler()
    caplog.set_level(logging.DEBUG)

    await handler._handle_cache_forget(request)

    lines = _translator_lines(caplog)
    assert len(lines) == 1
    assert "ErasureNotConfirmedError" in lines[0].getMessage()
    for identifier in ("req-17205", "att-17205", "msg-17205"):
        assert identifier not in caplog.text
    socket.send.assert_not_called()
    socket.send_multipart.assert_not_called()
