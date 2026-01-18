"""
Module de gestion de cache pour les profils vocaux.
Gère le stockage et la récupération des modèles de voix depuis Redis.
"""

import os
import logging
import base64
from typing import Optional, List, Dict, Any
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np

from services.redis_service import AudioCacheService
from .voice_metadata import VoiceModel
from .voice_fingerprint import VoiceFingerprint
from models.voice_models import VoiceCharacteristics

logger = logging.getLogger(__name__)


class VoiceCloneCacheManager:
    """
    Gestionnaire de cache pour les modèles de voix.

    Fonctionnalités:
    - Chargement/sauvegarde des modèles depuis/vers Redis
    - Conversion profil cache/DB ↔ VoiceModel
    - Gestion des embeddings (encodage base64)
    - Listing des modèles en cache
    - Statistiques de cache
    """

    def __init__(
        self,
        audio_cache: AudioCacheService,
        voice_cache_dir: Path
    ):
        """
        Initialise le gestionnaire de cache.

        Args:
            audio_cache: Service de cache Redis
            voice_cache_dir: Répertoire local pour les embeddings
        """
        self.audio_cache = audio_cache
        self.voice_cache_dir = voice_cache_dir

    async def load_cached_model(self, user_id: str) -> Optional[VoiceModel]:
        """
        Charge un modèle vocal depuis le cache Redis.

        Architecture: Redis est utilisé comme cache, Gateway gère la persistance MongoDB.

        Args:
            user_id: ID de l'utilisateur

        Returns:
            VoiceModel si trouvé en cache, None sinon
        """
        try:
            cached_profile = await self.audio_cache.get_voice_profile(user_id)

            if cached_profile:
                model = self._cache_profile_to_voice_model(cached_profile)
                logger.debug(f"[VOICE_CLONE_CACHE] Modèle chargé depuis cache Redis: {user_id}")
                return model
        except Exception as e:
            logger.warning(f"[VOICE_CLONE_CACHE] Erreur lecture cache Redis pour {user_id}: {e}")

        return None

    def db_profile_to_voice_model(self, db_profile: Dict[str, Any]) -> VoiceModel:
        """
        Convertit un profil MongoDB en VoiceModel.

        Args:
            db_profile: Profil vocal depuis MongoDB

        Returns:
            VoiceModel reconstruit
        """
        model = VoiceModel(
            user_id=db_profile["userId"],
            embedding_path="",
            audio_count=db_profile.get("audioCount", 1),
            total_duration_ms=db_profile.get("totalDurationMs", 0),
            quality_score=db_profile.get("qualityScore", 0.5),
            profile_id=db_profile.get("profileId", ""),
            version=db_profile.get("version", 1),
            source_audio_id="",
            created_at=datetime.fromisoformat(db_profile["createdAt"]) if db_profile.get("createdAt") else datetime.now(),
            updated_at=datetime.fromisoformat(db_profile["updatedAt"]) if db_profile.get("updatedAt") else datetime.now(),
            next_recalibration_at=datetime.fromisoformat(db_profile["nextRecalibrationAt"]) if db_profile.get("nextRecalibrationAt") else None
        )

        if db_profile.get("voiceCharacteristics"):
            vc_data = db_profile["voiceCharacteristics"]
            model.voice_characteristics = VoiceCharacteristics(
                pitch_mean_hz=vc_data.get("pitch", {}).get("mean_hz", 0),
                pitch_std_hz=vc_data.get("pitch", {}).get("std_hz", 0),
                pitch_min_hz=vc_data.get("pitch", {}).get("min_hz", 0),
                pitch_max_hz=vc_data.get("pitch", {}).get("max_hz", 0),
                voice_type=vc_data.get("classification", {}).get("voice_type", "unknown"),
                estimated_gender=vc_data.get("classification", {}).get("estimated_gender", "unknown"),
                estimated_age_range=vc_data.get("classification", {}).get("estimated_age_range", "unknown"),
                brightness=vc_data.get("spectral", {}).get("brightness", 0),
                warmth=vc_data.get("spectral", {}).get("warmth", 0),
                breathiness=vc_data.get("spectral", {}).get("breathiness", 0),
                nasality=vc_data.get("spectral", {}).get("nasality", 0),
                speech_rate_wpm=vc_data.get("prosody", {}).get("speech_rate_wpm", 0),
                energy_mean=vc_data.get("prosody", {}).get("energy_mean", 0),
                energy_std=vc_data.get("prosody", {}).get("energy_std", 0),
                silence_ratio=vc_data.get("prosody", {}).get("silence_ratio", 0),
            )

        if db_profile.get("fingerprint"):
            model.fingerprint = VoiceFingerprint.from_dict(db_profile["fingerprint"])

        return model

    def _cache_profile_to_voice_model(self, cached_profile: Dict[str, Any]) -> VoiceModel:
        """
        Convertit un profil du cache Redis en VoiceModel.

        Args:
            cached_profile: Profil vocal depuis Redis

        Returns:
            VoiceModel reconstruit avec embedding décodé
        """
        model = VoiceModel(
            user_id=cached_profile["userId"],
            embedding_path="",
            audio_count=cached_profile.get("audioCount", 1),
            total_duration_ms=cached_profile.get("totalDurationMs", 0),
            quality_score=cached_profile.get("qualityScore", 0.5),
            profile_id=cached_profile.get("profileId", ""),
            version=cached_profile.get("version", 1),
            source_audio_id="",
            created_at=datetime.fromisoformat(cached_profile["createdAt"]) if cached_profile.get("createdAt") else datetime.now(),
            updated_at=datetime.fromisoformat(cached_profile["updatedAt"]) if cached_profile.get("updatedAt") else datetime.now(),
            next_recalibration_at=datetime.fromisoformat(cached_profile["nextRecalibrationAt"]) if cached_profile.get("nextRecalibrationAt") else None
        )

        # Charger l'embedding encodé en base64
        if cached_profile.get("embeddingBase64"):
            try:
                embedding_bytes = base64.b64decode(cached_profile["embeddingBase64"])
                model.embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
            except Exception as e:
                logger.warning(f"[VOICE_CLONE_CACHE] Erreur décodage embedding base64: {e}")

        if cached_profile.get("voiceCharacteristics"):
            vc_data = cached_profile["voiceCharacteristics"]
            model.voice_characteristics = VoiceCharacteristics(
                pitch_mean_hz=vc_data.get("pitch", {}).get("mean_hz", 0),
                pitch_std_hz=vc_data.get("pitch", {}).get("std_hz", 0),
                pitch_min_hz=vc_data.get("pitch", {}).get("min_hz", 0),
                pitch_max_hz=vc_data.get("pitch", {}).get("max_hz", 0),
                voice_type=vc_data.get("classification", {}).get("voice_type", "unknown"),
                estimated_gender=vc_data.get("classification", {}).get("estimated_gender", "unknown"),
                estimated_age_range=vc_data.get("classification", {}).get("estimated_age_range", "unknown"),
                brightness=vc_data.get("spectral", {}).get("brightness", 0),
                warmth=vc_data.get("spectral", {}).get("warmth", 0),
                breathiness=vc_data.get("spectral", {}).get("breathiness", 0),
                nasality=vc_data.get("spectral", {}).get("nasality", 0),
                speech_rate_wpm=vc_data.get("prosody", {}).get("speech_rate_wpm", 0),
                energy_mean=vc_data.get("prosody", {}).get("energy_mean", 0),
                energy_std=vc_data.get("prosody", {}).get("energy_std", 0),
                silence_ratio=vc_data.get("prosody", {}).get("silence_ratio", 0),
            )

        if cached_profile.get("fingerprint"):
            model.fingerprint = VoiceFingerprint.from_dict(cached_profile["fingerprint"])

        return model

    async def load_embedding(self, model: VoiceModel) -> VoiceModel:
        """
        Charge l'embedding d'un modèle depuis le cache Redis.

        L'embedding est stocké encodé en base64 dans le cache Redis.
        Architecture: Redis = cache, Gateway = persistance MongoDB.

        Args:
            model: Modèle vocal dont on veut charger l'embedding

        Returns:
            Modèle avec embedding chargé
        """
        # L'embedding est déjà chargé par _cache_profile_to_voice_model si disponible
        if model.embedding is not None and len(model.embedding) > 0:
            return model

        # Fallback: essayer de recharger depuis le cache
        try:
            cached_profile = await self.audio_cache.get_voice_profile(model.user_id)
            if cached_profile and cached_profile.get("embeddingBase64"):
                embedding_bytes = base64.b64decode(cached_profile["embeddingBase64"])
                model.embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
                logger.debug(f"[VOICE_CLONE_CACHE] Embedding chargé depuis cache Redis: {model.user_id}")
                return model
        except Exception as e:
            logger.warning(f"[VOICE_CLONE_CACHE] Erreur lecture embedding depuis cache Redis: {e}")

        # Default: embedding vide
        model.embedding = np.zeros(256, dtype=np.float32)
        return model

    async def save_model_to_cache(self, model: VoiceModel):
        """
        Sauvegarde un modèle vocal dans le cache Redis.

        Stocke l'embedding encodé en base64 + métadonnées JSON.

        ═══════════════════════════════════════════════════════════════════════
        ARCHITECTURE:
        Redis = cache pour accès rapide aux profils vocaux
        Gateway = responsable de la persistance MongoDB
        Le Translator met en cache pour réutiliser les embeddings existants.
        ═══════════════════════════════════════════════════════════════════════

        Args:
            model: Modèle vocal à sauvegarder
        """
        try:
            # Encoder l'embedding en base64 pour stockage JSON
            embedding_b64 = None
            if model.embedding is not None:
                embedding_bytes = model.embedding.astype(np.float32).tobytes()
                embedding_b64 = base64.b64encode(embedding_bytes).decode('utf-8')

            voice_chars_dict = model.voice_characteristics.to_dict() if model.voice_characteristics else None
            fingerprint_dict = model.fingerprint.to_dict() if model.fingerprint else None

            cache_profile = {
                "userId": model.user_id,
                "profileId": model.profile_id or "",
                "embeddingBase64": embedding_b64,
                "embeddingModel": "openvoice_v2",
                "embeddingDimension": len(model.embedding) if model.embedding is not None else 256,
                "audioCount": model.audio_count,
                "totalDurationMs": model.total_duration_ms,
                "qualityScore": model.quality_score,
                "version": model.version,
                "voiceCharacteristics": voice_chars_dict,
                "fingerprint": fingerprint_dict,
                "signatureShort": model.fingerprint.signature_short if model.fingerprint else None,
                "createdAt": model.created_at.isoformat() if model.created_at else datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat(),
                "nextRecalibrationAt": model.next_recalibration_at.isoformat() if model.next_recalibration_at else None,
            }

            await self.audio_cache.set_voice_profile(model.user_id, cache_profile)
            logger.info(f"[VOICE_CLONE_CACHE] Modèle sauvegardé dans cache Redis: {model.user_id}")

        except Exception as e:
            logger.error(f"[VOICE_CLONE_CACHE] Erreur sauvegarde cache Redis: {e}")

    async def schedule_quarterly_recalibration(
        self,
        get_best_audio_callback,
        get_audio_history_callback,
        create_model_callback,
        max_age_days: int = 90
    ):
        """
        Tâche planifiée pour recalibrer les modèles de voix trimestriellement (tous les 3 mois).
        À exécuter via un cron job ou un scheduler.
        Sélectionne le meilleur audio: le plus long, le plus clair, sans bruit, le plus récent.

        Args:
            get_best_audio_callback: Callback pour récupérer le meilleur audio d'un utilisateur
            get_audio_history_callback: Callback pour récupérer l'historique audio
            create_model_callback: Callback pour créer un nouveau modèle
            max_age_days: Âge maximum avant recalibration (défaut: 90 jours)
        """
        logger.info("[VOICE_CLONE_CACHE] 🔄 Démarrage recalibration trimestrielle...")

        # Lister tous les modèles en cache
        all_models = await self.list_all_cached_models()

        recalibrated = 0
        for model in all_models:
            if model.next_recalibration_at and datetime.now() >= model.next_recalibration_at:
                logger.info(f"[VOICE_CLONE_CACHE] 🔄 Recalibration pour {model.user_id}")

                # Sélectionner le meilleur audio basé sur les critères de qualité
                best_audio = await get_best_audio_callback(model.user_id)

                if best_audio:
                    # Utiliser le meilleur audio pour régénérer le modèle
                    await create_model_callback(
                        model.user_id,
                        [best_audio.file_path],
                        best_audio.duration_ms
                    )
                    recalibrated += 1
                    logger.info(
                        f"[VOICE_CLONE_CACHE] ✅ Modèle recalibré pour {model.user_id} "
                        f"avec audio {best_audio.attachment_id} (score: {best_audio.overall_score:.2f})"
                    )
                else:
                    # Fallback: utiliser l'historique audio classique
                    recent_audios = await get_audio_history_callback(model.user_id)
                    if recent_audios:
                        # Calculer durée totale
                        try:
                            from pydub import AudioSegment
                            total_duration = 0
                            for audio_path in recent_audios:
                                try:
                                    audio = AudioSegment.from_file(audio_path)
                                    total_duration += len(audio)
                                except Exception:
                                    pass

                            await create_model_callback(
                                model.user_id,
                                recent_audios,
                                total_duration
                            )
                            recalibrated += 1
                        except Exception as e:
                            logger.warning(f"[VOICE_CLONE_CACHE] Erreur recalibration {model.user_id}: {e}")

        logger.info(f"[VOICE_CLONE_CACHE] ✅ Recalibration trimestrielle terminée: {recalibrated} modèles mis à jour")

    async def list_all_cached_models(self) -> List[VoiceModel]:
        """
        Liste tous les modèles vocaux depuis le cache Redis.

        Note: Cette méthode ne charge pas les embeddings pour des raisons de performance.
        Utiliser load_embedding() si l'embedding est nécessaire.

        Returns:
            Liste de tous les modèles en cache
        """
        models = []

        try:
            # Lister toutes les clés de profils vocaux
            profile_keys = await self.audio_cache.redis.keys("voice:profile:*")

            for key in profile_keys:
                try:
                    data = await self.audio_cache.redis.get(key)
                    if data:
                        import json
                        cached_profile = json.loads(data)
                        model = self._cache_profile_to_voice_model(cached_profile)
                        models.append(model)
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE_CACHE] Erreur lecture profil {key}: {e}")

        except Exception as e:
            logger.error(f"[VOICE_CLONE_CACHE] Erreur listing modèles Redis: {e}")

        return models

    async def get_stats(self) -> Dict[str, Any]:
        """
        Retourne les statistiques du cache.

        Returns:
            Dictionnaire contenant:
            - models_count: Nombre de modèles en cache
            - cache_available: Si le cache Redis est disponible
            - cache_type: Type de stockage (Redis)
        """
        models_count = 0
        cache_available = False

        try:
            cache_stats = self.audio_cache.get_stats()
            cache_available = cache_stats.get("redis_available", False) or cache_stats.get("memory_entries", 0) > 0

            # Compter les modèles en cache
            profile_keys = await self.audio_cache.redis.keys("voice:profile:*")
            models_count = len(profile_keys)
        except Exception as e:
            logger.warning(f"[VOICE_CLONE_CACHE] Erreur comptage modèles: {e}")

        return {
            "models_count": models_count,
            "cache_available": cache_available,
            "cache_type": "Redis",
            "cache_dir": str(self.voice_cache_dir)
        }
