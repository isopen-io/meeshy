"""Avec le VRAI modèle, un message court garde toutes ses phrases et sa salutation (#9723).

Ces cas sont ceux de la recette staging du 2026-10-08. Le témoin n'exige pas un texte
exact : il compte les phrases et cherche un équivalent de la salutation en tête.
Le modèle n'est jamais téléchargé : sans les poids dans le cache local, le test saute.
Lancer : `pytest -m integration tests/integration/test_short_messages_keep_their_sentences.py -o addopts=""`.
"""

import os
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from utils.sentence_split import split_sentences

pytestmark = pytest.mark.integration

MODEL = os.getenv("NLLB_TEST_MODEL", "facebook/nllb-200-distilled-600M")

CASES = [
    ("Salut ! On part en vacances à la mer en juillet. Tu veux venir avec nous ?", "fr", "en", {"hi", "hello", "hey"}),
    ("Hello! Yes, I would love to come to the sea with you.", "en", "fr", {"bonjour", "salut"}),
    ("Bonjour ! On organise l'anniversaire de Mamie dimanche, tu viens ?", "fr", "en", {"hello", "hi", "good morning"}),
    ("Of course! I'll bring flowers for her.", "en", "fr", {"bien sûr"}),
    ("Salut ! Tu viens ce soir ?", "fr", "en", {"hi", "hello", "hey"}),
    ("Merci ! C'était vraiment super hier.", "fr", "en", {"thank you", "thanks"}),
    ("Oui. Je serai là à huit heures.", "fr", "en", {"yes"}),
    ("Hello! See you tomorrow at the station.", "en", "fr", {"bonjour", "salut"}),
    ("¡Hola! ¿Vienes a la fiesta el sábado?", "es", "fr", {"bonjour", "salut"}),
]


def _sentences(text):
    return [piece.core for piece in split_sentences(text) if piece.core]


def _bare(sentence):
    return sentence.strip(" ¡¿!?.…").casefold()


@pytest.fixture(scope="module")
def engine():
    torch = pytest.importorskip("torch")
    transformers = pytest.importorskip("transformers")
    if not isinstance(getattr(torch, "__version__", None), str):
        pytest.skip("torch est le double de tests/conftest.py, pas le vrai")
    from services.translation_ml.translator_engine import TranslatorEngine

    try:
        tokenizer = transformers.AutoTokenizer.from_pretrained(MODEL, local_files_only=True)
        model = transformers.AutoModelForSeq2SeqLM.from_pretrained(
            MODEL, local_files_only=True, torch_dtype=torch.float32
        ).eval()
    except OSError:
        pytest.skip(f"{MODEL} absent du cache local")

    class _Loader:
        device = "cpu"
        _lock = threading.Lock()

        def is_model_loaded(self, _):
            return True

        def get_model(self, _):
            return model

        def get_thread_local_tokenizer(self, _):
            return tokenizer

        def get_model_inference_lock(self, _):
            return self._lock

    return TranslatorEngine(_Loader(), ThreadPoolExecutor(max_workers=1))


@pytest.mark.asyncio
@pytest.mark.parametrize("text, source, target, greetings", CASES)
async def test_every_sentence_and_the_greeting_survive(engine, text, source, target, greetings):
    translated = await engine.translate_text(text, source, target, "medium")

    assert len(_sentences(translated)) == len(_sentences(text)), translated
    assert _bare(_sentences(translated)[0]) in greetings, translated
