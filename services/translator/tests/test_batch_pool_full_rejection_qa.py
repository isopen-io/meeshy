"""
#16781 — contre-épreuves QA indépendantes du lot « un lot refusé par une file
pleine se compte, se journalise et se dit à la passerelle ».

Elles visent ce que le témoin principal ne couvre pas :
- l'invariant « chaque tâche aboutit exactement une fois » (déposée OU signalée)
  sous concurrence : enqueue simultanés + boucle de flush active ;
- un rappel qui ré-enfile n'interbloque pas le verrou de lot ;
- lots `any` vs normal : la bonne file est interrogée ;
- robustesse du handler : socket PUB absent, envoi qui lève (le texte de
  l'exception n'est jamais journalisé), rappel qui lève avec du texte ;
- rétrocompatibilité : un pool sans `set_rejection_handler` ne casse pas, la
  forme JSON reste exactement l'ancienne ;
- un sous-titre d'appel ne passe jamais par le lot.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

SENTINEL = "SENTINELLE-QA-16781"


def _task(task_id: str, conv_id: str = "c1", message_id: str = None, text: str = None):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=message_id or f"msg-{task_id}",
        text=text or f"{SENTINEL} {task_id} " + "x" * 200,
        source_language="en",
        target_languages=["fr"],
        conversation_id=conv_id,
    )


def _manager(normal_size=1, any_size=1, batch_max_size=3, on_tasks_rejected=None):
    from services.zmq_pool.connection_manager import ConnectionManager
    manager = ConnectionManager(
        normal_pool_size=normal_size, any_pool_size=any_size, fast_pool_size=1,
        on_tasks_rejected=on_tasks_rejected,
    )
    manager.enable_batching = True
    manager.enable_priority_queue = False
    manager.batch_max_size = batch_max_size
    manager.batch_window_ms = 1
    return manager


def _drain_ids(queue) -> list:
    ids = []
    while not queue.empty():
        item = queue.get_nowait()
        inner = getattr(item, "_batch_tasks", None)
        ids.extend(t.task_id for t in inner) if inner else ids.append(item.task_id)
    return ids


def _assert_no_text_logged(caplog):
    for record in caplog.records:
        assert SENTINEL not in record.getMessage(), record.getMessage()


@pytest.mark.unit
async def test_concurrent_enqueues_with_running_flush_loop_settle_each_task_exactly_once(caplog):
    caplog.set_level(logging.DEBUG)
    reported: list = []

    async def on_rejected(tasks):
        await asyncio.sleep(0)
        reported.extend(t.task_id for t in tasks)

    manager = _manager(normal_size=2, batch_max_size=3, on_tasks_rejected=on_rejected)
    await manager.start()
    ids = [f"t{i}" for i in range(60)]

    async def producer(chunk):
        for task_id in chunk:
            assert await manager.enqueue_task(_task(task_id)) is True
            await asyncio.sleep(0)

    await asyncio.gather(*(producer(ids[i::6]) for i in range(6)))
    await manager.stop()

    accepted = _drain_ids(manager.normal_pool)
    assert sorted(accepted + reported) == sorted(ids)
    assert len(set(accepted) & set(reported)) == 0
    assert len(reported) == len(set(reported))
    assert manager.get_stats()['pool_full_rejections'] == len(reported)
    assert len(reported) > 0
    _assert_no_text_logged(caplog)


@pytest.mark.unit
async def test_callback_that_reenqueues_does_not_deadlock_the_batch_lock():
    seen: list = []
    manager = None

    async def on_rejected(tasks):
        seen.extend(t.task_id for t in tasks)
        if len(seen) <= 2:
            await manager.enqueue_task(_task(f"retry-{len(seen)}"))

    manager = _manager(normal_size=1, batch_max_size=2, on_tasks_rejected=on_rejected)
    manager.normal_pool.put_nowait(_task("occupant"))

    async def scenario():
        await manager.enqueue_task(_task("a"))
        await manager.enqueue_task(_task("b"))
        await manager.stop()

    await asyncio.wait_for(scenario(), timeout=2.0)
    assert seen[:2] == ["a", "b"]
    assert "retry-2" in seen or manager.get_stats()['pending_batches'] == 0


@pytest.mark.unit
async def test_any_batch_is_judged_by_the_any_pool_and_normal_by_the_normal_pool():
    reported: list = []

    async def on_rejected(tasks):
        reported.extend(t.task_id for t in tasks)

    manager = _manager(normal_size=5, any_size=1, batch_max_size=10, on_tasks_rejected=on_rejected)
    manager.any_pool.put_nowait(_task("any-occupant", conv_id="any"))

    await manager.enqueue_task(_task("n1"))
    await manager._flush_batches()
    assert reported == []
    assert manager.get_stats()['batches_created'] == 1

    await manager.enqueue_task(_task("a1", conv_id="any"))
    await manager._flush_batches()
    assert reported == ["a1"]
    assert manager.get_stats()['pool_full_rejections'] == 1


@pytest.mark.unit
async def test_live_caption_never_enters_a_batch_and_its_refusal_is_the_direct_return():
    reported: list = []

    async def on_rejected(tasks):
        reported.extend(t.task_id for t in tasks)

    manager = _manager(normal_size=1, batch_max_size=1, on_tasks_rejected=on_rejected)
    manager.fast_pool.put_nowait(_task("fast-occupant"))
    manager.normal_pool.put_nowait(_task("occupant"))

    caption = _task("cap", message_id="call-caption:abc:1000")
    assert await manager.enqueue_task(caption) is False
    assert reported == []
    assert manager.get_stats()['pending_batches'] == 0
    assert manager.get_stats()['pool_full_rejections'] == 1


@pytest.mark.unit
async def test_raising_callback_message_text_is_never_logged(caplog):
    caplog.set_level(logging.DEBUG)

    async def on_rejected(tasks):
        raise RuntimeError(tasks[0].text)

    manager = _manager(normal_size=1, batch_max_size=1, on_tasks_rejected=on_rejected)
    manager.normal_pool.put_nowait(_task("occupant"))
    assert await manager.enqueue_task(_task("t1")) is True
    _assert_no_text_logged(caplog)


def _handler(pool_manager, pub_socket):
    from services.zmq_translation_handler import TranslationHandler
    handler = TranslationHandler(pool_manager=pool_manager, pub_socket=pub_socket)
    handler.cache_service = None
    return handler


@pytest.mark.unit
async def test_handler_accepts_a_pool_without_set_rejection_handler():
    class LegacyPool:
        async def enqueue_task(self, task):
            return False

    pub_socket = AsyncMock()
    handler = _handler(LegacyPool(), pub_socket)
    await handler.publish_pool_full([_task("t1")])
    assert pub_socket.send.await_count == 1


@pytest.mark.unit
async def test_pool_full_error_json_is_byte_identical_to_the_previous_shape():
    pub_socket = AsyncMock()
    handler = _handler(object(), pub_socket)
    task = _task("t1", conv_id="conv-9")
    await handler.publish_pool_full([task])
    previous = json.dumps({
        'type': 'translation_error',
        'taskId': task.task_id,
        'messageId': task.message_id,
        'error': 'translation pool full',
        'conversationId': task.conversation_id,
    }).encode('utf-8')
    assert pub_socket.send.call_args.args[0] == previous


@pytest.mark.unit
async def test_handler_without_pub_socket_does_not_raise():
    handler = _handler(object(), None)
    await handler.publish_pool_full([_task("t1"), _task("t2")])


@pytest.mark.unit
async def test_one_failing_send_neither_stops_the_others_nor_logs_text(caplog):
    caplog.set_level(logging.DEBUG)
    pub_socket = AsyncMock()
    pub_socket.send.side_effect = [RuntimeError(f"{SENTINEL} boom"), None, None]
    handler = _handler(object(), pub_socket)
    await handler.publish_pool_full([_task("t1"), _task("t2"), _task("t3")])
    assert pub_socket.send.await_count == 3
    _assert_no_text_logged(caplog)


@pytest.mark.unit
async def test_server_core_wiring_registers_the_handler_on_the_real_pool():
    import services.zmq_pool.zmq_pool_manager as mgr_mod
    original = mgr_mod.CACHE_AVAILABLE
    mgr_mod.CACHE_AVAILABLE = False
    try:
        pool = mgr_mod.TranslationPoolManager(
            normal_pool_size=1, any_pool_size=1, normal_workers=1, any_workers=1,
            enable_dynamic_scaling=False,
        )
    finally:
        mgr_mod.CACHE_AVAILABLE = original
    handler = _handler(pool, AsyncMock())
    assert pool.connection_manager.on_tasks_rejected == handler.publish_pool_full
