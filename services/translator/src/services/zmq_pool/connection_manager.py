"""
Connection Manager - Gestion des connexions, queues et batching

Responsabilités:
- Gestion des queues de traduction (normal, any, fast)
- Batch accumulation pour traitement optimisé
- Enqueue logic et priorités
- Queue statistics et monitoring
"""

import asyncio
import logging
import os
from typing import Awaitable, Callable, Dict, List, Optional, Tuple
from collections import defaultdict

# Import local
from ..zmq_models import TranslationTask
from ..task_privacy import is_live_call_caption

logger = logging.getLogger(__name__)

RejectedTasksHandler = Callable[[List[TranslationTask]], Awaitable[None]]


class SignalingQueue(asyncio.Queue):
    """
    #16780 — une file qui lève le drapeau partagé « du travail est arrivé » à
    chaque dépôt. Les workers attendent ce drapeau, jamais un `get()` : un
    `Event.wait()` annulé ne consomme rien, là où un `get()` perdant d'un
    `asyncio.wait` sur deux files peut avoir déjà retiré son élément.
    `Queue.put` dépose par `put_nowait` : surcharger ce seul point couvre les deux.
    """

    def __init__(self, maxsize: int, work_arrived: asyncio.Event):
        super().__init__(maxsize=maxsize)
        self._work_arrived = work_arrived

    def put_nowait(self, item) -> None:
        super().put_nowait(item)
        self._work_arrived.set()


DEFAULT_FAST_LANE_BURST = 8


def fast_lane_burst_from_env() -> int:
    """#16782 — `TRANSLATOR_FAST_LANE_BURST` : un entier ≥ 1, sinon le défaut."""
    raw = os.getenv("TRANSLATOR_FAST_LANE_BURST")
    if raw is None:
        return DEFAULT_FAST_LANE_BURST
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value >= 1:
        return value
    logger.warning(
        f"[TRANSLATOR] Invalid TRANSLATOR_FAST_LANE_BURST={raw!r}, "
        f"using {DEFAULT_FAST_LANE_BURST}"
    )
    return DEFAULT_FAST_LANE_BURST


class FastLaneBurst:
    """
    #16782 — l'état de rafale d'UN worker : combien de tâches rapides il a
    prises d'affilée pendant que ses files régulières attendaient. À `limit`,
    sa prochaine prise sert d'abord les files régulières. Propre au worker,
    donc jamais disputé.
    """

    def __init__(self, limit: int):
        self.limit = limit
        self.consecutive = 0

    def exhausted(self) -> bool:
        return self.consecutive >= self.limit

    def record(self, took_fast: bool, regular_waiting: bool) -> None:
        self.consecutive = self.consecutive + 1 if took_fast and regular_waiting else 0


def _take_in_order(queues: Tuple[asyncio.Queue, ...]) -> Optional[Tuple[int, TranslationTask]]:
    for index, queue in enumerate(queues):
        try:
            return index, queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
    return None


def _take_with_burst(
    queues: Tuple[asyncio.Queue, ...],
    burst: FastLaneBurst
) -> Optional[TranslationTask]:
    fast, regular = queues[:1], queues[1:]
    if burst.exhausted():
        taken = _take_in_order(regular)
        if taken is not None:
            burst.record(took_fast=False, regular_waiting=True)
            return taken[1]
    taken = _take_in_order(queues)
    if taken is None:
        return None
    index, task = taken
    burst.record(took_fast=index == 0, regular_waiting=any(not q.empty() for q in regular))
    return task


async def take_next_task(
    queues: Tuple[asyncio.Queue, ...],
    work_arrived: asyncio.Event,
    timeout: float,
    burst: Optional[FastLaneBurst] = None
) -> Optional[TranslationTask]:
    """
    Prend la première tâche disponible dans `queues`, DANS L'ORDRE (la voie
    rapide d'abord), en attendant au plus `timeout` secondes qu'une arrive.

    Le drapeau est baissé AVANT de regarder les files, sans `await` entre les
    deux : un dépôt postérieur le relève donc forcément, et aucun réveil ne se
    perd. Un réveil pour rien (un autre worker a pris la tâche, ou elle est
    tombée dans une file que ce worker ne sert pas) ne fait que reboucler.

    #16782 — avec `burst`, après `burst.limit` tâches rapides prises d'affilée
    pendant que les files régulières attendaient, la prise suivante sert
    d'abord ces dernières. Sans `burst`, l'ordre reste strict.
    """
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        work_arrived.clear()
        if burst is None:
            taken = _take_in_order(queues)
            task = taken[1] if taken is not None else None
        else:
            task = _take_with_burst(queues, burst)
        if task is not None:
            return task
        remaining = deadline - loop.time()
        if remaining <= 0:
            return None
        try:
            await asyncio.wait_for(work_arrived.wait(), timeout=remaining)
        except asyncio.TimeoutError:
            pass


