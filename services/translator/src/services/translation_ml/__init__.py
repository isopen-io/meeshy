"""
Module de traduction ML - Architecture modulaire

Exports publics:
- TranslationMLService: Service principal (façade)
- TranslationResult: Dataclass pour résultats
- get_unified_ml_service: Factory function
"""

from .model_loader import ModelLoader
from .translator_engine import TranslatorEngine
from .translation_cache import TranslationCache
from .translation_service import TranslationService, TranslationResult

__all__ = [
    'ModelLoader',
    'TranslatorEngine',
    'TranslationCache',
    'TranslationService',
    'TranslationResult'
]
