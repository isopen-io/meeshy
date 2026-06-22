import os
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.translation_ml.translator_engine import TranslatorEngine


def _engine():
    return TranslatorEngine(model_loader=MagicMock(), executor=ThreadPoolExecutor(max_workers=1))


def test_detect_french_confident():
    assert _engine().detect_language("Bonjour, comment allez-vous aujourd'hui mon ami ?") == "fr"


def test_detect_english_confident():
    assert _engine().detect_language("How are you doing today my dear friend?") == "en"


def test_short_text_uses_fallback_not_en():
    assert _engine().detect_language("Ok", fallback="fr") == "fr"


def test_uncertain_does_not_default_to_en():
    # texte trop court / sans features -> repli fallback, surtout PAS 'en'
    assert _engine().detect_language("🙂", fallback="fr") == "fr"


def test_no_fallback_uses_configured_default_not_en():
    # DEFAULT_DETECT_LANGUAGE = 'fr' par défaut (configurable), jamais 'en' arbitraire
    assert _engine().detect_language("xy") == "fr"


def test_langdetect_unavailable_returns_default(monkeypatch):
    import services.translation_ml.translator_engine as eng
    monkeypatch.setattr(eng, "_LANGDETECT_OK", False)
    assert _engine().detect_language("Bonjour tout le monde", fallback="fr") == "fr"
