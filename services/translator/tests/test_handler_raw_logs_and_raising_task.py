"""
#17173 et #17174 (R4) — `TranslationHandler`.

1. Aucun site du handler ne journalise l'exception brute : le message d'une
   exception peut porter le texte d'un utilisateur (un post, une réponse de
   la Voice API, une ligne de résultat). Seul le NOM du type est écrit, sous
   le préfixe `[TRANSLATOR]`.
2. Une tâche déjà construite dont l'entrée en file LÈVE est signalée UNE fois
   à la passerelle par la même `translation_error` qu'un refus de file pleine
   (libellé et forme inchangés : la passerelle la traite déjà en transitoire),
   et sa réserve en vol est libérée : sa relance est réacceptée au lieu
   d'attendre l'échéance de ~30 s. Une réserve prise avant que la tâche
   n'existe est libérée aussi. Une publication qui lève ne remonte pas et ne
   boucle pas ; un refus ordinaire (`enqueue_task` rend False) ne se publie
   jamais deux fois.
"""
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, create_autospec

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SECRET = "SECRET-TEXT-17173"


def _module():
    import services.zmq_translation_handler as module
    return module


def _pool(enqueue=None):
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
    pool.enqueue_task = enqueue if enqueue is not None else AsyncMock(return_value=True)
    return pool


def _handler(monkeypatch, enqueue=None, pub_socket=None):
    module = _module()
    monkeypatch.setattr(module, "CACHE_AVAILABLE", False)
    socket = pub_socket if pub_socket is not None else AsyncMock()
    return module.TranslationHandler(pool_manager=_pool(enqueue), pub_socket=socket)


def _request(task_id=None) -> dict:
    request = {
        "type": "translation",
        "messageId": "msg-1",
        "text": "bonjour " + "z" * 150,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "c1",
        "modelType": "basic",
    }
    if task_id is not None:
        request["taskId"] = task_id
    return request


def _sent(socket) -> list:
    return [json.loads(call.args[0].decode("utf-8")) for call in socket.send.await_args_list]


def _pool_full(task_id: str) -> dict:
    return {
        "type": "translation_error",
        "taskId": task_id,
        "messageId": "msg-1",
        "error": "translation pool full",
        "conversationId": "c1",
    }


def _assert_only_type_logged(caplog, type_name: str = "RuntimeError"):
    rendered = [record.getMessage() for record in caplog.records]
    leaked = [line for line in rendered if SECRET in line]
    assert not leaked, f"exception brute journalisée : {leaked!r}"
    assert any("[TRANSLATOR]" in line and type_name in line for line in rendered), rendered


# ── #17173 — aucun site ne journalise l'exception brute ──────────────────────


@pytest.mark.parametrize("factory", ["get_voice_api_handler", "get_voice_profile_handler"])
def test_voice_handler_init_failure_logs_only_the_exception_type(monkeypatch, caplog, factory):
    module = _module()
    monkeypatch.setattr(module, "VOICE_API_AVAILABLE", True)
    monkeypatch.setattr(module, "VOICE_PROFILE_HANDLER_AVAILABLE", True)
    monkeypatch.setattr(module, "get_voice_api_handler", MagicMock(), raising=False)
    monkeypatch.setattr(module, "get_voice_profile_handler", MagicMock(), raising=False)
    monkeypatch.setattr(module, factory, MagicMock(side_effect=RuntimeError(f"{SECRET} init")), raising=False)

    with caplog.at_level(logging.DEBUG):
        handler = _handler(monkeypatch)

    attribute = "voice_api_handler" if factory == "get_voice_api_handler" else "voice_profile_handler"
    assert getattr(handler, attribute) is None
    _assert_only_type_logged(caplog)


async def test_multipart_json_error_logs_only_the_exception_type(monkeypatch, caplog):
    handler = _handler(monkeypatch)

    def failing_loads(*_args, **_kwargs):
        raise json.JSONDecodeError(f"{SECRET} multipart", "{}", 0)

    monkeypatch.setattr(_module().json, "loads", failing_loads)

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request_multipart([b"{}"])

    _assert_only_type_logged(caplog, "JSONDecodeError")


class _ResultRaisingOnSaveField(dict):
    def get(self, key, default=None):
        if key == "translatorModel":
            raise RuntimeError(f"{SECRET} save")
        return super().get(key, default)


async def test_save_preparation_error_logs_only_the_exception_type_and_still_publishes(monkeypatch, caplog):
    handler = _handler(monkeypatch)
    result = _ResultRaisingOnSaveField(
        messageId="msg-1",
        translatedText="hello there",
        sourceLanguage="fr",
        targetLanguage="en",
        confidenceScore=0.9,
        originalText="bonjour",
    )

    with caplog.at_level(logging.DEBUG):
        await handler._publish_translation_result("t-save", result, "en")

    _assert_only_type_logged(caplog)
    assert [message["type"] for message in _sent(handler.pub_socket)] == ["translation_completed"]


async def test_story_text_object_translation_error_logs_only_the_exception_type(monkeypatch, caplog):
    handler = _handler(monkeypatch)
    service = MagicMock()
    service.translate_with_structure = AsyncMock(side_effect=RuntimeError(f"{SECRET} post"))
    handler.pool_manager.translation_service = service

    with caplog.at_level(logging.DEBUG):
        await handler._handle_story_text_object_translation({
            "type": "story_text_object_translation",
            "postId": "p1",
            "textObjectIndex": 0,
            "text": "bonjour",
            "sourceLanguage": "fr",
            "targetLanguages": ["en"],
        })

    _assert_only_type_logged(caplog)
    events = _sent(handler.pub_socket)
    assert [event["type"] for event in events] == ["story_text_object_translation_completed"]
    assert events[0]["translations"] == {}


