"""Une langue sans code NLLB-200 reçoit une réponse TERMINALE, jamais le silence.

Incident prod 2026-11-01 : chaque message d'une conversation dont un lecteur lit
en `byv` (Medumba) coûtait 5 pushes sur ~2,5 min, puis un `translation:failed`.

Cause : `TranslatorEngine` lève bien `UnsupportedLanguageError` (#3659), mais
`TranslationService.translate` l'avale et rend un repli marqué `error` — le
même marquage qu'un modèle pas encore chargé. `_publish_translation_result`
jette tout résultat porteur d'`error` (« PAS D'ENVOI à la Gateway ») : rien ne
part, la passerelle croit le translator muet et relance cinq fois. Au-delà de
100 caractères, le chemin structuré faisait pire : il rendait l'ORIGINAL comme
une traduction `byv` valide, que la passerelle persistait.

Désormais la langue est jugée AVANT le cache et le modèle, contre
`LANGUAGE_MAPPINGS` (la table même que lit `TranslatorEngine`), et la réponse
est un `translation_error` portant `errorCode = UNSUPPORTED_LANGUAGE` et la
langue visée : la passerelle solde cette langue sans relance.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.zmq_pool import translation_processor as tp
from services.zmq_translation_handler import TranslationHandler


def _task(targets, source="fr", text="Bonjour à tous", task_id="task-byv"):
    return SimpleNamespace(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text=text,
        source_language=source,
        target_languages=list(targets),
        model_type="medium",
        conversation_id="conv-1",
        created_at=0.0,
    )


class _ServiceLikeProduction:
    """Rend ce que rend `TranslationService` : une vraie traduction pour une
    langue mappée, le repli marqué `error` pour une langue non mappée."""

    def __init__(self):
        self.calls = []

    async def translate_with_structure(self, text, source_language, target_language,
                                       model_type, source_channel, **_):
        self.calls.append(target_language)
        if target_language == "en":
            return {"translated_text": "Hello everyone", "confidence": 0.95}
        return {
            "translated_text": f"[FALLBACK-{source_language}→{target_language}] {text}",
            "confidence": 0.3,
            "error": "ML translation unavailable — served fallback",
        }


def _handler():
    pub_socket = MagicMock()
    pub_socket.send = AsyncMock()
    handler = TranslationHandler(pool_manager=MagicMock(), pub_socket=pub_socket)
    return handler, pub_socket


def _sent(pub_socket):
    return [json.loads(call.args[0].decode("utf-8")) for call in pub_socket.send.call_args_list]


@pytest.mark.unit
async def test_a_byv_target_reaches_the_gateway_as_a_terminal_unsupported_error():
    handler, pub_socket = _handler()

    await tp.process_single_translation(
        task=_task(["byv"]),
        worker_name="w",
        translation_service=_ServiceLikeProduction(),
        translation_cache=None,
        publish_func=handler._publish_translation_result,
    )

    sent = _sent(pub_socket)
    assert len(sent) == 1, "une langue non traduisible doit recevoir UNE réponse, jamais le silence"
    assert sent[0]["type"] == "translation_error"
    assert sent[0]["taskId"] == "task-byv"
    assert sent[0]["messageId"] == "msg-task-byv"
    assert sent[0]["targetLanguage"] == "byv"
    assert sent[0]["errorCode"] == "UNSUPPORTED_LANGUAGE"
    assert sent[0]["conversationId"] == "conv-1"


@pytest.mark.unit
async def test_an_unsupported_target_never_reaches_the_model_nor_the_cache():
    service = _ServiceLikeProduction()
    cache = MagicMock()
    cache.get_translation = AsyncMock(return_value=None)
    published = []

    async def publish(task_id, result, target_language):
        published.append((target_language, result))

    long_text = "Une phrase assez longue pour passer par le chemin structuré. " * 3
    await tp.process_single_translation(
        task=_task(["byv"], text=long_text),
        worker_name="w",
        translation_service=service,
        translation_cache=cache,
        publish_func=publish,
    )

    assert service.calls == []
    cache.get_translation.assert_not_called()
    assert [lang for lang, _ in published] == ["byv"]
    assert published[0][1]["errorCode"] == "UNSUPPORTED_LANGUAGE"
    assert published[0][1]["translatedText"] == long_text


@pytest.mark.unit
async def test_a_mixed_task_serves_the_supported_language_and_refuses_the_other():
    handler, pub_socket = _handler()

    await tp.process_single_translation(
        task=_task(["en", "byv"]),
        worker_name="w",
        translation_service=_ServiceLikeProduction(),
        translation_cache=None,
        publish_func=handler._publish_translation_result,
    )

    by_type = {(m["type"], m.get("targetLanguage")) for m in _sent(pub_socket)}
    assert by_type == {("translation_completed", "en"), ("translation_error", "byv")}


@pytest.mark.unit
async def test_an_unsupported_source_refuses_every_target():
    service = _ServiceLikeProduction()
    published = []

    async def publish(task_id, result, target_language):
        published.append((target_language, result.get("errorCode")))

    await tp.process_single_translation(
        task=_task(["en", "fr"], source="byv"),
        worker_name="w",
        translation_service=service,
        translation_cache=None,
        publish_func=publish,
    )

    assert service.calls == []
    assert published == [("en", "UNSUPPORTED_LANGUAGE"), ("fr", "UNSUPPORTED_LANGUAGE")]


@pytest.mark.unit
async def test_auto_source_is_left_to_detection():
    service = _ServiceLikeProduction()

    async def publish(task_id, result, target_language):
        pass

    await tp.process_single_translation(
        task=_task(["en"], source="auto"),
        worker_name="w",
        translation_service=service,
        translation_cache=None,
        publish_func=publish,
    )

    assert service.calls == ["en"]


@pytest.mark.unit
async def test_the_batch_path_refuses_an_unsupported_target_without_inference():
    service = _ServiceLikeProduction()
    service._ml_translate_batch = AsyncMock(return_value=["x", "y"])
    published = []

    async def publish(task_id, result, target_language):
        published.append((task_id, target_language, result.get("errorCode")))

    await tp.process_batch_translation(
        tasks=[_task(["byv"], task_id="a"), _task(["byv"], task_id="b")],
        worker_name="w",
        translation_service=service,
        publish_func=publish,
    )

    service._ml_translate_batch.assert_not_called()
    assert published == [("a", "byv", "UNSUPPORTED_LANGUAGE"), ("b", "byv", "UNSUPPORTED_LANGUAGE")]


@pytest.mark.unit
async def test_a_transient_failure_still_stays_silent_so_the_gateway_retries():
    """Hors périmètre de ce lot, et voulu : un modèle pas encore chargé est un
    échec TRANSITOIRE, la relance de la passerelle peut le servir."""
    handler, pub_socket = _handler()

    await handler._publish_translation_result(
        "task-t",
        {"messageId": "m", "translatedText": "Bonjour", "error": "ML translation unavailable"},
        "en",
    )

    pub_socket.send.assert_not_called()


@pytest.mark.unit
async def test_a_story_text_never_stores_a_fallback_as_a_byv_translation():
    """Le texte d'une story prenait le repli `[FALLBACK-fr→byv] …` (non vide,
    différent de l'original) pour une traduction, et la passerelle le
    persistait. Une langue intraduisible est sautée, un repli `error` jeté."""
    service = _ServiceLikeProduction()
    handler, pub_socket = _handler()
    handler.pool_manager.translation_service = service

    await handler._handle_story_text_object_translation({
        'postId': 'p1', 'textObjectIndex': 0, 'text': 'Bonjour à tous',
        'sourceLanguage': 'fr', 'targetLanguages': ['en', 'byv', 'de'],
    })

    sent = _sent(pub_socket)
    assert sent[0]['type'] == 'story_text_object_translation_completed'
    assert sent[0]['translations'] == {'en': 'Hello everyone'}
    assert service.calls == ['en', 'de']
