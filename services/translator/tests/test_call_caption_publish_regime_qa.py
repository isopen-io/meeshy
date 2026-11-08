"""QA indépendante de #16735 / #16716 : régimes concurrents, refus, sortie de lot, chaîne d'exceptions.

Témoins de COMPORTEMENT : ce que voit la publication (régime, cache), ce qui
part dans les journaux, et ce qui reste du régime après le lot. Le dernier
témoin est marqué `xfail(strict=True)` : il décrit une fuite par la chaîne
`__context__` qui reste ouverte (réserve QA), et tombera en XPASS le jour où
elle sera fermée.
"""

import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.task_privacy import cache_allowed, current_message_id, text_may_be_logged
from services.zmq_pool import translation_processor as tp
from services.zmq_translation_handler import TranslationHandler

ORDINARY_TEXT = "Rendez-vous demain à la gare."
CAPTION_TEXT = "Mon mot de passe bancaire est Tulipe-9931."
MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d1"
OTHER_MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d2"
CAPTION_ID = "call-caption:call-9:3400"


def _task(message_id, text, at_rest=False, targets=("en",), task_id="t", accepted=()):
    return SimpleNamespace(
        task_id=task_id, message_id=message_id, text=text, source_language="fr",
        target_languages=list(targets), model_type="basic", conversation_id="conv-1",
        created_at=0.0, at_rest=at_rest, accepted_error_codes=tuple(accepted),
    )


class _SlowService:
    async def translate_with_structure(self, text, source_language, target_language, model_type, source_channel, **_):
        await asyncio.sleep(0.01)
        return {"translated_text": f"{text} (en)", "confidence": 0.95}


class _Recorder:
    def __init__(self):
        self.seen = []

    async def __call__(self, task_id, result, target_language):
        before = (text_may_be_logged(), cache_allowed())
        await asyncio.sleep(0.005)
        self.seen.append((result.get('messageId'), before, (text_may_be_logged(), cache_allowed())))


@pytest.mark.unit
async def test_concurrent_tasks_of_different_regimes_publish_under_their_own_regime():
    recorder = _Recorder()
    tasks = [
        _task(MESSAGE_ID, ORDINARY_TEXT, task_id="a"),
        _task(CAPTION_ID, CAPTION_TEXT, task_id="b"),
        _task(OTHER_MESSAGE_ID, ORDINARY_TEXT, at_rest=True, task_id="c"),
    ]

    await asyncio.gather(*(
        tp.process_single_translation(task=t, worker_name="w", translation_service=_SlowService(),
                                      translation_cache=None, publish_func=recorder)
        for t in tasks
    ))

    regimes = {mid: (before, after) for mid, before, after in recorder.seen}
    assert regimes[MESSAGE_ID] == ((True, True), (True, True))
    assert regimes[CAPTION_ID] == ((False, False), (False, False))
    assert regimes[OTHER_MESSAGE_ID] == ((False, False), (False, False))


@pytest.mark.unit
async def test_a_batch_and_a_single_task_running_together_do_not_contaminate_each_other():
    recorder = _Recorder()
    batch = [_task(MESSAGE_ID, ORDINARY_TEXT, task_id="b1"), _task(OTHER_MESSAGE_ID, ORDINARY_TEXT, task_id="b2")]
    caption = _task(CAPTION_ID, CAPTION_TEXT, task_id="s1")

    await asyncio.gather(
        tp.process_batch_translation(tasks=batch, worker_name="w1", translation_service=_SlowService(),
                                     publish_func=recorder),
        tp.process_single_translation(task=caption, worker_name="w2", translation_service=_SlowService(),
                                      translation_cache=None, publish_func=recorder),
    )

    by_id = {mid: before for mid, before, _ in recorder.seen}
    assert by_id[CAPTION_ID] == (False, False)
    assert by_id[MESSAGE_ID] == (True, True)
    assert by_id[OTHER_MESSAGE_ID] == (True, True)


