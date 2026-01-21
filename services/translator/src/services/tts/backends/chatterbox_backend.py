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
import io
from pathlib import Path
from typing import Optional, Any, Tuple
from concurrent.futures import ThreadPoolExecutor

from ..base import BaseTTSBackend
from config.settings import get_settings
from services.voice_analyzer_service import VoiceAnalyzerService, VoiceCharacteristics
from ...model_manager import TTSBackend as TTSBackendEnum

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# INITIALISATION EINOPS POUR COMPATIBILITÉ AVEC ThreadPoolExecutor
# einops doit "découvrir" le backend torch dans le thread principal
# AVANT d'être utilisé dans un executor, sinon: "Tensor type unknown to einops"
# ═══════════════════════════════════════════════════════════════════════════════
try:
    import torch
    from einops import rearrange
    # Forcer einops à enregistrer le backend torch avec une opération factice
    _dummy_tensor = torch.randn(2, 3)
    _dummy_result = rearrange(_dummy_tensor, "a b -> b a")
    del _dummy_tensor, _dummy_result
    logger.debug("[CHATTERBOX] ✅ einops backend torch initialisé")
except ImportError:
    pass
except Exception as e:
    logger.warning(f"[CHATTERBOX] ⚠️ Initialisation einops: {e}")

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

        # Verrou pour sérialiser les appels de synthèse (ChatterBox n'est pas thread-safe)
        self._synthesis_lock = asyncio.Lock()

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
        """
        Vérifie si le modèle Chatterbox est téléchargé.

        PRIORITÉ MULTILINGUE: Vérifie d'abord le modèle multilingual,
        puis fallback sur le monolingual.

        Vérifie dans l'ordre:
        1. Le cache personnalisé (models/huggingface/)
        2. Le cache global HuggingFace (~/.cache/huggingface/hub/)

        Note: Chatterbox utilise tokenizer.json au lieu de config.json
        """
        if not self._available and not self._available_multilingual:
            return False

        try:
            from huggingface_hub import try_to_load_from_cache

            # PRIORITÉ 1: Vérifier le modèle CHATTERBOX (contient mono + multi)
            # NOTE: Le modèle multilingual et monolingual partagent le MÊME repo HuggingFace
            # ResembleAI/chatterbox contient les deux variantes (classes Python différentes)
            if self._available_multilingual or self._available:
                model_id = "ResembleAI/chatterbox-turbo" if self.turbo else "ResembleAI/chatterbox"
                check_file = "tokenizer.json"

                # 1a. Cache personnalisé
                file_path = try_to_load_from_cache(
                    model_id,
                    check_file,
                    cache_dir=str(self._models_path)
                )
                if file_path is not None:
                    logger.debug(f"[TTS] Chatterbox trouvé dans cache personnalisé: {model_id}")
                    return True

                # 1b. Cache global
                file_path = try_to_load_from_cache(model_id, check_file)
                if file_path is not None:
                    logger.debug(f"[TTS] Chatterbox trouvé dans cache global: {model_id}")
                    return True

            return False
        except Exception as e:
            logger.debug(f"[TTS] Vérification cache Chatterbox: {e}")
            return False

    async def download_model(self) -> bool:
        """
        Télécharge le modèle Chatterbox.

        PRIORITÉ MULTILINGUE: Télécharge le modèle multilingual (23 langues) en priorité
        pour supporter une plateforme multilingue comme Meeshy.
        """
        if not self._available and not self._available_multilingual:
            return False

        self._downloading = True
        self._download_progress = 0.0

        try:
            from huggingface_hub import snapshot_download

            # Télécharger ResembleAI/chatterbox qui contient MONO + MULTI
            # NOTE: Le même repo contient les 2 variantes (classes Python différentes)
            model_id = "ResembleAI/chatterbox-turbo" if self.turbo else "ResembleAI/chatterbox"

            if self._available_multilingual:
                logger.info(f"[TTS] 🌍 Téléchargement Chatterbox (avec support Multilingual 23 langues) vers {self._models_path}...")
                logger.info("[TTS] Langues supportées via ChatterboxMultilingualTTS: ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko, ms, nl, no, pl, pt, ru, sv, sw, tr, zh")
            else:
                logger.info(f"[TTS] 📥 Téléchargement Chatterbox (ChatterboxTTS - anglais) vers {self._models_path}...")
                logger.warning("[TTS] ⚠️ Chatterbox Multilingual non disponible - support anglais uniquement")

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
        """
        Initialise le modèle Chatterbox.

        PRIORITÉ MULTILINGUE: Pour une plateforme multilingue comme Meeshy,
        charge le modèle multilingual (23 langues) par défaut si disponible.
        Fallback sur le monolingual (anglais uniquement) si échec.
        """
        # Si déjà initialisé (mono ou multi), retourner True
        if self._initialized or self._initialized_multilingual:
            return True

        # ÉTAPE 1: Essayer de charger le modèle MULTILINGUAL en priorité
        if self._available_multilingual:
            logger.info("[TTS] 🌍 Tentative de chargement Chatterbox Multilingual (23 langues)...")
            success = await self.initialize_multilingual()
            if success:
                logger.info("[TTS] ✅ Chatterbox Multilingual chargé - support de 23 langues activé")
                self._initialized = True  # Marquer comme initialisé aussi
                return True
            else:
                logger.warning("[TTS] ⚠️ Échec chargement multilingual, fallback sur monolingual...")

        # ÉTAPE 2: Fallback sur le modèle MONOLINGUAL (anglais uniquement)
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
            logger.info(f"[TTS] 🔄 Chargement Chatterbox {model_name} (monolingual - anglais uniquement)...")

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
            logger.info(f"✅ [TTS] Chatterbox {model_name} monolingual initialisé sur {device}")
            logger.warning("[TTS] ⚠️ Support multilingue limité - seulement anglais disponible")
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

    # ═══════════════════════════════════════════════════════════════════════════
    # PARAMÈTRES CHATTERBOX - VALEURS PAR DÉFAUT OFFICIELLES
    # ═══════════════════════════════════════════════════════════════════════════
    # Basé sur chatterbox_voice_translation_test.py qui fonctionne correctement.
    # IMPORTANT: Ne pas surcharger avec des paramètres non-standards (temperature,
    # repetition_penalty, min_p, top_p) car ils causent des troncatures audio.
    #
    # Pour les langues non-anglaises: cfg_weight=0.0 réduit le transfert d'accent
    # ═══════════════════════════════════════════════════════════════════════════
    DEFAULT_PARAMS = {
        "exaggeration": 0.5,      # 0.0-1.0: Expressivité vocale (défaut officiel)
        "cfg_weight": 0.5,        # 0.0-1.0: Guidance du modèle (défaut officiel)
        # NOTE: Pour non-anglais, cfg_weight sera mis à 0.0 automatiquement
    }

    # Mode TURBO pour synthèse plus neutre/stable
    FAST_PARAMS = {
        "exaggeration": 0.3,      # Expressivité réduite pour stabilité
        "cfg_weight": 0.5,        # Guidance standard
    }

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,
        output_path: str = None,
        # Paramètres de clonage vocal (seuls paramètres officiels Chatterbox)
        exaggeration: Optional[float] = None,
        cfg_weight: Optional[float] = None,
        # Options
        auto_optimize_params: bool = True,
        voice_characteristics: Optional[VoiceCharacteristics] = None,
        # Conditionals Chatterbox pré-calculés
        conditionals: Optional[Any] = None,
        # MODE RAPIDE
        fast_mode: bool = False,
        **kwargs  # Ignorer les paramètres non-standards
    ) -> str:
        """
        Synthèse vocale avec Chatterbox.

        IMPORTANT: Utilise UNIQUEMENT les paramètres officiels Chatterbox:
        - exaggeration: Expressivité vocale (0.0-1.0, défaut 0.5)
        - cfg_weight: Guidance du modèle (0.0-1.0, défaut 0.5, 0.0 pour non-anglais)

        Les paramètres non-standards (temperature, repetition_penalty, min_p, top_p)
        sont IGNORÉS car ils causent des troncatures audio.
        """
        import torchaudio

        # Normaliser le code langue (ex: fr-FR -> fr)
        lang_code = language.split('-')[0].lower() if language else 'en'

        # Déterminer si on utilise le modèle multilingue
        use_multilingual = (
            lang_code in self.MULTILINGUAL_LANGUAGES and
            self._available_multilingual
        )

        # Sélectionner les paramètres par défaut
        params_source = self.FAST_PARAMS if fast_mode else self.DEFAULT_PARAMS
        if fast_mode:
            logger.info("[TTS] ⚡ MODE RAPIDE activé")

        # Appliquer les valeurs par défaut
        if exaggeration is None:
            exaggeration = params_source["exaggeration"]
        if cfg_weight is None:
            cfg_weight = params_source["cfg_weight"]

        # ═══════════════════════════════════════════════════════════════════
        # RÈGLE CRUCIALE: cfg_weight=0.0 pour les langues non-anglaises
        # Basé sur chatterbox_voice_translation_test.py qui fonctionne
        # ═══════════════════════════════════════════════════════════════════
        if lang_code != 'en':
            effective_cfg = 0.0  # Réduit le transfert d'accent pour cross-langue
            logger.info(f"[TTS] Cross-language: cfg_weight=0.0 pour {lang_code} (réduit transfert accent)")
        else:
            effective_cfg = cfg_weight

        logger.info(
            f"[TTS] Params: lang={lang_code}, exaggeration={exaggeration:.2f}, cfg_weight={effective_cfg:.2f}"
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
        # GÉNÉRATION AUDIO - PARAMÈTRES SIMPLES UNIQUEMENT
        # Comme dans chatterbox_voice_translation_test.py
        # VERROU: ChatterBox n'est pas thread-safe, sérialisation des appels
        # ═══════════════════════════════════════════════════════════════════
        async with self._synthesis_lock:
            if use_multilingual:
                _model = model_multi
                _text = text
                _lang_code = lang_code
                _speaker = speaker_audio_path
                _exp = exaggeration
                _cfg = effective_cfg
                _conditionals = conditionals

                # Si des conditionals pré-calculés sont fournis
                if _conditionals is not None:
                    logger.info("[CHATTERBOX] 🎤 Utilisation des conditionals pré-calculés")
                    _model.conds = _conditionals
                    wav = await loop.run_in_executor(
                        None,
                        lambda: _model.generate(
                            text=_text,
                            language_id=_lang_code,
                            exaggeration=_exp,
                            cfg_weight=_cfg
                        )
                    )
                elif speaker_audio_path and os.path.exists(speaker_audio_path):
                    wav = await loop.run_in_executor(
                        None,
                        lambda: _model.generate(
                            text=_text,
                            audio_prompt_path=_speaker,
                            language_id=_lang_code,
                            exaggeration=_exp,
                            cfg_weight=_cfg
                        )
                    )
                else:
                    wav = await loop.run_in_executor(
                        None,
                        lambda: _model.generate(
                            text=_text,
                            language_id=_lang_code,
                            exaggeration=_exp,
                            cfg_weight=_cfg
                        )
                    )

                sample_rate = model_multi.sr
                logger.debug(f"[TTS] Synthèse multilingue: {lang_code}")
            else:
                _model = model_mono
                _text = text
                _speaker = speaker_audio_path
                _exp = exaggeration
                _cfg = effective_cfg
                _conditionals = conditionals

                if _conditionals is not None:
                    logger.info("[CHATTERBOX] 🎤 Utilisation des conditionals pré-calculés")
                    _model.conds = _conditionals
                    wav = await loop.run_in_executor(
                        None,
                        lambda: _model.generate(
                            _text,
                            exaggeration=_exp,
                            cfg_weight=_cfg
                        )
                    )
                elif speaker_audio_path and os.path.exists(speaker_audio_path):
                    wav = await loop.run_in_executor(
                        None,
                        lambda: _model.generate(
                            _text,
                            audio_prompt_path=_speaker,
                            exaggeration=_exp,
                            cfg_weight=_cfg
                        )
                    )
                else:
                    wav = await loop.run_in_executor(
                        None,
                        lambda: _model.generate(
                            _text,
                            exaggeration=_exp,
                            cfg_weight=_cfg
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

        NOTE: Simplifié pour n'utiliser que exaggeration et cfg_weight (params officiels).
        """
        try:
            analyzer = VoiceAnalyzerService()
            await analyzer.initialize()

            if voice_characteristics is None:
                characteristics = await analyzer.analyze(speaker_audio_path)
            else:
                characteristics = voice_characteristics

            optimal = analyzer.get_optimal_clone_params(characteristics, target_language)

            logger.debug(
                f"[TTS] Analyse vocale: type={characteristics.voice_type}, "
                f"pitch={characteristics.pitch_mean:.1f}Hz"
            )

            # Retourner uniquement les paramètres officiels
            return {
                "exaggeration": optimal.get("exaggeration", self.DEFAULT_PARAMS["exaggeration"]),
                "cfg_weight": optimal.get("cfg_weight", self.DEFAULT_PARAMS["cfg_weight"]),
            }

        except Exception as e:
            logger.warning(f"[TTS] Erreur auto-optimisation, utilisation valeurs par défaut: {e}")
            return {
                "exaggeration": self.DEFAULT_PARAMS["exaggeration"],
                "cfg_weight": self.DEFAULT_PARAMS["cfg_weight"],
            }

    async def prepare_voice_conditionals(
        self,
        audio_path: str,
        exaggeration: float = 0.5,
        serialize: bool = False
    ) -> Tuple[Optional[Any], Optional[bytes]]:
        """
        Prépare les conditionals Chatterbox à partir d'un fichier audio.

        Ces conditionals peuvent être stockés et réutilisés pour éviter
        de recalculer à chaque synthèse.

        Args:
            audio_path: Chemin vers l'audio de référence
            exaggeration: Niveau d'expressivité (0.0-1.0)
            serialize: Si True, retourne aussi les bytes sérialisés

        Returns:
            Tuple (Conditionals, bytes_sérialisés) ou (Conditionals, None)
        """
        if not self.is_initialized and not self._initialized_multilingual:
            logger.warning("[CHATTERBOX] Modèle non initialisé pour préparer conditionals")
            return None, None

        if not audio_path or not os.path.exists(audio_path):
            logger.warning(f"[CHATTERBOX] Audio non trouvé: {audio_path}")
            return None, None

        try:
            # Prioriser le modèle multilingual s'il est disponible
            model = None
            if self._initialized_multilingual:
                model = self._get_model(self._model_id_multi)
            elif self._initialized:
                model = self._get_model(self._model_id)

            if not model:
                logger.warning("[CHATTERBOX] Aucun modèle disponible pour préparer conditionals")
                return None, None

            loop = asyncio.get_event_loop()

            def _prepare():
                model.prepare_conditionals(audio_path, exaggeration=exaggeration)
                return model.conds

            conditionals = await loop.run_in_executor(None, _prepare)
            logger.info(f"[CHATTERBOX] ✅ Conditionals préparés depuis {audio_path}")

            # Sérialiser si demandé
            serialized = None
            if serialize and conditionals:
                serialized = await self.serialize_conditionals(conditionals)

            return conditionals, serialized

        except Exception as e:
            logger.error(f"[CHATTERBOX] ❌ Erreur préparation conditionals: {e}")
            return None, None

    async def serialize_conditionals(self, conditionals) -> Optional[bytes]:
        """
        Sérialise les conditionals Chatterbox en bytes pour stockage.

        Args:
            conditionals: Objet Conditionals Chatterbox

        Returns:
            Bytes sérialisés ou None si échec
        """
        if conditionals is None:
            return None

        try:
            import torch

            # Créer un buffer en mémoire
            buffer = io.BytesIO()

            # Sérialiser avec torch.save (comme Conditionals.save())
            arg_dict = dict(
                t3=conditionals.t3.__dict__,
                gen=conditionals.gen
            )
            torch.save(arg_dict, buffer)

            # Retourner les bytes
            buffer.seek(0)
            serialized_bytes = buffer.read()

            logger.info(f"[CHATTERBOX] ✅ Conditionals sérialisés ({len(serialized_bytes)} bytes)")
            return serialized_bytes

        except Exception as e:
            logger.error(f"[CHATTERBOX] ❌ Erreur sérialisation conditionals: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def deserialize_conditionals(self, data: bytes, device: str = "cpu"):
        """
        Désérialise les conditionals Chatterbox depuis bytes.

        Args:
            data: Bytes sérialisés
            device: Device cible (cpu, cuda, mps)

        Returns:
            Objet Conditionals ou None si échec
        """
        if data is None or len(data) == 0:
            return None

        try:
            import torch
            from chatterbox.tts import Conditionals
            from chatterbox.models.t3.modules.cond_enc import T3Cond

            # Charger depuis le buffer
            buffer = io.BytesIO(data)
            map_location = torch.device(device)

            kwargs = torch.load(buffer, map_location=map_location, weights_only=True)
            conditionals = Conditionals(T3Cond(**kwargs['t3']), kwargs['gen'])

            # Déplacer vers le device approprié
            conditionals = conditionals.to(device)

            logger.info(f"[CHATTERBOX] ✅ Conditionals désérialisés ({len(data)} bytes)")
            return conditionals

        except Exception as e:
            logger.error(f"[CHATTERBOX] ❌ Erreur désérialisation conditionals: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def close(self):
        # NOTE: Les modèles sont gérés par le ModelManager centralisé
        # Ils seront automatiquement évictés via LRU si mémoire faible
        self._initialized = False
        self._initialized_multilingual = False
        logger.info("[TTS] Chatterbox fermé (modèles gérés par ModelManager)")
