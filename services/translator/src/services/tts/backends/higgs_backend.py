"""
Higgs Audio V2 TTS Backend
==========================

Backend Higgs Audio V2 (Boson AI) - État de l'art
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from ..base import BaseTTSBackend
from config.settings import get_settings

logger = logging.getLogger(__name__)

_background_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tts_download")


class HiggsAudioBackend(BaseTTSBackend):
    """Backend Higgs Audio V2 (Boson AI)"""

    def __init__(self, device: str = "auto"):
        super().__init__()
        self.device = device
        self.model = None
        self.tokenizer = None
        self._available = False
        self._settings = get_settings()
        self._models_path = Path(self._settings.huggingface_cache_path)

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
            logger.info(f"[TTS] 📥 Téléchargement de {model_id} vers {self._models_path}...")

            loop = asyncio.get_event_loop()

            def download():
                return snapshot_download(
                    repo_id=model_id,
                    cache_dir=str(self._models_path),
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
