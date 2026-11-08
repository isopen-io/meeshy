"""QA #16715 — régime NON DÉCLARÉ, rendu `logger.exception` en amont, et
chemins sans exception du pipeline (aucun `UnboundLocalError`)."""

import logging
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.task_privacy import task_scope
from services.translation_ml.translator_engine import TranslationInferenceError, TranslatorEngine

SPOKEN = "Le code du coffre est 4471, porte B."
ONE_SENTENCE = "Le rapport trimestriel est prêt pour la réunion"
BATCH = ["Le rapport est prêt", "La réunion commence demain"]


def _engine(pipeline):
    engine = TranslatorEngine(MagicMock(), ThreadPoolExecutor(max_workers=1))
    engine._get_or_create_pipeline = MagicMock(return_value=(pipeline, True))
    engine.model_loader.get_model_inference_lock.return_value = MagicMock()
    return engine


def _failing(texts, **_):
    raise ValueError(f"tokenizer refused input: {SPOKEN}")


@pytest.mark.unit
@pytest.mark.parametrize("call", [
    lambda e: e.translate_text(ONE_SENTENCE, "fr", "en", "basic"),
    lambda e: e.translate_batch(BATCH, "fr", "en", "basic"),
])
async def test_an_undeclared_regime_attaches_no_cause(call):
    with pytest.raises(TranslationInferenceError) as raised:
        await call(_engine(_failing))
    assert raised.value.__cause__ is None
    assert raised.value.__context__ is None


@pytest.mark.unit
async def test_an_upstream_logger_exception_renders_no_text_for_a_call_caption(caplog):
    log = logging.getLogger("qa.upstream")
    with task_scope(False, "call-caption:x:1"), caplog.at_level(logging.ERROR, logger="qa.upstream"):
        try:
            await _engine(_failing).translate_text(ONE_SENTENCE, "fr", "en", "basic")
        except TranslationInferenceError:
            log.exception("upstream")
    assert caplog.text and "upstream" in caplog.text
    assert "4471" not in caplog.text
    assert "ValueError" not in caplog.text


@pytest.mark.unit
@pytest.mark.parametrize("regime", [(False, "call-caption:x:1"), (False, "65f1a2b3c4d5e6f7a8b9c0d1")])
@pytest.mark.parametrize("call", [
    lambda e: e.translate_text(ONE_SENTENCE, "fr", "en", "basic"),
    lambda e: e.translate_batch(BATCH, "fr", "en", "basic"),
])
async def test_an_unexpected_result_still_raises_an_inference_error(regime, call):
    with task_scope(*regime), pytest.raises(TranslationInferenceError):
        await call(_engine(lambda texts, **_: [{"nope": 1}] if isinstance(texts, list) else {"nope": 1}))


@pytest.mark.unit
async def test_a_base_exception_from_the_pipeline_propagates_untouched():
    def interrupted(texts, **_):
        raise KeyboardInterrupt()
    with task_scope(False, "call-caption:x:1"), pytest.raises(KeyboardInterrupt):
        await _engine(interrupted).translate_text(ONE_SENTENCE, "fr", "en", "basic")
