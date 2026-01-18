"""
ZMQ Pool Manager - Façade orchestrateur pour le pool de traduction

Responsabilités:
- API publique du pool manager
- Orchestration des workers et connexions
- Traitement des tâches de traduction
- Monitoring et statistiques globales
"""

import asyncio
import logging
import time
import os
from typing import List, Optional

# Import optionnel de psutil
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

# Import des modules internes
from .worker_pool import WorkerPool, configure_pytorch_threads, calculate_optimal_workers
from .connection_manager import ConnectionManager

# Import local
from ..zmq_models import TranslationTask

# Import du cache Redis
CACHE_AVAILABLE = False
try:
    from ..redis_service import get_redis_service, get_translation_cache_service
    CACHE_AVAILABLE = True
except ImportError:
    pass

logger = logging.getLogger(__name__)


class TranslationPoolManager:
    """
    Gestionnaire des pools FIFO de traduction - Façade principale

    OPTIMISATIONS MULTI-UTILISATEURS:
    ═══════════════════════════════════════════════════════════════════════════
    1. BATCH ACCUMULATION: Accumule requêtes pendant 50ms → gains 2-3x throughput
    2. PIPELINE RÉUTILISABLE: Pipelines ML créés une fois par thread → économie 100-500ms
    3. PRIORITY QUEUE: Textes courts (<100 chars) traités en priorité via fast_pool
    4. DYNAMIC SCALING: Ajustement automatique du nombre de workers
    ═══════════════════════════════════════════════════════════════════════════

    Configuration via variables d'environnement:
    - BATCH_WINDOW_MS: Fenêtre d'accumulation (défaut: 50ms)
    - BATCH_MAX_SIZE: Taille max du batch (défaut: 10)
    - NORMAL_WORKERS_DEFAULT: Workers normaux (auto: CPU/2)
    - ANY_WORKERS_DEFAULT: Workers any (auto: CPU/4)
    """

    def __init__(
        self,
        normal_pool_size: int = 10000,
        any_pool_size: int = 10000,
        normal_workers: Optional[int] = None,
        any_workers: Optional[int] = None,
        translation_service=None,
        enable_dynamic_scaling: bool = True
    ):
        """
        Initialize Translation Pool Manager

        Args:
            normal_pool_size: Taille max de la pool normale
            any_pool_size: Taille max de la pool "any"
            normal_workers: Nombre de workers normaux (None = auto)
            any_workers: Nombre de workers any (None = auto)
            translation_service: Service de traduction ML
            enable_dynamic_scaling: Activer le scaling dynamique
        """
        self._start_time = time.time()

        # ═══════════════════════════════════════════════════════════════════
        # Configuration des workers avec optimisation CPU
        # ═══════════════════════════════════════════════════════════════════
        normal_workers_default = int(
            os.getenv('NORMAL_WORKERS_DEFAULT', str(calculate_optimal_workers("normal")))
        )
        any_workers_default = int(
            os.getenv('ANY_WORKERS_DEFAULT', str(calculate_optimal_workers("any")))
        )

        normal_workers_min = int(os.getenv('NORMAL_WORKERS_MIN', '2'))
        any_workers_min = int(os.getenv('ANY_WORKERS_MIN', '2'))

        normal_workers_max = int(os.getenv('NORMAL_WORKERS_MAX', '40'))
        any_workers_max = int(os.getenv('ANY_WORKERS_MAX', '20'))

        normal_workers_scaling_max = int(
            os.getenv('NORMAL_WORKERS_SCALING_MAX', str(normal_workers_max))
        )
        any_workers_scaling_max = int(
            os.getenv('ANY_WORKERS_SCALING_MAX', str(any_workers_max))
        )

        # Utiliser les valeurs fournies ou les defaults
        normal_workers = normal_workers if normal_workers is not None else normal_workers_default
        any_workers = any_workers if any_workers is not None else any_workers_default

        # Valider les limites
        normal_workers = max(normal_workers_min, min(normal_workers, normal_workers_max))
        any_workers = max(any_workers_min, min(any_workers, any_workers_max))

        # ═══════════════════════════════════════════════════════════════════
        # Initialisation des modules
        # ═══════════════════════════════════════════════════════════════════

        # Connection Manager (queues + batching)
        self.connection_manager = ConnectionManager(
            normal_pool_size=normal_pool_size,
            any_pool_size=any_pool_size,
            fast_pool_size=5000
        )

        # Worker Pools
        self.normal_pool = WorkerPool(
            pool_name="normal",
            default_workers=normal_workers,
            min_workers=normal_workers_min,
            max_workers=normal_workers_max,
            max_scaling_workers=normal_workers_scaling_max,
            enable_dynamic_scaling=enable_dynamic_scaling
        )

        self.any_pool = WorkerPool(
            pool_name="any",
            default_workers=any_workers,
            min_workers=any_workers_min,
            max_workers=any_workers_max,
            max_scaling_workers=any_workers_scaling_max,
            enable_dynamic_scaling=enable_dynamic_scaling
        )

        # Configuration PyTorch threads
        total_workers = normal_workers_scaling_max + any_workers_scaling_max
        configure_pytorch_threads(total_workers)

        # Service de traduction
        self.translation_service = translation_service

        # Service de cache Redis
        self.translation_cache = None
        self.redis_service = None
        if CACHE_AVAILABLE:
            self.redis_service = get_redis_service()
            self.translation_cache = get_translation_cache_service()
            logger.info("[POOL_MANAGER] Redis cache initialized for translations")

        # Statistiques globales
        self.stats = {
            'tasks_processed': 0,
            'tasks_failed': 0,
            'translations_completed': 0,
            'avg_processing_time': 0.0
        }

        logger.info(
            f"[POOL_MANAGER] TranslationPoolManager initialized: "
            f"normal({normal_workers}), any({any_workers})"
        )
        logger.info(
            f"[POOL_MANAGER] Dynamic scaling: {'enabled' if enable_dynamic_scaling else 'disabled'}"
        )

    async def enqueue_task(self, task: TranslationTask) -> bool:
        """
        Enfile une tâche dans la pool appropriée

        Args:
            task: Tâche de traduction

        Returns:
            True si enfilée avec succès
        """
        return await self.connection_manager.enqueue_task(task)

    async def start_workers(self) -> List[asyncio.Task]:
        """Démarre tous les workers et services"""
        logger.info("[POOL_MANAGER] Starting workers and services...")

        # Démarrer le connection manager (batch flush loop)
        await self.connection_manager.start()

        # Démarrer les worker pools
        normal_tasks = await self.normal_pool.start_workers(self._normal_worker_loop)
        any_tasks = await self.any_pool.start_workers(self._any_worker_loop)

        all_tasks = normal_tasks + any_tasks

        logger.info(
            f"[POOL_MANAGER] All workers started: {len(normal_tasks)} normal, "
            f"{len(any_tasks)} any"
        )
        logger.info(
            f"[POOL_MANAGER] Total capacity: {len(all_tasks)} simultaneous translations"
        )

        return all_tasks

    async def stop_workers(self):
        """Arrête tous les workers et services"""
        logger.info("[POOL_MANAGER] Stopping workers and services...")

        # Arrêter les worker pools
        await self.normal_pool.stop_workers()
        await self.any_pool.stop_workers()

        # Arrêter le connection manager
        await self.connection_manager.stop()

        logger.info("[POOL_MANAGER] All workers and services stopped")

    async def _normal_worker_loop(self, worker_name: str):
        """Boucle de travail pour les workers normaux"""
        logger.info(f"[WORKER] {worker_name} started")

        while self.normal_pool.workers_running:
            try:
                # Check dynamic scaling
                queue_size = self.connection_manager.normal_pool.qsize()
                utilization = self.normal_pool.get_utilization()
                await self.normal_pool.check_scaling(queue_size, utilization)

                # Récupérer une tâche (priorité fast_pool d'abord)
                task = await self._get_next_task(
                    self.connection_manager.fast_pool,
                    self.connection_manager.normal_pool
                )

                if task is None:
                    continue

                # Traiter la tâche
                self.normal_pool.increment_active()
                await self._process_task(task, worker_name)
                self.normal_pool.decrement_active()

            except Exception as e:
                logger.error(f"[WORKER] Error in {worker_name}: {e}")
                self.normal_pool.record_task_failed()
                self.normal_pool.decrement_active()

        logger.info(f"[WORKER] {worker_name} stopped")

    async def _any_worker_loop(self, worker_name: str):
        """Boucle de travail pour les workers any"""
        logger.info(f"[WORKER] {worker_name} started")

        while self.any_pool.workers_running:
            try:
                # Check dynamic scaling
                queue_size = self.connection_manager.any_pool.qsize()
                utilization = self.any_pool.get_utilization()
                await self.any_pool.check_scaling(queue_size, utilization)

                # Récupérer une tâche (priorité fast_pool d'abord)
                task = await self._get_next_task(
                    self.connection_manager.fast_pool,
                    self.connection_manager.any_pool
                )

                if task is None:
                    continue

                # Traiter la tâche
                self.any_pool.increment_active()
                await self._process_task(task, worker_name)
                self.any_pool.decrement_active()

            except Exception as e:
                logger.error(f"[WORKER] Error in {worker_name}: {e}")
                self.any_pool.record_task_failed()
                self.any_pool.decrement_active()

        logger.info(f"[WORKER] {worker_name} stopped")

    async def _get_next_task(
        self,
        fast_pool: asyncio.Queue,
        regular_pool: asyncio.Queue
    ) -> Optional[TranslationTask]:
        """
        Récupère la prochaine tâche (fast_pool en priorité)

        Args:
            fast_pool: Fast pool pour textes courts
            regular_pool: Pool régulière

        Returns:
            TranslationTask ou None si timeout
        """
        # Vérifier fast_pool d'abord (textes courts prioritaires)
        if not fast_pool.empty():
            try:
                task = fast_pool.get_nowait()
                logger.debug(f"⚡ Task from fast_pool")
                return task
            except asyncio.QueueEmpty:
                pass

        # Sinon attendre la pool régulière
        try:
            task = await asyncio.wait_for(regular_pool.get(), timeout=1.0)
            return task
        except asyncio.TimeoutError:
            return None

    async def _process_task(self, task: TranslationTask, worker_name: str):
        """
        Traite une tâche de traduction (batch ou single)

        Args:
            task: Tâche de traduction
            worker_name: Nom du worker
        """
        start_time = time.time()

        try:
            # Détecter si c'est un batch
            batch_tasks = getattr(task, '_batch_tasks', None)

            if batch_tasks and len(batch_tasks) > 1:
                # Traitement batch
                await self._process_batch_translation(batch_tasks, worker_name)
            else:
                # Traitement single
                actual_task = batch_tasks[0] if batch_tasks else task
                await self._process_single_translation(actual_task, worker_name)

            # Mettre à jour les statistiques
            processing_time = time.time() - start_time
            self.stats['tasks_processed'] += 1
            self.stats['avg_processing_time'] = (
                (self.stats['avg_processing_time'] * (self.stats['tasks_processed'] - 1) +
                 processing_time) / self.stats['tasks_processed']
            )

        except Exception as e:
            logger.error(f"Error processing task {task.task_id}: {e}")
            self.stats['tasks_failed'] += 1

    async def _process_single_translation(self, task: TranslationTask, worker_name: str):
        """Traite une tâche de traduction unique (délégué à translation processor)"""
        # Import dynamique pour éviter les dépendances circulaires
        from .translation_processor import process_single_translation

        results = await process_single_translation(
            task=task,
            worker_name=worker_name,
            translation_service=self.translation_service,
            translation_cache=self.translation_cache,
            publish_func=self._publish_translation_result
        )

        # Mettre à jour les stats
        self.stats['translations_completed'] += len(results)

    async def _process_batch_translation(
        self,
        tasks: List[TranslationTask],
        worker_name: str
    ):
        """Traite un batch de tâches (délégué à translation processor)"""
        # Import dynamique pour éviter les dépendances circulaires
        from .translation_processor import process_batch_translation

        results_count = await process_batch_translation(
            tasks=tasks,
            worker_name=worker_name,
            translation_service=self.translation_service,
            publish_func=self._publish_translation_result
        )

        # Mettre à jour les stats
        self.stats['translations_completed'] += results_count

    async def _publish_translation_result(self, task_id: str, result: dict, target_language: str):
        """
        Publie un résultat de traduction via PUB

        Note: Cette méthode sera remplacée par le serveur ZMQ principal

        Args:
            task_id: ID de la tâche
            result: Résultat de traduction
            target_language: Langue cible
        """
        # Cette méthode est un placeholder
        # Elle sera overridée par le ZMQ server
        pass

    def get_stats(self) -> dict:
        """Retourne les statistiques globales"""
        connection_stats = self.connection_manager.get_stats()
        normal_stats = self.normal_pool.get_stats()
        any_stats = self.any_pool.get_stats()

        stats_dict = {
            **self.stats,
            **connection_stats,
            'normal_pool': normal_stats,
            'any_pool': any_stats,
            'uptime_seconds': time.time() - self._start_time
        }

        # Ajouter memory usage si psutil disponible
        if PSUTIL_AVAILABLE:
            stats_dict['memory_usage_mb'] = psutil.Process().memory_info().rss / 1024 / 1024

        return stats_dict
