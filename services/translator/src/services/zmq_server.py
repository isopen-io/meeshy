"""
Serveur ZeroMQ haute performance pour le service de traduction Meeshy
Architecture: PUB/SUB + REQ/REP avec pool de connexions et traitement asynchrone
"""

import asyncio
import json
import logging
import uuid
import zmq
import zmq.asyncio
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set
from concurrent.futures import ThreadPoolExecutor
import time
import psutil
from collections import defaultdict

# Configuration du logging (must be before imports that use logger)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import du service de base de données
from .database_service import DatabaseService

# Import de la configuration des limites
from config.message_limits import can_translate_message, MessageLimits

# Import du pipeline audio (chargé dynamiquement pour éviter les imports circulaires)
AUDIO_PIPELINE_AVAILABLE = False
try:
    from .audio_message_pipeline import AudioMessagePipeline, AudioMessageMetadata, get_audio_pipeline
    AUDIO_PIPELINE_AVAILABLE = True
    logger.info("✅ [ZMQ] AudioMessagePipeline disponible")
except ImportError as e:
    logger.warning(f"⚠️ [ZMQ] AudioMessagePipeline non disponible: {e}")

# Import du Voice API handler
VOICE_API_AVAILABLE = False
try:
    from .voice_api_handler import VoiceAPIHandler, get_voice_api_handler
    VOICE_API_AVAILABLE = True
    logger.info("✅ [ZMQ] VoiceAPIHandler disponible")
except ImportError as e:
    logger.warning(f"⚠️ [ZMQ] VoiceAPIHandler non disponible: {e}")

# Import du Voice Profile handler (internal ZMQ processing)
VOICE_PROFILE_HANDLER_AVAILABLE = False
try:
    from .voice_profile_handler import VoiceProfileHandler, get_voice_profile_handler
    VOICE_PROFILE_HANDLER_AVAILABLE = True
    logger.info("✅ [ZMQ] VoiceProfileHandler disponible")
except ImportError as e:
    logger.warning(f"⚠️ [ZMQ] VoiceProfileHandler non disponible: {e}")

# Import du service de cache Redis pour traductions
CACHE_AVAILABLE = False
try:
    from .redis_service import get_redis_service, get_translation_cache_service, TranslationCacheService
    CACHE_AVAILABLE = True
    logger.info("✅ [ZMQ] Cache Redis disponible")
except ImportError as e:
    logger.warning(f"⚠️ [ZMQ] Cache Redis non disponible: {e}")

# Import des optimisations de performance
PERFORMANCE_MODULE_AVAILABLE = False
try:
    from utils.performance import Priority, PerformanceConfig
    PERFORMANCE_MODULE_AVAILABLE = True
    logger.info("✅ [ZMQ] Module performance disponible")
except ImportError as e:
    logger.warning(f"⚠️ [ZMQ] Module performance non disponible: {e}")

@dataclass
class TranslationTask:
    """Tâche de traduction avec support multi-langues et priorité"""
    task_id: str
    message_id: str
    text: str
    source_language: str
    target_languages: List[str]
    conversation_id: str
    model_type: str = "basic"
    created_at: float = None
    priority: int = 2  # 1=HIGH (short), 2=MEDIUM, 3=LOW (long), 4=BULK

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()
        # Auto-assign priority based on text length if not set
        if PERFORMANCE_MODULE_AVAILABLE and self.priority == 2:
            text_len = len(self.text)
            if text_len < 100:
                self.priority = Priority.HIGH.value
            elif text_len < 500:
                self.priority = Priority.MEDIUM.value
            else:
                self.priority = Priority.LOW.value

