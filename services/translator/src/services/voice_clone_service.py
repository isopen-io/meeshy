"""
Service de clonage vocal - Singleton
Gère les modèles de voix des utilisateurs avec cache et amélioration continue.
Architecture: OpenVoice V2 pour extraction d'embedding, cache fichier pour persistance.
Fonctionne sur CPU, CUDA, et MPS (Apple Silicon).
"""

import os
import logging
import time
import asyncio
import threading
import pickle
import json
import hashlib
import struct
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path

# Import settings for centralized configuration
from config.settings import get_settings

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

# Import PerformanceOptimizer for device detection
try:
    from utils.performance import get_performance_optimizer
    PERF_OPTIMIZER_AVAILABLE = True
except ImportError:
    PERF_OPTIMIZER_AVAILABLE = False
    logger.debug("[VOICE_CLONE] PerformanceOptimizer not available, using manual device selection")

# Import Redis cache service for voice profile caching
import base64
from services.redis_service import get_audio_cache_service, AudioCacheService

# Import unified voice models
from models.voice_models import VoiceCharacteristics

# Import voice clone modules (refactored from this file)
from services.voice_clone.voice_fingerprint import VoiceFingerprint
from services.voice_clone.voice_metadata import (
    SpeakerInfo,
    RecordingMetadata,
    AudioQualityMetadata,
    VoiceModel,
    TemporaryVoiceProfile,
    MultiSpeakerTranslationContext
)
from services.voice_clone.voice_analyzer import VoiceAnalyzer, get_voice_analyzer


# NOTE: Les classes suivantes ont été déplacées vers services/voice_clone/:
# - VoiceFingerprint → voice_fingerprint.py
# - SpeakerInfo, RecordingMetadata, AudioQualityMetadata → voice_metadata.py
# - VoiceModel, TemporaryVoiceProfile, MultiSpeakerTranslationContext → voice_metadata.py
# - VoiceAnalyzer, get_voice_analyzer → voice_analyzer.py

# Les définitions originales ont été supprimées ci-dessous.
# Elles sont maintenant importées depuis les modules refactorisés.


# ==============================================================================
# VoiceCloneService - Service principal de clonage vocal
# ==============================================================================
# TODO: Refactoriser cette classe en modules plus petits (~400L chacun):
# - voice_clone_init.py: Initialisation et configuration
# - voice_clone_model.py: Création et amélioration de modèles
# - voice_clone_cache.py: Gestion de cache et stockage
# - voice_clone_audio.py: Opérations audio et multi-locuteurs
# ==============================================================================


