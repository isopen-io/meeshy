"""
Service TTS avec support du clonage vocal - Singleton
Génère des audios dans la voix de l'émetteur original.
Architecture: XTTS/Coqui TTS pour synthèse, compatible avec OpenVoice embeddings.
"""

import os
import logging
import time
import asyncio
import threading
import uuid
from typing import Optional, Dict, Any, Union
from dataclasses import dataclass
from pathlib import Path

# Configuration du logging
logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
TTS_AVAILABLE = False
AUDIO_PROCESSING_AVAILABLE = False

try:
    from TTS.api import TTS
    TTS_AVAILABLE = True
    logger.info("✅ [TTS] Coqui TTS disponible")
except ImportError:
    logger.warning("⚠️ [TTS] Coqui TTS non disponible - synthèse vocale désactivée")

try:
    import numpy as np
    from pydub import AudioSegment
    import soundfile as sf
    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ [TTS] Audio processing non disponible")
    import numpy as np


# Import du VoiceModel (type hint)
try:
    from services.voice_clone_service import VoiceModel
except ImportError:
    VoiceModel = Any  # Fallback pour type hints


@dataclass
class TTSResult:
    """Résultat d'une synthèse TTS"""
    audio_path: str
    audio_url: str
    duration_ms: int
    format: str
    language: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int
    text_length: int


