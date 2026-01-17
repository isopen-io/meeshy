"""
TTS Backend Base Class
======================

Interface abstraite pour tous les backends TTS.
Supporte l'intégration avec ModelManager pour une gestion centralisée.
"""

from abc import ABC, abstractmethod
from typing import Optional, Any

# Import du ModelManager pour les helpers d'intégration
from ..model_manager import (
    get_model_manager,
    get_model_paths,
    register_tts_model,
    get_tts_model,
    ModelType
)


class BaseTTSBackend(ABC):
    """Interface abstraite pour les backends TTS

    INTÉGRATION MODELMANAGER:
    Les backends peuvent utiliser les méthodes _register_model() et _get_model()
    pour s'intégrer avec le ModelManager centralisé.

    Avantages:
    - Gestion mémoire unifiée avec éviction LRU
    - Statistiques globales sur tous les modèles
    - Chemins de stockage standardisés
    """

    def __init__(self):
        self._initialized = False
        self._downloading = False
        self._download_progress = 0.0

    # ═══════════════════════════════════════════════════════════════════
    # MÉTHODES D'INTÉGRATION AVEC MODELMANAGER
    # ═══════════════════════════════════════════════════════════════════

    def _register_model(
        self,
        model_id: str,
        model_object: Any,
        backend: str,
        language: Optional[str] = None,
        priority: int = 2
    ) -> bool:
        """Enregistre un modèle dans le ModelManager centralisé.

        Args:
            model_id: ID unique (ex: "tts_mms_sw")
            model_object: L'objet modèle chargé
            backend: Type de backend (ex: "mms", "chatterbox")
            language: Code langue (pour modèles multilingues)
            priority: 1=haute (garder), 2=normale, 3=basse (évicter en premier)

        Returns:
            True si enregistré avec succès
        """
        return register_tts_model(
            model_id=model_id,
            model_object=model_object,
            backend=backend,
            language=language,
            priority=priority
        )

    def _get_model(self, model_id: str) -> Optional[Any]:
        """Récupère un modèle depuis le ModelManager.

        Args:
            model_id: ID du modèle à récupérer

        Returns:
            L'objet modèle ou None si non trouvé
        """
        return get_tts_model(model_id)

    def _has_model(self, model_id: str) -> bool:
        """Vérifie si un modèle existe dans le ModelManager.

        Args:
            model_id: ID du modèle

        Returns:
            True si le modèle est chargé
        """
        return get_model_manager().has_model(model_id)

    @abstractmethod
    async def initialize(self) -> bool:
        """Initialise le backend (charge le modèle)"""
        pass

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        **kwargs
    ) -> str:
        """Synthétise le texte et retourne le chemin du fichier audio"""
        pass

    @abstractmethod
    async def close(self):
        """Libère les ressources"""
        pass

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """Vérifie si le package Python est installé"""
        pass

    @abstractmethod
    def is_model_downloaded(self) -> bool:
        """Vérifie si le modèle est téléchargé localement"""
        pass

    @abstractmethod
    async def download_model(self) -> bool:
        """Télécharge le modèle"""
        pass

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    @property
    def is_downloading(self) -> bool:
        return self._downloading

    @property
    def download_progress(self) -> float:
        return self._download_progress
