"""
VITS TTS Backend avec Pipeline Hybride de Clonage Vocal
========================================================

Backend VITS pour langues spécifiques (ex: Lingala)
Utilise ESPnet2 pour les modèles VITS + OpenVoice pour le clonage vocal.

Pipeline Hybride:
1. VITS génère l'audio dans la langue cible
2. OpenVoice convertit le timbre vers la voix source
"""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from ..base import BaseTTSBackend
from config.settings import get_settings

logger = logging.getLogger(__name__)

# Vérifier OpenVoice
OPENVOICE_AVAILABLE = False
try:
    from openvoice.api import ToneColorConverter
    OPENVOICE_AVAILABLE = True
    logger.info("✅ [VITS] OpenVoice disponible pour clonage vocal")
except ImportError:
    logger.info("ℹ️ [VITS] OpenVoice non disponible - clonage vocal désactivé")


class VITSBackend(BaseTTSBackend):
    """Backend VITS avec pipeline hybride de clonage vocal

    Utilise ESPnet2 pour les modèles VITS (DigitalUmuganda).
    Utilise OpenVoice pour le clonage vocal (conversion de timbre).

    Modèles supportés:
    - Lingala: DigitalUmuganda/lingala_vits_tts (ESPnet2)
    """

    # Mapping langue -> (repo_id, config_file, model_file)
    VITS_MODELS = {
        'ln': (
            'DigitalUmuganda/lingala_vits_tts',
            'config.yaml',
            'train.total_count.best.pth'
        ),
    }

    def __init__(self, device: str = "cpu"):
        super().__init__()
        self.device = device
        self._available = False
        self._espnet_available = False
        self._hf_hub_available = False
        self._openvoice_available = OPENVOICE_AVAILABLE
        self._models: Dict[str, Any] = {}  # Cache des modèles VITS par langue
        self._tone_converter = None  # OpenVoice ToneColorConverter
        self._speaker_embeddings: Dict[str, Any] = {}  # Cache des embeddings
        self._settings = get_settings()

        # Vérifier ESPnet2 et huggingface_hub
        try:
            from espnet2.bin.tts_inference import Text2Speech
            import soundfile
            self._espnet_available = True
            logger.info("✅ [TTS] VITS (ESPnet2) disponible")
        except ImportError as e:
            logger.warning(f"⚠️ [TTS] VITS (ESPnet2) non disponible - pip install espnet soundfile: {e}")

        try:
            from huggingface_hub import hf_hub_download
            self._hf_hub_available = True
        except ImportError:
            logger.warning("⚠️ [TTS] huggingface_hub non disponible")

        self._available = self._espnet_available and self._hf_hub_available

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def supports_voice_cloning(self) -> bool:
        """Indique si le clonage vocal est disponible"""
        return self._openvoice_available

    def is_model_downloaded(self) -> bool:
        """VITS télécharge les modèles à la demande"""
        return self._available

    async def download_model(self) -> bool:
        """VITS télécharge automatiquement"""
        return self._available

    async def initialize(self) -> bool:
        """Initialise VITS et OpenVoice si disponible"""
        if self._initialized:
            return True

        if not self._available:
            return False

        # Initialiser OpenVoice si disponible
        if self._openvoice_available and self._tone_converter is None:
            await self._initialize_openvoice()

        self._initialized = True
        logger.info("✅ [TTS] VITS initialisé (modèles chargés à la demande)")
        return True

    async def _initialize_openvoice(self):
        """Initialise OpenVoice pour le clonage vocal"""
        try:
            loop = asyncio.get_event_loop()

            def load_openvoice():
                # Les checkpoints sont dans le sous-dossier 'converter'
                base_path = self._settings.openvoice_checkpoints_path
                converter_dir = os.path.join(base_path, "converter")

                # Trouver les fichiers de config et checkpoints
                config_path = os.path.join(converter_dir, "config.json")
                ckpt_path = os.path.join(converter_dir, "checkpoint.pth")

                # Vérifier que les fichiers existent
                if not os.path.exists(config_path):
                    raise FileNotFoundError(f"Config OpenVoice non trouvé: {config_path}")
                if not os.path.exists(ckpt_path):
                    raise FileNotFoundError(f"Checkpoint OpenVoice non trouvé: {ckpt_path}")

                logger.info(f"[VITS] 🔄 Chargement OpenVoice depuis {converter_dir}")
                logger.info(f"[VITS]    Config: {config_path}")
                logger.info(f"[VITS]    Checkpoint: {ckpt_path}")

                # Créer le converter avec le fichier config
                converter = ToneColorConverter(
                    config_path,
                    device=self.device
                )
                # Désactiver le watermark manuellement (bug dans OpenVoice
                # qui ne gère pas correctement enable_watermark=False)
                converter.watermark_model = None
                # Charger les poids du modèle
                converter.load_ckpt(ckpt_path)

                return converter

            self._tone_converter = await loop.run_in_executor(None, load_openvoice)
            logger.info("✅ [VITS] OpenVoice ToneColorConverter chargé")

        except Exception as e:
            logger.warning(f"⚠️ [VITS] Impossible de charger OpenVoice: {e}")
            self._openvoice_available = False

    def supports_language(self, language: str) -> bool:
        """Vérifie si VITS a un modèle pour cette langue"""
        lang = language.lower().split('-')[0]
        return lang in self.VITS_MODELS

    async def _load_model_for_language(self, language: str):
        """Charge le modèle VITS (ESPnet2) pour une langue spécifique"""
        lang = language.lower().split('-')[0]

        if lang in self._models:
            return self._models[lang]

        if lang not in self.VITS_MODELS:
            raise ValueError(f"Pas de modèle VITS pour {language}")

        repo_id, config_file, model_file = self.VITS_MODELS[lang]

        if not self._espnet_available:
            raise RuntimeError("ESPnet2 non disponible - pip install espnet soundfile")

        try:
            from espnet2.bin.tts_inference import Text2Speech
            from huggingface_hub import hf_hub_download

            logger.info(f"[TTS] 📥 Téléchargement modèle VITS: {repo_id}")

            loop = asyncio.get_event_loop()

            def download_and_load():
                # Télécharger les fichiers depuis HuggingFace
                config_path = hf_hub_download(
                    repo_id=repo_id,
                    filename=config_file,
                    cache_dir=str(self._settings.huggingface_cache_path)
                )
                model_path = hf_hub_download(
                    repo_id=repo_id,
                    filename=model_file,
                    cache_dir=str(self._settings.huggingface_cache_path)
                )

                logger.info(f"[TTS] 📂 Config: {config_path}")
                logger.info(f"[TTS] 📂 Modèle: {model_path}")

                # Charger le modèle ESPnet2 directement
                model = Text2Speech(
                    train_config=config_path,
                    model_file=model_path,
                    device=self.device
                )
                return model

            model = await loop.run_in_executor(None, download_and_load)
            self._models[lang] = model

            logger.info(f"✅ [TTS] Modèle VITS {lang} chargé ({repo_id})")
            return model

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur chargement VITS {lang}: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Modèle VITS non disponible pour {language}: {e}")

    async def _extract_speaker_embedding(self, audio_path: str) -> Any:
        """Extrait l'embedding de voix d'un fichier audio avec OpenVoice

        Utilise directement ToneColorConverter.extract_se() pour éviter
        les limitations du VAD sur les audios courts.
        """
        if not self._openvoice_available or self._tone_converter is None:
            logger.warning(f"[VITS] OpenVoice non disponible pour extraction embedding")
            return None

        # Cache check
        cache_key = os.path.abspath(audio_path)
        if cache_key in self._speaker_embeddings:
            logger.info(f"[VITS] 📦 Embedding en cache pour {Path(audio_path).name}")
            return self._speaker_embeddings[cache_key]

        # Vérifier que le fichier existe
        if not os.path.exists(audio_path):
            logger.error(f"[VITS] ❌ Fichier audio non trouvé: {audio_path}")
            return None

        try:
            loop = asyncio.get_event_loop()

            def extract():
                logger.info(f"[VITS] 🔍 Extraction embedding pour: {audio_path}")

                # Utiliser directement extract_se() du ToneColorConverter
                # au lieu de se_extractor.get_se() qui a des limitations
                # sur la durée minimale des audios (VAD split)
                embedding = self._tone_converter.extract_se(
                    audio_path,
                    se_save_path=None  # Pas de sauvegarde, on cache en mémoire
                )

                if embedding is None:
                    logger.warning(f"[VITS] ⚠️ Embedding None retourné pour {audio_path}")
                else:
                    shape = embedding.shape if hasattr(embedding, 'shape') else 'unknown'
                    logger.info(f"[VITS] ✅ Embedding extrait, shape: {shape}")

                return embedding

            embedding = await loop.run_in_executor(None, extract)

            if embedding is not None:
                self._speaker_embeddings[cache_key] = embedding
                logger.info(f"✅ [VITS] Embedding extrait pour {Path(audio_path).name}")
            else:
                logger.warning(f"⚠️ [VITS] Échec extraction embedding pour {Path(audio_path).name}")

            return embedding

        except Exception as e:
            logger.error(f"❌ [VITS] Erreur extraction embedding: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _apply_voice_conversion(
        self,
        source_audio_path: str,
        target_speaker_audio_path: str,
        output_path: str,
        tau: float = 0.3
    ) -> str:
        """Applique la conversion vocale avec OpenVoice

        Args:
            source_audio_path: Audio synthétisé par VITS
            target_speaker_audio_path: Audio de référence (voix à cloner)
            output_path: Chemin de sortie
            tau: Paramètre de contrôle (0.0-1.0, défaut 0.3)

        Returns:
            Chemin du fichier audio converti
        """
        if not self._openvoice_available or self._tone_converter is None:
            logger.warning("[VITS] OpenVoice non disponible, retour audio original")
            return source_audio_path

        try:
            # Extraire les embeddings
            logger.info("[VITS] 🔄 Extraction des embeddings vocaux...")

            # Embedding de la voix synthétisée (source)
            src_se = await self._extract_speaker_embedding(source_audio_path)

            # Embedding de la voix cible (utilisateur)
            tgt_se = await self._extract_speaker_embedding(target_speaker_audio_path)

            if src_se is None or tgt_se is None:
                logger.warning("[VITS] Embeddings non disponibles, retour audio original")
                return source_audio_path

            loop = asyncio.get_event_loop()

            def convert():
                logger.info(f"[VITS] 🎭 Conversion vocale (tau={tau})...")
                self._tone_converter.convert(
                    audio_src_path=source_audio_path,
                    src_se=src_se,
                    tgt_se=tgt_se,
                    output_path=output_path,
                    tau=tau,
                    message=""  # Pas de watermark
                )
                return output_path

            result = await loop.run_in_executor(None, convert)

            logger.info(f"✅ [VITS] Conversion vocale terminée: {output_path}")
            return result

        except Exception as e:
            logger.error(f"❌ [VITS] Erreur conversion vocale: {e}")
            import traceback
            traceback.print_exc()
            # Fallback: retourner l'audio original
            return source_audio_path

    async def _apply_postprocessing(self, audio_path: str, sample_rate: int):
        """Applique le post-traitement audio pour améliorer la qualité"""
        try:
            from ..audio_postprocessor import AudioPostProcessor
            import soundfile as sf

            loop = asyncio.get_event_loop()

            def postprocess():
                # Charger l'audio
                audio, sr = sf.read(audio_path)

                # Créer le post-processeur avec les paramètres optimisés pour la voix
                processor = AudioPostProcessor(
                    normalize=True,
                    reduce_noise=False,  # Désactivé pour préserver le timbre
                    equalize=True,
                    compress_dynamics=False,
                    target_db=-3.0
                )

                # Appliquer le post-traitement
                processed = processor.process(audio, sr)

                # Sauvegarder
                sf.write(audio_path, processed, sr)

            await loop.run_in_executor(None, postprocess)
            logger.info(f"✅ [VITS] Post-traitement appliqué: {Path(audio_path).name}")

        except ImportError:
            logger.debug("[VITS] Post-traitement non disponible (module manquant)")
        except Exception as e:
            logger.warning(f"⚠️ [VITS] Erreur post-traitement: {e}")

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        voice_clone_tau: float = 0.3,
        postprocess: bool = True,
        **kwargs
    ) -> str:
        """Synthétise le texte avec VITS et optionnellement clone la voix

        Pipeline hybride:
        1. VITS génère l'audio dans la langue cible
        2. Si speaker_audio_path fourni et OpenVoice disponible:
           - Convertit le timbre vers la voix source
        3. Post-traitement audio (normalisation, égalisation)

        Args:
            text: Texte à synthétiser
            language: Code langue (ex: 'ln' pour Lingala)
            speaker_audio_path: Audio de référence pour clonage vocal (optionnel)
            output_path: Chemin de sortie
            voice_clone_tau: Paramètre de conversion (0.0-1.0, défaut 0.3)
            postprocess: Appliquer le post-traitement audio (défaut: True)

        Returns:
            Chemin du fichier audio généré
        """
        import soundfile as sf

        if not self._initialized:
            await self.initialize()

        model = await self._load_model_for_language(language)

        loop = asyncio.get_event_loop()

        # Étape 1: Synthèse VITS
        def generate():
            output = model(text)
            wav = output["wav"]
            return wav.numpy(), model.fs

        waveform, sample_rate = await loop.run_in_executor(None, generate)

        # Déterminer les chemins de fichiers
        if speaker_audio_path and self._openvoice_available:
            # Pipeline hybride: sauvegarder d'abord l'audio VITS temporaire
            temp_vits_path = output_path.replace(".wav", "_vits_temp.wav")
            sf.write(temp_vits_path, waveform, sample_rate, subtype="PCM_16")

            logger.info(f"[VITS] 📝 Audio VITS temporaire: {temp_vits_path}")

            # Étape 2: Conversion vocale avec OpenVoice
            final_path = await self._apply_voice_conversion(
                source_audio_path=temp_vits_path,
                target_speaker_audio_path=speaker_audio_path,
                output_path=output_path,
                tau=voice_clone_tau
            )

            # Nettoyer le fichier temporaire si conversion réussie
            if final_path != temp_vits_path and os.path.exists(temp_vits_path):
                try:
                    os.remove(temp_vits_path)
                except Exception:
                    pass

            # Étape 3: Post-traitement audio
            if postprocess:
                await self._apply_postprocessing(final_path, sample_rate)

            logger.info(f"✅ [TTS] VITS + Voice Clone terminé: {language} -> {final_path}")
            return final_path

        else:
            # Synthèse simple sans clonage
            sf.write(output_path, waveform, sample_rate, subtype="PCM_16")

            # Post-traitement audio
            if postprocess:
                await self._apply_postprocessing(output_path, sample_rate)

            logger.info(f"✅ [TTS] VITS synthèse terminée: {language} -> {output_path}")
            return output_path

    async def synthesize_with_clone(
        self,
        text: str,
        language: str,
        speaker_audio_path: str,
        output_path: str,
        tau: float = 0.3
    ) -> str:
        """Méthode explicite pour synthèse avec clonage vocal

        Alias pour synthesize() avec speaker_audio_path.
        """
        return await self.synthesize(
            text=text,
            language=language,
            speaker_audio_path=speaker_audio_path,
            output_path=output_path,
            voice_clone_tau=tau
        )

    async def close(self):
        """Libère les modèles chargés"""
        self._models.clear()
        self._speaker_embeddings.clear()
        self._tone_converter = None
        self._initialized = False
        logger.info("[TTS] VITS fermé")
