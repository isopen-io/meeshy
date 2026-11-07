"""Les threads d'inférence NLLB reçoivent le régime de la tâche (#16701).

`run_in_executor` ne recopie pas le contexte : dans le thread du modèle, le
régime n'était pas déclaré et `shown()` taisait le texte de TOUTES les tâches.
Le diagnostic garde son texte pour un message ordinaire, le tait pour un
sous-titre d'appel ou une tâche au repos — et une exception du pipeline, qui
peut citer l'entrée, suit la même règle dans le journal comme dans
`TranslationInferenceError`.
"""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.task_privacy import shown, task_scope
from services.translation_ml.translator_engine import TranslationInferenceError, TranslatorEngine

SPOKEN = "Le code du coffre est 4471, porte B."
MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d1"
ONE_SENTENCE = "Le rapport trimestriel est prêt pour la réunion"
TWO_SENTENCES = "Le rapport trimestriel est prêt. La réunion commence demain matin."
BATCH = ["Le rapport est prêt", "La réunion commence demain", "Le train part ce soir"]

ORDINARY = (False, MESSAGE_ID)
SILENT_REGIMES = [(False, "call-caption:x:1"), (True, MESSAGE_ID)]


def _engine(pipeline):
    engine = TranslatorEngine(MagicMock(), ThreadPoolExecutor(max_workers=1))
    engine._get_or_create_pipeline = MagicMock(return_value=(pipeline, True))
    engine.model_loader.get_model_inference_lock.return_value = MagicMock()
    return engine


def _unexpected_output(texts, **_):
    if isinstance(texts, str):
        return {"generated_text": SPOKEN}
    return [{"generated_text": SPOKEN} for _ in texts]


def _failing_pipeline(texts, **_):
    raise ValueError(f"tokenizer refused input: {SPOKEN}")


async def _single(engine):
    return await engine.translate_text(ONE_SENTENCE, "fr", "en", "basic")


async def _sentences(engine):
    return await engine.translate_text(TWO_SENTENCES, "fr", "en", "basic")


async def _batch(engine):
    return await engine.translate_batch(BATCH, "fr", "en", "basic")


PATHS = [pytest.param(_single, id="translate_sync"),
         pytest.param(_sentences, id="infer_batch_from_text"),
         pytest.param(_batch, id="infer_batch_from_batch")]
PIPELINES = [pytest.param(_unexpected_output, id="unexpected-output"),
             pytest.param(_failing_pipeline, id="pipeline-exception")]


async def _failure(pipeline, path, regime, caplog):
    caplog.set_level("DEBUG")
    with task_scope(*regime), pytest.raises(TranslationInferenceError) as raised:
        await path(_engine(pipeline))
    return caplog.text, str(raised.value)


@pytest.mark.unit
@pytest.mark.parametrize("pipeline", PIPELINES)
@pytest.mark.parametrize("path", PATHS)
async def test_an_ordinary_message_keeps_its_text_in_the_inference_diagnostic(pipeline, path, caplog):
    logged, message = await _failure(pipeline, path, ORDINARY, caplog)
    assert SPOKEN in message
    if pipeline is _failing_pipeline:
        assert SPOKEN in logged


@pytest.mark.unit
@pytest.mark.parametrize("regime", SILENT_REGIMES, ids=["call-caption", "at-rest"])
@pytest.mark.parametrize("pipeline", PIPELINES)
@pytest.mark.parametrize("path", PATHS)
async def test_a_silent_task_never_leaks_its_text_from_the_inference_thread(regime, pipeline, path, caplog):
    logged, message = await _failure(pipeline, path, regime, caplog)
    assert SPOKEN[:12] not in logged
    assert SPOKEN[:12] not in message
    assert "caractères tus" in message


@pytest.mark.unit
@pytest.mark.parametrize("path", PATHS)
async def test_the_pipeline_exception_stays_the_cause(path, caplog):
    with task_scope(False, "call-caption:x:1"), pytest.raises(TranslationInferenceError) as raised:
        await path(_engine(_failing_pipeline))
    assert isinstance(raised.value.__cause__, ValueError)


ORDINARY_TEXT = "Le rapport trimestriel est prêt pour la réunion"
CAPTION_TEXT = "Le coffre se trouve derrière la porte bleue"
CAPTION = (False, "call-caption:x:1")


def _quoting_pipeline(meeting):
    def pipeline(texts, **_):
        if meeting is not None:
            meeting.wait()
        raise ValueError(f"tokenizer refused input: {texts}")
    return pipeline


async def _diagnostic(engine, regime, text):
    with task_scope(*regime), pytest.raises(TranslationInferenceError) as raised:
        await engine.translate_text(text, "fr", "en", "basic")
    return str(raised.value)


def _engine_on(pipeline, workers):
    engine = _engine(pipeline)
    engine.executor = ThreadPoolExecutor(max_workers=workers)
    return engine


@pytest.mark.unit
async def test_two_concurrent_tasks_on_the_same_pool_keep_their_own_regime(caplog):
    caplog.set_level("DEBUG")
    engine = _engine_on(_quoting_pipeline(threading.Barrier(2, timeout=5)), workers=2)
    ordinary, caption = await asyncio.gather(
        _diagnostic(engine, ORDINARY, ORDINARY_TEXT),
        _diagnostic(engine, CAPTION, CAPTION_TEXT),
    )
    assert ORDINARY_TEXT in ordinary
    assert ORDINARY_TEXT in caplog.text
    assert CAPTION_TEXT not in caption
    assert CAPTION_TEXT not in caplog.text


@pytest.mark.unit
async def test_a_reused_inference_thread_keeps_no_regime_from_its_previous_task(caplog):
    caplog.set_level("DEBUG")
    engine = _engine_on(_quoting_pipeline(None), workers=1)
    first_caption = await _diagnostic(engine, CAPTION, CAPTION_TEXT)
    ordinary = await _diagnostic(engine, ORDINARY, ORDINARY_TEXT)
    second_caption = await _diagnostic(engine, CAPTION, CAPTION_TEXT)
    undeclared = await asyncio.get_running_loop().run_in_executor(engine.executor, shown, CAPTION_TEXT)
    assert ORDINARY_TEXT in ordinary
    assert CAPTION_TEXT not in first_caption + second_caption + caplog.text
    assert CAPTION_TEXT not in undeclared
