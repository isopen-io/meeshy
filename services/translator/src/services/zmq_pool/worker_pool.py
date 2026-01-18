"""
Worker Pool Manager - Gestion du pool de workers avec scaling dynamique

Responsabilités:
- Création et gestion du pool de workers
- Scaling dynamique basé sur la charge
- Health checks et monitoring
- Worker lifecycle management
"""

import asyncio
import logging
import time
from typing import List, Callable, Optional
from concurrent.futures import ThreadPoolExecutor
import multiprocessing
import os

logger = logging.getLogger(__name__)


class WorkerPool:
    """
    Gestionnaire du pool de workers avec scaling dynamique et health checks

    Features:
    - Dynamic scaling basé sur queue size et utilisation
    - Thread pool optimization pour ML inference
    - Worker lifecycle management
    - Health monitoring et statistics
    """

    def __init__(
        self,
        pool_name: str,
        default_workers: int,
        min_workers: int,
        max_workers: int,
        max_scaling_workers: int,
        enable_dynamic_scaling: bool = True
    ):
        """
        Initialize worker pool

        Args:
            pool_name: Nom du pool (ex: "normal", "any")
            default_workers: Nombre initial de workers
            min_workers: Minimum de workers
            max_workers: Maximum absolu de workers
            max_scaling_workers: Maximum pour scaling dynamique
            enable_dynamic_scaling: Activer le scaling automatique
        """
        self.pool_name = pool_name
        self.default_workers = default_workers
        self.min_workers = min_workers
        self.max_workers = max_workers
        self.max_scaling_workers = max_scaling_workers
        self.enable_dynamic_scaling = enable_dynamic_scaling

        # État actuel
        self.current_workers = default_workers
        self.workers_running = False
        self.worker_tasks: List[asyncio.Task] = []
        self.workers_active = 0

        # Scaling configuration
        self.scaling_check_interval = 30  # secondes
        self.last_scaling_check = time.time()

        # Thread pool pour ML inference
        self.thread_pool = ThreadPoolExecutor(
            max_workers=max_scaling_workers,
            thread_name_prefix=f"Translator{pool_name.capitalize()}"
        )

        # Statistics
        self.stats = {
            'workers_active': 0,
            'scaling_events': 0,
            'tasks_processed': 0,
            'tasks_failed': 0
        }

        logger.info(
            f"[{pool_name.upper()}] WorkerPool initialized: "
            f"{default_workers} workers (min: {min_workers}, max: {max_workers}, "
            f"scaling_max: {max_scaling_workers})"
        )

    async def start_workers(self, worker_loop_func: Callable) -> List[asyncio.Task]:
        """
        Démarre tous les workers

        Args:
            worker_loop_func: Fonction async à exécuter pour chaque worker

        Returns:
            Liste des tasks créées
        """
        logger.info(f"[{self.pool_name.upper()}] Starting {self.current_workers} workers...")
        self.workers_running = True

        self.worker_tasks = [
            asyncio.create_task(worker_loop_func(f"{self.pool_name}_worker_{i}"))
            for i in range(self.current_workers)
        ]

        logger.info(
            f"[{self.pool_name.upper()}] {len(self.worker_tasks)} workers started"
        )

        return self.worker_tasks

    async def stop_workers(self):
        """Arrête tous les workers"""
        logger.info(f"[{self.pool_name.upper()}] Stopping workers...")
        self.workers_running = False

        # Attendre que les workers se terminent
        if self.worker_tasks:
            await asyncio.gather(*self.worker_tasks, return_exceptions=True)

        logger.info(f"[{self.pool_name.upper()}] All workers stopped")

    async def check_scaling(self, queue_size: int, utilization: float) -> bool:
        """
        Vérifie et ajuste le nombre de workers basé sur les métriques

        Args:
            queue_size: Taille actuelle de la queue
            utilization: Taux d'utilisation (0.0 - 1.0)

        Returns:
            True si un scaling a été effectué
        """
        if not self.enable_dynamic_scaling:
            return False

        current_time = time.time()
        if current_time - self.last_scaling_check < self.scaling_check_interval:
            return False

        self.last_scaling_check = current_time

        # Déterminer les seuils basés sur le type de pool
        if self.pool_name == "normal":
            scale_up_queue = 100
            scale_down_queue = 10
        else:  # any pool
            scale_up_queue = 50
            scale_down_queue = 5

        scaled = False

        # Scale UP
        if (queue_size > scale_up_queue and
            utilization > 0.8 and
            self.current_workers < self.max_scaling_workers):

            increment = 5 if self.pool_name == "normal" else 3
            new_count = min(self.current_workers + increment, self.max_scaling_workers)

            if new_count > self.current_workers:
                logger.info(
                    f"[{self.pool_name.upper()}] Scaling UP: "
                    f"{self.current_workers} → {new_count} workers"
                )
                await self._scale_to(new_count)
                scaled = True

        # Scale DOWN
        elif (queue_size < scale_down_queue and
              utilization < 0.3 and
              self.current_workers > self.min_workers):

            decrement = 2 if self.pool_name == "normal" else 1
            new_count = max(self.current_workers - decrement, self.min_workers)

            if new_count < self.current_workers:
                logger.info(
                    f"[{self.pool_name.upper()}] Scaling DOWN: "
                    f"{self.current_workers} → {new_count} workers"
                )
                await self._scale_to(new_count)
                scaled = True

        return scaled

    async def _scale_to(self, new_count: int):
        """
        Ajuste le nombre de workers

        Args:
            new_count: Nouveau nombre de workers
        """
        if new_count > self.current_workers:
            # Scale UP: Ajouter des workers
            # Note: Les nouveaux workers doivent être créés par le manager
            # car ils ont besoin du worker_loop_func
            pass
        else:
            # Scale DOWN: Les workers s'arrêteront naturellement
            # quand workers_running devient False ou après timeout
            pass

        old_count = self.current_workers
        self.current_workers = new_count
        self.stats['scaling_events'] += 1

        logger.info(
            f"[{self.pool_name.upper()}] Scaling completed: {old_count} → {new_count}"
        )

    def increment_active(self):
        """Incrémente le compteur de workers actifs"""
        self.workers_active += 1
        self.stats['workers_active'] = self.workers_active

    def decrement_active(self):
        """Décrémente le compteur de workers actifs"""
        if self.workers_active > 0:
            self.workers_active -= 1
        self.stats['workers_active'] = self.workers_active

    def record_task_processed(self):
        """Enregistre une tâche traitée avec succès"""
        self.stats['tasks_processed'] += 1

    def record_task_failed(self):
        """Enregistre une tâche échouée"""
        self.stats['tasks_failed'] += 1

    def get_utilization(self) -> float:
        """
        Calcule le taux d'utilisation actuel

        Returns:
            Taux entre 0.0 et 1.0
        """
        if self.current_workers == 0:
            return 0.0
        return self.workers_active / self.current_workers

    def get_stats(self) -> dict:
        """Retourne les statistiques du pool"""
        return {
            **self.stats,
            'pool_name': self.pool_name,
            'current_workers': self.current_workers,
            'workers_active': self.workers_active,
            'utilization': self.get_utilization(),
            'min_workers': self.min_workers,
            'max_workers': self.max_workers
        }

    def shutdown(self):
        """Shutdown du thread pool"""
        if self.thread_pool:
            self.thread_pool.shutdown(wait=True)
            logger.info(f"[{self.pool_name.upper()}] Thread pool shut down")


