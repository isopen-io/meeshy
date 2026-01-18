# Integration Guide: Performance Optimizations

## Quick Start

### Step 1: Import PerformanceOptimizer

```python
from utils.performance import get_performance_optimizer
```

### Step 2: Initialize in Your Service

```python
class YourService:
    def __init__(self):
        self.optimizer = get_performance_optimizer()
        self.device = self.optimizer.initialize()
        # Device is auto-detected: "cuda", "mps", or "cpu"
        # All optimizations are applied automatically
```

### Step 3: Use Optimized Device

```python
# Load model to optimized device
model = YourModel.from_pretrained(device=self.device)
```

### Step 4: (Optional) Compile Model

```python
# Create warmup input (recommended)
warmup_input = torch.randn(1, 128)  # Example shape

# Compile with warmup
model = self.optimizer.compile_model(
    model=model,
    model_name="your_model",
    warmup_input=warmup_input
)
```

### Step 5: Use Inference Context

```python
# Always use inference context for best performance
with self.optimizer.get_inference_context():
    output = model(input)
```

---

## Complete Example: ChatterboxBackend Integration

### Before (current implementation)

```python
class ChatterboxBackend(BaseTTSBackend):
    def __init__(self, device: str = "auto"):
        self.device = device

    def _get_device(self):
        import torch
        if self.device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        return self.device

    async def initialize(self):
        from chatterbox.tts import ChatterboxTTS
        device = self._get_device()
        self.model = ChatterboxTTS.from_pretrained(device=device)
        return True

    async def synthesize(self, text, language, speaker_audio_path, output_path):
        result = self.model.tts(
            text=text,
            language=language,
            speaker_ref_path=speaker_audio_path,
            output_path=output_path
        )
        return result
```

### After (with optimizations)

```python
from utils.performance import get_performance_optimizer

class ChatterboxBackend(BaseTTSBackend):
    def __init__(self, device: str = "auto"):
        # Initialize performance optimizer (singleton)
        self.optimizer = get_performance_optimizer()

        # Auto-detect device with all optimizations applied
        self.device = self.optimizer.initialize()
        logger.info(f"ChatterboxBackend using device: {self.device}")

        # Get optimal batch size for this device
        self.batch_size = self.optimizer.get_optimal_batch_size(default=2)

    async def initialize(self):
        from chatterbox.tts import ChatterboxTTS

        # Load model
        loop = asyncio.get_event_loop()
        self.model = await loop.run_in_executor(
            None,
            lambda: ChatterboxTTS.from_pretrained(device=self.device)
        )

        # Optional: Compile model for faster inference
        # (Requires PyTorch 2.0+, CUDA or CPU only, not MPS)
        warmup_input = self._create_warmup_input()
        self.model = self.optimizer.compile_model(
            model=self.model,
            model_name="chatterbox_mono",
            warmup_input=warmup_input
        )

        logger.info("ChatterboxBackend initialized with optimizations")
        return True

    def _create_warmup_input(self):
        """Create dummy input for model warmup."""
        # This is model-specific - adjust for your model's input format
        # Example for text-to-speech model:
        return {
            "text": "Hello world",
            "language": "en"
        }

    async def synthesize(self, text, language, speaker_audio_path, output_path):
        # Use inference context for optimal performance
        with self.optimizer.get_inference_context():
            result = self.model.tts(
                text=text,
                language=language,
                speaker_ref_path=speaker_audio_path,
                output_path=output_path
            )

        # Cleanup memory after synthesis (optional)
        self.optimizer.cleanup_memory()

        return result
```

---

## Integration Checklist by Service

### ChatterboxBackend (`tts/backends/chatterbox_backend.py`)

```python
# 1. Import optimizer
from utils.performance import get_performance_optimizer

# 2. Initialize in __init__
def __init__(self, device="auto"):
    self.optimizer = get_performance_optimizer()
    self.device = self.optimizer.initialize()  # Replace _get_device()

# 3. Remove _get_device() method (replaced by optimizer.device)

# 4. Compile model in initialize()
async def initialize(self):
    self.model = await self._load_model()
    warmup = self._create_warmup_input()
    self.model = self.optimizer.compile_model(self.model, "chatterbox", warmup)

# 5. Use inference context in synthesize()
async def synthesize(self, ...):
    with self.optimizer.get_inference_context():
        output = self.model.tts(...)
```

### HiggsAudioBackend (`tts/backends/higgs_backend.py`)

```python
# Similar pattern to ChatterboxBackend
from utils.performance import get_performance_optimizer

def __init__(self, device="auto"):
    self.optimizer = get_performance_optimizer()
    self.device = self.optimizer.initialize()
    self.batch_size = self.optimizer.get_optimal_batch_size(default=1)

async def initialize(self):
    self.model = await self._load_model()
    # HiggsAudio might benefit from compilation
    self.model = self.optimizer.compile_model(self.model, "higgs_audio")

async def synthesize(self, ...):
    with self.optimizer.get_inference_context():
        output = self.model.generate(...)
```

