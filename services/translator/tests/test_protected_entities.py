"""Une traduction garde ses adresses, mentions et hashtags (#9086).

Les liens, mentions et hashtags sont extraits AVANT NLLB par le mécanisme qui
protégeait déjà les émojis (même marqueur `🔹EMOJI_n🔹`, que NLLB recopie —
le marqueur `🔗n🔗` d'avant était un jeton `<unk>` du vocabulaire NLLB, détruit
dès l'encodage), puis réinjectés à l'identique après traduction.
"""

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, List
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.translation_ml.translator_engine import TranslatorEngine
from src.utils.text_segmentation import (
    TextSegmenter,
    protect_entities,
    restore_entities,
    strip_entities,
)

pytestmark = pytest.mark.unit

REAL_CAPTION = (
    "Recette #9072 — ma légende se pose au ras du bas. "
    "Lien : https://meeshy.me/notes"
)


def _translated_words(masked: str) -> str:
    """Traducteur bouchonné : change chaque mot hors marqueur, comme NLLB."""
    return " ".join(
        word if "🔹" in word else f"«{word}»" for word in masked.split(" ")
    )


def _engine(chunk: Callable[[str], str]) -> TranslatorEngine:
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = True
    engine = TranslatorEngine(model_loader, ThreadPoolExecutor(max_workers=1))
    engine._translate_single_chunk = AsyncMock(side_effect=lambda text, *a, **kw: chunk(text))
    return engine


def _roundtrip(text: str) -> str:
    masked, entities = protect_entities(text)
    return restore_entities(_translated_words(masked), entities)


@pytest.mark.parametrize(
    "entity",
    [
        "https://meeshy.me/notes",
        "http://example.com/a?b=1&c=2#frag",
        "www.meeshy.me/p/42",
        "[[https://meeshy.me/brut]]",
        "<https://meeshy.me/chevrons>",
        "m+qVOfYs",
        "@marie-claire",
        "#voyage",
    ],
)
def test_an_entity_crosses_the_translation_identically(entity: str) -> None:
    masked, _ = protect_entities(f"Regarde {entity} maintenant")

    assert entity not in masked
    assert entity in _roundtrip(f"Regarde {entity} maintenant")


def test_the_real_caption_keeps_its_address() -> None:
    assert "https://meeshy.me/notes" in _roundtrip(REAL_CAPTION)
    assert "#9072" in _roundtrip(REAL_CAPTION)


def test_a_sentence_final_period_is_not_swallowed_into_the_url() -> None:
    _, entities = protect_entities("Va sur https://meeshy.me/notes.")

    assert list(entities.values()) == ["https://meeshy.me/notes"]


def test_a_markdown_link_translates_its_label_and_keeps_its_target() -> None:
    masked, entities = protect_entities("Lis [la suite](https://meeshy.me/x) ici")

    assert "[la suite]" in masked
    assert "https://meeshy.me/x" not in masked
    restored = restore_entities(_translated_words(masked), entities)
    assert "«[la»" in restored
    assert restored.endswith("suite](https://meeshy.me/x) «ici»")


def test_the_double_bracket_block_stays_whole() -> None:
    _, entities = protect_entities("Voir [[https://meeshy.me/brut]].")

    assert list(entities.values()) == ["[[https://meeshy.me/brut]]"]


def test_an_email_is_not_read_as_a_mention() -> None:
    masked, entities = protect_entities("Écris à contact@meeshy.me demain")

    assert all(not value.startswith("@") for value in entities.values())
    assert "contact" in masked


def test_emojis_and_links_share_one_placeholder_sequence() -> None:
    masked, entities = protect_entities("Super 🎉 https://a.com et @ami")

    assert sorted(entities.values()) == sorted(["🎉", "https://a.com", "@ami"])
    assert masked.count("🔹EMOJI_") == 3


def test_protection_is_idempotent_on_an_already_masked_text() -> None:
    masked, first = protect_entities("Salut 😊 voir https://a.com")
    remasked, second = protect_entities(masked)

    assert remasked == masked
    assert second == {}
    assert restore_entities(restore_entities(remasked, second), first) == "Salut 😊 voir https://a.com"


def test_a_second_pass_numbers_after_the_existing_placeholders() -> None:
    masked, first = protect_entities("Salut 😊")
    remasked, second = protect_entities(f"{masked} https://a.com")

    assert set(second).isdisjoint(first)
    assert restore_entities(restore_entities(remasked, second), first) == "Salut 😊 https://a.com"


