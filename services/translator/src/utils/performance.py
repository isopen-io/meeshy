"""
Performance optimization utilities for CPU and CUDA environments.
Provides batch processing, priority queuing, and PyTorch optimizations.
Works seamlessly on CPU-only machines (no GPU required).
"""

import os
import threading
import asyncio
import time
import gc
import platform
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple
from enum import IntEnum
import heapq
import logging

logger = logging.getLogger(__name__)

# Detect if running on ARM (Apple Silicon) or x86
IS_ARM = platform.machine().lower() in ('arm64', 'aarch64')
IS_MACOS = platform.system() == 'Darwin'


class Priority(IntEnum):
    """Translation priority levels based on text length."""
    HIGH = 1      # Short texts (< 100 chars)
    MEDIUM = 2    # Medium texts (100-500 chars)
    LOW = 3       # Long texts (> 500 chars)
    BULK = 4      # Batch/bulk operations


@dataclass
class PerformanceConfig:
    """Performance configuration loaded from environment variables."""

    # Batch processing settings
    batch_size: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_BATCH_SIZE", "8")))
    batch_timeout_ms: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_BATCH_TIMEOUT_MS", "50")))
    max_batch_tokens: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_MAX_BATCH_TOKENS", "4096")))

    # Priority queue settings
    enable_priority_queue: bool = field(default_factory=lambda: os.getenv("TRANSLATOR_PRIORITY_QUEUE", "true").lower() == "true")
    short_text_threshold: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_SHORT_TEXT_THRESHOLD", "100")))
    medium_text_threshold: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_MEDIUM_TEXT_THRESHOLD", "500")))

    # PyTorch optimization settings
    # Note: torch.compile on CPU can be slow - disabled by default for CPU-only
    enable_torch_compile: bool = field(default_factory=lambda: os.getenv("TRANSLATOR_TORCH_COMPILE", "false").lower() == "true")
    torch_compile_mode: str = field(default_factory=lambda: os.getenv("TRANSLATOR_COMPILE_MODE", "default"))
    enable_cudnn_benchmark: bool = field(default_factory=lambda: os.getenv("TRANSLATOR_CUDNN_BENCHMARK", "true").lower() == "true")

    # Thread/Process pool settings
    num_inference_workers: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_INFERENCE_WORKERS", "4")))
    use_process_pool: bool = field(default_factory=lambda: os.getenv("TRANSLATOR_USE_PROCESS_POOL", "false").lower() == "true")

    # Memory settings
    max_memory_fraction: float = field(default_factory=lambda: float(os.getenv("TRANSLATOR_MAX_MEMORY_FRACTION", "0.85")))
    enable_memory_cleanup: bool = field(default_factory=lambda: os.getenv("TRANSLATOR_MEMORY_CLEANUP", "true").lower() == "true")

    # CPU-specific settings
    num_omp_threads: int = field(default_factory=lambda: int(os.getenv("OMP_NUM_THREADS", str(os.cpu_count() or 4))))
    num_mkl_threads: int = field(default_factory=lambda: int(os.getenv("MKL_NUM_THREADS", str(os.cpu_count() or 4))))
    enable_cpu_optimization: bool = field(default_factory=lambda: os.getenv("TRANSLATOR_CPU_OPTIMIZATION", "true").lower() == "true")
    cpu_memory_cleanup_interval: int = field(default_factory=lambda: int(os.getenv("TRANSLATOR_CPU_CLEANUP_INTERVAL", "100")))  # Every N batches


