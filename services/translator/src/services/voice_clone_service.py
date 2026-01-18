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
from services.voice_clone.voice_quality_analyzer import (
    VoiceQualityAnalyzer,
    VoiceQualityMetrics,
    VoiceSimilarityResult,
    get_voice_quality_analyzer
)
from services.voice_clone.voice_clone_multi_speaker import (
    VoiceCloneMultiSpeaker,
    get_voice_clone_multi_speaker
)
from services.voice_clone.voice_clone_audio import VoiceCloneAudioProcessor
from services.voice_clone.voice_clone_cache import VoiceCloneCacheManager


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

        # Cache manager (délégation)
        self._cache_manager: Optional[VoiceCloneCacheManager] = None

        # OpenVoice components
        self.tone_color_converter = None
        self.se_extractor_module = None

        # Etat
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Repertoire temporaire pour fichiers audio
        self.voice_cache_dir.mkdir(parents=True, exist_ok=True)

        # Service multi-speaker (délégation)
        self._multi_speaker: Optional[VoiceCloneMultiSpeaker] = None

        # Audio processor (délégation)
        self._audio_processor = VoiceCloneAudioProcessor(
            database_service=database_service,
            max_audio_history=self.MAX_AUDIO_HISTORY
        )

        logger.info(f"[VOICE_CLONE] Service cree: device={self.device}, models_path={self._settings.models_path}")
        self._initialized = True

    def set_database_service(self, database_service):
        """Injecte le service de base de donnees MongoDB (optionnel, fallback)"""
        self.database_service = database_service
        # Inject into audio processor as well
        self._audio_processor.set_database_service(database_service)

    def _get_audio_cache(self) -> AudioCacheService:
        """Retourne le service de cache audio Redis (lazy init)"""
        if self._audio_cache is None:
            self._audio_cache = get_audio_cache_service(self._settings)
        return self._audio_cache

    def _get_cache_manager(self) -> VoiceCloneCacheManager:
        """Retourne le gestionnaire de cache (lazy init)"""
        if self._cache_manager is None:
            audio_cache = self._get_audio_cache()
            self._cache_manager = VoiceCloneCacheManager(
                audio_cache=audio_cache,
                voice_cache_dir=self.voice_cache_dir
            )
        return self._cache_manager

    def _get_multi_speaker(self) -> VoiceCloneMultiSpeaker:
        """Retourne le service multi-speaker (lazy init)"""
        if self._multi_speaker is None:
            self._multi_speaker = get_voice_clone_multi_speaker(self)
        return self._multi_speaker

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

        # Inject OpenVoice components into audio processor
        self._audio_processor.set_openvoice_components(
            se_extractor_module=self.se_extractor_module,
            tone_color_converter=self.tone_color_converter
        )

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
        cache_manager = self._get_cache_manager()
        cached_model = await cache_manager.load_cached_model(user_id)

        if cached_model:
            age_days = (datetime.now() - cached_model.updated_at).days

            # Modèle récent → utiliser directement
            if age_days < self.VOICE_MODEL_MAX_AGE_DAYS:
                logger.info(f"[VOICE_CLONE] 📦 Modèle en cache pour {user_id} (age: {age_days}j)")

                # Charger l'embedding si pas en mémoire
                if cached_model.embedding is None:
                    cached_model = await cache_manager.load_embedding(cached_model)

                return cached_model

            # Modèle ancien → améliorer si on a un nouvel audio
            if current_audio_path:
                logger.info(f"[VOICE_CLONE] 🔄 Modèle obsolète pour {user_id}, amélioration...")
                return await self._improve_model(cached_model, current_audio_path)

            # Sinon utiliser l'ancien modèle
            logger.info(f"[VOICE_CLONE] ⚠️ Modèle obsolète pour {user_id} mais pas de nouvel audio")
            if cached_model.embedding is None:
                cached_model = await cache_manager.load_embedding(cached_model)
            return cached_model

        # 2. Pas de modèle → créer
        if not current_audio_path:
            # Essayer de récupérer l'historique audio
            audio_paths = await self._audio_processor.get_user_audio_history(user_id)
            if not audio_paths:
                raise ValueError(f"Aucun audio disponible pour créer le modèle de voix de {user_id}")
            current_audio_path = audio_paths[0]
            current_audio_duration_ms = await self._audio_processor.get_audio_duration_ms(current_audio_path)

        audio_paths = [current_audio_path]
        total_duration = current_audio_duration_ms

        # Si audio trop court, chercher l'historique
        if total_duration < self.MIN_AUDIO_DURATION_MS:
            logger.info(f"[VOICE_CLONE] ⚠️ Audio trop court ({total_duration}ms), agrégation historique...")
            historical_audios = await self._audio_processor.get_user_audio_history(user_id, exclude=[current_audio_path])
            audio_paths.extend(historical_audios)
            total_duration = await self._audio_processor.calculate_total_duration(audio_paths)

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
            extracted_duration_ms += await self._audio_processor.get_audio_duration_ms(path)

        logger.info(
            f"[VOICE_CLONE] Audio extrait: {extracted_duration_ms}ms "
            f"(original: {total_duration_ms}ms, {len(extracted_paths)} fichiers)"
        )

        # Concaténer les audios extraits si multiples
        if len(extracted_paths) > 1:
            combined_audio = await self._audio_processor.concatenate_audios(
                extracted_paths,
                output_dir=user_dir,
                user_id=user_id
            )
        else:
            combined_audio = extracted_paths[0]

        # Générer un profile_id unique
        profile_id = uuid_module.uuid4().hex[:12]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Extraire l'embedding de voix (du locuteur principal uniquement)
        embedding = await self._audio_processor.extract_voice_embedding(combined_audio, user_dir)

        # Calculer score de qualité
        quality_score = self._audio_processor.calculate_quality_score(extracted_duration_ms, len(valid_paths))

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
        cache_manager = self._get_cache_manager()
        await cache_manager.save_model_to_cache(model)

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
        cache_manager = self._get_cache_manager()
        if existing_model.embedding is None:
            existing_model = await cache_manager.load_embedding(existing_model)

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

        new_embedding = await self._audio_processor.extract_voice_embedding(new_audio_path, user_dir)

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
        cache_manager = self._get_cache_manager()
        await cache_manager.save_model_to_cache(existing_model)

        logger.info(f"[VOICE_CLONE] ✅ Modèle amélioré pour {existing_model.user_id} (v{existing_model.version})")
        return existing_model

    async def schedule_quarterly_recalibration(self):
        """
        Tâche planifiée pour recalibrer les modèles de voix trimestriellement (tous les 3 mois).
        À exécuter via un cron job ou un scheduler.
        Sélectionne le meilleur audio: le plus long, le plus clair, sans bruit, le plus récent.
        """
        cache_manager = self._get_cache_manager()
        await cache_manager.schedule_quarterly_recalibration(
            get_best_audio_callback=self._audio_processor.get_best_audio_for_cloning,
            get_audio_history_callback=self._audio_processor.get_user_audio_history,
            create_model_callback=self._create_voice_model,
            max_age_days=self.VOICE_MODEL_MAX_AGE_DAYS
        )

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
        cache_manager = self._get_cache_manager()
        cache_stats = await cache_manager.get_stats()

        return {
            "service": "VoiceCloneService",
            "initialized": self.is_initialized,
            "openvoice_available": OPENVOICE_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "storage": cache_stats.get("cache_type", "Redis"),
            "device": self.device,
            "voice_models_count": cache_stats.get("models_count", 0),
            "min_audio_duration_ms": self.MIN_AUDIO_DURATION_MS,
            "max_age_days": self.VOICE_MODEL_MAX_AGE_DAYS,
            "cache_available": cache_stats.get("cache_available", False),
        }

    # =========================================================================
    # TRADUCTION MULTI-VOIX (délégué à VoiceCloneMultiSpeaker)
    # =========================================================================

    async def prepare_multi_speaker_translation(
        self,
        audio_path: str,
        user_id: str,
        temp_dir: str
    ) -> MultiSpeakerTranslationContext:
        """
        Prépare le contexte pour une traduction audio multi-locuteurs.
        Délègue à VoiceCloneMultiSpeaker.

        Args:
            audio_path: Chemin vers l'audio source
            user_id: ID de l'utilisateur émetteur
            temp_dir: Répertoire pour les fichiers temporaires

        Returns:
            MultiSpeakerTranslationContext avec tous les profils prêts
        """
        multi_speaker = self._get_multi_speaker()
        return await multi_speaker.prepare_multi_speaker_translation(
            audio_path, user_id, temp_dir
        )

    async def should_update_user_profile(
        self,
        user_id: str,
        audio_path: str
    ) -> Tuple[bool, str]:
        """
        Détermine si le profil utilisateur doit être mis à jour avec cet audio.
        Délègue à VoiceCloneMultiSpeaker.

        Args:
            user_id: ID de l'utilisateur
            audio_path: Chemin vers l'audio

        Returns:
            Tuple[bool, str]: (doit mettre à jour, raison)
        """
        multi_speaker = self._get_multi_speaker()
        return await multi_speaker.should_update_user_profile(user_id, audio_path)

    async def cleanup_temp_profiles(self, context: MultiSpeakerTranslationContext):
        """
        Nettoie les fichiers temporaires d'une traduction multi-voix.
        Délègue à VoiceCloneMultiSpeaker.

        Args:
            context: Contexte de traduction à nettoyer
        """
        multi_speaker = self._get_multi_speaker()
        await multi_speaker.cleanup_temp_profiles(context)

    async def analyze_voice_quality(
        self,
        audio_path: str,
        detailed: bool = True
    ) -> VoiceQualityMetrics:
        """
        Analyse la qualité vocale d'un fichier audio.

        Extrait les métriques de qualité:
        - Pitch (fundamental frequency)
        - Voice type detection (High/Medium/Low)
        - Spectral centroid (brightness)
        - MFCC coefficients (si detailed=True)

        Utilisé pour:
        - Validation de qualité avant clonage
        - Métriques post-TTS pour évaluation
        - Tests de qualité automatisés

        Args:
            audio_path: Chemin vers le fichier audio à analyser
            detailed: Si True, extrait les MFCC (plus lent mais plus précis)

        Returns:
            VoiceQualityMetrics avec toutes les features extraites
        """
        quality_analyzer = get_voice_quality_analyzer()
        return await quality_analyzer.analyze(audio_path, detailed=detailed)

    async def compare_voice_similarity(
        self,
        original_audio_path: str,
        cloned_audio_path: str
    ) -> VoiceSimilarityResult:
        """
        Compare deux audios et calcule la similarité vocale.

        Métriques de similarité multi-critères:
        - Pitch similarity (30% du score global)
        - Brightness similarity (30% du score global)
        - MFCC similarity (40% du score global)
        - Overall similarity (moyenne pondérée)

        Utilisé pour:
        - Validation de qualité post-clonage
        - Tests A/B de modèles de voix
        - Métriques de performance du clonage

        Args:
            original_audio_path: Chemin vers l'audio original
            cloned_audio_path: Chemin vers l'audio cloné/généré

        Returns:
            VoiceSimilarityResult avec toutes les métriques de similarité
        """
        quality_analyzer = get_voice_quality_analyzer()
        return await quality_analyzer.compare(original_audio_path, cloned_audio_path)

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
