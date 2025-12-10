"""
Configuration du service de traduction Meeshy - Version simplifiée
"""

import os
from pathlib import Path

class Settings:
    """Configuration du service de traduction"""
    
    def __init__(self):
        # Configuration générale
        self.debug = os.getenv("DEBUG", "false").lower() == "true"
        self.workers = int(os.getenv("WORKERS", "16"))
        
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
        
        # Configuration ML
        self.ml_batch_size = int(os.getenv("ML_BATCH_SIZE", "16"))
        self.gpu_memory_fraction = float(os.getenv("GPU_MEMORY_FRACTION", "0.8"))
        
        # Chemin des modèles - utiliser le dossier models local du translator
        models_path_env = os.getenv("MODELS_PATH", "models")
        print(f"[SETTINGS] 🔍 MODELS_PATH depuis os.getenv: '{models_path_env}'")
        if os.path.isabs(models_path_env):
            self.models_path = models_path_env
            print(f"[SETTINGS] ✅ Chemin absolu utilisé: '{self.models_path}'")
        else:
            # Si chemin relatif, le calculer depuis le dossier translator
            current_dir = os.path.dirname(os.path.abspath(__file__))
            translator_dir = os.path.dirname(os.path.dirname(current_dir))  # remonte de src/config vers translator
            self.models_path = os.path.join(translator_dir, models_path_env)
            print(f"[SETTINGS] ✅ Chemin relatif calculé: '{self.models_path}'")
        
        # Configuration des langues
        self.default_language = os.getenv("DEFAULT_LANGUAGE", "fr")
        self.supported_languages = os.getenv("SUPPORTED_LANGUAGES", "af,ar,bg,bn,cs,da,de,el,en,es,fa,fi,fr,he,hi,hr,hu,hy,id,ig,it,ja,ko,ln,lt,ms,nl,no,pl,pt,ro,ru,sv,sw,th,tr,uk,ur,vi,zh")
        self.auto_detect_language = os.getenv("AUTO_DETECT_LANGUAGE", "true").lower() == "true"
        
        # Configuration des modèles de traduction - utiliser les valeurs du .env
        self.basic_model = os.getenv("BASIC_MODEL", "t5-small") 
        self.medium_model = os.getenv("MEDIUM_MODEL", "facebook/nllb-200-distilled-600M")
        self.premium_model = os.getenv("PREMIUM_MODEL", "facebook/nllb-200-distilled-1.3B")
        
        # Configuration des performances
        self.translation_timeout = int(os.getenv("TRANSLATION_TIMEOUT", "20"))  # 20 secondes pour multicore AMD
        self.max_text_length = int(os.getenv("MAX_TEXT_LENGTH", "100000"))
        self.concurrent_translations = int(os.getenv("CONCURRENT_TRANSLATIONS", "4"))  # Optimisé pour 4 cores

        # Configuration des timeouts pour le chargement des modèles
        self.model_load_timeout = int(os.getenv("MODEL_LOAD_TIMEOUT", "60"))  # 60 secondes pour charger un modèle
        self.tokenizer_load_timeout = int(os.getenv("TOKENIZER_LOAD_TIMEOUT", "20"))  # 20 secondes pour charger un tokenizer
        self.huggingface_timeout = int(os.getenv("HUGGINGFACE_TIMEOUT", "120"))  # 120 secondes pour les téléchargements HF
        
        # Configuration des retries pour le téléchargement des modèles
        self.model_download_max_retries = int(os.getenv("MODEL_DOWNLOAD_MAX_RETRIES", "3"))
        self.model_download_timeout = int(os.getenv("MODEL_DOWNLOAD_TIMEOUT", "300"))  # 5 minutes par défaut
        self.model_download_consecutive_timeouts = int(os.getenv("MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS", "3"))
    
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
    'af': 'afr_Latn',      # Afrikaans
    'ar': 'arb_Arab',      # Arabic
    'bg': 'bul_Cyrl',      # Bulgarian
    'bn': 'ben_Beng',      # Bengali
    'cs': 'ces_Latn',      # Czech
    'da': 'dan_Latn',      # Danish
    'de': 'deu_Latn',      # German
    'el': 'ell_Grek',      # Greek
    'en': 'eng_Latn',      # English
    'es': 'spa_Latn',      # Spanish
    'fa': 'pes_Arab',      # Persian
    'fi': 'fin_Latn',      # Finnish
    'fr': 'fra_Latn',      # French
    'he': 'heb_Hebr',      # Hebrew
    'hi': 'hin_Deva',      # Hindi
    'hr': 'hrv_Latn',      # Croatian
    'hu': 'hun_Latn',      # Hungarian
    'hy': 'hye_Armn',      # Armenian
    'id': 'ind_Latn',      # Indonesian
    'ig': 'ibo_Latn',      # Igbo
    'it': 'ita_Latn',      # Italian
    'ja': 'jpn_Jpan',      # Japanese
    'ko': 'kor_Hang',      # Korean
    'ln': 'lin_Latn',      # Lingala
    'lt': 'lit_Latn',      # Lithuanian
    'ms': 'zsm_Latn',      # Malay
    'nl': 'nld_Latn',      # Dutch
    'no': 'nob_Latn',      # Norwegian Bokmål
    'pl': 'pol_Latn',      # Polish
    'pt': 'por_Latn',      # Portuguese
    'ro': 'ron_Latn',      # Romanian
    'ru': 'rus_Cyrl',      # Russian
    'sv': 'swe_Latn',      # Swedish
    'sw': 'swh_Latn',      # Swahili
    'th': 'tha_Thai',      # Thai
    'tr': 'tur_Latn',      # Turkish
    'uk': 'ukr_Cyrl',      # Ukrainian
    'ur': 'urd_Arab',      # Urdu
    'vi': 'vie_Latn',      # Vietnamese
    'zh': 'zho_Hans',      # Chinese (Simplified)
}

def get_model_language_code(iso_code: str) -> str:
    """Convertit un code ISO vers un code modèle"""
    return LANGUAGE_MAPPINGS.get(iso_code, iso_code)

def get_iso_language_code(model_code: str) -> str:
    """Convertit un code modèle vers un code ISO"""
    reverse_mapping = {v: k for k, v in LANGUAGE_MAPPINGS.items()}
    return reverse_mapping.get(model_code, model_code.split('_')[0] if '_' in model_code else model_code)
