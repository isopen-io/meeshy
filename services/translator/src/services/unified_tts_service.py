"""
Service TTS Unifié avec support multi-modèles - Singleton
Supporte: Chatterbox (recommandé), Higgs Audio V2, XTTS (legacy)

Architecture:
- Interface unifiée pour tous les modèles TTS
- Sélection du modèle via configuration
- Alertes automatiques pour les licences commerciales
"""

import os
import logging
import time
import asyncio
import threading
import uuid
import warnings
from typing import Optional, Dict, Any, Union, Literal
from dataclasses import dataclass, field
from pathlib import Path
from enum import Enum
from abc import ABC, abstractmethod

# Configuration du logging
logger = logging.getLogger(__name__)


class TTSModel(str, Enum):
    """Modèles TTS disponibles"""
    CHATTERBOX = "chatterbox"           # Recommandé - Apache 2.0
    CHATTERBOX_TURBO = "chatterbox-turbo"  # Plus rapide, 350M params
    HIGGS_AUDIO_V2 = "higgs-audio-v2"   # État de l'art - Licence limitée
    XTTS_V2 = "xtts-v2"                 # Legacy - Non-commercial

    @classmethod
    def get_default(cls) -> 'TTSModel':
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
        vram_gb=4.0
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
        vram_gb=2.0
    ),
    TTSModel.HIGGS_AUDIO_V2: TTSModelInfo(
        name="higgs-audio-v2",
        display_name="Higgs Audio V2 (Boson AI)",
        license="Boson Higgs Audio 2 Community License",
        commercial_use=False,  # Limité à < 100k users
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
        ],  # 50+ langues
        min_audio_seconds=3.0,
        quality_score=98,
        speed_score=75,
        vram_gb=8.0
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
        vram_gb=4.0
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

    @abstractmethod
    async def initialize(self) -> bool:
        """Initialise le backend"""
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
        """Vérifie si le backend est disponible"""
        pass


