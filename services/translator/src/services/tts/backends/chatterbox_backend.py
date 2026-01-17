"""
Chatterbox TTS Backend
======================

Backend Chatterbox (Resemble AI) - MODÈLE PAR DÉFAUT
Supporte le clonage vocal pour 23 langues.

INTÉGRATION: Ce backend utilise le ModelManager centralisé pour:
- Gestion mémoire unifiée avec éviction LRU
- Statistiques globales sur les modèles Chatterbox chargés
- Pas de duplication de modèles entre sessions
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from ..base import BaseTTSBackend
from config.settings import get_settings
from services.voice_analyzer_service import VoiceAnalyzerService, VoiceCharacteristics
from ...model_manager import TTSBackend as TTSBackendEnum

logger = logging.getLogger(__name__)

_background_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tts_download")


class ChatterboxBackend(BaseTTSBackend):
    """Backend Chatterbox (Resemble AI) - MODÈLE PAR DÉFAUT ET FALLBACK

    Supporte 2 modes:
    - Monolingual (ChatterboxTTS): Anglais uniquement, plus léger
    - Multilingual (ChatterboxMultilingualTTS): 23 langues supportées
    """

    # Langues supportées par le modèle multilingue
    MULTILINGUAL_LANGUAGES = {
        'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
        'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv',
        'sw', 'tr', 'zh'
    }

    def __init__(self, device: str = "auto", turbo: bool = False):
        super().__init__()
        self.device = device
        self.turbo = turbo
        # NOTE: Les modèles sont maintenant gérés par le ModelManager centralisé
        # au lieu d'attributs locaux. On garde les IDs pour les récupérer.
        backend_name = TTSBackendEnum.CHATTERBOX_TURBO.value if turbo else TTSBackendEnum.CHATTERBOX.value
        self._model_id = f"tts_{backend_name}_mono"
        self._model_id_multi = f"tts_{backend_name}_multilingual"
        self._available = False
        self._available_multilingual = False
        self._initialized_multilingual = False
        self._settings = get_settings()
        self._models_path = Path(self._settings.huggingface_cache_path)

        try:
            from chatterbox.tts import ChatterboxTTS
            self._available = True
            logger.info(f"✅ [TTS] Chatterbox {'Turbo' if turbo else ''} package disponible")
        except ImportError:
            logger.warning(f"⚠️ [TTS] Chatterbox {'Turbo' if turbo else ''} package non disponible")

        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            self._available_multilingual = True
            logger.info("✅ [TTS] Chatterbox Multilingual (23 langues) disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] Chatterbox Multilingual non disponible")

    @property
    def is_available(self) -> bool:
        return self._available or self._available_multilingual

    def is_model_downloaded(self) -> bool:
        """Vérifie si le modèle Chatterbox est téléchargé"""
        if not self._available:
            return False

        try:
            from huggingface_hub import try_to_load_from_cache
            model_id = "ResembleAI/chatterbox-turbo" if self.turbo else "ResembleAI/chatterbox"
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
            logger.error(f"[TTS] ❌ Erreur téléchargement Chatterbox: {e}")
            return False

        finally:
            self._downloading = False

    def _get_device(self):
        """Détermine le device à utiliser."""
        import torch
        if self.device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        return self.device

    async def initialize(self) -> bool:
        """Initialise le modèle monolingual (anglais)."""
        if self._initialized:
            return True

        # Vérifier si déjà dans le ModelManager
        if self._has_model(self._model_id):
            logger.debug(f"[TTS] Chatterbox mono récupéré depuis ModelManager")
            self._initialized = True
            return True

        if not self._available:
            return False

        try:
            from chatterbox.tts import ChatterboxTTS

            device = self._get_device()
            model_name = "Turbo" if self.turbo else ""
            logger.info(f"[TTS] 🔄 Chargement Chatterbox {model_name}...")

            loop = asyncio.get_event_loop()

            if self.turbo:
                model = await loop.run_in_executor(
                    None,
                    lambda: ChatterboxTTS.from_pretrained("ResembleAI/chatterbox-turbo", device=device)
                )
            else:
                model = await loop.run_in_executor(
                    None,
                    lambda: ChatterboxTTS.from_pretrained(device=device)
                )

            # Enregistrer dans le ModelManager centralisé
            backend_name = TTSBackendEnum.CHATTERBOX_TURBO.value if self.turbo else TTSBackendEnum.CHATTERBOX.value
            self._register_model(
                model_id=self._model_id,
                model_object=model,
                backend=backend_name,
                priority=1  # Haute priorité - modèle principal
            )

            self._initialized = True
            logger.info(f"✅ [TTS] Chatterbox {model_name} initialisé sur {device} (via ModelManager)")
            return True

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur initialisation Chatterbox: {e}")
            return False

    async def initialize_multilingual(self) -> bool:
        """Initialise le modèle multilingue (23 langues)."""
        if self._initialized_multilingual:
            return True

        # Vérifier si déjà dans le ModelManager
        if self._has_model(self._model_id_multi):
            logger.debug(f"[TTS] Chatterbox multilingue récupéré depuis ModelManager")
            self._initialized_multilingual = True
            return True

        if not self._available_multilingual:
            logger.warning("[TTS] Chatterbox Multilingual non disponible")
            return False

        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            import torch

            device = self._get_device()
            logger.info(f"[TTS] 🔄 Chargement Chatterbox Multilingual (23 langues)...")

            # Monkey patch torch.load pour gérer le mapping CUDA -> CPU/MPS
            original_torch_load = torch.load

            def patched_torch_load(*args, **kwargs):
                if 'map_location' not in kwargs:
                    kwargs['map_location'] = device
                if 'weights_only' not in kwargs:
                    kwargs['weights_only'] = False
                return original_torch_load(*args, **kwargs)

            torch.load = patched_torch_load

            try:
                loop = asyncio.get_event_loop()
                model_multilingual = await loop.run_in_executor(
                    None,
                    lambda: ChatterboxMultilingualTTS.from_pretrained(device=device)
                )
            finally:
                torch.load = original_torch_load

            # Enregistrer dans le ModelManager centralisé
            backend_name = TTSBackendEnum.CHATTERBOX_TURBO.value if self.turbo else TTSBackendEnum.CHATTERBOX.value
            self._register_model(
                model_id=self._model_id_multi,
                model_object=model_multilingual,
                backend=backend_name,
                priority=1  # Haute priorité - modèle multilingue très utilisé
            )

            self._initialized_multilingual = True
            logger.info(f"✅ [TTS] Chatterbox Multilingual initialisé sur {device} (via ModelManager)")
            return True

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur initialisation Chatterbox Multilingual: {e}")
            import traceback
            traceback.print_exc()
            return False

    # Valeurs par défaut des paramètres Chatterbox
    DEFAULT_PARAMS = {
        "exaggeration": 0.5,      # 0.0-1.0: Expressivité vocale
        "cfg_weight": 0.5,        # 0.0-1.0: Guidance du modèle
        "temperature": 0.8,       # 0.0-2.0: Créativité/aléatoire
        "repetition_penalty": 1.2,  # 1.0-3.0: Pénalité répétition (mono)
        "repetition_penalty_multilingual": 2.0,  # 1.0-3.0: Pénalité répétition (multi)
        "min_p": 0.05,           # 0.0-1.0: Probabilité minimum sampling
        "top_p": 1.0,            # 0.0-1.0: Nucleus sampling
    }

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        # Paramètres de clonage vocal
        exaggeration: Optional[float] = None,
        cfg_weight: Optional[float] = None,
        # Paramètres de génération
        temperature: Optional[float] = None,
        repetition_penalty: Optional[float] = None,
        min_p: Optional[float] = None,
        top_p: Optional[float] = None,
        # Options
        auto_optimize_params: bool = True,
        voice_characteristics: Optional[VoiceCharacteristics] = None,
        **kwargs
    ) -> str:
        """
        Synthèse vocale avec Chatterbox.

        Args:
            text: Texte à synthétiser
            language: Code langue (ex: 'fr', 'en', 'es')
            speaker_audio_path: Chemin vers l'audio de référence pour le clonage
            output_path: Chemin de sortie

            PARAMÈTRES DE CLONAGE VOCAL:
            exaggeration: Expressivité (0.0-1.0). Amplifie les caractéristiques vocales.
                         0.0 = neutre, 1.0 = très expressif. Si None, auto-calculé
            cfg_weight: Guidance (0.0-1.0). Contrôle la fidélité au texte.
                       0.0 = créatif, 1.0 = strict. Si None, auto-calculé

            PARAMÈTRES DE GÉNÉRATION:
            temperature: Créativité (0.0-2.0). Contrôle le caractère aléatoire.
                        0.0 = déterministe, 2.0 = très créatif. Défaut: 0.8
            repetition_penalty: Pénalité répétition (1.0-3.0). Évite les répétitions.
                               1.0 = pas de pénalité, 3.0 = forte pénalité.
                               Défaut: 1.2 (mono), 2.0 (multi)
            min_p: Probabilité minimum (0.0-1.0). Filtre les tokens improbables.
                   Défaut: 0.05
            top_p: Nucleus sampling (0.0-1.0). Limite aux tokens les plus probables.
                   Défaut: 1.0

            OPTIONS:
            auto_optimize_params: Calculer automatiquement exaggeration/cfg_weight
            voice_characteristics: Caractéristiques vocales pré-analysées
        """
        import torchaudio

        # Normaliser le code langue (ex: fr-FR -> fr)
        lang_code = language.split('-')[0].lower() if language else 'en'

        # Déterminer si on utilise le modèle multilingue
        use_multilingual = (
            lang_code != 'en' and
            lang_code in self.MULTILINGUAL_LANGUAGES and
            self._available_multilingual
        )

        # ═══════════════════════════════════════════════════════════════════
        # AUTO-OPTIMISATION DES PARAMÈTRES DE CLONAGE
        # ═══════════════════════════════════════════════════════════════════
        # Si au moins un paramètre n'est pas spécifié et qu'on a un audio de référence
        any_param_missing = any(p is None for p in [exaggeration, cfg_weight, temperature, repetition_penalty, min_p, top_p])

        if auto_optimize_params and speaker_audio_path and os.path.exists(speaker_audio_path) and any_param_missing:
            optimal_params = await self._get_optimal_params(
                speaker_audio_path,
                lang_code,
                voice_characteristics
            )
            # Appliquer les paramètres optimaux uniquement pour ceux non spécifiés
            if exaggeration is None:
                exaggeration = optimal_params["exaggeration"]
            if cfg_weight is None:
                cfg_weight = optimal_params["cfg_weight"]
            if temperature is None:
                temperature = optimal_params.get("temperature", self.DEFAULT_PARAMS["temperature"])
            if repetition_penalty is None:
                repetition_penalty = optimal_params.get("repetition_penalty", self.DEFAULT_PARAMS["repetition_penalty"])
            if min_p is None:
                min_p = optimal_params.get("min_p", self.DEFAULT_PARAMS["min_p"])
            if top_p is None:
                top_p = optimal_params.get("top_p", self.DEFAULT_PARAMS["top_p"])

            logger.info(
                f"[TTS] Auto-optimisation: exp={exaggeration:.2f}, cfg={cfg_weight:.2f}, "
                f"temp={temperature:.2f}, rep_pen={repetition_penalty:.2f} "
                f"({optimal_params.get('explanation', '')})"
            )

        # ═══════════════════════════════════════════════════════════════════
        # APPLIQUER LES VALEURS PAR DÉFAUT
        # ═══════════════════════════════════════════════════════════════════
        if exaggeration is None:
            exaggeration = self.DEFAULT_PARAMS["exaggeration"]
        if cfg_weight is None:
            cfg_weight = self.DEFAULT_PARAMS["cfg_weight"]
        if temperature is None:
            temperature = self.DEFAULT_PARAMS["temperature"]
        if repetition_penalty is None:
            repetition_penalty = (
                self.DEFAULT_PARAMS["repetition_penalty_multilingual"]
                if use_multilingual
                else self.DEFAULT_PARAMS["repetition_penalty"]
            )
        if min_p is None:
            min_p = self.DEFAULT_PARAMS["min_p"]
        if top_p is None:
            top_p = self.DEFAULT_PARAMS["top_p"]

        logger.debug(
            f"[TTS] Params: lang={lang_code}, exp={exaggeration:.2f}, cfg={cfg_weight:.2f}, "
            f"temp={temperature:.2f}, rep_pen={repetition_penalty:.2f}, min_p={min_p:.2f}, top_p={top_p:.2f}"
        )

        # ═══════════════════════════════════════════════════════════════════
        # INITIALISATION DU MODÈLE
        # ═══════════════════════════════════════════════════════════════════
        model_mono = None
        model_multi = None

        if use_multilingual:
            if not self._initialized_multilingual:
                await self.initialize_multilingual()

            model_multi = self._get_model(self._model_id_multi)
            if not model_multi:
                logger.warning(f"[TTS] Multilingual non disponible, fallback sur monolingual pour {lang_code}")
                use_multilingual = False

        if not use_multilingual:
            if not self._initialized:
                await self.initialize()

            model_mono = self._get_model(self._model_id)
            if not model_mono:
                raise RuntimeError("Chatterbox non initialisé")

        loop = asyncio.get_event_loop()

        # ═══════════════════════════════════════════════════════════════════
        # GÉNÉRATION AUDIO
        # ═══════════════════════════════════════════════════════════════════
        if use_multilingual:
            # Pour le clonage cross-langue, cfg_weight=0 réduit le transfert d'accent
            effective_cfg = 0.0 if lang_code != 'en' else cfg_weight

            # Capturer les paramètres locaux pour le lambda
            _model = model_multi
            _text = text
            _lang_code = lang_code
            _speaker = speaker_audio_path
            _exp = exaggeration
            _cfg = effective_cfg
            _temp = temperature
            _rep_pen = repetition_penalty
            _min_p = min_p
            _top_p = top_p

            if speaker_audio_path and os.path.exists(speaker_audio_path):
                wav = await loop.run_in_executor(
                    None,
                    lambda: _model.generate(
                        text=_text,
                        language_id=_lang_code,
                        audio_prompt_path=_speaker,
                        exaggeration=_exp,
                        cfg_weight=_cfg,
                        temperature=_temp,
                        repetition_penalty=_rep_pen,
                        min_p=_min_p,
                        top_p=_top_p
                    )
                )
            else:
                wav = await loop.run_in_executor(
                    None,
                    lambda: _model.generate(
                        text=_text,
                        language_id=_lang_code,
                        exaggeration=_exp,
                        cfg_weight=_cfg,
                        temperature=_temp,
                        repetition_penalty=_rep_pen,
                        min_p=_min_p,
                        top_p=_top_p
                    )
                )

            sample_rate = model_multi.sr
            logger.debug(f"[TTS] Synthèse multilingue: {lang_code}")
        else:
            # Capturer les paramètres locaux pour le lambda
            _model = model_mono
            _text = text
            _speaker = speaker_audio_path
            _exp = exaggeration
            _cfg = cfg_weight
            _temp = temperature
            _rep_pen = repetition_penalty
            _min_p = min_p
            _top_p = top_p

            if speaker_audio_path and os.path.exists(speaker_audio_path):
                wav = await loop.run_in_executor(
                    None,
                    lambda: _model.generate(
                        _text,
                        audio_prompt_path=_speaker,
                        exaggeration=_exp,
                        cfg_weight=_cfg,
                        temperature=_temp,
                        repetition_penalty=_rep_pen,
                        min_p=_min_p,
                        top_p=_top_p
                    )
                )
            else:
                wav = await loop.run_in_executor(
                    None,
                    lambda: _model.generate(
                        _text,
                        exaggeration=_exp,
                        cfg_weight=_cfg,
                        temperature=_temp,
                        repetition_penalty=_rep_pen,
                        min_p=_min_p,
                        top_p=_top_p
                    )
                )

            sample_rate = model_mono.sr
            logger.debug(f"[TTS] Synthèse monolingual: en")

        await loop.run_in_executor(
            None,
            lambda: torchaudio.save(output_path, wav, sample_rate)
        )

        return output_path

    async def _get_optimal_params(
        self,
        speaker_audio_path: str,
        target_language: str,
        voice_characteristics: Optional[VoiceCharacteristics] = None
    ) -> dict:
        """
        Calcule les paramètres optimaux basés sur l'analyse vocale.

        Args:
            speaker_audio_path: Chemin vers l'audio de référence
            target_language: Langue cible
            voice_characteristics: Caractéristiques pré-analysées (optionnel)

        Returns:
            Dict avec tous les paramètres Chatterbox optimisés:
            - exaggeration, cfg_weight, temperature, repetition_penalty, min_p, top_p
        """
        try:
            analyzer = VoiceAnalyzerService()
            await analyzer.initialize()

            # Utiliser les caractéristiques fournies ou analyser
            if voice_characteristics is None:
                characteristics = await analyzer.analyze(speaker_audio_path)
            else:
                characteristics = voice_characteristics

            # Obtenir les paramètres optimaux (tous les 6 paramètres)
            optimal = analyzer.get_optimal_clone_params(characteristics, target_language)

            logger.debug(
                f"[TTS] Analyse vocale: type={characteristics.voice_type}, "
                f"pitch={characteristics.pitch_mean:.1f}Hz, "
                f"expressivité={optimal['analysis']['expressiveness_score']:.2f}, "
                f"stabilité={optimal['analysis']['stability_score']:.2f}"
            )
            logger.debug(
                f"[TTS] Params optimaux: exp={optimal['exaggeration']:.2f}, "
                f"cfg={optimal['cfg_weight']:.2f}, temp={optimal['temperature']:.2f}, "
                f"rep_pen={optimal['repetition_penalty']:.2f}, "
                f"min_p={optimal['min_p']:.3f}, top_p={optimal['top_p']:.2f}"
            )

            return optimal

        except Exception as e:
            logger.warning(f"[TTS] Erreur auto-optimisation, utilisation valeurs par défaut: {e}")
            return {
                "exaggeration": self.DEFAULT_PARAMS["exaggeration"],
                "cfg_weight": self.DEFAULT_PARAMS["cfg_weight"],
                "temperature": self.DEFAULT_PARAMS["temperature"],
                "repetition_penalty": self.DEFAULT_PARAMS["repetition_penalty"],
                "min_p": self.DEFAULT_PARAMS["min_p"],
                "top_p": self.DEFAULT_PARAMS["top_p"],
                "confidence": 0.0,
                "explanation": "Valeurs par défaut (erreur analyse)"
            }

    async def close(self):
        # NOTE: Les modèles sont gérés par le ModelManager centralisé
        # Ils seront automatiquement évictés via LRU si mémoire faible
        self._initialized = False
        self._initialized_multilingual = False
        logger.info("[TTS] Chatterbox fermé (modèles gérés par ModelManager)")
