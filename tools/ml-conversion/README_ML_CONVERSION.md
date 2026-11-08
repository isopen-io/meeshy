# ML Model Conversion Scripts

Scripts for converting machine learning models to CoreML format for on-device inference.

## Prerequisites

```bash
# Create virtual environment
python3 -m venv ml_env
source ml_env/bin/activate

# Install dependencies
pip install torch transformers coremltools sentencepiece
```

## Available Scripts

### 1. convert_nllb_to_coreml.py (Dynamic Shapes - CPU/GPU)

Converts NLLB with dynamic input shapes. Works on CPU/GPU but NOT on Neural Engine.

```bash
python convert_nllb_to_coreml.py --output_dir ./NLLBModels --max_length 128
```

### 2. convert_nllb_to_coreml_ane.py (Fixed Shapes - ANE Compatible) ⭐

**Recommended** - Converts NLLB with fixed input shapes for Apple Neural Engine.

```bash
# Basic ANE conversion (seq_len=64)
python convert_nllb_to_coreml_ane.py --output_dir ./NLLBModels_ANE

# With quantization (reduces size ~50%)
python convert_nllb_to_coreml_ane.py --output_dir ./NLLBModels_ANE --quantize

# Multiple sequence lengths
python convert_nllb_to_coreml_ane.py --output_dir ./NLLBModels_ANE --seq_lengths 32 64 128 --quantize
```

**Key Differences**:
| Feature | Dynamic (CPU/GPU) | Fixed (ANE) |
|---------|-------------------|-------------|
| Input shapes | Variable | Fixed (32, 64, 128) |
| Compute units | CPU + GPU | CPU + GPU + ANE |
| Precision | Float32 | Float16 |
| Performance | ~300ms | ~100ms |
| Padding required | No | Yes |

**Model**: `facebook/nllb-200-distilled-600M` (~1.2GB download, ~600MB CoreML)

**Supported Languages**: 200+ including English, French, Spanish, German, Chinese, Japanese, Korean, Arabic, etc.

**Output Files**:
- `NLLBEncoder.mlpackage` - Encoder only (~400MB)
- `NLLB600M.mlpackage` - Full encoder-decoder model (~1.1GB)
- `tokenizer/` - SentencePiece tokenizer files
- `model_info.json` - Model metadata

**Quantization** (optional, reduces size by ~50%):
```bash
# After conversion, quantize with coremltools
python -c "
import coremltools as ct
from coremltools.models.neural_network import quantization_utils

model = ct.models.MLModel('NLLBModels/NLLB600M.mlpackage')
quantized = quantization_utils.quantize_weights(model, nbits=8)
quantized.save('NLLBModels/NLLB600M_8bit.mlpackage')
"
```

### 2. add_mlmodels_to_xcode.rb

Ruby script to add MLModels to Xcode project programmatically.

```bash
# Requires xcodeproj gem
gem install xcodeproj

# Run the script
ruby add_mlmodels_to_xcode.rb
```

**What it does**:
- Creates `Meeshy/Resources/MLModels` group in Xcode
- Adds `.mlpackage` files as resources
- Adds `NLLBTokenizer` folder reference
- Configures build phase to include models in app bundle

## Model Integration in iOS

After conversion, models are used by:

1. **CoreMLTranslationEngine.swift** - Loads and runs NLLB model
2. **OnDeviceTranslationEngine.swift** - Orchestrates translation providers
3. **OnDeviceTranslationService.swift** - High-level translation API

### Model Loading Flow

```
App Launch
    ↓
CoreMLTranslationEngine.loadBundledNLLB()
    ↓
Finds NLLB600M_8bit.mlmodelc in bundle (Xcode compiles .mlpackage → .mlmodelc)
    ↓
Loads with MLModel(contentsOf:configuration:)
    ↓
Loads NLLBTokenizer for text tokenization
    ↓
Ready for translation
```

### Compute Units Configuration

```swift
// Current: CPU + GPU (ANE has compatibility issues with dynamic shapes)
modelConfig.computeUnits = .cpuAndGPU

// For ANE-compatible models (fixed shapes, float16):
modelConfig.computeUnits = .cpuAndNeuralEngine
```

## Troubleshooting

### "MIL program has non-constant (dynamic) shapes"
The model uses dynamic input shapes which ANE doesn't support. Use `.cpuAndGPU` compute units.

### "Cannot retrieve vector from IRValue format int32"
ANE prefers float16 inputs. The fallback to CPU/GPU handles this.

### Model not found in bundle
Xcode compiles `.mlpackage` to `.mlmodelc`. Check for the compiled version:
```swift
Bundle.main.url(forResource: "NLLB600M_8bit", withExtension: "mlmodelc")
```

## NLLB Language Codes

The model uses Flores-200 language codes:

| Language | Code |
|----------|------|
| English | eng_Latn |
| French | fra_Latn |
| Spanish | spa_Latn |
| German | deu_Latn |
| Chinese | zho_Hans |
| Japanese | jpn_Jpan |
| Korean | kor_Hang |
| Arabic | arb_Arab |
| Russian | rus_Cyrl |
| Portuguese | por_Latn |
| Italian | ita_Latn |
| Dutch | nld_Latn |

Full list: https://github.com/facebookresearch/flores/blob/main/flores200/README.md

## Performance

| Metric | Value |
|--------|-------|
| Model Size (quantized) | ~589 MB |
| Load Time | ~2-5 seconds |
| Translation Latency | ~100-500ms per sentence |
| Compute Units | CPU + GPU |
| iOS Deployment Target | iOS 16+ |

## License

NLLB-200 is released under CC-BY-NC-4.0 (non-commercial use).