class ConnectionManager:
    """
    Gestionnaire des connexions et queues de traduction

    Features:
    - Pools FIFO séparées (normal, any, fast)
    - Batch accumulation pour gains de performance 2-3x
    - Priority queue pour textes courts
    - Statistics et monitoring
    """

    def __init__(
        self,
        normal_pool_size: int = 10000,
        any_pool_size: int = 10000,
        fast_pool_size: int = 5000,
        on_tasks_rejected: Optional[RejectedTasksHandler] = None
    ):
        """
        Initialize connection manager

        Args:
            normal_pool_size: Taille max de la pool normale
            any_pool_size: Taille max de la pool "any"
            fast_pool_size: Taille max de la fast pool (textes courts)
            on_tasks_rejected: rappel des tâches d'un lot refusé par une file
                pleine (#16781). Sans rappel, le refus est compté et journalisé.
        """
        self.on_tasks_rejected = on_tasks_rejected
        # Queues FIFO, toutes reliées au même drapeau « du travail est arrivé » (#16780)
        self.work_arrived = asyncio.Event()
        self.normal_pool = SignalingQueue(normal_pool_size, self.work_arrived)
        self.any_pool = SignalingQueue(any_pool_size, self.work_arrived)
        self.fast_pool = SignalingQueue(fast_pool_size, self.work_arrived)

        # Configuration batch accumulation
        self.enable_batching = os.getenv("TRANSLATOR_BATCH_ENABLED", "true").lower() == "true"
        self.batch_window_ms = int(os.getenv("BATCH_WINDOW_MS", "50"))
        self.batch_max_size = int(os.getenv("BATCH_MAX_SIZE", "10"))

        # Batch accumulator: key -> list of tasks
        self._batch_accumulator: Dict[str, List[TranslationTask]] = {}
        self._batch_lock = asyncio.Lock()
        self._batch_flush_task: Optional[asyncio.Task] = None

        # Priority queue configuration
        PERFORMANCE_MODULE_AVAILABLE = False
        try:
            from utils.performance import Priority, PerformanceConfig
            PERFORMANCE_MODULE_AVAILABLE = True
        except ImportError:  # pragma: no cover
            pass

        self.enable_priority_queue = (
            PERFORMANCE_MODULE_AVAILABLE and
            os.getenv("TRANSLATOR_PRIORITY_QUEUE", "true").lower() == "true"
        )
        self.short_text_threshold = int(os.getenv("TRANSLATOR_SHORT_TEXT_THRESHOLD", "100"))
        self.fast_lane_burst = fast_lane_burst_from_env()

        # Statistics
        self.stats = {
            'normal_pool_size': 0,
            'any_pool_size': 0,
            'fast_pool_size': 0,
            'pool_full_rejections': 0,
            'batches_created': 0,
            'fast_track_count': 0,
            'caption_fast_lane_overflow': 0
        }

        logger.info(
            f"[CONNECTION] ConnectionManager initialized: "
            f"normal_pool({normal_pool_size}), any_pool({any_pool_size}), "
            f"fast_pool({fast_pool_size})"
        )
        logger.info(
            f"[CONNECTION] Batch processing: enabled={self.enable_batching}, "
            f"window={self.batch_window_ms}ms, max_size={self.batch_max_size}, "
            f"fast_lane_burst={self.fast_lane_burst}"
        )

    async def start(self):
        """Démarre les services de connexion (batch flush loop)"""
        if self.enable_batching:
            self._batch_flush_task = asyncio.create_task(self._batch_flush_loop())
            logger.info(
                f"[CONNECTION] Batch flush loop started (window={self.batch_window_ms}ms)"
            )

    async def stop(self):
        """Arrête les services de connexion"""
        # Arrêter la boucle de flush
        if self._batch_flush_task:
            self._batch_flush_task.cancel()
            try:
                await self._batch_flush_task
            except asyncio.CancelledError:
                pass

        # Flush final des batches en attente
        await self._flush_batches()
        logger.info("[CONNECTION] Connection manager stopped")

    async def enqueue_task(self, task: TranslationTask) -> bool:
        """
        Enfile une tâche dans la pool appropriée avec support priorité et batching

        Args:
            task: Tâche de traduction à enqueuer

        Returns:
            True si enfilée avec succès, False sinon
        """
        try:
            if is_live_call_caption(task.message_id):
                return await self._enqueue_live_caption(task)

            # ════════════════════════════════════════════════════════════════
            # OPTIMISATION: Textes courts → fast_pool (traités en priorité)
            # ════════════════════════════════════════════════════════════════
            if self.enable_priority_queue and len(task.text) < self.short_text_threshold:
                if not self.fast_pool.full():
                    await self.fast_pool.put(task)
                    self.stats['fast_pool_size'] = self.fast_pool.qsize()
                    self.stats['fast_track_count'] += 1
                    logger.debug(
                        f"⚡ Task {task.task_id} queued in fast_pool "
                        f"(short text: {len(task.text)} chars)"
                    )
                    return True

            # ════════════════════════════════════════════════════════════════
            # OPTIMISATION: Batch Accumulation
            # Accumule les tâches similaires pour traitement batch
            # ════════════════════════════════════════════════════════════════
            if self.enable_batching:
                async with self._batch_lock:
                    batch_key = self._get_batch_key(task)

                    if batch_key not in self._batch_accumulator:
                        self._batch_accumulator[batch_key] = []

                    self._batch_accumulator[batch_key].append(task)

                    # Flush immédiat si batch max atteint
                    rejected: List[TranslationTask] = []
                    if len(self._batch_accumulator[batch_key]) >= self.batch_max_size:
                        tasks_to_flush = self._batch_accumulator.pop(batch_key)
                        if not await self._enqueue_batch(tasks_to_flush):
                            rejected = tasks_to_flush
                        logger.debug(
                            f"⚡ [BATCH] Max size reached, immediate flush of "
                            f"{len(tasks_to_flush)} tasks"
                        )

                # #16781 — une tâche entrée dans l'accumulateur est ACCEPTÉE :
                # son éventuel refus se dit par le rappel, jamais par ce retour,
                # sinon la tâche déclenchante serait signalée deux fois.
                await self._report_rejected(rejected)
                return True

            # Fallback: pas de batching, enqueue directement
            return await self._enqueue_single_task(task)

        except Exception as e:
            logger.error(f"Error enqueueing task {task.task_id}: {e}")
            return False

    async def _enqueue_live_caption(self, task: TranslationTask) -> bool:
        """
        #16780 — un sous-titre d'appel se lit pendant qu'on parle : voie rapide
        quelle que soit sa longueur, sans `utils.performance`, jamais en lot.
        Voie rapide pleine : la file régulière directe, dont le refus se dit,
        et le débordement se compte (#16783).
        """
        if self.fast_pool.full():
            self.stats['caption_fast_lane_overflow'] += 1
            logger.debug(f"[TRANSLATOR] Fast lane full, caption {task.task_id} overflows to regular pool")
            return await self._enqueue_single_task(task)
        await self.fast_pool.put(task)
        self.stats['fast_pool_size'] = self.fast_pool.qsize()
        self.stats['fast_track_count'] += 1
        return True

    async def _enqueue_single_task(self, task: TranslationTask) -> bool:
        """Enfile une tâche unique (sans batching)"""
        if task.conversation_id == "any":
            if self.any_pool.full():
                logger.warning(f"Any pool full, rejecting task {task.task_id}")
                self.stats['pool_full_rejections'] += 1
                return False

            await self.any_pool.put(task)
            self.stats['any_pool_size'] = self.any_pool.qsize()
            logger.debug(
                f"Task {task.task_id} queued in any pool (size: {self.stats['any_pool_size']})"
            )
        else:
            if self.normal_pool.full():
                logger.warning(f"Normal pool full, rejecting task {task.task_id}")
                self.stats['pool_full_rejections'] += 1
                return False

            await self.normal_pool.put(task)
            self.stats['normal_pool_size'] = self.normal_pool.qsize()
            logger.debug(
                f"Task {task.task_id} queued in normal pool "
                f"(size: {self.stats['normal_pool_size']})"
            )

        return True

    async def _enqueue_batch(self, tasks: List[TranslationTask]) -> bool:
        """
        Enfile un batch de tâches comme une seule unité.

        Returns:
            False si la file est pleine : le lot est compté (une rejection par
            tâche) et journalisé par ses task_id, jamais par son texte (#16781).
        """
        if not tasks:
            return True

        # Créer une tâche batch
        batch_task = TranslationTask(
            task_id=f"batch_{tasks[0].task_id}_{len(tasks)}",
            message_id=tasks[0].message_id,
            text="",  # Non utilisé pour batch
            source_language=tasks[0].source_language,
            target_languages=tasks[0].target_languages,
            conversation_id=tasks[0].conversation_id,
            model_type=tasks[0].model_type,
            created_at=tasks[0].created_at
        )

        # Stocker les tâches originales
        batch_task._batch_tasks = tasks  # type: ignore

        pool_name = "any" if tasks[0].conversation_id == "any" else "normal"
        pool = self.any_pool if pool_name == "any" else self.normal_pool
        if pool.full():
            self.stats['pool_full_rejections'] += len(tasks)
            logger.warning(
                f"[TRANSLATOR] {pool_name} pool full, rejecting batch of {len(tasks)} "
                f"tasks: {[t.task_id for t in tasks]}"
            )
            return False

        await pool.put(batch_task)
        self.stats['batches_created'] += 1
        return True

    async def _report_rejected(self, tasks: List[TranslationTask]) -> None:
        """Remet les tâches refusées au rappel, appelé HORS du verrou de lot ;
        un rappel qui lève est journalisé et n'interrompt rien."""
        if not tasks or self.on_tasks_rejected is None:
            return
        try:
            await self.on_tasks_rejected(tasks)
        except Exception as e:
            logger.error(
                f"[TRANSLATOR] Rejection callback failed for {len(tasks)} tasks "
                f"{[t.task_id for t in tasks]}: {type(e).__name__}"
            )

    def _get_batch_key(self, task: TranslationTask) -> str:
        """
        Génère une clé pour grouper les tâches similaires en batch

        Args:
            task: Tâche de traduction

        Returns:
            Clé unique pour ce type de tâche
        """
        # Clé: source_lang + target_langs (triées) + model_type
        target_key = "_".join(sorted(task.target_languages))
        return f"{task.source_language}_{target_key}_{task.model_type}"

    async def _batch_flush_loop(self):
        """Boucle qui flush les batches accumulés périodiquement"""
        while True:
            try:
                await asyncio.sleep(self.batch_window_ms / 1000.0)
                await self._flush_batches()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[BATCH] Flush loop error: {e}")

    async def _flush_batches(self):
        """Transfère les batches accumulés vers les queues de traitement"""
        rejected_batches: List[List[TranslationTask]] = []
        async with self._batch_lock:
            if not self._batch_accumulator:
                return

            for batch_key, tasks in list(self._batch_accumulator.items()):
                if not tasks:
                    continue

                if not await self._enqueue_batch(tasks):
                    rejected_batches.append(tasks)
                    continue
                logger.debug(
                    f"⚡ [BATCH] Flushed {len(tasks)} tasks to "
                    f"{'any' if tasks[0].conversation_id == 'any' else 'normal'} pool"
                )

            # Vider l'accumulateur
            self._batch_accumulator.clear()

        for tasks in rejected_batches:
            await self._report_rejected(tasks)

    def get_stats(self) -> dict:
        """Retourne les statistiques des connexions"""
        return {
            **self.stats,
            'normal_pool_size': self.normal_pool.qsize(),
            'any_pool_size': self.any_pool.qsize(),
            'fast_pool_size': self.fast_pool.qsize(),
            'pending_batches': sum(len(tasks) for tasks in self._batch_accumulator.values())
        }
