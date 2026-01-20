"""
Language Router - Sélection automatique du backend selon la langue
===================================================================

Responsabilités:
- Détection de la meilleure correspondance modèle/langue
- Routage automatique vers le backend approprié
- Gestion des fallbacks par langue
- Support des pipelines hybrides (VITS + OpenVoice)
"""

import logging
from typing import Tuple, Optional

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
    1. Si langue dans VITS (ex: Lingala) → VITS (clonage vocal via OpenVoice)
    2. Si langue dans Chatterbox Multilingual → Chatterbox (clonage vocal natif)
    3. Si langue africaine avec MMS → MMS (sans clonage vocal)
    4. Si backend actif supporte → backend actif
    5. Sinon → MMS (fallback universel)
    """

    # Langues supportées par VITS (ESPnet2 + OpenVoice pour clonage)
    VITS_LANGUAGES = {
        'ln',  # Lingala via DigitalUmuganda/lingala_vits_tts
    }

    # Langues africaines supportées par MMS TTS
    AFRICAN_LANGUAGES_MMS = {
        'am', 'sw', 'yo', 'ha', 'rw', 'rn', 'sn', 'lg',
        'om', 'ti', 'ny', 'ee', 'ff', 'mg', 'so', 'ts',
        'bem', 'ybb'
    }

    # Langues africaines sans TTS disponible (transcription/traduction uniquement)
    AFRICAN_LANGUAGES_NO_TTS = {
        'ig', 'zu', 'xh', 'wo', 'tw', 'nd', 'nso', 'st', 'ss', 'tn', 've',
        'bas', 'ksf', 'nnh', 'dua', 'bum', 'ewo'  # Cameroun
    }

    # Mapping de fallback linguistique pour langues sans TTS
    # Ces mappings utilisent des langues linguistiquement proches
    LANGUAGE_FALLBACK_MAP = {
        # Langues bantoues d'Afrique de l'Est → Swahili
        'lg': 'sw',   # Luganda → Swahili (proximité géographique)
        'rw': 'rn',   # Kinyarwanda ↔ Kirundi (très proches)
        'rn': 'rw',   # Kirundi ↔ Kinyarwanda

        # Langues sans TTS → fallback MMS disponible
        'zu': 'sn',   # Zulu → Shona (langues bantoues sud-africaines)
        'xh': 'sn',   # Xhosa → Shona
        'nd': 'sn',   # Ndebele → Shona
        'ss': 'sn',   # Swati → Shona
        'st': 'sn',   # Sotho → Shona
        'tn': 'sn',   # Tswana → Shona
        've': 'sn',   # Venda → Shona
        'nso': 'sn',  # Northern Sotho → Shona

        # Langues ouest-africaines
        'ig': 'yo',   # Igbo → Yoruba (Nigeria)
        'tw': 'ee',   # Twi → Ewe (Ghana)
        'wo': 'ff',   # Wolof → Fula (Afrique de l'Ouest)

        # Afrikaans → English (seul fallback raisonnable)
        'af': 'en',

        # Langues camerounaises → Français ou langues proches
        'bas': 'fr',  # Basaa → Français (Cameroun francophone)
        'ksf': 'fr',  # Bafia → Français
        'nnh': 'fr',  # Ngiemboon → Français
        'dua': 'fr',  # Duala → Français
        'bum': 'fr',  # Bulu → Français
        'ewo': 'fr',  # Ewondo → Français
    }

    def __init__(self, model_manager):
        """
        Initialise le routeur de langues.

        Args:
            model_manager: Gestionnaire de modèles
        """
        self.model_manager = model_manager

    def get_fallback_language(self, language: str) -> Optional[str]:
        """
        Retourne la langue de fallback pour une langue sans TTS.

        Args:
            language: Code langue original

        Returns:
            Code langue de fallback ou None si pas de fallback
        """
        lang = language.lower().split('-')[0]
        return self.LANGUAGE_FALLBACK_MAP.get(lang)

    def select_backend_for_language(
        self,
        language: str,
        active_backend: BaseTTSBackend = None,
        active_model: TTSModel = None,
        use_fallback: bool = True
    ) -> Tuple[TTSModel, BaseTTSBackend]:
        """
        Sélectionne automatiquement le meilleur backend pour une langue.

        Args:
            language: Code langue (ex: 'en', 'fr-FR')
            active_backend: Backend actuellement actif (peut être None)
            active_model: Modèle actuellement actif (peut être None)
            use_fallback: Utiliser le fallback linguistique si langue non supportée

        Returns:
            Tuple[TTSModel, BaseTTSBackend]: Le modèle et son backend
        """
        lang = language.lower().split('-')[0]
        original_lang = lang

        # Vérifier si la langue nécessite un fallback
        if lang in self.AFRICAN_LANGUAGES_NO_TTS and use_fallback:
            fallback_lang = self.get_fallback_language(lang)
            if fallback_lang:
                logger.warning(
                    f"[LanguageRouter] ⚠️ TTS non disponible pour {lang} → "
                    f"fallback linguistique vers {fallback_lang}"
                )
                lang = fallback_lang

        # 1. Priorité VITS pour langues spécifiques (ex: Lingala avec clonage OpenVoice)
        if lang in self.VITS_LANGUAGES:
            logger.info(f"[LanguageRouter] 🎤 Langue VITS détectée ({lang}) → VITS + OpenVoice voice cloning")
            backend = self.model_manager.get_backend(TTSModel.VITS)
            return TTSModel.VITS, backend

        # 2. Langues Chatterbox Multilingual (avec clonage vocal natif)
        chatterbox_langs = ChatterboxBackend.MULTILINGUAL_LANGUAGES
        if lang in chatterbox_langs:
            if active_backend and isinstance(active_backend, ChatterboxBackend):
                logger.debug(f"[LanguageRouter] {lang} supporté par backend actif Chatterbox")
                return active_model, active_backend

            logger.info(f"[LanguageRouter] 🎤 Langue Chatterbox détectée ({lang}) → clonage vocal natif")
            backend = self.model_manager.get_backend(TTSModel.CHATTERBOX)
            return TTSModel.CHATTERBOX, backend

        # 3. Langues africaines avec MMS TTS disponible (sans clonage vocal)
        if lang in self.AFRICAN_LANGUAGES_MMS:
            logger.info(f"[LanguageRouter] 🌍 Langue africaine MMS détectée ({lang}) → voix synthétique")
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
            f"[LanguageRouter] ⚠️ Langue {original_lang} non supportée nativement → fallback MMS"
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

        # VITS pour langues spécifiques (avec clonage OpenVoice)
        if lang in self.VITS_LANGUAGES:
            return TTSModel.VITS

        # Chatterbox pour langues multilingues (clonage natif)
        if lang in ChatterboxBackend.MULTILINGUAL_LANGUAGES:
            return TTSModel.CHATTERBOX

        # MMS pour langues africaines avec TTS disponible
        if lang in self.AFRICAN_LANGUAGES_MMS:
            return TTSModel.MMS

        # Fallback
        return TTSModel.MMS

    def supports_voice_cloning(self, language: str) -> bool:
        """
        Vérifie si le clonage vocal est disponible pour une langue.

        Args:
            language: Code langue (ex: 'en', 'fr-FR')

        Returns:
            True si le clonage vocal est supporté
        """
        lang = language.lower().split('-')[0]

        # VITS supporte le clonage via OpenVoice
        if lang in self.VITS_LANGUAGES:
            return True

        # Chatterbox supporte le clonage natif
        if lang in ChatterboxBackend.MULTILINGUAL_LANGUAGES:
            return True

        # MMS et autres ne supportent pas le clonage
        return False

    def get_language_tts_info(self, language: str) -> dict:
        """
        Retourne les informations TTS complètes pour une langue.

        Args:
            language: Code langue

        Returns:
            Dict avec les informations de support TTS
        """
        lang = language.lower().split('-')[0]

        # Déterminer le modèle et les capacités
        if lang in self.VITS_LANGUAGES:
            return {
                "language": lang,
                "tts_supported": True,
                "model": TTSModel.VITS.value,
                "voice_cloning": True,
                "cloning_method": "openvoice",
                "notes": "Pipeline hybride: VITS (ESPnet2) + OpenVoice ToneColorConverter"
            }
        elif lang in ChatterboxBackend.MULTILINGUAL_LANGUAGES:
            return {
                "language": lang,
                "tts_supported": True,
                "model": TTSModel.CHATTERBOX.value,
                "voice_cloning": True,
                "cloning_method": "native",
                "notes": "Clonage vocal natif Chatterbox"
            }
        elif lang in self.AFRICAN_LANGUAGES_MMS:
            return {
                "language": lang,
                "tts_supported": True,
                "model": TTSModel.MMS.value,
                "voice_cloning": False,
                "cloning_method": None,
                "notes": "Voix synthétique MMS - pas de clonage vocal"
            }
        elif lang in self.AFRICAN_LANGUAGES_NO_TTS:
            fallback = self.get_fallback_language(lang)
            return {
                "language": lang,
                "tts_supported": False,
                "model": None,
                "voice_cloning": False,
                "cloning_method": None,
                "fallback_language": fallback,
                "notes": f"TTS non disponible - fallback vers {fallback}" if fallback else "TTS non disponible"
            }
        else:
            return {
                "language": lang,
                "tts_supported": True,
                "model": TTSModel.MMS.value,
                "voice_cloning": False,
                "cloning_method": None,
                "notes": "Fallback MMS"
            }
