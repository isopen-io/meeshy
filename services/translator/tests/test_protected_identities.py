"""Une traduction ne réécrit jamais un nom, une adresse ni un identifiant (#14327).

Recette S8 du 2026-11-01 : « 🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp »
était servi en espagnol « 🔗 Reel de recreación_b: … » — NLLB avait traduit le
pseudo de l'auteur. Le nom d'une phrase de partage, un pseudo nu (souligné,
chiffres), une adresse e-mail passent désormais masqués, et une sortie du modèle
qui perd ou altère un marqueur n'est jamais servie.
"""

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, List
from unittest.mock import MagicMock

import pytest

from src.services.translation_ml.translator_engine import TranslatorEngine
from src.utils.text_segmentation import protect_entities, restore_entities

pytestmark = pytest.mark.unit

SHARED_REEL = "🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp"


def _rewrite_words(masked: str) -> str:
    """Le modèle bouchonné réécrit chaque mot hors marqueur, comme NLLB sur un pseudo."""
    return " ".join(word if "🔹" in word else f"«{word}»" for word in masked.split(" "))


def _engine(chunk: Callable[[str], str]) -> TranslatorEngine:
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = True
    engine = TranslatorEngine(model_loader, ThreadPoolExecutor(max_workers=1))

    def pipeline(texts, **_: object):
        if isinstance(texts, str):
            return {"translation_text": chunk(texts)}
        return [{"translation_text": chunk(text)} for text in texts]

    engine._get_or_create_pipeline = MagicMock(return_value=(pipeline, True))
    engine.model_loader.get_model_inference_lock.return_value = MagicMock()
    return engine


def _protected_values(text: str) -> List[str]:
    return list(protect_entities(text)[1].values())


@pytest.mark.parametrize(
    ("phrase", "author"),
    [
        (SHARED_REEL, "recretrait_b"),
        ("🔗 Réel de Jean Dupont : https://meeshy.me/l/abc", "Jean Dupont"),
        ("🔗 Story by Marie: https://meeshy.me/l/abc", "Marie"),
        ("🔗 Publicación de Ana López: https://meeshy.me/l/abc", "Ana López"),
        ("🔗 Beitrag von Jürgen: https://meeshy.me/l/abc", "Jürgen"),
        ("🔗 Storia di Luca: https://meeshy.me/l/abc", "Luca"),
        ("🔗 Publicação de João: https://meeshy.me/l/abc", "João"),
        ("🔗 قصة سارة: https://meeshy.me/l/abc", "سارة"),
    ],
)
def test_the_author_of_a_share_phrase_is_never_given_to_the_model(phrase: str, author: str) -> None:
    masked, entities = protect_entities(phrase)

    assert author not in masked
    assert author in entities.values()
    assert restore_entities(_rewrite_words(masked), entities).count(author) == 1


def test_the_share_phrase_keeps_its_kind_to_translate() -> None:
    masked, _ = protect_entities(SHARED_REEL)

    assert "Reel de" in masked


def test_a_sentence_that_only_mentions_sharing_keeps_its_words_translatable() -> None:
    masked, entities = protect_entities("🔗 Voici le lien de la soirée : https://meeshy.me/x")

    assert "la soirée" in masked
    assert "https://meeshy.me/x" in entities.values()


@pytest.mark.parametrize("identity", ["recretrait_b", "jean_42", "user42", "_dark_"])
def test_a_bare_handle_crosses_the_translation_identically(identity: str) -> None:
    masked, entities = protect_entities(f"Demande à {identity} demain")

    assert identity not in masked
    assert identity in restore_entities(_rewrite_words(masked), entities)


@pytest.mark.parametrize("word", ["1er", "2e", "14h30", "demain"])
def test_ordinary_words_and_ordinals_stay_translatable(word: str) -> None:
    masked, _ = protect_entities(f"On se voit le {word} matin")

    assert word in masked


@pytest.mark.parametrize(
    "entity",
    ["contact@meeshy.me", "jean.dupont+tag@mail.example.org", "@recretrait_b", "#11783"],
)
def test_emails_mentions_and_hashtags_cross_whole(entity: str) -> None:
    assert entity in _protected_values(f"Écris à {entity} ce soir.")


def test_an_email_keeps_the_sentence_final_period_outside() -> None:
    assert _protected_values("Écris à contact@meeshy.me.") == ["contact@meeshy.me"]


@pytest.mark.asyncio
async def test_the_shared_reel_reaches_the_reader_with_author_and_link_intact() -> None:
    engine = _engine(_rewrite_words)

    result = await engine.translate_text(SHARED_REEL, "fr", "es", "basic")

    assert "recretrait_b" in result
    assert "https://staging.meeshy.me/l/I0tqQp" in result
    assert result.startswith("🔗")


@pytest.mark.asyncio
async def test_an_address_alone_is_served_untouched() -> None:
    seen: List[str] = []
    engine = _engine(lambda text: seen.append(text) or text)

    result = await engine.translate_text("https://staging.meeshy.me/l/I0tqQp", "fr", "es", "basic")

    assert result == "https://staging.meeshy.me/l/I0tqQp"
    assert seen == []


def _drop_markers(text: str) -> str:
    """Un modèle qui avale les marqueurs dès que la phrase en contient."""
    return " ".join(f"«{word}»" for word in text.split(" ") if "🔹" not in word)


@pytest.mark.asyncio
async def test_a_translation_that_lost_a_marker_falls_back_to_translating_between_markers() -> None:
    engine = _engine(_drop_markers)

    result = await engine.translate_text("Regarde https://a.com maintenant", "fr", "en", "basic")

    assert result == "«Regarde» https://a.com «maintenant»"


@pytest.mark.asyncio
async def test_a_translation_that_altered_a_marker_is_never_served() -> None:
    engine = _engine(lambda text: text.replace("EMOJI_0", "EMOJI_1") if "🔹" in text else f"«{text}»")

    result = await engine.translate_text("Voici @ami et @amie", "fr", "en", "basic")

    assert result == "«Voici» @ami «et» @amie"


@pytest.mark.asyncio
async def test_the_batch_path_falls_back_too() -> None:
    engine = _engine(_drop_markers)
    texts = [SHARED_REEL, "Voici @ami", "Va sur https://a.com vite"]

    results = await engine.translate_batch(texts, "fr", "es", "basic")

    assert "recretrait_b" in results[0] and "https://staging.meeshy.me/l/I0tqQp" in results[0]
    assert results[1] == "«Voici» @ami"
    assert results[2] == "«Va» «sur» https://a.com «vite»"
