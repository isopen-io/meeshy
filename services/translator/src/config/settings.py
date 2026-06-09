"""
Configuration du service de traduction Meeshy - Version Production
Inclut: Audio services, Voice API, Analytics, Pipeline async
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

class Settings:
    """Configuration du service de traduction"""

    def __init__(self):
        # Configuration générale
        self.debug = os.getenv("DEBUG", "false").lower() == "true"
        self.workers = int(os.getenv("WORKERS", "16"))

        # ═══════════════════════════════════════════════════════════════
        # AUDIO SERVICES CONFIGURATION
        # ═══════════════════════════════════════════════════════════════
        self.enable_audio_services = os.getenv("ENABLE_AUDIO_SERVICES", "true").lower() == "true"
        self.enable_voice_api = os.getenv("ENABLE_VOICE_API", "true").lower() == "true"

        # Whisper configuration
        self.whisper_model = os.getenv("WHISPER_MODEL", "distil-large-v3")
        self.whisper_device = os.getenv("WHISPER_DEVICE", "auto")
        self.whisper_compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "float16")

        # ═══════════════════════════════════════════════════════════════
        # TTS MODEL SELECTION
        # Options: chatterbox (recommande), chatterbox-turbo, higgs-audio-v2, xtts-v2
        # ═══════════════════════════════════════════════════════════════
        self.tts_model = os.getenv("TTS_MODEL", "chatterbox")
        self.tts_device = os.getenv("TTS_DEVICE", "auto")
        self.tts_output_dir = os.getenv("TTS_OUTPUT_DIR", "./generated/audios")
        self.tts_default_format = os.getenv("TTS_DEFAULT_FORMAT", "mp3")

        # ═══════════════════════════════════════════════════════════════
        # VOICE/TTS MODELS PATHS (centralise dans MODELS_PATH)
        # Structure:
        #   models/
        #   ├── huggingface/          # Chatterbox, Higgs, NLLB (auto-download)
        #   ├── openvoice/            # OpenVoice V2 checkpoints
        #   ├── xtts/                 # XTTS v2 (legacy)
        #   └── whisper/              # Whisper STT
        # ═══════════════════════════════════════════════════════════════

        # Voice cloning - OpenVoice V2
        self.voice_clone_device = os.getenv("VOICE_CLONE_DEVICE", "cpu")
        self.voice_profile_cache_ttl = int(os.getenv("VOICE_PROFILE_CACHE_TTL", "7776000"))  # 90 days

        # Chatterbox TTS configuration
        self.chatterbox_exaggeration = float(os.getenv("CHATTERBOX_EXAGGERATION", "0.5"))
        self.chatterbox_cfg_weight = float(os.getenv("CHATTERBOX_CFG_WEIGHT", "0.5"))

        # XTTS configuration (legacy - non-commercial)
        self.xtts_device = os.getenv("XTTS_DEVICE", "auto")

        # Audio output - translated audios stored in generated/audios/
        self.audio_output_dir = os.getenv("AUDIO_OUTPUT_DIR", "./generated/audios")

        # Analytics
        self.analytics_data_dir = os.getenv("ANALYTICS_DATA_DIR", "./analytics_data")

        # Pipeline async
        self.max_concurrent_jobs = int(os.getenv("MAX_CONCURRENT_JOBS", "10"))
        
        # Configuration des ports
        self.fastapi_port = int(os.getenv("FASTAPI_PORT", "8000"))
        self.grpc_port = int(os.getenv("GRPC_PORT", "50051"))
        self.zmq_port = int(os.getenv("ZMQ_PORT", "5555"))
        
        # Configuration base de données
        self.database_url = os.getenv("DATABASE_URL", "file:../shared/dev.db")
        self.prisma_pool_size = int(os.getenv("PRISMA_POOL_SIZE", "15"))
        
        # Configuration Redis (cache)
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.translation_cache_ttl = int(os.getenv("TRANSLATION_CACHE_TTL", "3600"))
        self.cache_max_entries = int(os.getenv("CACHE_MAX_ENTRIES", "10000"))

        # ═══════════════════════════════════════════════════════════════
        # REDIS KEY PATTERNS
        # Clés utilisées pour le cache Redis des transcriptions et traductions
        # ═══════════════════════════════════════════════════════════════
        # Transcription STT originale - indexée par attachmentId (pas messageId)
        self.redis_key_transcription = "audio:transcription:{attachment_id}"
        # Traduction audio générée
        self.redis_key_translated_audio = "audio:translation:{attachment_id}:{lang}"
        # Profil vocal utilisateur
        self.redis_key_voice_profile = "voice:profile:{user_id}"
        
        # Configuration ML
        self.ml_batch_size = int(os.getenv("ML_BATCH_SIZE", "16"))
        self.gpu_memory_fraction = float(os.getenv("GPU_MEMORY_FRACTION", "0.8"))
        
        # Chemin des modèles - utiliser le dossier models local du translator
        models_path_env = os.getenv("MODELS_PATH", "models")
        logger.debug("[SETTINGS] MODELS_PATH depuis os.getenv: '%s'", models_path_env)
        if os.path.isabs(models_path_env):
            self.models_path = models_path_env
            logger.debug("[SETTINGS] Chemin absolu utilisé: '%s'", self.models_path)
        else:
            # Si chemin relatif, le calculer depuis le dossier translator
            current_dir = os.path.dirname(os.path.abspath(__file__))
            translator_dir = os.path.dirname(os.path.dirname(current_dir))  # remonte de src/config vers translator
            self.models_path = os.path.join(translator_dir, models_path_env)
            logger.debug("[SETTINGS] Chemin relatif calculé: '%s'", self.models_path)
        
        # Configuration des langues
        self.default_language = os.getenv("DEFAULT_LANGUAGE", "fr")
        self.supported_languages = os.getenv("SUPPORTED_LANGUAGES", "af,ar,bg,bn,cs,da,de,el,en,es,fa,fi,fr,he,hi,hr,hu,hy,id,ig,it,ja,ko,ln,lt,ms,nl,no,pl,pt,ro,ru,sv,sw,th,tr,uk,ur,vi,zh")
        self.auto_detect_language = os.getenv("AUTO_DETECT_LANGUAGE", "true").lower() == "true"
        
        # Configuration des modèles de traduction NLLB uniquement
        # basic = NLLB 600M (rapide), premium = NLLB 1.3B (qualité)
        self.basic_model = os.getenv("BASIC_MODEL", "facebook/nllb-200-distilled-600M")
        self.premium_model = os.getenv("PREMIUM_MODEL", "facebook/nllb-200-distilled-1.3B")
        # Alias pour compatibilité (medium = basic)
        self.medium_model = self.basic_model
        
        # Configuration des performances
        self.translation_timeout = int(os.getenv("TRANSLATION_TIMEOUT", "20"))  # 20 secondes pour multicore AMD
        self.max_text_length = int(os.getenv("MAX_TEXT_LENGTH", "100000"))
        self.concurrent_translations = int(os.getenv("CONCURRENT_TRANSLATIONS", "4"))  # Optimisé pour 4 cores

        # ═══════════════════════════════════════════════════════════════
        # OPTIMISATIONS LINUX/CUDA - Batch Processing & Priority Queue
        # ═══════════════════════════════════════════════════════════════

        # Batch translation settings
        self.batch_size = int(os.getenv("TRANSLATOR_BATCH_SIZE", "8"))
        self.batch_timeout_ms = int(os.getenv("TRANSLATOR_BATCH_TIMEOUT_MS", "50"))
        self.max_batch_tokens = int(os.getenv("TRANSLATOR_MAX_BATCH_TOKENS", "4096"))

        # Priority queue settings (prioritize short texts for faster response)
        self.enable_priority_queue = os.getenv("TRANSLATOR_PRIORITY_QUEUE", "true").lower() == "true"
        self.short_text_threshold = int(os.getenv("TRANSLATOR_SHORT_TEXT_THRESHOLD", "100"))
        self.medium_text_threshold = int(os.getenv("TRANSLATOR_MEDIUM_TEXT_THRESHOLD", "500"))

        # PyTorch optimization settings
        self.enable_torch_compile = os.getenv("TRANSLATOR_TORCH_COMPILE", "true").lower() == "true"
        self.torch_compile_mode = os.getenv("TRANSLATOR_COMPILE_MODE", "reduce-overhead")
        self.enable_cudnn_benchmark = os.getenv("TRANSLATOR_CUDNN_BENCHMARK", "true").lower() == "true"

        # Thread/Process pool settings
        self.num_inference_workers = int(os.getenv("TRANSLATOR_INFERENCE_WORKERS", "4"))
        self.use_process_pool = os.getenv("TRANSLATOR_USE_PROCESS_POOL", "false").lower() == "true"

        # Memory management
        self.max_memory_fraction = float(os.getenv("TRANSLATOR_MAX_MEMORY_FRACTION", "0.85"))
        self.enable_memory_cleanup = os.getenv("TRANSLATOR_MEMORY_CLEANUP", "true").lower() == "true"

        # Linux-specific thread settings
        self.num_omp_threads = int(os.getenv("OMP_NUM_THREADS", "4"))
        self.num_mkl_threads = int(os.getenv("MKL_NUM_THREADS", "4"))

        # Configuration des timeouts pour le chargement des modèles
        self.model_load_timeout = int(os.getenv("MODEL_LOAD_TIMEOUT", "60"))  # 60 secondes pour charger un modèle
        self.tokenizer_load_timeout = int(os.getenv("TOKENIZER_LOAD_TIMEOUT", "20"))  # 20 secondes pour charger un tokenizer
        self.huggingface_timeout = int(os.getenv("HUGGINGFACE_TIMEOUT", "120"))  # 120 secondes pour les téléchargements HF
        
        # Configuration des retries pour le téléchargement des modèles
        self.model_download_max_retries = int(os.getenv("MODEL_DOWNLOAD_MAX_RETRIES", "3"))
        self.model_download_timeout = int(os.getenv("MODEL_DOWNLOAD_TIMEOUT", "300"))  # 5 minutes par défaut
        self.model_download_consecutive_timeouts = int(os.getenv("MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS", "3"))

    # ═══════════════════════════════════════════════════════════════
    # MODEL SUBDIRECTORY PATHS (computed from models_path)
    # ═══════════════════════════════════════════════════════════════

    @property
    def huggingface_cache_path(self) -> str:
        """Chemin pour les modèles HuggingFace (Chatterbox, Higgs, NLLB)"""
        return os.path.join(self.models_path, "huggingface")

    @property
    def openvoice_checkpoints_path(self) -> str:
        """Chemin pour les checkpoints OpenVoice V2"""
        return os.path.join(self.models_path, "openvoice")

    @property
    def xtts_models_path(self) -> str:
        """Chemin pour les modèles XTTS v2 (legacy)"""
        return os.path.join(self.models_path, "xtts")

    @property
    def whisper_models_path(self) -> str:
        """Chemin pour les modèles Whisper STT"""
        return os.path.join(self.models_path, "whisper")

    @property
    def voice_models_path(self) -> str:
        """Chemin pour le cache des modèles vocaux utilisateur"""
        return os.path.join(self.models_path, "voice_cache")

    def ensure_model_directories(self):
        """Crée les répertoires de modèles s'ils n'existent pas"""
        paths_info = [
            ("Répertoire principal", self.models_path),
            ("HuggingFace (TTS, Traduction)", self.huggingface_cache_path),
            ("Whisper (STT)", self.whisper_models_path),
            ("OpenVoice (Clonage)", self.openvoice_checkpoints_path),
            ("XTTS v2 (Legacy)", self.xtts_models_path),
            ("Voice Cache", self.voice_models_path),
        ]

        for name, path in paths_info:
            os.makedirs(path, exist_ok=True)
            logger.info("[SETTINGS] %-30s → %s", name, path)

        logger.debug("[SETTINGS] HF_HOME=%s TRANSFORMERS_CACHE=%s TORCH_HOME=%s",
                     os.getenv('HF_HOME', 'NOT SET'),
                     os.getenv('TRANSFORMERS_CACHE', 'NOT SET'),
                     os.getenv('TORCH_HOME', 'NOT SET'))

    @property
    def supported_languages_list(self):
        """Retourne la liste des langues supportées"""
        return [lang.strip() for lang in self.supported_languages.split(",")]

def get_settings():
    """Retourne une instance des paramètres"""
    return Settings()

# Mappings des langues pour les modèles NLLB-200
LANGUAGE_MAPPINGS = {
    # Codes ISO 639-1 vers codes NLLB-200

    # === Langues Européennes ===
    'af': 'afr_Latn',      # Afrikaans
    'bg': 'bul_Cyrl',      # Bulgarian
    'cs': 'ces_Latn',      # Czech
    'da': 'dan_Latn',      # Danish
    'de': 'deu_Latn',      # German
    'el': 'ell_Grek',      # Greek
    'en': 'eng_Latn',      # English
    'es': 'spa_Latn',      # Spanish
    'fi': 'fin_Latn',      # Finnish
    'fr': 'fra_Latn',      # French
    'hr': 'hrv_Latn',      # Croatian
    'hu': 'hun_Latn',      # Hungarian
    'it': 'ita_Latn',      # Italian
    'lt': 'lit_Latn',      # Lithuanian
    'nl': 'nld_Latn',      # Dutch
    'no': 'nob_Latn',      # Norwegian Bokmål
    'pl': 'pol_Latn',      # Polish
    'pt': 'por_Latn',      # Portuguese
    'ro': 'ron_Latn',      # Romanian
    'ru': 'rus_Cyrl',      # Russian
    'sv': 'swe_Latn',      # Swedish
    'tr': 'tur_Latn',      # Turkish
    'uk': 'ukr_Cyrl',      # Ukrainian

    # === Langues Asiatiques ===
    'ar': 'arb_Arab',      # Arabic
    'bn': 'ben_Beng',      # Bengali
    'fa': 'pes_Arab',      # Persian
    'he': 'heb_Hebr',      # Hebrew
    'hi': 'hin_Deva',      # Hindi
    'hy': 'hye_Armn',      # Armenian
    'id': 'ind_Latn',      # Indonesian
    'ja': 'jpn_Jpan',      # Japanese
    'ko': 'kor_Hang',      # Korean
    'ms': 'zsm_Latn',      # Malay
    'th': 'tha_Thai',      # Thai
    'ur': 'urd_Arab',      # Urdu
    'vi': 'vie_Latn',      # Vietnamese
    'zh': 'zho_Hans',      # Chinese (Simplified)

    # === Langues Africaines (MMS TTS disponible) ===
    'am': 'amh_Ethi',      # Amharic (Ethiopie)
    'sw': 'swh_Latn',      # Swahili
    'yo': 'yor_Latn',      # Yoruba (Nigeria)
    'ha': 'hau_Latn',      # Hausa (Nigeria/Niger)
    'rw': 'kin_Latn',      # Kinyarwanda (Rwanda)
    'rn': 'run_Latn',      # Kirundi (Burundi)
    'sn': 'sna_Latn',      # Shona (Zimbabwe)
    'lg': 'lug_Latn',      # Luganda (Ouganda)
    'om': 'gaz_Latn',      # Oromo (Ethiopie)
    'ti': 'tir_Ethi',      # Tigrinya (Ethiopie/Erythree)
    'ny': 'nya_Latn',      # Chichewa/Nyanja (Malawi)
    'ee': 'ewe_Latn',      # Ewe (Ghana/Togo)
    'ff': 'fuv_Latn',      # Fula/Fulani (Afrique de l'Ouest)
    'mg': 'plt_Latn',      # Malagasy (Madagascar)
    'so': 'som_Latn',      # Somali (Somalie)
    'ts': 'tso_Latn',      # Tsonga (Afrique du Sud)
    'bem': 'bem_Latn',     # Bemba (Zambie)

    # === Langues Africaines (TTS MMS non disponible) ===
    'ln': 'lin_Latn',      # Lingala (Congo)
    'ig': 'ibo_Latn',      # Igbo (Nigeria)
    'zu': 'zul_Latn',      # Zulu (Afrique du Sud)
    'xh': 'xho_Latn',      # Xhosa (Afrique du Sud)
    'wo': 'wol_Latn',      # Wolof (Senegal)
    'tw': 'twi_Latn',      # Twi (Ghana)
    'tn': 'tsn_Latn',      # Tswana (Botswana)
    'st': 'sot_Latn',      # Southern Sotho (Lesotho)
    'nso': 'nso_Latn',     # Northern Sotho/Sepedi (Afrique du Sud)
}

def get_model_language_code(iso_code: str) -> str:
    """Convertit un code ISO vers un code modèle"""
    return LANGUAGE_MAPPINGS.get(iso_code, iso_code)

def get_iso_language_code(model_code: str) -> str:
    """Convertit un code modèle vers un code ISO"""
    reverse_mapping = {v: k for k, v in LANGUAGE_MAPPINGS.items()}
    return reverse_mapping.get(model_code, model_code.split('_')[0] if '_' in model_code else model_code)
