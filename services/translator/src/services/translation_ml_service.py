"""
Service de traduction ML unifié - REFACTORISÉ
Façade de compatibilité pour l'ancienne API

Architecture modulaire:
- translation_ml/model_loader.py: Gestion des modèles ML
- translation_ml/translator_engine.py: Moteur de traduction
- translation_ml/translation_cache.py: Cache Redis
- translation_ml/translation_service.py: Orchestrateur principal

Total: ~290 lignes (vs 1191 lignes God Object original)
"""

import logging
import os
import threading
from typing import Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

logger = logging.getLogger(__name__)

# CRITIQUE: Charger les variables d'environnement AVANT tout import
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / '.env'
    env_local_path = Path(__file__).parent.parent.parent / '.env.local'

    if env_path.exists():
        load_dotenv(env_path)

    if env_local_path.exists():
        load_dotenv(env_local_path, override=True)
        logger.debug("[ML-SERVICE] .env.local chargé depuis: %s", env_local_path)
except ImportError:
    logger.warning("[ML-SERVICE] python-dotenv non disponible")

# Import des settings
from config.settings import get_settings

# CRITIQUE: Définir les variables d'environnement AVANT d'importer transformers
_settings = get_settings()
# Utiliser huggingface_cache_path pour isoler les modèles HF dans models/huggingface/
os.environ['HF_HOME'] = str(_settings.huggingface_cache_path)
os.environ['TRANSFORMERS_CACHE'] = str(_settings.huggingface_cache_path)
os.environ['HUGGINGFACE_HUB_CACHE'] = str(_settings.huggingface_cache_path)

# Import du module ML refactorisé
from services.translation_ml import (
    ModelLoader,
    TranslatorEngine,
    TranslationCache,
    TranslationService,
    TranslationResult
)

# Exports pour compatibilité des tests
from utils.text_segmentation import TextSegmenter
from utils.performance import PerformanceOptimizer, get_performance_optimizer

__all__ = [
    'TranslationMLService',
    'get_unified_ml_service',
    'TextSegmenter',
    'PerformanceOptimizer',
    'get_performance_optimizer',
    'get_settings',
    'ML_AVAILABLE'
]

# Import des dépendances ML avec warnings
try:
    import torch
    torch._C._disable_meta = True
    ML_AVAILABLE = True

    import warnings
    warnings.filterwarnings("ignore", message=".*Retry attempt.*")
    warnings.filterwarnings("ignore", message=".*reqwest.*")
    warnings.filterwarnings("ignore", message=".*xethub.*")
except ImportError:
    ML_AVAILABLE = False
    logger.warning("[ML-SERVICE] ⚠️ Dependencies ML non disponibles")


