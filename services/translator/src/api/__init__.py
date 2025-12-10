"""
Meeshy Translation API Module
Contient toutes les APIs REST du service de traduction
"""

from api.translation_api import TranslationAPI
from api.health import health_router

__all__ = ["TranslationAPI", "health_router"]
