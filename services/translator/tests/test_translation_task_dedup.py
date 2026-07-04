"""
4e volet de l'incident textes longs (2026-07-04) : le gateway re-pushe la
même tâche (même taskId) toutes les ~30 s tant qu'aucun résultat n'est
publié. Pour tout texte dont la traduction dépasse ~30 s, chaque re-push
empilait une exécution CONCURRENTE du même texte sur le même lock modèle :
l'attente cumulée dépassait tous les budgets et plus rien n'aboutissait —
tempête auto-entretenue observée en prod (6+ timeouts du même taskId,
messages courts des vrais utilisateurs asphyxiés au passage).

Le handler doit dédupliquer les tâches en vol : un re-push du même taskId
est ignoré tant que son budget cumulé n'est pas écoulé ; passé ce délai,
la relance est légitime (vrai échec précédent).
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.zmq_translation_handler import TranslationHandler


def _handler():
    pool = SimpleNamespace(enqueue_task=AsyncMock(return_value=True))
    return TranslationHandler(pool_manager=pool, pub_socket=None), pool


def _request(task_id="task-1", text="Un texte de test.", langs=("en", "pt")):
    return {
        "taskId": task_id,
        "messageId": "msg-1",
        "text": text,
        "sourceLanguage": "fr",
        "targetLanguages": list(langs),
        "conversationId": "conv-1",
        "modelType": "premium",
    }


@pytest.mark.unit
def test_inflight_budget_covers_all_languages_plus_margin():
    from services.zmq_pool.translation_processor import inference_timeout_for

    budget = TranslationHandler.inflight_ttl_for(text_length=1400, language_count=2)
    assert budget >= 2 * inference_timeout_for(1400)
    assert budget <= 2 * inference_timeout_for(1400) + 60.0


@pytest.mark.unit
def test_duplicate_taskid_within_ttl_is_dropped():
    handler, _ = _handler()
    assert handler.claim_inflight("t1", ttl_s=100.0, now_s=1000.0) is True
    assert handler.claim_inflight("t1", ttl_s=100.0, now_s=1030.0) is False
    assert handler.claim_inflight("t1", ttl_s=100.0, now_s=1090.0) is False


@pytest.mark.unit
def test_taskid_reclaimable_after_ttl_expiry():
    handler, _ = _handler()
    assert handler.claim_inflight("t1", ttl_s=100.0, now_s=1000.0) is True
    assert handler.claim_inflight("t1", ttl_s=100.0, now_s=1101.0) is True


@pytest.mark.unit
def test_distinct_taskids_are_independent():
    handler, _ = _handler()
    assert handler.claim_inflight("t1", ttl_s=100.0, now_s=1000.0) is True
    assert handler.claim_inflight("t2", ttl_s=100.0, now_s=1000.0) is True


@pytest.mark.unit
def test_expired_entries_are_purged_on_claim():
    handler, _ = _handler()
    for i in range(50):
        assert handler.claim_inflight(f"t{i}", ttl_s=10.0, now_s=1000.0 + i) is True
    handler.claim_inflight("fresh", ttl_s=10.0, now_s=2000.0)
    assert len(handler._inflight_tasks) == 1


@pytest.mark.unit
async def test_handler_drops_duplicate_push_before_enqueue():
    handler, pool = _handler()
    await handler._handle_translation_request(_request())
    await handler._handle_translation_request(_request())
    assert pool.enqueue_task.await_count == 1


@pytest.mark.unit
async def test_handler_enqueues_distinct_tasks():
    handler, pool = _handler()
    await handler._handle_translation_request(_request(task_id="a"))
    await handler._handle_translation_request(_request(task_id="b"))
    assert pool.enqueue_task.await_count == 2