class PerformanceOptimizer:
    """
    Singleton class for PyTorch performance optimizations.
    Configures CUDA, cuDNN, MPS (Apple Silicon), and CPU thread settings.
    Works on all platforms: Linux, macOS (Intel/ARM), Windows.
    """

    _instance: Optional["PerformanceOptimizer"] = None
    _lock = threading.Lock()
    _initialized = False

    def __new__(cls) -> "PerformanceOptimizer":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if PerformanceOptimizer._initialized:
            return

        self.config = PerformanceConfig()
        self._device: Optional[str] = None
        self._cuda_available = False
        self._mps_available = False  # Apple Metal Performance Shaders
        self._compiled_models: Dict[str, Any] = {}
        self._batch_counter = 0  # For periodic CPU memory cleanup

        PerformanceOptimizer._initialized = True

    def initialize(self) -> str:
        """
        Initialize PyTorch optimizations for available hardware.
        Supports: CUDA (NVIDIA), MPS (Apple Silicon), CPU.
        Returns the device string (cuda:0, mps, or cpu).
        """
        try:
            import torch
        except ImportError:
            logger.warning("PyTorch not available, using CPU fallback")
            self._device = "cpu"
            return self._device

        # Set thread optimizations (works for all platforms)
        self._configure_threads()

        # Detect and configure device (priority: CUDA > MPS > CPU)
        if torch.cuda.is_available():
            self._device = "cuda:0"
            self._cuda_available = True
            self._configure_cuda(torch)
            logger.info(f"✅ CUDA device initialized: {torch.cuda.get_device_name(0)}")
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            self._device = "mps"
            self._mps_available = True
            self._configure_mps(torch)
            logger.info("✅ MPS device initialized (Apple Silicon)")
        else:
            self._device = "cpu"
            self._configure_cpu(torch)
            logger.info(f"✅ Running on CPU ({os.cpu_count()} cores available)")

        # Configure general PyTorch optimizations
        self._configure_pytorch(torch)

        return self._device

    def _configure_threads(self) -> None:
        """Configure thread settings for all platforms (Linux, macOS, Windows)."""
        # Common thread settings for all platforms
        os.environ["OMP_NUM_THREADS"] = str(self.config.num_omp_threads)
        os.environ["MKL_NUM_THREADS"] = str(self.config.num_mkl_threads)
        os.environ["NUMEXPR_NUM_THREADS"] = str(self.config.num_omp_threads)

        # Disable OpenMP spinning for better multi-process performance
        os.environ["OMP_WAIT_POLICY"] = "PASSIVE"

        # Platform-specific optimizations
        if IS_MACOS:
            # macOS-specific: Accelerate framework uses Grand Central Dispatch
            os.environ.setdefault("VECLIB_MAXIMUM_THREADS", str(self.config.num_omp_threads))
            logger.debug(f"macOS threads configured: OMP={self.config.num_omp_threads}")
        else:
            # Linux-specific: NUMA awareness and memory management
            os.environ.setdefault("MALLOC_TRIM_THRESHOLD_", "0")
            logger.debug(f"Linux threads configured: OMP={self.config.num_omp_threads}, MKL={self.config.num_mkl_threads}")

    def _configure_cpu(self, torch) -> None:
        """Configure CPU-specific optimizations."""
        if not self.config.enable_cpu_optimization:
            logger.debug("CPU optimization disabled")
            return

        # Set number of threads for PyTorch
        try:
            torch.set_num_threads(self.config.num_omp_threads)

            # Set inter-op parallelism (for operations that can run in parallel)
            if hasattr(torch, 'set_num_interop_threads'):
                # Use half the threads for inter-op to avoid oversubscription
                inter_threads = max(1, self.config.num_omp_threads // 2)
                torch.set_num_interop_threads(inter_threads)

            logger.debug(f"PyTorch CPU threads: intra={self.config.num_omp_threads}, inter={inter_threads}")
        except Exception as e:
            logger.debug(f"Could not set PyTorch thread count: {e}")

        # Enable optimizations for specific CPU instruction sets
        if IS_ARM:
            logger.debug("Running on ARM architecture - using native optimizations")
        else:
            # x86 specific: Enable MKL optimizations if available
            try:
                if hasattr(torch.backends, 'mkl') and torch.backends.mkl.is_available():
                    logger.debug("Intel MKL available for CPU acceleration")
            except Exception:
                pass

        logger.debug("CPU optimizations configured")

    def _configure_mps(self, torch) -> None:
        """Configure Apple Metal Performance Shaders (MPS) optimizations."""
        # MPS is Apple's GPU acceleration for M1/M2/M3 chips
        # It's automatically used when device="mps", but we can set some hints

        # Critical MPS environment variables (from iOS script optimizations)
        # PYTORCH_MPS_HIGH_WATERMARK_RATIO: Controls memory allocation strategy
        # Setting to "0.0" forces immediate memory release, reducing fragmentation
        os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

        # PYTORCH_ENABLE_MPS_FALLBACK: Enables CPU fallback for unsupported MPS ops
        # This prevents crashes when encountering ops not yet implemented in MPS
        os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

        logger.debug("MPS environment variables configured: HIGH_WATERMARK_RATIO=0.0, ENABLE_FALLBACK=1")

        try:
            # MPS memory management
            if hasattr(torch.mps, 'set_per_process_memory_fraction'):
                torch.mps.set_per_process_memory_fraction(self.config.max_memory_fraction)
        except Exception as e:
            logger.debug(f"MPS memory configuration not available: {e}")

        # Set recommended thread count for MPS (efficiency cores + performance cores)
        try:
            # On Apple Silicon, we want fewer CPU threads since GPU handles heavy compute
            cpu_threads = max(4, self.config.num_omp_threads // 2)
            torch.set_num_threads(cpu_threads)
            logger.debug(f"MPS mode: CPU threads set to {cpu_threads} (offloading to GPU)")
        except Exception:
            pass

        logger.debug("MPS (Apple Silicon) optimizations configured")

    def _configure_cuda(self, torch) -> None:
        """Configure CUDA optimizations (from iOS script best practices)."""
        if not self._cuda_available:
            return

        # Enable cuDNN benchmark for consistent input sizes
        # This auto-tunes cuDNN kernels for the specific input shapes
        if self.config.enable_cudnn_benchmark:
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.deterministic = False
            logger.debug("cuDNN benchmark enabled (auto-tuning kernels)")

        # Enable TF32 for Ampere+ GPUs (3090, A100, 4090, etc.)
        # TF32 is faster than FP32 with minimal precision loss
        # Critical for performance on modern NVIDIA GPUs
        if hasattr(torch.backends.cudnn, 'allow_tf32'):
            torch.backends.cudnn.allow_tf32 = True
            logger.debug("TF32 enabled for cuDNN (Ampere+ optimization)")

        if hasattr(torch.backends.cuda, 'matmul'):
            torch.backends.cuda.matmul.allow_tf32 = True
            logger.debug("TF32 enabled for CUDA matmul (Ampere+ optimization)")

        # Set memory fraction
        if hasattr(torch.cuda, 'set_per_process_memory_fraction'):
            torch.cuda.set_per_process_memory_fraction(
                self.config.max_memory_fraction,
                device=0
            )
            logger.debug(f"CUDA memory fraction set to {self.config.max_memory_fraction}")

        logger.debug("CUDA optimizations configured (benchmark + TF32)")

    def _configure_pytorch(self, torch) -> None:
        """Configure general PyTorch optimizations."""
        # Disable gradient computation globally for inference
        torch.set_grad_enabled(False)

        # Set float32 matmul precision (for CPU)
        if hasattr(torch, 'set_float32_matmul_precision'):
            torch.set_float32_matmul_precision('high')

        logger.debug("PyTorch optimizations configured")

    def compile_model(self, model: Any, model_name: str, warmup_input: Any = None) -> Any:
        """
        Compile a model using torch.compile for faster inference (iOS optimizations).
        Optionally performs a warmup pass to optimize JIT compilation.

        Args:
            model: PyTorch model to compile
            model_name: Unique identifier for caching
            warmup_input: Optional input tensor for warmup pass (recommended)

        Returns:
            Compiled model or original if compilation fails

        Note:
            - Uses "reduce-overhead" mode for inference optimization (from iOS script)
            - torch.compile doesn't support MPS yet (Apple Silicon)
            - Warmup pass helps JIT compiler generate optimal code paths
        """
        if model_name in self._compiled_models:
            return self._compiled_models[model_name]

        if not self.config.enable_torch_compile:
            self._compiled_models[model_name] = model
            return model

        try:
            import torch

            if not hasattr(torch, 'compile'):
                logger.warning("torch.compile not available (requires PyTorch 2.0+)")
                self._compiled_models[model_name] = model
                return model

            # torch.compile doesn't support MPS yet (as of PyTorch 2.x)
            if self._mps_available:
                logger.debug(f"Skipping torch.compile for '{model_name}' (MPS not supported)")
                self._compiled_models[model_name] = model
                return model

            # Use "reduce-overhead" mode for inference optimization (from iOS script)
            # This mode minimizes Python overhead and graph breaks
            compile_mode = "reduce-overhead" if self.config.torch_compile_mode == "default" else self.config.torch_compile_mode

            compiled = torch.compile(
                model,
                mode=compile_mode,
                fullgraph=False,  # Allow graph breaks for complex models
                dynamic=True,     # Handle variable sequence lengths
            )

            # Warmup pass (from iOS script optimization)
            if warmup_input is not None:
                logger.debug(f"Performing warmup pass for '{model_name}'...")
                try:
                    with torch.inference_mode():
                        _ = compiled(warmup_input)
                    logger.debug(f"Warmup pass completed for '{model_name}'")
                except Exception as e:
                    logger.debug(f"Warmup pass failed (non-critical): {e}")

            self._compiled_models[model_name] = compiled
            logger.info(f"Model '{model_name}' compiled with mode='{compile_mode}' (torch.compile + warmup)")
            return compiled

        except Exception as e:
            logger.warning(f"torch.compile failed for '{model_name}': {e}")
            self._compiled_models[model_name] = model
            return model

    def cleanup_memory(self, force: bool = False) -> None:
        """
        Free unused memory (GPU, MPS, or CPU).
        For CPU mode, cleanup happens periodically based on cpu_memory_cleanup_interval.
        Set force=True to always perform cleanup.
        """
        if not self.config.enable_memory_cleanup:
            return

        # Track batch count for periodic CPU cleanup
        self._batch_counter += 1

        try:
            import torch

            if self._cuda_available:
                # CUDA cleanup
                gc.collect()
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.debug("CUDA memory cleaned up")

            elif self._mps_available:
                # MPS (Apple Silicon) cleanup
                gc.collect()
                if hasattr(torch.mps, 'empty_cache'):
                    torch.mps.empty_cache()
                logger.debug("MPS memory cleaned up")

            else:
                # CPU cleanup - only periodically or when forced
                if force or (self._batch_counter % self.config.cpu_memory_cleanup_interval == 0):
                    gc.collect()
                    logger.debug(f"CPU memory cleaned up (batch #{self._batch_counter})")

        except Exception as e:
            logger.debug(f"Memory cleanup failed: {e}")

    @property
    def device(self) -> str:
        """Get the configured device."""
        if self._device is None:
            return self.initialize()
        return self._device

    @property
    def cuda_available(self) -> bool:
        """Check if CUDA is available."""
        return self._cuda_available

    @property
    def mps_available(self) -> bool:
        """Check if MPS (Apple Silicon) is available."""
        return self._mps_available

    @property
    def is_cpu_only(self) -> bool:
        """Check if running in CPU-only mode (no GPU acceleration)."""
        return not self._cuda_available and not self._mps_available

    def get_optimal_batch_size(self, default: int = 8) -> int:
        """
        Get optimal batch size based on device and available memory.
        Uses logic from iOS script for memory-aware batch sizing.

        Returns:
            Optimal batch size (1-4 for most cases)
        """
        try:
            import torch

            if self._cuda_available:
                # CUDA: Calculate based on available VRAM (from iOS script)
                total_mem = torch.cuda.get_device_properties(0).total_memory
                # Use ~70% of available memory for batch processing
                if total_mem > 16 * 1024**3:  # 16GB+ VRAM
                    return 4  # Large batches for high-end GPUs
                elif total_mem > 8 * 1024**3:  # 8GB+ VRAM
                    return 2  # Medium batches for mid-range GPUs
                else:
                    return 1  # Conservative for lower-end GPUs

            elif self._mps_available:
                # MPS: Apple Silicon typically has unified memory
                # Start conservative, can be increased based on testing
                return 2  # MPS handles medium batches efficiently

            else:
                # CPU: Keep batches small to avoid memory pressure
                return 1  # CPU works best with minimal batching

        except Exception as e:
            logger.debug(f"Error calculating optimal batch size: {e}")
            return min(default, 2)  # Safe fallback

    def warmup_model(self, model: Any, warmup_input: Any) -> bool:
        """
        Perform warmup pass on a model (from iOS script optimization).
        This helps JIT compilers generate optimal code paths.

        Args:
            model: PyTorch model to warm up
            warmup_input: Example input tensor for the model

        Returns:
            True if warmup succeeded, False otherwise
        """
        try:
            import torch

            logger.debug("Performing model warmup pass...")
            with torch.inference_mode():
                _ = model(warmup_input)
            logger.debug("Model warmup completed successfully")
            return True

        except Exception as e:
            logger.debug(f"Model warmup failed (non-critical): {e}")
            return False

    def get_inference_context(self):
        """
        Get the appropriate inference context manager.
        Returns torch.inference_mode() for maximum performance.

        Usage:
            with optimizer.get_inference_context():
                output = model(input)
        """
        try:
            import torch
            if hasattr(torch, 'inference_mode'):
                return torch.inference_mode()
        except ImportError:
            pass

        # Fallback to nullcontext if torch not available
        from contextlib import nullcontext
        return nullcontext()


@dataclass(order=True)
class PriorityItem:
    """Item wrapper for priority queue with custom ordering."""
    priority: int
    timestamp: float = field(compare=False)
    data: Any = field(compare=False)
    task_id: str = field(compare=False)


class TranslationPriorityQueue:
    """
    Priority queue for translation tasks.
    Prioritizes short texts for faster user response.
    """

    def __init__(self, config: Optional[PerformanceConfig] = None):
        self.config = config or PerformanceConfig()
        self._queue: List[PriorityItem] = []
        self._lock = threading.Lock()
        self._counter = 0  # For unique task IDs

    def get_priority(self, text: str) -> Priority:
        """Determine priority based on text length."""
        text_len = len(text)

        if text_len < self.config.short_text_threshold:
            return Priority.HIGH
        elif text_len < self.config.medium_text_threshold:
            return Priority.MEDIUM
        else:
            return Priority.LOW

    def push(self, text: str, data: Any, priority: Optional[Priority] = None) -> str:
        """
        Add item to priority queue.
        Returns a unique task ID.
        """
        with self._lock:
            self._counter += 1
            task_id = f"task_{self._counter}_{int(time.time() * 1000)}"

            if priority is None:
                priority = self.get_priority(text)

            item = PriorityItem(
                priority=priority.value,
                timestamp=time.time(),
                data=data,
                task_id=task_id
            )
            heapq.heappush(self._queue, item)
            return task_id

    def pop(self) -> Optional[Tuple[str, Any]]:
        """Remove and return the highest priority item."""
        with self._lock:
            if not self._queue:
                return None
            item = heapq.heappop(self._queue)
            return (item.task_id, item.data)

    def peek(self) -> Optional[Tuple[str, Any, int]]:
        """View the highest priority item without removing."""
        with self._lock:
            if not self._queue:
                return None
            item = self._queue[0]
            return (item.task_id, item.data, item.priority)

    def __len__(self) -> int:
        with self._lock:
            return len(self._queue)

    @property
    def is_empty(self) -> bool:
        return len(self) == 0


@dataclass
class BatchItem:
    """Single item in a translation batch."""
    text: str
    source_lang: str
    target_lang: str
    task_id: str
    future: asyncio.Future
    metadata: Dict[str, Any] = field(default_factory=dict)


class BatchProcessor:
    """
    Collects translation requests and processes them in batches.
    Reduces overhead from repeated model calls.
    """

    def __init__(
        self,
        process_fn: Callable[[List[str], str, str], List[str]],
        config: Optional[PerformanceConfig] = None
    ):
        """
        Initialize batch processor.

        Args:
            process_fn: Function to process a batch of texts.
                       Signature: (texts: List[str], source_lang: str, target_lang: str) -> List[str]
            config: Performance configuration.
        """
        self.config = config or PerformanceConfig()
        self._process_fn = process_fn
        self._batches: Dict[str, List[BatchItem]] = {}  # Keyed by "src_lang:tgt_lang"
        self._lock = asyncio.Lock()
        self._processing_task: Optional[asyncio.Task] = None
        self._running = False
        self._task_counter = 0

    def _get_batch_key(self, source_lang: str, target_lang: str) -> str:
        """Generate key for batch grouping."""
        return f"{source_lang}:{target_lang}"

    async def add(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Add a translation request to the batch.
        Returns the translated text when batch is processed.
        """
        loop = asyncio.get_event_loop()
        future = loop.create_future()

        async with self._lock:
            self._task_counter += 1
            task_id = f"batch_{self._task_counter}_{int(time.time() * 1000)}"

            batch_key = self._get_batch_key(source_lang, target_lang)

            if batch_key not in self._batches:
                self._batches[batch_key] = []

            item = BatchItem(
                text=text,
                source_lang=source_lang,
                target_lang=target_lang,
                task_id=task_id,
                future=future,
                metadata=metadata or {}
            )
            self._batches[batch_key].append(item)

            # Check if batch is full
            batch = self._batches[batch_key]
            total_tokens = sum(len(i.text.split()) for i in batch)

            if len(batch) >= self.config.batch_size or total_tokens >= self.config.max_batch_tokens:
                # Process immediately
                await self._process_batch(batch_key)

        return await future

    async def _process_batch(self, batch_key: str) -> None:
        """Process a single batch."""
        if batch_key not in self._batches or not self._batches[batch_key]:
            return

        batch = self._batches.pop(batch_key)

        if not batch:
            return

        source_lang = batch[0].source_lang
        target_lang = batch[0].target_lang
        texts = [item.text for item in batch]

        try:
            # Run translation in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                self._process_fn,
                texts,
                source_lang,
                target_lang
            )

            # Set results
            for item, result in zip(batch, results):
                if not item.future.done():
                    item.future.set_result(result)

        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            for item in batch:
                if not item.future.done():
                    item.future.set_exception(e)

    async def flush(self) -> None:
        """Process all pending batches immediately."""
        async with self._lock:
            batch_keys = list(self._batches.keys())

        for key in batch_keys:
            await self._process_batch(key)

    async def start_background_processing(self) -> None:
        """Start background task to process batches on timeout."""
        if self._running:
            return

        self._running = True
        self._processing_task = asyncio.create_task(self._background_processor())
        logger.info("Batch processor background task started")

    async def stop(self) -> None:
        """Stop background processing and flush remaining batches."""
        self._running = False

        if self._processing_task:
            self._processing_task.cancel()
            try:
                await self._processing_task
            except asyncio.CancelledError:
                pass

        await self.flush()
        logger.info("Batch processor stopped")

    async def _background_processor(self) -> None:
        """Background task to process batches after timeout."""
        timeout_seconds = self.config.batch_timeout_ms / 1000.0

        while self._running:
            try:
                await asyncio.sleep(timeout_seconds)

                async with self._lock:
                    batch_keys = list(self._batches.keys())

                for key in batch_keys:
                    await self._process_batch(key)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Background processor error: {e}")

    @property
    def pending_count(self) -> int:
        """Get total number of pending items across all batches."""
        return sum(len(batch) for batch in self._batches.values())


def get_performance_optimizer() -> PerformanceOptimizer:
    """Get the singleton performance optimizer instance."""
    return PerformanceOptimizer()


def create_inference_context():
    """
    Create a context manager for optimized inference.
    Returns torch.inference_mode() if available, else nullcontext.

    Usage:
        with create_inference_context():
            output = model(input)

    Note: Delegates to PerformanceOptimizer.get_inference_context()
    """
    optimizer = get_performance_optimizer()
    return optimizer.get_inference_context()
