"""
Model Manager - Gestion centralisée des modèles TTS
====================================================

Responsabilités:
- Chargement/déchargement des modèles en mémoire
- Téléchargement en arrière-plan
- Vérification de disponibilité locale
- Gestion du cache et de l'espace disque
- Device management (CPU/GPU)
"""

import os
import logging
import asyncio
import shutil
from typing import Optional, Dict
from pathlib import Path
from dataclasses import dataclass

from ..tts import (
    BaseTTSBackend,
    ChatterboxBackend,
    MMSBackend,
    VITSBackend,
    XTTSBackend,
    HiggsAudioBackend,
)

logger = logging.getLogger(__name__)


@dataclass
class ModelStatus:
    """Statut d'un modèle"""
    model: 'TTSModel'
    is_available: bool          # Package Python installé
    is_downloaded: bool         # Modèle téléchargé localement
    is_loaded: bool             # Modèle chargé en mémoire
    is_downloading: bool        # Téléchargement en cours
    download_progress: float    # Progression du téléchargement (0-100)
    error: Optional[str] = None


class ModelManager:
    """
    Gestionnaire centralisé des modèles TTS.

    Gère le cycle de vie complet des modèles:
    - Création des backends
    - Vérification de disponibilité
    - Téléchargement (prioritaire et arrière-plan)
    - Chargement en mémoire
    - Libération des ressources
    """

    # Espace disque minimum requis pour télécharger un modèle (en GB)
    MIN_DISK_SPACE_GB = 2.0

    def __init__(self, device: str = "auto", models_path: Path = None):
        """
        Initialise le gestionnaire de modèles.

        Args:
            device: Device pour les modèles (cpu, cuda, auto)
            models_path: Chemin où stocker les modèles
        """
        self.device = device
        self.models_path = models_path or Path.home() / ".cache" / "meeshy" / "models"

        # Backends instanciés (pas forcément chargés)
        self.backends: Dict['TTSModel', BaseTTSBackend] = {}

        # Backend actuellement actif (chargé en mémoire)
        self.active_backend: Optional[BaseTTSBackend] = None
        self.active_model: Optional['TTSModel'] = None

        # Téléchargements en arrière-plan
        self._background_downloads: Dict['TTSModel', asyncio.Task] = {}

        # NOUVEAU: Events pour signaler qu'un modèle est prêt
        self._model_ready_event = asyncio.Event()
        self._download_failed = False
        self._download_error: Optional[str] = None

        logger.info(f"[ModelManager] Initialisé: device={device}, path={self.models_path}")

    def create_backend(self, model: 'TTSModel') -> BaseTTSBackend:
        """
        Crée le backend approprié pour le modèle.

        Args:
            model: Type de modèle TTS

        Returns:
            Instance du backend correspondant

        Raises:
            RuntimeError: Si le package Python requis n'est pas installé
        """
        from .models import TTSModel

        if model == TTSModel.CHATTERBOX:
            backend = ChatterboxBackend(device=self.device, turbo=False)
        elif model == TTSModel.CHATTERBOX_TURBO:
            backend = ChatterboxBackend(device=self.device, turbo=True)
        elif model == TTSModel.HIGGS_AUDIO_V2:
            backend = HiggsAudioBackend(device=self.device)
        elif model == TTSModel.XTTS_V2:
            backend = XTTSBackend(device=self.device)
        elif model == TTSModel.MMS:
            backend = MMSBackend(device=self.device)
        elif model == TTSModel.VITS:
            backend = VITSBackend(device=self.device)
        else:
            raise ValueError(f"Modèle inconnu: {model}")

        # NOUVEAU: Vérifier que le package est installé
        if not backend.is_available:
            install_cmd = self._get_install_command(model)
            raise RuntimeError(
                f"Package Python requis non installé pour {model.value}. "
                f"Installez avec : pip install {install_cmd}"
            )

        return backend

    def get_backend(self, model: 'TTSModel') -> BaseTTSBackend:
        """
        Récupère ou crée le backend pour un modèle.

        Args:
            model: Type de modèle TTS

        Returns:
            Backend correspondant
        """
        if model not in self.backends:
            self.backends[model] = self.create_backend(model)
        return self.backends[model]

    async def get_model_status(self, model: 'TTSModel') -> ModelStatus:
        """
        Retourne le statut complet d'un modèle.

        Args:
            model: Type de modèle TTS

        Returns:
            Statut détaillé du modèle
        """
        backend = self.get_backend(model)

        return ModelStatus(
            model=model,
            is_available=backend.is_available,
            is_downloaded=backend.is_model_downloaded(),
            is_loaded=backend.is_initialized,
            is_downloading=backend.is_downloading,
            download_progress=backend.download_progress
        )

    async def get_all_models_status(self) -> Dict[str, ModelStatus]:
        """
        Retourne le statut de tous les modèles.

        Returns:
            Dict avec le statut de chaque modèle
        """
        from .models import TTSModel

        statuses = {}
        for model in TTSModel:
            statuses[model.value] = await self.get_model_status(model)
        return statuses

    async def get_available_backends(self) -> list:
        """
        Retourne la liste des backends TTS dont les packages sont installés.

        Returns:
            Liste des TTSModel disponibles (packages installés)
        """
        from .models import TTSModel

        available = []

        for model in TTSModel:
            backend = self.get_backend(model)
            if backend.is_available:
                available.append(model)

        logger.debug(f"[ModelManager] Backends disponibles: {[m.value for m in available]}")
        return available

    async def wait_for_download_start(self, timeout: float = 10.0):
        """
        Attend qu'un téléchargement démarre.
        Utilisé pour vérifier que le téléchargement en arrière-plan fonctionne.

        Args:
            timeout: Timeout en secondes

        Raises:
            asyncio.TimeoutError: Si aucun téléchargement ne démarre
        """
        start_time = asyncio.get_event_loop().time()

        while asyncio.get_event_loop().time() - start_time < timeout:
            # Vérifier si un backend est en téléchargement
            for backend in self.backends.values():
                if backend.is_downloading:
                    logger.debug("[ModelManager] Téléchargement détecté")
                    return

            # Vérifier si un modèle a été chargé
            if self.active_backend:
                logger.debug("[ModelManager] Modèle chargé détecté")
                return

            await asyncio.sleep(0.5)

        raise asyncio.TimeoutError("Aucun téléchargement n'a démarré")

    async def wait_for_model_ready(self, timeout: float = 120.0) -> bool:
        """
        Attend qu'un modèle soit prêt ou que le téléchargement échoue.

        Args:
            timeout: Timeout en secondes

        Returns:
            True si un modèle est prêt, False si échec

        Raises:
            asyncio.TimeoutError: Si timeout atteint
            RuntimeError: Si le téléchargement échoue
        """
        try:
            await asyncio.wait_for(self._model_ready_event.wait(), timeout=timeout)

            if self._download_failed:
                raise RuntimeError(self._download_error or "Téléchargement TTS échoué")

            return self.active_backend is not None

        except asyncio.TimeoutError:
            raise RuntimeError(
                f"Timeout après {timeout}s. "
                "Le téléchargement TTS n'a pas abouti. "
                "Vérifiez la connexion internet et l'espace disque."
            )

    def get_available_disk_space_gb(self) -> float:
        """
        Retourne l'espace disque disponible en GB.

        Returns:
            Espace disponible en GB
        """
        try:
            total, used, free = shutil.disk_usage(self.models_path)
            return free / (1024 ** 3)
        except Exception:
            return 0.0

    def can_download_model(self, model: 'TTSModel') -> bool:
        """
        Vérifie si on peut télécharger un modèle (espace disque suffisant).

        Args:
            model: Type de modèle TTS

        Returns:
            True si l'espace est suffisant
        """
        from .models import TTS_MODEL_INFO

        model_info = TTS_MODEL_INFO[model]
        available_space = self.get_available_disk_space_gb()
        required_space = model_info.model_size_gb + self.MIN_DISK_SPACE_GB

        if available_space < required_space:
            logger.warning(
                f"[ModelManager] Espace insuffisant pour {model.value}: "
                f"{available_space:.2f}GB disponible, {required_space:.2f}GB requis"
            )
            return False

        return True

    async def find_local_model(self, preferred: 'TTSModel') -> Optional['TTSModel']:
        """
        Cherche un modèle disponible localement.

        Priorité:
        1. Le modèle préféré
        2. Chatterbox (fallback par défaut)
        3. Chatterbox Turbo
        4. Tout autre modèle disponible

        Args:
            preferred: Modèle préféré

        Returns:
            Premier modèle trouvé localement, ou None
        """
        from .models import TTSModel

        # Ordre de priorité
        priority_order = [
            preferred,
            TTSModel.CHATTERBOX,
            TTSModel.CHATTERBOX_TURBO,
            TTSModel.HIGGS_AUDIO_V2,
            TTSModel.XTTS_V2
        ]

        # Supprimer les doublons tout en gardant l'ordre
        seen = set()
        priority_order = [m for m in priority_order if not (m in seen or seen.add(m))]

        for model in priority_order:
            backend = self.get_backend(model)

            if backend.is_available and backend.is_model_downloaded():
                logger.info(f"[ModelManager] ✅ Modèle local trouvé: {model.value}")
                return model

        logger.warning("[ModelManager] ⚠️ Aucun modèle disponible localement")
        return None

    async def load_model(self, model: 'TTSModel', show_license_warning: bool = True) -> bool:
        """
        Charge un modèle en mémoire.

        Args:
            model: Type de modèle TTS
            show_license_warning: Afficher l'alerte de licence si nécessaire

        Returns:
            True si le chargement a réussi
        """
        from .models import TTS_MODEL_INFO

        backend = self.get_backend(model)
        model_info = TTS_MODEL_INFO[model]

        # Afficher l'alerte de licence si nécessaire
        if show_license_warning and model_info.license_warning:
            logger.warning(model_info.license_warning)
            print(f"\n{model_info.license_warning}\n")

        logger.info(f"[ModelManager] 🔄 Chargement du modèle {model.value}...")

        try:
            success = await backend.initialize()

            if success:
                self.active_backend = backend
                self.active_model = model
                logger.info(f"[ModelManager] ✅ Modèle {model.value} chargé avec succès")
                return True
            else:
                logger.error(f"[ModelManager] ❌ Échec du chargement de {model.value}")
                return False

        except Exception as e:
            logger.error(f"[ModelManager] ❌ Erreur lors du chargement de {model.value}: {e}")
            return False

    async def download_model(self, model: 'TTSModel') -> bool:
        """
        Télécharge un modèle (bloquant).

        Args:
            model: Type de modèle TTS

        Returns:
            True si le téléchargement a réussi
        """
        backend = self.get_backend(model)

        if not backend.is_available:
            logger.warning(f"[ModelManager] Package {model.value} non disponible")
            return False

        if backend.is_model_downloaded():
            logger.info(f"[ModelManager] {model.value} déjà téléchargé")
            return True

        if not self.can_download_model(model):
            logger.warning(f"[ModelManager] Espace disque insuffisant pour {model.value}")
            return False

        logger.info(f"[ModelManager] 📥 Téléchargement de {model.value}...")

        try:
            success = await backend.download_model()

            if success:
                logger.info(f"[ModelManager] ✅ {model.value} téléchargé avec succès")
            else:
                logger.warning(f"[ModelManager] ❌ Échec du téléchargement de {model.value}")

            return success

        except Exception as e:
            logger.error(f"[ModelManager] ❌ Erreur téléchargement {model.value}: {e}")
            return False

    async def download_and_load_first_available(self, preferred: 'TTSModel'):
        """
        Télécharge et charge le premier modèle disponible.
        Utilisé quand aucun modèle n'est disponible localement.

        Args:
            preferred: Modèle préféré
        """
        from .models import TTSModel

        # NOUVEAU: Vérifier l'espace disque global d'abord
        available_space = self.get_available_disk_space_gb()
        if available_space < self.MIN_DISK_SPACE_GB:
            error_msg = (
                f"Espace disque insuffisant: {available_space:.2f}GB disponible, "
                f"au moins {self.MIN_DISK_SPACE_GB}GB requis"
            )
            logger.error(f"[ModelManager] ❌ {error_msg}")
            self._download_failed = True
            self._download_error = error_msg
            self._model_ready_event.set()
            return

        # Priorité: modèle demandé, puis Chatterbox
        models_to_try = [preferred]
        if preferred != TTSModel.CHATTERBOX:
            models_to_try.append(TTSModel.CHATTERBOX)

        for model in models_to_try:
            backend = self.get_backend(model)

            if not backend.is_available:
                logger.warning(f"[ModelManager] Package {model.value} non disponible, skip")
                continue

            if not self.can_download_model(model):
                logger.warning(f"[ModelManager] Espace disque insuffisant pour {model.value}, skip")
                continue

            logger.info(f"[ModelManager] 📥 Téléchargement prioritaire de {model.value}...")

            try:
                success = await self.download_model(model)

                if success:
                    # Charger le modèle après téléchargement
                    load_success = await self.load_model(model)

                    if load_success:
                        logger.info(f"[ModelManager] ✅ Premier modèle prêt: {model.value}")
                        # NOUVEAU: Signaler que le modèle est prêt
                        self._model_ready_event.set()
                        return

            except Exception as e:
                logger.error(f"[ModelManager] ❌ Erreur téléchargement {model.value}: {e}")
                continue

        # NOUVEAU: Signaler l'échec
        self._download_failed = True
        self._download_error = "Impossible de télécharger/charger un modèle TTS"
        self._model_ready_event.set()  # Débloquer les attentes
        logger.error("[ModelManager] ❌ Impossible de télécharger/charger un modèle TTS!")

    async def download_models_background(self, preferred: 'TTSModel'):
        """
        Télécharge les modèles en arrière-plan si espace disponible.

        Priorité de téléchargement:
        1. Le modèle préféré (s'il n'est pas celui chargé)
        2. Chatterbox (fallback)
        3. Autres modèles

        Args:
            preferred: Modèle préféré
        """
        from .models import TTSModel

        await asyncio.sleep(5)  # Attendre que le service soit stable

        # Ordre de priorité pour les téléchargements
        priority_order = [preferred, TTSModel.CHATTERBOX, TTSModel.CHATTERBOX_TURBO]

        # Ajouter les autres modèles
        for m in TTSModel:
            if m not in priority_order:
                priority_order.append(m)

        for model in priority_order:
            # Skip le modèle actuellement chargé
            if model == self.active_model:
                continue

            # Vérifier si déjà en téléchargement
            if model in self._background_downloads:
                continue

            backend = self.get_backend(model)

            # Vérifier si le modèle est déjà téléchargé
            if backend.is_model_downloaded():
                logger.debug(f"[ModelManager] {model.value} déjà téléchargé, skip")
                continue

            # Vérifier si le package est disponible
            if not backend.is_available:
                logger.debug(f"[ModelManager] Package {model.value} non disponible, skip")
                continue

            # Vérifier l'espace disque
            if not self.can_download_model(model):
                logger.info(f"[ModelManager] Espace insuffisant pour télécharger {model.value} en arrière-plan")
                continue

            # Lancer le téléchargement en arrière-plan
            logger.info(f"[ModelManager] 📥 Téléchargement de {model.value} en arrière-plan...")

            async def download_task(m: 'TTSModel', b: BaseTTSBackend):
                try:
                    await b.download_model()
                    logger.info(f"[ModelManager] ✅ {m.value} téléchargé avec succès (arrière-plan)")
                except Exception as e:
                    logger.warning(f"[ModelManager] Erreur téléchargement arrière-plan {m.value}: {e}")
                finally:
                    if m in self._background_downloads:
                        del self._background_downloads[m]

            task = asyncio.create_task(download_task(model, backend))
            self._background_downloads[model] = task

            # Attendre un peu entre chaque téléchargement pour éviter surcharge
            await asyncio.sleep(30)

    def _get_install_command(self, model: 'TTSModel') -> str:
        """Retourne la commande pip pour installer le package requis."""
        from .models import TTSModel

        install_commands = {
            TTSModel.CHATTERBOX: "chatterbox-tts",
            TTSModel.CHATTERBOX_TURBO: "chatterbox-tts",
            TTSModel.HIGGS_AUDIO_V2: "higgs-audio",
            TTSModel.XTTS_V2: "TTS",
            TTSModel.MMS: "transformers[torch]",
            TTSModel.VITS: "vits",
        }

        return install_commands.get(model, "chatterbox-tts")

    async def close(self):
        """Libère les ressources de tous les backends."""
        logger.info("[ModelManager] 🛑 Fermeture du gestionnaire de modèles")

        # Annuler les téléchargements en cours
        for task in self._background_downloads.values():
            task.cancel()
        self._background_downloads.clear()

        # Fermer tous les backends
        for backend in self.backends.values():
            await backend.close()

        self.backends.clear()
        self.active_backend = None
        self.active_model = None
