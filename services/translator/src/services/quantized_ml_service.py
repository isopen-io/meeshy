"""
Service de traduction ML quantifié - Version optimisée
Optimisations: Réduction des boucles, cache intelligent, chargement concurrent
"""

import os
import logging
import time
import asyncio
from typing import Dict, Optional, Any, Set, Tuple
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
from functools import lru_cache
import threading

# Import des settings
from config.settings import get_settings



# Import des modèles ML optimisés
try:
    import torch
    
    # SOLUTION: Désactiver les tensors meta avant d'importer les autres modules
    torch._C._disable_meta = True  # Désactiver les tensors meta au niveau PyTorch
    
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline
    ML_AVAILABLE = True
    
    # OPTIMISATION XET: Configuration pour réduire les warnings du nouveau système
    import os
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    
    # OPTIMISATION RÉSEAU: Configuration pour améliorer la connectivité Docker
    os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
    os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = '600'  # 10 minutes
    os.environ['HF_HUB_DOWNLOAD_RETRY_DELAY'] = '5'
    os.environ['HF_HUB_DOWNLOAD_MAX_RETRIES'] = '5'
    
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
        print("⚠️ Fichier de certificats SSL non trouvé, utilisation du système par défaut")
    
    # Option pour désactiver temporairement la vérification SSL si nécessaire
    if os.getenv('HF_HUB_DISABLE_SSL_VERIFICATION', '0') == '1':
        os.environ['REQUESTS_CA_BUNDLE'] = ''
        os.environ['CURL_CA_BUNDLE'] = ''
        print("⚠️ Vérification SSL désactivée pour Hugging Face (HF_HUB_DISABLE_SSL_VERIFICATION=1)")
    
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

