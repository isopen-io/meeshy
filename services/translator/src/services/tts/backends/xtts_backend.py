"""
XTTS v2 TTS Backend - Clonage Vocal Natif
=========================================

Backend XTTS v2 (Coqui) avec clonage vocal intégré.
Supporte 17 langues avec seulement 6 secondes d'audio de référence.

Installation:
    pip install TTS

Avantages par rapport à OpenVoice:
- Clonage vocal natif (pas de pipeline hybride)
- Meilleure qualité et expressivité
- Support multilingue étendu
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional

from ..base import BaseTTSBackend
from config.settings import get_settings

logger = logging.getLogger(__name__)


class XTTSBackend(BaseTTSBackend):
    """Backend XTTS v2 (Coqui) avec clonage vocal natif

    XTTS v2 est un modèle TTS multilingue avec clonage vocal intégré.
    Il peut reproduire une voix à partir de seulement 6 secondes d'audio.

    Langues supportées:
        en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, ja, hu, ko, hi

    Installation:
        pip install TTS
    """

    # Langues supportées par XTTS v2
    SUPPORTED_LANGUAGES = {
        "en": "en",      # English
        "es": "es",      # Spanish
        "fr": "fr",      # French
        "de": "de",      # German
        "it": "it",      # Italian
        "pt": "pt",      # Portuguese
        "pl": "pl",      # Polish
        "tr": "tr",      # Turkish
        "ru": "ru",      # Russian
        "nl": "nl",      # Dutch
        "cs": "cs",      # Czech
        "ar": "ar",      # Arabic
        "zh": "zh-cn",   # Chinese
        "ja": "ja",      # Japanese
        "hu": "hu",      # Hungarian
        "ko": "ko",      # Korean
        "hi": "hi",      # Hindi
    }

    def __init__(self, device: str = "auto"):
        super().__init__()
        self.device = device
        self.model = None
        self._available = False
        self._settings = get_settings()
        self._xtts_path = Path(self._settings.xtts_models_path)

        try:
            from TTS.api import TTS
            self._available = True
            logger.info("✅ [TTS] XTTS v2 package disponible")
        except ImportError:
            logger.info("ℹ️ [TTS] XTTS v2 non disponible - pip install TTS")

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def supports_voice_cloning(self) -> bool:
        """XTTS supporte nativement le clonage vocal"""
        return True

    def supports_language(self, language: str) -> bool:
        """Vérifie si la langue est supportée"""
        lang = language.lower().split('-')[0]
        return lang in self.SUPPORTED_LANGUAGES

    def is_model_downloaded(self) -> bool:
        """Vérifie si XTTS v2 est téléchargé"""
        if not self._available:
            return False

        try:
            # Vérifier dans notre chemin centralisé
            xtts_model_path = self._xtts_path / "tts_models--multilingual--multi-dataset--xtts_v2"
            if xtts_model_path.exists():
                return True
            # Fallback: vérifier l'ancien chemin par défaut
            legacy_path = Path.home() / ".local" / "share" / "tts" / "tts_models--multilingual--multi-dataset--xtts_v2"
            return legacy_path.exists()
        except Exception:
            return False

    async def download_model(self) -> bool:
        """Télécharge XTTS v2 (~1.8 GB)"""
        if not self._available:
            return False

        self._downloading = True
        self._download_progress = 0.0

        try:
            from TTS.api import TTS

            os.environ['TTS_HOME'] = str(self._xtts_path)
            logger.info(f"[TTS] 📥 Téléchargement de XTTS v2 vers {self._xtts_path}...")
            logger.info("[TTS] ⚠️ Ceci peut prendre plusieurs minutes (~1.8 GB)")

            loop = asyncio.get_event_loop()

            await loop.run_in_executor(
                None,
                lambda: TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True)
            )

            self._download_progress = 100.0
            logger.info("✅ [TTS] XTTS v2 téléchargé avec succès")
            return True

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur téléchargement XTTS v2: {e}")
            return False

        finally:
            self._downloading = False

    async def initialize(self) -> bool:
        """Initialise le modèle XTTS v2"""
        if self._initialized:
            return True

        if not self._available:
            return False

        try:
            from TTS.api import TTS

            os.environ['TTS_HOME'] = str(self._xtts_path)

            logger.info(f"[TTS] 🔄 Chargement XTTS v2 depuis {self._xtts_path}...")

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
        postprocess: bool = True,
        **kwargs
    ) -> str:
        """Synthétise le texte avec clonage vocal natif

        Args:
            text: Texte à synthétiser
            language: Code langue (ex: 'fr', 'en', 'es')
            speaker_audio_path: Audio de référence pour clonage (min 6s recommandé)
            output_path: Chemin du fichier de sortie
            postprocess: Appliquer le post-traitement audio

        Returns:
            Chemin du fichier audio généré
        """
        if not self._initialized:
            await self.initialize()

        if not self.model:
            raise RuntimeError("XTTS v2 non initialisé")

        loop = asyncio.get_event_loop()

        # Mapper la langue
        lang = language.lower().split('-')[0]
        xtts_lang = self.SUPPORTED_LANGUAGES.get(lang, "en")

        logger.info(f"[TTS] 🔊 XTTS synthèse: {language} -> {xtts_lang}")

        if speaker_audio_path and os.path.exists(speaker_audio_path):
            logger.info(f"[TTS] 🎭 Clonage vocal depuis: {Path(speaker_audio_path).name}")

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
            # Sans clonage - utilise la voix par défaut
            await loop.run_in_executor(
                None,
                lambda: self.model.tts_to_file(
                    text=text,
                    language=xtts_lang,
                    file_path=output_path
                )
            )

        # Post-traitement
        if postprocess:
            await self._apply_postprocessing(output_path)

        logger.info(f"✅ [TTS] XTTS synthèse terminée: {output_path}")
        return output_path

    async def _apply_postprocessing(self, audio_path: str):
        """Applique le post-traitement audio"""
        try:
            from ..audio_postprocessor import AudioPostProcessor
            import soundfile as sf

            loop = asyncio.get_event_loop()

            def postprocess():
                audio, sr = sf.read(audio_path)
                processor = AudioPostProcessor(
                    normalize=True,
                    reduce_noise=False,
                    equalize=True,
                    compress_dynamics=False,
                    target_db=-3.0
                )
                processed = processor.process(audio, sr)
                sf.write(audio_path, processed, sr)

            await loop.run_in_executor(None, postprocess)
            logger.debug(f"[TTS] Post-traitement appliqué: {Path(audio_path).name}")

        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"⚠️ [TTS] Erreur post-traitement: {e}")

    async def close(self):
        """Libère les ressources"""
        self.model = None
        self._initialized = False
        logger.info("[TTS] XTTS fermé")
