"""Préservation des liens HTTP(S) pendant la traduction.

NLLB corromprait les URLs (domaines/segments traduits). Le moteur les masque
avant traduction et les restaure intactes après. Ces tests verrouillent le
contrat pur de masquage/restauration (sans modèle ML).
"""

import pytest

from src.services.translation_ml.translator_engine import mask_urls, restore_urls

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
