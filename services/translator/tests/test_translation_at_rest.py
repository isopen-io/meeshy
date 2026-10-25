"""
#12822 — un texte chiffré AU REPOS (conversations `server`/`hybrid`) ne se
pose sur aucun disque du translator.

La passerelle stocke ces messages chiffrés dans MongoDB (AES-256-GCM). Le
translator, lui, rangeait le clair dans Redis (`translation:text:v2:*`, valeur
`translated_text`, 30 jours, Redis en `appendonly`) et le journalisait en INFO.
La requête ZMQ porte désormais `atRest: true` : pour ce texte, aucun cache n'est
lu ni écrit (texte entier ni segments) et aucun journal ne porte le texte, ni
source ni traduction. Champ absent = comportement d'avant (cache utilisé).
"""

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.zmq_pool import translation_processor as tp
from services.zmq_translation_handler import TranslationHandler

SECRET = "Le code du coffre est 4471, porte B"
TRADUCTION = "The safe code is 4471, door B"


def _request(**overrides):
    return {
        "taskId": "task-at-rest",
        "messageId": "msg-at-rest",
        "text": SECRET,
        "sourceLanguage": "fr",
        "targetLanguages": ["en"],
        "conversationId": "conv-at-rest",
        "modelType": "premium",
        **overrides,
    }


def _handler():
    pool = SimpleNamespace(enqueue_task=AsyncMock(return_value=True))
    return TranslationHandler(pool_manager=pool, pub_socket=None), pool


def _task(at_rest):
    return SimpleNamespace(
        task_id="task-at-rest",
        message_id="msg-at-rest",
        text=SECRET,
        source_language="fr",
        target_languages=["en"],
        model_type="premium",
        conversation_id="conv-at-rest",
        created_at=0.0,
        at_rest=at_rest,
    )


class _Service:
    def __init__(self):
        self.kwargs = []

    async def translate_with_structure(self, text, source_language, target_language, model_type, source_channel, **kwargs):
        self.kwargs.append(kwargs)
        return {"translated_text": TRADUCTION}


def _cache():
    return SimpleNamespace(
        get_translation=AsyncMock(return_value=None),
        set_translation=AsyncMock(return_value=True),
    )


def _logged(caplog):
    return "\n".join(record.getMessage() for record in caplog.records)


async def _noop_publish(task_id, result, target_language):
    return None


@pytest.mark.unit
async def test_handler_marks_an_at_rest_request_and_never_logs_its_text(caplog):
    caplog.set_level(logging.DEBUG)
    handler, pool = _handler()

    await handler._handle_translation_request(_request(atRest=True))

    task = pool.enqueue_task.await_args.args[0]
    assert task.at_rest is True
    assert SECRET[:20] not in _logged(caplog)


@pytest.mark.unit
async def test_handler_keeps_the_previous_behaviour_when_the_flag_is_absent():
    handler, pool = _handler()

    await handler._handle_translation_request(_request())

    assert pool.enqueue_task.await_args.args[0].at_rest is False


@pytest.mark.unit
async def test_handler_does_not_take_a_truthy_string_for_the_flag():
    handler, pool = _handler()

    await handler._handle_translation_request(_request(atRest="false"))

    assert pool.enqueue_task.await_args.args[0].at_rest is False


@pytest.mark.unit
async def test_an_invalid_request_is_reported_without_its_text(caplog):
    caplog.set_level(logging.DEBUG)
    handler, pool = _handler()

    await handler._handle_translation_request(_request(targetLanguages=[], atRest=True))

    assert pool.enqueue_task.await_count == 0
    assert SECRET[:20] not in _logged(caplog)


@pytest.mark.unit
async def test_an_at_rest_task_neither_reads_nor_writes_the_cache(caplog):
    caplog.set_level(logging.DEBUG)
    cache, service = _cache(), _Service()

    results = await tp.process_single_translation(
        task=_task(at_rest=True), worker_name="w1", translation_service=service,
        translation_cache=cache, publish_func=_noop_publish,
    )

    assert results[0]["translatedText"] == TRADUCTION
    cache.get_translation.assert_not_awaited()
    cache.set_translation.assert_not_awaited()
    assert service.kwargs == [{"use_cache": False}]
    assert SECRET[:20] not in _logged(caplog)
    assert TRADUCTION[:20] not in _logged(caplog)


@pytest.mark.unit
async def test_an_ordinary_task_still_uses_the_cache():
    cache, service = _cache(), _Service()

    await tp.process_single_translation(
        task=_task(at_rest=False), worker_name="w1", translation_service=service,
        translation_cache=cache, publish_func=_noop_publish,
    )

    cache.get_translation.assert_awaited_once()
    cache.set_translation.assert_awaited_once()
    assert service.kwargs == [{}]


