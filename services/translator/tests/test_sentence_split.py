"""Un message court à plusieurs phrases garde TOUTES ses phrases (#9723).

Mesuré sur NLLB-200 (600M et 1.3B, staging 2026-10-08) : traduit d'un seul tenant,
« Salut ! On part en vacances à la mer en juillet. Tu veux venir avec nous ? »
rendait une seule phrase — la salutation et la question disparaissaient. Le moteur
découpe donc chaque message aux frontières de phrase AVANT le modèle, et le
réassemble avec ses séparateurs d'origine.
"""

import pytest

from utils.sentence_split import join_gap, split_sentences, tidy_translation


def _cores(text):
    return [piece.core for piece in split_sentences(text)]


def _rebuilt(text):
    return "".join(piece.before + piece.core + piece.after for piece in split_sentences(text))


@pytest.mark.parametrize(
    "text, expected",
    [
        (
            "Salut ! On part en vacances à la mer en juillet. Tu veux venir avec nous ?",
            ["Salut !", "On part en vacances à la mer en juillet.", "Tu veux venir avec nous ?"],
        ),
        (
            "Hello! Yes, I would love to come to the sea with you.",
            ["Hello!", "Yes, I would love to come to the sea with you."],
        ),
        (
            "Bonjour ! On organise l'anniversaire de Mamie dimanche, tu viens ?",
            ["Bonjour !", "On organise l'anniversaire de Mamie dimanche, tu viens ?"],
        ),
        ("Of course! I'll bring flowers for her.", ["Of course!", "I'll bring flowers for her."]),
        ("¡Hola! ¿Qué tal estás? Nos vemos mañana.", ["¡Hola!", "¿Qué tal estás?", "Nos vemos mañana."]),
        ("Merci ! Oui. À dimanche.", ["Merci !", "Oui.", "À dimanche."]),
        ("salut ! tu viens ?", ["salut !", "tu viens ?"]),
        ("Salut\nTu viens ce soir", ["Salut", "Tu viens ce soir"]),
        ("你好！你好吗？", ["你好！", "你好吗？"]),
        ("Merci ! 🔹EMOJI_0🔹", ["Merci !", "🔹EMOJI_0🔹"]),
    ],
)
def test_a_message_is_cut_at_each_sentence_boundary(text, expected):
    assert _cores(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "M. Dupont arrive demain.",
        "Dr. Smith is here today.",
        "J. Charles est là.",
        "Il fait 3.5 degrés dehors.",
        "Voir p. 12 du livre.",
        "Salut",
        "On se voit demain, ok ?",
    ],
)
def test_an_abbreviation_a_decimal_or_a_single_sentence_stays_whole(text):
    assert _cores(text) == [text]


@pytest.mark.parametrize(
    "text",
    [
        "Salut ! On part en vacances à la mer en juillet. Tu veux venir avec nous ?",
        "  Salut !   Tu viens ?  ",
        "Salut\n\nTu viens ?\n",
        "你好！你好吗？",
        "Merci ! 🔹EMOJI_0🔹",
        "",
        "   ",
    ],
)
def test_the_pieces_rebuild_the_exact_original(text):
    assert _rebuilt(text) == text


def test_a_cjk_gap_is_given_a_space_toward_a_spaced_language_and_back():
    assert join_gap("", "en", is_last=False) == " "
    assert join_gap(" ", "zh", is_last=False) == ""
    assert join_gap("\n", "zh", is_last=False) == "\n"
    assert join_gap("", "en", is_last=True) == ""
    assert join_gap(" ", "fr", is_last=False) == " "


@pytest.mark.parametrize(
    "translated, source, target, expected",
    [
        ("- Hey , what 's up ?", "Salut !", "en", "Hey, what's up?"),
        ("- Bien sûr !", "Of course!", "fr", "Bien sûr !"),
        ("Thank you .", "Merci !", "en", "Thank you."),
        ("- I don 't know.", "Je sais pas.", "en", "I don't know."),
        ("Comment tu vas ?", "¿Qué tal estás?", "fr", "Comment tu vas ?"),
        ("- Oui, c'est ça.", "- Yes, that's it.", "fr", "- Oui, c'est ça."),
    ],
)
def test_subtitle_artefacts_of_the_model_are_tidied(translated, source, target, expected):
    assert tidy_translation(translated, source, target) == expected