class TranslationMLService:
    """
    Service de traduction ML unifié - Singleton

    REFACTORISÉ: Façade de compatibilité qui délègue aux modules spécialisés
    Préserve l'API publique existante pour compatibilité avec le code existant
    """

    _instance = None
    _lock = threading.Lock()

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
        settings,
        model_type: str = "all",
        max_workers: int = 4,
        quantization_level: str = "float16"
    ):
        """
        Initialise le service ML avec injection de dépendances

        Args:
            settings: Configuration du service
            model_type: Type de modèle ('all', 'basic', 'premium')
            max_workers: Nombre de workers pour ThreadPoolExecutor
            quantization_level: Niveau de quantification
        """
        if self._initialized:
            return

        self.settings = settings
        self.model_type = model_type

        # Configuration workers CPU multicore
        cpu_workers = min(max_workers, int(os.getenv('ML_MAX_WORKERS', '16')))
        self.max_workers = cpu_workers
        self.quantization_level = quantization_level

        # ThreadPoolExecutor partagé
        self.executor = ThreadPoolExecutor(max_workers=cpu_workers)

        # REFACTORISÉ: Injection de dépendances des modules spécialisés
        self.model_loader = ModelLoader(settings, self.executor, quantization_level)
        self.translator_engine = TranslatorEngine(self.model_loader, self.executor)
        self.translation_cache = TranslationCache()
        self.translation_service = TranslationService(
            self.model_loader,
            self.translator_engine,
            self.translation_cache,
            max_workers=cpu_workers
        )

        # Compatibilité: Exposer les attributs attendus par l'ancienne API
        self.models = self.model_loader.models
        self.tokenizers = self.model_loader.tokenizers
        self.pipelines = {}  # Géré par TranslatorEngine maintenant
        self.model_configs = self.model_loader.model_configs
        self.lang_codes = self.translator_engine.lang_codes
        self.text_segmenter = self.translation_service.text_segmenter
        self.stats = self.translation_service.stats
        self.request_times = self.translation_service.request_times
        self.is_initialized = False
        self.is_loading = False

        self._initialized = True
        logger.info(f"🤖 Service ML Unifié créé (Refactorisé) avec {cpu_workers} workers")

    async def initialize(self) -> bool:
        """
        Initialise les modèles ML
        DÉLÉGATION vers TranslationService.initialize()
        """
        result = await self.translation_service.initialize()

        # Synchroniser l'état
        self.is_initialized = self.translation_service.is_initialized
        self.is_loading = self.translation_service.is_loading

        return result

    async def translate(
        self,
        text: str,
        source_language: str = "auto",
        target_language: str = "en",
        model_type: str = "basic",
        source_channel: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Interface unique de traduction pour tous les canaux
        DÉLÉGATION vers TranslationService.translate()
        """
        return await self.translation_service.translate(
            text, source_language, target_language, model_type, source_channel
        )

    async def translate_with_structure(
        self,
        text: str,
        source_language: str = "auto",
        target_language: str = "en",
        model_type: str = "basic",
        source_channel: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Traduction avec préservation de structure
        DÉLÉGATION vers TranslationService.translate_with_structure()
        """
        return await self.translation_service.translate_with_structure(
            text, source_language, target_language, model_type, source_channel
        )

    async def get_stats(self) -> Dict[str, Any]:
        """
        Retourne les statistiques globales
        DÉLÉGATION vers TranslationService.get_stats()
        """
        return await self.translation_service.get_stats()

    async def get_health(self) -> Dict[str, Any]:
        """
        Health check du service
        DÉLÉGATION vers TranslationService.get_health()
        """
        return await self.translation_service.get_health()

    async def close(self):
        """
        Ferme proprement le service et libère les ressources
        DÉLÉGATION vers TranslationService.close()
        """
        logger.info("🛑 Arrêt du service ML unifié (Refactorisé)...")

        try:
            # Arrêter le ThreadPoolExecutor
            if hasattr(self, 'executor') and self.executor:
                self.executor.shutdown(wait=False)
                logger.info("✅ ThreadPoolExecutor arrêté")

            # Déléguer au service principal
            await self.translation_service.close()

            # Synchroniser l'état
            self.is_initialized = False
            self.is_loading = False

            # Réinitialiser singleton
            self._initialized = False
            TranslationMLService._instance = None

            logger.info("✅ Service ML unifié (Refactorisé) arrêté proprement")

        except Exception as e:
            logger.error(f"❌ Erreur lors de l'arrêt du service ML: {e}")

    # COMPATIBILITÉ: Propriétés pour accès direct (utilisées par l'ancienne API)
    @property
    def device(self) -> str:
        """Device configuré (cpu, cuda, mps)"""
        return self.model_loader.device

    @property
    def models_path(self):
        """Chemin vers les modèles"""
        return self.model_loader.models_path

    # MÉTHODES PRIVÉES INTERNES (pour compatibilité stricte si nécessaire)
    # Note: Ces méthodes sont maintenant gérées par les modules, mais on garde
    # les signatures pour compatibilité totale

    def _detect_language(self, text: str) -> str:
        """Détection de langue - DÉLÉGATION vers TranslatorEngine"""
        return self.translator_engine.detect_language(text)

    async def _ml_translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> str:
        """Traduction ML - DÉLÉGATION vers TranslatorEngine"""
        return await self.translator_engine.translate_text(
            text, source_lang, target_lang, model_type
        )

    async def _ml_translate_batch(
        self,
        texts: list,
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> list:
        """Traduction batch - DÉLÉGATION vers TranslatorEngine"""
        return await self.translator_engine.translate_batch(
            texts, source_lang, target_lang, model_type
        )


# Instance globale du service (Singleton)
def get_unified_ml_service(max_workers: int = 4) -> TranslationMLService:
    """Retourne l'instance unique du service ML refactorisé"""
    return TranslationMLService(get_settings(), max_workers=max_workers)