class TTSService:
    """
    Service TTS avec support du clonage vocal - Singleton

    Fonctionnalités:
    - Synthèse vocale multilingue
    - Clonage vocal avec embedding OpenVoice
    - Support de multiples formats de sortie
    """

    _instance = None
    _lock = threading.Lock()

    # Mapping des codes de langue vers XTTS
    LANGUAGE_MAP = {
        "fr": "fr",
        "en": "en",
        "es": "es",
        "de": "de",
        "pt": "pt",
        "it": "it",
        "pl": "pl",
        "tr": "tr",
        "ru": "ru",
        "nl": "nl",
        "cs": "cs",
        "ar": "ar",
        "zh": "zh-cn",
        "zh-cn": "zh-cn",
        "zh-tw": "zh-cn",
        "ja": "ja",
        "hu": "hu",
        "ko": "ko"
    }

    # Voix par défaut par langue (si pas de clonage)
    DEFAULT_SPEAKERS = {
        "en": "Claribel Dervla",
        "fr": "Damien Black",
        "es": "Dionisio Schuyler",
        "de": "Annmarie Nele",
        "pt": "Szofi Granger",
        "it": "Gitta Nikolina",
    }

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
        output_dir: Optional[str] = None,
        device: str = "cpu",
        model_name: str = "tts_models/multilingual/multi-dataset/xtts_v2"
    ):
        if self._initialized:
            return

        # Configuration
        self.output_dir = Path(output_dir or os.getenv('TTS_OUTPUT_DIR', '/app/outputs/audio'))
        self.device = os.getenv('TTS_DEVICE', device)
        self.model_name = os.getenv('TTS_MODEL', model_name)
        self.default_format = os.getenv('TTS_DEFAULT_FORMAT', 'mp3')

        # TTS model
        self.tts_model = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Créer le répertoire de sortie
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "translated").mkdir(parents=True, exist_ok=True)

        logger.info(f"[TTS] Service créé: output_dir={self.output_dir}, device={self.device}")
        self._initialized = True

    async def initialize(self) -> bool:
        """Charge le modèle TTS"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            if not TTS_AVAILABLE:
                logger.warning("[TTS] Coqui TTS non disponible - mode dégradé")
                self.is_initialized = True
                return True

            try:
                start_time = time.time()
                logger.info(f"[TTS] 🔄 Chargement du modèle {self.model_name}...")

                # Charger dans un thread
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._load_tts_model)

                load_time = time.time() - start_time
                logger.info(f"[TTS] ✅ Modèle TTS chargé en {load_time:.2f}s")

                self.is_initialized = True
                return True

            except Exception as e:
                logger.error(f"[TTS] ❌ Erreur chargement TTS: {e}")
                import traceback
                traceback.print_exc()
                self.is_initialized = True  # Mode dégradé
                return True

    def _load_tts_model(self):
        """Charge le modèle TTS (appelé dans un thread)"""
        self.tts_model = TTS(
            model_name=self.model_name,
            progress_bar=False
        ).to(self.device)

    async def synthesize_with_voice(
        self,
        text: str,
        voice_model: 'VoiceModel',
        target_language: str,
        output_format: str = None,
        message_id: Optional[str] = None
    ) -> TTSResult:
        """
        Synthétise du texte avec la voix clonée.

        Args:
            text: Texte à synthétiser
            voice_model: Modèle de voix de l'émetteur
            target_language: Langue de sortie (code ISO 639-1)
            output_format: Format audio (mp3, wav, ogg)
            message_id: ID du message (pour nommer le fichier)

        Returns:
            TTSResult avec chemin du fichier audio généré
        """
        start_time = time.time()
        output_format = output_format or self.default_format

        # Générer nom de fichier
        file_id = message_id or str(uuid.uuid4())
        output_filename = f"{file_id}_{target_language}.{output_format}"
        output_path = self.output_dir / "translated" / output_filename

        # Mapper la langue
        xtts_lang = self._map_language_code(target_language)

        logger.info(f"[TTS] 🎤 Synthèse: '{text[:50]}...' → {target_language} ({xtts_lang})")

        try:
            if not self.tts_model:
                if not TTS_AVAILABLE:
                    raise RuntimeError("TTS non disponible")
                await self.initialize()
                if not self.tts_model:
                    raise RuntimeError("Échec initialisation TTS")

            # Synthèse avec voix clonée
            loop = asyncio.get_event_loop()

            # Vérifier si on a un fichier audio de référence (pour XTTS)
            speaker_wav = None
            if hasattr(voice_model, 'embedding_path') and voice_model.embedding_path:
                # Chercher un fichier audio dans le dossier du modèle
                voice_dir = Path(voice_model.embedding_path).parent
                combined_audio = voice_dir / "combined_audio.wav"
                if combined_audio.exists():
                    speaker_wav = str(combined_audio)

            if speaker_wav and os.path.exists(speaker_wav):
                # Synthèse avec clonage vocal
                await loop.run_in_executor(
                    None,
                    lambda: self.tts_model.tts_to_file(
                        text=text,
                        speaker_wav=speaker_wav,
                        language=xtts_lang,
                        file_path=str(output_path)
                    )
                )
                voice_cloned = True
            else:
                # Synthèse sans clonage (voix par défaut)
                logger.warning(f"[TTS] ⚠️ Pas de fichier audio de référence, utilisation voix par défaut")
                await loop.run_in_executor(
                    None,
                    lambda: self.tts_model.tts_to_file(
                        text=text,
                        language=xtts_lang,
                        file_path=str(output_path)
                    )
                )
                voice_cloned = False

            # Convertir si nécessaire (le format de sortie de XTTS est wav)
            if output_format != 'wav' and AUDIO_PROCESSING_AVAILABLE:
                output_path = await self._convert_audio_format(output_path, output_format)

            # Récupérer la durée
            duration_ms = await self._get_audio_duration_ms(str(output_path))

            processing_time = int((time.time() - start_time) * 1000)

            logger.info(
                f"[TTS] ✅ Synthèse terminée: {output_filename} "
                f"(dur={duration_ms}ms, time={processing_time}ms, cloned={voice_cloned})"
            )

            return TTSResult(
                audio_path=str(output_path),
                audio_url=f"/outputs/audio/translated/{output_filename}",
                duration_ms=duration_ms,
                format=output_format,
                language=target_language,
                voice_cloned=voice_cloned,
                voice_quality=voice_model.quality_score if voice_cloned else 0.0,
                processing_time_ms=processing_time,
                text_length=len(text)
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
        speaker: Optional[str] = None
    ) -> TTSResult:
        """
        Synthèse vocale simple (sans clonage).

        Args:
            text: Texte à synthétiser
            language: Langue de sortie
            output_format: Format audio
            speaker: Nom du speaker (optionnel)

        Returns:
            TTSResult
        """
        start_time = time.time()
        output_format = output_format or self.default_format

        # Générer nom de fichier
        output_filename = f"tts_{uuid.uuid4()}.{output_format}"
        output_path = self.output_dir / output_filename

        # Mapper la langue
        xtts_lang = self._map_language_code(language)

        logger.info(f"[TTS] 🎤 Synthèse simple: '{text[:50]}...' → {language}")

        try:
            if not self.tts_model:
                await self.initialize()
                if not self.tts_model:
                    raise RuntimeError("TTS non disponible")

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.tts_model.tts_to_file(
                    text=text,
                    language=xtts_lang,
                    file_path=str(output_path)
                )
            )

            # Convertir si nécessaire
            if output_format != 'wav' and AUDIO_PROCESSING_AVAILABLE:
                output_path = await self._convert_audio_format(output_path, output_format)

            duration_ms = await self._get_audio_duration_ms(str(output_path))
            processing_time = int((time.time() - start_time) * 1000)

            return TTSResult(
                audio_path=str(output_path),
                audio_url=f"/outputs/audio/{output_filename}",
                duration_ms=duration_ms,
                format=output_format,
                language=language,
                voice_cloned=False,
                voice_quality=0.0,
                processing_time_ms=processing_time,
                text_length=len(text)
            )

        except Exception as e:
            logger.error(f"[TTS] ❌ Erreur synthèse simple: {e}")
            raise RuntimeError(f"Échec de la synthèse TTS: {e}")

    def _map_language_code(self, lang: str) -> str:
        """Mappe les codes de langue vers les codes XTTS"""
        lang_lower = lang.lower()
        return self.LANGUAGE_MAP.get(lang_lower, "en")

    async def _convert_audio_format(self, input_path: Path, target_format: str) -> Path:
        """Convertit un fichier audio vers un autre format"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return input_path

        try:
            output_path = input_path.with_suffix(f".{target_format}")

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: AudioSegment.from_wav(str(input_path)).export(
                    str(output_path),
                    format=target_format
                )
            )

            # Supprimer le fichier wav original
            if input_path != output_path and input_path.exists():
                input_path.unlink()

            return output_path

        except Exception as e:
            logger.warning(f"[TTS] Erreur conversion format: {e}")
            return input_path

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
            logger.warning(f"[TTS] Impossible de lire la durée: {e}")
            return 0

    def get_supported_languages(self) -> list:
        """Retourne la liste des langues supportées"""
        return list(self.LANGUAGE_MAP.keys())

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        return {
            "service": "TTSService",
            "initialized": self.is_initialized,
            "tts_available": TTS_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "model_name": self.model_name,
            "device": self.device,
            "output_dir": str(self.output_dir),
            "default_format": self.default_format,
            "supported_languages": self.get_supported_languages()
        }

    async def close(self):
        """Libère les ressources"""
        logger.info("[TTS] 🛑 Fermeture du service")
        self.tts_model = None
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_tts_service() -> TTSService:
    """Retourne l'instance singleton du service TTS"""
    return TTSService()
