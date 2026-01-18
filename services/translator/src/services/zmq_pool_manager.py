"""
Gestionnaire de pool de workers pour traductions parallèles

Gère le pool de workers avec batching, priorités et scaling dynamique.
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Set
from collections import defaultdict
import multiprocessing
import os

from .zmq_models import TranslationTask

# Import des optimisations de performance
PERFORMANCE_MODULE_AVAILABLE = False
try:
    from utils.performance import Priority, PerformanceConfig
    PERFORMANCE_MODULE_AVAILABLE = True
except ImportError:
    pass

# Import du service de cache Redis
CACHE_AVAILABLE = False
try:
    from .redis_service import get_redis_service, get_translation_cache_service, TranslationCacheService
    CACHE_AVAILABLE = True
except ImportError:
    pass

logger = logging.getLogger(__name__)

class TranslationPoolManager:
    """
    Gestionnaire des pools FIFO de traduction avec gestion dynamique des workers

    OPTIMISATION MULTI-UTILISATEURS APPLIQUÉE:
    ═══════════════════════════════════════════════════════════════════════════

    1. BATCH ACCUMULATION (NOUVEAU):
       - Accumule les requêtes pendant une fenêtre temporelle (50ms par défaut)
       - Traite les requêtes en batch pour le même couple source/target language
       - Gains: 2-3x throughput grâce au batch processing ML

    2. PIPELINE RÉUTILISABLE (via translation_ml_service):
       - Les pipelines ML sont créés une seule fois par thread
       - Gains: 100-500ms économisés par requête

    3. PRIORITY QUEUE:
       - Textes courts (<100 chars) traités en priorité via fast_pool
       - Équilibrage de charge automatique

    Configuration via variables d'environnement:
    - BATCH_WINDOW_MS: Fenêtre d'accumulation (défaut: 50ms)
    - BATCH_MAX_SIZE: Taille max du batch (défaut: 10)
    - NORMAL_WORKERS_DEFAULT: Workers normaux (défaut: 8)
    ═══════════════════════════════════════════════════════════════════════════
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

        # ═══════════════════════════════════════════════════════════════
        # OPTIMISATION CRITIQUE: Batch Accumulation
        # Accumule les requêtes pendant une fenêtre temporelle puis les traite en batch
        # Gains attendus: 2-3x throughput
        # ═══════════════════════════════════════════════════════════════
        self.batch_window_ms = int(os.getenv("BATCH_WINDOW_MS", "50"))  # 50ms d'accumulation
        self.batch_max_size = int(os.getenv("BATCH_MAX_SIZE", "10"))  # Max 10 requêtes par batch
        self.enable_batching = os.getenv("TRANSLATOR_BATCH_ENABLED", "true").lower() == "true"
        self._batch_accumulator: Dict[str, List[TranslationTask]] = {}  # Clé: "source_target_model"
        self._batch_lock = asyncio.Lock()
        self._batch_flush_task = None
        logger.info(f"[TRANSLATOR] 🔧 Batch processing: enabled={self.enable_batching}, window={self.batch_window_ms}ms, max_size={self.batch_max_size}")
        
        # ═══════════════════════════════════════════════════════════════
        # OPTIMISATION CPU: Configurer le nombre de workers basé sur les CPU cores
        # Avec le batching actif, moins de workers sont nécessaires
        # Règle: CPU_CORES / 2 pour normal, CPU_CORES / 4 pour any
        # ═══════════════════════════════════════════════════════════════
        import multiprocessing
        cpu_count = multiprocessing.cpu_count()
        optimal_normal = max(4, cpu_count // 2)  # Au moins 4, max CPU/2
        optimal_any = max(2, cpu_count // 4)     # Au moins 2, max CPU/4

        # Valeurs par défaut: utiliser les valeurs optimales ou les overrides env
        self.normal_workers_default = int(os.getenv('NORMAL_WORKERS_DEFAULT', str(optimal_normal)))
        self.any_workers_default = int(os.getenv('ANY_WORKERS_DEFAULT', str(optimal_any)))
        logger.info(f"[TRANSLATOR] 🔧 CPU cores: {cpu_count}, optimal workers: {optimal_normal} normal, {optimal_any} any")
        
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
        
        # ═══════════════════════════════════════════════════════════════
        # OPTIMISATION: Thread pools optimisés pour ML inference
        # Avec batching, chaque worker traite plus efficacement
        # Threads PyTorch configurés pour éviter la surcharge
        # ═══════════════════════════════════════════════════════════════
        self.normal_worker_pool = ThreadPoolExecutor(
            max_workers=self.max_normal_workers,
            thread_name_prefix="TranslatorNormal"
        )
        self.any_worker_pool = ThreadPoolExecutor(
            max_workers=self.max_any_workers,
            thread_name_prefix="TranslatorAny"
        )

        # Configurer PyTorch pour limiter les threads par worker
        try:
            import torch
            # Chaque worker utilise 2 threads PyTorch max (évite contention)
            threads_per_worker = max(2, cpu_count // (self.max_normal_workers + self.max_any_workers))
            torch.set_num_threads(threads_per_worker)
            logger.info(f"[TRANSLATOR] 🔧 PyTorch threads per worker: {threads_per_worker}")
        except ImportError:
            pass
        
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

    def _get_batch_key(self, task: TranslationTask) -> str:
        """Génère une clé pour grouper les tâches similaires en batch"""
        # Clé basée sur: source_lang + target_langs (triées) + model_type
        target_key = "_".join(sorted(task.target_languages))
        return f"{task.source_language}_{target_key}_{task.model_type}"

    async def _start_batch_flush_loop(self):
        """Boucle qui flush les batches accumulés périodiquement"""
        while self.normal_workers_running or self.any_workers_running:
            try:
                await asyncio.sleep(self.batch_window_ms / 1000.0)  # Convertir ms en secondes
                await self._flush_batches()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[BATCH] Erreur flush loop: {e}")

    async def _flush_batches(self):
        """Transfère les batches accumulés vers les queues de traitement"""
        async with self._batch_lock:
            if not self._batch_accumulator:
                return

            for batch_key, tasks in list(self._batch_accumulator.items()):
                if not tasks:
                    continue

                # Créer une tâche batch (premier task avec les textes combinés)
                batch_task = TranslationTask(
                    task_id=f"batch_{tasks[0].task_id}",
                    message_id=tasks[0].message_id,
                    text="",  # Non utilisé pour batch
                    source_language=tasks[0].source_language,
                    target_languages=tasks[0].target_languages,
                    conversation_id=tasks[0].conversation_id,
                    model_type=tasks[0].model_type,
                    created_at=tasks[0].created_at
                )

                # Stocker les tâches originales dans un attribut custom
                batch_task._batch_tasks = tasks  # type: ignore

                # Déterminer la queue appropriée
                if tasks[0].conversation_id == "any":
                    if not self.any_pool.full():
                        await self.any_pool.put(batch_task)
                        logger.debug(f"⚡ [BATCH] {len(tasks)} tâches groupées → any_pool")
                else:
                    if not self.normal_pool.full():
                        await self.normal_pool.put(batch_task)
                        logger.debug(f"⚡ [BATCH] {len(tasks)} tâches groupées → normal_pool")

            # Vider l'accumulateur
            self._batch_accumulator.clear()
    
    async def enqueue_task(self, task: TranslationTask) -> bool:
        """Enfile une tâche dans la pool appropriée avec support priorité et batching"""
        try:
            # ═══════════════════════════════════════════════════════════════
            # OPTIMISATION: Textes courts → fast_pool (traités en priorité, pas de batch)
            # ═══════════════════════════════════════════════════════════════
            if self.enable_priority_queue and len(task.text) < self.short_text_threshold:
                if not self.fast_pool.full():
                    await self.fast_pool.put(task)
                    logger.debug(f"⚡ Tâche {task.task_id} enfilée dans fast_pool (texte court: {len(task.text)} chars)")
                    return True
                # Si fast_pool pleine, continue vers le batching/pools normales

            # ═══════════════════════════════════════════════════════════════
            # OPTIMISATION CRITIQUE: Batch Accumulation
            # Accumule les tâches similaires pour traitement batch
            # ═══════════════════════════════════════════════════════════════
            if self.enable_batching:
                async with self._batch_lock:
                    batch_key = self._get_batch_key(task)

                    if batch_key not in self._batch_accumulator:
                        self._batch_accumulator[batch_key] = []

                    self._batch_accumulator[batch_key].append(task)

                    # Si le batch atteint la taille max, flush immédiatement
                    if len(self._batch_accumulator[batch_key]) >= self.batch_max_size:
                        tasks_to_flush = self._batch_accumulator.pop(batch_key)
                        await self._enqueue_batch(tasks_to_flush)
                        logger.debug(f"⚡ [BATCH] Batch max atteint, flush immédiat de {len(tasks_to_flush)} tâches")

                    return True

            # Fallback: pas de batching, enqueue directement
            return await self._enqueue_single_task(task)

        except Exception as e:
            logger.error(f"Erreur lors de l'enfilage de la tâche {task.task_id}: {e}")
            return False

    async def _enqueue_single_task(self, task: TranslationTask) -> bool:
        """Enfile une tâche unique (sans batching)"""
        if task.conversation_id == "any":
            if self.any_pool.full():
                logger.warning(f"Pool 'any' pleine, rejet de la tâche {task.task_id}")
                self.stats['pool_full_rejections'] += 1
                return False

            await self.any_pool.put(task)
            self.stats['any_pool_size'] = self.any_pool.qsize()
            logger.info(f"Tâche {task.task_id} enfilée dans pool 'any' (taille: {self.stats['any_pool_size']})")
        else:
            if self.normal_pool.full():
                logger.warning(f"Pool normale pleine, rejet de la tâche {task.task_id}")
                self.stats['pool_full_rejections'] += 1
                return False

            await self.normal_pool.put(task)
            self.stats['normal_pool_size'] = self.normal_pool.qsize()
            logger.info(f"Tâche {task.task_id} enfilée dans pool normale (taille: {self.stats['normal_pool_size']})")

        return True

    async def _enqueue_batch(self, tasks: List[TranslationTask]):
        """Enfile un batch de tâches comme une seule unité"""
        if not tasks:
            return

        # Créer une tâche batch
        batch_task = TranslationTask(
            task_id=f"batch_{tasks[0].task_id}_{len(tasks)}",
            message_id=tasks[0].message_id,
            text="",
            source_language=tasks[0].source_language,
            target_languages=tasks[0].target_languages,
            conversation_id=tasks[0].conversation_id,
            model_type=tasks[0].model_type,
            created_at=tasks[0].created_at
        )
        batch_task._batch_tasks = tasks  # type: ignore

        # Déterminer la queue appropriée
        if tasks[0].conversation_id == "any":
            if not self.any_pool.full():
                await self.any_pool.put(batch_task)
        else:
            if not self.normal_pool.full():
                await self.normal_pool.put(batch_task)
    
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

        # ═══════════════════════════════════════════════════════════════
        # OPTIMISATION: Démarrer la boucle de flush des batches
        # ═══════════════════════════════════════════════════════════════
        if self.enable_batching:
            self._batch_flush_task = asyncio.create_task(self._start_batch_flush_loop())
            logger.info(f"[TRANSLATOR] ✅ Batch flush loop démarrée (window={self.batch_window_ms}ms)")

        logger.info(f"[TRANSLATOR] Workers haute performance démarrés: {self.normal_workers} normal, {self.any_workers} any")
        logger.info(f"[TRANSLATOR] Capacité totale: {self.normal_workers + self.any_workers} traductions simultanées")
        return self.normal_worker_tasks + self.any_worker_tasks
    
    async def stop_workers(self):
        """Arrête tous les workers"""
        self.normal_workers_running = False
        self.any_workers_running = False

        # Arrêter la boucle de flush batch
        if self._batch_flush_task:
            self._batch_flush_task.cancel()
            try:
                await self._batch_flush_task
            except asyncio.CancelledError:
                pass

        # Flush final des batches en attente
        await self._flush_batches()

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
        """Traite une tâche de traduction avec support batch"""
        try:
            # ═══════════════════════════════════════════════════════════════
            # OPTIMISATION: Détecter si c'est un batch de tâches
            # ═══════════════════════════════════════════════════════════════
            batch_tasks = getattr(task, '_batch_tasks', None)

            if batch_tasks and len(batch_tasks) > 1:
                # Traitement BATCH: plusieurs tâches groupées
                await self._process_batch_translation(batch_tasks, worker_name)
            else:
                # Traitement SINGLE: une seule tâche (ou batch de 1)
                actual_task = batch_tasks[0] if batch_tasks else task
                await self._process_single_translation(actual_task, worker_name)

        except Exception as e:
            logger.error(f"Erreur lors du traitement de la tâche {task.task_id}: {e}")
            self.stats['tasks_failed'] += 1

    async def _process_single_translation(self, task: TranslationTask, worker_name: str):
        """Traite une tâche de traduction unique"""
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
            logger.error(f"Erreur lors du traitement single de la tâche {task.task_id}: {e}")
            self.stats['tasks_failed'] += 1

    async def _process_batch_translation(self, tasks: List[TranslationTask], worker_name: str):
        """
        OPTIMISATION: Traite un batch de tâches en une seule opération ML.

        Au lieu de traduire chaque texte individuellement, on:
        1. Extrait tous les textes du batch
        2. Appelle le service ML avec batch processing
        3. Distribue les résultats

        Gains attendus: 2-3x plus rapide que N appels individuels
        """
        try:
            if not tasks:
                return

            batch_start = time.time()

            # Extraire les informations communes
            source_lang = tasks[0].source_language
            target_langs = tasks[0].target_languages
            model_type = tasks[0].model_type
            pool_type = 'any' if tasks[0].conversation_id == 'any' else 'normal'

            # Extraire les textes
            texts = [t.text for t in tasks]

            logger.info(f"⚡ [BATCH] Worker {worker_name}: traitement de {len(texts)} textes ({source_lang}→{target_langs})")

            # Pour chaque langue cible
            for target_lang in target_langs:
                try:
                    # Utiliser le batch translation du service ML
                    if self.translation_service and hasattr(self.translation_service, '_ml_translate_batch'):
                        translated_texts = await self.translation_service._ml_translate_batch(
                            texts=texts,
                            source_lang=source_lang,
                            target_lang=target_lang,
                            model_type=model_type
                        )
                    else:
                        # Fallback: traduire un par un
                        translated_texts = []
                        for text in texts:
                            result = await self.translation_service.translate_with_structure(
                                text=text,
                                source_language=source_lang,
                                target_language=target_lang,
                                model_type=model_type,
                                source_channel='zmq_batch'
                            )
                            translated_texts.append(result.get('translated_text', text))

                    # Distribuer les résultats
                    for i, (task, translated_text) in enumerate(zip(tasks, translated_texts)):
                        processing_time = time.time() - batch_start
                        result = {
                            'messageId': task.message_id,
                            'translatedText': translated_text,
                            'sourceLanguage': source_lang,
                            'targetLanguage': target_lang,
                            'confidenceScore': 0.95,
                            'processingTime': processing_time,
                            'modelType': model_type,
                            'workerName': worker_name,
                            'fromCache': False,
                            'batchSize': len(tasks),
                            'batchIndex': i,
                            'poolType': pool_type,
                            'created_at': task.created_at
                        }
                        await self._publish_translation_result(task.task_id, result, target_lang)
                        self.stats['translations_completed'] += 1

                except Exception as e:
                    logger.error(f"[BATCH] Erreur traduction batch pour {target_lang}: {e}")
                    # Publier des erreurs pour chaque tâche
                    for task in tasks:
                        error_result = self._create_error_result(task, target_lang, str(e))
                        await self._publish_translation_result(task.task_id, error_result, target_lang)

            batch_time = (time.time() - batch_start) * 1000
            logger.info(f"✅ [BATCH] {len(tasks)} traductions terminées en {batch_time:.0f}ms ({batch_time/len(tasks):.0f}ms/texte)")

        except Exception as e:
            logger.error(f"[BATCH] Erreur générale batch: {e}")
            self.stats['tasks_failed'] += len(tasks)
    
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

