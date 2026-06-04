"""Tests de smart_split_text (découpe de texte long avant traduction NLLB).

Régression : un texte uniquement composé d'espaces produisait un chunk vide
`['']` (les .strip() laissaient une chaîne vide en tête) → un appel de
traduction gaspillé/ambigu. smart_split_text ne doit jamais émettre de chunk
vide, et préserver le contenu réel.
"""

import pytest

from src.services.translation_ml.translator_engine import smart_split_text


@pytest.mark.unit
def test_short_text_returned_as_single_chunk():
    assert smart_split_text("Bonjour", 200) == ["Bonjour"]


@pytest.mark.unit
def test_no_empty_chunk_for_whitespace_only_text():
    result = smart_split_text(" " * 250, 200)
    assert all(chunk for chunk in result)  # aucun chunk vide
    assert result == []  # aucun contenu significatif


@pytest.mark.unit
def test_long_word_without_spaces_is_preserved():
    text = "a" * 450
    result = smart_split_text(text, 200)
    assert all(chunk for chunk in result)
    assert "".join(result) == text  # pas d'espaces → tout préservé


@pytest.mark.unit
def test_runs_of_spaces_do_not_create_empty_chunks():
    text = "Hello" + " " * 250 + "World"
    result = smart_split_text(text, 200)
    assert all(chunk for chunk in result)


@pytest.mark.unit
def test_normal_text_splits_on_boundaries_without_empties():
    text = "Phrase une. " * 40
    result = smart_split_text(text, 200)
    assert len(result) > 1
    assert all(chunk.strip() for chunk in result)