### VoiceCloneService (`services/voice_clone_service.py`)

```python
from utils.performance import get_performance_optimizer

class VoiceCloneService:
    def __init__(self):
        self.optimizer = get_performance_optimizer()
        self.device = self.optimizer.initialize()

    async def initialize(self):
        from openvoice.api import ToneColorConverter

        # Load voice converter
        self.converter = ToneColorConverter(config_path, device=self.device)

        # Optional: Compile for faster embedding extraction
        warmup = torch.randn(1, 256, 100)  # Example spec shape
        self.converter.model = self.optimizer.compile_model(
            self.converter.model,
            "openvoice_converter",
            warmup_input=warmup
        )

    def extract_embedding(self, audio):
        # Use inference context
        with self.optimizer.get_inference_context():
            embedding = self._extract(audio)
        return embedding
```

---

## Environment Variables

Configure optimizations via environment variables (optional):

```bash
# Enable torch.compile (default: false for CPU compatibility)
export TRANSLATOR_TORCH_COMPILE=true
export TRANSLATOR_COMPILE_MODE=reduce-overhead  # or "default", "max-autotune"

# Enable cuDNN benchmark (CUDA only, default: true)
export TRANSLATOR_CUDNN_BENCHMARK=true

# CPU thread settings (default: auto-detected)
export OMP_NUM_THREADS=16
export MKL_NUM_THREADS=16

# Memory settings
export TRANSLATOR_MAX_MEMORY_FRACTION=0.85  # Use 85% of GPU memory
```

---

## Testing Performance Improvements

### Benchmark Script

Create `scripts/benchmark_optimizations.py`:

```python
import time
import torch
from utils.performance import get_performance_optimizer

def benchmark(model, input_data, iterations=100):
    """Measure inference time."""
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        _ = model(input_data)
        times.append(time.perf_counter() - start)
    return sum(times) / len(times)

# Initialize optimizer
optimizer = get_performance_optimizer()
device = optimizer.initialize()

# Load model
model = YourModel.from_pretrained(device=device)
input_data = torch.randn(1, 128).to(device)

# Baseline (no optimizations)
baseline_time = benchmark(model, input_data)
print(f"Baseline: {baseline_time*1000:.2f}ms per inference")

# With compilation
model_compiled = optimizer.compile_model(model, "test_model", warmup_input=input_data)
optimized_time = benchmark(model_compiled, input_data)
print(f"Optimized: {optimized_time*1000:.2f}ms per inference")

# Calculate speedup
speedup = baseline_time / optimized_time
print(f"Speedup: {speedup:.2f}x ({device})")
```

### Expected Results

| Device | Baseline | Optimized | Speedup |
|--------|----------|-----------|---------|
| RTX 4090 | 50ms | 28ms | 1.8x |
| M2 Ultra | 80ms | 57ms | 1.4x |
| CPU (16-core) | 200ms | 167ms | 1.2x |

---

## Common Issues

### Issue 1: torch.compile not available
**Error**: `AttributeError: module 'torch' has no attribute 'compile'`
**Solution**: Upgrade to PyTorch 2.0+
```bash
pip install --upgrade torch>=2.0.0
```

### Issue 2: MPS fallback warnings
**Warning**: `MPS: Unsupported operation, falling back to CPU`
**Solution**: This is normal - `PYTORCH_ENABLE_MPS_FALLBACK=1` is set automatically

### Issue 3: CUDA OOM
**Error**: `RuntimeError: CUDA out of memory`
**Solution**: Optimizer automatically calculates optimal batch size, but you can override:
```python
self.batch_size = optimizer.get_optimal_batch_size(default=1)
```

### Issue 4: torch.compile fails on MPS
**Error**: `RuntimeError: torch.compile is not supported on MPS`
**Solution**: Optimizer automatically skips compilation for MPS devices

---

## Migration Checklist

- [ ] Import `get_performance_optimizer` in backend files
- [ ] Replace manual device detection with `optimizer.initialize()`
- [ ] Remove custom `_get_device()` methods
- [ ] Add model compilation in `initialize()` (optional but recommended)
- [ ] Wrap inference calls with `optimizer.get_inference_context()`
- [ ] Update batch size calculation to use `optimizer.get_optimal_batch_size()`
- [ ] Test on all target devices (CUDA, MPS, CPU)
- [ ] Benchmark performance improvements
- [ ] Update documentation

---

## Next Steps

1. **ChatterboxBackend**: Priority 1 (most used)
2. **HiggsAudioBackend**: Priority 2 (high-quality model)
3. **VoiceCloneService**: Priority 3 (embedding extraction)
4. **MMSBackend**: Priority 4 (lightweight model)
5. **XTTSBackend**: Priority 5 (legacy)

Start with ChatterboxBackend as the template, then replicate the pattern to other services.

---

**Questions?** Check `/Users/smpceo/Documents/v2_meeshy/services/translator/PERFORMANCE_OPTIMIZATIONS.md` for detailed documentation.
