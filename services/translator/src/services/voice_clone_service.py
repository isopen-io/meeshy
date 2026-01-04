"""
Service de clonage vocal - Singleton
Gère les modèles de voix des utilisateurs avec cache et amélioration continue.
Architecture: OpenVoice V2 pour extraction d'embedding, cache fichier pour persistance.
"""

import os
import logging
import time
import asyncio
import threading
import pickle
import json
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path

# Configuration du logging
logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
OPENVOICE_AVAILABLE = False
AUDIO_PROCESSING_AVAILABLE = False

try:
    from openvoice import se_extractor
    from openvoice.api import ToneColorConverter
    OPENVOICE_AVAILABLE = True
    logger.info("✅ [VOICE_CLONE] OpenVoice disponible")
except ImportError:
    logger.warning("⚠️ [VOICE_CLONE] OpenVoice non disponible - clonage vocal désactivé")

try:
    import numpy as np
    from pydub import AudioSegment
    import soundfile as sf
    AUDIO_PROCESSING_AVAILABLE = True
    logger.info("✅ [VOICE_CLONE] Audio processing disponible")
except ImportError:
    logger.warning("⚠️ [VOICE_CLONE] numpy/pydub/soundfile non disponibles")
    import numpy as np  # numpy should be available


@dataclass
class AudioQualityMetadata:
    """Métadonnées de qualité audio pour sélection du meilleur audio"""
    attachment_id: str
    file_path: str
    duration_ms: int = 0
    noise_level: float = 0.0  # 0 = pas de bruit, 1 = très bruité
    clarity_score: float = 1.0  # 0 = pas clair, 1 = très clair
    has_other_speakers: bool = False  # True si d'autres voix détectées
    created_at: datetime = field(default_factory=datetime.now)
    # Score global calculé pour tri
    overall_score: float = 0.0

    def calculate_overall_score(self) -> float:
        """
        Calcule un score global pour la sélection du meilleur audio.
        Critères (par ordre de priorité):
        1. Pas d'autres locuteurs (pénalité forte)
        2. Clarté élevée
        3. Bruit faible
        4. Durée longue (normalisée)
        5. Date récente (bonus léger)
        """
        score = 0.0

        # Pénalité forte si autres locuteurs détectés
        if self.has_other_speakers:
            score -= 0.5

        # Score de clarté (0-0.3)
        score += self.clarity_score * 0.3

        # Score de bruit inversé (0-0.2)
        score += (1.0 - self.noise_level) * 0.2

        # Score de durée (normalisé, max 60s = 0.3)
        duration_score = min(self.duration_ms / 60000, 1.0) * 0.3
        score += duration_score

        # Bonus récence (max 0.1 pour les audios de moins de 7 jours)
        age_days = (datetime.now() - self.created_at).days
        recency_bonus = max(0, 0.1 - (age_days * 0.01))
        score += recency_bonus

        self.overall_score = score
        return score

    def to_dict(self) -> Dict[str, Any]:
        return {
            "attachment_id": self.attachment_id,
            "file_path": self.file_path,
            "duration_ms": self.duration_ms,
            "noise_level": self.noise_level,
            "clarity_score": self.clarity_score,
            "has_other_speakers": self.has_other_speakers,
            "created_at": self.created_at.isoformat(),
            "overall_score": self.overall_score
        }


