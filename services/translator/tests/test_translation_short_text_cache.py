"""
Cache des traductions COURTES.

`translate_with_structure` renvoie vers `translate()` dès que le texte fait
moins de 100 caractères, sans saut de paragraphe ni emoji — c'est-à-dire pour
quasiment tous les textes posés sur le canvas d'une story, et pour la majorité
des messages.

Or `translate()` ne consultait ni ne remplissait le cache : il codait même
`from_cache: False` en dur. Le cache existait bien (`TranslationCache`, Redis),
mais seul le chemin `translate_with_structure` des textes LONGS s'en servait,
segment par segment. Traduire trois fois le même overlay coûtait trois passes
modèle.

Directive user 2026-07-27 : « sauvegarder les traductions en cache côté
translator comme en base côté gateway ».
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


def _make_service(cached=None):
    """`TranslationService` réduit à ce que `translate()` touche."""
    from services.translation_ml.translation_service import TranslationService

    service = TranslationService.__new__(TranslationService)
    service.is_initialized = True

    service.model_loader = MagicMock()
    service.model_loader.is_model_loaded.return_value = True
    service.model_loader.get_loaded_models.return_value = ['basic']

    service.translator_engine = MagicMock()
    service.translator_engine.detect_language.return_value = 'fr'
    service.translator_engine.translate_text = AsyncMock(return_value='Hello')

    service.translation_cache = MagicMock()
    service.translation_cache.get_translation = AsyncMock(return_value=cached)
    service.translation_cache.set_translation = AsyncMock()

    service._update_stats = MagicMock()
    return service


@pytest.mark.asyncio
async def test_short_translation_is_written_to_the_cache():
    service = _make_service()

    await service.translate('Bonjour', source_language='fr', target_language='en')

    service.translation_cache.set_translation.assert_awaited_once()
    kwargs = service.translation_cache.set_translation.await_args.kwargs
    assert kwargs['text'] == 'Bonjour'
    assert kwargs['source_lang'] == 'fr'
    assert kwargs['target_lang'] == 'en'
    assert kwargs['translated_text'] == 'Hello'


@pytest.mark.asyncio
async def test_a_cached_short_translation_never_reaches_the_model():
    service = _make_service(cached={'translated_text': 'Hello'})

    result = await service.translate('Bonjour', source_language='fr', target_language='en')

    assert result['translated_text'] == 'Hello'
    assert result['from_cache'] is True
    service.translator_engine.translate_text.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_cache_miss_still_reaches_the_model():
    service = _make_service(cached=None)

    result = await service.translate('Bonjour', source_language='fr', target_language='en')

    assert result['translated_text'] == 'Hello'
    assert result['from_cache'] is False
    service.translator_engine.translate_text.assert_awaited_once()


@pytest.mark.asyncio
async def test_the_cache_key_uses_the_DETECTED_language_not_auto():
    # Ranger une traduction sous la clé « auto » la rendrait irrécupérable :
    # la relecture se fait toujours avec une langue résolue.
    service = _make_service()
    service.translator_engine.detect_language.return_value = 'fr'

    await service.translate('Bonjour', source_language='auto', target_language='en')

    assert service.translation_cache.get_translation.await_args.kwargs['source_lang'] == 'fr'
    assert service.translation_cache.set_translation.await_args.kwargs['source_lang'] == 'fr'


@pytest.mark.asyncio
async def test_an_empty_translation_is_not_cached():
    # Mémoriser un échec le figerait pour toute la durée du TTL.
    service = _make_service()
    service.translator_engine.translate_text = AsyncMock(return_value='   ')

    await service.translate('Bonjour', source_language='fr', target_language='en')

    service.translation_cache.set_translation.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_cache_failure_never_costs_the_translation():
    # Le cache est une optimisation, jamais un point de panne : Redis absent
    # ou en erreur doit dégrader vers le modèle, pas faire échouer la requête.
    service = _make_service()
    service.translation_cache.get_translation = AsyncMock(side_effect=RuntimeError('redis down'))
    service.translation_cache.set_translation = AsyncMock(side_effect=RuntimeError('redis down'))

    result = await service.translate('Bonjour', source_language='fr', target_language='en')

    assert result['translated_text'] == 'Hello'
