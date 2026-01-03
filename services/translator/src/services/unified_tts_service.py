"""
Service TTS Unifié avec support multi-modèles - Singleton
Supporte: Chatterbox (recommandé), Higgs Audio V2, XTTS (legacy)

Architecture:
- Interface unifiée pour tous les modèles TTS
- Chargement à chaud des modèles (hot-loading)
- Vérification de disponibilité locale des modèles
- Téléchargement en arrière-plan si espace disponible
- Fallback automatique sur Chatterbox (modèle par défaut)
- Alertes automatiques pour les licences commerciales
"""

import os
import logging
import time
import asyncio
import threading
import uuid
import shutil
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from pathlib import Path
from enum import Enum
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor

# Configuration du logging
logger = logging.getLogger(__name__)

# Executor pour les opérations de téléchargement en arrière-plan
_background_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tts_download")


class TTSModel(str, Enum):
    """Modèles TTS disponibles"""
    CHATTERBOX = "chatterbox"           # Recommandé - Apache 2.0 (FALLBACK par défaut)
    CHATTERBOX_TURBO = "chatterbox-turbo"  # Plus rapide, 350M params
    HIGGS_AUDIO_V2 = "higgs-audio-v2"   # État de l'art - Licence limitée
    XTTS_V2 = "xtts-v2"                 # Legacy - Non-commercial

    @classmethod
    def get_default(cls) -> 'TTSModel':
        """Retourne le modèle par défaut (et fallback)"""
        return cls.CHATTERBOX

    @classmethod
    def get_fallback(cls) -> 'TTSModel':
        """Retourne le modèle de fallback"""
        return cls.CHATTERBOX


@dataclass
class TTSModelInfo:
    """Informations sur un modèle TTS"""
    name: str
    display_name: str
    license: str
    commercial_use: bool
    license_warning: Optional[str]
    languages: list
    min_audio_seconds: float
    quality_score: int  # 1-100
    speed_score: int    # 1-100
    vram_gb: float
    # Identifiants HuggingFace pour vérification locale
    hf_model_id: Optional[str] = None
    model_size_gb: float = 0.0  # Taille approximative du modèle


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


