"""Une salutation seule se traduit par le lexique, jamais par le modèle (#9723).

Mesuré sur NLLB-200 (600M et 1.3B, glouton et faisceau de 4, staging 2026-10-08) :
isolée, une interjection part dans le registre des sous-titres — « Hello! » →
« Je vous en prie. », « Oui. » → « - I know. », « Salut » → « - Hi , my name is ».
Le lexique des interjections courantes, dans les sept langues de l'application,
sert ces phrases-là ; tout le reste passe par le modèle.
"""

import pytest

from utils.interjections import translate_interjection


@pytest.mark.parametrize(
    "sentence, source, target, expected",
    [
        ("Salut !", "fr", "en", "Hi!"),
        ("Hello!", "en", "fr", "Bonjour !"),
        ("Bonjour !", "fr", "en", "Hello!"),
        ("¡Hola!", "es", "fr", "Bonjour !"),
        ("Hello!", "en", "es", "¡Hola!"),
        ("Merci !", "fr", "en", "Thank you!"),
        ("Oui.", "fr", "en", "Yes."),
        ("Of course!", "en", "fr", "Bien sûr !"),
        ("merci", "fr", "en", "thank you"),
        ("D’accord !", "fr", "en", "OK!"),
        ("Merci beaucoup !", "fr", "de", "Vielen Dank!"),
        ("Obrigado!", "pt", "it", "Grazie!"),
        ("شكرا", "ar", "fr", "Merci"),
        ("Merci ?", "fr", "ar", "شكرا؟"),
        ("Good morning!", "en", "fr", "Bonjour !"),
        ("Hi!!", "en", "fr", "Salut !!"),
    ],
)
def test_a_common_interjection_is_served_from_the_lexicon(sentence, source, target, expected):
    assert translate_interjection(sentence, source, target) == expected


@pytest.mark.parametrize(
    "sentence, source, target",
    [
        ("On part en vacances à la mer en juillet.", "fr", "en"),
        ("Salut Marie !", "fr", "en"),
        ("Salut !", "fr", "fr"),
        ("Salut !", "fr", "sw"),
        ("Salut !", "xx", "en"),
        ("", "fr", "en"),
        ("!", "fr", "en"),
    ],
)
def test_anything_else_is_left_to_the_model(sentence, source, target):
    assert translate_interjection(sentence, source, target) is None
