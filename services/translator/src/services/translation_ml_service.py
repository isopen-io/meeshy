"""
Service de traduction ML unifié - Architecture centralisée
Un seul service ML qui charge les modèles au démarrage et sert tous les canaux
"""

import os
import logging
import time
import asyncio
import re
from typing import Dict, Optional, List, Any, Union
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import threading
from pathlib import Path

# CRITIQUE: Charger les variables d'environnement AVANT tout import
try:
    from dotenv import load_dotenv
    # Charger .env puis .env.local (override)
    env_path = Path(__file__).parent.parent.parent / '.env'
    env_local_path = Path(__file__).parent.parent.parent / '.env.local'
    
    if env_path.exists():
        load_dotenv(env_path)
    
    if env_local_path.exists():
        load_dotenv(env_local_path, override=True)
        print(f"🔧 [ML-SERVICE] .env.local chargé depuis: {env_local_path}")
        print(f"🔧 [ML-SERVICE] MODELS_PATH: {os.getenv('MODELS_PATH', 'NOT SET')}")
except ImportError:
    print("⚠️ [ML-SERVICE] python-dotenv non disponible")

# Import des settings
from config.settings import get_settings

# CRITIQUE: Définir les variables d'environnement AVANT d'importer transformers
# Transformers lit ces variables au moment de l'import
_settings = get_settings()
os.environ['HF_HOME'] = str(_settings.models_path)
os.environ['TRANSFORMERS_CACHE'] = str(_settings.models_path)
os.environ['HUGGINGFACE_HUB_CACHE'] = str(_settings.models_path)
print(f"🔧 [ML-SERVICE] Variables HuggingFace définies: {_settings.models_path}")

# Import du module de segmentation pour préservation de structure
from utils.text_segmentation import TextSegmenter

# Import des optimisations de performance Linux/CUDA
from utils.performance import (
    PerformanceOptimizer,
    PerformanceConfig,
    BatchProcessor,
    TranslationPriorityQueue,
    Priority,
    get_performance_optimizer,
    create_inference_context
)

# Import du cache Redis pour segment-level caching
CACHE_AVAILABLE = False
_translation_cache = None
try:
    from services.redis_service import get_translation_cache_service
    CACHE_AVAILABLE = True
except ImportError:
    pass

# Import des modèles ML optimisés
try:
    import torch
    
    # SOLUTION: Désactiver les tensors meta avant d'importer les autres modules
    torch._C._disable_meta = True  # Désactiver les tensors meta au niveau PyTorch
    
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline
    ML_AVAILABLE = True
    
    # Suppression des warnings de retry Xet
    import warnings
    warnings.filterwarnings("ignore", message=".*Retry attempt.*")
    warnings.filterwarnings("ignore", message=".*reqwest.*")
    warnings.filterwarnings("ignore", message=".*xethub.*")
    warnings.filterwarnings("ignore", message=".*IncompleteMessage.*")
    warnings.filterwarnings("ignore", message=".*SendRequest.*")
    
except ImportError:
    ML_AVAILABLE = False
    print("⚠️ Dependencies ML non disponibles")

logger = logging.getLogger(__name__)

@dataclass
class TranslationResult:
    """Résultat d'une traduction unifié"""
    translated_text: str
    detected_language: str
    confidence: float
    model_used: str
    from_cache: bool
    processing_time: float
    source_channel: str  # 'zmq', 'rest', 'websocket'