async def test_voice_api_error_logs_only_the_exception_type_and_prints_no_traceback(monkeypatch, caplog, capsys):
    handler = _handler(monkeypatch)
    from services.voice_api.voice_api_handler import VoiceAPIHandler
    voice = create_autospec(VoiceAPIHandler, instance=True)
    voice.handle_request.side_effect = RuntimeError(f"{SECRET} voice")
    handler.voice_api_handler = voice

    with caplog.at_level(logging.DEBUG):
        await handler._handle_voice_api_request({"type": "voice_translate"})

    _assert_only_type_logged(caplog)
    captured = capsys.readouterr()
    assert SECRET not in captured.err
    assert SECRET not in captured.out


def test_no_raw_exception_interpolation_remains_in_the_handler():
    source = Path(_module().__file__).read_text(encoding="utf-8")
    assert "{e}" not in source
    assert "traceback.print_exc" not in source


# ── #17174 R4 — une tâche construite dont le traitement lève est signalée ────


@pytest.mark.parametrize(
    "error",
    [RuntimeError(f"{SECRET} enqueue"), json.JSONDecodeError(f"{SECRET} json", "{}", 0)],
)
async def test_raising_enqueue_publishes_the_pool_full_error_once_and_releases_the_claim(monkeypatch, caplog, error):
    enqueue = AsyncMock(side_effect=error)
    handler = _handler(monkeypatch, enqueue=enqueue)

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request("t-raise"))

    assert _sent(handler.pub_socket) == [_pool_full("t-raise")]
    assert "t-raise" not in handler._inflight_tasks
    _assert_only_type_logged(caplog, type(error).__name__)


async def test_released_claim_lets_the_gateway_retry_be_enqueued(monkeypatch):
    enqueue = AsyncMock(side_effect=[RuntimeError(f"{SECRET} first"), True])
    handler = _handler(monkeypatch, enqueue=enqueue)

    await handler._handle_translation_request(_request("t-retry"))
    await handler._handle_translation_request(_request("t-retry"))

    assert enqueue.await_count == 2
    assert "t-retry" in handler._inflight_tasks
    assert _sent(handler.pub_socket) == [_pool_full("t-retry")]


async def test_raising_enqueue_without_task_id_reports_the_generated_task(monkeypatch):
    enqueue = AsyncMock(side_effect=RuntimeError(f"{SECRET} anonymous"))
    handler = _handler(monkeypatch, enqueue=enqueue)

    await handler._handle_translation_request(_request())

    generated = enqueue.await_args.args[0].task_id
    assert _sent(handler.pub_socket) == [_pool_full(generated)]


async def test_failing_error_publication_neither_raises_nor_loops(monkeypatch, caplog):
    socket = AsyncMock()
    socket.send = AsyncMock(side_effect=RuntimeError(f"{SECRET} send"))
    handler = _handler(monkeypatch, enqueue=AsyncMock(side_effect=RuntimeError(f"{SECRET} enqueue")), pub_socket=socket)

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request("t-send"))

    assert socket.send.await_count == 1
    assert "t-send" not in handler._inflight_tasks
    _assert_only_type_logged(caplog)


async def test_raising_report_itself_does_not_escape(monkeypatch, caplog):
    handler = _handler(monkeypatch, enqueue=AsyncMock(side_effect=RuntimeError(f"{SECRET} enqueue")))
    handler.publish_pool_full = AsyncMock(side_effect=RuntimeError(f"{SECRET} report"))

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request("t-report"))

    assert handler.publish_pool_full.await_count == 1
    assert "t-report" not in handler._inflight_tasks
    _assert_only_type_logged(caplog)


async def test_ordinary_refusal_is_published_once_even_when_its_report_raises(monkeypatch):
    handler = _handler(monkeypatch, enqueue=AsyncMock(return_value=False))
    handler.publish_pool_full = AsyncMock(side_effect=RuntimeError(f"{SECRET} report"))

    await handler._handle_translation_request(_request("t-refused"))

    assert handler.publish_pool_full.await_count == 1


async def test_ordinary_refusal_publishes_a_single_error(monkeypatch):
    handler = _handler(monkeypatch, enqueue=AsyncMock(return_value=False))

    await handler._handle_translation_request(_request("t-full"))

    assert _sent(handler.pub_socket) == [_pool_full("t-full")]
    assert "t-full" not in handler._inflight_tasks


async def test_accepted_task_keeps_its_claim_and_publishes_nothing(monkeypatch):
    handler = _handler(monkeypatch, enqueue=AsyncMock(return_value=True))

    await handler._handle_translation_request(_request("t-ok"))

    assert _sent(handler.pub_socket) == []
    assert "t-ok" in handler._inflight_tasks


async def test_failure_after_claim_before_the_task_exists_releases_the_claim(monkeypatch, caplog):
    enqueue = AsyncMock(return_value=True)
    handler = _handler(monkeypatch, enqueue=enqueue)
    monkeypatch.setattr(_module(), "TranslationTask", MagicMock(side_effect=RuntimeError(f"{SECRET} build")))

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request("t-build"))

    assert "t-build" not in handler._inflight_tasks
    assert enqueue.await_count == 0
    assert _sent(handler.pub_socket) == []
    _assert_only_type_logged(caplog)
