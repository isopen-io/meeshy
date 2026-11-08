"""La cause d'une erreur d'inférence ne porte plus le texte d'une tâche silencieuse (#16715).

Depuis #16701, le MESSAGE de `TranslationInferenceError` passe par `shown()`.
Mais l'exception brute du pipeline restait attachée (`__cause__` /
`__context__`) : un `exc_info=True`, un `logger.exception` ou un
`traceback.print_exc()` en amont la rendrait en entier, avec l'entrée qu'elle
cite. Sous un régime silencieux (sous-titre d'appel, tâche au repos), la
chaîne est coupée ; sous le régime ordinaire, le diagnostic reste entier.
"""

import traceback
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.task_privacy import task_scope
from services.translation_ml.translator_engine import TranslationInferenceError, TranslatorEngine

SPOKEN = "Le code du coffre est 4471, porte B."
MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d1"
ONE_SENTENCE = "Le rapport trimestriel est prêt pour la réunion"
TWO_SENTENCES = "Le rapport trimestriel est prêt. La réunion commence demain matin."
BATCH = ["Le rapport est prêt", "La réunion commence demain", "Le train part ce soir"]

ORDINARY = (False, MESSAGE_ID)
SILENT_REGIMES = [
    pytest.param((False, "call-caption:x:1"), id="call-caption"),
    pytest.param((False, "call-x-1"), id="legacy-call-caption"),
    pytest.param((True, MESSAGE_ID), id="at-rest"),
]


def _engine():
    def failing_pipeline(texts, **_):
        raise ValueError(f"tokenizer refused input: {SPOKEN}")

    engine = TranslatorEngine(MagicMock(), ThreadPoolExecutor(max_workers=1))
    engine._get_or_create_pipeline = MagicMock(return_value=(failing_pipeline, True))
    engine.model_loader.get_model_inference_lock.return_value = MagicMock()
    return engine


async def _single(engine):
    return await engine.translate_text(ONE_SENTENCE, "fr", "en", "basic")


async def _sentences(engine):
    return await engine.translate_text(TWO_SENTENCES, "fr", "en", "basic")


async def _batch(engine):
    return await engine.translate_batch(BATCH, "fr", "en", "basic")


PATHS = [pytest.param(_single, id="translate_sync"),
         pytest.param(_sentences, id="infer_batch_from_text"),
         pytest.param(_batch, id="infer_batch_from_batch")]


async def _raised(path, regime):
    with task_scope(*regime), pytest.raises(TranslationInferenceError) as raised:
        await path(_engine())
    return raised.value


def _rendered(error):
    return "".join(traceback.format_exception(type(error), error, error.__traceback__))


@pytest.mark.unit
@pytest.mark.parametrize("regime", SILENT_REGIMES)
@pytest.mark.parametrize("path", PATHS)
async def test_a_silent_task_raises_an_inference_error_whose_chain_carries_no_text(regime, path):
    error = await _raised(path, regime)
    assert error.__cause__ is None
    assert error.__context__ is None
    assert SPOKEN[:12] not in _rendered(error)
    assert "ValueError" not in _rendered(error)


@pytest.mark.unit
@pytest.mark.parametrize("path", PATHS)
async def test_an_ordinary_task_keeps_the_pipeline_exception_as_its_cause(path):
    error = await _raised(path, ORDINARY)
    assert isinstance(error.__cause__, ValueError)
    assert SPOKEN in _rendered(error)
