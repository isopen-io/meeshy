"""
#16781 — un lot de traductions refusé par une file pleine n'est plus jeté en silence.

`ConnectionManager._enqueue_batch` ne déposait le lot que si la file avait de
la place ; sinon rien : ni journal, ni compteur, ni retour. La passerelle
n'avait ni traduction ni erreur et attendait son délai.

Promesses tenues ici, sur les trois chemins qui vident l'accumulateur
(flush immédiat à `batch_max_size`, boucle de flush, vidage final de `stop()`) :

1. `pool_full_rejections` compte chaque TÂCHE du lot refusé.
2. Le refus est journalisé par ses task_id et sa taille, sans AUCUN texte.
3. Le rappel de rejet reçoit les tâches refusées ; un rappel qui lève ne
   casse ni la boucle de flush ni le signalement des autres lots.
4. De bout en bout (handler + vrai pool), chaque tâche refusée produit
   EXACTEMENT UNE `translation_error` « translation pool full » vers la
   passerelle — la forme que `ZmqMessageHandler.ts` sait déjà lire.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-TEXTE-PRIVE-16781"


def _task(task_id: str, targets=("fr",), conv_id: str = "c1"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=f"{SENTINEL} {task_id}",
        source_language="en",
        target_languages=list(targets),
        conversation_id=conv_id,
    )


def _full_manager(batch_max_size: int = 10, on_tasks_rejected=None):
    from services.zmq_pool.connection_manager import ConnectionManager
    manager = ConnectionManager(normal_pool_size=1, any_pool_size=1, fast_pool_size=1)
    manager.enable_batching = True
    manager.enable_priority_queue = False
    manager.batch_max_size = batch_max_size
    manager.batch_window_ms = 5
    manager.normal_pool.put_nowait(_task("occupant"))
    manager.on_tasks_rejected = on_tasks_rejected
    return manager


def _recorder():
    received: list = []

    async def on_rejected(tasks):
        received.append([t.task_id for t in tasks])

    return received, on_rejected


def _assert_no_text_logged(caplog):
    for record in caplog.records:
        rendered = record.getMessage()
        assert SENTINEL not in rendered, f"texte de tâche journalisé : {rendered!r}"


async def _wait_until(predicate, timeout: float = 2.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not predicate():
        if loop.time() > deadline:
            return False
        await asyncio.sleep(0.005)
    return True


@pytest.mark.unit
async def test_immediate_flush_rejection_is_counted_reported_and_logged_without_text(caplog):
    caplog.set_level(logging.DEBUG)
    received, on_rejected = _recorder()
    manager = _full_manager(batch_max_size=2, on_tasks_rejected=on_rejected)

    await manager.enqueue_task(_task("t1"))
    await manager.enqueue_task(_task("t2"))

    assert received == [["t1", "t2"]]
    assert manager.get_stats()['pool_full_rejections'] == 2
    refusal_logs = [r.getMessage() for r in caplog.records if "t1" in r.getMessage() and "t2" in r.getMessage()]
    assert refusal_logs, "le refus doit nommer ses task_id"
    assert any("2" in message for message in refusal_logs)
    _assert_no_text_logged(caplog)


@pytest.mark.unit
async def test_flush_loop_rejection_is_counted_and_reported(caplog):
    caplog.set_level(logging.DEBUG)
    received, on_rejected = _recorder()
    manager = _full_manager(on_tasks_rejected=on_rejected)

    await manager.enqueue_task(_task("t1"))
    await manager.start()
    try:
        assert await _wait_until(lambda: received), "la boucle de flush doit signaler le refus"
    finally:
        await manager.stop()

    assert received == [["t1"]]
    assert manager.get_stats()['pool_full_rejections'] == 1
    _assert_no_text_logged(caplog)


@pytest.mark.unit
async def test_stop_final_flush_rejection_is_counted_and_reported(caplog):
    caplog.set_level(logging.DEBUG)
    received, on_rejected = _recorder()
    manager = _full_manager(on_tasks_rejected=on_rejected)

    await manager.enqueue_task(_task("t1"))
    await manager.enqueue_task(_task("t2"))
    await manager.stop()

    assert received == [["t1", "t2"]]
    assert manager.get_stats()['pool_full_rejections'] == 2
    _assert_no_text_logged(caplog)


@pytest.mark.unit
async def test_without_callback_rejection_is_still_counted_and_logged(caplog):
    caplog.set_level(logging.DEBUG)
    manager = _full_manager()

    await manager.enqueue_task(_task("t1"))
    await manager.stop()

    assert manager.get_stats()['pool_full_rejections'] == 1
    assert any("t1" in r.getMessage() and r.levelno >= logging.WARNING for r in caplog.records)
    _assert_no_text_logged(caplog)


@pytest.mark.unit
async def test_accepted_batch_is_not_reported():
    from services.zmq_pool.connection_manager import ConnectionManager
    received, on_rejected = _recorder()
    manager = ConnectionManager(normal_pool_size=10, any_pool_size=10, fast_pool_size=10)
    manager.enable_priority_queue = False
    manager.on_tasks_rejected = on_rejected

    await manager.enqueue_task(_task("t1"))
    await manager.stop()

    assert received == []
    assert manager.get_stats()['pool_full_rejections'] == 0
    assert manager.normal_pool.qsize() == 1


@pytest.mark.unit
async def test_raising_callback_breaks_neither_other_batches_nor_the_flush_loop():
    calls: list = []

    async def explode(tasks):
        calls.append([t.task_id for t in tasks])
        raise RuntimeError("publication impossible")

    manager = _full_manager(on_tasks_rejected=explode)
    await manager.enqueue_task(_task("a", targets=("fr",)))
    await manager.enqueue_task(_task("b", targets=("de",)))
    await manager.start()
    try:
        assert await _wait_until(lambda: len(calls) >= 2)
        await manager.enqueue_task(_task("c", targets=("es",)))
        assert await _wait_until(lambda: len(calls) >= 3), "la boucle de flush doit survivre au rappel qui lève"
    finally:
        await manager.stop()

    assert sorted(calls) == [["a"], ["b"], ["c"]]
    assert manager.get_stats()['pool_full_rejections'] == 3


def _pool_and_handler():
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    from services.zmq_translation_handler import TranslationHandler
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        pool = mgr_mod.TranslationPoolManager(
            normal_pool_size=1,
            any_pool_size=1,
            normal_workers=2,
            any_workers=2,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    connection = pool.connection_manager
    connection.enable_batching = True
    connection.enable_priority_queue = False
    connection.batch_max_size = 2
    connection.normal_pool.put_nowait(_task("occupant"))
    pub_socket = AsyncMock()
    handler = TranslationHandler(pool_manager=pool, pub_socket=pub_socket)
    handler.cache_service = None
    return pool, handler, pub_socket


def _request(task_id: str):
    return {
        "taskId": task_id,
        "messageId": f"msg-{task_id}",
        "text": f"{SENTINEL} {task_id}",
        "sourceLanguage": "en",
        "targetLanguages": ["fr"],
        "conversationId": "conv-1",
        "modelType": "basic",
    }


def _sent_errors(pub_socket):
    messages = [json.loads(call.args[0].decode('utf-8')) for call in pub_socket.send.call_args_list]
    return [m for m in messages if m.get('type') == 'translation_error']


@pytest.mark.unit
async def test_each_rejected_task_reaches_the_gateway_exactly_once(caplog):
    caplog.set_level(logging.DEBUG)
    pool, handler, pub_socket = _pool_and_handler()

    await handler._handle_translation_request(_request("t1"))
    await handler._handle_translation_request(_request("t2"))
    await handler._handle_translation_request(_request("t3"))
    await pool.connection_manager.stop()

    errors = _sent_errors(pub_socket)
    assert sorted(e['taskId'] for e in errors) == ["t1", "t2", "t3"]
    assert {
        'type': 'translation_error',
        'taskId': 't1',
        'messageId': 'msg-t1',
        'error': 'translation pool full',
        'conversationId': 'conv-1',
    } in errors
    assert all(set(e) == {'type', 'taskId', 'messageId', 'error', 'conversationId'} for e in errors)
    assert pool.get_stats()['pool_full_rejections'] == 3
    _assert_no_text_logged(caplog)


def _counting_enqueues(pool):
    reached: list = []
    original = pool.enqueue_task

    async def counting(task):
        reached.append(task.task_id)
        return await original(task)

    pool.enqueue_task = counting
    return reached


@pytest.mark.unit
async def test_direct_refusal_releases_inflight_so_the_gateway_retry_is_accepted():
    pool, handler, pub_socket = _pool_and_handler()
    pool.connection_manager.enable_batching = False
    reached = _counting_enqueues(pool)

    await handler._handle_translation_request(_request("t1"))
    await handler._handle_translation_request(_request("t1"))

    assert reached == ["t1", "t1"], "la relance après refus doit atteindre enqueue_task"
    assert [e['taskId'] for e in _sent_errors(pub_socket)] == ["t1", "t1"]


@pytest.mark.unit
async def test_batch_refusal_releases_inflight_so_the_gateway_retry_is_accepted():
    pool, handler, pub_socket = _pool_and_handler()
    pool.connection_manager.batch_max_size = 1
    reached = _counting_enqueues(pool)

    await handler._handle_translation_request(_request("t1"))
    await handler._handle_translation_request(_request("t1"))

    assert reached == ["t1", "t1"], "la relance après lot refusé doit atteindre enqueue_task"
    assert [e['taskId'] for e in _sent_errors(pub_socket)] == ["t1", "t1"]


@pytest.mark.unit
async def test_accepted_task_keeps_its_inflight_claim():
    pool, handler, pub_socket = _pool_and_handler()
    pool.connection_manager.normal_pool.get_nowait()
    pool.connection_manager.batch_max_size = 1
    reached = _counting_enqueues(pool)

    await handler._handle_translation_request(_request("t1"))
    await handler._handle_translation_request(_request("t1"))

    assert reached == ["t1"], "un re-push d'une tâche acceptée reste ignoré"
    assert _sent_errors(pub_socket) == []