class TranslationMLService:
    """
    Service de traduction ML unifié - Singleton
    Charge les modèles une seule fois au démarrage et sert tous les canaux
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        """Singleton pattern pour garantir une seule instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, settings, model_type: str = "all", max_workers: int = 4, quantization_level: str = "float16"):
        if self._initialized:
            return
            
        # Charger les settings
        self.settings = settings
        
        self.model_type = model_type
        # OPTIMISATION CPU MULTICORE: Utiliser 16 workers pour AMD 18 cores
        # Laisser 2 cores pour l'OS et les opérations système
        import os
        cpu_workers = min(max_workers, int(os.getenv('ML_MAX_WORKERS', '16')))
        self.max_workers = cpu_workers
        self.quantization_level = quantization_level
        self.executor = ThreadPoolExecutor(max_workers=cpu_workers)
        
        # Modèles ML chargés (partagés entre tous les canaux)
        self.models = {}
        self.tokenizers = {}
        self.pipelines = {}
        
        # Cache thread-local de tokenizers pour éviter "Already borrowed"
        self._thread_local_tokenizers = {}
        self._tokenizer_lock = threading.Lock()

        # Segmenteur de texte pour préservation de structure
        self.text_segmenter = TextSegmenter(max_segment_length=100)

        # OPTIMISATION: Performance optimizer pour Linux/CUDA
        self.perf_optimizer = get_performance_optimizer()
        self.perf_config = PerformanceConfig()

        # Configuration des modèles depuis les settings et .env
        self.models_path = Path(self.settings.models_path)
        logger.info(f"🔍 [ML-SERVICE] models_path configuré: {self.models_path}")
        logger.info(f"🔍 [ML-SERVICE] models_path existe: {self.models_path.exists()}")
        logger.info(f"🔍 [ML-SERVICE] HF_HOME env: {os.getenv('HF_HOME', 'NOT SET')}")
        logger.info(f"🔍 [ML-SERVICE] TRANSFORMERS_CACHE env: {os.getenv('TRANSFORMERS_CACHE', 'NOT SET')}")
        self.device = os.getenv('DEVICE', 'cpu')
        
        # Deux modèles NLLB uniquement: basic (600M) et premium (1.3B)
        self.model_configs = {
            'basic': {
                'model_name': self.settings.basic_model,
                'local_path': self.models_path / self.settings.basic_model,
                'description': 'NLLB 600M - Rapide, bonne qualité',
                'device': self.device,
                'priority': 1  # Chargé en premier
            },
            'premium': {
                'model_name': self.settings.premium_model,
                'local_path': self.models_path / self.settings.premium_model,
                'description': 'NLLB 1.3B - Haute qualité',
                'device': self.device,
                'priority': 2
            }
        }
        # Alias pour compatibilité
        self.model_configs['medium'] = self.model_configs['basic']
        
        # Mapping des codes de langues NLLB
        self.lang_codes = {
            'fr': 'fra_Latn',
            'en': 'eng_Latn', 
            'es': 'spa_Latn',
            'de': 'deu_Latn',
            'pt': 'por_Latn',
            'zh': 'zho_Hans',
            'ja': 'jpn_Jpan',
            'ar': 'arb_Arab'
        }
        
        
        # Stats globales (partagées entre tous les canaux)
        self.stats = {
            'translations_count': 0,
            'zmq_translations': 0,
            'rest_translations': 0,
            'websocket_translations': 0,
            'avg_processing_time': 0.0,
            'models_loaded': False,
            'startup_time': None
        }
        self.request_times = []
        
        # État d'initialisation
        self.is_initialized = False
        self.is_loading = False
        self._startup_lock = asyncio.Lock()
        
        self._initialized = True
        self._configure_environment()
        logger.info(f"🤖 Service ML Unifié créé (Singleton) avec {max_workers} workers")
    
    def _configure_environment(self):
        """Configure les variables d'environnement basées sur les settings"""
        import os
        
        # OPTIMISATION XET: Configuration pour réduire les warnings du nouveau système
        os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
        os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'
        
        # OPTIMISATION RÉSEAU: Configuration pour améliorer la connectivité Docker
        os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
        os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = str(self.settings.huggingface_timeout)
        os.environ['HF_HUB_DOWNLOAD_RETRY_DELAY'] = '5'
        os.environ['HF_HUB_DOWNLOAD_MAX_RETRIES'] = str(self.settings.model_download_max_retries)
        
        # SOLUTION: Désactiver les tensors meta pour éviter l'erreur Tensor.item()
        os.environ['PYTORCH_DISABLE_META'] = '1'
        os.environ['PYTORCH_FORCE_CUDA'] = '0'  # Forcer CPU si pas de GPU
        os.environ['PYTORCH_NO_CUDA_MEMORY_CACHING'] = '1'
        
        # Configuration pour éviter les problèmes de proxy/corporate network
        # Vérifier si le fichier de certificats existe, sinon utiliser le système par défaut
        if os.path.exists('/etc/ssl/certs/ca-certificates.crt'):
            os.environ['REQUESTS_CA_BUNDLE'] = '/etc/ssl/certs/ca-certificates.crt'
            os.environ['CURL_CA_BUNDLE'] = '/etc/ssl/certs/ca-certificates.crt'
        elif os.path.exists('/etc/ssl/certs/ca-bundle.crt'):
            os.environ['REQUESTS_CA_BUNDLE'] = '/etc/ssl/certs/ca-bundle.crt'
            os.environ['CURL_CA_BUNDLE'] = '/etc/ssl/certs/ca-bundle.crt'
        else:
            # Utiliser le système par défaut
            logger.info("⚠️ Fichier de certificats SSL non trouvé, utilisation du système par défaut")
        
        # Option pour désactiver temporairement la vérification SSL si nécessaire
        if os.getenv('HF_HUB_DISABLE_SSL_VERIFICATION', '0') == '1':
            os.environ['REQUESTS_CA_BUNDLE'] = ''
            os.environ['CURL_CA_BUNDLE'] = ''
            logger.info("⚠️ Vérification SSL désactivée pour Hugging Face (HF_HUB_DISABLE_SSL_VERIFICATION=1)")
    
    async def initialize(self) -> bool:
        """Initialise les modèles ML une seule fois au démarrage"""
        async with self._startup_lock:
            if self.is_initialized:
                logger.info("✅ Service ML déjà initialisé")
                return True
                
            if self.is_loading:
                logger.info("⏳ Initialisation ML en cours...")
                # Attendre que l'initialisation se termine
                while self.is_loading and not self.is_initialized:
                    await asyncio.sleep(0.5)
                return self.is_initialized
            
            self.is_loading = True
            startup_start = time.time()
            
            if not ML_AVAILABLE:
                logger.error("❌ Transformers non disponible. Service ML désactivé.")
                self.is_loading = False
                return False
            
            try:
                logger.info("🚀 Initialisation du Service ML Unifié...")

                # ═══════════════════════════════════════════════════════════════
                # OPTIMISATION LINUX/CUDA: Initialiser le performance optimizer
                # ═══════════════════════════════════════════════════════════════
                if ML_AVAILABLE:
                    # Initialiser les optimisations Linux/CUDA
                    self.device = self.perf_optimizer.initialize()
                    logger.info(f"⚙️ Device configuré via PerformanceOptimizer: {self.device}")

                    # Configuration supplémentaire des threads PyTorch pour AMD multicore
                    torch.set_num_threads(self.perf_config.num_omp_threads)
                    torch.set_num_interop_threads(2)  # 2 threads pour opérations inter-op
                    logger.info(f"⚙️ PyTorch configuré: {torch.get_num_threads()} threads intra-op, {torch.get_num_interop_threads()} threads inter-op")

                    if self.perf_optimizer.cuda_available:
                        logger.info(f"🎮 CUDA disponible: {torch.cuda.get_device_name(0)}")
                    else:
                        logger.info(f"🖥️ Mode CPU avec optimisations Linux")

                logger.info("📚 Chargement des modèles NLLB...")
                
                # Charger les modèles par ordre de priorité
                models_to_load = sorted(
                    self.model_configs.items(), 
                    key=lambda x: x[1]['priority']
                )
                
                for model_type, config in models_to_load:
                    try:
                        await self._load_model(model_type)
                    except Exception as e:
                        logger.error(f"❌ Erreur chargement {model_type}: {e}")
                        # Continuer avec les autres modèles
                
                # Vérifier qu'au moins un modèle est chargé
                if not self.models:
                    logger.error("❌ Aucun modèle ML chargé")
                    self.is_loading = False
                    return False
                
                startup_time = time.time() - startup_start
                self.stats['startup_time'] = startup_time
                self.stats['models_loaded'] = True
                self.is_initialized = True
                self.is_loading = False
                
                logger.info(f"✅ Service ML Unifié initialisé en {startup_time:.2f}s")
                logger.info(f"📊 Modèles chargés: {list(self.models.keys())}")
                logger.info(f"🎯 Prêt à servir tous les canaux: ZMQ, REST, WebSocket")
                
                return True
                
            except Exception as e:
                logger.error(f"❌ Erreur critique initialisation ML: {e}")
                self.is_loading = False
                return False
    
    def _get_thread_local_tokenizer(self, model_type: str) -> Optional[AutoTokenizer]:
        """Obtient ou crée un tokenizer pour le thread actuel (évite 'Already borrowed')"""
        import threading
        thread_id = threading.current_thread().ident
        cache_key = f"{model_type}_{thread_id}"
        
        # Vérifier le cache thread-local
        if cache_key in self._thread_local_tokenizers:
            return self._thread_local_tokenizers[cache_key]
        
        # Créer un nouveau tokenizer pour ce thread
        with self._tokenizer_lock:
            # Double-check après acquisition du lock
            if cache_key in self._thread_local_tokenizers:
                return self._thread_local_tokenizers[cache_key]
            
            try:
                model_name = self.model_configs[model_type]['model_name']
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name,
                    cache_dir=str(self.models_path),
                    use_fast=True
                )
                self._thread_local_tokenizers[cache_key] = tokenizer
                logger.debug(f"✅ Tokenizer thread-local créé: {cache_key}")
                return tokenizer
            except Exception as e:
                logger.error(f"❌ Erreur création tokenizer thread-local: {e}")
                return None
    
    async def _load_model(self, model_type: str):
        """Charge un modèle spécifique depuis local ou HuggingFace"""
        if model_type in self.models:
            return  # Déjà chargé
        
        config = self.model_configs[model_type]
        model_name = config['model_name']
        local_path = config['local_path']
        device = config['device']
        
        logger.info(f"📥 Chargement {model_type}: {model_name}")
        
        # Charger dans un thread pour éviter de bloquer
        def load_model():
            try:
                # Tokenizer
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name, 
                    cache_dir=str(self.models_path),
                    use_fast=True,  # Tokenizer rapide
                    model_max_length=512  # Limiter la taille
                )
                
                # Modèle avec quantification
                # OPTIMISATION CPU: Utiliser float32 au lieu de float16 sur CPU pour éviter les erreurs
                # et améliorer la compatibilité. Sur CPU, float16 n'apporte pas d'accélération.
                dtype = torch.float32 if device == "cpu" else (
                    getattr(torch, self.quantization_level) if hasattr(torch, self.quantization_level) else torch.float32
                )
                
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_name,
                    cache_dir=str(self.models_path), 
                    torch_dtype=dtype,
                    low_cpu_mem_usage=True,  # Optimisation mémoire
                    device_map="auto" if device == "cuda" else None
                )
                
                # OPTIMISATION CPU: Mettre le modèle en mode eval pour désactiver dropout
                model.eval()
                
                # CORRECTION: Pas de pipeline partagé pour éviter "Already borrowed"
                # On crée les pipelines à la demande dans _ml_translate
                
                return tokenizer, model
                
            except Exception as e:
                logger.error(f"❌ Erreur chargement {model_type}: {e}")
                return None, None
        
        # Charger de manière asynchrone
        loop = asyncio.get_event_loop()
        tokenizer, model = await loop.run_in_executor(self.executor, load_model)
        
        if model and tokenizer:
            self.tokenizers[model_type] = tokenizer

            # ═══════════════════════════════════════════════════════════════
            # OPTIMISATION: torch.compile pour accélérer l'inférence
            # ═══════════════════════════════════════════════════════════════
            if self.perf_config.enable_torch_compile:
                model = self.perf_optimizer.compile_model(model, f"nllb_{model_type}")

            self.models[model_type] = model
            logger.info(f"✅ Modèle {model_type} chargé: {model_name}")
            if local_path.exists():
                logger.info(f"📁 Modèle disponible en local: {local_path}")
        else:
            raise Exception(f"Échec chargement {model_type}")
    
    async def translate(self, text: str, source_language: str = "auto", 
                       target_language: str = "en", model_type: str = "basic",
                       source_channel: str = "unknown") -> Dict[str, Any]:
        """
        Interface unique de traduction pour tous les canaux
        source_channel: 'zmq', 'rest', 'websocket'
        """
        start_time = time.time()
        
        try:
            # Validation
            if not text.strip():
                raise ValueError("Text cannot be empty")
            
            # Vérifier que le service est initialisé
            if not self.is_initialized:
                logger.warning("Service ML non initialisé, utilisation du fallback")
                return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)
            
            # Fallback si modèle spécifique pas disponible  
            if model_type not in self.models:
                # Utiliser le premier modèle disponible
                available_models = list(self.models.keys())
                if available_models:
                    model_type = available_models[0]
                    logger.info(f"Modèle demandé non disponible, utilisation de: {model_type}")
                else:
                    return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)
            
            # Détecter la langue source si nécessaire
            detected_lang = source_language if source_language != "auto" else self._detect_language(text)
            
            # Traduire avec le vrai modèle ML
            translated_text = await self._ml_translate(text, detected_lang, target_language, model_type)
            
            processing_time = time.time() - start_time
            self._update_stats(processing_time, source_channel)
            
            result = {
                'translated_text': translated_text,
                'detected_language': detected_lang,
                'confidence': 0.95,  # Confiance élevée pour les vrais modèles
                'model_used': f"{model_type}_ml",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel
            }
            
            logger.info(f"✅ [ML-{source_channel.upper()}] '{text[:20]}...' → '{translated_text[:20]}...' ({processing_time:.3f}s)")
            return result

        except Exception as e:
            logger.error(f"❌ Erreur traduction ML [{source_channel}]: {e}")
            # Fallback en cas d'erreur
            return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)

    async def translate_with_structure(self, text: str, source_language: str = "auto",
                                      target_language: str = "en", model_type: str = "basic",
                                      source_channel: str = "unknown") -> Dict[str, Any]:
        """
        Traduction avec préservation de structure (paragraphes, emojis, sauts de ligne)

        Cette méthode segmente le texte, traduit chaque segment séparément,
        puis réassemble en préservant la structure originale

        AMÉLIORATION: Sélection automatique du modèle selon la longueur du texte
        """
        start_time = time.time()

        try:
            # Validation
            if not text.strip():
                raise ValueError("Text cannot be empty")

            # AMÉLIORATION: Sélection automatique du modèle selon la longueur
            # - Textes < 50 chars: basic (rapide)
            # - Textes >= 50 chars: medium (meilleure qualité)
            # - Textes >= 200 chars: premium si disponible (qualité maximale)
            text_length = len(text)
            original_model_type = model_type

            if text_length >= 200 and 'premium' in self.models:
                model_type = 'premium'
                logger.info(f"[STRUCTURED] Text length {text_length} chars → Using PREMIUM model for best quality")
            elif text_length >= 50 and 'medium' in self.models:
                model_type = 'medium'
                logger.info(f"[STRUCTURED] Text length {text_length} chars → Using MEDIUM model for better quality")
            elif model_type not in self.models and 'basic' in self.models:
                model_type = 'basic'
                logger.info(f"[STRUCTURED] Requested model not available → Using BASIC model")

            if model_type != original_model_type:
                logger.info(f"[STRUCTURED] Model switched: {original_model_type} → {model_type}")

            # Vérifier si le texte est court et sans structure complexe
            if len(text) <= 100 and '\n\n' not in text and not self.text_segmenter.extract_emojis(text)[1]:
                # Texte simple, utiliser la traduction standard
                logger.debug(f"[STRUCTURED] Text is simple, using standard translation")
                return await self.translate(text, source_language, target_language, model_type, source_channel)

            logger.info(f"[STRUCTURED] Starting structured translation: {len(text)} chars")

            # Vérifier que le service est initialisé
            if not self.is_initialized:
                logger.warning("Service ML non initialisé, utilisation du fallback")
                return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)

            # Fallback si modèle spécifique pas disponible
            if model_type not in self.models:
                available_models = list(self.models.keys())
                if available_models:
                    model_type = available_models[0]
                    logger.info(f"Modèle demandé non disponible, utilisation de: {model_type}")
                else:
                    return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)

            # Détecter la langue source si nécessaire
            detected_lang = source_language if source_language != "auto" else self._detect_language(text)

            # 1. Segmenter le texte (extraction emojis + découpage par paragraphes)
            segments, emojis_map = self.text_segmenter.segment_text(text)
            logger.info(f"[STRUCTURED] Text segmented into {len(segments)} parts with {len(emojis_map)} emojis")

            # ═══════════════════════════════════════════════════════════════
            # PARALLÉLISATION DES SEGMENTS AVEC CACHE (TTL 1 mois)
            # ═══════════════════════════════════════════════════════════════
            # Les segments sont INDÉPENDANTS et peuvent être traduits en parallèle.
            # Chaque segment est caché par hash(text + source + target + model).
            # Si le segment existe en cache, on le réutilise immédiatement.

            # Initialiser le cache si disponible
            global _translation_cache
            if CACHE_AVAILABLE and _translation_cache is None:
                try:
                    _translation_cache = get_translation_cache_service()
                except Exception:
                    pass

            # Semaphore pour limiter la charge (max 5 traductions parallèles)
            max_concurrent = int(os.getenv('MAX_PARALLEL_SEGMENTS', '5'))
            semaphore = asyncio.Semaphore(max_concurrent)
            cache_hits = 0

            async def translate_segment_parallel(idx: int, segment: dict) -> tuple:
                """Traduit un segment en parallèle avec cache et gestion de concurrence"""
                nonlocal cache_hits
                segment_type = segment.get('type', 'line')

                # Préserver les séparateurs, lignes vides et blocs de code
                if segment_type in ['paragraph_break', 'separator', 'empty_line', 'code']:
                    return (idx, segment)

                # Traduire uniquement les lignes de texte
                if segment_type == 'line':
                    segment_text = segment.get('text', '')
                    if not segment_text.strip():
                        return (idx, segment)

                    # ─────────────────────────────────────────────────────────
                    # VÉRIFIER LE CACHE SEGMENT (hash-based, TTL 1 mois)
                    # ─────────────────────────────────────────────────────────
                    if _translation_cache:
                        try:
                            cached = await _translation_cache.get_translation(
                                text=segment_text,
                                source_lang=detected_lang,
                                target_lang=target_language,
                                model_type=model_type
                            )
                            if cached:
                                cache_hits += 1
                                return (idx, {'type': 'line', 'text': cached.get('translated_text', segment_text)})
                        except Exception as cache_err:
                            logger.debug(f"[CACHE] Erreur lecture segment {idx}: {cache_err}")

                    # ─────────────────────────────────────────────────────────
                    # TRADUIRE SI PAS EN CACHE
                    # ─────────────────────────────────────────────────────────
                    async with semaphore:  # Limiter la concurrence
                        try:
                            translated = await self._ml_translate(
                                segment_text,
                                detected_lang,
                                target_language,
                                model_type
                            )

                            # Mettre en cache la traduction du segment (TTL 1 mois)
                            if _translation_cache:
                                try:
                                    await _translation_cache.set_translation(
                                        text=segment_text,
                                        source_lang=detected_lang,
                                        target_lang=target_language,
                                        translated_text=translated,
                                        model_type=model_type
                                    )
                                except Exception:
                                    pass  # Cache optionnel, ne pas bloquer

                            return (idx, {'type': 'line', 'text': translated})
                        except Exception as e:
                            logger.error(f"[PARALLEL] Erreur segment {idx}: {e}")
                            return (idx, segment)  # Garder l'original en cas d'erreur

                return (idx, segment)

            # Lancer toutes les traductions en parallèle
            parallel_start = time.time()
            tasks = [translate_segment_parallel(i, seg) for i, seg in enumerate(segments)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            parallel_time = (time.time() - parallel_start) * 1000

            # Reconstruire la liste ordonnée des segments traduits
            translated_segments = [None] * len(segments)
            errors_count = 0
            for result in results:
                if isinstance(result, Exception):
                    errors_count += 1
                    logger.error(f"[PARALLEL] Exception: {result}")
                else:
                    idx, translated_seg = result
                    translated_segments[idx] = translated_seg

            # Remplacer les None par les segments originaux (fallback)
            for i, seg in enumerate(translated_segments):
                if seg is None:
                    translated_segments[i] = segments[i]

            logger.info(f"[PARALLEL] ⚡ {len(segments)} segments traduits en {parallel_time:.0f}ms ({cache_hits} cache hits, {errors_count} erreurs)")

            # 3. Réassembler le texte traduit
            final_text = self.text_segmenter.reassemble_text(translated_segments, emojis_map)

            processing_time = time.time() - start_time
            self._update_stats(processing_time, source_channel)

            result = {
                'translated_text': final_text,
                'detected_language': detected_lang,
                'confidence': 0.95,
                'model_used': f"{model_type}_ml_structured",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel,
                'segments_count': len(segments),
                'emojis_count': len(emojis_map)
            }

            logger.info(f"✅ [ML-STRUCTURED-{source_channel.upper()}] {len(text)}→{len(final_text)} chars, {len(segments)} segments, {len(emojis_map)} emojis ({processing_time:.3f}s)")
            return result

        except Exception as e:
            logger.error(f"❌ Erreur traduction structurée [{source_channel}]: {e}")
            # Fallback vers traduction standard en cas d'erreur
            return await self.translate(text, source_language, target_language, model_type, source_channel)

    async def _ml_translate(self, text: str, source_lang: str, target_lang: str, model_type: str) -> str:
        """
        Traduction avec le vrai modèle ML - tokenizers thread-local pour éviter 'Already borrowed'
        
        XXX: PARALLÉLISATION OPPORTUNITÉ #2 - Traduction batch pour multiples segments
        TODO: Cette méthode pourrait accepter une LISTE de textes au lieu d'un seul
        TODO: Avantages du batch processing:
              - Réduire l'overhead de création de pipeline (1 fois au lieu de N fois)
              - Utiliser batch_size optimal du modèle (traiter 8-16 segments à la fois)
              - Meilleure utilisation GPU/CPU (pas de temps mort entre segments)
        TODO: Signature suggérée:
              async def _ml_translate_batch(
                  self, 
                  texts: List[str], 
                  source_lang: str, 
                  target_lang: str, 
                  model_type: str
              ) -> List[str]:
                  # Créer pipeline UNE fois
                  # Traduire tous les textes en batch_size chunks
                  # Retourner résultats dans le même ordre
        TODO: Gains attendus:
              - 3-5x plus rapide pour 10+ segments
              - Réduction de 70% du temps de setup (pipeline creation)
              - Meilleure utilisation mémoire GPU
        """
        try:
            if model_type not in self.models:
                raise Exception(f"Modèle {model_type} non chargé")
            
            # CORRECTION: Sauvegarder le model_name original pour éviter les collisions dans la boucle de fallback
            original_model_name = self.model_configs[model_type]['model_name']
            
            # Traduction dans un thread - OPTIMISATION: tokenizer thread-local + inference_mode
            def translate():
                try:
                    from transformers import pipeline

                    # Modèle partagé (thread-safe en lecture)
                    shared_model = self.models[model_type]

                    # OPTIMISATION: Utiliser le tokenizer thread-local caché (évite recréation)
                    thread_tokenizer = self._get_thread_local_tokenizer(model_type)
                    if thread_tokenizer is None:
                        raise Exception(f"Impossible d'obtenir le tokenizer pour {model_type}")

                    # NLLB: utiliser translation avec tokenizer thread-local
                    # OPTIMISATION MULTICORE: Paramètres optimisés pour AMD 18 cores
                    temp_pipeline = pipeline(
                        "translation",
                        model=shared_model,
                        tokenizer=thread_tokenizer,  # ← TOKENIZER THREAD-LOCAL
                        device=0 if self.device == 'cuda' and torch.cuda.is_available() else -1,
                        max_length=512,  # Augmenté pour qualité
                        batch_size=8  # Optimisé pour multicore
                    )

                    # NLLB: codes de langue spéciaux
                    nllb_source = self.lang_codes.get(source_lang, 'eng_Latn')
                    nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')

                    # ═══════════════════════════════════════════════════════════════
                    # OPTIMISATION LINUX: inference_mode() pour désactiver autograd
                    # Gains: ~15-20% vitesse, ~30% mémoire en moins
                    # ═══════════════════════════════════════════════════════════════
                    with create_inference_context():
                        result = temp_pipeline(
                            text,
                            src_lang=nllb_source,
                            tgt_lang=nllb_target,
                            max_length=512,
                            num_beams=4,  # Équilibre qualité/vitesse
                            early_stopping=True
                        )

                    # NLLB retourne translation_text
                    if result and len(result) > 0 and 'translation_text' in result[0]:
                        translated = result[0]['translation_text']
                    else:
                        translated = f"[NLLB-No-Result] {text}"

                    # Nettoyer pipeline temporaire
                    del temp_pipeline

                    return translated

                except Exception as e:
                    logger.error(f"Erreur pipeline {original_model_name}: {e}")
                    return f"[ML-Pipeline-Error] {text}"
            
            # Exécuter de manière asynchrone
            loop = asyncio.get_event_loop()
            translated = await loop.run_in_executor(self.executor, translate)
            
            return translated
            
        except Exception as e:
            logger.error(f"❌ Erreur modèle ML {model_type}: {e}")
            return f"[ML-Error] {text}"

    async def _ml_translate_batch(
        self,
        texts: List[str],
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> List[str]:
        """
        ═══════════════════════════════════════════════════════════════════════
        OPTIMISATION: Traduction BATCH pour traiter plusieurs textes à la fois
        ═══════════════════════════════════════════════════════════════════════

        Avantages par rapport à _ml_translate appelé N fois:
        - Pipeline créé UNE SEULE fois au lieu de N fois
        - Batch processing natif du modèle (padding optimisé)
        - Meilleure utilisation GPU/CPU (pas de temps mort)
        - Réduction overhead de 70% sur pipeline creation

        Args:
            texts: Liste de textes à traduire
            source_lang: Code langue source (ex: 'fr')
            target_lang: Code langue cible (ex: 'en')
            model_type: Type de modèle ('basic', 'premium')

        Returns:
            Liste des textes traduits (même ordre que l'entrée)
        """
        if not texts:
            return []

        # Fallback vers traduction individuelle si peu de textes
        if len(texts) <= 2:
            results = []
            for text in texts:
                translated = await self._ml_translate(text, source_lang, target_lang, model_type)
                results.append(translated)
            return results

        try:
            if model_type not in self.models:
                raise Exception(f"Modèle {model_type} non chargé")

            original_model_name = self.model_configs[model_type]['model_name']
            batch_size = self.perf_config.batch_size

            def translate_batch():
                try:
                    from transformers import pipeline

                    shared_model = self.models[model_type]
                    thread_tokenizer = self._get_thread_local_tokenizer(model_type)

                    if thread_tokenizer is None:
                        raise Exception(f"Impossible d'obtenir le tokenizer pour {model_type}")

                    # ═══════════════════════════════════════════════════════════
                    # CRÉATION DU PIPELINE UNE SEULE FOIS
                    # ═══════════════════════════════════════════════════════════
                    batch_pipeline = pipeline(
                        "translation",
                        model=shared_model,
                        tokenizer=thread_tokenizer,
                        device=0 if self.device == 'cuda' and torch.cuda.is_available() else -1,
                        max_length=512,
                        batch_size=batch_size
                    )

                    nllb_source = self.lang_codes.get(source_lang, 'eng_Latn')
                    nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')

                    all_results = []

                    # ═══════════════════════════════════════════════════════════
                    # TRAITEMENT PAR CHUNKS AVEC inference_mode()
                    # ═══════════════════════════════════════════════════════════
                    with create_inference_context():
                        for i in range(0, len(texts), batch_size):
                            chunk = texts[i:i + batch_size]

                            results = batch_pipeline(
                                chunk,
                                src_lang=nllb_source,
                                tgt_lang=nllb_target,
                                max_length=512,
                                num_beams=4,
                                early_stopping=True
                            )

                            for result in results:
                                if isinstance(result, dict) and 'translation_text' in result:
                                    all_results.append(result['translation_text'])
                                elif isinstance(result, list) and len(result) > 0:
                                    all_results.append(result[0].get('translation_text', '[No-Result]'))
                                else:
                                    all_results.append('[Batch-No-Result]')

                    del batch_pipeline

                    # Nettoyage mémoire périodique
                    if self.perf_config.enable_memory_cleanup and len(texts) > 20:
                        self.perf_optimizer.cleanup_memory()

                    return all_results

                except Exception as e:
                    logger.error(f"Erreur batch pipeline {original_model_name}: {e}")
                    return [f"[ML-Batch-Error] {t}" for t in texts]

            # Exécuter de manière asynchrone
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(self.executor, translate_batch)

            logger.info(f"⚡ [BATCH] {len(texts)} textes traduits en batch ({source_lang}→{target_lang})")
            return results

        except Exception as e:
            logger.error(f"❌ Erreur batch ML {model_type}: {e}")
            # Fallback: traduction individuelle
            results = []
            for text in texts:
                try:
                    translated = await self._ml_translate(text, source_lang, target_lang, model_type)
                    results.append(translated)
                except Exception:
                    results.append(f"[ML-Error] {text}")
            return results

    def _detect_language(self, text: str) -> str:
        """Détection de langue simple"""
        text_lower = text.lower()
        
        # Mots caractéristiques par langue
        if any(word in text_lower for word in ['bonjour', 'comment', 'vous', 'merci', 'salut']):
            return 'fr'
        elif any(word in text_lower for word in ['hello', 'how', 'you', 'thank', 'hi']):
            return 'en'
        elif any(word in text_lower for word in ['hola', 'como', 'estas', 'gracias']):
            return 'es'
        elif any(word in text_lower for word in ['guten', 'wie', 'geht', 'danke', 'hallo']):
            return 'de'
        else:
            return 'en'  # Défaut
    
    async def _fallback_translate(self, text: str, source_lang: str, target_lang: str, 
                                 model_type: str, source_channel: str) -> Dict[str, Any]:
        """Traduction de fallback si ML non disponible"""
        logger.warning(f"Utilisation du fallback pour {model_type} [{source_channel}]")
        
        # Dictionnaire simple comme fallback
        translations = {
            ('fr', 'en'): {
                'bonjour': 'hello', 'comment': 'how', 'vous': 'you', 'allez': 'are',
                'êtes': 'are', 'tout': 'all', 'le': 'the', 'monde': 'world'
            },
            ('en', 'fr'): {
                'hello': 'bonjour', 'how': 'comment', 'you': 'vous', 'are': 'êtes',
                'all': 'tout', 'the': 'le', 'world': 'monde'
            },
            ('es', 'fr'): {
                'hola': 'bonjour', 'como': 'comment', 'estas': 'allez-vous'
            },
            ('en', 'de'): {
                'hello': 'hallo', 'how': 'wie', 'are': 'sind', 'you': 'sie'
            }
        }
        
        # Traduction simple mot par mot
        lang_pair = (source_lang, target_lang)
        if lang_pair in translations:
            words = text.lower().split()
            translated_words = []
            for word in words:
                translated_word = translations[lang_pair].get(word, word)
                translated_words.append(translated_word)
            translated_text = ' '.join(translated_words)
        else:
            translated_text = f"[FALLBACK-{source_lang}→{target_lang}] {text}"
        
        self._update_stats(0.001, source_channel)
        
        return {
            'translated_text': translated_text,
            'detected_language': source_lang,
            'confidence': 0.3,  # Faible confiance pour fallback
            'model_used': f"{model_type}_fallback",
            'from_cache': False,
            'processing_time': 0.001,
            'source_channel': source_channel
        }
    
    def _update_stats(self, processing_time: float, source_channel: str):
        """Met à jour les statistiques globales"""
        self.stats['translations_count'] += 1
        
        # Mettre à jour les stats par canal (canaux connus seulement)
        if source_channel in ['zmq', 'rest', 'websocket']:
            self.stats[f'{source_channel}_translations'] += 1
        
        self.request_times.append(processing_time)
        
        if len(self.request_times) > 200:
            self.request_times = self.request_times[-200:]
        
        if self.request_times:
            self.stats['avg_processing_time'] = sum(self.request_times) / len(self.request_times)
    
    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques globales du service"""
        return {
            'service_type': 'unified_ml',
            'is_singleton': True,
            'translations_count': self.stats['translations_count'],
            'zmq_translations': self.stats['zmq_translations'],
            'rest_translations': self.stats['rest_translations'], 
            'websocket_translations': self.stats['websocket_translations'],
            'avg_processing_time': self.stats['avg_processing_time'],
            'models_loaded': {
                model_type: {
                    'name': self.model_configs[model_type]['model_name'],
                    'description': self.model_configs[model_type]['description'],
                    'local_path': str(self.model_configs[model_type]['local_path']),
                    'is_local': self.model_configs[model_type]['local_path'].exists()
                } for model_type in self.models.keys()
            },
            'ml_available': ML_AVAILABLE,
            'is_initialized': self.is_initialized,
            'startup_time': self.stats['startup_time'],
            'supported_languages': list(self.lang_codes.keys()),
            'models_path': str(self.models_path),
            'device': self.device
        }
    
    async def get_health(self) -> Dict[str, Any]:
        """Health check du service unifié"""
        return {
            'status': 'healthy' if self.is_initialized else 'initializing',
            'models_count': len(self.models),
            'pipelines_count': len(self.pipelines),
            'ml_available': ML_AVAILABLE,
            'translations_served': self.stats['translations_count']
        }

# Instance globale du service (Singleton)
def get_unified_ml_service(max_workers: int = 4) -> TranslationMLService:
    """Retourne l'instance unique du service ML"""
    return TranslationMLService(get_settings(), max_workers=max_workers)