# Informations sur les modèles
TTS_MODEL_INFO: Dict[TTSModel, TTSModelInfo] = {
    TTSModel.CHATTERBOX: TTSModelInfo(
        name="chatterbox",
        display_name="Chatterbox (Resemble AI)",
        license="Apache 2.0",
        commercial_use=True,
        license_warning=None,
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi"],
        min_audio_seconds=3.0,
        quality_score=95,
        speed_score=85,
        vram_gb=4.0,
        hf_model_id="ResembleAI/chatterbox",
        model_size_gb=3.5
    ),
    TTSModel.CHATTERBOX_TURBO: TTSModelInfo(
        name="chatterbox-turbo",
        display_name="Chatterbox Turbo (Resemble AI)",
        license="Apache 2.0",
        commercial_use=True,
        license_warning=None,
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi"],
        min_audio_seconds=3.0,
        quality_score=90,
        speed_score=95,
        vram_gb=2.0,
        hf_model_id="ResembleAI/chatterbox-turbo",
        model_size_gb=1.5
    ),
    TTSModel.HIGGS_AUDIO_V2: TTSModelInfo(
        name="higgs-audio-v2",
        display_name="Higgs Audio V2 (Boson AI)",
        license="Boson Higgs Audio 2 Community License",
        commercial_use=False,
        license_warning=(
            "⚠️ ALERTE LICENCE HIGGS AUDIO V2 ⚠️\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "La licence 'Boson Higgs Audio 2 Community License' autorise:\n"
            "  ✅ Usage commercial si < 100,000 utilisateurs actifs annuels\n"
            "  ❌ Au-delà de 100k users → licence commerciale OBLIGATOIRE\n"
            "\n"
            "Si vous prévoyez de dépasser ce seuil, contactez Boson AI:\n"
            "  📧 https://www.boson.ai/contact\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ),
        languages=[
            "en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko", "ar",
            "hi", "bn", "pa", "ta", "te", "mr", "gu", "kn", "ml", "or",
            "pl", "nl", "sv", "da", "no", "fi", "cs", "sk", "hu", "ro",
            "bg", "uk", "el", "tr", "he", "th", "vi", "id", "ms", "tl",
            "sw", "am", "yo", "ig", "ha", "zu", "af", "fa", "ur"
        ],
        min_audio_seconds=3.0,
        quality_score=98,
        speed_score=75,
        vram_gb=8.0,
        hf_model_id="bosonai/higgs-audio-v2-generation-3B-base",
        model_size_gb=6.0
    ),
    TTSModel.XTTS_V2: TTSModelInfo(
        name="xtts-v2",
        display_name="XTTS v2 (Coqui - Legacy)",
        license="Coqui Public Model License",
        commercial_use=False,
        license_warning=(
            "⚠️ ALERTE LICENCE XTTS V2 ⚠️\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "XTTS v2 utilise la 'Coqui Public Model License' qui:\n"
            "  ❌ INTERDIT tout usage commercial\n"
            "  ✅ Autorise uniquement usage personnel/recherche\n"
            "\n"
            "Pour un usage commercial, utilisez Chatterbox (Apache 2.0).\n"
            "Note: Coqui a fermé en 2024, ce modèle n'est plus maintenu.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ),
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko"],
        min_audio_seconds=6.0,
        quality_score=75,
        speed_score=70,
        vram_gb=4.0,
        hf_model_id=None,  # XTTS utilise son propre système de téléchargement
        model_size_gb=3.0
    ),
}


@dataclass
class UnifiedTTSResult:
    """Résultat unifié d'une synthèse TTS"""
    audio_path: str
    audio_url: str
    duration_ms: int
    format: str
    language: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int
    text_length: int
    model_used: TTSModel
    model_info: TTSModelInfo


class BaseTTSBackend(ABC):
    """Interface abstraite pour les backends TTS"""

    def __init__(self):
        self._initialized = False
        self._downloading = False
        self._download_progress = 0.0

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


class ChatterboxBackend(BaseTTSBackend):
    """Backend Chatterbox (Resemble AI) - MODÈLE PAR DÉFAUT ET FALLBACK"""

    def __init__(self, device: str = "auto", turbo: bool = False):
        super().__init__()
        self.device = device
        self.turbo = turbo
        self.model = None
        self._available = False
        self._models_path = Path(os.getenv("MODELS_PATH", "/workspace/models"))

        try:
            from chatterbox.tts import ChatterboxTTS
            self._available = True
            logger.info(f"✅ [TTS] Chatterbox {'Turbo' if turbo else ''} package disponible")
        except ImportError:
            logger.warning(f"⚠️ [TTS] Chatterbox {'Turbo' if turbo else ''} package non disponible")

    @property
    def is_available(self) -> bool:
        return self._available

    def is_model_downloaded(self) -> bool:
        """Vérifie si le modèle Chatterbox est téléchargé"""
        if not self._available:
            return False

        try:
            from huggingface_hub import try_to_load_from_cache
            model_id = "ResembleAI/chatterbox-turbo" if self.turbo else "ResembleAI/chatterbox"

            # Vérifier si les fichiers du modèle sont en cache
            config_path = try_to_load_from_cache(model_id, "config.json")
            return config_path is not None

        except Exception as e:
            logger.debug(f"[TTS] Vérification cache Chatterbox: {e}")
            return False

    async def download_model(self) -> bool:
        """Télécharge le modèle Chatterbox"""
        if not self._available:
            return False

        self._downloading = True
        self._download_progress = 0.0

        try:
            from huggingface_hub import snapshot_download

            model_id = "ResembleAI/chatterbox-turbo" if self.turbo else "ResembleAI/chatterbox"
            logger.info(f"[TTS] 📥 Téléchargement de {model_id}...")

            loop = asyncio.get_event_loop()

            def download():
                return snapshot_download(
                    repo_id=model_id,
                    cache_dir=str(self._models_path / "huggingface"),
                    resume_download=True
                )

            await loop.run_in_executor(_background_executor, download)

            self._download_progress = 100.0
            logger.info(f"[TTS] ✅ {model_id} téléchargé avec succès")
            return True

        except Exception as e:
            logger.error(f"[TTS] ❌ Erreur téléchargement Chatterbox: {e}")
            return False

        finally:
            self._downloading = False

    async def initialize(self) -> bool:
        if self._initialized:
            return True

        if not self._available:
            return False

        try:
            from chatterbox.tts import ChatterboxTTS
            import torch

            # Déterminer le device
            if self.device == "auto":
                device = "cuda" if torch.cuda.is_available() else "cpu"
            else:
                device = self.device

            model_name = "Turbo" if self.turbo else ""
            logger.info(f"[TTS] 🔄 Chargement Chatterbox {model_name}...")

            loop = asyncio.get_event_loop()

            if self.turbo:
                self.model = await loop.run_in_executor(
                    None,
                    lambda: ChatterboxTTS.from_pretrained("ResembleAI/chatterbox-turbo", device=device)
                )
            else:
                self.model = await loop.run_in_executor(
                    None,
                    lambda: ChatterboxTTS.from_pretrained(device=device)
                )

            self._initialized = True
            logger.info(f"✅ [TTS] Chatterbox {model_name} initialisé sur {device}")
            return True

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur initialisation Chatterbox: {e}")
            return False

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        **kwargs
    ) -> str:
        if not self._initialized:
            await self.initialize()

        if not self.model:
            raise RuntimeError("Chatterbox non initialisé")

        import torchaudio

        loop = asyncio.get_event_loop()

        # Générer l'audio
        if speaker_audio_path and os.path.exists(speaker_audio_path):
            wav = await loop.run_in_executor(
                None,
                lambda: self.model.generate(
                    text,
                    audio_prompt_path=speaker_audio_path,
                    exaggeration=exaggeration,
                    cfg_weight=cfg_weight
                )
            )
        else:
            wav = await loop.run_in_executor(
                None,
                lambda: self.model.generate(text, exaggeration=exaggeration, cfg_weight=cfg_weight)
            )

        # Sauvegarder le fichier
        await loop.run_in_executor(
            None,
            lambda: torchaudio.save(output_path, wav, self.model.sr)
        )

        return output_path

    async def close(self):
        self.model = None
        self._initialized = False


class HiggsAudioBackend(BaseTTSBackend):
    """Backend Higgs Audio V2 (Boson AI)"""

    def __init__(self, device: str = "auto"):
        super().__init__()
        self.device = device
        self.model = None
        self.tokenizer = None
        self._available = False
        self._models_path = Path(os.getenv("MODELS_PATH", "/workspace/models"))

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torchaudio
            self._available = True
            logger.info("✅ [TTS] Higgs Audio V2 package disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] Higgs Audio V2 non disponible (transformers requis)")

    @property
    def is_available(self) -> bool:
        return self._available

    def is_model_downloaded(self) -> bool:
        """Vérifie si le modèle Higgs Audio V2 est téléchargé"""
        if not self._available:
            return False

        try:
            from huggingface_hub import try_to_load_from_cache
            model_id = "bosonai/higgs-audio-v2-generation-3B-base"

            config_path = try_to_load_from_cache(model_id, "config.json")
            return config_path is not None

        except Exception as e:
            logger.debug(f"[TTS] Vérification cache Higgs Audio: {e}")
            return False

    async def download_model(self) -> bool:
        """Télécharge le modèle Higgs Audio V2"""
        if not self._available:
            return False

        self._downloading = True
        self._download_progress = 0.0

        try:
            from huggingface_hub import snapshot_download

            model_id = "bosonai/higgs-audio-v2-generation-3B-base"
            logger.info(f"[TTS] 📥 Téléchargement de {model_id}...")

            loop = asyncio.get_event_loop()

            def download():
                return snapshot_download(
                    repo_id=model_id,
                    cache_dir=str(self._models_path / "huggingface"),
                    resume_download=True
                )

            await loop.run_in_executor(_background_executor, download)

            self._download_progress = 100.0
            logger.info(f"[TTS] ✅ {model_id} téléchargé avec succès")
            return True

        except Exception as e:
            logger.error(f"[TTS] ❌ Erreur téléchargement Higgs Audio: {e}")
            return False

        finally:
            self._downloading = False

    async def initialize(self) -> bool:
        if self._initialized:
            return True

        if not self._available:
            return False

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torch

            # Afficher l'alerte de licence
            model_info = TTS_MODEL_INFO[TTSModel.HIGGS_AUDIO_V2]
            if model_info.license_warning:
                logger.warning(model_info.license_warning)
                print(f"\n{model_info.license_warning}\n")

            # Déterminer le device
            if self.device == "auto":
                device = "cuda" if torch.cuda.is_available() else "cpu"
            else:
                device = self.device

            logger.info("[TTS] 🔄 Chargement Higgs Audio V2...")

            loop = asyncio.get_event_loop()
            model_name = "bosonai/higgs-audio-v2-generation-3B-base"

            self.tokenizer = await loop.run_in_executor(
                None,
                lambda: AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
            )

            self.model = await loop.run_in_executor(
                None,
                lambda: AutoModelForCausalLM.from_pretrained(
                    model_name,
                    trust_remote_code=True,
                    torch_dtype=torch.float16 if device == "cuda" else torch.float32
                ).to(device)
            )

            self._initialized = True
            logger.info(f"✅ [TTS] Higgs Audio V2 initialisé sur {device}")
            return True

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur initialisation Higgs Audio V2: {e}")
            return False

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        **kwargs
    ) -> str:
        if not self._initialized:
            await self.initialize()

        if not self.model:
            raise RuntimeError("Higgs Audio V2 non initialisé")

        import torch
        import torchaudio

        loop = asyncio.get_event_loop()

        prompt = text
        if speaker_audio_path and os.path.exists(speaker_audio_path):
            prompt = f"[voice_clone]{text}"

        def generate():
            inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    do_sample=True,
                    temperature=0.7,
                    top_p=0.9
                )

            audio_tokens = outputs[0][inputs["input_ids"].shape[1]:]
            audio = self.model.decode_audio(audio_tokens)
            return audio

        audio = await loop.run_in_executor(None, generate)

        await loop.run_in_executor(
            None,
            lambda: torchaudio.save(output_path, audio.unsqueeze(0), 24000)
        )

        return output_path

    async def close(self):
        self.model = None
        self.tokenizer = None
        self._initialized = False