class QuantizedMLService:
    """
    Service de traduction ML quantifié optimisé
    - Réduction drastique des boucles
    - Chargement concurrent des modèles
    - Cache intelligent pour les configurations
    - Optimisations mémoire
    """
    
    def __init__(self, model_type: str = "basic", quantization_level: str = "float16", max_workers: int = 4):
        self.settings = get_settings()
        self.model_type = model_type
        self.quantization_level = quantization_level
        self.max_workers = max_workers
        

        
        # Cache des configurations avec lazy loading
        self._model_configs = None
        self._shared_models_analysis = None
        
        # Modèles et états
        self.models = {}
        self.tokenizers = {}
        self.shared_models = {}
        self.model_to_shared = {}
        
        # Thread pool optimisé
        self.executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="MLQuantized"
        )
        
        # Stats optimisées
        self.stats = {
            'translations_count': 0,
            'avg_processing_time': 0.0,
            'memory_usage_mb': 0.0,
            'quantization_level': quantization_level,
            'models_loaded': False,
            'shared_models_count': 0,
            'memory_saved_mb': 0.0,
            'cache_hits': 0,
            'concurrent_loads': 0
        }
        
        # Caches pour éviter les recalculs
        self._lang_codes_cache = None

        logger.info(f"🤖 Service ML Quantifié Optimisé créé: {model_type} avec {quantization_level}")
    
    @property
    def model_configs(self) -> Dict:
        """Configuration des modèles NLLB avec cache lazy"""
        if self._model_configs is None:
            self._model_configs = {
                'basic': {
                    'model_name': self.settings.basic_model,
                    'description': 'NLLB 600M quantifié - Rapide',
                    'max_length': 256
                },
                'premium': {
                    'model_name': self.settings.premium_model,
                    'description': 'NLLB 1.3B quantifié - Haute qualité',
                    'max_length': 512
                }
            }
            # Alias pour compatibilité
            self._model_configs['medium'] = self._model_configs['basic']
        return self._model_configs
    
    @property
    def lang_codes(self) -> Dict:
        """Codes de langues avec cache"""
        if self._lang_codes_cache is None:
            self._lang_codes_cache = {
                'fr': 'fra_Latn', 'en': 'eng_Latn', 'es': 'spa_Latn', 'de': 'deu_Latn',
                'pt': 'por_Latn', 'zh': 'zho_Hans', 'ja': 'jpn_Jpan', 'ar': 'arb_Arab'
            }
        return self._lang_codes_cache
    
    
    @lru_cache(maxsize=1)
    def _get_shared_models_analysis(self) -> Tuple[Dict[str, list], Set[str]]:
        """Analyse des modèles partagés avec cache LRU"""
        model_name_to_types = defaultdict(list)
        
        # Une seule boucle pour construire le mapping
        for model_type, config in self.model_configs.items():
            model_name_to_types[config['model_name']].append(model_type)
        
        # Identifier les modèles partagés en une passe
        shared_models_info = {
            model_name: types for model_name, types in model_name_to_types.items() 
            if len(types) > 1
        }
        
        unique_model_names = set(model_name_to_types.keys())
        
        return shared_models_info, unique_model_names
    
    async def initialize(self) -> bool:
        """Initialisation optimisée avec chargement concurrent"""
        if not ML_AVAILABLE:
            logger.error("❌ Dependencies ML non disponibles")
            return False
        
        try:
            logger.info(f"🚀 Initialisation optimisée: {self.model_type} ({self.quantization_level})")
            
            # Pas de nettoyage automatique pour éviter les problèmes
            
            if self.model_type == "all":
                # Chargement concurrent de tous les modèles
                await self._load_all_models_concurrently()
            else:
                # Chargement optimisé d'un modèle avec fallback
                await self._load_model_with_optimized_fallback()
            
            self.stats['models_loaded'] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Erreur initialisation optimisée: {e}")
            return False
    
    async def _load_all_models_concurrently(self):
        """Charge tous les modèles de façon concurrente - Version simplifiée"""
        shared_models_info, _ = self._get_shared_models_analysis()
        
        # Créer les tâches de chargement
        load_tasks = []
        processed_models = set()
        
        for model_type, config in self.model_configs.items():
            model_name = config['model_name']
            
            if model_name in shared_models_info and model_name not in processed_models:
                # Charger comme modèle partagé
                task = asyncio.create_task(
                    self._load_shared_model_async(model_name, shared_models_info[model_name])
                )
                load_tasks.append(task)
                processed_models.add(model_name)
            elif model_name not in shared_models_info:
                # Charger comme modèle unique
                task = asyncio.create_task(
                    self._load_unique_model_async(model_name, model_type)
                )
                load_tasks.append(task)
        
        # Attendre tous les chargements en parallèle
        if load_tasks:
            self.stats['concurrent_loads'] = len(load_tasks)
            results = await asyncio.gather(*load_tasks, return_exceptions=True)
            
            # Vérifier les résultats
            failed_loads = [r for r in results if isinstance(r, Exception)]
            if failed_loads:
                logger.warning(f"⚠️ {len(failed_loads)} chargements échoués sur {len(results)}")
            
            logger.info(f"✅ Chargement concurrent terminé: {len(results) - len(failed_loads)}/{len(results)} succès")
    

    
    async def _load_model_with_optimized_fallback(self):
        """Tentative de chargement avec fallback - Version simplifiée"""
        fallback_order = ['basic', 'medium', 'premium']
        
        # Calculer les modèles candidats en une seule passe
        try:
            user_index = fallback_order.index(self.model_type)
            candidate_models = fallback_order[user_index::-1]  # Du demandé vers le plus léger
        except ValueError:
            candidate_models = fallback_order
        
        # Essayer les candidats séquentiellement
        last_error = None
        for model_type in candidate_models:
            if model_type not in self.model_configs:
                continue
                
            try:
                await self._load_model_with_sharing_optimized(model_type)
                if model_type != self.model_type:
                    logger.info(f"🔄 Fallback vers {model_type} (demandé: {self.model_type})")
                    self.model_type = model_type
                return
            except Exception as e:
                last_error = e
                logger.warning(f"⚠️ Échec {model_type}: {e}")
        
        # Si aucun modèle ne peut être chargé, lever une exception claire
        error_msg = f"Échec du chargement de tous les modèles de traduction. Dernière erreur: {last_error}"
        logger.error(f"❌ {error_msg}")
        raise Exception(error_msg)
    
    async def _load_model_with_sharing_optimized(self, model_type: str):
        """Chargement optimisé avec gestion du partage"""
        config = self.model_configs[model_type]
        model_name = config['model_name']
        
        # Vérifier le cache partagé
        if model_name in self.shared_models:
            self._link_to_shared_model(model_name, model_type)
            return
        
        shared_models_info, _ = self._get_shared_models_analysis()
        
        if model_name in shared_models_info:
            # Charger comme modèle partagé
            await self._load_shared_model_async(model_name, shared_models_info[model_name])
        else:
            # Charger comme modèle unique
            await self._load_unique_model_async(model_name, model_type)
    
    def _link_to_shared_model(self, model_name: str, model_type: str):
        """Lie un type de modèle à un modèle partagé existant"""
        self.shared_models[model_name]['users'].add(model_type)
        self.model_to_shared[model_type] = model_name
        self.models[model_type] = self.shared_models[model_name]['model']
        self.tokenizers[model_type] = self.shared_models[model_name]['tokenizer']
        self.stats['cache_hits'] += 1
        logger.info(f"🔗 {model_type} lié au modèle partagé {model_name}")
    
    async def _load_shared_model_async(self, model_name: str, model_types: list):
        """Charge un modèle partagé de façon asynchrone"""
        logger.info(f"📥 Chargement modèle partagé: {model_name} pour {model_types}")
        
        try:
            model, tokenizer = await self._load_model_and_tokenizer_optimized(model_name)
            
            # Créer l'entrée partagée
            self.shared_models[model_name] = {
                'model': model,
                'tokenizer': tokenizer,
                'users': set(model_types),
                'loaded_at': time.time()
            }
            
            # Lier tous les types en une passe
            for model_type in model_types:
                self.model_to_shared[model_type] = model_name
                self.models[model_type] = model
                self.tokenizers[model_type] = tokenizer
            
            logger.info(f"✅ Modèle partagé chargé: {model_name}")
            
        except Exception as e:
            logger.error(f"❌ Erreur modèle partagé {model_name}: {e}")
            raise
    
    async def _load_unique_model_async(self, model_name: str, model_type: str):
        """Charge un modèle unique de façon asynchrone"""
        logger.info(f"📥 Chargement modèle unique: {model_type} ({model_name})")
        
        try:
            model, tokenizer = await self._load_model_and_tokenizer_optimized(model_name)
            self.models[model_type] = model
            self.tokenizers[model_type] = tokenizer
            logger.info(f"✅ Modèle unique chargé: {model_type}")
            
        except Exception as e:
            logger.error(f"❌ Erreur modèle unique {model_type}: {e}")
            raise
    
    async def _load_model_and_tokenizer_optimized(self, model_name: str) -> Tuple:
        """Chargement optimisé avec retry exponentiel - Version simplifiée et robuste"""
        async def load_with_timeout(loader_func, timeout: int, description: str):
            try:
                loop = asyncio.get_event_loop()
                return await asyncio.wait_for(
                    loop.run_in_executor(self.executor, loader_func),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                raise Exception(f"Timeout {description} après {timeout}s")
        
        # Chargement concurrent tokenizer + modèle avec timeouts
        tokenizer_task = load_with_timeout(
            lambda: self._load_tokenizer_sync(model_name),
            self.settings.tokenizer_load_timeout,
            "tokenizer"
        )
        
        model_task = load_with_timeout(
            lambda: self._load_model_sync(model_name),
            self.settings.model_load_timeout,
            "modèle"
        )
        
        # Chargement parallèle
        tokenizer, model = await asyncio.gather(tokenizer_task, model_task)
        return model, tokenizer
    
    def _load_tokenizer_sync(self, model_name: str):
        """Chargement synchrone du tokenizer - Version robuste avec retry et fallback"""
        import warnings
        import os
        import time
        import requests
        from pathlib import Path
        from huggingface_hub import HfApi
        
        # Configuration du cache local - utiliser self.settings
        cache_dir = Path(self.settings.models_path)
        cache_dir.mkdir(exist_ok=True)
        
        # Configuration des retries
        max_retries = int(os.getenv('HF_HUB_DOWNLOAD_MAX_RETRIES', '5'))
        retry_delay = int(os.getenv('HF_HUB_DOWNLOAD_RETRY_DELAY', '5'))
        
        last_error = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"📥 Tentative {attempt + 1}/{max_retries} de chargement du tokenizer {model_name}")
                
                # Test de connectivité Hugging Face
                try:
                    api = HfApi()
                    api.model_info(model_name, timeout=30)
                    logger.info(f"✅ Connectivité Hugging Face OK pour {model_name}")
                except Exception as e:
                    logger.warning(f"⚠️ Problème de connectivité HF pour {model_name}: {e}")
                    # Continuer quand même, peut-être que le modèle est en cache local
                
                # Suppression temporaire des warnings pendant le chargement
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    
                    # Configuration optimisée pour Docker
                    tokenizer = AutoTokenizer.from_pretrained(
                        model_name,
                        local_files_only=False,
                        trust_remote_code=True,
                        cache_dir=str(cache_dir),
                        use_auth_token=None,  # Pas de token pour les modèles publics
                        resume_download=True,  # Reprendre les téléchargements interrompus
                        force_download=False,  # Ne pas forcer le re-téléchargement
                        proxies=None  # Pas de proxy par défaut
                    )
                
                logger.info(f"✅ Tokenizer {model_name} chargé avec succès")
                return tokenizer
                
            except Exception as e:
                last_error = e
                logger.warning(f"⚠️ Tentative {attempt + 1} échouée pour {model_name}: {e}")
                
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Backoff exponentiel
                    logger.info(f"⏳ Attente de {wait_time}s avant la prochaine tentative...")
                    time.sleep(wait_time)
        
        # Si toutes les tentatives ont échoué, essayer avec des paramètres de fallback
        logger.warning(f"🔄 Tentative de fallback pour le tokenizer {model_name}")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                return AutoTokenizer.from_pretrained(
                    model_name,
                    local_files_only=True,  # Essayer seulement le cache local
                    trust_remote_code=True,
                    cache_dir=str(cache_dir)
                )
        except Exception as fallback_error:
            logger.error(f"❌ Échec du fallback pour {model_name}: {fallback_error}")
            raise last_error or fallback_error
    
    def _load_model_sync(self, model_name: str):
        """Chargement synchrone du modèle avec quantification - Version robuste avec retry et fallback"""
        import warnings
        import os
        import time
        from pathlib import Path
        from huggingface_hub import HfApi
        
        # Configuration du cache local - utiliser self.settings
        cache_dir = Path(self.settings.models_path)
        cache_dir.mkdir(exist_ok=True)
        
        # Configuration des retries
        max_retries = int(os.getenv('HF_HUB_DOWNLOAD_MAX_RETRIES', '5'))
        retry_delay = int(os.getenv('HF_HUB_DOWNLOAD_RETRY_DELAY', '5'))
        
        # Configuration de base optimisée pour Docker avec désactivation complète des tensors meta
        base_config = {
            'local_files_only': False,
            'trust_remote_code': True,
            'cache_dir': str(cache_dir),
            'use_auth_token': None,  # Pas de token pour les modèles publics
            'resume_download': True,  # Reprendre les téléchargements interrompus
            'force_download': False,  # Ne pas forcer le re-téléchargement
            'proxies': None,  # Pas de proxy par défaut
            'low_cpu_mem_usage': False,  # Désactiver l'optimisation mémoire qui peut causer des tensors meta
            'torch_dtype': torch.float32,  # Forcer float32 pour éviter les meta tensors
            'attn_implementation': 'eager',  # Forcer l'implémentation eager pour éviter les meta tensors
            'device_map': None  # Pas de device mapping automatique
        }
        
        # Configuration forcée pour éviter les meta tensors
        # Note: torch_dtype et attn_implementation sont déjà définis dans base_config
        
        last_error = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"📥 Tentative {attempt + 1}/{max_retries} de chargement du modèle {model_name}")
                
                # Test de connectivité Hugging Face
                try:
                    api = HfApi()
                    api.model_info(model_name, timeout=30)
                    logger.info(f"✅ Connectivité Hugging Face OK pour {model_name}")
                except Exception as e:
                    logger.warning(f"⚠️ Problème de connectivité HF pour {model_name}: {e}")
                    # Continuer quand même, peut-être que le modèle est en cache local
                
                # Suppression temporaire des warnings pendant le chargement
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    
                                    # Chargement du modèle avec désactivation des tensors meta
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_name, 
                    **base_config
                )
                
                # Initialisation simple sans dummy input pour éviter les erreurs
                model.eval()  # Mode évaluation
                logger.info(f"✅ Modèle {model_name} chargé avec succès")
                
                # Quantification int8 si demandée
                if self.quantization_level == "int8":
                    try:
                        model = torch.quantization.quantize_dynamic(
                            model, {torch.nn.Linear}, dtype=torch.qint8
                        )
                        logger.info(f"✅ Modèle {model_name} quantifié en int8")
                    except Exception as e:
                        logger.warning(f"⚠️ Quantification int8 échouée pour {model_name}, modèle en float32: {e}")
                
                logger.info(f"✅ Modèle {model_name} chargé avec succès")
                return model
                
            except Exception as e:
                last_error = e
                logger.warning(f"⚠️ Tentative {attempt + 1} échouée pour {model_name}: {e}")
                
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Backoff exponentiel
                    logger.info(f"⏳ Attente de {wait_time}s avant la prochaine tentative...")
                    time.sleep(wait_time)
        
        # Si toutes les tentatives ont échoué, essayer avec des paramètres de fallback
        logger.warning(f"🔄 Tentative de fallback pour le modèle {model_name}")
        try:
            fallback_config = {
                'local_files_only': True,  # Essayer seulement le cache local
                'trust_remote_code': True,
                'cache_dir': str(cache_dir),
                'torch_dtype': torch.float32,  # Fallback vers float32
                'low_cpu_mem_usage': False,   # Désactiver l'optimisation mémoire
                'device_map': None,           # Pas de device mapping automatique
                'attn_implementation': 'eager'  # Forcer eager
            }
            
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = AutoModelForSeq2SeqLM.from_pretrained(model_name, **fallback_config)
                
                # Initialisation simple pour le fallback aussi
                model.eval()
                logger.info(f"✅ Modèle {model_name} chargé en fallback (cache local)")
                return model
                
        except Exception as fallback_error:
            logger.error(f"❌ Échec du fallback pour {model_name}: {fallback_error}")
            raise last_error or fallback_error
    

    
    async def translate(self, text: str, source_language: str, target_language: str, 
                       model_type: str = None, source_channel: str = "quantized") -> Dict[str, Any]:
        """Traduction optimisée avec fallback intelligent"""
        if model_type is None:
            model_type = self.model_type
        
        start_time = time.time()
        
        # OPTIMISATION: Éviter la traduction si source = target
        if source_language == target_language:
            logger.info(f"🔄 [TRANSLATOR] Langues identiques ({source_language} → {target_language}), pas de traduction nécessaire")
            return {
                'translated_text': text,
                'detected_language': source_language,
                'confidence': 1.0,
                'model_used': f"none",
                'from_cache': False,
                'processing_time': 0.0,
                'source_channel': source_channel
            }
        
        try:
            # Fallback optimisé sans boucles multiples
            best_model = self._find_best_available_model(model_type)
            
            # Traduction
            translated_text = await self._ml_translate_optimized(
                text, source_language, target_language, best_model
            )
            
            # Mise à jour des stats optimisée
            processing_time = time.time() - start_time
            self._update_stats(processing_time)
            
            return {
                'translated_text': translated_text,
                'detected_language': source_language,
                'confidence': 0.95,
                'model_used': f"{best_model}_{self.quantization_level}",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur traduction: {e}")
            processing_time = time.time() - start_time
            
            # Retourner un message d'échec clair
            error_message = f"[ÉCHEC TRADUCTION] {text}"
            if "Aucun modèle de traduction disponible" in str(e):
                error_message = f"[MODÈLES NON DISPONIBLES] {text}"
            elif "Échec du chargement" in str(e):
                error_message = f"[MODÈLES NON CHARGÉS] {text}"
            
            return {
                'translated_text': error_message,
                'detected_language': source_language,
                'confidence': 0.0,
                'model_used': f"{model_type}_{self.quantization_level}_error",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel,
                'error': str(e)
            }
    
    def _find_best_available_model(self, requested_model: str) -> str:
        """Trouve le meilleur modèle disponible sans boucles multiples"""
        if requested_model in self.models:
            return requested_model
        
        # Ordre de qualité décroissante
        quality_order = ['premium', 'medium', 'basic']
        
        try:
            requested_index = quality_order.index(requested_model)
            # Chercher depuis le modèle demandé vers les moins performants
            candidates = quality_order[requested_index:]
        except ValueError:
            candidates = quality_order
        
        # Retourner le premier modèle disponible
        for model_type in candidates:
            if model_type in self.models:
                return model_type
        
        # Si aucun modèle n'est disponible, lever une exception claire
        available_models = list(self.models.keys())
        error_msg = f"Aucun modèle de traduction disponible. Modèles demandés: {requested_model}, Modèles chargés: {available_models}"
        logger.error(f"❌ {error_msg}")
        raise Exception(error_msg)
    
    def _update_stats(self, processing_time: float):
        """Mise à jour optimisée des statistiques"""
        count = self.stats['translations_count']
        self.stats['translations_count'] = count + 1
        
        # Moyenne mobile optimisée
        if count > 0:
            current_avg = self.stats['avg_processing_time']
            self.stats['avg_processing_time'] = (current_avg * count + processing_time) / (count + 1)
        else:
            self.stats['avg_processing_time'] = processing_time
    
    async def _ml_translate_optimized(self, text: str, source_language: str, 
                                    target_language: str, model_type: str) -> str:
        """Traduction ML optimisée avec tokenization thread-local"""
        def translate_sync():
            try:
                # Nettoyage mémoire optimisé
                self._cleanup_memory()
                
                model = self.models[model_type]
                model_name = self.model_configs[model_type]['model_name']
                
                # SOLUTION: Créer un tokenizer unique pour ce thread
                import threading
                thread_id = threading.current_thread().ident
                cache_key = f"{model_type}_{thread_id}"
                
                # Modèle partagé (thread-safe en lecture) mais tokenizer local
                model_path = self.model_configs[model_type]['model_name']
                
                # OPTIMISATION: Créer un tokenizer frais avec paramètres optimisés
                thread_tokenizer = AutoTokenizer.from_pretrained(
                    model_path,
                    cache_dir=str(self.settings.models_path),
                    local_files_only=True,  # Utiliser le modèle local
                    use_fast=True,  # Tokenizer rapide
                    model_max_length=512,  # Limiter la taille
                    torch_dtype=torch.float32  # Forcer float32
                )
                
                # NLLB: utiliser translation avec tokenizer thread-local
                temp_pipeline = pipeline(
                    "translation",
                    model=model,
                    tokenizer=thread_tokenizer,  # ← TOKENIZER THREAD-LOCAL
                    device=0 if torch.cuda.is_available() else -1,
                    max_length=256,
                    torch_dtype=torch.float32  # Type de données standard
                )

                # NLLB: codes de langue spéciaux
                nllb_source = self.lang_codes.get(source_language, 'eng_Latn')
                nllb_target = self.lang_codes.get(target_language, 'fra_Latn')

                # OPTIMISATION: Traduction avec paramètres optimisés
                result = temp_pipeline(
                    text,
                    src_lang=nllb_source,
                    tgt_lang=nllb_target,
                    max_length=256,
                    num_beams=2,  # Réduire pour économiser la mémoire
                    early_stopping=True
                )

                # NLLB retourne translation_text
                if result and len(result) > 0 and 'translation_text' in result[0]:
                    translated = result[0]['translation_text']
                else:
                    translated = f"[NLLB-No-Result] {text}"

                # OPTIMISATION: Nettoyer tokenizer et pipeline temporaires
                del thread_tokenizer
                del temp_pipeline
                
                # Nettoyer la mémoire après traduction
                import gc
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                return translated
                    
            except Exception as e:
                logger.error(f"❌ Erreur pipeline: {e}")
                return f"[ML-Error] {text}"
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, translate_sync)
    
    def _cleanup_memory(self):
        """Nettoyage mémoire optimisé"""
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    def get_stats(self) -> Dict[str, Any]:
        """Stats optimisées avec calculs en cache"""
        shared_models_count = len(self.shared_models)
        unique_models = len(set(self.model_to_shared.values())) + len([
            t for t in self.models.keys() if t not in self.model_to_shared
        ])
        
        return {
            **self.stats,
            'model_type': self.model_type,
            'shared_models_count': shared_models_count,
            'unique_models_loaded': unique_models,
            'models_saved': len(self.model_configs) - unique_models,
            'optimization_ratio': f"{unique_models}/{len(self.model_configs)}"
        }
    
    def get_available_models(self) -> list:
        """Retourne les modèles disponibles"""
        return list(self.models.keys())
    
    async def cleanup(self):
        """Nettoyage optimisé"""
        logger.info("🧹 Nettoyage optimisé des ressources")
        
        # Nettoyage groupé des ressources
        resources_to_clean = [
            (self.shared_models, "modèles partagés"),
            (self.models, "modèles"),
            (self.tokenizers, "tokenizers")
        ]
        
        for resource_dict, resource_type in resources_to_clean:
            if resource_dict:
                logger.info(f"🧹 Nettoyage {len(resource_dict)} {resource_type}")
                resource_dict.clear()
        
        # Nettoyage des mappings
        self.model_to_shared.clear()
        
        # Nettoyage mémoire et thread pool
        self._cleanup_memory()
        self.executor.shutdown(wait=True)
        
        logger.info("✅ Nettoyage optimisé terminé")
    
    async def close(self):
        """Ferme le service et libère les ressources"""
        try:
            logger.info("🛑 Fermeture du service ML quantifié...")
            
            # Fermer le thread pool
            if hasattr(self, 'executor'):
                self.executor.shutdown(wait=True)
            
            # Libérer les modèles de la mémoire
            if hasattr(self, 'models'):
                for model_name, model in self.models.items():
                    if hasattr(model, 'cpu'):
                        model.cpu()
                    del model
                self.models.clear()
            
            if hasattr(self, 'tokenizers'):
                self.tokenizers.clear()
            
            if hasattr(self, 'shared_models'):
                for model_name, model in self.shared_models.items():
                    if hasattr(model, 'cpu'):
                        model.cpu()
                    del model
                self.shared_models.clear()
            
            logger.info("✅ Service ML quantifié fermé")
            
        except Exception as e:
            logger.error(f"❌ Erreur lors de la fermeture: {e}")
    
