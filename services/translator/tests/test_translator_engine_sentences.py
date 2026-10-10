"""Le moteur traduit phrase par phrase, en UN appel au modèle par message (#9723).

Le modèle est ici un double qui enregistre ce qu'il reçoit : le témoin porte sur ce
qui part au modèle (une entrée par phrase, jamais le message entier, jamais une
interjection du lexique) et sur ce qui revient au lecteur (toutes les phrases,
dans l'ordre, avec les séparateurs d'origine).
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.translation_ml.translator_engine import TranslatorEngine


def _engine_with_model(answers=None):
    calls = []
    answers = answers or {}

    def fake_pipeline(chunk, **kwargs):
        texts = [chunk] if isinstance(chunk, str) else list(chunk)
        calls.append(texts)
        results = [{"translation_text": answers.get(text, f"T<{text}>")} for text in texts]
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
async def test_every_sentence_of_a_short_message_reaches_the_reader():
    engine, calls = _engine_with_model(
        {
            "On part en vacances à la mer en juillet.": "We're going to the sea in July.",
            "Tu veux venir avec nous ?": "Do you want to come with us?",
        }
    )

    result = await engine.translate_text(
        "Salut ! On part en vacances à la mer en juillet. Tu veux venir avec nous ?",
        "fr", "en", "medium",
    )

    assert result == "Hi! We're going to the sea in July. Do you want to come with us?"
    assert calls == [["On part en vacances à la mer en juillet.", "Tu veux venir avec nous ?"]]


@pytest.mark.asyncio
async def test_a_message_made_only_of_interjections_never_reaches_the_model():
    engine, calls = _engine_with_model()

    result = await engine.translate_text("Merci ! Oui.", "fr", "en", "medium")

    assert result == "Thank you! Yes."
    assert calls == []


@pytest.mark.asyncio
async def test_a_single_sentence_is_sent_alone_and_tidied():
    engine, calls = _engine_with_model({"Je sais pas.": "- I don 't know ."})

    result = await engine.translate_text("Je sais pas.", "fr", "en", "medium")

    assert result == "I don't know."
    assert calls == [["Je sais pas."]]


@pytest.mark.asyncio
async def test_line_breaks_and_addresses_survive_the_sentence_split():
    engine, calls = _engine_with_model(
        {
            "Regarde 🔹EMOJI_0🔹 !": "Look at 🔹EMOJI_0🔹!",
            "Tu viens ?": "Are you coming?",
            "À demain": "See you tomorrow",
        }
    )

    result = await engine.translate_text(
        "Regarde https://meeshy.me/a ! Tu viens ?\nÀ demain", "fr", "en", "medium"
    )

    assert result == "Look at https://meeshy.me/a! Are you coming?\nSee you tomorrow"
    assert calls == [["Regarde 🔹EMOJI_0🔹 !", "Tu viens ?", "À demain"]]


@pytest.mark.asyncio
async def test_the_batch_path_splits_each_text_and_regroups_its_sentences():
    engine, calls = _engine_with_model()

    results = await engine.translate_batch(
        ["Hello! Are you coming?", "One sentence.", "Thanks!", "Two. Sentences."],
        "en", "fr", "medium",
    )

    assert results == [
        "Bonjour ! T<Are you coming?>",
        "T<One sentence.>",
        "Merci !",
        "T<Two.> T<Sentences.>",
    ]
    assert [text for call in calls for text in call] == [
        "Are you coming?", "One sentence.", "Two.", "Sentences.",
    ]
