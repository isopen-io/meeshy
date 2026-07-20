"""Préservation des liens HTTP(S) pendant la traduction.

NLLB corromprait les URLs (domaines/segments traduits). Le moteur les masque
avant traduction et les restaure intactes après. Ces tests verrouillent le
contrat pur de masquage/restauration (sans modèle ML).
"""

import pytest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock, MagicMock

from src.services.translation_ml.translator_engine import mask_urls, restore_urls, TranslatorEngine

pytestmark = pytest.mark.unit


def test_mask_urls_extracts_and_placeholders():
    masked, urls = mask_urls("Regarde https://youtu.be/_AnF5eskiNQ?si=abc c'est top")
    assert urls == ["https://youtu.be/_AnF5eskiNQ?si=abc"]
    assert "https://" not in masked
    assert "🔗0🔗" in masked


def test_mask_restore_roundtrip_mixed_content():
    text = "Check https://a.com and https://b.com/x?y=1 now"
    masked, urls = mask_urls(text)
    assert restore_urls(masked, urls) == text


def test_pure_url_is_fully_masked():
    masked, urls = mask_urls("https://youtu.be/_AnF5eskiNQ")
    assert urls == ["https://youtu.be/_AnF5eskiNQ"]
    assert masked == "🔗0🔗"


def test_no_url_is_noop():
    masked, urls = mask_urls("bonjour le monde, comment ça va ?")
    assert urls == []
    assert masked == "bonjour le monde, comment ça va ?"


def test_restore_tolerates_nllb_added_spacing():
    # NLLB peut insérer des espaces autour du marqueur et traduire les mots.
    masked, urls = mask_urls("voir https://x.com/v")
    translated = masked.replace("🔗0🔗", "🔗 0 🔗").replace("voir", "see")
    assert restore_urls(translated, urls) == "see https://x.com/v"


def test_multiple_urls_no_prefix_collision():
    # 12 URLs : le marqueur 🔗1🔗 ne doit pas se confondre avec 🔗11🔗.
    parts = [f"https://site{i}.com" for i in range(12)]
    text = " ".join(parts)
    masked, urls = mask_urls(text)
    assert len(urls) == 12
    assert restore_urls(masked, urls) == text


# ─── TranslatorEngine.translate_text integration (URL preservation path) ─────


def _make_engine(chunk_side_effect=None):
    """Creates a TranslatorEngine with mocked model_loader and _translate_single_chunk."""
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = True
    executor = ThreadPoolExecutor(max_workers=1)
    engine = TranslatorEngine(model_loader, executor)
    if chunk_side_effect is None:
        engine._translate_single_chunk = AsyncMock(
            side_effect=lambda text, *a, **kw: f"[translated]{text}[/translated]"
        )
    else:
        engine._translate_single_chunk = AsyncMock(side_effect=chunk_side_effect)
    return engine


@pytest.mark.asyncio
async def test_translate_text_short_preserves_url():
    engine = _make_engine()
    result = await engine.translate_text("Voir https://example.com ici", "fr", "en", "basic")
    assert "https://example.com" in result


@pytest.mark.asyncio
async def test_translate_text_no_url_passes_through():
    engine = _make_engine()
    result = await engine.translate_text("Bonjour le monde", "fr", "en", "basic")
    assert "https://" not in result


@pytest.mark.asyncio
async def test_translate_text_long_preserves_url():
    # Text > 200 chars with a URL — exercises the smart_split + restore_urls(final_translation, urls) path.
    filler = "Bonjour. " * 30  # ~270 chars
    text = filler + "Voir https://meeshy.me/test ici."
    engine = _make_engine()
    result = await engine.translate_text(text, "fr", "en", "basic")
    assert "https://meeshy.me/test" in result


@pytest.mark.asyncio
async def test_translate_text_raises_when_model_not_loaded():
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = False
    executor = ThreadPoolExecutor(max_workers=1)
    engine = TranslatorEngine(model_loader, executor)
    with pytest.raises(Exception, match="non chargé"):
        await engine.translate_text("Hello", "en", "fr", "basic")


@pytest.mark.asyncio
async def test_translate_text_multiple_urls_all_preserved():
    engine = _make_engine()
    result = await engine.translate_text(
        "Go to https://a.com and https://b.com/path?q=1 for details.", "en", "fr", "basic"
    )
    assert "https://a.com" in result
    assert "https://b.com/path?q=1" in result