class TranslationPoolManager:
    """
    Gestionnaire des pools FIFO de traduction avec gestion dynamique des workers
    
    XXX: PARALLÉLISATION OPPORTUNITÉ #4 - Architecture worker optimale
    TODO: Configuration actuelle:
          - normal_workers: 20 (threads séquentiels)
          - any_workers: 10 (threads séquentiels)
          - Chaque worker traite UNE tâche à la fois
    TODO: Optimisations possibles:
          A) Worker hybride: asyncio + multiprocessing
             - Utiliser ProcessPoolExecutor au lieu de ThreadPoolExecutor
             - Chaque process peut traiter N tâches en parallèle (asyncio)
             - Contourner le GIL Python pour vrai parallélisme
             
          B) Worker avec batch processing interne
             - Au lieu de prendre 1 tâche, prendre batch de 5-10 tâches
             - Traduire toutes en batch (voir OPPORTUNITÉ #2)
             - Gains: moins de setup, meilleur throughput
             
          C) Priority queue avec smart scheduling
             - Petits segments (< 50 chars): queue haute priorité
             - Grands paragraphes (> 200 chars): queue normale
             - Équilibrage charge automatique
    TODO: Configuration suggérée:
          NORMAL_WORKERS_DEFAULT=8  # Processus au lieu de threads
          WORKER_BATCH_SIZE=10       # Tâches par batch
          ENABLE_MULTIPROCESSING=true
    TODO: Gains attendus:
          - 3-5x throughput avec multiprocessing (contourne GIL)
          - 2-3x avec batch processing (moins d'overhead)
          - 10-15x avec les deux combinés
    """
    
    def __init__(self,
                 normal_pool_size: int = 10000,
                 any_pool_size: int = 10000,
                 normal_workers: int = 20,  # Augmenté pour haute performance
                 any_workers: int = 10,     # Augmenté pour haute performance
                 translation_service=None,
                 enable_dynamic_scaling: bool = True):

        # Pools FIFO séparées
        self.normal_pool = asyncio.Queue(maxsize=normal_pool_size)
        self.any_pool = asyncio.Queue(maxsize=any_pool_size)

        # Configuration des workers avec valeurs par défaut configurables
        import os

        # ═══════════════════════════════════════════════════════════════
        # OPTIMISATION: Fast pool pour textes courts (haute priorité)
        # Les textes < 100 caractères sont traités en priorité
        # ═══════════════════════════════════════════════════════════════
        self.fast_pool = asyncio.Queue(maxsize=5000)
        self.enable_priority_queue = PERFORMANCE_MODULE_AVAILABLE and os.getenv("TRANSLATOR_PRIORITY_QUEUE", "true").lower() == "true"
        self.short_text_threshold = int(os.getenv("TRANSLATOR_SHORT_TEXT_THRESHOLD", "100"))
        
        # Valeurs par défaut configurables
        self.normal_workers_default = int(os.getenv('NORMAL_WORKERS_DEFAULT', '20'))
        self.any_workers_default = int(os.getenv('ANY_WORKERS_DEFAULT', '10'))
        
        # Limites minimales configurables
        self.normal_workers_min = int(os.getenv('NORMAL_WORKERS_MIN', '2'))
        self.any_workers_min = int(os.getenv('ANY_WORKERS_MIN', '2'))
        
        # Limites maximales configurables
        self.normal_workers_max = int(os.getenv('NORMAL_WORKERS_MAX', '40'))
        self.any_workers_max = int(os.getenv('ANY_WORKERS_MAX', '20'))
        
        # Utiliser les valeurs fournies ou les valeurs par défaut
        self.normal_workers = normal_workers if normal_workers is not None else self.normal_workers_default
        self.any_workers = any_workers if any_workers is not None else self.any_workers_default
        
        # S'assurer que les valeurs sont dans les limites
        self.normal_workers = max(self.normal_workers_min, min(self.normal_workers, self.normal_workers_max))
        self.any_workers = max(self.any_workers_min, min(self.any_workers, self.any_workers_max))
        
        # Limites max pour scaling (peuvent être différentes des limites absolues)
        self.max_normal_workers = int(os.getenv('NORMAL_WORKERS_SCALING_MAX', str(self.normal_workers_max)))
        self.max_any_workers = int(os.getenv('ANY_WORKERS_SCALING_MAX', str(self.any_workers_max)))
        
        # Log de la configuration
        logger.info(f"[TRANSLATOR] 🔧 Configuration workers:")
        logger.info(f"  Normal: {self.normal_workers} (min: {self.normal_workers_min}, max: {self.normal_workers_max}, scaling_max: {self.max_normal_workers})")
        logger.info(f"  Any: {self.any_workers} (min: {self.any_workers_min}, max: {self.any_workers_max}, scaling_max: {self.max_any_workers})")
        
        # Gestion dynamique
        self.enable_dynamic_scaling = enable_dynamic_scaling
        self.scaling_check_interval = 30  # Vérifier toutes les 30 secondes
        self.last_scaling_check = time.time()
        
        # Thread pools pour les traductions
        self.normal_worker_pool = ThreadPoolExecutor(max_workers=self.max_normal_workers)
        self.any_worker_pool = ThreadPoolExecutor(max_workers=self.max_any_workers)
        
        # Service de traduction partagé
        self.translation_service = translation_service

        # Service de cache Redis pour traductions
        self.translation_cache = None
        self.redis_service = None
        if CACHE_AVAILABLE:
            self.redis_service = get_redis_service()
            self.translation_cache = get_translation_cache_service()
            logger.info("[TRANSLATOR] ✅ Cache Redis initialisé pour traductions")

        # Statistiques avancées
        self.stats = {
            'normal_pool_size': 0,
            'any_pool_size': 0,
            'normal_workers_active': 0,
            'any_workers_active': 0,
            'tasks_processed': 0,
            'tasks_failed': 0,
            'translations_completed': 0,
            'pool_full_rejections': 0,
            'avg_processing_time': 0.0,
            'queue_growth_rate': 0.0,
            'worker_utilization': 0.0,
            'dynamic_scaling_events': 0
        }
        
        # Workers actifs
        self.normal_workers_running = False
        self.any_workers_running = False
        self.normal_worker_tasks = []
        self.any_worker_tasks = []
        
        logger.info(f"[TRANSLATOR] TranslationPoolManager haute performance initialisé: normal_pool({normal_pool_size}), any_pool({any_pool_size}), normal_workers({normal_workers}), any_workers({any_workers})")
        logger.info(f"[TRANSLATOR] Gestion dynamique des workers: {'activée' if enable_dynamic_scaling else 'désactivée'}")
    
    async def enqueue_task(self, task: TranslationTask) -> bool:
        """Enfile une tâche dans la pool appropriée avec support priorité"""
        try:
            # ═══════════════════════════════════════════════════════════════
            # OPTIMISATION: Textes courts → fast_pool (traités en priorité)
            # ═══════════════════════════════════════════════════════════════
            if self.enable_priority_queue and len(task.text) < self.short_text_threshold:
                if not self.fast_pool.full():
                    await self.fast_pool.put(task)
                    logger.debug(f"⚡ Tâche {task.task_id} enfilée dans fast_pool (texte court: {len(task.text)} chars)")
                    return True
                # Si fast_pool pleine, continue vers les pools normales

            if task.conversation_id == "any":
                # Pool spéciale pour conversation "any"
                if self.any_pool.full():
                    logger.warning(f"Pool 'any' pleine, rejet de la tâche {task.task_id}")
                    self.stats['pool_full_rejections'] += 1
                    return False

                await self.any_pool.put(task)
                self.stats['any_pool_size'] = self.any_pool.qsize()
                logger.info(f"Tâche {task.task_id} enfilée dans pool 'any' (taille: {self.stats['any_pool_size']})")
            else:
                # Pool normale pour autres conversations
                if self.normal_pool.full():
                    logger.warning(f"Pool normale pleine, rejet de la tâche {task.task_id}")
                    self.stats['pool_full_rejections'] += 1
                    return False

                await self.normal_pool.put(task)
                self.stats['normal_pool_size'] = self.normal_pool.qsize()
                logger.info(f"Tâche {task.task_id} enfilée dans pool normale (taille: {self.stats['normal_pool_size']})")

            return True

        except Exception as e:
            logger.error(f"Erreur lors de l'enfilage de la tâche {task.task_id}: {e}")
            return False
    
    async def start_workers(self):
        """Démarre tous les workers avec gestion dynamique"""
        logger.info(f"[TRANSLATOR] 🔄 Début du démarrage des workers...")
        self.normal_workers_running = True
        self.any_workers_running = True
        
        logger.info(f"[TRANSLATOR] 🔄 Création des workers normaux ({self.normal_workers})...")
        # Démarrer les workers pour la pool normale
        self.normal_worker_tasks = [
            asyncio.create_task(self._normal_worker_loop(f"normal_worker_{i}"))
            for i in range(self.normal_workers)
        ]
        logger.info(f"[TRANSLATOR] ✅ Workers normaux créés: {len(self.normal_worker_tasks)}")
        
        logger.info(f"[TRANSLATOR] 🔄 Création des workers 'any' ({self.any_workers})...")
        # Démarrer les workers pour la pool "any"
        self.any_worker_tasks = [
            asyncio.create_task(self._any_worker_loop(f"any_worker_{i}"))
            for i in range(self.any_workers)
        ]
        logger.info(f"[TRANSLATOR] ✅ Workers 'any' créés: {len(self.any_worker_tasks)}")
        
        logger.info(f"[TRANSLATOR] Workers haute performance démarrés: {self.normal_workers} normal, {self.any_workers} any")
        logger.info(f"[TRANSLATOR] Capacité totale: {self.normal_workers + self.any_workers} traductions simultanées")
        return self.normal_worker_tasks + self.any_worker_tasks
    
    async def stop_workers(self):
        """Arrête tous les workers"""
        self.normal_workers_running = False
        self.any_workers_running = False
        logger.info("Arrêt des workers demandé")
    
    async def _dynamic_scaling_check(self):
        """Vérifie et ajuste dynamiquement le nombre de workers"""
        if not self.enable_dynamic_scaling:
            return
            
        current_time = time.time()
        if current_time - self.last_scaling_check < self.scaling_check_interval:
            return
            
        self.last_scaling_check = current_time
        
        # Calculer les métriques
        normal_queue_size = self.normal_pool.qsize()
        any_queue_size = self.any_pool.qsize()
        normal_utilization = self.stats['normal_workers_active'] / self.normal_workers if self.normal_workers > 0 else 0
        any_utilization = self.stats['any_workers_active'] / self.any_workers if self.any_workers > 0 else 0
        
        # Ajuster les workers normaux
        if normal_queue_size > 100 and normal_utilization > 0.8 and self.normal_workers < self.max_normal_workers:
            new_normal_workers = min(self.normal_workers + 5, self.max_normal_workers)
            if new_normal_workers > self.normal_workers:
                logger.info(f"[TRANSLATOR] 🔧 Scaling UP normal workers: {self.normal_workers} → {new_normal_workers}")
                await self._scale_normal_workers(new_normal_workers)
        
        elif normal_queue_size < 10 and normal_utilization < 0.3 and self.normal_workers > self.normal_workers_min:
            new_normal_workers = max(self.normal_workers - 2, self.normal_workers_min)
            if new_normal_workers < self.normal_workers:
                logger.info(f"[TRANSLATOR] 🔧 Scaling DOWN normal workers: {self.normal_workers} → {new_normal_workers}")
                await self._scale_normal_workers(new_normal_workers)
        
        # Ajuster les workers "any"
        if any_queue_size > 50 and any_utilization > 0.8 and self.any_workers < self.max_any_workers:
            new_any_workers = min(self.any_workers + 3, self.max_any_workers)
            if new_any_workers > self.any_workers:
                logger.info(f"[TRANSLATOR] 🔧 Scaling UP any workers: {self.any_workers} → {new_any_workers}")
                await self._scale_any_workers(new_any_workers)
        
        elif any_queue_size < 5 and any_utilization < 0.3 and self.any_workers > self.any_workers_min:
            new_any_workers = max(self.any_workers - 1, self.any_workers_min)
            if new_any_workers < self.any_workers:
                logger.info(f"[TRANSLATOR] 🔧 Scaling DOWN any workers: {self.any_workers} → {new_any_workers}")
                await self._scale_any_workers(new_any_workers)
    
    async def _scale_normal_workers(self, new_count: int):
        """Ajuste le nombre de workers normaux"""
        if new_count > self.normal_workers:
            # Ajouter des workers
            for i in range(self.normal_workers, new_count):
                task = asyncio.create_task(self._normal_worker_loop(f"normal_worker_{i}"))
                self.normal_worker_tasks.append(task)
        else:
            # Réduire les workers (ils s'arrêteront naturellement)
            pass
        
        self.normal_workers = new_count
        self.stats['dynamic_scaling_events'] += 1
    
    async def _scale_any_workers(self, new_count: int):
        """Ajuste le nombre de workers any"""
        if new_count > self.any_workers:
            # Ajouter des workers
            for i in range(self.any_workers, new_count):
                task = asyncio.create_task(self._any_worker_loop(f"any_worker_{i}"))
                self.any_worker_tasks.append(task)
        else:
            # Réduire les workers (ils s'arrêteront naturellement)
            pass
        
        self.any_workers = new_count
        self.stats['dynamic_scaling_events'] += 1
    
    async def _normal_worker_loop(self, worker_name: str):
        """Boucle de travail pour les workers de la pool normale avec scaling dynamique"""
        logger.info(f"Worker {worker_name} démarré")

        while self.normal_workers_running:
            try:
                # Vérifier le scaling dynamique
                await self._dynamic_scaling_check()

                # ═══════════════════════════════════════════════════════════════
                # OPTIMISATION: Vérifier fast_pool d'abord (textes courts prioritaires)
                # ═══════════════════════════════════════════════════════════════
                task = None

                if self.enable_priority_queue and not self.fast_pool.empty():
                    try:
                        task = self.fast_pool.get_nowait()
                        logger.debug(f"⚡ Worker {worker_name} traite tâche fast_pool")
                    except asyncio.QueueEmpty:
                        pass

                # Si pas de tâche fast, attendre la pool normale
                if task is None:
                    try:
                        task = await asyncio.wait_for(self.normal_pool.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue

                self.stats['normal_workers_active'] += 1
                self.stats['normal_pool_size'] = self.normal_pool.qsize()
                
                logger.debug(f"Worker {worker_name} traite la tâche {task.task_id} ({len(task.target_languages)} langues)")
                
                # Traiter la tâche
                start_time = time.time()
                await self._process_translation_task(task, worker_name)
                processing_time = time.time() - start_time
                
                # Mettre à jour les stats de performance
                self.stats['avg_processing_time'] = (
                    (self.stats['avg_processing_time'] * (self.stats['tasks_processed']) + processing_time) 
                    / (self.stats['tasks_processed'] + 1)
                )
                
                self.stats['normal_workers_active'] -= 1
                self.stats['tasks_processed'] += 1
                
            except Exception as e:
                logger.error(f"Erreur dans le worker {worker_name}: {e}")
                self.stats['tasks_failed'] += 1
                if self.stats['normal_workers_active'] > 0:
                    self.stats['normal_workers_active'] -= 1
        
        logger.info(f"Worker {worker_name} arrêté")
    
    async def _any_worker_loop(self, worker_name: str):
        """Boucle de travail pour les workers de la pool 'any' avec scaling dynamique"""
        logger.info(f"Worker {worker_name} démarré")

        while self.any_workers_running:
            try:
                # Vérifier le scaling dynamique
                await self._dynamic_scaling_check()

                # ═══════════════════════════════════════════════════════════════
                # OPTIMISATION: Vérifier fast_pool d'abord (textes courts prioritaires)
                # ═══════════════════════════════════════════════════════════════
                task = None

                if self.enable_priority_queue and not self.fast_pool.empty():
                    try:
                        task = self.fast_pool.get_nowait()
                        logger.debug(f"⚡ Worker {worker_name} traite tâche fast_pool")
                    except asyncio.QueueEmpty:
                        pass

                # Si pas de tâche fast, attendre la pool "any"
                if task is None:
                    try:
                        task = await asyncio.wait_for(self.any_pool.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue

                self.stats['any_workers_active'] += 1
                self.stats['any_pool_size'] = self.any_pool.qsize()
                
                logger.debug(f"Worker {worker_name} traite la tâche {task.task_id} ({len(task.target_languages)} langues)")
                
                # Traiter la tâche
                start_time = time.time()
                await self._process_translation_task(task, worker_name)
                processing_time = time.time() - start_time
                
                # Mettre à jour les stats de performance
                self.stats['avg_processing_time'] = (
                    (self.stats['avg_processing_time'] * (self.stats['tasks_processed']) + processing_time) 
                    / (self.stats['tasks_processed'] + 1)
                )
                
                self.stats['any_workers_active'] -= 1
                self.stats['tasks_processed'] += 1
                
            except Exception as e:
                logger.error(f"Erreur dans le worker {worker_name}: {e}")
                self.stats['tasks_failed'] += 1
                if self.stats['any_workers_active'] > 0:
                    self.stats['any_workers_active'] -= 1
        
        logger.info(f"Worker {worker_name} arrêté")
    
    async def _process_translation_task(self, task: TranslationTask, worker_name: str):
        """Traite une tâche de traduction avec traduction parallèle"""
        try:
            # Lancer les traductions en parallèle
            translation_tasks = []
            
            for target_language in task.target_languages:
                translation_task = asyncio.create_task(
                    self._translate_single_language(task, target_language, worker_name)
                )
                translation_tasks.append((target_language, translation_task))
            
            # Attendre toutes les traductions
            for target_language, translation_task in translation_tasks:
                try:
                    result = await translation_task
                    # Ajouter le type de pool au résultat
                    result['poolType'] = 'any' if task.conversation_id == 'any' else 'normal'
                    result['created_at'] = task.created_at
                    # Publier le résultat via PUB
                    await self._publish_translation_result(task.task_id, result, target_language)
                    self.stats['translations_completed'] += 1
                    
                except Exception as e:
                    logger.error(f"Erreur de traduction pour {target_language} dans {task.task_id}: {e}")
                    # Publier un résultat d'erreur
                    error_result = self._create_error_result(task, target_language, str(e))
                    await self._publish_translation_result(task.task_id, error_result, target_language)
            
        except Exception as e:
            logger.error(f"Erreur lors du traitement de la tâche {task.task_id}: {e}")
            self.stats['tasks_failed'] += 1
    
    async def _translate_single_language(self, task: TranslationTask, target_language: str, worker_name: str):
        """Traduit un texte vers une langue cible spécifique (avec cache Redis)"""
        start_time = time.time()

        try:
            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 1: Vérifier le cache (basé sur hash du texte)
            # Le hash change automatiquement si le texte est modifié
            # ═══════════════════════════════════════════════════════════════
            if self.translation_cache:
                cached = await self.translation_cache.get_translation(
                    text=task.text,
                    source_lang=task.source_language,
                    target_lang=target_language,
                    model_type=task.model_type
                )

                if cached:
                    processing_time = time.time() - start_time
                    logger.debug(f"⚡ [CACHE] Hit traduction: {task.source_language}→{target_language} (msg={task.message_id})")

                    return {
                        'messageId': task.message_id,
                        'translatedText': cached.get('translated_text', ''),
                        'sourceLanguage': cached.get('source_lang', task.source_language),
                        'targetLanguage': target_language,
                        'confidenceScore': 0.99,  # Cache = haute confiance
                        'processingTime': processing_time,
                        'modelType': cached.get('model_type', task.model_type),
                        'workerName': worker_name,
                        'fromCache': True,
                        'segmentsCount': 0,
                        'emojisCount': 0
                    }

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 2: Traduire si pas en cache
            # ═══════════════════════════════════════════════════════════════
            if self.translation_service:
                # Effectuer la vraie traduction avec préservation de structure
                result = await self.translation_service.translate_with_structure(
                    text=task.text,
                    source_language=task.source_language,
                    target_language=target_language,
                    model_type=task.model_type,
                    source_channel='zmq'
                )

                processing_time = time.time() - start_time

                # Vérifier si le résultat est None ou invalide
                if result is None:
                    logger.error(f"❌ [TRANSLATOR] Service ML a retourné None pour {worker_name}")
                    raise Exception("Service de traduction a retourné None")

                # Vérifier que le résultat contient les clés attendues
                if not isinstance(result, dict) or 'translated_text' not in result:
                    logger.error(f"❌ [TRANSLATOR] Résultat invalide pour {worker_name}: {result}")
                    raise Exception(f"Résultat de traduction invalide: {result}")

                # ═══════════════════════════════════════════════════════════════
                # ÉTAPE 3: Mettre en cache la nouvelle traduction (TTL 1 mois)
                # Le hash du texte sert de clé - réutilisable cross-message
                # ═══════════════════════════════════════════════════════════════
                if self.translation_cache:
                    await self.translation_cache.set_translation(
                        text=task.text,
                        source_lang=task.source_language,
                        target_lang=target_language,
                        translated_text=result['translated_text'],
                        model_type=task.model_type
                    )

                return {
                    'messageId': task.message_id,
                    'translatedText': result['translated_text'],
                    'sourceLanguage': result.get('detected_language', task.source_language),
                    'targetLanguage': target_language,
                    'confidenceScore': result.get('confidence', 0.95),
                    'processingTime': processing_time,
                    'modelType': task.model_type,
                    'workerName': worker_name,
                    'fromCache': False,
                    # Métriques de préservation de structure
                    'segmentsCount': result.get('segments_count', 0),
                    'emojisCount': result.get('emojis_count', 0)
                }
            else:
                # Fallback si pas de service de traduction
                translated_text = f"[{target_language.upper()}] {task.text}"
                processing_time = time.time() - start_time
                
                return {
                    'messageId': task.message_id,
                    'translatedText': translated_text,
                    'sourceLanguage': task.source_language,
                    'targetLanguage': target_language,
                    'confidenceScore': 0.1,
                    'processingTime': processing_time,
                    'modelType': 'fallback',
                    'workerName': worker_name,
                    'error': 'No translation service available'
                }
            
        except Exception as e:
            logger.error(f"Erreur de traduction dans {worker_name}: {e}")
            # Fallback en cas d'erreur
            translated_text = f"[{target_language.upper()}] {task.text}"
            processing_time = time.time() - start_time
            
            return {
                'messageId': task.message_id,
                'translatedText': translated_text,
                'sourceLanguage': task.source_language,
                'targetLanguage': target_language,
                'confidenceScore': 0.1,
                'processingTime': processing_time,
                'modelType': 'fallback',
                'workerName': worker_name,
                'error': str(e)
            }
    
    def _create_error_result(self, task: TranslationTask, target_language: str, error_message: str):
        """Crée un résultat d'erreur pour une traduction échouée"""
        return {
            'messageId': task.message_id,
            'translatedText': f"[ERREUR: {error_message}]",
            'sourceLanguage': task.source_language,
            'targetLanguage': target_language,
            'confidenceScore': 0.0,
            'processingTime': 0.0,
            'modelType': task.model_type,
            'error': error_message
        }
    
    async def _publish_translation_result(self, task_id: str, result: dict, target_language: str):
        """Publie un résultat de traduction via PUB"""
        try:
            # Cette méthode sera appelée par le serveur ZMQ principal
            # Le résultat sera publié via le socket PUB
            # Note: Cette méthode sera remplacée par le serveur ZMQ principal
            pass
        except Exception as e:
            logger.error(f"Erreur lors de la publication du résultat {task_id}: {e}")
    
    def get_stats(self) -> dict:
        """Retourne les statistiques actuelles"""
        return {
            **self.stats,
            'memory_usage_mb': psutil.Process().memory_info().rss / 1024 / 1024,
            'uptime_seconds': time.time() - getattr(self, '_start_time', time.time())
        }

class ZMQTranslationServer:
    """
    Serveur ZMQ pour la traduction avec architecture PUB/SUB

    ═══════════════════════════════════════════════════════════════════════════════
    ARCHITECTURE: SÉPARATION DES RESPONSABILITÉS
    ═══════════════════════════════════════════════════════════════════════════════

    TRANSLATOR (ce service):
      ✅ Traduit les textes (modèles ML NLLB)
      ✅ Transcrit les audios (Whisper)
      ✅ Clone les voix et génère TTS
      ✅ Cache les résultats dans Redis (TTL 1 mois)
      ✅ Renvoie les résultats à Gateway via ZMQ PUB
      ❌ NE SAUVEGARDE PAS en base de données (sauf profils vocaux)

    GATEWAY:
      ✅ Reçoit les résultats via ZMQ SUB
      ✅ Persiste en base de données (MongoDB/Prisma)
      ✅ Gère l'encryption des traductions si nécessaire
      ✅ Contrôle la logique métier de persistance

    Avantages:
      - Translator peut fonctionner sans base de données
      - Meilleure scalabilité (Translator stateless)
      - Gateway contrôle la logique de persistance
      - Séparation claire des responsabilités
    ═══════════════════════════════════════════════════════════════════════════════
    """

    def __init__(self,
                 host: str = "0.0.0.0",
                 gateway_push_port: int = 5555,  # Port où Translator PULL bind (Gateway PUSH connect ici)
                 gateway_sub_port: int = 5558,   # Port où Translator PUB bind (Gateway SUB connect ici)
                 normal_pool_size: int = 10000,
                 any_pool_size: int = 10000,
                 normal_workers: int = 3,
                 any_workers: int = 2,
                 translation_service=None,
                 database_url: str = None):
        
        self.host = host
        self.gateway_push_port = gateway_push_port  # Port pour PULL (recevoir commandes)
        self.gateway_sub_port = gateway_sub_port    # Port pour PUB (envoyer réponses)
        self.context = zmq.asyncio.Context()
        
        # Sockets
        self.pull_socket = None  # PULL pour recevoir les commandes de traduction
        self.pub_socket = None   # PUB pour publier les résultats (inchangé)
        
        # Pool manager
        self.pool_manager = TranslationPoolManager(
            normal_pool_size=normal_pool_size,
            any_pool_size=any_pool_size,
            normal_workers=normal_workers,
            any_workers=any_workers,
            translation_service=translation_service
        )
        
        # Remplacer la méthode de publication du pool manager
        self.pool_manager._publish_translation_result = self._publish_translation_result
        
        # Service de base de données
        self.database_service = DatabaseService(database_url)

        # Voice API handler
        self.voice_api_handler = None
        if VOICE_API_AVAILABLE:
            self.voice_api_handler = get_voice_api_handler()
            logger.info("✅ [ZMQ] VoiceAPIHandler initialisé")

        # Voice Profile handler (internal ZMQ processing for Gateway)
        self.voice_profile_handler = None
        if VOICE_PROFILE_HANDLER_AVAILABLE:
            self.voice_profile_handler = get_voice_profile_handler()
            logger.info("✅ [ZMQ] VoiceProfileHandler initialisé")

        # État du serveur
        self.running = False
        self.worker_tasks = []

        logger.info(f"ZMQTranslationServer initialisé: Gateway PUSH {host}:{gateway_push_port} (PULL bind)")
        logger.info(f"ZMQTranslationServer initialisé: Gateway SUB {host}:{gateway_sub_port} (PUB bind)")

    async def _connect_database_background(self):
        """Connecte à la base de données en arrière-plan sans bloquer le démarrage"""
        try:
            logger.info("[TRANSLATOR-DB] 🔗 Tentative de connexion à MongoDB...")
            db_connected = await self.database_service.connect()
            if db_connected:
                logger.info("[TRANSLATOR-DB] ✅ Connexion à la base de données établie")
            else:
                logger.warning("[TRANSLATOR-DB] ⚠️ Connexion à la base de données échouée, sauvegarde désactivée")
        except Exception as e:
            logger.error(f"[TRANSLATOR-DB] ❌ Erreur lors de la connexion à la base de données: {e}")
    
    async def initialize(self):
        """Initialise les sockets ZMQ avec architecture PUSH/PULL + PUB/SUB"""
        try:
            # Connexion à la base de données en arrière-plan (non-bloquante)
            logger.info("[TRANSLATOR] 🔗 Lancement de la connexion à la base de données en arrière-plan...")
            # Créer une tâche asynchrone pour la connexion DB sans bloquer
            asyncio.create_task(self._connect_database_background())
            logger.info("[TRANSLATOR] ✅ Connexion DB lancée en arrière-plan, le serveur continue son démarrage...")
            
            # Socket PULL pour recevoir les commandes du Gateway (remplace SUB)
            self.pull_socket = self.context.socket(zmq.PULL)
            self.pull_socket.bind(f"tcp://{self.host}:{self.gateway_push_port}")
            
            # Socket PUB pour publier les résultats vers le Gateway (inchangé)
            self.pub_socket = self.context.socket(zmq.PUB)
            self.pub_socket.bind(f"tcp://{self.host}:{self.gateway_sub_port}")
            
            # Petit délai pour établir les connexions ZMQ
            await asyncio.sleep(0.1)
            logger.info("[TRANSLATOR] ✅ Sockets ZMQ créés, démarrage des workers...")
            
            # Démarrer les workers
            self.worker_tasks = await self.pool_manager.start_workers()
            logger.info(f"[TRANSLATOR] ✅ Workers démarrés: {len(self.worker_tasks)} tâches")
            
            logger.info("ZMQTranslationServer initialisé avec succès")
            logger.info(f"🔌 Socket PULL lié au port: {self.host}:{self.gateway_push_port}")
            logger.info(f"🔌 Socket PUB lié au port: {self.host}:{self.gateway_sub_port}")
            
        except Exception as e:
            logger.error(f"Erreur lors de l'initialisation: {e}")
            raise
    
    async def start(self):
        """Démarre le serveur"""
        if not self.pull_socket or not self.pub_socket:
            await self.initialize()
        
        self.running = True
        logger.info("ZMQTranslationServer démarré")
        
        try:
            while self.running:
                try:
                    # Recevoir une commande de traduction via PULL
                    message = await self.pull_socket.recv()
                    await self._handle_translation_request(message)
                    
                except zmq.ZMQError as e:
                    if self.running:
                        logger.error(f"Erreur ZMQ: {e}")
                    break
                except Exception as e:
                    logger.error(f"Erreur inattendue: {e}")
                    import traceback
                    traceback.print_exc()
                    
        except KeyboardInterrupt:
            logger.info("Arrêt demandé par l'utilisateur")
        finally:
            await self.stop()
    
    async def _handle_translation_request(self, message: bytes):
        """
        Traite une requête de traduction reçue via SUB
        
        XXX: PARALLÉLISATION OPPORTUNITÉ #3 - Traduction multi-langues simultanée
        TODO: Actuellement, si targetLanguages = ['en', 'es', 'de', 'it', 'pt']
              chaque langue est traduite SÉQUENTIELLEMENT par le worker
        TODO: Optimisation possible:
              - Créer UNE tâche par langue cible (5 tâches au lieu d'1)
              - Les workers traitent en parallèle (si plusieurs workers disponibles)
              - OU: Batch translation dans le worker (traduire toutes les langues en 1 passe)
        TODO: Implémentation suggérée:
              # Option A: Multiple tasks (simple, utilise workers existants)
              for target_lang in target_languages:
                  task = TranslationTask(
                      target_languages=[target_lang],  # UNE langue par tâche
                      ...
                  )
                  await self.pool_manager.enqueue_task(task)
              
              # Option B: Batch API dans ML service (plus efficace)
              results = await ml_service.translate_batch_multilingual(
                  text=text,
                  source_lang=source_lang,
                  target_langs=['en', 'es', 'de', 'it', 'pt'],  # Toutes ensemble
                  model_type=model_type
              )
        TODO: Gains attendus:
              - Option A: N workers × vitesse (si N workers disponibles)
              - Option B: 2-3x plus rapide (overhead réduit, batch processing)
        """
        try:
            request_data = json.loads(message.decode('utf-8'))
            
            # Dispatcher selon le type de message
            message_type = request_data.get('type')

            # === PING ===
            if message_type == 'ping':
                logger.info(f"🏓 [TRANSLATOR] Ping reçu, timestamp: {request_data.get('timestamp')}")
                # Répondre au ping via PUB
                ping_response = {
                    'type': 'pong',
                    'timestamp': time.time(),
                    'translator_status': 'alive',
                    'translator_port_pub': self.gateway_sub_port,
                    'translator_port_pull': self.gateway_push_port,
                    'audio_pipeline_available': AUDIO_PIPELINE_AVAILABLE
                }
                if self.pub_socket:
                    await self.pub_socket.send(json.dumps(ping_response).encode('utf-8'))
                    logger.info(f"🏓 [TRANSLATOR] Pong envoyé via port {self.gateway_sub_port}")
                else:
                    logger.error(f"❌ [TRANSLATOR] Socket PUB non disponible pour pong (port {self.gateway_sub_port})")
                return

            # === AUDIO PROCESSING ===
            if message_type == 'audio_process':
                await self._handle_audio_process_request(request_data)
                return

            # === VOICE API ===
            if VOICE_API_AVAILABLE and self.voice_api_handler and self.voice_api_handler.is_voice_api_request(message_type):
                await self._handle_voice_api_request(request_data)
                return

            # === VOICE PROFILE (internal processing for Gateway) ===
            if VOICE_PROFILE_HANDLER_AVAILABLE and self.voice_profile_handler and self.voice_profile_handler.is_voice_profile_request(message_type):
                await self._handle_voice_profile_request(request_data)
                return

            # Vérifier que c'est une requête de traduction valide
            if not request_data.get('text') or not request_data.get('targetLanguages'):
                logger.warning(f"⚠️ [TRANSLATOR] Requête invalide reçue: {request_data}")
                return
            
            # Vérifier la longueur du message pour la traduction
            message_text = request_data.get('text', '')
            if not can_translate_message(message_text):
                logger.warning(f"⚠️ [TRANSLATOR] Message too long to be translated: {len(message_text)} caractères (max: {MessageLimits.MAX_TRANSLATION_LENGTH})")
                # Ne pas traiter ce message, retourner un résultat vide ou le texte original
                # On pourrait aussi envoyer une notification à la gateway ici si nécessaire
                no_translation_message = {
                    'type': 'translation_skipped',
                    'messageId': request_data.get('messageId'),
                    'reason': 'message_too_long',
                    'length': len(message_text),
                    'max_length': MessageLimits.MAX_TRANSLATION_LENGTH,
                    'conversationId': request_data.get('conversationId', 'unknown')
                }
                if self.pub_socket:
                    await self.pub_socket.send(json.dumps(no_translation_message).encode('utf-8'))
                    logger.info(f"[TRANSLATOR] translation message ignored for message {request_data.get('messageId')}")
                return
            
            # Créer la tâche de traduction
            task = TranslationTask(
                task_id=str(uuid.uuid4()),
                message_id=request_data.get('messageId'),
                text=message_text,
                source_language=request_data.get('sourceLanguage', 'fr'),
                target_languages=request_data.get('targetLanguages', []),
                conversation_id=request_data.get('conversationId', 'unknown'),
                model_type=request_data.get('modelType', 'basic')
            )
            
            logger.info(f"🔧 [TRANSLATOR] Tâche créée: {task.task_id} pour {task.conversation_id} ({len(task.target_languages)} langues)")
            logger.info(f"📝 [TRANSLATOR] Détails: texte='{task.text[:50]}...', source={task.source_language}, target={task.target_languages}, modèle={task.model_type}")
            
            # Enfiler la tâche dans la pool appropriée
            success = await self.pool_manager.enqueue_task(task)
            
            if not success:
                # Pool pleine, publier un message d'erreur vers la gateway
                error_message = {
                    'type': 'translation_error',
                    'taskId': task.task_id,
                    'messageId': task.message_id,
                    'error': 'translation pool full',
                    'conversationId': task.conversation_id
                }
                # Utiliser le socket PUB configuré pour envoyer l'erreur à la gateway
                if self.pub_socket:
                    await self.pub_socket.send(json.dumps(error_message).encode('utf-8'))
                    logger.warning(f"Pool pleine, rejet de la tâche {task.task_id}")
                else:
                    logger.error("❌ Socket PUB non initialisé pour envoyer l'erreur")
            
        except json.JSONDecodeError as e:
            logger.error(f"Erreur de décodage JSON: {e}")
        except Exception as e:
            logger.error(f"Erreur lors du traitement de la requête: {e}")

    async def _handle_audio_process_request(self, request_data: dict):
        """
        Traite une requête de processing audio.

        Pipeline complet:
        1. Transcription (mobile ou Whisper)
        2. Traduction vers les langues cibles
        3. Clonage vocal
        4. Génération TTS

        Format attendu:
        {
            "type": "audio_process",
            "messageId": str,
            "attachmentId": str,
            "conversationId": str,
            "senderId": str,
            "audioUrl": str,
            "audioPath": str,
            "audioDurationMs": int,
            "mobileTranscription": {
                "text": str,
                "language": str,
                "confidence": float,
                "source": str
            },
            "targetLanguages": [str],
            "generateVoiceClone": bool,
            "modelType": str
        }
        """
        task_id = str(uuid.uuid4())
        start_time = time.time()

        logger.info(f"🎤 [TRANSLATOR] Audio process request reçu: {request_data.get('messageId')}")

        if not AUDIO_PIPELINE_AVAILABLE:
            logger.error("[TRANSLATOR] Audio pipeline non disponible")
            await self._publish_audio_error(
                task_id=task_id,
                message_id=request_data.get('messageId', ''),
                attachment_id=request_data.get('attachmentId', ''),
                error="Audio pipeline not available",
                error_code="pipeline_unavailable"
            )
            return

        try:
            # Valider les données requises
            required_fields = ['messageId', 'attachmentId', 'audioPath', 'senderId']
            for field in required_fields:
                if not request_data.get(field):
                    raise ValueError(f"Champ requis manquant: {field}")

            # Préparer les métadonnées mobiles
            metadata = None
            mobile_trans = request_data.get('mobileTranscription')
            if mobile_trans and mobile_trans.get('text'):
                metadata = AudioMessageMetadata(
                    transcription=mobile_trans.get('text'),
                    language=mobile_trans.get('language'),
                    confidence=mobile_trans.get('confidence'),
                    source=mobile_trans.get('source'),
                    segments=mobile_trans.get('segments')
                )

            # Obtenir le pipeline et l'initialiser
            pipeline = get_audio_pipeline()

            # Injecter les services si pas encore fait
            if pipeline.translation_service is None and hasattr(self, 'pool_manager') and self.pool_manager.translation_service:
                pipeline.set_translation_service(self.pool_manager.translation_service)

            if pipeline.database_service is None and hasattr(self, 'database_service'):
                pipeline.set_database_service(self.database_service)

            # Exécuter le pipeline audio
            result = await pipeline.process_audio_message(
                audio_path=request_data.get('audioPath'),
                audio_url=request_data.get('audioUrl', ''),
                sender_id=request_data.get('senderId'),
                conversation_id=request_data.get('conversationId', ''),
                message_id=request_data.get('messageId'),
                attachment_id=request_data.get('attachmentId'),
                audio_duration_ms=request_data.get('audioDurationMs', 0),
                metadata=metadata,
                target_languages=request_data.get('targetLanguages'),
                generate_voice_clone=request_data.get('generateVoiceClone', True),
                model_type=request_data.get('modelType', 'medium'),
                # Voice profile options (pour messages transférés - voix de l'émetteur original)
                original_sender_id=request_data.get('originalSenderId'),
                existing_voice_profile=request_data.get('existingVoiceProfile'),
                use_original_voice=request_data.get('useOriginalVoice', True)
            )

            processing_time = int((time.time() - start_time) * 1000)

            # Publier le résultat
            await self._publish_audio_result(task_id, result, processing_time)

            logger.info(
                f"✅ [TRANSLATOR] Audio process terminé: "
                f"msg={result.message_id}, "
                f"translations={len(result.translations)}, "
                f"time={processing_time}ms"
            )

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur audio process: {e}")
            import traceback
            traceback.print_exc()

            await self._publish_audio_error(
                task_id=task_id,
                message_id=request_data.get('messageId', ''),
                attachment_id=request_data.get('attachmentId', ''),
                error=str(e),
                error_code="processing_failed"
            )

    async def _publish_audio_result(self, task_id: str, result, processing_time: int):
        """Publie le résultat du processing audio via PUB"""
        try:
            # Construire le message de résultat
            message = {
                'type': 'audio_process_completed',
                'taskId': task_id,
                'messageId': result.message_id,
                'attachmentId': result.attachment_id,
                'transcription': {
                    'text': result.original.transcription,
                    'language': result.original.language,
                    'confidence': result.original.confidence,
                    'source': result.original.source,
                    'segments': result.original.segments
                },
                'translatedAudios': [
                    {
                        'targetLanguage': t.language,
                        'translatedText': t.translated_text,
                        'audioUrl': t.audio_url,
                        'audioPath': t.audio_path,
                        'durationMs': t.duration_ms,
                        'voiceCloned': t.voice_cloned,
                        'voiceQuality': t.voice_quality
                    }
                    for t in result.translations.values()
                ],
                'voiceModelUserId': result.voice_model_user_id,
                'voiceModelQuality': result.voice_model_quality,
                'processingTimeMs': processing_time,
                'timestamp': time.time()
            }

            # Inclure le nouveau profil vocal si créé par Translator
            # Gateway doit le sauvegarder dans MongoDB pour réutilisation future
            if hasattr(result, 'new_voice_profile') and result.new_voice_profile:
                nvp = result.new_voice_profile
                message['newVoiceProfile'] = {
                    'userId': nvp.user_id,
                    'profileId': nvp.profile_id,
                    'embedding': nvp.embedding_base64,
                    'qualityScore': nvp.quality_score,
                    'audioCount': nvp.audio_count,
                    'totalDurationMs': nvp.total_duration_ms,
                    'version': nvp.version,
                    'fingerprint': nvp.fingerprint,
                    'voiceCharacteristics': nvp.voice_characteristics
                }
                logger.info(f"📦 [TRANSLATOR] Nouveau profil vocal inclus pour Gateway: {nvp.user_id}")

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.info(f"✅ [TRANSLATOR] Audio result publié: {result.message_id}")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour audio result")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication audio result: {e}")

    async def _publish_audio_error(
        self,
        task_id: str,
        message_id: str,
        attachment_id: str,
        error: str,
        error_code: str
    ):
        """Publie une erreur de processing audio via PUB"""
        try:
            message = {
                'type': 'audio_process_error',
                'taskId': task_id,
                'messageId': message_id,
                'attachmentId': attachment_id,
                'error': error,
                'errorCode': error_code,
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.warning(f"⚠️ [TRANSLATOR] Audio error publié: {message_id} - {error_code}")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour audio error")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication audio error: {e}")

    async def _handle_voice_api_request(self, request_data: dict):
        """
        Traite une requête Voice API.
        Délègue au VoiceAPIHandler et publie le résultat via PUB.
        """
        try:
            if not self.voice_api_handler:
                logger.error("[TRANSLATOR] Voice API handler non disponible")
                return

            # Déléguer au handler
            response = await self.voice_api_handler.handle_request(request_data)

            # Publier la réponse via PUB
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(response).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Voice API response publiée: {response.get('taskId')} ({response.get('type')})")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour Voice API response")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur Voice API: {e}")
            import traceback
            traceback.print_exc()

            # Publier une erreur
            error_response = {
                'type': 'voice_api_error',
                'taskId': request_data.get('taskId', ''),
                'requestType': request_data.get('type', ''),
                'error': str(e),
                'errorCode': 'INTERNAL_ERROR',
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(error_response).encode('utf-8'))

    async def _handle_voice_profile_request(self, request_data: dict):
        """
        Traite une requête Voice Profile (internal processing for Gateway).

        Gateway sends audio via ZMQ, Translator processes and returns:
        - Fingerprint
        - Voice characteristics
        - Quality score
        - Embedding path

        Gateway then persists the results in database.
        """
        try:
            if not self.voice_profile_handler:
                logger.error("[TRANSLATOR] Voice Profile handler non disponible")
                return

            # Déléguer au handler
            response = await self.voice_profile_handler.handle_request(request_data)

            # Publier la réponse via PUB
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(response).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Voice Profile response publiée: {response.get('request_id')} ({response.get('type')})")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour Voice Profile response")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur Voice Profile: {e}")
            import traceback
            traceback.print_exc()

            # Publier une erreur
            error_response = {
                'type': 'voice_profile_error',
                'request_id': request_data.get('request_id', ''),
                'user_id': request_data.get('user_id', ''),
                'error': str(e),
                'success': False,
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(error_response).encode('utf-8'))

    def set_voice_api_services(
        self,
        transcription_service=None,
        translation_service=None,
        voice_clone_service=None,
        tts_service=None,
        voice_analyzer=None,
        translation_pipeline=None,
        analytics_service=None
    ):
        """
        Configure les services pour le Voice API handler et Voice Profile handler.
        Appelé par main.py après initialisation des services.
        """
        if self.voice_api_handler:
            self.voice_api_handler.transcription_service = transcription_service
            self.voice_api_handler.translation_service = translation_service
            self.voice_api_handler.voice_clone_service = voice_clone_service
            self.voice_api_handler.tts_service = tts_service
            self.voice_api_handler.voice_analyzer = voice_analyzer
            self.voice_api_handler.translation_pipeline = translation_pipeline
            self.voice_api_handler.analytics_service = analytics_service
            logger.info("✅ [ZMQ] Voice API services configurés")

        # Also configure voice profile handler
        if self.voice_profile_handler:
            self.voice_profile_handler.voice_clone_service = voice_clone_service
            logger.info("✅ [ZMQ] Voice Profile handler services configurés")

    async def _publish_translation_result(self, task_id: str, result: dict, target_language: str):
        """Publie un résultat de traduction via PUB vers la gateway avec informations techniques complètes"""
        try:
            # DEBUG: Logs réduits de 60% - Suppression des vérifications détaillées
            
            # Récupérer les informations techniques du système
            import socket
            import uuid
            
            # Calculer le temps d'attente en queue
            queue_time = time.time() - result.get('created_at', time.time())
            
            # Récupérer les métriques système
            memory_usage = psutil.Process().memory_info().rss / 1024 / 1024  # MB
            cpu_usage = psutil.Process().cpu_percent()
            # Attendre un peu pour avoir une mesure CPU valide
            await asyncio.sleep(0.1)
            cpu_usage = psutil.Process().cpu_percent()
            
            # Enrichir le résultat avec toutes les informations techniques
            enriched_result = {
                # Informations applicatives existantes
                'messageId': result.get('messageId'),
                'translatedText': result.get('translatedText'),
                'sourceLanguage': result.get('sourceLanguage'),
                'targetLanguage': result.get('targetLanguage'),
                'confidenceScore': result.get('confidenceScore', 0.0),
                'processingTime': result.get('processingTime', 0.0),
                'modelType': result.get('modelType', 'basic'),
                'workerName': result.get('workerName', 'unknown'),
                
                # NOUVELLES INFORMATIONS TECHNIQUES
                'translatorModel': result.get('modelType', 'basic'),  # Modèle ML utilisé
                'workerId': result.get('workerName', 'unknown'),      # Worker qui a traité
                'poolType': result.get('poolType', 'normal'),         # Pool utilisée (normal/any)
                'translationTime': result.get('processingTime', 0.0), # Temps de traduction
                'queueTime': queue_time,                              # Temps d'attente en queue
                'memoryUsage': memory_usage,                          # Usage mémoire (MB)
                'cpuUsage': cpu_usage,                                # Usage CPU (%)
                'timestamp': time.time(),
                'version': '1.0.0'  # Version du Translator
            }
            
            # Créer le message enrichi
            message = {
                'type': 'translation_completed',
                'taskId': task_id,
                'result': enriched_result,
                'targetLanguage': target_language,
                'timestamp': time.time(),
                # MÉTADONNÉES TECHNIQUES
                'metadata': {
                    'translatorVersion': '1.0.0',
                    'modelVersion': result.get('modelType', 'basic'),
                    'processingNode': socket.gethostname(),
                    'sessionId': str(uuid.uuid4()),
                    'requestId': task_id,
                    'protocol': 'ZMQ_PUB_SUB',
                    'encoding': 'UTF-8'
                }
            }
            
            # DEBUG: Logs réduits de 60% - Suppression des détails techniques
            
            # VÉRIFICATION DE LA QUALITÉ DE LA TRADUCTION
            translated_text = result.get('translatedText', '')
            is_valid_translation = self._is_valid_translation(translated_text, result)
            
            if not is_valid_translation:
                # Traduction invalide - NE PAS ENVOYER à la Gateway
                logger.error(f"❌ [TRANSLATOR] Traduction invalide détectée - PAS D'ENVOI à la Gateway:")
                logger.error(f"   📋 Task ID: {task_id}")
                logger.error(f"   📋 Message ID: {result.get('messageId')}")
                logger.error(f"   📋 Source: {result.get('sourceLanguage')} -> Target: {target_language}")
                logger.error(f"   📋 Texte original: {result.get('originalText', 'N/A')}")
                logger.error(f"   📋 Texte traduit: '{translated_text}'")
                logger.error(f"   📋 Modèle utilisé: {result.get('modelType', 'unknown')}")
                logger.error(f"   📋 Worker: {result.get('workerName', 'unknown')}")
                logger.error(f"   📋 Raison: {self._get_translation_error_reason(translated_text)}")
                return  # Sortir sans envoyer à la Gateway
            
            # Traduction valide - SAUVEGARDE ET ENVOI
            try:
                # Préparer les données pour la sauvegarde
                save_data = {
                    'messageId': result.get('messageId'),
                    'sourceLanguage': result.get('sourceLanguage'),
                    'targetLanguage': result.get('targetLanguage'),
                    'translatedText': result.get('translatedText'),
                    'translatorModel': result.get('translatorModel', result.get('modelType', 'basic')),
                    'confidenceScore': result.get('confidenceScore', 0.9),
                    'processingTime': result.get('processingTime', 0.0),
                    'workerName': result.get('workerName', 'unknown'),
                    'poolType': result.get('poolType', 'normal')
                }
                
                # ═══════════════════════════════════════════════════════════════════════
                # ARCHITECTURE: PAS DE SAUVEGARDE EN BASE ICI
                # ═══════════════════════════════════════════════════════════════════════
                # La persistance des traductions est la RESPONSABILITÉ DE LA GATEWAY.
                # Translator ne fait que:
                #   1. Traduire (avec cache Redis pour éviter les retraductions)
                #   2. Renvoyer les résultats à Gateway via ZMQ PUB
                # Gateway reçoit les résultats et persiste en base de données.
                #
                # Avantages:
                #   - Séparation claire des responsabilités
                #   - Translator peut fonctionner sans base de données
                #   - Gateway contrôle la logique de persistance (encryption, etc.)
                #   - Meilleure scalabilité (Translator stateless)
                # ═══════════════════════════════════════════════════════════════════════
                # CODE DÉSACTIVÉ - Conservé pour référence uniquement:
                # if self.database_service.is_db_connected():
                #     save_success = await self.database_service.save_translation(save_data)
                # ═══════════════════════════════════════════════════════════════════════
                    
            except Exception as e:
                logger.error(f"❌ [TRANSLATOR] Erreur sauvegarde base de données: {e}")
            
            # ENVOI À LA GATEWAY (seulement si traduction valide)
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Résultat envoyé à la Gateway: {task_id} -> {target_language}")
            else:
                logger.error("❌ Socket PUB non initialisé")
            
        except Exception as e:
            logger.error(f"Erreur lors de la publication du résultat enrichi: {e}")
            import traceback
            traceback.print_exc()
    
    def _is_valid_translation(self, translated_text: str, result: dict) -> bool:
        """
        Vérifie si une traduction est valide et peut être envoyée à la Gateway
        
        Args:
            translated_text: Le texte traduit
            result: Le résultat complet de la traduction
        
        Returns:
            bool: True si la traduction est valide, False sinon
        """
        # Vérifier que le texte traduit existe et n'est pas vide
        if not translated_text or translated_text.strip() == '':
            return False
        
        # Vérifier que ce n'est pas un message d'erreur
        error_patterns = [
            r'^\[.*Error.*\]',
            r'^\[.*Failed.*\]',
            r'^\[.*No.*Result.*\]',
            r'^\[.*Fallback.*\]',
            r'^\[.*ML.*Error.*\]',
            r'^\[.*ÉCHEC.*\]',
            r'^\[.*MODÈLES.*NON.*\]',
            r'^\[.*MODÈLES.*NON.*CHARGÉS.*\]',
            r'^\[.*NLLB.*No.*Result.*\]',
            r'^\[.*NLLB.*Fallback.*\]',
            r'^\[.*ERREUR.*\]',
            r'^\[.*FAILED.*\]',
            r'^\[.*TIMEOUT.*\]',
            r'^\[.*META.*TENSOR.*\]'
        ]
        
        for pattern in error_patterns:
            if re.search(pattern, translated_text, re.IGNORECASE):
                return False
        
        # Vérifier que le texte traduit n'est pas identique au texte source
        original_text = result.get('originalText', '')
        if original_text and translated_text.strip().lower() == original_text.strip().lower():
            return False
        
        # Vérifier que le score de confiance est acceptable
        confidence_score = result.get('confidenceScore', 1.0)
        if confidence_score < 0.1:
            return False
        
        # Vérifier qu'il n'y a pas d'erreur dans le résultat
        if result.get('error'):
            return False
        
        return True
    
    def _get_translation_error_reason(self, translated_text: str) -> str:
        """
        Retourne la raison de l'échec de traduction
        
        Args:
            translated_text: Le texte traduit
        
        Returns:
            str: La raison de l'échec
        """
        if not translated_text or translated_text.strip() == '':
            return "Texte traduit vide"
        
        error_patterns = [
            (r'^\[.*Error.*\]', "Message d'erreur détecté"),
            (r'^\[.*Failed.*\]', "Échec de traduction détecté"),
            (r'^\[.*No.*Result.*\]', "Aucun résultat de traduction"),
            (r'^\[.*Fallback.*\]', "Fallback de traduction détecté"),
            (r'^\[.*ML.*Error.*\]', "Erreur ML détectée"),
            (r'^\[.*ÉCHEC.*\]', "Échec de traduction"),
            (r'^\[.*MODÈLES.*NON.*\]', "Modèles non disponibles"),
            (r'^\[.*MODÈLES.*NON.*CHARGÉS.*\]', "Modèles non chargés"),
            (r'^\[.*NLLB.*No.*Result.*\]', "NLLB: Aucun résultat"),
            (r'^\[.*NLLB.*Fallback.*\]', "NLLB: Fallback"),
            (r'^\[.*ERREUR.*\]', "Erreur générale"),
            (r'^\[.*FAILED.*\]', "Échec général"),
            (r'^\[.*TIMEOUT.*\]', "Timeout de traduction"),
            (r'^\[.*META.*TENSOR.*\]', "Erreur meta tensor")
        ]
        
        for pattern, reason in error_patterns:
            if re.search(pattern, translated_text, re.IGNORECASE):
                return reason
        
        return "Erreur de validation inconnue"
    
    async def stop(self):
        """Arrête le serveur"""
        self.running = False
        
        # Arrêter les workers
        await self.pool_manager.stop_workers()
        
        # Attendre que tous les workers se terminent
        if self.worker_tasks:
            await asyncio.gather(*self.worker_tasks, return_exceptions=True)
        
        # Fermer la connexion à la base de données
        await self.database_service.disconnect()
        
        # Fermer les sockets
        if self.pull_socket:
            self.pull_socket.close()
        if self.pub_socket:
            self.pub_socket.close()
        
        logger.info("ZMQTranslationServer arrêté")
    
    def get_stats(self) -> dict:
        """Retourne les statistiques du serveur"""
        pool_stats = self.pool_manager.get_stats()
        
        return {
            'server_status': 'running' if self.running else 'stopped',
            'gateway_push_port': self.gateway_push_port,
            'gateway_sub_port': self.gateway_sub_port,
            'normal_workers': self.pool_manager.normal_workers,
            'any_workers': self.pool_manager.any_workers,
            **pool_stats
        }
    
    async def health_check(self) -> dict:
        """Vérification de santé du serveur"""
        try:
            stats = self.get_stats()
            return {
                'status': 'healthy',
                'running': self.running,
                'stats': stats
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }
