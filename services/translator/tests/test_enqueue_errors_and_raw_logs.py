"""
#16822 — l'entrée en file d'une tâche de traduction ne journalise plus
l'exception brute, et aucune tâche ne se perd si l'entrée en lot lève.

1. Quatre sites journalisaient `{e}` : `enqueue_task`, `_batch_flush_loop`
   et les deux `except` de `TranslationHandler._handle_translation_request`.
   Le message d'une exception peut porter le texte d'un utilisateur : seul le
   NOM du type est écrit.
2. `_accumulate` retire le lot plein de l'accumulateur AVANT de l'enfiler :
   si l'entrée lève, chaque tâche du lot est signalée une fois, la tâche
   déclenchante comprise, et `enqueue_task` rend True (le refus se dit par le
   rappel, jamais deux fois).
3. `_flush_batches` : un lot qui lève au milieu de la boucle n'empêche ni le
   signalement de ce lot, ni l'entrée des lots suivants, ni le vidage de
   l'accumulateur — un lot déjà enfilé ne l'est jamais une seconde fois.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SECRET = "SECRET-TEXT-16822"


def _task(task_id: str, source: str = "en"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text="x" * 200,
        source_language=source,
        target_languages=["fr"],
        conversation_id="c1",
    )


def _recorder():
    received: list = []

    async def on_rejected(tasks):
        received.append([t.task_id for t in tasks])

    return received, on_rejected


def _manager(batch_max_size: int = 3, batching: bool = True, on_tasks_rejected=None):
    from services.zmq_pool.connection_manager import ConnectionManager
    manager = ConnectionManager(on_tasks_rejected=on_tasks_rejected)
    manager.enable_batching = batching
    manager.enable_priority_queue = False
    manager.batch_max_size = batch_max_size
    manager.batch_window_ms = 5
    return manager


def _failing_put(queue, fail_on_calls):
    """Fait lever `queue.put` aux appels dont le rang (1, 2, …) est listé."""
    original = queue.put
    calls = {"n": 0}

    async def put(item):
        calls["n"] += 1
        if calls["n"] in fail_on_calls:
            raise RuntimeError(f"{SECRET} boom")
        await original(item)

    queue.put = put
    return calls


def _assert_raw_never_logged(caplog, type_name: str = "RuntimeError"):
    rendered = [record.getMessage() for record in caplog.records]
    leaked = [line for line in rendered if SECRET in line]
    assert not leaked, f"exception brute journalisée : {leaked!r}"
    assert any(type_name in line for line in rendered), rendered


async def test_enqueue_task_error_logs_only_the_exception_type(caplog):
    manager = _manager(batching=False)
    _failing_put(manager.normal_pool, fail_on_calls={1})

    with caplog.at_level(logging.DEBUG):
        accepted = await manager.enqueue_task(_task("solo"))

    assert accepted is False
    _assert_raw_never_logged(caplog)


async def test_batch_flush_loop_error_logs_only_the_exception_type(caplog):
    manager = _manager()
    failures = {"n": 0}

    async def flush():
        failures["n"] += 1
        raise RuntimeError(f"{SECRET} flush")

    manager._flush_batches = flush

    with caplog.at_level(logging.DEBUG):
        loop_task = asyncio.create_task(manager._batch_flush_loop())
        for _ in range(200):
            if failures["n"] >= 2:
                break
            await asyncio.sleep(0.005)
        loop_task.cancel()
        await asyncio.gather(loop_task, return_exceptions=True)

    assert failures["n"] >= 2, "la boucle de flush doit survivre à l'erreur"
    _assert_raw_never_logged(caplog)


def _handler(enqueue_error: BaseException):
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    from services.zmq_translation_handler import TranslationHandler
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
    pool.enqueue_task = AsyncMock(side_effect=enqueue_error)
    pub_socket = AsyncMock()
    handler = TranslationHandler(pool_manager=pool, pub_socket=pub_socket)
    handler.cache_service = None
    return handler


def _request(task_id: str) -> dict:
    return {
        "type": "translation",
        "taskId": task_id,
        "messageId": f"msg-{task_id}",
        "text": "bonjour " + "z" * 150,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "c1",
        "modelType": "basic",
    }


@pytest.mark.parametrize(
    "error, type_name",
    [
        (RuntimeError(f"{SECRET} handler"), "RuntimeError"),
        (json.JSONDecodeError(f"{SECRET} json", "{}", 0), "JSONDecodeError"),
    ],
)
async def test_translation_request_errors_log_only_the_exception_type(caplog, error, type_name):
    handler = _handler(error)

    with caplog.at_level(logging.DEBUG):
        await handler._handle_translation_request(_request(f"req-{type_name}"))

    _assert_raw_never_logged(caplog, type_name)
    assert any(
        "[TRANSLATOR]" in r.getMessage() and type_name in r.getMessage()
        for r in caplog.records
        if r.levelno >= logging.ERROR
    )


async def test_batch_enqueue_error_in_accumulate_reports_every_task_once(caplog):
    received, on_rejected = _recorder()
    manager = _manager(batch_max_size=3, on_tasks_rejected=on_rejected)
    _failing_put(manager.normal_pool, fail_on_calls={1})

    with caplog.at_level(logging.DEBUG):
        results = [await manager.enqueue_task(_task(f"t{i}")) for i in range(1, 4)]

    assert results == [True, True, True]
    assert received == [["t1", "t2", "t3"]]
    assert manager.get_stats()["enqueue_error_rejections"] == 3
    assert manager.get_stats()["pending_batches"] == 0
    assert manager.normal_pool.qsize() == 0
    _assert_raw_never_logged(caplog)
    assert any("t1" in r.getMessage() and "RuntimeError" in r.getMessage() for r in caplog.records)

    await manager._flush_batches()
    assert received == [["t1", "t2", "t3"]]


async def test_batch_enqueue_error_in_flush_never_reenqueues_and_reports_the_failing_batch(caplog):
    received, on_rejected = _recorder()
    manager = _manager(batch_max_size=50, on_tasks_rejected=on_rejected)
    for source in ("en", "es", "de"):
        for i in range(2):
            assert await manager.enqueue_task(_task(f"{source}-{i}", source=source))
    _failing_put(manager.normal_pool, fail_on_calls={2})

    with caplog.at_level(logging.DEBUG):
        await manager._flush_batches()

    assert received == [["es-0", "es-1"]]
    assert manager.normal_pool.qsize() == 2
    assert manager.get_stats()["pending_batches"] == 0
    assert manager.get_stats()["batches_created"] == 2
    assert manager.get_stats()["enqueue_error_rejections"] == 2
    _assert_raw_never_logged(caplog)

    await manager._flush_batches()
    assert manager.normal_pool.qsize() == 2
    assert manager.get_stats()["batches_created"] == 2
    assert received == [["es-0", "es-1"]]