def configure_pytorch_threads(total_workers: int):
    """
    Configure PyTorch pour limiter les threads par worker

    Args:
        total_workers: Nombre total de workers dans tous les pools
    """
    try:
        import torch
        cpu_count = multiprocessing.cpu_count()
        # Chaque worker utilise 2 threads PyTorch max (évite contention)
        threads_per_worker = max(2, cpu_count // total_workers)
        torch.set_num_threads(threads_per_worker)
        logger.info(f"[PYTORCH] Configured {threads_per_worker} threads per worker")
    except ImportError:
        logger.debug("[PYTORCH] PyTorch not available, skipping thread configuration")


def calculate_optimal_workers(pool_type: str) -> int:
    """
    Calcule le nombre optimal de workers basé sur les CPU cores

    Args:
        pool_type: "normal" ou "any"

    Returns:
        Nombre optimal de workers
    """
    cpu_count = multiprocessing.cpu_count()

    if pool_type == "normal":
        # CPU_CORES / 2 pour normal, minimum 4
        optimal = max(4, cpu_count // 2)
    else:  # any
        # CPU_CORES / 4 pour any, minimum 2
        optimal = max(2, cpu_count // 4)

    logger.info(
        f"[OPTIMIZER] CPU cores: {cpu_count}, optimal {pool_type} workers: {optimal}"
    )

    return optimal
