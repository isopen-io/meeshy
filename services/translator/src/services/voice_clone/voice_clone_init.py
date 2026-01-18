"""
Module d'initialisation du service de clonage vocal.

Gère:
- Singleton pattern
- Initialisation OpenVoice
- Configuration device (CPU/CUDA/MPS)
- Téléchargement automatique des checkpoints
- Lazy initialization du cache Redis
"""

import os
import logging
import time
import asyncio
import threading
import zipfile
import urllib.request
import tempfile
from typing import Optional
from pathlib import Path
from config.settings import get_settings
from services.redis_service import get_audio_cache_service, AudioCacheService

logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
try:
    from openvoice import se_extractor
    from openvoice.api import ToneColorConverter
    OPENVOICE_AVAILABLE = True
except ImportError:
    OPENVOICE_AVAILABLE = False

try:
    from utils.performance import get_performance_optimizer
    PERF_OPTIMIZER_AVAILABLE = True
except ImportError:
    PERF_OPTIMIZER_AVAILABLE = False


class VoiceCloneInitializer:
    """
    Gestionnaire d'initialisation du service de clonage vocal - Singleton.

    Responsabilités:
    - Configuration du device (auto-détection ou manuel)
    - Initialisation d'OpenVoice V2
    - Téléchargement automatique des checkpoints
    - Gestion du cache Redis (lazy init)
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
        self.voice_cache_dir = Path(
            voice_cache_dir or
            os.getenv('VOICE_MODEL_CACHE_DIR', self._settings.voice_models_path)
        )

        # Device detection: Use PerformanceOptimizer if available, else fallback to settings
        env_device = os.getenv('VOICE_CLONE_DEVICE', self._settings.voice_clone_device)
        if env_device == "auto" and PERF_OPTIMIZER_AVAILABLE:
            perf_opt = get_performance_optimizer()
            self.device = perf_opt.device
            logger.info(f"[VOICE_CLONE_INIT] Device auto-detected: {self.device}")
        else:
            # Manual device selection or explicit device specified
            self.device = env_device if env_device != "auto" else "cpu"

        # Service de persistance MongoDB (optionnel, pour fallback)
        self.database_service = database_service

        # Service de cache Redis pour les profils vocaux (lazy init)
        self._audio_cache: Optional[AudioCacheService] = None

        # OpenVoice components
        self.tone_color_converter = None
        self.se_extractor_module = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Créer le répertoire de cache
        self.voice_cache_dir.mkdir(parents=True, exist_ok=True)

        logger.info(
            f"[VOICE_CLONE_INIT] Initializer créé: "
            f"device={self.device}, models_path={self._settings.models_path}"
        )
        self._initialized = True

    def set_database_service(self, database_service):
        """Injecte le service de base de données MongoDB (optionnel, fallback)"""
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
                logger.warning("[VOICE_CLONE_INIT] OpenVoice non disponible - mode dégradé")
                self.is_initialized = True
                return True

            try:
                start_time = time.time()
                logger.info("[VOICE_CLONE_INIT] 🔄 Initialisation d'OpenVoice...")

                # Charger dans un thread pour ne pas bloquer
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._load_openvoice)

                load_time = time.time() - start_time
                logger.info(f"[VOICE_CLONE_INIT] ✅ OpenVoice initialisé en {load_time:.2f}s")

                self.is_initialized = True
                return True

            except Exception as e:
                logger.error(f"[VOICE_CLONE_INIT] ❌ Erreur initialisation OpenVoice: {e}")
                import traceback
                traceback.print_exc()
                self.is_initialized = True  # Mode dégradé
                return True

    def _load_openvoice(self):
        """Charge OpenVoice (appelé dans un thread)"""
        # Utiliser le chemin centralisé depuis settings
        checkpoints_dir = self._settings.openvoice_checkpoints_path
        logger.info(f"[VOICE_CLONE_INIT] Chargement OpenVoice depuis {checkpoints_dir}")

        # Chemins des fichiers requis (OpenVoice V2 les met dans converter/)
        checkpoints_path = Path(checkpoints_dir)
        converter_path = checkpoints_path / "converter"
        config_path = converter_path / "config.json"
        checkpoint_path = converter_path / "checkpoint.pth"

        # Télécharger les checkpoints OpenVoice V2 s'ils n'existent pas
        if not config_path.exists() or not checkpoint_path.exists():
            logger.info("[VOICE_CLONE_INIT] 📥 Téléchargement des checkpoints OpenVoice V2...")
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
            logger.info(f"[VOICE_CLONE_INIT] ✅ Checkpoint chargé: {checkpoint_path}")

        self.se_extractor_module = se_extractor

    def _download_openvoice_checkpoints(self, checkpoints_path: Path):
        """Télécharge les checkpoints OpenVoice V2 depuis MyShell S3"""
        OPENVOICE_V2_URL = "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/checkpoints_v2_0417.zip"

        checkpoints_path.mkdir(parents=True, exist_ok=True)

        try:
            # Télécharger le zip
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_file:
                tmp_path = tmp_file.name
                logger.info(f"[VOICE_CLONE_INIT] Téléchargement depuis {OPENVOICE_V2_URL}...")
                urllib.request.urlretrieve(OPENVOICE_V2_URL, tmp_path)

            # Extraire le zip
            logger.info(f"[VOICE_CLONE_INIT] Extraction vers {checkpoints_path}...")
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
            logger.info("[VOICE_CLONE_INIT] ✅ Checkpoints OpenVoice V2 téléchargés")

        except Exception as e:
            logger.error(f"[VOICE_CLONE_INIT] ❌ Erreur téléchargement checkpoints: {e}")
            raise

    async def close(self):
        """Libère les ressources"""
        logger.info("[VOICE_CLONE_INIT] 🛑 Fermeture de l'initializer")
        self.tone_color_converter = None
        self.se_extractor_module = None
        self.is_initialized = False


def get_voice_clone_initializer() -> VoiceCloneInitializer:
    """Retourne l'instance singleton de l'initializer"""
    return VoiceCloneInitializer()
