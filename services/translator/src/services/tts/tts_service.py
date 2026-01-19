"""
TTS Service - Façade orchestrateur
===================================

Point d'entrée principal du service TTS unifié (Singleton).
Délègue aux modules spécialisés:
- ModelManager: Gestion des modèles
- LanguageRouter: Sélection automatique du backend
- Synthesizer: Synthèse et conversion audio
"""

import os
import logging
import asyncio
import threading
from typing import Optional, Dict, Any, Tuple
from pathlib import Path

from config.settings import get_settings
from .models import TTSModel, TTSModelInfo, TTS_MODEL_INFO
from .model_manager import ModelManager, ModelStatus
from .language_router import LanguageRouter
from .synthesizer import Synthesizer, UnifiedTTSResult

logger = logging.getLogger(__name__)


class UnifiedTTSService:
    """
    Service TTS Unifié - Singleton

    Fonctionnalités:
    - Support multi-modèles (Chatterbox, Higgs Audio V2, XTTS, MMS, VITS)
    - Chargement à chaud des modèles
    - Vérification de disponibilité locale
    - Téléchargement en arrière-plan
    - Fallback automatique sur Chatterbox
    - Auto-sélection MMS pour langues africaines
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._singleton_initialized = False
        return cls._instance

    def __init__(
        self,
        model: TTSModel = None,
        output_dir: Optional[str] = None,
        device: str = "auto"
    ):
        if self._singleton_initialized:
            return

        # Configuration
        self._settings = get_settings()

        model_env = os.getenv("TTS_MODEL", "chatterbox")
        try:
            self.requested_model = model or TTSModel(model_env)
        except ValueError:
            logger.warning(f"[TTS] Modèle inconnu: {model_env}, utilisation de chatterbox")
            self.requested_model = TTSModel.CHATTERBOX

        self.output_dir = Path(output_dir or os.getenv("TTS_OUTPUT_DIR", self._settings.tts_output_dir))
        self.device = os.getenv("TTS_DEVICE", device)
        self.default_format = os.getenv("TTS_DEFAULT_FORMAT", self._settings.tts_default_format)
        self.models_path = Path(self._settings.models_path)

        # NOUVEAU: Timeout configurable
        self.download_timeout = int(os.getenv("TTS_DOWNLOAD_TIMEOUT", "120"))

        # Modules spécialisés
        self.model_manager = ModelManager(device=self.device, models_path=self.models_path)
        self.language_router = LanguageRouter(model_manager=self.model_manager)
        self.synthesizer = Synthesizer(
            output_dir=self.output_dir,
            default_format=self.default_format
        )

        # État du service
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        logger.info(
            f"[TTS] Service configuré: model={self.requested_model.value}, "
            f"device={self.device}, output={self.output_dir}"
        )

        self._singleton_initialized = True

    async def initialize(self, model: TTSModel = None) -> bool:
        """
        Initialise le service avec le modèle spécifié.

        Logique NON-BLOQUANTE:
        1. Vérifier qu'au moins un package TTS est installé
        2. Chercher un modèle disponible localement (priorité: demandé > chatterbox > autres)
        3. Si trouvé → le charger immédiatement
        4. Télécharger les modèles manquants en ARRIÈRE-PLAN
        5. Si aucun modèle local → mode "pending" jusqu'à fin du premier téléchargement

        Args:
            model: Modèle à initialiser (optionnel)

        Returns:
            True si au moins un backend est disponible (package installé),
            False si aucun backend TTS n'est installable
        """
        model = model or self.requested_model

        async with self._init_lock:
            # Si déjà initialisé avec ce modèle, retourner True
            if (model == self.model_manager.active_model and
                self.model_manager.active_backend and
                self.model_manager.active_backend.is_initialized):
                self.is_initialized = True
                return True

            # ÉTAPE 0: VÉRIFIER QU'AU MOINS UN PACKAGE TTS EST INSTALLÉ
            # =========================================================
            try:
                available_backends = await self.model_manager.get_available_backends()
            except Exception as e:
                logger.error(f"[TTS] ❌ Erreur lors de la vérification des backends: {e}")
                available_backends = []

            if not available_backends:
                logger.error(
                    "[TTS] ❌ AUCUN package TTS installé ! "
                    "Installez au moins : pip install chatterbox-tts"
                )
                self.is_initialized = False
                return False

            logger.info(f"[TTS] ✅ Backends TTS disponibles: {[b.value for b in available_backends]}")

            # ÉTAPE 1: Trouver un modèle disponible localement
            local_model = await self.model_manager.find_local_model(model)

            if local_model:
                # Charger le modèle local immédiatement
                success = await self.model_manager.load_model(local_model)

                if success:
                    # Télécharger les autres modèles en arrière-plan
                    asyncio.create_task(
                        self.model_manager.download_models_background(model)
                    )
                    self.is_initialized = True
                    logger.info(f"[TTS] ✅ Modèle {local_model.value} chargé et prêt")
                    return True

            # ÉTAPE 2: Aucun modèle local - téléchargement en arrière-plan
            logger.warning("[TTS] ⚠️ Aucun modèle TTS disponible localement")

            # Vérifier que le modèle demandé a un package disponible
            if model not in available_backends and TTSModel.CHATTERBOX not in available_backends:
                logger.error(
                    f"[TTS] ❌ Package requis non installé pour {model.value}. "
                    "Installez : pip install chatterbox-tts"
                )
                self.is_initialized = False
                return False

            logger.info("[TTS] 📥 Démarrage des téléchargements en arrière-plan...")

            # Lancer les téléchargements en arrière-plan
            asyncio.create_task(
                self.model_manager.download_and_load_first_available(model)
            )

            # NOUVEAU: Attendre un peu pour voir si le téléchargement démarre
            try:
                await asyncio.wait_for(
                    self.model_manager.wait_for_download_start(),
                    timeout=10.0
                )
                logger.info("[TTS] ✅ Téléchargement démarré avec succès")
            except asyncio.TimeoutError:
                logger.warning(
                    "[TTS] ⚠️ Le téléchargement n'a pas démarré rapidement. "
                    "Vérifiez la connexion internet et l'espace disque."
                )
            except Exception as e:
                logger.warning(f"[TTS] ⚠️ Erreur lors du démarrage du téléchargement: {e}")

            # Service démarre en mode "pending"
            self.is_initialized = True
            logger.info("[TTS] ⏳ Service TTS démarré en mode pending (téléchargement en cours)")

            return True

    async def switch_model(self, model: TTSModel, force: bool = False) -> bool:
        """
        Change de modèle TTS (chargement à chaud).

        Args:
            model: Modèle cible
            force: Si True, force le rechargement même si déjà actif

        Returns:
            True si le changement a réussi
        """
        if (model == self.model_manager.active_model and
            self.model_manager.active_backend and
            self.model_manager.active_backend.is_initialized and
            not force):
            logger.info(f"[TTS] Modèle {model.value} déjà actif")
            return True

        logger.info(
            f"[TTS] 🔄 Changement de modèle: "
            f"{self.model_manager.active_model.value if self.model_manager.active_model else 'None'} "
            f"→ {model.value}"
        )

        # Vérifier le statut du modèle
        status = await self.model_manager.get_model_status(model)

        if not status.is_available:
            logger.warning(f"[TTS] Package {model.value} non disponible")
            return False

        if not status.is_downloaded:
            # Vérifier si on peut télécharger
            if not self.model_manager.can_download_model(model):
                logger.warning(f"[TTS] Espace disque insuffisant pour {model.value}")
                return False

            logger.info(f"[TTS] Téléchargement de {model.value}...")
            success = await self.model_manager.download_model(model)

            if not success:
                logger.warning(f"[TTS] Échec téléchargement {model.value}")
                return False

        # Charger le nouveau modèle
        success = await self.model_manager.load_model(model)

        if success:
            logger.info(f"✅ [TTS] Changement vers {model.value} réussi")
        else:
            logger.warning(f"[TTS] ⚠️ Échec changement vers {model.value}")

        return success

    async def synthesize_with_voice(
        self,
        text: str,
        speaker_audio_path: str,
        target_language: str,
        output_format: str = None,
        message_id: Optional[str] = None,
        model: TTSModel = None,
        max_wait_seconds: int = 120,
        cloning_params: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> UnifiedTTSResult:
        """
        Synthétise du texte avec clonage vocal.

        Args:
            text: Texte à synthétiser
            speaker_audio_path: Chemin vers l'audio de référence pour le clonage
            target_language: Langue cible (code ISO 639-1)
            output_format: Format de sortie (mp3, wav, etc.)
            message_id: ID du message pour le nommage du fichier
            model: Modèle TTS à utiliser (optionnel)
            max_wait_seconds: Temps max d'attente si modèle en téléchargement
            cloning_params: Paramètres de clonage vocal (exaggeration, cfg_weight, etc.)

        Returns:
            UnifiedTTSResult avec les informations de l'audio généré
        """
        # Changer de modèle si nécessaire
        if model and model != self.model_manager.active_model:
            success = await self.switch_model(model)
            if not success:
                logger.warning(
                    f"[TTS] Impossible de changer vers {model.value}, "
                    f"utilisation de {self.model_manager.active_model.value if self.model_manager.active_model else 'pending'}"
                )

        # NOUVELLE LOGIQUE: Attendre avec événements au lieu de polling
        if not self.model_manager.active_backend:
            logger.info("[TTS] ⏳ Attente d'un modèle TTS (téléchargement en cours)...")

            try:
                # Attendre l'événement de modèle prêt (bloquant mais efficace)
                await self.model_manager.wait_for_model_ready(timeout=max_wait_seconds)
                logger.info("[TTS] ✅ Modèle TTS prêt")
            except RuntimeError as e:
                # Le téléchargement a échoué
                raise RuntimeError(
                    f"TTS non disponible: {e}. "
                    "Vérifiez que les packages sont installés : pip install chatterbox-tts"
                )
            except asyncio.TimeoutError:
                raise RuntimeError(
                    f"Timeout TTS après {max_wait_seconds}s. "
                    "Le modèle n'est pas encore téléchargé. Réessayez dans quelques minutes."
                )

        if not self.model_manager.active_backend:
            raise RuntimeError(
                "Backend TTS non disponible. "
                "Vérifiez les logs pour plus de détails."
            )

        # Synthétiser avec le backend actif
        return await self.synthesizer.synthesize_with_voice(
            text=text,
            target_language=target_language,
            backend=self.model_manager.active_backend,
            model=self.model_manager.active_model,
            model_info=TTS_MODEL_INFO[self.model_manager.active_model],
            speaker_audio_path=speaker_audio_path,
            output_format=output_format,
            message_id=message_id,
            cloning_params=cloning_params,
            **kwargs
        )

    async def synthesize(
        self,
        text: str,
        language: str,
        output_format: str = None,
        model: TTSModel = None,
        cloning_params: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> UnifiedTTSResult:
        """
        Synthèse vocale simple (sans clonage).

        Args:
            text: Texte à synthétiser
            language: Langue cible
            output_format: Format de sortie (mp3, wav)
            model: Modèle TTS à utiliser
            cloning_params: Paramètres de synthèse (temperature, etc.)
        """
        return await self.synthesize_with_voice(
            text=text,
            speaker_audio_path=None,
            target_language=language,
            output_format=output_format,
            model=model,
            cloning_params=cloning_params,
            **kwargs
        )

    async def get_model_status(self, model: TTSModel) -> ModelStatus:
        """Retourne le statut d'un modèle."""
        return await self.model_manager.get_model_status(model)

    async def get_all_models_status(self) -> Dict[str, ModelStatus]:
        """Retourne le statut de tous les modèles."""
        return await self.model_manager.get_all_models_status()

    def get_model_info(self, model: TTSModel = None) -> TTSModelInfo:
        """Retourne les informations sur un modèle."""
        target_model = model or self.model_manager.active_model or self.requested_model
        return TTS_MODEL_INFO[target_model]

    def get_available_models(self) -> Dict[str, TTSModelInfo]:
        """Retourne tous les modèles disponibles avec leurs infos."""
        return {model.value: info for model, info in TTS_MODEL_INFO.items()}

    def get_supported_languages(self, model: TTSModel = None) -> list:
        """Retourne les langues supportées par le modèle."""
        target_model = model or self.model_manager.active_model or self.requested_model
        return self.language_router.get_supported_languages(target_model)

    @property
    def is_ready(self) -> bool:
        """Retourne True si un modèle est chargé et prêt à synthétiser."""
        return (self.model_manager.active_backend is not None and
                self.model_manager.active_backend.is_initialized)

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service."""
        models_status = await self.get_all_models_status()

        # Infos sur le modèle actuel (si chargé)
        current_model_info = None
        if self.model_manager.active_backend:
            current_model_info = {
                "name": TTS_MODEL_INFO[self.model_manager.active_model].display_name,
                "license": TTS_MODEL_INFO[self.model_manager.active_model].license,
                "commercial_use": TTS_MODEL_INFO[self.model_manager.active_model].commercial_use,
                "quality_score": TTS_MODEL_INFO[self.model_manager.active_model].quality_score,
                "languages_count": len(TTS_MODEL_INFO[self.model_manager.active_model].languages)
            }

        return {
            "service": "UnifiedTTSService",
            "initialized": self.is_initialized,
            "is_ready": self.is_ready,
            "status": "ready" if self.is_ready else "pending",
            "current_model": self.model_manager.active_model.value if self.model_manager.active_backend else None,
            "requested_model": self.requested_model.value,
            "fallback_model": TTSModel.get_fallback().value,
            "current_model_info": current_model_info,
            "background_downloads_count": len(self.model_manager._background_downloads),
            "models_status": {
                model: {
                    "is_available": status.is_available,
                    "is_downloaded": status.is_downloaded,
                    "is_loaded": status.is_loaded,
                    "is_downloading": status.is_downloading,
                    "download_progress": status.download_progress
                }
                for model, status in models_status.items()
            },
            "disk_space_available_gb": self.model_manager.get_available_disk_space_gb(),
            "device": self.device,
            "output_dir": str(self.output_dir),
            "default_format": self.default_format
        }

    async def close(self):
        """Libère les ressources du service."""
        logger.info("[TTS] 🛑 Fermeture du service unifié")
        await self.model_manager.close()
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_tts_service() -> 'TTSService':
    """Retourne l'instance singleton du service TTS."""
    return UnifiedTTSService()


# Vérification des licences au démarrage
def check_license_compliance(model: TTSModel) -> Tuple[bool, Optional[str]]:
    """
    Vérifie la conformité de la licence pour un usage commercial.

    Returns:
        (is_commercial_ok, warning_message)
    """
    info = TTS_MODEL_INFO[model]
    return info.commercial_use, info.license_warning


# Aliases pour compatibilité
TTSService = UnifiedTTSService
TTSResult = UnifiedTTSResult
get_unified_tts_service = get_tts_service
