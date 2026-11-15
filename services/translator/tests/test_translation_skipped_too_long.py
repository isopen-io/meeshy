"""
#17204 — un message plus long que `MAX_TRANSLATION_LENGTH` est ignoré proprement.

Le handler lisait `MessageLimits.MAX_TRANSLATION_LENGTH` sans l'importer : le
`NameError` était avalé par le `except` final, aucun `translation_skipped` ne
partait, et la passerelle renvoyait la requête jusqu'à épuiser ses relances.

Contrat : EXACTEMENT un `translation_skipped` (champs historiques + `taskId`),
aucun `translation_error`, aucun log de niveau ERROR, et le texte de
l'utilisateur n'apparaît dans aucun log. Un message à la limite exacte n'est
pas ignoré.
"""
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config.message_limits import MessageLimits  # noqa: E402

MARKER = "SECRET-TEXT-17204"


def _module():
    import services.zmq_translation_handler as module
    return module


def _pool(enqueue):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        pool = mgr_mod.TranslationPoolManager(
            normal_pool_size=100,
            any_pool_size=100,
            normal_workers=1,
            any_workers=1,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    pool.enqueue_task = enqueue
    return pool


def _handler(monkeypatch, enqueue, socket):
    module = _module()
    monkeypatch.setattr(module, "CACHE_AVAILABLE", False)
    return module.TranslationHandler(pool_manager=_pool(enqueue), pub_socket=socket)


def _text(length: int) -> str:
    return (MARKER + "z" * length)[:length]


def _request(text: str, task_id: str | None = "t-long") -> dict:
    request = {
        "type": "translation",
        "messageId": "msg-long",
        "text": text,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "c-long",
        "modelType": "basic",
    }
    if task_id is not None:
        request["taskId"] = task_id
    return request


def _sent(socket) -> list:
    return [json.loads(call.args[0].decode("utf-8")) for call in socket.send.await_args_list]


async def test_too_long_message_publishes_exactly_one_translation_skipped(monkeypatch, caplog):
    socket = AsyncMock()
    enqueue = AsyncMock(return_value=True)
    handler = _handler(monkeypatch, enqueue, socket)
    length = MessageLimits.MAX_TRANSLATION_LENGTH + 1
    caplog.clear()

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request(_text(length)))

    assert _sent(socket) == [{
        "type": "translation_skipped",
        "messageId": "msg-long",
        "reason": "message_too_long",
        "length": length,
        "max_length": MessageLimits.MAX_TRANSLATION_LENGTH,
        "conversationId": "c-long",
        "taskId": "t-long",
    }]
    enqueue.assert_not_awaited()
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR], [
        r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR
    ]
    assert not [r.getMessage() for r in caplog.records if MARKER in r.getMessage()]


async def test_too_long_message_without_task_id_keeps_the_historical_shape(monkeypatch):
    socket = AsyncMock()
    handler = _handler(monkeypatch, AsyncMock(return_value=True), socket)
    length = MessageLimits.MAX_TRANSLATION_LENGTH + 1

    await handler._handle_translation_request(_request(_text(length), task_id=None))

    sent = _sent(socket)
    assert len(sent) == 1
    assert sent[0]["type"] == "translation_skipped"
    assert "taskId" not in sent[0]


async def test_message_at_exact_limit_is_not_skipped(monkeypatch):
    socket = AsyncMock()
    enqueue = AsyncMock(return_value=True)
    handler = _handler(monkeypatch, enqueue, socket)

    await handler._handle_translation_request(
        _request(_text(MessageLimits.MAX_TRANSLATION_LENGTH), task_id="t-limit")
    )

    assert not [m for m in _sent(socket) if m.get("type") == "translation_skipped"]
    enqueue.assert_awaited_once()
