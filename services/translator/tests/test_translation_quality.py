"""Les règles qui reconnaissent une traduction hallucinée par NLLB (#18716).

Chaque témoin pose une sortie RÉELLEMENT observée ou son jumeau légitime : la
règle doit tomber sur la première et laisser passer la seconde.
"""

import pytest

from utils.translation_quality import assess_translation


EUROPARL = (
    "The Commission has also adopted a proposal for a regulation on the "
    "implementation of the common agricultural policy."
)


def test_the_europarl_sentence_served_for_a_short_message_is_rejected():
    verdict = assess_translation("ok merci à toi", EUROPARL, "en")

    assert not verdict.acceptable
    assert "length_ratio" in verdict.reasons
    assert "boilerplate" in verdict.reasons


def test_a_faithful_translation_passes():
    verdict = assess_translation(
        "On part en vacances à la mer en juillet.", "We're going to the sea in July.", "en"
    )

    assert verdict.acceptable
    assert verdict.reasons == ()


def test_a_short_greeting_may_grow_into_its_natural_translation():
    assert assess_translation("Bjr", "Good morning", "en").acceptable
    assert assess_translation("お疲れ様です", "Thank you for your hard work", "en").acceptable


def test_boilerplate_needs_a_suspicious_length_to_condemn():
    verdict = assess_translation(
        "Le Parlement européen a voté hier.", "The European Parliament voted yesterday.", "en"
    )

    assert verdict.acceptable


def test_boilerplate_in_french_output_is_recognised_too():
    verdict = assess_translation(
        "yo bro",
        "Monsieur le Président, je voudrais remercier le rapporteur pour son excellent travail.",
        "fr",
    )

    assert "boilerplate" in verdict.reasons


def test_boilerplate_already_present_in_the_source_is_not_held_against_the_output():
    verdict = assess_translation(
        "the commission",
        "la commission dont on parle depuis le début",
        "fr",
    )

    assert "boilerplate" not in verdict.reasons


def test_an_empty_output_for_a_real_sentence_is_rejected():
    assert assess_translation("Tu viens ce soir ?", "  ", "en").reasons == ("empty",)


def test_a_word_stuttering_in_the_output_is_rejected():
    verdict = assess_translation("Je suis là.", "I am am am am here.", "en")

    assert "repetition" in verdict.reasons


def test_a_trigram_looping_in_the_output_is_rejected():
    verdict = assess_translation(
        "Je t'aime beaucoup, vraiment.",
        "I love you so much, I love you so much, I love you so much, I love you so much.",
        "en",
    )

    assert "repetition" in verdict.reasons


def test_repetition_inherited_from_the_source_is_kept():
    verdict = assess_translation("non non non non", "no no no no", "en")

    assert verdict.acceptable


@pytest.mark.parametrize(
    "target, output",
    [
        ("ru", "I am going home now."),
        ("ar", "I am going home now."),
        ("ja", "I am going home now."),
        ("en", "Я иду домой сейчас."),
    ],
)
def test_an_output_outside_the_target_script_is_rejected(target, output):
    verdict = assess_translation("Je rentre à la maison maintenant.", output, target)

    assert "wrong_script" in verdict.reasons


@pytest.mark.parametrize(
    "target, output",
    [
        ("ru", "Я иду домой сейчас."),
        ("ja", "今から家に帰ります。"),
        ("zh", "我现在回家。"),
        ("ar", "أنا ذاهب إلى المنزل الآن."),
    ],
)
def test_an_output_in_the_target_script_passes(target, output):
    assert assess_translation("Je rentre à la maison maintenant.", output, target).acceptable


def test_an_unknown_target_never_triggers_the_script_rule():
    assert assess_translation("Salut", "Hello", "xx").acceptable


def test_masked_entities_are_not_counted_as_letters():
    verdict = assess_translation(
        "Regarde 🔹EMOJI_0🔹", "Посмотри 🔹EMOJI_0🔹", "ru"
    )

    assert verdict.acceptable