# Classes refactorisées importées ci-dessus depuis services/voice_clone/
# Anciennes définitions supprimées (1392 lignes)


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
        device: str = "auto",
        database_service = None
    ):
        if self._initialized:
            return

        # Load centralized settings
        self._settings = get_settings()

        # Configuration - utiliser le chemin centralisé des settings
        self.voice_cache_dir = Path(voice_cache_dir or os.getenv('VOICE_MODEL_CACHE_DIR', self._settings.voice_models_path))

        # Device detection: Use PerformanceOptimizer if available, else fallback to settings
        env_device = os.getenv('VOICE_CLONE_DEVICE', self._settings.voice_clone_device)
        if env_device == "auto" and PERF_OPTIMIZER_AVAILABLE:
            perf_opt = get_performance_optimizer()
            self.device = perf_opt.device
            logger.info(f"[VOICE_CLONE] Device auto-detected: {self.device}")
        else:
            # Manual device selection or explicit device specified
            self.device = env_device if env_device != "auto" else "cpu"

        # Service de persistance MongoDB (optionnel, pour fallback)
        self.database_service = database_service

        # Service de cache Redis pour les profils vocaux
        self._audio_cache: Optional[AudioCacheService] = None

        # OpenVoice components
        self.tone_color_converter = None
        self.se_extractor_module = None

        # Etat
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Repertoire temporaire pour fichiers audio
        self.voice_cache_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"[VOICE_CLONE] Service cree: device={self.device}, models_path={self._settings.models_path}")
        self._initialized = True

    def set_database_service(self, database_service):
        """Injecte le service de base de donnees MongoDB (optionnel, fallback)"""
        self.database_service = database_service

    def _get_audio_cache(self) -> AudioCacheService:
        """Retourne le service de cache audio Redis (lazy init)"""
        if self._audio_cache is None:
            self._audio_cache = get_audio_cache_service(self._settings)
        return self._audio_cache

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
        # Utiliser le chemin centralisé depuis settings
        checkpoints_dir = self._settings.openvoice_checkpoints_path
        logger.info(f"[VOICE_CLONE] Chargement OpenVoice depuis {checkpoints_dir}")

        # Chemins des fichiers requis (OpenVoice V2 les met dans converter/)
        checkpoints_path = Path(checkpoints_dir)
        converter_path = checkpoints_path / "converter"
        config_path = converter_path / "config.json"
        checkpoint_path = converter_path / "checkpoint.pth"

        # Télécharger les checkpoints OpenVoice V2 s'ils n'existent pas
        if not config_path.exists() or not checkpoint_path.exists():
            logger.info("[VOICE_CLONE] 📥 Téléchargement des checkpoints OpenVoice V2...")
            self._download_openvoice_checkpoints(checkpoints_path)

        # Vérifier que les fichiers existent maintenant
        if not config_path.exists():
            raise FileNotFoundError(f"OpenVoice config.json non trouvé: {config_path}")

        # ToneColorConverter attend le chemin vers config.json, pas le répertoire
        self.tone_color_converter = ToneColorConverter(
            str(config_path),
            device=self.device
        )

        # Charger le checkpoint
        if checkpoint_path.exists():
            self.tone_color_converter.load_ckpt(str(checkpoint_path))
            logger.info(f"[VOICE_CLONE] ✅ Checkpoint chargé: {checkpoint_path}")

        self.se_extractor_module = se_extractor

    def _download_openvoice_checkpoints(self, checkpoints_path: Path):
        """Télécharge les checkpoints OpenVoice V2 depuis MyShell S3"""
        import zipfile
        import urllib.request
        import tempfile

        OPENVOICE_V2_URL = "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/checkpoints_v2_0417.zip"

        checkpoints_path.mkdir(parents=True, exist_ok=True)

        try:
            # Télécharger le zip
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_file:
                tmp_path = tmp_file.name
                logger.info(f"[VOICE_CLONE] Téléchargement depuis {OPENVOICE_V2_URL}...")
                urllib.request.urlretrieve(OPENVOICE_V2_URL, tmp_path)

            # Extraire le zip
            logger.info(f"[VOICE_CLONE] Extraction vers {checkpoints_path}...")
            with zipfile.ZipFile(tmp_path, 'r') as zip_ref:
                # Le zip contient un dossier checkpoints_v2/, on extrait son contenu
                for member in zip_ref.namelist():
                    # Retirer le préfixe "checkpoints_v2/" du chemin
                    if member.startswith("checkpoints_v2/"):
                        target_path = member[len("checkpoints_v2/"):]
                        if target_path:  # Ignorer le dossier racine
                            source = zip_ref.read(member)
                            dest_path = checkpoints_path / target_path
                            dest_path.parent.mkdir(parents=True, exist_ok=True)
                            if not member.endswith('/'):  # C'est un fichier
                                dest_path.write_bytes(source)

            # Nettoyer
            Path(tmp_path).unlink(missing_ok=True)
            logger.info("[VOICE_CLONE] ✅ Checkpoints OpenVoice V2 téléchargés")

        except Exception as e:
            logger.error(f"[VOICE_CLONE] ❌ Erreur téléchargement checkpoints: {e}")
            raise

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

    async def create_voice_model_from_gateway_profile(
        self,
        profile_data: Dict[str, Any],
        user_id: str
    ) -> Optional[VoiceModel]:
        """
        Crée un VoiceModel à partir du profil vocal reçu de Gateway.

        Cette méthode permet à Gateway d'envoyer un profil vocal existant
        (par exemple celui de l'émetteur original d'un message transféré)
        sans que Translator ait besoin d'accéder à MongoDB.

        Args:
            profile_data: Données du profil vocal envoyées par Gateway:
                - profileId: str - ID unique du profil
                - userId: str - ID de l'utilisateur propriétaire du profil
                - embedding: str - Embedding Base64 encoded (numpy array)
                - qualityScore: float - Score de qualité 0-1
                - fingerprint: Dict - Empreinte vocale (optionnel)
                - voiceCharacteristics: Dict - Caractéristiques vocales (optionnel)
                - version: int - Version du profil
                - audioCount: int - Nombre d'audios agrégés
                - totalDurationMs: int - Durée totale des audios

            user_id: ID de l'utilisateur (pour logs)

        Returns:
            VoiceModel prêt à l'emploi, ou None si échec
        """
        if not profile_data:
            logger.warning(f"[VOICE_CLONE] ⚠️ Pas de profil fourni par Gateway pour {user_id}")
            return None

        try:
            logger.info(f"[VOICE_CLONE] 📦 Création VoiceModel depuis profil Gateway pour {user_id}")

            # Décoder l'embedding Base64
            import base64
            embedding_base64 = profile_data.get('embedding')
            if not embedding_base64:
                logger.error(f"[VOICE_CLONE] ❌ Embedding manquant dans le profil Gateway")
                return None

            embedding_bytes = base64.b64decode(embedding_base64)
            embedding = np.frombuffer(embedding_bytes, dtype=np.float32)

            logger.info(f"[VOICE_CLONE] ✅ Embedding décodé: shape={embedding.shape}")

            # Créer les caractéristiques vocales si fournies
            voice_characteristics = None
            voice_chars_data = profile_data.get('voiceCharacteristics')
            if voice_chars_data:
                try:
                    voice_characteristics = VoiceCharacteristics(
                        pitch_mean_hz=voice_chars_data.get('pitch_mean_hz', 0),
                        pitch_std_hz=voice_chars_data.get('pitch_std_hz', 0),
                        pitch_range_hz=voice_chars_data.get('pitch_range_hz', (0, 0)),
                        estimated_gender=voice_chars_data.get('estimated_gender', 'unknown'),
                        speaking_rate_wpm=voice_chars_data.get('speaking_rate_wpm', 0),
                        spectral_centroid_hz=voice_chars_data.get('spectral_centroid_hz', 0),
                        spectral_bandwidth_hz=voice_chars_data.get('spectral_bandwidth_hz', 0),
                        energy_mean=voice_chars_data.get('energy_mean', 0),
                        energy_std=voice_chars_data.get('energy_std', 0),
                        mfcc_signature=voice_chars_data.get('mfcc_signature'),
                        formants_hz=voice_chars_data.get('formants_hz'),
                        jitter_percent=voice_chars_data.get('jitter_percent'),
                        shimmer_percent=voice_chars_data.get('shimmer_percent'),
                        confidence=voice_chars_data.get('confidence', 0.8)
                    )
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE] ⚠️ Impossible de recréer VoiceCharacteristics: {e}")

            # Créer l'empreinte vocale si fournie
            fingerprint = None
            fingerprint_data = profile_data.get('fingerprint')
            if fingerprint_data:
                try:
                    fingerprint = VoiceFingerprint(
                        fingerprint_id=fingerprint_data.get('fingerprint_id', ''),
                        signature=fingerprint_data.get('signature', ''),
                        signature_short=fingerprint_data.get('signature_short', ''),
                        audio_duration_ms=fingerprint_data.get('audio_duration_ms', 0),
                        created_at=datetime.fromisoformat(fingerprint_data.get('created_at', datetime.now().isoformat()))
                    )
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE] ⚠️ Impossible de recréer VoiceFingerprint: {e}")

            # Créer un dossier temporaire pour l'embedding (nécessaire pour TTS)
            profile_user_id = profile_data.get('userId', user_id)
            user_dir = self.voice_cache_dir / profile_user_id
            user_dir.mkdir(parents=True, exist_ok=True)

            profile_id = profile_data.get('profileId', f"vfp_{profile_user_id[:8]}")
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            embedding_filename = f"{profile_user_id}_{profile_id}_{timestamp}_gateway.pkl"
            embedding_path = str(user_dir / embedding_filename)

            # Sauvegarder l'embedding dans un fichier temporaire (pickle déjà utilisé dans le service)
            with open(embedding_path, 'wb') as f:
                pickle.dump(embedding, f)

            logger.info(f"[VOICE_CLONE] 💾 Embedding sauvegardé: {embedding_path}")

            # Créer le VoiceModel
            model = VoiceModel(
                user_id=profile_user_id,
                embedding_path=embedding_path,
                audio_count=profile_data.get('audioCount', 1),
                total_duration_ms=profile_data.get('totalDurationMs', 0),
                quality_score=profile_data.get('qualityScore', 0.8),
                profile_id=profile_id,
                version=profile_data.get('version', 1),
                created_at=datetime.now(),
                updated_at=datetime.now(),
                embedding=embedding,
                voice_characteristics=voice_characteristics,
                fingerprint=fingerprint
            )

            logger.info(
                f"[VOICE_CLONE] ✅ VoiceModel créé depuis Gateway: "
                f"user={profile_user_id}, quality={model.quality_score:.2f}, "
                f"profile_id={profile_id}"
            )

            return model

        except Exception as e:
            logger.error(f"[VOICE_CLONE] ❌ Erreur création VoiceModel depuis Gateway: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _create_voice_model(
        self,
        user_id: str,
        audio_paths: List[str],
        total_duration_ms: int
    ) -> VoiceModel:
        """
        Crée un nouveau modèle de voix à partir des audios.

        IMPORTANT: Extrait uniquement les segments du locuteur principal
        pour garantir que le clonage ne concerne que sa voix.
        """
        import uuid as uuid_module
        start_time = time.time()
        logger.info(f"[VOICE_CLONE] 🎤 Création modèle pour {user_id} ({len(audio_paths)} audios)")

        # Filtrer les audios valides
        valid_paths = [p for p in audio_paths if os.path.exists(p)]
        if not valid_paths:
            raise ValueError("Aucun fichier audio valide trouvé")

        # Créer le dossier utilisateur: {voice_cache_dir}/{user_id}/
        user_dir = self.voice_cache_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)

        # =====================================================================
        # EXTRACTION DU LOCUTEUR PRINCIPAL UNIQUEMENT
        # Pour chaque audio, extraire uniquement les segments du locuteur principal
        # =====================================================================
        voice_analyzer = get_voice_analyzer()
        extracted_paths = []
        primary_voice_chars = None
        recording_metadata = None

        for audio_path in valid_paths:
            try:
                # Extraire uniquement les segments du locuteur principal
                extracted_path, metadata = await voice_analyzer.extract_primary_speaker_audio(
                    audio_path,
                    output_path=str(user_dir / f"primary_{os.path.basename(audio_path)}"),
                    min_segment_duration_ms=100
                )
                extracted_paths.append(extracted_path)

                # Conserver les caractéristiques vocales du premier locuteur principal
                if primary_voice_chars is None and metadata.primary_speaker:
                    primary_voice_chars = metadata.primary_speaker.voice_characteristics
                    recording_metadata = metadata
                    logger.info(
                        f"[VOICE_CLONE] Locuteur principal détecté: "
                        f"gender={primary_voice_chars.estimated_gender}, "
                        f"pitch={primary_voice_chars.pitch_mean_hz:.1f}Hz"
                    )

            except Exception as e:
                logger.warning(f"[VOICE_CLONE] Erreur extraction locuteur principal: {e}")
                # Fallback: utiliser l'audio complet
                extracted_paths.append(audio_path)

        # Recalculer la durée totale après extraction
        extracted_duration_ms = 0
        for path in extracted_paths:
            extracted_duration_ms += await self._get_audio_duration_ms(path)

        logger.info(
            f"[VOICE_CLONE] Audio extrait: {extracted_duration_ms}ms "
            f"(original: {total_duration_ms}ms, {len(extracted_paths)} fichiers)"
        )

        # Concaténer les audios extraits si multiples
        if len(extracted_paths) > 1:
            combined_audio = await self._concatenate_audios(extracted_paths, user_id)
        else:
            combined_audio = extracted_paths[0]

        # Générer un profile_id unique
        profile_id = uuid_module.uuid4().hex[:12]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Extraire l'embedding de voix (du locuteur principal uniquement)
        embedding = await self._extract_voice_embedding(combined_audio, user_dir)

        # Calculer score de qualité
        quality_score = self._calculate_quality_score(extracted_duration_ms, len(valid_paths))

        # Chemin de l'embedding avec nouvelle convention: {userId}_{profileId}_{timestamp}.pkl
        embedding_filename = f"{user_id}_{profile_id}_{timestamp}.pkl"
        embedding_path = str(user_dir / embedding_filename)

        # Créer le modèle avec les caractéristiques vocales du locuteur principal
        model = VoiceModel(
            user_id=user_id,
            embedding_path=embedding_path,
            audio_count=len(valid_paths),
            total_duration_ms=extracted_duration_ms,  # Durée extraite, pas originale
            quality_score=quality_score,
            profile_id=profile_id,
            version=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            next_recalibration_at=datetime.now() + timedelta(days=self.VOICE_MODEL_MAX_AGE_DAYS),
            embedding=embedding,
            voice_characteristics=primary_voice_chars  # Caractéristiques du locuteur principal
        )

        # Générer l'empreinte vocale unique
        if model.voice_characteristics or model.embedding is not None:
            fingerprint = model.generate_fingerprint()
            if fingerprint:
                logger.info(f"[VOICE_CLONE] Empreinte vocale: {fingerprint.fingerprint_id}")

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
        """
        Améliore un modèle existant avec un nouvel audio.

        RÈGLE: La mise à jour n'est effectuée QUE si la signature vocale
        du nouvel audio correspond au profil existant (similarité > 80%).
        """
        logger.info(f"[VOICE_CLONE] 🔄 Vérification amélioration modèle pour {existing_model.user_id}")

        voice_analyzer = get_voice_analyzer()

        # Charger l'embedding existant si nécessaire
        if existing_model.embedding is None:
            existing_model = await self._load_embedding(existing_model)

        # Vérifier si la signature correspond avant mise à jour
        if existing_model.fingerprint:
            metadata = await voice_analyzer.analyze_audio(new_audio_path)
            can_update, reason, matched_speaker = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=0.80
            )

            if not can_update:
                logger.warning(
                    f"[VOICE_CLONE] ⚠️ Mise à jour refusée pour {existing_model.user_id}: {reason}"
                )
                # Retourner le modèle existant sans modification
                return existing_model

            logger.info(f"[VOICE_CLONE] ✅ Signature vocale vérifiée: {reason}")

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

        # Régénérer l'empreinte vocale avec le nouvel embedding
        if existing_model.voice_characteristics:
            existing_model.generate_fingerprint()

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
            # get_se retourne un tuple (embedding, audio_name)
            result = await loop.run_in_executor(
                None,
                lambda: self.se_extractor_module.get_se(
                    audio_path,
                    self.tone_color_converter,
                    target_dir=str(target_dir)
                )
            )
            # Extraire l'embedding du tuple
            embedding, _audio_name = result

            # Convertir le tensor PyTorch en numpy array si nécessaire
            if hasattr(embedding, 'cpu'):
                embedding = embedding.cpu().detach().numpy()

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
        """Récupère la durée d'un fichier audio en millisecondes.

        Utilise librosa en premier, puis pydub comme fallback pour les formats
        non supportés par soundfile (ex: webm, mp4).
        """
        if not AUDIO_PROCESSING_AVAILABLE:
            return 0

        loop = asyncio.get_event_loop()

        # Essayer d'abord avec librosa
        try:
            import librosa
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            if duration > 0:
                return int(duration * 1000)
        except Exception as e:
            logger.debug(f"[VOICE_CLONE] librosa n'a pas pu lire {audio_path}: {e}")

        # Fallback avec pydub (supporte plus de formats via ffmpeg)
        try:
            def get_duration_with_pydub():
                audio = AudioSegment.from_file(audio_path)
                return len(audio)  # pydub retourne déjà en ms

            duration_ms = await loop.run_in_executor(None, get_duration_with_pydub)
            logger.debug(f"[VOICE_CLONE] Durée obtenue via pydub: {duration_ms}ms")
            return duration_ms
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
        """
        Charge un modele vocal depuis le cache Redis.

        Architecture: Redis est utilisé comme cache, Gateway gère la persistance MongoDB.
        """
        try:
            audio_cache = self._get_audio_cache()
            cached_profile = await audio_cache.get_voice_profile(user_id)

            if cached_profile:
                model = self._cache_profile_to_voice_model(cached_profile)
                logger.debug(f"[VOICE_CLONE] Modele charge depuis cache Redis: {user_id}")
                return model
        except Exception as e:
            logger.warning(f"[VOICE_CLONE] Erreur lecture cache Redis pour {user_id}: {e}")

        return None

    def _db_profile_to_voice_model(self, db_profile: Dict[str, Any]) -> VoiceModel:
        """Convertit un profil MongoDB en VoiceModel"""
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
        """Convertit un profil du cache Redis en VoiceModel"""
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
                logger.warning(f"[VOICE_CLONE] Erreur décodage embedding base64: {e}")

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

    async def _load_embedding(self, model: VoiceModel) -> VoiceModel:
        """
        Charge l'embedding d'un modele depuis le cache Redis.

        L'embedding est stocké encodé en base64 dans le cache Redis.
        Architecture: Redis = cache, Gateway = persistance MongoDB.
        """
        # L'embedding est déjà chargé par _cache_profile_to_voice_model si disponible
        if model.embedding is not None and len(model.embedding) > 0:
            return model

        # Fallback: essayer de recharger depuis le cache
        try:
            audio_cache = self._get_audio_cache()
            cached_profile = await audio_cache.get_voice_profile(model.user_id)
            if cached_profile and cached_profile.get("embeddingBase64"):
                embedding_bytes = base64.b64decode(cached_profile["embeddingBase64"])
                model.embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
                logger.debug(f"[VOICE_CLONE] Embedding chargé depuis cache Redis: {model.user_id}")
                return model
        except Exception as e:
            logger.warning(f"[VOICE_CLONE] Erreur lecture embedding depuis cache Redis: {e}")

        # Default: embedding vide
        model.embedding = np.zeros(256, dtype=np.float32)
        return model

    async def _save_model_to_cache(self, model: VoiceModel):
        """
        Sauvegarde un modele vocal dans le cache Redis.

        Stocke l'embedding encodé en base64 + metadonnees JSON.

        ═══════════════════════════════════════════════════════════════════════
        ARCHITECTURE:
        Redis = cache pour accès rapide aux profils vocaux
        Gateway = responsable de la persistance MongoDB
        Le Translator met en cache pour réutiliser les embeddings existants.
        ═══════════════════════════════════════════════════════════════════════
        """
        try:
            audio_cache = self._get_audio_cache()

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

            await audio_cache.set_voice_profile(model.user_id, cache_profile)
            logger.info(f"[VOICE_CLONE] Modele sauvegarde dans cache Redis: {model.user_id}")

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur sauvegarde cache Redis: {e}")

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
        """
        Liste tous les modeles vocaux depuis le cache Redis.

        Note: Cette methode ne charge pas les embeddings pour des raisons de performance.
        Utiliser _load_embedding() si l'embedding est necessaire.
        """
        models = []

        try:
            audio_cache = self._get_audio_cache()
            # Lister toutes les clés de profils vocaux
            profile_keys = await audio_cache.redis.keys("voice:profile:*")

            for key in profile_keys:
                try:
                    data = await audio_cache.redis.get(key)
                    if data:
                        import json
                        cached_profile = json.loads(data)
                        model = self._cache_profile_to_voice_model(cached_profile)
                        models.append(model)
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE] Erreur lecture profil {key}: {e}")

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur listing modeles Redis: {e}")

        return models

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        models_count = 0
        cache_available = False

        try:
            audio_cache = self._get_audio_cache()
            cache_stats = audio_cache.get_stats()
            cache_available = cache_stats.get("redis_available", False) or cache_stats.get("memory_entries", 0) > 0

            # Compter les modèles en cache
            profile_keys = await audio_cache.redis.keys("voice:profile:*")
            models_count = len(profile_keys)
        except Exception as e:
            logger.warning(f"[VOICE_CLONE] Erreur comptage modeles: {e}")

        return {
            "service": "VoiceCloneService",
            "initialized": self.is_initialized,
            "openvoice_available": OPENVOICE_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "storage": "Redis",
            "device": self.device,
            "voice_models_count": models_count,
            "min_audio_duration_ms": self.MIN_AUDIO_DURATION_MS,
            "max_age_days": self.VOICE_MODEL_MAX_AGE_DAYS,
            "cache_available": cache_available,
        }

    # =========================================================================
    # TRADUCTION MULTI-VOIX
    # =========================================================================

    async def prepare_multi_speaker_translation(
        self,
        audio_path: str,
        user_id: str,
        temp_dir: str
    ) -> MultiSpeakerTranslationContext:
        """
        Prépare le contexte pour une traduction audio multi-locuteurs.

        Cette méthode:
        1. Analyse l'audio pour détecter tous les locuteurs
        2. Extrait l'audio de chaque locuteur séparément
        3. Crée des profils temporaires (non cachés)
        4. Si l'utilisateur a un profil existant, identifie sa voix

        Args:
            audio_path: Chemin vers l'audio source
            user_id: ID de l'utilisateur émetteur
            temp_dir: Répertoire pour les fichiers temporaires

        Returns:
            MultiSpeakerTranslationContext avec tous les profils prêts
        """
        logger.info(f"[VOICE_CLONE] 🎭 Préparation traduction multi-voix: {audio_path}")

        voice_analyzer = get_voice_analyzer()

        # 1. Extraire l'audio de chaque locuteur
        speakers_audio = await voice_analyzer.extract_all_speakers_audio(
            audio_path,
            temp_dir,
            min_segment_duration_ms=100
        )

        if not speakers_audio:
            raise ValueError("Aucun locuteur détecté dans l'audio")

        # 2. Récupérer le profil utilisateur existant (si disponible)
        user_model = await self._load_cached_model(user_id)
        user_fingerprint = user_model.fingerprint if user_model else None

        # 3. Créer les profils temporaires
        profiles: List[TemporaryVoiceProfile] = []
        user_profile: Optional[TemporaryVoiceProfile] = None

        # Récupérer la durée totale
        total_duration_ms = await self._get_audio_duration_ms(audio_path)

        for speaker_id, (speaker_audio_path, speaker_info) in speakers_audio.items():
            # Extraire l'embedding temporaire
            temp_embedding = await self._extract_voice_embedding(
                speaker_audio_path,
                Path(temp_dir)
            )

            profile = TemporaryVoiceProfile(
                speaker_id=speaker_id,
                speaker_info=speaker_info,
                audio_path=speaker_audio_path,
                embedding=temp_embedding,
                original_segments=speaker_info.segments
            )

            # Vérifier si ce locuteur correspond à l'utilisateur
            if user_fingerprint and speaker_info.fingerprint:
                similarity = user_fingerprint.similarity_score(speaker_info.fingerprint)
                if similarity >= 0.75:
                    profile.matched_user_id = user_id
                    profile.is_user_match = True
                    user_profile = profile
                    logger.info(
                        f"[VOICE_CLONE] 🎯 Utilisateur {user_id} identifié: "
                        f"{speaker_id} (similarité: {similarity:.0%})"
                    )

            profiles.append(profile)

        # 4. Créer le contexte
        context = MultiSpeakerTranslationContext(
            source_audio_path=audio_path,
            source_duration_ms=total_duration_ms,
            speaker_count=len(profiles),
            profiles=profiles,
            user_profile=user_profile
        )

        logger.info(
            f"[VOICE_CLONE] ✅ Contexte multi-voix prêt: "
            f"{len(profiles)} locuteurs, utilisateur identifié: {user_profile is not None}"
        )

        return context

    async def should_update_user_profile(
        self,
        user_id: str,
        audio_path: str
    ) -> Tuple[bool, str]:
        """
        Détermine si le profil utilisateur doit être mis à jour avec cet audio.

        Règles:
        - Création: Un seul locuteur principal (>70% du temps de parole)
        - Mise à jour: Signature vocale doit correspondre au profil existant (>80%)

        Args:
            user_id: ID de l'utilisateur
            audio_path: Chemin vers l'audio

        Returns:
            Tuple[bool, str]: (doit mettre à jour, raison)
        """
        voice_analyzer = get_voice_analyzer()

        # Analyser l'audio
        metadata = await voice_analyzer.analyze_audio(audio_path)

        # Charger le profil existant
        existing_model = await self._load_cached_model(user_id)

        if existing_model and existing_model.fingerprint:
            # Vérifier si on peut METTRE À JOUR
            can_update, reason, _ = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=0.80
            )
            if can_update:
                return True, f"Mise à jour possible: {reason}"
            else:
                return False, f"Mise à jour impossible: {reason}"
        else:
            # Vérifier si on peut CRÉER
            can_create, reason = voice_analyzer.can_create_user_profile(metadata)
            if can_create:
                return True, f"Création possible: {reason}"
            else:
                return False, f"Création impossible: {reason}"

    async def cleanup_temp_profiles(self, context: MultiSpeakerTranslationContext):
        """
        Nettoie les fichiers temporaires d'une traduction multi-voix.

        Args:
            context: Contexte de traduction à nettoyer
        """
        for profile in context.profiles:
            try:
                if os.path.exists(profile.audio_path):
                    os.remove(profile.audio_path)
                    logger.debug(f"[VOICE_CLONE] Nettoyage: {profile.audio_path}")
            except Exception as e:
                logger.warning(f"[VOICE_CLONE] Erreur nettoyage {profile.audio_path}: {e}")

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