class XTTSBackend(BaseTTSBackend):
    """Backend XTTS v2 (Coqui) - Legacy"""

    def __init__(self, device: str = "auto"):
        super().__init__()
        self.device = device
        self.model = None
        self._available = False

        try:
            from TTS.api import TTS
            self._available = True
            logger.info("✅ [TTS] XTTS v2 package disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] XTTS v2 non disponible")

    @property
    def is_available(self) -> bool:
        return self._available

    def is_model_downloaded(self) -> bool:
        """Vérifie si XTTS v2 est téléchargé"""
        if not self._available:
            return False

        try:
            # XTTS stocke les modèles dans un dossier spécifique
            tts_models_path = Path.home() / ".local" / "share" / "tts"
            xtts_path = tts_models_path / "tts_models--multilingual--multi-dataset--xtts_v2"
            return xtts_path.exists()
        except Exception:
            return False

    async def download_model(self) -> bool:
        """Télécharge XTTS v2 (via TTS.api)"""
        if not self._available:
            return False

        self._downloading = True
        self._download_progress = 0.0

        try:
            from TTS.api import TTS

            logger.info("[TTS] 📥 Téléchargement de XTTS v2...")

            loop = asyncio.get_event_loop()

            # Le téléchargement se fait automatiquement lors de l'instanciation
            await loop.run_in_executor(
                None,
                lambda: TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True)
            )

            self._download_progress = 100.0
            logger.info("[TTS] ✅ XTTS v2 téléchargé avec succès")
            return True

        except Exception as e:
            logger.error(f"[TTS] ❌ Erreur téléchargement XTTS v2: {e}")
            return False

        finally:
            self._downloading = False

    async def initialize(self) -> bool:
        if self._initialized:
            return True

        if not self._available:
            return False

        try:
            from TTS.api import TTS

            # Afficher l'alerte de licence
            model_info = TTS_MODEL_INFO[TTSModel.XTTS_V2]
            if model_info.license_warning:
                logger.warning(model_info.license_warning)
                print(f"\n{model_info.license_warning}\n")

            logger.info("[TTS] 🔄 Chargement XTTS v2 (legacy)...")

            loop = asyncio.get_event_loop()

            self.model = await loop.run_in_executor(
                None,
                lambda: TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False).to(self.device)
            )

            self._initialized = True
            logger.info(f"✅ [TTS] XTTS v2 initialisé sur {self.device}")
            return True

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur initialisation XTTS v2: {e}")
            return False

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        **kwargs
    ) -> str:
        if not self._initialized:
            await self.initialize()

        if not self.model:
            raise RuntimeError("XTTS v2 non initialisé")

        loop = asyncio.get_event_loop()

        lang_map = {
            "fr": "fr", "en": "en", "es": "es", "de": "de",
            "pt": "pt", "it": "it", "pl": "pl", "tr": "tr",
            "ru": "ru", "nl": "nl", "cs": "cs", "ar": "ar",
            "zh": "zh-cn", "ja": "ja", "hu": "hu", "ko": "ko"
        }
        xtts_lang = lang_map.get(language.lower(), "en")

        if speaker_audio_path and os.path.exists(speaker_audio_path):
            await loop.run_in_executor(
                None,
                lambda: self.model.tts_to_file(
                    text=text,
                    speaker_wav=speaker_audio_path,
                    language=xtts_lang,
                    file_path=output_path
                )
            )
        else:
            await loop.run_in_executor(
                None,
                lambda: self.model.tts_to_file(
                    text=text,
                    language=xtts_lang,
                    file_path=output_path
                )
            )

        return output_path

    async def close(self):
        self.model = None
        self._initialized = False


