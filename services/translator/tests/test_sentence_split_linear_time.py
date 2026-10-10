"""Le découpage d'un message hostile reste linéaire (#9723, revue de sécurité).

Le texte vient d'un utilisateur : une expression à retour arrière quadratique ou un
re-balayage du préfixe à chaque phrase suffit à bloquer un worker de traduction.

Le témoin mesure une CROISSANCE, jamais un temps absolu (#9830) : un seuil fixe
rougissait pour 3 ms d'un runner chargé alors que le découpage restait linéaire.
Chaque cas est joué à `SIZE` puis à `SCALE × SIZE` caractères ; un algorithme
linéaire prend environ `SCALE` fois plus de temps, un quadratique `SCALE²` fois.
La borne `GROWTH_BOUND` tranche entre les deux, avec de la marge pour le bruit.
`FLOOR_SECONDS` ignore les mesures trop courtes pour avoir un sens : un
algorithme quadratique y passe des secondes, très au-dessus.
"""

import time

import pytest

from utils.interjections import translate_interjection
from utils.sentence_plan import plan_sentences
from utils.sentence_split import split_sentences, tidy_translation

SIZE = 10_000
SCALE = 4
GROWTH_BOUND = SCALE * 2
FLOOR_SECONDS = 0.02
RUNS = 3

HOSTILE = {
    "exclamations": lambda n: "!" * n,
    "a-point-espace": lambda n: "a. " * (n // 3),
    "points-colles": lambda n: "." * n,
    "exclamations-puis-lettre": lambda n: "!" * (n // 2) + "a",
    "espaces-unicode": lambda n: " " * (n // 2) + "a" + " " * (n // 2),
    "sans-ponctuation": lambda n: "mot " * (n // 4),
    "espaces-puis-lettre": lambda n: " " * n + "a",
    "virgules": lambda n: "," * n + "a",
    "espaces-puis-exclamations": lambda n: (" " * (n // 2)) + ("!" * (n // 2)) + "a",
    "cjk-colles": lambda n: "。" * n,
    "guillemets-puis-point": lambda n: "a" + "\"" * n + ". B",
    "espaces-et-points": lambda n: " ." * (n // 2),
}


def _best(call, text):
    def once():
        start = time.perf_counter()
        call(text)
        return time.perf_counter() - start

    return min(once() for _ in range(RUNS))


def _assert_linear(call, make):
    small = _best(call, make(SIZE))
    large = _best(call, make(SIZE * SCALE))
    assert large < max(small * GROWTH_BOUND, FLOOR_SECONDS), (
        f"{SIZE} → {SIZE * SCALE} caractères : {small:.4f} s → {large:.4f} s "
        f"(×{large / max(small, 1e-9):.1f}, borne ×{GROWTH_BOUND})"
    )


def test_the_witness_reddens_on_a_quadratic_scan():
    def quadratic(text):
        return [text[:i].count(".") for i in range(0, len(text), 8)]

    with pytest.raises(AssertionError):
        _assert_linear(quadratic, HOSTILE["points-colles"])


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_splitting_a_hostile_message_stays_linear(name):
    _assert_linear(split_sentences, HOSTILE[name])


@pytest.mark.parametrize("name", sorted(HOSTILE))
@pytest.mark.parametrize("target", ("en", "fr"))
def test_tidying_a_hostile_output_stays_linear(name, target):
    _assert_linear(lambda text: tidy_translation(text, "x", target), HOSTILE[name])


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_matching_a_hostile_sentence_against_the_lexicon_stays_linear(name):
    _assert_linear(lambda text: translate_interjection(text, "fr", "en"), HOSTILE[name])


def test_matching_a_framed_interjection_stays_linear():
    _assert_linear(lambda text: translate_interjection(text, "es", "fr"), lambda n: "¡" * n + "hola" + "!" * n)


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_planning_a_hostile_message_stays_linear(name):
    _assert_linear(lambda text: plan_sentences(text, "fr", "en"), HOSTILE[name])
