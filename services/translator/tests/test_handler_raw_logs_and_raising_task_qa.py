"""
QA indépendante de #17173 / #17174 (R4) — `TranslationHandler`.

Ces témoins complètent `test_handler_raw_logs_and_raising_task.py` sur ce que
ses doublures (`enqueue_task` remplacé par un `AsyncMock`) ne montrent pas :

1. Avec la VRAIE file (`ConnectionManager.enqueue_task`), une entrée qui lève
   est convertie en `False` par la file elle-même : la passerelle reçoit UNE
   seule `translation_error`, jamais deux (chemin ordinaire + chemin #17174).
2. Une annulation (`asyncio.CancelledError`) n'est pas avalée par le nouveau
   filet : l'arrêt du serveur doit pouvoir interrompre le gestionnaire, et
   rien n'est publié pour une tâche dont on ne sait pas si la file l'a prise.
3. Un re-push refusé par la déduplication ne libère pas la réserve de la
   tâche ORIGINALE, toujours en vol, et ne publie rien.
4. Une exception levée dans une branche sans tâche (oubli de cache) ne publie
   rien et ne laisse partir que le nom du type.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SECRET = "SECRET-QA-17174"


def _module():
    import services.zmq_translation_handler as module
    return module


def _pool():
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        return mgr_mod.TranslationPoolManager(
            normal_pool_size=100,
            any_pool_size=100,
            normal_workers=1,
            any_workers=1,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original


def _handler(monkeypatch, pool=None):
    module = _module()
    monkeypatch.setattr(module, "CACHE_AVAILABLE", False)
    return module.TranslationHandler(pool_manager=pool or _pool(), pub_socket=AsyncMock())


def _request(task_id: str, text_length: int = 400) -> dict:
    return {
        "type": "translation",
        "taskId": task_id,
        "messageId": "msg-qa",
        "text": "b" * text_length,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "c-qa",
        "modelType": "basic",
    }


def _sent(socket) -> list:
    return [json.loads(call.args[0].decode("utf-8")) for call in socket.send.await_args_list]


async def test_real_queue_raising_entry_is_reported_once_and_released(monkeypatch, caplog):
    pool = _pool()
    manager = pool.connection_manager
    manager.enable_batching = False
    manager.enable_priority_queue = False

    async def raising_single(_task):
        raise RuntimeError(f"{SECRET} single")

    monkeypatch.setattr(manager, "_enqueue_single_task", raising_single)
    handler = _handler(monkeypatch, pool)

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request("t-real"))

    events = _sent(handler.pub_socket)
    assert events == [{
        "type": "translation_error",
        "taskId": "t-real",
        "messageId": "msg-qa",
        "error": "translation pool full",
        "conversationId": "c-qa",
    }]
    assert "t-real" not in handler._inflight_tasks
    assert not [r for r in caplog.records if SECRET in r.getMessage()]


async def test_cancellation_during_enqueue_is_not_swallowed_and_publishes_nothing(monkeypatch):
    pool = _pool()
    pool.enqueue_task = AsyncMock(side_effect=asyncio.CancelledError())
    handler = _handler(monkeypatch, pool)

    with pytest.raises(asyncio.CancelledError):
        await handler._handle_translation_request(_request("t-cancel"))

    assert _sent(handler.pub_socket) == []


async def test_deduplicated_repush_keeps_the_original_claim_and_publishes_nothing(monkeypatch):
    pool = _pool()
    pool.enqueue_task = AsyncMock(return_value=True)
    handler = _handler(monkeypatch, pool)

    await handler._handle_translation_request(_request("t-dup"))
    expiry = handler._inflight_tasks["t-dup"]
    pool.enqueue_task = AsyncMock(side_effect=RuntimeError(f"{SECRET} dup"))
    await handler._handle_translation_request(_request("t-dup"))

    assert handler._inflight_tasks.get("t-dup") == expiry
    assert pool.enqueue_task.await_count == 0
    assert _sent(handler.pub_socket) == []


async def test_raising_branch_without_task_publishes_nothing_and_logs_only_the_type(monkeypatch, caplog):
    handler = _handler(monkeypatch)
    handler._handle_cache_forget = AsyncMock(side_effect=ValueError(f"{SECRET} forget"))

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request({"type": "cache_forget", "requestId": "r1"})

    assert _sent(handler.pub_socket) == []
    rendered = [r.getMessage() for r in caplog.records]
    assert not [line for line in rendered if SECRET in line]
    assert any("[TRANSLATOR]" in line and "ValueError" in line for line in rendered)
