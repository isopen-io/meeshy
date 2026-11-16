"""Une sortie hallucinée est relancée plus strictement, puis annulée avec trace (#18716).

Le modèle est un double qui répond selon le profil de génération reçu : le
témoin porte sur ce qui revient au lecteur (la sortie saine, ou un rejet) et
sur les profils réellement demandés au modèle.
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.translation_ml.translator_engine import (
    TranslationInferenceError,
    TranslationRejectedError,
    TranslatorEngine,
)
from utils.translation_quality import ESCALATION_PROFILES


EUROPARL = (
    "The Commission has also adopted a proposal for a regulation on the "
    "implementation of the common agricultural policy."
)


def _engine(answer):
    """`answer(text, attempt)` : attempt 0 = glouton, n = n-ième profil d'escalade."""
    calls = []

    def fake_pipeline(chunk, **kwargs):
        texts = [chunk] if isinstance(chunk, str) else list(chunk)
        attempt = next(
            (rank for rank, profile in enumerate(ESCALATION_PROFILES, start=1)
             if kwargs.get("num_beams") == profile["num_beams"]),
            0,
        )
        calls.append((texts, attempt, kwargs))
        results = [{"translation_text": answer(text, attempt)} for text in texts]
        return results[0] if isinstance(chunk, str) else results

    model_loader = MagicMock()
    model_loader.device = "cpu"
    model_loader.is_model_loaded.return_value = True
    model_loader.get_model_inference_lock.return_value = threading.Lock()
    engine = TranslatorEngine(
        model_loader=model_loader, executor=ThreadPoolExecutor(max_workers=2), cache_size=10
    )
    engine._get_or_create_pipeline = MagicMock(return_value=(fake_pipeline, True))
    return engine, calls


@pytest.mark.asyncio
async def test_a_sound_output_is_served_without_any_retry():
    engine, calls = _engine(lambda text, attempt: "Are you coming tonight?")

    result = await engine.translate_text("Tu viens ce soir ?", "fr", "en", "medium")

    assert result == "Are you coming tonight?"
    assert [attempt for _, attempt, _ in calls] == [0]


@pytest.mark.asyncio
async def test_a_hallucination_is_replaced_by_the_first_sound_stricter_output():
    engine, calls = _engine(
        lambda text, attempt: EUROPARL if attempt == 0 else "Are you coming tonight?"
    )

    result = await engine.translate_text("Tu viens ce soir ?", "fr", "en", "medium")

    assert result == "Are you coming tonight?"
    assert [attempt for _, attempt, _ in calls] == [0, 1]
    assert calls[1][2]["no_repeat_ngram_size"] == ESCALATION_PROFILES[0]["no_repeat_ngram_size"]


@pytest.mark.asyncio
async def test_a_hallucination_that_survives_every_profile_is_rejected_with_a_trace(caplog):
    outputs = iter([EUROPARL, EUROPARL + " Mr President.", "Member States " * 6])
    engine, calls = _engine(lambda text, attempt: next(outputs))

    with caplog.at_level(logging.WARNING):
        with pytest.raises(TranslationRejectedError) as raised:
            await engine.translate_text("Tu viens ce soir ?", "fr", "en", "medium")

    assert isinstance(raised.value, TranslationInferenceError)
    assert len(calls) == 1 + len(ESCALATION_PROFILES)
    trace = [r.getMessage() for r in caplog.records if "#18716" in r.getMessage()]
    assert trace and "fr→en" in trace[-1] and "boilerplate" in trace[-1]
    assert "Commission" not in trace[-1] and "ce soir" not in trace[-1]


@pytest.mark.asyncio
async def test_the_same_output_despite_stricter_parameters_stops_the_ladder_early():
    engine, calls = _engine(lambda text, attempt: EUROPARL)

    with pytest.raises(TranslationRejectedError):
        await engine.translate_text("Tu viens ce soir ?", "fr", "en", "medium")

    assert [attempt for _, attempt, _ in calls] == [0, 1]


@pytest.mark.asyncio
async def test_a_rejected_sentence_is_not_regenerated_through_the_whole_ladder_again():
    engine, calls = _engine(lambda text, attempt: EUROPARL)

    for _ in range(2):
        with pytest.raises(TranslationRejectedError):
            await engine.translate_text("Tu viens ce soir ?", "fr", "en", "medium")

    assert [attempt for _, attempt, _ in calls] == [0, 1, 0]


@pytest.mark.asyncio
async def test_in_a_batch_only_the_flagged_sentence_is_retried():
    def answer(text, attempt):
        if text == "Tu viens ce soir ?" and attempt == 0:
            return EUROPARL
        return {
            "On part en vacances à la mer en juillet.": "We're going to the sea in July.",
            "Tu viens ce soir ?": "Are you coming tonight?",
        }[text]

    engine, calls = _engine(answer)

    result = await engine.translate_text(
        "On part en vacances à la mer en juillet. Tu viens ce soir ?", "fr", "en", "medium"
    )

    assert result == "We're going to the sea in July. Are you coming tonight?"
    assert [(texts, attempt) for texts, attempt, _ in calls] == [
        (["On part en vacances à la mer en juillet.", "Tu viens ce soir ?"], 0),
        (["Tu viens ce soir ?"], 1),
    ]


def test_each_profile_is_stricter_than_the_previous_one():
    beams = [profile["num_beams"] for profile in ESCALATION_PROFILES]
    budgets = [profile["budget_factor"] for profile in ESCALATION_PROFILES]

    assert beams == sorted(set(beams)) and beams[0] > 1
    assert budgets == sorted(budgets, reverse=True)
    assert all(profile["no_repeat_ngram_size"] >= 2 for profile in ESCALATION_PROFILES)