@dataclass
class VoiceModel:
    """Modèle de voix cloné d'un utilisateur"""
    user_id: str
    embedding_path: str  # Chemin vers le fichier d'embedding
    audio_count: int
    total_duration_ms: int
    quality_score: float  # 0-1
    profile_id: str = ""  # ID unique du profil vocal
    version: int = 1
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    next_recalibration_at: Optional[datetime] = None
    # Audio utilisé pour la dernière génération
    source_audio_id: str = ""  # attachment_id de l'audio source

    # Runtime only (not persisted)
    embedding: Optional[np.ndarray] = field(default=None, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire (pour JSON)"""
        return {
            "user_id": self.user_id,
            "profile_id": self.profile_id,
            "embedding_path": self.embedding_path,
            "audio_count": self.audio_count,
            "total_duration_ms": self.total_duration_ms,
            "quality_score": self.quality_score,
            "version": self.version,
            "source_audio_id": self.source_audio_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "next_recalibration_at": self.next_recalibration_at.isoformat() if self.next_recalibration_at else None
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceModel':
        """Crée depuis un dictionnaire"""
        return cls(
            user_id=data["user_id"],
            embedding_path=data["embedding_path"],
            audio_count=data["audio_count"],
            total_duration_ms=data["total_duration_ms"],
            quality_score=data["quality_score"],
            profile_id=data.get("profile_id", ""),
            version=data.get("version", 1),
            source_audio_id=data.get("source_audio_id", ""),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            next_recalibration_at=datetime.fromisoformat(data["next_recalibration_at"]) if data.get("next_recalibration_at") else None
        )


class VoiceCloneService:
    """
    Service de clonage vocal - Singleton

    Fonctionnalités:
    - Création de modèles de voix à partir d'audios
    - Cache des modèles (90 jours / 3 mois)
    - Agrégation d'audios si durée insuffisante
    - Amélioration continue des modèles
    - Recalibration trimestrielle
    - Sélection du meilleur audio (le plus long, le plus clair, sans bruit)
    """

    _instance = None
    _lock = threading.Lock()

    # Configuration
    MIN_AUDIO_DURATION_MS = 10_000  # 10 secondes minimum pour clonage de qualité
    VOICE_MODEL_MAX_AGE_DAYS = 90   # Recalibration trimestrielle (3 mois)
    MAX_AUDIO_HISTORY = 20          # Nombre max d'audios à agréger
    IMPROVEMENT_WEIGHT_OLD = 0.7    # Poids de l'ancien embedding
    IMPROVEMENT_WEIGHT_NEW = 0.3    # Poids du nouveau

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        voice_cache_dir: Optional[str] = None,
        device: str = "cpu",
        database_service = None
    ):
        if self._initialized:
            return

        # Configuration
        self.voice_cache_dir = Path(voice_cache_dir or os.getenv('VOICE_MODEL_CACHE_DIR', '/app/voice_models'))
        self.device = os.getenv('VOICE_CLONE_DEVICE', device)
        self.database_service = database_service

        # OpenVoice components
        self.tone_color_converter = None
        self.se_extractor_module = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Créer le répertoire de cache
        self.voice_cache_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"[VOICE_CLONE] Service créé: cache_dir={self.voice_cache_dir}, device={self.device}")
        self._initialized = True

    def set_database_service(self, database_service):
        """Injecte le service de base de données"""
        self.database_service = database_service

    async def initialize(self) -> bool:
        """Initialise OpenVoice pour le clonage vocal"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            if not OPENVOICE_AVAILABLE:
                logger.warning("[VOICE_CLONE] OpenVoice non disponible - mode dégradé")
                self.is_initialized = True
                return True

            try:
                start_time = time.time()
                logger.info("[VOICE_CLONE] 🔄 Initialisation d'OpenVoice...")

                # Charger dans un thread pour ne pas bloquer
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._load_openvoice)

                load_time = time.time() - start_time
                logger.info(f"[VOICE_CLONE] ✅ OpenVoice initialisé en {load_time:.2f}s")

                self.is_initialized = True
                return True

            except Exception as e:
                logger.error(f"[VOICE_CLONE] ❌ Erreur initialisation OpenVoice: {e}")
                import traceback
                traceback.print_exc()
                self.is_initialized = True  # Mode dégradé
                return True

    def _load_openvoice(self):
        """Charge OpenVoice (appelé dans un thread)"""
        checkpoints_dir = os.getenv('OPENVOICE_CHECKPOINTS', 'checkpoints/converter')
        self.tone_color_converter = ToneColorConverter(
            checkpoints_dir,
            device=self.device
        )
        self.se_extractor_module = se_extractor

    async def get_or_create_voice_model(
        self,
        user_id: str,
        current_audio_path: Optional[str] = None,
        current_audio_duration_ms: int = 0
    ) -> VoiceModel:
        """
        Récupère ou crée un modèle de voix pour un utilisateur.

        Logique:
        1. Si modèle en cache et récent → utiliser
        2. Si modèle en cache mais ancien → améliorer avec nouvel audio
        3. Si pas de modèle et audio trop court → agréger historique
        4. Créer nouveau modèle

        Args:
            user_id: ID de l'utilisateur
            current_audio_path: Audio actuel pour le clonage (optionnel)
            current_audio_duration_ms: Durée de l'audio actuel

        Returns:
            VoiceModel prêt à l'emploi
        """
        # 1. Vérifier le cache
        cached_model = await self._load_cached_model(user_id)

        if cached_model:
            age_days = (datetime.now() - cached_model.updated_at).days

            # Modèle récent → utiliser directement
            if age_days < self.VOICE_MODEL_MAX_AGE_DAYS:
                logger.info(f"[VOICE_CLONE] 📦 Modèle en cache pour {user_id} (age: {age_days}j)")

                # Charger l'embedding si pas en mémoire
                if cached_model.embedding is None:
                    cached_model = await self._load_embedding(cached_model)

                return cached_model

            # Modèle ancien → améliorer si on a un nouvel audio
            if current_audio_path:
                logger.info(f"[VOICE_CLONE] 🔄 Modèle obsolète pour {user_id}, amélioration...")
                return await self._improve_model(cached_model, current_audio_path)

            # Sinon utiliser l'ancien modèle
            logger.info(f"[VOICE_CLONE] ⚠️ Modèle obsolète pour {user_id} mais pas de nouvel audio")
            if cached_model.embedding is None:
                cached_model = await self._load_embedding(cached_model)
            return cached_model

        # 2. Pas de modèle → créer
        if not current_audio_path:
            # Essayer de récupérer l'historique audio
            audio_paths = await self._get_user_audio_history(user_id)
            if not audio_paths:
                raise ValueError(f"Aucun audio disponible pour créer le modèle de voix de {user_id}")
            current_audio_path = audio_paths[0]
            current_audio_duration_ms = await self._get_audio_duration_ms(current_audio_path)

        audio_paths = [current_audio_path]
        total_duration = current_audio_duration_ms

        # Si audio trop court, chercher l'historique
        if total_duration < self.MIN_AUDIO_DURATION_MS:
            logger.info(f"[VOICE_CLONE] ⚠️ Audio trop court ({total_duration}ms), agrégation historique...")
            historical_audios = await self._get_user_audio_history(user_id, exclude=[current_audio_path])
            audio_paths.extend(historical_audios)
            total_duration = await self._calculate_total_duration(audio_paths)

            logger.info(f"[VOICE_CLONE] 📚 {len(audio_paths)} audios agrégés, total: {total_duration}ms")

        # Créer le modèle avec ce qu'on a
        return await self._create_voice_model(user_id, audio_paths, total_duration)

    async def _create_voice_model(
        self,
        user_id: str,
        audio_paths: List[str],
        total_duration_ms: int
    ) -> VoiceModel:
        """Crée un nouveau modèle de voix à partir des audios"""
        import uuid as uuid_module
        start_time = time.time()
        logger.info(f"[VOICE_CLONE] 🎤 Création modèle pour {user_id} ({len(audio_paths)} audios)")

        # Filtrer les audios valides
        valid_paths = [p for p in audio_paths if os.path.exists(p)]
        if not valid_paths:
            raise ValueError("Aucun fichier audio valide trouvé")

        # Concaténer les audios si multiples
        if len(valid_paths) > 1:
            combined_audio = await self._concatenate_audios(valid_paths, user_id)
        else:
            combined_audio = valid_paths[0]

        # Générer un profile_id unique
        profile_id = uuid_module.uuid4().hex[:12]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Créer le dossier utilisateur: {voice_cache_dir}/{user_id}/
        user_dir = self.voice_cache_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)

        # Extraire l'embedding de voix
        embedding = await self._extract_voice_embedding(combined_audio, user_dir)

        # Calculer score de qualité
        quality_score = self._calculate_quality_score(total_duration_ms, len(valid_paths))

        # Chemin de l'embedding avec nouvelle convention: {userId}_{profileId}_{timestamp}.pkl
        embedding_filename = f"{user_id}_{profile_id}_{timestamp}.pkl"
        embedding_path = str(user_dir / embedding_filename)

        # Créer le modèle
        model = VoiceModel(
            user_id=user_id,
            embedding_path=embedding_path,
            audio_count=len(valid_paths),
            total_duration_ms=total_duration_ms,
            quality_score=quality_score,
            profile_id=profile_id,
            version=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            next_recalibration_at=datetime.now() + timedelta(days=self.VOICE_MODEL_MAX_AGE_DAYS),
            embedding=embedding
        )

        # Sauvegarder
        await self._save_model_to_cache(model)

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(f"[VOICE_CLONE] ✅ Modèle créé pour {user_id}: quality={quality_score:.2f}, time={processing_time}ms")

        return model

    async def _improve_model(
        self,
        existing_model: VoiceModel,
        new_audio_path: str
    ) -> VoiceModel:
        """Améliore un modèle existant avec un nouvel audio"""
        logger.info(f"[VOICE_CLONE] 🔄 Amélioration modèle pour {existing_model.user_id}")

        # Charger l'embedding existant
        if existing_model.embedding is None:
            existing_model = await self._load_embedding(existing_model)

        # Extraire embedding du nouvel audio
        user_dir = self.voice_cache_dir / existing_model.user_id / "temp"
        user_dir.mkdir(parents=True, exist_ok=True)

        new_embedding = await self._extract_voice_embedding(new_audio_path, user_dir)

        if existing_model.embedding is not None and new_embedding is not None:
            # Moyenne pondérée (plus de poids aux anciens pour stabilité)
            improved_embedding = (
                self.IMPROVEMENT_WEIGHT_OLD * existing_model.embedding +
                self.IMPROVEMENT_WEIGHT_NEW * new_embedding
            )
        else:
            improved_embedding = new_embedding if new_embedding is not None else existing_model.embedding

        # Mettre à jour le modèle
        existing_model.embedding = improved_embedding
        existing_model.updated_at = datetime.now()
        existing_model.audio_count += 1
        existing_model.quality_score = min(1.0, existing_model.quality_score + 0.05)
        existing_model.version += 1
        existing_model.next_recalibration_at = datetime.now() + timedelta(days=self.VOICE_MODEL_MAX_AGE_DAYS)

        # Sauvegarder
        await self._save_model_to_cache(existing_model)

        logger.info(f"[VOICE_CLONE] ✅ Modèle amélioré pour {existing_model.user_id} (v{existing_model.version})")
        return existing_model

    async def _extract_voice_embedding(self, audio_path: str, target_dir: Path) -> Optional[np.ndarray]:
        """Extrait l'embedding de voix d'un fichier audio"""
        if not OPENVOICE_AVAILABLE or self.se_extractor_module is None:
            logger.warning("[VOICE_CLONE] OpenVoice non disponible, embedding factice")
            return np.zeros(256)  # Embedding factice

        try:
            loop = asyncio.get_event_loop()
            embedding = await loop.run_in_executor(
                None,
                lambda: self.se_extractor_module.get_se(
                    audio_path,
                    self.tone_color_converter,
                    target_dir=str(target_dir)
                )
            )
            return embedding
        except Exception as e:
            logger.error(f"[VOICE_CLONE] ❌ Erreur extraction embedding: {e}")
            return np.zeros(256)

    async def _concatenate_audios(self, audio_paths: List[str], user_id: str) -> str:
        """Concatène plusieurs fichiers audio en un seul"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return audio_paths[0]  # Retourner le premier si pas de processing

        try:
            combined = AudioSegment.empty()
            for path in audio_paths:
                try:
                    audio = AudioSegment.from_file(path)
                    combined += audio
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE] Impossible de lire {path}: {e}")

            # Sauvegarder le fichier combiné
            output_path = self.voice_cache_dir / user_id / "combined_audio.wav"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            combined.export(str(output_path), format="wav")

            return str(output_path)

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur concaténation: {e}")
            return audio_paths[0]

    async def _get_user_audio_history(
        self,
        user_id: str,
        exclude: Optional[List[str]] = None,
        limit: int = None
    ) -> List[str]:
        """
        Récupère l'historique des messages audio d'un utilisateur.
        Utilise la base de données pour trouver les attachements audio.
        """
        limit = limit or self.MAX_AUDIO_HISTORY
        exclude = exclude or []

        if not self.database_service:
            logger.warning("[VOICE_CLONE] Database service non disponible")
            return []

        try:
            # Requête pour récupérer les audios de l'utilisateur
            attachments = await self.database_service.prisma.messageattachment.find_many(
                where={
                    "message": {
                        "senderId": user_id
                    },
                    "mimeType": {
                        "startswith": "audio/"
                    }
                },
                order={"createdAt": "desc"},
                take=limit
            )

            # Filtrer les fichiers existants
            audio_paths = []
            for att in attachments:
                if att.filePath and att.filePath not in exclude and os.path.exists(att.filePath):
                    audio_paths.append(att.filePath)

            logger.info(f"[VOICE_CLONE] 📚 {len(audio_paths)} audios historiques trouvés pour {user_id}")
            return audio_paths

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur récupération historique: {e}")
            return []

    async def _get_best_audio_for_cloning(
        self,
        user_id: str,
        limit: int = 10
    ) -> Optional[AudioQualityMetadata]:
        """
        Sélectionne le meilleur audio pour le clonage vocal.
        Critères (par ordre de priorité):
        1. Le plus long
        2. Le plus clair (sans bruit)
        3. Sans autres locuteurs
        4. Le plus récent

        Returns:
            AudioQualityMetadata du meilleur audio, ou None si aucun audio trouvé
        """
        if not self.database_service:
            logger.warning("[VOICE_CLONE] Database service non disponible")
            return None

        try:
            # Requête pour récupérer les audios avec métadonnées de qualité
            attachments = await self.database_service.prisma.messageattachment.find_many(
                where={
                    "message": {
                        "senderId": user_id
                    },
                    "mimeType": {
                        "startswith": "audio/"
                    }
                },
                order={"createdAt": "desc"},
                take=limit
            )

            if not attachments:
                return None

            # Convertir en AudioQualityMetadata et calculer les scores
            quality_audios: List[AudioQualityMetadata] = []
            for att in attachments:
                if att.filePath and os.path.exists(att.filePath):
                    duration_ms = await self._get_audio_duration_ms(att.filePath)

                    # Extraire les métadonnées de qualité si disponibles
                    # Ces champs doivent être ajoutés au schéma Prisma de MessageAttachment
                    noise_level = getattr(att, 'noiseLevel', 0.0) or 0.0
                    clarity_score = getattr(att, 'clarityScore', 1.0) or 1.0
                    has_other_speakers = getattr(att, 'hasOtherSpeakers', False) or False

                    audio_meta = AudioQualityMetadata(
                        attachment_id=att.id,
                        file_path=att.filePath,
                        duration_ms=duration_ms,
                        noise_level=noise_level,
                        clarity_score=clarity_score,
                        has_other_speakers=has_other_speakers,
                        created_at=att.createdAt if hasattr(att, 'createdAt') else datetime.now()
                    )
                    audio_meta.calculate_overall_score()
                    quality_audios.append(audio_meta)

            if not quality_audios:
                return None

            # Trier par score décroissant et retourner le meilleur
            quality_audios.sort(key=lambda x: x.overall_score, reverse=True)
            best_audio = quality_audios[0]

            logger.info(
                f"[VOICE_CLONE] 🎯 Meilleur audio sélectionné pour {user_id}: "
                f"id={best_audio.attachment_id}, duration={best_audio.duration_ms}ms, "
                f"score={best_audio.overall_score:.2f}"
            )
            return best_audio

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur sélection meilleur audio: {e}")
            return None

    async def _calculate_total_duration(self, audio_paths: List[str]) -> int:
        """Calcule la durée totale de plusieurs fichiers audio"""
        total = 0
        for path in audio_paths:
            duration = await self._get_audio_duration_ms(path)
            total += duration
        return total

    async def _get_audio_duration_ms(self, audio_path: str) -> int:
        """Récupère la durée d'un fichier audio en millisecondes"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return 0

        try:
            import librosa
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            return int(duration * 1000)
        except Exception as e:
            logger.warning(f"[VOICE_CLONE] Impossible de lire la durée de {audio_path}: {e}")
            return 0

    def _calculate_quality_score(self, duration_ms: int, audio_count: int) -> float:
        """
        Calcule un score de qualité basé sur la durée et le nombre d'audios.

        - 0-10s: 0.3 (faible)
        - 10-30s: 0.5 (moyen)
        - 30-60s: 0.7 (bon)
        - 60s+: 0.9 (excellent)
        - Bonus: +0.05 par audio supplémentaire (max +0.1)
        """
        if duration_ms < 10_000:
            base_score = 0.3
        elif duration_ms < 30_000:
            base_score = 0.5
        elif duration_ms < 60_000:
            base_score = 0.7
        else:
            base_score = 0.9

        audio_bonus = min(0.1, (audio_count - 1) * 0.05)
        return min(1.0, base_score + audio_bonus)

    async def _load_cached_model(self, user_id: str) -> Optional[VoiceModel]:
        """Charge un modèle depuis le cache fichier: {voice_cache_dir}/{user_id}/metadata.json"""
        metadata_path = self.voice_cache_dir / user_id / "metadata.json"

        if not metadata_path.exists():
            return None

        try:
            with open(metadata_path, 'r') as f:
                data = json.load(f)
            return VoiceModel.from_dict(data)
        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur chargement cache {user_id}: {e}")
            return None

    async def _load_embedding(self, model: VoiceModel) -> VoiceModel:
        """Charge l'embedding d'un modèle depuis le fichier pickle"""
        try:
            with open(model.embedding_path, 'rb') as f:
                model.embedding = pickle.load(f)
        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur chargement embedding: {e}")
            model.embedding = np.zeros(256)
        return model

    async def _save_model_to_cache(self, model: VoiceModel):
        """Sauvegarde un modèle dans le cache fichier: {voice_cache_dir}/{user_id}/"""
        user_dir = self.voice_cache_dir / model.user_id
        user_dir.mkdir(parents=True, exist_ok=True)

        # Sauvegarder les métadonnées: {user_id}/metadata.json
        metadata_path = user_dir / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(model.to_dict(), f, indent=2)

        # Sauvegarder l'embedding: {user_id}/{userId}_{profileId}_{timestamp}.pkl
        if model.embedding is not None:
            with open(model.embedding_path, 'wb') as f:
                pickle.dump(model.embedding, f)

        logger.info(f"[VOICE_CLONE] 💾 Modèle sauvegardé: {user_dir}")

    async def schedule_quarterly_recalibration(self):
        """
        Tâche planifiée pour recalibrer les modèles de voix trimestriellement (tous les 3 mois).
        À exécuter via un cron job ou un scheduler.
        Sélectionne le meilleur audio: le plus long, le plus clair, sans bruit, le plus récent.
        """
        logger.info("[VOICE_CLONE] 🔄 Démarrage recalibration trimestrielle...")

        # Lister tous les modèles en cache
        all_models = await self._list_all_cached_models()

        recalibrated = 0
        for model in all_models:
            if model.next_recalibration_at and datetime.now() >= model.next_recalibration_at:
                logger.info(f"[VOICE_CLONE] 🔄 Recalibration pour {model.user_id}")

                # Sélectionner le meilleur audio basé sur les critères de qualité
                best_audio = await self._get_best_audio_for_cloning(model.user_id)

                if best_audio:
                    # Utiliser le meilleur audio pour régénérer le modèle
                    await self._create_voice_model(
                        model.user_id,
                        [best_audio.file_path],
                        best_audio.duration_ms
                    )
                    recalibrated += 1
                    logger.info(
                        f"[VOICE_CLONE] ✅ Modèle recalibré pour {model.user_id} "
                        f"avec audio {best_audio.attachment_id} (score: {best_audio.overall_score:.2f})"
                    )
                else:
                    # Fallback: utiliser l'historique audio classique
                    recent_audios = await self._get_user_audio_history(model.user_id)
                    if recent_audios:
                        total_duration = await self._calculate_total_duration(recent_audios)
                        await self._create_voice_model(
                            model.user_id,
                            recent_audios,
                            total_duration
                        )
                        recalibrated += 1

        logger.info(f"[VOICE_CLONE] ✅ Recalibration trimestrielle terminée: {recalibrated} modèles mis à jour")

    async def _list_all_cached_models(self) -> List[VoiceModel]:
        """Liste tous les modèles en cache: parcourt {voice_cache_dir}/{user_id}/"""
        models = []
        for user_dir in self.voice_cache_dir.iterdir():
            if user_dir.is_dir():
                model = await self._load_cached_model(user_dir.name)
                if model:
                    models.append(model)
        return models

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        all_models = await self._list_all_cached_models()
        return {
            "service": "VoiceCloneService",
            "initialized": self.is_initialized,
            "openvoice_available": OPENVOICE_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "cache_dir": str(self.voice_cache_dir),
            "device": self.device,
            "cached_models_count": len(all_models),
            "min_audio_duration_ms": self.MIN_AUDIO_DURATION_MS,
            "max_age_days": self.VOICE_MODEL_MAX_AGE_DAYS
        }

    async def close(self):
        """Libère les ressources"""
        logger.info("[VOICE_CLONE] 🛑 Fermeture du service")
        self.tone_color_converter = None
        self.se_extractor_module = None
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_voice_clone_service() -> VoiceCloneService:
    """Retourne l'instance singleton du service de clonage vocal"""
    return VoiceCloneService()
