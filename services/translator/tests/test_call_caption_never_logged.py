"""Le texte d'un sous-titre d'appel n'est jamais journalisé par le traducteur (#16682).

`shown()` taisait le texte d'une tâche au repos, mais pas celui d'un
sous-titre d'appel déclaré `atRest: false`. Un sous-titre porte la parole d'un
appel en direct : il ne se range dans aucun cache (#16648) et ne s'écrit dans
aucun journal, quel que soit le régime déclaré. Un message de conversation
ordinaire (ObjectId) garde, lui, son texte dans les journaux.
"""

from concurrent.futures import ThreadPoolExecutor

import pytest

from services.task_privacy import run_in_thread_with_context, shown, task_scope

SPOKEN = "Le code du coffre est 4471, porte B."
CAPTION_IDS = ["call-caption:x:1", "call-abc-1"]
MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d1"
SILENCED = f"<{len(SPOKEN)} caractères tus>"


@pytest.mark.unit
@pytest.mark.parametrize("caption_id", CAPTION_IDS)
@pytest.mark.parametrize("limit", [None, 10])
def test_an_ordinary_call_caption_never_shows_its_text(caption_id, limit):
    with task_scope(False, caption_id):
        assert shown(SPOKEN, limit) == SILENCED


@pytest.mark.unit
def test_an_ordinary_conversation_message_still_shows_its_text():
    with task_scope(False, MESSAGE_ID):
        assert shown(SPOKEN) == SPOKEN
        assert shown(SPOKEN, 10) == SPOKEN[:10]


@pytest.mark.unit
@pytest.mark.parametrize("message_id", [MESSAGE_ID, *CAPTION_IDS])
def test_an_at_rest_task_stays_silent(message_id):
    with task_scope(True, message_id):
        assert shown(SPOKEN, 10) == SILENCED


@pytest.mark.unit
def test_outside_any_declared_regime_the_text_stays_silent():
    assert shown(SPOKEN) == SILENCED


@pytest.mark.unit
def test_a_call_caption_stays_silent_in_a_worker_thread():
    with ThreadPoolExecutor(max_workers=1) as pool, task_scope(False, "call-caption:x:1"):
        future = run_in_thread_with_context(pool.submit, shown, SPOKEN, 10)
        assert future.result() == SILENCED


def _engine_with_unexpected_output():
    from unittest.mock import MagicMock

    from services.translation_ml.translator_engine import TranslatorEngine

    engine = TranslatorEngine(MagicMock(), ThreadPoolExecutor(max_workers=1))

    def pipeline(texts, **_):
        if isinstance(texts, str):
            return {"generated_text": SPOKEN}
        return [{"generated_text": SPOKEN} for _ in texts]

    engine._get_or_create_pipeline = MagicMock(return_value=(pipeline, True))
    engine.model_loader.get_model_inference_lock.return_value = MagicMock()
    return engine


@pytest.mark.unit
async def test_an_unexpected_model_output_never_logs_a_single_caption_chunk(caplog):
    from services.translation_ml.translator_engine import TranslationInferenceError

    engine = _engine_with_unexpected_output()
    caplog.set_level("DEBUG")
    with task_scope(False, "call-caption:x:1"), pytest.raises(TranslationInferenceError) as raised:
        await engine._translate_single_chunk("Bonjour", "fr", "en", "basic")
    assert SPOKEN[:12] not in caplog.text
    assert SPOKEN[:12] not in str(raised.value)


@pytest.mark.unit
def test_an_unexpected_model_output_never_logs_a_caption_batch(caplog):
    from services.translation_ml.translator_engine import TranslationInferenceError

    engine = _engine_with_unexpected_output()
    caplog.set_level("DEBUG")
    with task_scope(False, "call-caption:x:1"), pytest.raises(TranslationInferenceError) as raised:
        engine._infer_batch_sync(["Bonjour", "Salut"], "fr", "en", "basic")
    assert SPOKEN[:12] not in caplog.text
    assert SPOKEN[:12] not in str(raised.value)