@pytest.mark.unit
async def test_a_cache_hit_is_never_served_to_an_at_rest_task():
    cache, service = _cache(), _Service()
    cache.get_translation = AsyncMock(return_value={"translated_text": "texte d'un autre"})

    results = await tp.process_single_translation(
        task=_task(at_rest=True), worker_name="w1", translation_service=service,
        translation_cache=cache, publish_func=_noop_publish,
    )

    assert results[0]["translatedText"] == TRADUCTION
    assert results[0]["fromCache"] is False


@pytest.mark.unit
async def test_a_batch_fallback_skips_the_segment_cache_for_at_rest_texts():
    service = _Service()
    tasks = [_task(at_rest=True), _task(at_rest=False)]

    await tp.process_batch_translation(
        tasks=tasks, worker_name="w1", translation_service=service, publish_func=_noop_publish,
    )

    assert service.kwargs == [{"use_cache": False}, {}]


def _translation_service():
    from services.translation_ml.translation_service import TranslationService

    TranslationService._instance = None
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = True
    engine = MagicMock()
    engine.translate_text = AsyncMock(return_value=TRADUCTION)
    engine.translate_batch = AsyncMock(side_effect=lambda texts, *_: [f"{t} (en)" for t in texts])
    cache = MagicMock()
    cache.check_cache_batch = AsyncMock(side_effect=lambda segments, *_: ([None] * len(segments), list(enumerate(s["text"] for s in segments))))
    cache.cache_batch_results = AsyncMock()
    service = TranslationService(model_loader, engine, cache)
    service.is_initialized = True
    return service, cache


LONG_SECRET = "\n\n".join([SECRET] * 6)


@pytest.mark.unit
async def test_structured_translation_skips_the_segment_cache_when_asked(caplog):
    caplog.set_level(logging.DEBUG)
    service, cache = _translation_service()

    result = await service.translate_with_structure(LONG_SECRET, "fr", "en", "premium", "zmq", use_cache=False)

    assert result["translated_text"]
    cache.check_cache_batch.assert_not_awaited()
    cache.cache_batch_results.assert_not_awaited()
    assert SECRET[:20] not in _logged(caplog)


@pytest.mark.unit
async def test_structured_translation_still_caches_segments_by_default():
    service, cache = _translation_service()

    await service.translate_with_structure(LONG_SECRET, "fr", "en", "premium", "zmq")

    cache.check_cache_batch.assert_awaited_once()
    cache.cache_batch_results.assert_awaited_once()


@pytest.mark.unit
async def test_a_simple_translation_never_logs_its_text(caplog):
    caplog.set_level(logging.DEBUG)
    service, _ = _translation_service()

    await service.translate(SECRET, "fr", "en", "premium", "zmq")

    assert SECRET[:20] not in _logged(caplog)
    assert TRADUCTION[:20] not in _logged(caplog)


@pytest.mark.unit
async def test_the_ml_facade_forwards_the_cache_choice():
    from services.translation_ml_service import TranslationMLService

    facade = TranslationMLService.__new__(TranslationMLService)
    facade.translation_service = SimpleNamespace(translate_with_structure=AsyncMock(return_value={"translated_text": TRADUCTION}))

    await facade.translate_with_structure(SECRET, "fr", "en", "premium", "zmq", use_cache=False)

    assert facade.translation_service.translate_with_structure.await_args.kwargs == {"use_cache": False}


@pytest.mark.unit
async def test_a_rejected_translation_is_reported_without_its_text(caplog):
    caplog.set_level(logging.DEBUG)
    handler, _ = _handler()
    handler._is_valid_translation = lambda *_: False

    await handler._publish_translation_result(
        "task-at-rest",
        {"messageId": "msg-at-rest", "translatedText": TRADUCTION, "originalText": SECRET, "created_at": 0.0},
        "en",
    )

    assert TRADUCTION[:20] not in _logged(caplog)
    assert SECRET[:20] not in _logged(caplog)


ADRESSE_SECRETE = "https://coffre.example/porte-4471"
MENTION_SECRETE = "@gardien4471"


@pytest.mark.unit
def test_protecting_entities_logs_a_count_never_the_entities(caplog):
    from utils.text_segmentation import protect_entities

    caplog.set_level(logging.DEBUG)
    _masked, entities = protect_entities(f"Rendez-vous {ADRESSE_SECRETE} avec {MENTION_SECRETE}")

    assert sorted(entities.values()) == sorted([ADRESSE_SECRETE, MENTION_SECRETE])
    assert "4471" not in _logged(caplog)
    assert "coffre.example" not in _logged(caplog)
    assert "2 entités protégées" in _logged(caplog)


@pytest.mark.unit
def test_restoring_lost_markers_warns_with_a_count_never_the_entities(caplog):
    from utils.text_segmentation import restore_entities

    caplog.set_level(logging.DEBUG)
    restored = restore_entities("le modèle a perdu les marqueurs", {0: ADRESSE_SECRETE, 1: MENTION_SECRETE})

    assert ADRESSE_SECRETE in restored and MENTION_SECRETE in restored
    warnings = "\n".join(r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING)
    assert "2 marqueurs perdus" in warnings
    assert "4471" not in _logged(caplog)
    assert "coffre.example" not in _logged(caplog)
