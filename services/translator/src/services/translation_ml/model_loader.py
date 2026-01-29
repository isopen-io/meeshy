"""
Module de chargement et gestion des modèles ML
Responsabilités:
- Chargement des modèles NLLB depuis HuggingFace ou cache local
- Gestion du cache de modèles
- Détection device (CPU/CUDA/MPS)
- Configuration optimisations PyTorch
"""

import os
import logging
import asyncio
import threading
from pathlib import Path
from typing import Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Import conditionnel des dépendances ML
ML_AVAILABLE = False
MODEL_MANAGER_AVAILABLE = False

try:
    import torch
    torch._C._disable_meta = True
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    ML_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ Dependencies ML non disponibles")

try:
    from services.model_manager import get_model_manager, ModelType
    MODEL_MANAGER_AVAILABLE = True
except ImportError:
    pass

from utils.performance import (
    get_performance_optimizer,
    PerformanceConfig
)


class ModelLoader:
    """
    Gestionnaire de chargement et cache des modèles ML
    Gère le cycle de vie des modèles NLLB (600M et 1.3B)
    """

    def __init__(self, settings, executor: ThreadPoolExecutor, quantization_level: str = "float16"):
        """
        Initialise le model loader

        Args:
            settings: Configuration du service (chemins, modèles)
            executor: ThreadPoolExecutor pour chargement asynchrone
            quantization_level: Niveau de quantification ('float16', 'float32')
        """
        self.settings = settings
        self.executor = executor
        self.quantization_level = quantization_level

        # Cache des modèles et tokenizers chargés
        self.models: Dict[str, Any] = {}
        self.tokenizers: Dict[str, Any] = {}

        # ✨ Locks par modèle pour thread-safety des inférences PyTorch
        # Les modèles PyTorch ne sont PAS thread-safe, donc on doit sérialiser les inférences
        # Utilisation de threading.Lock car les inférences sont exécutées dans un ThreadPoolExecutor
        self._model_inference_locks: Dict[str, threading.Lock] = {}

        # Cache thread-local pour éviter "Already borrowed"
        self._thread_local_tokenizers: Dict[str, Any] = {}
        self._tokenizer_lock = threading.Lock()

        # Optimisations performance
        self.perf_optimizer = get_performance_optimizer()
        self.perf_config = PerformanceConfig()

        # Configuration des chemins et device
        self.models_path = Path(settings.models_path)
        self.huggingface_cache = Path(settings.huggingface_cache_path)
        self.device = os.getenv('DEVICE', 'cpu')

        # Configuration des modèles disponibles
        self.model_configs = {
            'basic': {
                'model_name': settings.basic_model,
                'local_path': self.models_path / settings.basic_model,
                'description': 'NLLB 600M - Rapide, bonne qualité',
                'device': self.device,
                'priority': 1
            },
            'premium': {
                'model_name': settings.premium_model,
                'local_path': self.models_path / settings.premium_model,
                'description': 'NLLB 1.3B - Haute qualité',
                'device': self.device,
                'priority': 2
            }
        }
        # Alias pour compatibilité
        self.model_configs['medium'] = self.model_configs['basic']

        logger.info(f"🔧 ModelLoader initialisé: {self.models_path}")
        logger.info(f"🔧 Device configuré: {self.device}")

    def configure_environment(self):
        """Configure les variables d'environnement PyTorch et HuggingFace"""
        # Configuration HuggingFace - utiliser le cache dédié huggingface/
        os.environ['HF_HOME'] = str(self.huggingface_cache)
        os.environ['TRANSFORMERS_CACHE'] = str(self.huggingface_cache)
        os.environ['HUGGINGFACE_HUB_CACHE'] = str(self.huggingface_cache)
        os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
        os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'

        # Configuration réseau et timeout
        os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
        os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = str(self.settings.huggingface_timeout)
        os.environ['HF_HUB_DOWNLOAD_RETRY_DELAY'] = '5'
        os.environ['HF_HUB_DOWNLOAD_MAX_RETRIES'] = str(self.settings.model_download_max_retries)

        # Configuration PyTorch
        os.environ['PYTORCH_DISABLE_META'] = '1'
        os.environ['PYTORCH_FORCE_CUDA'] = '0'
        os.environ['PYTORCH_NO_CUDA_MEMORY_CACHING'] = '1'

        # Configuration SSL
        if os.path.exists('/etc/ssl/certs/ca-certificates.crt'):
            os.environ['REQUESTS_CA_BUNDLE'] = '/etc/ssl/certs/ca-certificates.crt'
            os.environ['CURL_CA_BUNDLE'] = '/etc/ssl/certs/ca-certificates.crt'
        elif os.path.exists('/etc/ssl/certs/ca-bundle.crt'):
            os.environ['REQUESTS_CA_BUNDLE'] = '/etc/ssl/certs/ca-bundle.crt'
            os.environ['CURL_CA_BUNDLE'] = '/etc/ssl/certs/ca-bundle.crt'

        logger.info("✅ Variables d'environnement configurées")

    def initialize_device(self) -> str:
        """
        Initialise et configure le device (CPU/CUDA) avec optimisations

        Returns:
            str: Device configuré ('cpu', 'cuda', 'mps')
        """
        if not ML_AVAILABLE:
            return 'cpu'

        # Initialiser via PerformanceOptimizer
        self.device = self.perf_optimizer.initialize()
        logger.info(f"⚙️ Device configuré via PerformanceOptimizer: {self.device}")

        # Configuration threads PyTorch pour AMD multicore
        try:
            torch.set_num_threads(self.perf_config.num_omp_threads)
            torch.set_num_interop_threads(2)
        except RuntimeError as e:
            if "interop threads" not in str(e):
                raise
            logger.debug("⚙️ Threads PyTorch déjà configurés")

        logger.info(
            f"⚙️ PyTorch configuré: {torch.get_num_threads()} threads intra-op, "
            f"{torch.get_num_interop_threads()} threads inter-op"
        )

        if self.perf_optimizer.cuda_available:
            logger.info(f"🎮 CUDA disponible: {torch.cuda.get_device_name(0)}")
        else:
            logger.info("🖥️ Mode CPU avec optimisations Linux")

        return self.device

    async def load_model(self, model_type: str):
        """
        Charge un modèle spécifique depuis local ou HuggingFace

        Args:
            model_type: Type de modèle ('basic', 'premium', 'medium')

        Raises:
            Exception: Si le chargement échoue
        """
        if model_type in self.models:
            logger.debug(f"Modèle {model_type} déjà chargé")
            return

        config = self.model_configs[model_type]
        model_name = config['model_name']

        # Réutiliser un modèle déjà chargé si même model_name
        for existing_type, existing_model in self.models.items():
            existing_config = self.model_configs.get(existing_type)
            if existing_config and existing_config['model_name'] == model_name:
                self.models[model_type] = existing_model
                self.tokenizers[model_type] = self.tokenizers[existing_type]
                logger.info(f"♻️ Modèle {model_type} réutilise {existing_type}: {model_name}")
                return

        logger.info(f"📥 Chargement {model_type}: {model_name}")

        def load_model_sync():
            """Chargement synchrone du modèle et tokenizer"""
            try:
                # Charger le tokenizer
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name,
                    cache_dir=str(self.huggingface_cache),
                    use_fast=True,
                    model_max_length=512
                )

                # Déterminer dtype (float32 pour CPU, float16 pour GPU)
                device = config['device']
                dtype = torch.float32 if device == "cpu" else (
                    getattr(torch, self.quantization_level)
                    if hasattr(torch, self.quantization_level)
                    else torch.float32
                )

                # Charger le modèle
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_name,
                    cache_dir=str(self.huggingface_cache),
                    torch_dtype=dtype,
                    low_cpu_mem_usage=True,
                    device_map="auto" if device == "cuda" else None
                )

                # Mode evaluation pour désactiver dropout
                model.eval()

                return tokenizer, model

            except Exception as e:
                logger.error(f"❌ Erreur chargement {model_type}: {e}")
                return None, None

        # Chargement asynchrone
        loop = asyncio.get_event_loop()
        tokenizer, model = await loop.run_in_executor(self.executor, load_model_sync)

        if not model or not tokenizer:
            raise Exception(f"Échec chargement {model_type}")

        # Enregistrer le tokenizer
        self.tokenizers[model_type] = tokenizer

        # Appliquer torch.compile si activé
        if self.perf_config.enable_torch_compile:
            model = self.perf_optimizer.compile_model(model, f"nllb_{model_type}")

        # Enregistrer le modèle
        self.models[model_type] = model

        # Enregistrer dans ModelManager si disponible
        if MODEL_MANAGER_AVAILABLE:
            try:
                model_manager = get_model_manager()
                model_manager.register_model(
                    model_id=f"translation_{model_type}",
                    model_type=ModelType.TRANSLATION,
                    model_name=model_name,
                    model_object=model,
                    priority=1 if model_type == 'basic' else 2
                )
            except Exception as e:
                logger.warning(f"⚠️ Impossible d'enregistrer dans ModelManager: {e}")

        logger.info(f"✅ Modèle {model_type} chargé: {model_name}")
        if config['local_path'].exists():
            logger.info(f"📁 Modèle disponible en local: {config['local_path']}")

    def get_thread_local_tokenizer(self, model_type: str) -> Optional[Any]:
        """
        Obtient ou crée un tokenizer pour le thread actuel (évite 'Already borrowed')

        Args:
            model_type: Type de modèle

        Returns:
            Tokenizer thread-local ou None si erreur
        """
        thread_id = threading.current_thread().ident
        cache_key = f"{model_type}_{thread_id}"

        if cache_key in self._thread_local_tokenizers:
            return self._thread_local_tokenizers[cache_key]

        with self._tokenizer_lock:
            # Double-check
            if cache_key in self._thread_local_tokenizers:
                return self._thread_local_tokenizers[cache_key]

            try:
                model_name = self.model_configs[model_type]['model_name']
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name,
                    cache_dir=str(self.huggingface_cache),
                    use_fast=True
                )
                self._thread_local_tokenizers[cache_key] = tokenizer
                logger.debug(f"✅ Tokenizer thread-local créé: {cache_key}")
                return tokenizer
            except Exception as e:
                logger.error(f"❌ Erreur création tokenizer thread-local: {e}")
                return None

    def get_model(self, model_type: str) -> Optional[Any]:
        """Retourne le modèle chargé ou None"""
        return self.models.get(model_type)

    def get_tokenizer(self, model_type: str) -> Optional[Any]:
        """Retourne le tokenizer chargé ou None"""
        return self.tokenizers.get(model_type)

    def get_model_inference_lock(self, model_type: str) -> threading.Lock:
        """
        Retourne le lock d'inférence pour un modèle spécifique

        Les modèles PyTorch ne sont PAS thread-safe. Ce lock garantit qu'une seule
        inférence s'exécute à la fois sur un modèle donné, évitant les corruptions
        de mémoire et les résultats incorrects.

        Args:
            model_type: Type de modèle ('basic', 'medium', 'premium')

        Returns:
            threading.Lock pour ce modèle
        """
        if model_type not in self._model_inference_locks:
            self._model_inference_locks[model_type] = threading.Lock()
            logger.info(f"🔒 [MODEL_LOCK] Lock d'inférence créé pour modèle '{model_type}'")

        return self._model_inference_locks[model_type]

    def is_model_loaded(self, model_type: str) -> bool:
        """Vérifie si un modèle est chargé"""
        return model_type in self.models

    def get_loaded_models(self) -> list:
        """Retourne la liste des modèles chargés"""
        return list(self.models.keys())

    def cleanup(self):
        """Libère les ressources mémoire"""
        logger.info("🧹 Nettoyage ModelLoader...")

        # Libérer les modèles
        for model_type in list(self.models.keys()):
            try:
                del self.models[model_type]
            except Exception:
                pass
        self.models.clear()

        # Libérer les tokenizers
        self.tokenizers.clear()
        self._thread_local_tokenizers.clear()

        # Nettoyage GPU/CPU
        if ML_AVAILABLE:
            try:
                import gc
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("✅ Cache CUDA vidé")
            except Exception:
                pass

        logger.info("✅ ModelLoader nettoyé")