@pytest.mark.unit
async def test_an_at_rest_task_in_a_batch_fallback_never_reaches_the_cache():
    seen = []

    class _Fallback:
        async def translate_with_structure(self, text, source_language, target_language, model_type, source_channel, **kw):
            seen.append((kw.get('use_cache', True), cache_allowed()))
            return {"translated_text": f"{text} (en)"}

    batch = [_task(MESSAGE_ID, ORDINARY_TEXT, task_id="b1"), _task(OTHER_MESSAGE_ID, ORDINARY_TEXT, at_rest=True, task_id="b2")]

    await tp.process_batch_translation(tasks=batch, worker_name="w", translation_service=_Fallback(),
                                       publish_func=AsyncMock())

    assert seen == [(True, True), (False, False)]


@pytest.mark.unit
async def test_a_refused_language_in_a_batch_is_published_under_each_task_regime():
    recorder = _Recorder()
    accepted = (tp.UNSUPPORTED_LANGUAGE,)
    batch = [
        _task(MESSAGE_ID, ORDINARY_TEXT, targets=("byv",), task_id="b1", accepted=accepted),
        _task(CAPTION_ID, CAPTION_TEXT, targets=("byv",), task_id="b2", accepted=accepted),
    ]

    await tp.process_batch_translation(tasks=batch, worker_name="w", translation_service=_SlowService(),
                                       publish_func=recorder)

    assert [(mid, before) for mid, before, _ in recorder.seen] == [(MESSAGE_ID, (True, True)), (CAPTION_ID, (False, False))]


@pytest.mark.unit
@pytest.mark.parametrize("fail", [False, True])
async def test_the_worker_regime_is_restored_after_a_batch(fail):
    class _Batch:
        async def _ml_translate_batch(self, texts, source_lang, target_lang, model_type):
            if fail:
                raise ValueError("boom")
            return list(texts)

    batch = [_task(MESSAGE_ID, ORDINARY_TEXT, task_id="b1"), _task(OTHER_MESSAGE_ID, ORDINARY_TEXT, task_id="b2")]

    await tp.process_batch_translation(tasks=batch, worker_name="w", translation_service=_Batch(),
                                       publish_func=AsyncMock())

    assert (text_may_be_logged(), cache_allowed(), current_message_id()) == (False, False, None)


@pytest.mark.unit
async def test_the_ordinary_batch_published_payload_keeps_its_keys():
    published = []

    class _Batch:
        async def _ml_translate_batch(self, texts, source_lang, target_lang, model_type):
            return [f"{t} (en)" for t in texts]

    async def publish(task_id, result, target_language):
        published.append(set(result))

    batch = [_task(MESSAGE_ID, ORDINARY_TEXT, task_id="b1"), _task(OTHER_MESSAGE_ID, ORDINARY_TEXT, task_id="b2")]
    await tp.process_batch_translation(tasks=batch, worker_name="w", translation_service=_Batch(), publish_func=publish)

    assert published == [{
        'messageId', 'translatedText', 'sourceLanguage', 'targetLanguage', 'confidenceScore',
        'processingTime', 'modelType', 'workerName', 'fromCache', 'batchSize', 'batchIndex',
        'poolType', 'created_at',
    }] * 2


@pytest.mark.unit
@pytest.mark.xfail(strict=True, reason="réserve QA #16735 : la trace d'une publication ordinaire ratée dans un lot mixte joint, par __context__, l'exception du lot qui cite le sous-titre")
async def test_a_failed_ordinary_publish_in_a_mixed_batch_never_chains_the_caption_exception(caplog):
    caplog.set_level(logging.DEBUG)
    handler = TranslationHandler(pool_manager=MagicMock(), pub_socket=MagicMock())
    handler._process = MagicMock()
    handler._process.memory_info.side_effect = RuntimeError("process vanished")

    class _Batch:
        async def _ml_translate_batch(self, texts, source_lang, target_lang, model_type):
            raise ValueError(f"tokenizer refused: {texts[1]}")

    batch = [_task(MESSAGE_ID, ORDINARY_TEXT, task_id="b1"), _task(CAPTION_ID, CAPTION_TEXT, task_id="b2")]

    await tp.process_batch_translation(tasks=batch, worker_name="w", translation_service=_Batch(),
                                       publish_func=handler._publish_translation_result)

    assert CAPTION_TEXT not in caplog.text
