"""Le découpage d'un message hostile reste linéaire (#9723, revue de sécurité).

Le texte vient d'un utilisateur : une expression à retour arrière quadratique ou un
re-balayage du préfixe à chaque phrase suffit à bloquer un worker de traduction.
Chaque entrée fait 10 000 caractères ; le seuil laisse de la marge à une CI lente
mais un algorithme quadratique y passe des secondes.
"""

import time

import pytest

from utils.interjections import translate_interjection
from utils.sentence_plan import plan_sentences
from utils.sentence_split import split_sentences, tidy_translation

SIZE = 10_000
BUDGET_SECONDS = 0.05

HOSTILE = {
    "exclamations": "!" * SIZE,
    "a-point-espace": "a. " * (SIZE // 3),
    "points-colles": "." * SIZE,
    "exclamations-puis-lettre": "!" * (SIZE // 2) + "a",
    "espaces-unicode": " " * (SIZE // 2) + "a" + " " * (SIZE // 2),
    "sans-ponctuation": "mot " * (SIZE // 4),
    "espaces-puis-lettre": " " * SIZE + "a",
    "virgules": "," * SIZE + "a",
    "espaces-puis-exclamations": (" " * (SIZE // 2)) + ("!" * (SIZE // 2)) + "a",
    "cjk-colles": "。" * SIZE,
    "guillemets-puis-point": "a" + "\"" * SIZE + ". B",
    "espaces-et-points": " ." * (SIZE // 2),
}


def _elapsed(call):
    start = time.perf_counter()
    call()
    return time.perf_counter() - start


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_splitting_a_hostile_message_stays_linear(name):
    text = HOSTILE[name]
    assert _elapsed(lambda: split_sentences(text)) < BUDGET_SECONDS


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_tidying_a_hostile_output_stays_linear(name):
    text = HOSTILE[name]
    for target in ("en", "fr"):
        assert _elapsed(lambda: tidy_translation(text, "x", target)) < BUDGET_SECONDS


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_matching_a_hostile_sentence_against_the_lexicon_stays_linear(name):
    text = HOSTILE[name]
    assert _elapsed(lambda: translate_interjection(text, "fr", "en")) < BUDGET_SECONDS
    assert _elapsed(lambda: translate_interjection("¡" * SIZE + "hola" + "!" * SIZE, "es", "fr")) < BUDGET_SECONDS


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_planning_a_hostile_message_stays_linear(name):
    text = HOSTILE[name]
    assert _elapsed(lambda: plan_sentences(text, "fr", "en")) < BUDGET_SECONDS * 4
