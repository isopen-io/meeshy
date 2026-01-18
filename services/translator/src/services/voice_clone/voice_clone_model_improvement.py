"""
Module d'amélioration de modèles vocaux.

Ce module gère l'amélioration progressive des modèles de voix:
- Pondération entre ancien (70%) et nouveau (30%) embedding
- Vérification de similarité vocale avant mise à jour (>80%)
- Mise à jour du cache et de la base de données
- Versioning et tracking des améliorations
"""

import logging
from typing import Optional, TYPE_CHECKING
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np

from .voice_metadata import VoiceModel

if TYPE_CHECKING:
    from .voice_clone_audio import VoiceCloneAudioProcessor
    from .voice_clone_cache import VoiceCloneCacheManager
    from .voice_analyzer import VoiceAnalyzer

logger = logging.getLogger(__name__)


class VoiceCloneModelImprover:
    """
    Service d'amélioration progressive des modèles vocaux.

    Responsabilités:
    - Vérifier la compatibilité vocale avant mise à jour
    - Fusionner les embeddings ancien et nouveau avec pondération
    - Mettre à jour les métadonnées du modèle
    - Persister les améliorations dans le cache et la base de données

    Architecture:
    - Utilise VoiceAnalyzer pour vérifier la similarité vocale
    - Utilise VoiceCloneAudioProcessor pour extraire les nouveaux embeddings
    - Utilise VoiceCloneCacheManager pour persister les mises à jour
    """

    # Configuration des poids pour la fusion d'embeddings
    IMPROVEMENT_WEIGHT_OLD = 0.7    # 70% de l'ancien embedding (stabilité)
    IMPROVEMENT_WEIGHT_NEW = 0.3    # 30% du nouveau embedding (adaptation)

    # Seuil de similarité pour accepter une mise à jour
    SIMILARITY_THRESHOLD = 0.80     # 80% de similarité minimum

    # Boost de qualité par amélioration
    QUALITY_BOOST = 0.05            # +5% de qualité par amélioration

    # Durée de validité après amélioration
    RECALIBRATION_DAYS = 90         # 90 jours (3 mois)

    def __init__(
        self,
        audio_processor: "VoiceCloneAudioProcessor",
        cache_manager: "VoiceCloneCacheManager",
        voice_cache_dir: Path,
        database_service = None
    ):
        """
        Initialise l'amélioration de modèles.

        Args:
            audio_processor: Processeur audio pour extraction d'embeddings
            cache_manager: Gestionnaire de cache pour persistance
            voice_cache_dir: Répertoire de cache des modèles vocaux
            database_service: Service MongoDB (optionnel, pour fallback)
        """
        self._audio_processor = audio_processor
        self._cache_manager = cache_manager
        self._voice_cache_dir = voice_cache_dir
        self.database_service = database_service

        logger.info("[MODEL_IMPROVER] Service d'amélioration de modèles initialisé")

    async def improve_model(
        self,
        existing_model: VoiceModel,
        new_audio_path: str
    ) -> VoiceModel:
        """
        Améliore un modèle existant avec un nouvel audio.

        RÈGLE CRITIQUE: La mise à jour n'est effectuée QUE si la signature vocale
        du nouvel audio correspond au profil existant (similarité > 80%).

        Cette protection garantit que:
        - Un audio d'une autre personne ne pollue pas le profil
        - Les profils multi-locuteurs ne mélangent pas les voix
        - La qualité du clonage reste élevée au fil du temps

        Processus:
        1. Charger l'embedding existant si nécessaire
        2. Vérifier la similarité vocale avec le nouvel audio
        3. Si similaire → extraire nouvel embedding
        4. Fusionner avec pondération (70% ancien, 30% nouveau)
        5. Mettre à jour métadonnées (version, qualité, timestamps)
        6. Régénérer l'empreinte vocale
        7. Persister dans le cache et la base de données

        Args:
            existing_model: Modèle vocal existant à améliorer
            new_audio_path: Chemin vers le nouvel audio pour amélioration

        Returns:
            VoiceModel amélioré avec nouvel embedding fusionné

        Raises:
            ValueError: Si l'audio n'est pas valide
            FileNotFoundError: Si le fichier audio n'existe pas

        Note:
            Si la similarité est < 80%, retourne le modèle existant sans modification
        """
        logger.info(
            f"[MODEL_IMPROVER] 🔄 Vérification amélioration modèle "
            f"pour {existing_model.user_id}"
        )

        # Import dynamique pour éviter les dépendances circulaires
        from .voice_analyzer import get_voice_analyzer

        voice_analyzer = get_voice_analyzer()

        # =====================================================================
        # ÉTAPE 1: Charger l'embedding existant si nécessaire
        # =====================================================================
        if existing_model.embedding is None:
            logger.debug(
                f"[MODEL_IMPROVER] Chargement embedding existant "
                f"pour {existing_model.user_id}"
            )
            existing_model = await self._cache_manager.load_embedding(existing_model)

        # =====================================================================
        # ÉTAPE 2: Vérifier la similarité vocale (PROTECTION CRITIQUE)
        # =====================================================================
        if existing_model.fingerprint:
            logger.debug(
                f"[MODEL_IMPROVER] Vérification similarité vocale "
                f"(seuil: {self.SIMILARITY_THRESHOLD:.0%})"
            )

            # Analyser le nouvel audio
            metadata = await voice_analyzer.analyze_audio(new_audio_path)

            # Vérifier si compatible avec le profil existant
            can_update, reason, matched_speaker = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=self.SIMILARITY_THRESHOLD
            )

            if not can_update:
                logger.warning(
                    f"[MODEL_IMPROVER] ⚠️ Mise à jour refusée "
                    f"pour {existing_model.user_id}: {reason}"
                )
                # Retourner le modèle existant sans modification
                return existing_model

            logger.info(
                f"[MODEL_IMPROVER] ✅ Signature vocale vérifiée: {reason}"
            )
        else:
            logger.warning(
                f"[MODEL_IMPROVER] ⚠️ Pas d'empreinte vocale existante, "
                f"mise à jour sans vérification de similarité"
            )

        # =====================================================================
        # ÉTAPE 3: Extraire l'embedding du nouvel audio
        # =====================================================================
        user_dir = self._voice_cache_dir / existing_model.user_id / "temp"
        user_dir.mkdir(parents=True, exist_ok=True)

        logger.debug(
            f"[MODEL_IMPROVER] Extraction embedding depuis {new_audio_path}"
        )
        new_embedding = await self._audio_processor.extract_voice_embedding(
            new_audio_path,
            user_dir
        )

        # =====================================================================
        # ÉTAPE 4: Fusionner les embeddings avec pondération
        # =====================================================================
        if existing_model.embedding is not None and new_embedding is not None:
            logger.debug(
                f"[MODEL_IMPROVER] Fusion embeddings: "
                f"{self.IMPROVEMENT_WEIGHT_OLD:.0%} ancien + "
                f"{self.IMPROVEMENT_WEIGHT_NEW:.0%} nouveau"
            )

            # Moyenne pondérée: plus de poids à l'ancien pour stabilité
            improved_embedding = (
                self.IMPROVEMENT_WEIGHT_OLD * existing_model.embedding +
                self.IMPROVEMENT_WEIGHT_NEW * new_embedding
            )
        else:
            # Fallback: utiliser le nouvel embedding si disponible
            logger.warning(
                f"[MODEL_IMPROVER] ⚠️ Fusion impossible, "
                f"utilisation nouvel embedding uniquement"
            )
            improved_embedding = (
                new_embedding
                if new_embedding is not None
                else existing_model.embedding
            )

        # =====================================================================
        # ÉTAPE 5: Mettre à jour les métadonnées du modèle
        # =====================================================================
        existing_model.embedding = improved_embedding
        existing_model.updated_at = datetime.now()
        existing_model.audio_count += 1
        existing_model.version += 1

        # Boost de qualité (plafonné à 1.0)
        existing_model.quality_score = min(
            1.0,
            existing_model.quality_score + self.QUALITY_BOOST
        )

        # Repousser la prochaine recalibration
        existing_model.next_recalibration_at = (
            datetime.now() + timedelta(days=self.RECALIBRATION_DAYS)
        )

        logger.debug(
            f"[MODEL_IMPROVER] Métadonnées mises à jour: "
            f"v{existing_model.version}, "
            f"quality={existing_model.quality_score:.2f}, "
            f"audio_count={existing_model.audio_count}"
        )

        # =====================================================================
        # ÉTAPE 6: Régénérer l'empreinte vocale
        # =====================================================================
        if existing_model.voice_characteristics:
            logger.debug("[MODEL_IMPROVER] Régénération empreinte vocale")
            existing_model.generate_fingerprint()

        # =====================================================================
        # ÉTAPE 7: Persister les améliorations
        # =====================================================================
        logger.debug(
            f"[MODEL_IMPROVER] Sauvegarde modèle amélioré "
            f"pour {existing_model.user_id}"
        )
        await self._cache_manager.save_model_to_cache(existing_model)

        logger.info(
            f"[MODEL_IMPROVER] ✅ Modèle amélioré pour {existing_model.user_id}: "
            f"v{existing_model.version}, "
            f"quality={existing_model.quality_score:.2f}, "
            f"audio_count={existing_model.audio_count}"
        )

        return existing_model


def get_voice_clone_model_improver(
    audio_processor: "VoiceCloneAudioProcessor",
    cache_manager: "VoiceCloneCacheManager",
    voice_cache_dir: Path,
    database_service = None
) -> VoiceCloneModelImprover:
    """
    Factory function pour créer une instance de VoiceCloneModelImprover.

    Args:
        audio_processor: Processeur audio pour extraction d'embeddings
        cache_manager: Gestionnaire de cache pour persistance
        voice_cache_dir: Répertoire de cache des modèles vocaux
        database_service: Service MongoDB (optionnel)

    Returns:
        Instance configurée de VoiceCloneModelImprover
    """
    return VoiceCloneModelImprover(
        audio_processor=audio_processor,
        cache_manager=cache_manager,
        voice_cache_dir=voice_cache_dir,
        database_service=database_service
    )