def test_a_placeholder_dropped_by_the_model_is_reinjected_at_the_end() -> None:
    masked, entities = protect_entities(REAL_CAPTION)
    url_index = next(i for i, value in entities.items() if value.startswith("https"))
    model_output = masked.replace(f"🔹EMOJI_{url_index}🔹", "").rstrip()

    restored = restore_entities(model_output, entities)

    assert restored.endswith("Lien : https://meeshy.me/notes")
    assert "#9072" in restored


def test_restoration_tolerates_spacing_inserted_by_the_model() -> None:
    _, entities = protect_entities("voir https://x.com/v")

    assert restore_entities("see 🔹 EMOJI_0 🔹", entities) == "see https://x.com/v"


def test_detection_ignores_addresses_mentions_and_hashtags() -> None:
    stripped = strip_entities("Lis [la suite](https://meeshy.me/x) @ami #voyage www.a.com")

    assert "la suite" in stripped
    for gone in ("https", "@ami", "#voyage", "www"):
        assert gone not in stripped


@pytest.mark.asyncio
async def test_the_engine_keeps_the_address_when_the_model_drops_nothing() -> None:
    engine = _engine(_translated_words)

    result = await engine.translate_text(REAL_CAPTION, "fr", "en", "basic")

    assert "https://meeshy.me/notes" in result
    assert "«Recette»" in result


@pytest.mark.asyncio
async def test_the_engine_never_sends_an_address_to_the_model() -> None:
    seen: List[str] = []
    engine = _engine(lambda text: seen.append(text) or text)

    await engine.translate_text(REAL_CAPTION, "fr", "en", "basic")

    assert seen and all("meeshy.me" not in text for text in seen)


@pytest.mark.asyncio
async def test_the_engine_batch_path_protects_every_text() -> None:
    engine = _engine(_translated_words)
    pipeline_inputs: List[str] = []

    def pipeline(chunk: List[str], **_: object) -> List[dict]:
        pipeline_inputs.extend(chunk)
        return [{"translation_text": _translated_words(text)} for text in chunk]

    engine._get_or_create_pipeline = MagicMock(return_value=(pipeline, True))
    engine.model_loader.get_model_inference_lock.return_value = MagicMock()
    texts = [REAL_CAPTION, "Salut @ami", "Voir [[https://a.com]]"]

    results = await engine.translate_batch(texts, "fr", "en", "basic")

    assert all("meeshy.me" not in text and "@ami" not in text for text in pipeline_inputs)
    assert "https://meeshy.me/notes" in results[0]
    assert "@ami" in results[1]
    assert "[[https://a.com]]" in results[2]


@pytest.mark.asyncio
async def test_a_text_made_only_of_an_address_is_not_sent_to_the_model() -> None:
    seen: List[str] = []
    engine = _engine(lambda text: seen.append(text) or text)

    result = await engine.translate_text("https://meeshy.me/notes", "fr", "en", "basic")

    assert result == "https://meeshy.me/notes"
    assert seen == []


@pytest.mark.asyncio
async def test_the_structured_path_keeps_emojis_and_addresses_through_both_protections() -> None:
    text = "Salut 🎉 @ami\n\nLien : https://meeshy.me/notes\n\nEt [la suite](https://a.com) 👋"
    segmenter = TextSegmenter()
    segments, entities = segmenter.segment_text(text)
    lines = [segment for segment in segments if segment["type"] == "line"]
    engine = _engine(_translated_words)
    pipeline = MagicMock(side_effect=lambda chunk, **_: [{"translation_text": _translated_words(t)} for t in chunk])
    engine._get_or_create_pipeline = MagicMock(return_value=(pipeline, True))

    translated = await engine.translate_batch([line["text"] for line in lines], "fr", "en", "basic")
    by_index = {line["index"]: value for line, value in zip(lines, translated)}
    result = segmenter.reassemble_text(
        [{**segment, "text": by_index.get(segment["index"], segment["text"])} for segment in segments],
        entities,
    )

    for kept in ("🎉", "@ami", "https://meeshy.me/notes", "](https://a.com)", "👋", "\n\n"):
        assert kept in result
    assert "🔹" not in result