class ChatterboxBackend(BaseTTSBackend):
    """Backend Chatterbox (Resemble AI)"""

    def __init__(self, device: str = "auto", turbo: bool = False):
        self.device = device
        self.turbo = turbo
        self.model = None
        self._available = False
        self._initialized = False

        try:
            from chatterbox.tts import ChatterboxTTS
            self._available = True
            logger.info("✅ [TTS] Chatterbox disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] Chatterbox non disponible")

    @property
    def is_available(self) -> bool:
        return self._available

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

            logger.info(f"[TTS] 🔄 Chargement Chatterbox {'Turbo' if self.turbo else ''}...")

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
            logger.info(f"✅ [TTS] Chatterbox {'Turbo' if self.turbo else ''} initialisé sur {device}")
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
            # Avec clonage vocal
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
            # Sans clonage
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
        self.device = device
        self.model = None
        self.tokenizer = None
        self._available = False
        self._initialized = False

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torchaudio
            self._available = True
            logger.info("✅ [TTS] Higgs Audio V2 disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] Higgs Audio V2 non disponible (transformers requis)")

    @property
    def is_available(self) -> bool:
        return self._available

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

            # Charger le modèle
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

        # Préparer le prompt
        if speaker_audio_path and os.path.exists(speaker_audio_path):
            # Charger l'audio de référence pour le clonage
            ref_audio, sr = await loop.run_in_executor(
                None,
                lambda: torchaudio.load(speaker_audio_path)
            )
            # Le modèle supporte le clonage via le prompt audio
            prompt = f"[voice_clone]{text}"
        else:
            prompt = text

        # Générer
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

            # Décoder l'audio (le modèle retourne des tokens audio)
            audio_tokens = outputs[0][inputs["input_ids"].shape[1]:]
            audio = self.model.decode_audio(audio_tokens)
            return audio

        audio = await loop.run_in_executor(None, generate)

        # Sauvegarder
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
        self.device = device
        self.model = None
        self._available = False
        self._initialized = False

        try:
            from TTS.api import TTS
            self._available = True
            logger.info("✅ [TTS] XTTS v2 disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] XTTS v2 non disponible")

    @property
    def is_available(self) -> bool:
        return self._available

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

        # Mapper le code de langue
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

    Supporte plusieurs backends:
    - Chatterbox (recommandé) - Apache 2.0
    - Chatterbox Turbo - Plus rapide
    - Higgs Audio V2 - État de l'art (licence limitée)
    - XTTS v2 - Legacy (non-commercial)
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        model: TTSModel = None,
        output_dir: Optional[str] = None,
        device: str = "auto"
    ):
        if self._initialized:
            return

        # Configuration
        model_env = os.getenv("TTS_MODEL", "chatterbox")
        self.current_model = model or TTSModel(model_env)
        self.output_dir = Path(output_dir or os.getenv("TTS_OUTPUT_DIR", "/app/outputs/audio"))
        self.device = os.getenv("TTS_DEVICE", device)
        self.default_format = os.getenv("TTS_DEFAULT_FORMAT", "wav")

        # Backends
        self.backends: Dict[TTSModel, BaseTTSBackend] = {}
        self.active_backend: Optional[BaseTTSBackend] = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Créer les répertoires
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "translated").mkdir(parents=True, exist_ok=True)

        # Afficher les infos du modèle sélectionné
        model_info = TTS_MODEL_INFO[self.current_model]
        logger.info(f"[TTS] Service configuré: model={self.current_model.value}, device={self.device}")
        logger.info(f"[TTS] Licence: {model_info.license} (commercial={model_info.commercial_use})")

        # Afficher l'alerte si nécessaire
        if model_info.license_warning:
            logger.warning(model_info.license_warning)
            print(f"\n{model_info.license_warning}\n")

        self._initialized = True

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

    async def initialize(self, model: TTSModel = None) -> bool:
        """Initialise le service avec le modèle spécifié"""
        model = model or self.current_model

        async with self._init_lock:
            if model in self.backends and self.backends[model]._initialized:
                self.active_backend = self.backends[model]
                self.current_model = model
                return True

            # Créer et initialiser le backend
            backend = self._create_backend(model)

            if not backend.is_available:
                logger.error(f"[TTS] Backend {model.value} non disponible")
                return False

            success = await backend.initialize()

            if success:
                self.backends[model] = backend
                self.active_backend = backend
                self.current_model = model
                self.is_initialized = True
                logger.info(f"✅ [TTS] Backend {model.value} initialisé")

            return success

    async def switch_model(self, model: TTSModel) -> bool:
        """Change de modèle TTS"""
        if model == self.current_model and self.active_backend:
            return True

        logger.info(f"[TTS] 🔄 Changement de modèle: {self.current_model.value} → {model.value}")

        # Afficher l'alerte du nouveau modèle
        model_info = TTS_MODEL_INFO[model]
        if model_info.license_warning:
            logger.warning(model_info.license_warning)
            print(f"\n{model_info.license_warning}\n")

        return await self.initialize(model)

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
        """
        Synthétise du texte avec clonage vocal.

        Args:
            text: Texte à synthétiser
            speaker_audio_path: Chemin vers l'audio de référence pour le clonage
            target_language: Langue cible (code ISO 639-1)
            output_format: Format de sortie (wav, mp3, ogg)
            message_id: ID du message pour nommer le fichier
            model: Modèle à utiliser (optionnel, utilise le modèle actuel par défaut)

        Returns:
            UnifiedTTSResult avec les détails de la synthèse
        """
        start_time = time.time()

        # Changer de modèle si nécessaire
        if model and model != self.current_model:
            await self.switch_model(model)

        # Initialiser si nécessaire
        if not self.active_backend:
            await self.initialize()

        if not self.active_backend:
            raise RuntimeError(f"Aucun backend TTS disponible pour {self.current_model.value}")

        # Préparer le fichier de sortie
        output_format = output_format or self.default_format
        file_id = message_id or str(uuid.uuid4())
        output_filename = f"{file_id}_{target_language}.{output_format}"
        output_path = str(self.output_dir / "translated" / output_filename)

        logger.info(f"[TTS] 🎤 Synthèse avec {self.current_model.value}: '{text[:50]}...' → {target_language}")

        # Synthétiser
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

            # Calculer la durée
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
        """
        Synthèse vocale simple (sans clonage).
        """
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

            # Supprimer l'original
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
        return {
            "service": "UnifiedTTSService",
            "initialized": self.is_initialized,
            "current_model": self.current_model.value,
            "current_model_info": {
                "name": TTS_MODEL_INFO[self.current_model].display_name,
                "license": TTS_MODEL_INFO[self.current_model].license,
                "commercial_use": TTS_MODEL_INFO[self.current_model].commercial_use,
                "quality_score": TTS_MODEL_INFO[self.current_model].quality_score,
                "languages_count": len(TTS_MODEL_INFO[self.current_model].languages)
            },
            "device": self.device,
            "output_dir": str(self.output_dir),
            "default_format": self.default_format,
            "available_models": list(TTS_MODEL_INFO.keys())
        }

    async def close(self):
        """Libère les ressources de tous les backends"""
        logger.info("[TTS] 🛑 Fermeture du service unifié")
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
def check_license_compliance(model: TTSModel) -> tuple[bool, Optional[str]]:
    """
    Vérifie la conformité de la licence pour un usage commercial.

    Returns:
        (is_commercial_ok, warning_message)
    """
    info = TTS_MODEL_INFO[model]
    return info.commercial_use, info.license_warning