class UnifiedTTSService:
    """
    Service TTS Unifié - Singleton

    Fonctionnalités:
    - Support multi-modèles (Chatterbox, Higgs Audio V2, XTTS)
    - Chargement à chaud des modèles
    - Vérification de disponibilité locale
    - Téléchargement en arrière-plan
    - Fallback automatique sur Chatterbox
    """

    _instance = None
    _lock = threading.Lock()

    # Espace disque minimum requis pour télécharger un modèle (en GB)
    MIN_DISK_SPACE_GB = 2.0

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
        model_env = os.getenv("TTS_MODEL", "chatterbox")
        try:
            self.requested_model = model or TTSModel(model_env)
        except ValueError:
            logger.warning(f"[TTS] Modèle inconnu: {model_env}, utilisation de chatterbox")
            self.requested_model = TTSModel.CHATTERBOX

        self.current_model = self.requested_model
        self.output_dir = Path(output_dir or os.getenv("TTS_OUTPUT_DIR", "/app/outputs/audio"))
        self.device = os.getenv("TTS_DEVICE", device)
        self.default_format = os.getenv("TTS_DEFAULT_FORMAT", "wav")
        self.models_path = Path(os.getenv("MODELS_PATH", "/workspace/models"))

        # Backends
        self.backends: Dict[TTSModel, BaseTTSBackend] = {}
        self.active_backend: Optional[BaseTTSBackend] = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()
        self._background_downloads: Dict[TTSModel, asyncio.Task] = {}

        # Créer les répertoires
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "translated").mkdir(parents=True, exist_ok=True)

        logger.info(f"[TTS] Service configuré: model={self.requested_model.value}, device={self.device}")

        self._singleton_initialized = True

    def _create_backend(self, model: TTSModel) -> BaseTTSBackend:
        """Crée le backend approprié pour le modèle"""
        if model == TTSModel.CHATTERBOX:
            return ChatterboxBackend(device=self.device, turbo=False)
        elif model == TTSModel.CHATTERBOX_TURBO:
            return ChatterboxBackend(device=self.device, turbo=True)
        elif model == TTSModel.HIGGS_AUDIO_V2:
            return HiggsAudioBackend(device=self.device)
        elif model == TTSModel.XTTS_V2:
            return XTTSBackend(device=self.device)
        else:
            raise ValueError(f"Modèle inconnu: {model}")

    def _get_available_disk_space_gb(self) -> float:
        """Retourne l'espace disque disponible en GB"""
        try:
            total, used, free = shutil.disk_usage(self.models_path)
            return free / (1024 ** 3)
        except Exception:
            return 0.0

    def _can_download_model(self, model: TTSModel) -> bool:
        """Vérifie si on peut télécharger un modèle (espace disque suffisant)"""
        model_info = TTS_MODEL_INFO[model]
        available_space = self._get_available_disk_space_gb()
        required_space = model_info.model_size_gb + self.MIN_DISK_SPACE_GB
        return available_space >= required_space

    async def get_model_status(self, model: TTSModel) -> ModelStatus:
        """Retourne le statut d'un modèle"""
        if model not in self.backends:
            backend = self._create_backend(model)
            self.backends[model] = backend
        else:
            backend = self.backends[model]

        return ModelStatus(
            model=model,
            is_available=backend.is_available,
            is_downloaded=backend.is_model_downloaded(),
            is_loaded=backend.is_initialized,
            is_downloading=backend.is_downloading,
            download_progress=backend.download_progress
        )

    async def get_all_models_status(self) -> Dict[str, ModelStatus]:
        """Retourne le statut de tous les modèles"""
        statuses = {}
        for model in TTSModel:
            statuses[model.value] = await self.get_model_status(model)
        return statuses

    async def initialize(self, model: TTSModel = None) -> bool:
        """
        Initialise le service avec le modèle spécifié.

        Logique:
        1. Si le modèle demandé est disponible et téléchargé → le charger
        2. Si le modèle demandé peut être téléchargé → télécharger et charger
        3. Sinon → fallback sur Chatterbox
        """
        model = model or self.requested_model

        async with self._init_lock:
            # Si déjà initialisé avec ce modèle, retourner True
            if model in self.backends and self.backends[model].is_initialized:
                self.active_backend = self.backends[model]
                self.current_model = model
                self.is_initialized = True
                return True

            # Créer le backend si nécessaire
            if model not in self.backends:
                self.backends[model] = self._create_backend(model)

            backend = self.backends[model]

            # Vérifier si le package est disponible
            if not backend.is_available:
                logger.warning(f"[TTS] Package {model.value} non disponible, fallback sur Chatterbox")
                return await self._fallback_to_chatterbox()

            # Vérifier si le modèle est téléchargé
            if not backend.is_model_downloaded():
                logger.info(f"[TTS] Modèle {model.value} non téléchargé localement")

                # Essayer de télécharger si espace suffisant
                if self._can_download_model(model):
                    logger.info(f"[TTS] Téléchargement du modèle {model.value}...")
                    success = await backend.download_model()

                    if not success:
                        logger.warning(f"[TTS] Échec téléchargement {model.value}, fallback sur Chatterbox")
                        return await self._fallback_to_chatterbox()
                else:
                    logger.warning(f"[TTS] Espace disque insuffisant pour {model.value}, fallback sur Chatterbox")
                    return await self._fallback_to_chatterbox()

            # Afficher l'alerte de licence si nécessaire
            model_info = TTS_MODEL_INFO[model]
            if model_info.license_warning:
                logger.warning(model_info.license_warning)
                print(f"\n{model_info.license_warning}\n")

            # Charger le modèle
            success = await backend.initialize()

            if success:
                self.active_backend = backend
                self.current_model = model
                self.is_initialized = True
                logger.info(f"✅ [TTS] Modèle {model.value} chargé avec succès")

                # Lancer le téléchargement des autres modèles en arrière-plan
                asyncio.create_task(self._download_other_models_background())

                return True
            else:
                logger.warning(f"[TTS] Échec chargement {model.value}, fallback sur Chatterbox")
                return await self._fallback_to_chatterbox()

    async def _fallback_to_chatterbox(self) -> bool:
        """Fallback sur Chatterbox (modèle par défaut)"""
        fallback_model = TTSModel.get_fallback()

        if self.current_model == fallback_model and self.active_backend and self.active_backend.is_initialized:
            return True

        logger.info(f"[TTS] 🔄 Fallback sur {fallback_model.value}...")

        if fallback_model not in self.backends:
            self.backends[fallback_model] = self._create_backend(fallback_model)

        backend = self.backends[fallback_model]

        if not backend.is_available:
            logger.error("[TTS] ❌ Chatterbox (fallback) non disponible! Aucun modèle TTS utilisable.")
            return False

        # Télécharger si nécessaire
        if not backend.is_model_downloaded():
            logger.info("[TTS] Téléchargement de Chatterbox (fallback)...")
            await backend.download_model()

        success = await backend.initialize()

        if success:
            self.active_backend = backend
            self.current_model = fallback_model
            self.is_initialized = True
            logger.info(f"✅ [TTS] Fallback sur {fallback_model.value} réussi")
            return True
        else:
            logger.error("[TTS] ❌ Échec du fallback sur Chatterbox!")
            return False

    async def _download_other_models_background(self):
        """Télécharge les autres modèles en arrière-plan si espace disponible"""
        await asyncio.sleep(5)  # Attendre que le service soit stable

        for model in TTSModel:
            if model == self.current_model:
                continue

            # Vérifier si déjà en téléchargement
            if model in self._background_downloads:
                continue

            if model not in self.backends:
                self.backends[model] = self._create_backend(model)

            backend = self.backends[model]

            # Vérifier si le modèle est déjà téléchargé
            if backend.is_model_downloaded():
                continue

            # Vérifier si le package est disponible
            if not backend.is_available:
                continue

            # Vérifier l'espace disque
            if not self._can_download_model(model):
                logger.info(f"[TTS] Espace insuffisant pour télécharger {model.value} en arrière-plan")
                continue

            # Lancer le téléchargement en arrière-plan
            logger.info(f"[TTS] 📥 Téléchargement de {model.value} en arrière-plan...")

            async def download_task(m: TTSModel, b: BaseTTSBackend):
                try:
                    await b.download_model()
                except Exception as e:
                    logger.warning(f"[TTS] Erreur téléchargement arrière-plan {m.value}: {e}")
                finally:
                    if m in self._background_downloads:
                        del self._background_downloads[m]

            task = asyncio.create_task(download_task(model, backend))
            self._background_downloads[model] = task

            # Attendre un peu entre chaque téléchargement
            await asyncio.sleep(30)

    async def switch_model(self, model: TTSModel, force: bool = False) -> bool:
        """
        Change de modèle TTS (chargement à chaud).

        Args:
            model: Modèle cible
            force: Si True, force le rechargement même si déjà actif

        Returns:
            True si le changement a réussi
        """
        if model == self.current_model and self.active_backend and self.active_backend.is_initialized and not force:
            logger.info(f"[TTS] Modèle {model.value} déjà actif")
            return True

        logger.info(f"[TTS] 🔄 Changement de modèle: {self.current_model.value} → {model.value}")

        # Vérifier le statut du modèle
        status = await self.get_model_status(model)

        if not status.is_available:
            logger.warning(f"[TTS] Package {model.value} non disponible")
            return False

        if not status.is_downloaded:
            # Vérifier si on peut télécharger
            if not self._can_download_model(model):
                logger.warning(f"[TTS] Espace disque insuffisant pour {model.value}")
                return False

            logger.info(f"[TTS] Téléchargement de {model.value}...")
            backend = self.backends[model]
            success = await backend.download_model()

            if not success:
                logger.warning(f"[TTS] Échec téléchargement {model.value}")
                return False

        # Charger le nouveau modèle
        success = await self.initialize(model)

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
        **kwargs
    ) -> UnifiedTTSResult:
        """Synthétise du texte avec clonage vocal."""
        start_time = time.time()

        # Changer de modèle si nécessaire
        if model and model != self.current_model:
            success = await self.switch_model(model)
            if not success:
                # Fallback sur le modèle actuel
                logger.warning(f"[TTS] Impossible de changer vers {model.value}, utilisation de {self.current_model.value}")

        # Initialiser si nécessaire
        if not self.active_backend:
            await self.initialize()

        if not self.active_backend:
            raise RuntimeError(f"Aucun backend TTS disponible")

        # Préparer le fichier de sortie
        output_format = output_format or self.default_format
        file_id = message_id or str(uuid.uuid4())
        output_filename = f"{file_id}_{target_language}.{output_format}"
        output_path = str(self.output_dir / "translated" / output_filename)

        logger.info(f"[TTS] 🎤 Synthèse avec {self.current_model.value}: '{text[:50]}...' → {target_language}")

        try:
            await self.active_backend.synthesize(
                text=text,
                language=target_language,
                speaker_audio_path=speaker_audio_path,
                output_path=output_path,
                **kwargs
            )

            # Convertir le format si nécessaire
            if output_format != "wav":
                output_path = await self._convert_format(output_path, output_format)

            duration_ms = await self._get_duration_ms(output_path)
            processing_time = int((time.time() - start_time) * 1000)

            model_info = TTS_MODEL_INFO[self.current_model]

            logger.info(
                f"[TTS] ✅ Synthèse terminée: {output_filename} "
                f"(dur={duration_ms}ms, time={processing_time}ms, model={self.current_model.value})"
            )

            return UnifiedTTSResult(
                audio_path=output_path,
                audio_url=f"/outputs/audio/translated/{output_filename}",
                duration_ms=duration_ms,
                format=output_format,
                language=target_language,
                voice_cloned=bool(speaker_audio_path and os.path.exists(speaker_audio_path)),
                voice_quality=model_info.quality_score / 100.0,
                processing_time_ms=processing_time,
                text_length=len(text),
                model_used=self.current_model,
                model_info=model_info
            )

        except Exception as e:
            logger.error(f"[TTS] ❌ Erreur synthèse: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Échec de la synthèse TTS: {e}")

    async def synthesize(
        self,
        text: str,
        language: str,
        output_format: str = None,
        model: TTSModel = None,
        **kwargs
    ) -> UnifiedTTSResult:
        """Synthèse vocale simple (sans clonage)."""
        return await self.synthesize_with_voice(
            text=text,
            speaker_audio_path=None,
            target_language=language,
            output_format=output_format,
            model=model,
            **kwargs
        )

    async def _convert_format(self, input_path: str, target_format: str) -> str:
        """Convertit un fichier audio vers un autre format"""
        try:
            from pydub import AudioSegment

            output_path = input_path.rsplit(".", 1)[0] + f".{target_format}"

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: AudioSegment.from_wav(input_path).export(output_path, format=target_format)
            )

            if input_path != output_path and os.path.exists(input_path):
                os.unlink(input_path)

            return output_path

        except Exception as e:
            logger.warning(f"[TTS] Erreur conversion format: {e}")
            return input_path

    async def _get_duration_ms(self, audio_path: str) -> int:
        """Récupère la durée d'un fichier audio en ms"""
        try:
            import librosa
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            return int(duration * 1000)
        except Exception:
            return 0

    def get_model_info(self, model: TTSModel = None) -> TTSModelInfo:
        """Retourne les informations sur un modèle"""
        return TTS_MODEL_INFO[model or self.current_model]

    def get_available_models(self) -> Dict[str, TTSModelInfo]:
        """Retourne tous les modèles disponibles avec leurs infos"""
        return {model.value: info for model, info in TTS_MODEL_INFO.items()}

    def get_supported_languages(self, model: TTSModel = None) -> list:
        """Retourne les langues supportées par le modèle"""
        info = TTS_MODEL_INFO[model or self.current_model]
        return info.languages

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        models_status = await self.get_all_models_status()

        return {
            "service": "UnifiedTTSService",
            "initialized": self.is_initialized,
            "current_model": self.current_model.value,
            "requested_model": self.requested_model.value,
            "fallback_model": TTSModel.get_fallback().value,
            "current_model_info": {
                "name": TTS_MODEL_INFO[self.current_model].display_name,
                "license": TTS_MODEL_INFO[self.current_model].license,
                "commercial_use": TTS_MODEL_INFO[self.current_model].commercial_use,
                "quality_score": TTS_MODEL_INFO[self.current_model].quality_score,
                "languages_count": len(TTS_MODEL_INFO[self.current_model].languages)
            },
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
            "disk_space_available_gb": self._get_available_disk_space_gb(),
            "device": self.device,
            "output_dir": str(self.output_dir),
            "default_format": self.default_format
        }

    async def close(self):
        """Libère les ressources de tous les backends"""
        logger.info("[TTS] 🛑 Fermeture du service unifié")

        # Annuler les téléchargements en cours
        for task in self._background_downloads.values():
            task.cancel()
        self._background_downloads.clear()

        # Fermer tous les backends
        for backend in self.backends.values():
            await backend.close()
        self.backends.clear()
        self.active_backend = None
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_unified_tts_service() -> UnifiedTTSService:
    """Retourne l'instance singleton du service TTS unifié"""
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
