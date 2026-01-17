"""
MMS TTS Backend
===============

Backend Meta MMS TTS - Support 1100+ langues (sans clonage vocal)
Idéal pour les langues africaines.

INTÉGRATION: Ce backend utilise le ModelManager centralisé pour:
- Gestion mémoire unifiée avec éviction LRU
- Statistiques globales sur tous les modèles MMS chargés
- Pas de duplication de cache entre services
"""

import asyncio
import logging
from typing import Optional, Dict, Any

from ..base import BaseTTSBackend
from config.settings import get_settings
from ...model_manager import TTSBackend as TTSBackendEnum

logger = logging.getLogger(__name__)


class MMSBackend(BaseTTSBackend):
    """Backend Meta MMS TTS - Support 1100+ langues (sans clonage vocal)

    Idéal pour les langues africaines non supportées par Chatterbox/XTTS:
    - Amharic (am), Swahili (sw), Yoruba (yo), Hausa (ha)
    - Kinyarwanda (rw), Kirundi (rn), Shona (sn), Luganda (lg)
    - Oromo (om), Tigrinya (ti), Chichewa (ny), Ewe (ee)
    - Fula (ff), Malagasy (mg), Somali (so), Tsonga (ts)
    """

    # Mapping ISO 639-1/2 vers ISO 639-3 (codes MMS)
    LANGUAGE_CODE_MAP = {
        # Langues africaines
        'am': 'amh',    # Amharic
        'sw': 'swh',    # Swahili
        'yo': 'yor',    # Yoruba
        'ha': 'hau',    # Hausa
        'rw': 'kin',    # Kinyarwanda
        'rn': 'run',    # Kirundi
        'sn': 'sna',    # Shona
        'lg': 'lug',    # Luganda
        'om': 'orm',    # Oromo
        'ti': 'tir',    # Tigrinya
        'ny': 'nya',    # Chichewa/Nyanja
        'ee': 'ewe',    # Ewe
        'ff': 'ful',    # Fula
        'mg': 'mlg',    # Malagasy
        'so': 'som',    # Somali
        'ts': 'tso',    # Tsonga
        'bem': 'bem',   # Bemba
        'ybb': 'ybb',   # Yemba
        # Langues principales (fallback)
        'en': 'eng',
        'fr': 'fra',
        'es': 'spa',
        'de': 'deu',
        'pt': 'por',
        'it': 'ita',
        'ru': 'rus',
        'ar': 'arb',
        'hi': 'hin',
        'bn': 'ben',
        'zh': 'cmn',
        'ja': 'jpn',
        'ko': 'kor',
    }

    # Langues africaines supportées par MMS TTS
    AFRICAN_LANGUAGES = {
        'am', 'sw', 'yo', 'ha', 'rw', 'rn', 'sn', 'lg',
        'om', 'ti', 'ny', 'ee', 'ff', 'mg', 'so', 'ts',
        'bem', 'ybb'
    }

    def __init__(self, device: str = "cpu"):
        super().__init__()
        self.device = device
        self._available = False
        # NOTE: Les modèles sont maintenant gérés par le ModelManager centralisé
        # via les méthodes héritées _register_model() et _get_model()
        self._settings = get_settings()

        try:
            from transformers import VitsModel, AutoTokenizer
            self._available = True
            logger.info("✅ [TTS] MMS TTS (transformers) disponible")
        except ImportError:
            logger.warning("⚠️ [TTS] MMS TTS (transformers) non disponible - pip install transformers")

    @property
    def is_available(self) -> bool:
        return self._available

    def is_model_downloaded(self) -> bool:
        """MMS télécharge les modèles à la demande"""
        return self._available

    async def download_model(self) -> bool:
        """MMS télécharge automatiquement"""
        return self._available

    async def initialize(self) -> bool:
        """MMS s'initialise à la demande par langue"""
        if not self._available:
            return False
        self._initialized = True
        logger.info("✅ [TTS] MMS TTS initialisé (modèles chargés à la demande)")
        return True

    def _get_mms_code(self, language: str) -> str:
        """Convertit un code ISO 639-1/2 vers le code MMS (ISO 639-3)"""
        lang = language.lower().split('-')[0]
        return self.LANGUAGE_CODE_MAP.get(lang, lang)

    async def _load_model_for_language(self, language: str):
        """Charge le modèle MMS pour une langue spécifique"""
        mms_code = self._get_mms_code(language)
        model_id_in_manager = f"tts_mms_transformers_{mms_code}"

        # Vérifier si déjà dans le ModelManager
        cached = self._get_model(model_id_in_manager)
        if cached is not None:
            logger.debug(f"[TTS] Modèle MMS {mms_code} récupéré depuis ModelManager")
            return cached

        try:
            from transformers import VitsModel, AutoTokenizer
            import torch

            hf_model_id = f"facebook/mms-tts-{mms_code}"
            logger.info(f"[TTS] 📥 Chargement modèle MMS: {hf_model_id}")

            loop = asyncio.get_event_loop()

            def load():
                tokenizer = AutoTokenizer.from_pretrained(hf_model_id)
                model = VitsModel.from_pretrained(hf_model_id)
                if self.device != "cpu" and torch.cuda.is_available():
                    model = model.to(self.device)
                return tokenizer, model

            tokenizer, model = await loop.run_in_executor(None, load)

            # Enregistrer dans le ModelManager centralisé
            # Le tuple (tokenizer, model) est stocké comme objet unique
            model_tuple = (tokenizer, model)
            self._register_model(
                model_id=model_id_in_manager,
                model_object=model_tuple,
                backend=TTSBackendEnum.MMS.value,
                language=language,
                priority=2  # Normale - peut être évicté si besoin
            )

            logger.info(f"✅ [TTS] Modèle MMS {mms_code} chargé et enregistré via ModelManager")
            return model_tuple

        except Exception as e:
            logger.error(f"❌ [TTS] Erreur chargement MMS {mms_code}: {e}")
            raise RuntimeError(f"Modèle MMS non disponible pour {language}: {e}")

    async def synthesize(
        self,
        text: str,
        language: str,
        speaker_audio_path: Optional[str] = None,  # Ignoré - MMS ne supporte pas le clonage
        output_path: str = None,
        **kwargs
    ) -> str:
        """Synthétise le texte avec MMS TTS

        Note: MMS ne supporte pas le clonage vocal.
        """
        import torch
        import scipy.io.wavfile as wavfile

        if not self._initialized:
            await self.initialize()

        tokenizer, model = await self._load_model_for_language(language)

        loop = asyncio.get_event_loop()

        def generate():
            inputs = tokenizer(text, return_tensors="pt")
            if self.device != "cpu" and torch.cuda.is_available():
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                output = model(**inputs).waveform

            waveform = output.squeeze().cpu().numpy()
            return waveform

        waveform = await loop.run_in_executor(None, generate)

        # Sauvegarder en WAV
        sample_rate = model.config.sampling_rate
        wavfile.write(output_path, sample_rate, waveform)

        logger.info(f"✅ [TTS] MMS synthèse terminée: {language} -> {output_path}")
        return output_path

    async def close(self):
        """Libère les modèles chargés"""
        # NOTE: Les modèles sont gérés par le ModelManager centralisé
        # Ils seront automatiquement évictés via LRU si mémoire faible
        # ou déchargés globalement via unload_models_by_type()
        self._initialized = False
        logger.info("[TTS] MMS TTS fermé (modèles gérés par ModelManager)")

    def supports_language(self, language: str) -> bool:
        """Vérifie si MMS supporte une langue"""
        lang = language.lower().split('-')[0]
        return lang in self.LANGUAGE_CODE_MAP or lang in self.AFRICAN_LANGUAGES

    def is_african_language(self, language: str) -> bool:
        """Vérifie si c'est une langue africaine"""
        lang = language.lower().split('-')[0]
        return lang in self.AFRICAN_LANGUAGES
