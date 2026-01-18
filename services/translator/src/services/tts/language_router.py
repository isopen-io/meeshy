"""
Language Router - Sélection automatique du backend selon la langue
===================================================================

Responsabilités:
- Détection de la meilleure correspondance modèle/langue
- Routage automatique vers le backend approprié
- Gestion des fallbacks par langue
"""

import logging
from typing import Tuple

from ..tts import (
    BaseTTSBackend,
    ChatterboxBackend,
    MMSBackend,
    VITSBackend,
)
from .models import TTSModel, TTS_MODEL_INFO

logger = logging.getLogger(__name__)


class LanguageRouter:
    """
    Routeur de langues pour sélection automatique du backend.

    Logique de sélection (par ordre de priorité):
    1. Si langue dans VITS (ex: Lingala) → VITS (meilleure qualité)
    2. Si langue dans Chatterbox Multilingual → Chatterbox (clonage vocal)
    3. Si langue africaine → MMS
    4. Si backend actif supporte → backend actif
    5. Sinon → MMS (fallback universel)
    """

    # Langues africaines supportées par MMS
    AFRICAN_LANGUAGES = {
        'am', 'sw', 'yo', 'ha', 'rw', 'rn', 'sn', 'lg',
        'om', 'ti', 'ny', 'ee', 'ff', 'mg', 'so', 'ts',
        'bem', 'ybb'
    }

    def __init__(self, model_manager):
        """
        Initialise le routeur de langues.

        Args:
            model_manager: Gestionnaire de modèles
        """
        self.model_manager = model_manager

    def select_backend_for_language(
        self,
        language: str,
        active_backend: BaseTTSBackend = None,
        active_model: TTSModel = None
    ) -> Tuple[TTSModel, BaseTTSBackend]:
        """
        Sélectionne automatiquement le meilleur backend pour une langue.

        Args:
            language: Code langue (ex: 'en', 'fr-FR')
            active_backend: Backend actuellement actif (peut être None)
            active_model: Modèle actuellement actif (peut être None)

        Returns:
            Tuple[TTSModel, BaseTTSBackend]: Le modèle et son backend
        """
        lang = language.lower().split('-')[0]

        # 1. Priorité VITS pour langues spécifiques (ex: Lingala)
        vits_languages = VITSBackend.VITS_MODELS.keys()
        if lang in vits_languages:
            logger.info(f"[LanguageRouter] Langue VITS détectée ({lang}) → utilisation VITS")
            backend = self.model_manager.get_backend(TTSModel.VITS)
            return TTSModel.VITS, backend

        # 2. Langues Chatterbox Multilingual (avec clonage vocal)
        chatterbox_langs = ChatterboxBackend.MULTILINGUAL_LANGUAGES
        if lang in chatterbox_langs:
            if active_backend and isinstance(active_backend, ChatterboxBackend):
                logger.debug(f"[LanguageRouter] {lang} supporté par backend actif Chatterbox")
                return active_model, active_backend

            # Créer Chatterbox si pas encore fait
            logger.info(f"[LanguageRouter] Langue Chatterbox détectée ({lang}) → utilisation Chatterbox")
            backend = self.model_manager.get_backend(TTSModel.CHATTERBOX)
            return TTSModel.CHATTERBOX, backend

        # 3. Langues africaines → MMS (sans clonage vocal)
        if lang in self.AFRICAN_LANGUAGES:
            logger.info(f"[LanguageRouter] Langue africaine détectée ({lang}) → utilisation MMS")
            backend = self.model_manager.get_backend(TTSModel.MMS)
            return TTSModel.MMS, backend

        # 4. Si le backend actif supporte la langue, l'utiliser
        if active_backend and active_model:
            model_info = TTS_MODEL_INFO.get(active_model)
            if model_info and lang in model_info.languages:
                logger.debug(f"[LanguageRouter] {lang} supporté par backend actif {active_model.value}")
                return active_model, active_backend

        # 5. Fallback sur MMS pour les langues non supportées
        logger.warning(
            f"[LanguageRouter] Langue {lang} non supportée par backend actif → fallback MMS"
        )
        backend = self.model_manager.get_backend(TTSModel.MMS)
        return TTSModel.MMS, backend

    def is_language_supported(self, language: str, model: TTSModel) -> bool:
        """
        Vérifie si une langue est supportée par un modèle.

        Args:
            language: Code langue (ex: 'en', 'fr-FR')
            model: Type de modèle TTS

        Returns:
            True si la langue est supportée
        """
        lang = language.lower().split('-')[0]
        model_info = TTS_MODEL_INFO.get(model)

        if not model_info:
            return False

        return lang in model_info.languages

    def get_supported_languages(self, model: TTSModel) -> list:
        """
        Retourne les langues supportées par un modèle.

        Args:
            model: Type de modèle TTS

        Returns:
            Liste des codes langues supportés
        """
        model_info = TTS_MODEL_INFO.get(model)
        return model_info.languages if model_info else []

    def get_best_model_for_language(self, language: str) -> TTSModel:
        """
        Retourne le meilleur modèle pour une langue (sans considération du backend actif).

        Args:
            language: Code langue (ex: 'en', 'fr-FR')

        Returns:
            Modèle recommandé pour cette langue
        """
        lang = language.lower().split('-')[0]

        # VITS pour langues spécifiques
        if lang in VITSBackend.VITS_MODELS.keys():
            return TTSModel.VITS

        # Chatterbox pour langues multilingues
        if lang in ChatterboxBackend.MULTILINGUAL_LANGUAGES:
            return TTSModel.CHATTERBOX

        # MMS pour langues africaines
        if lang in self.AFRICAN_LANGUAGES:
            return TTSModel.MMS

        # Fallback
        return TTSModel.MMS
