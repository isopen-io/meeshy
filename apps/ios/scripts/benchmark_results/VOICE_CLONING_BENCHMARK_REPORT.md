# Voice Cloning E2E Benchmark Report

## Executive Summary

This report compares voice cloning models for iOS integration in the Meeshy app. Two models were tested across three languages (EN, FR, ES) to determine the best solution for cross-language voice cloning.

**Recommendation: XTTS-v2** for highest quality voice cloning, with **OpenVoice V2** as a lightweight alternative for size-constrained deployments.

---

## Models Tested

| Model | Size | Avg Similarity | Avg Time | iOS Compatible |
|-------|------|----------------|----------|----------------|
| **XTTS-v2** | 1.8 GB | **90.7%** | 3.59s | Requires CoreML conversion |
| OpenVoice V2 | 125 MB | 62.2% | 1.34s | Already converted |

---

## Detailed Results by Language

### English (EN)

| Metric | OpenVoice V2 | XTTS-v2 |
|--------|-------------|---------|
| Overall Similarity | 51.0% | **93.7%** |
| Pitch Match | 31.2% | **98.8%** |
| Timbre Match | 7.7% | **80.4%** |
| MFCC Similarity | 98.2% | **99.9%** |
| Processing Time | **1.34s** | 3.35s |

### French (FR)

| Metric | OpenVoice V2 | XTTS-v2 |
|--------|-------------|---------|
| Overall Similarity | 75.1% | **85.9%** |
| Pitch Match | 89.6% | **72.2%** |
| Timbre Match | 29.5% | **81.2%** |
| MFCC Similarity | 98.5% | **99.8%** |
| Processing Time | **1.34s** | 4.23s |

### Spanish (ES)

| Metric | OpenVoice V2 | XTTS-v2 |
|--------|-------------|---------|
| Overall Similarity | 60.7% | **92.6%** |
| Pitch Match | 32.7% | **92.0%** |
| Timbre Match | 38.3% | **83.6%** |
| MFCC Similarity | 98.3% | **99.7%** |
| Processing Time | **1.33s** | 3.19s |

---

## Audio Quality Analysis

### Reference Voice Characteristics
- **Pitch**: 92.8 Hz (male voice)
- **Timbre (Spectral Centroid)**: 1359.8 Hz
- **Energy (RMS)**: 0.079

### Cloning Quality Comparison

```
Reference Voice:  ████████████████████ 92.8 Hz pitch
                  ████████████████████ 1359 Hz timbre

XTTS-v2 (EN):     ████████████████████ 93.9 Hz pitch (98.8% match)
                  ████████████████████ 1627 Hz timbre (80.4% match)

OpenVoice (EN):   ████████████████████████████ 156.6 Hz pitch (31.2% match)
                  ████████████████████████████████ 2614 Hz timbre (7.7% match)
```

---

## Transcription Accuracy

| Model | Language | Expected | Actual | Accuracy |
|-------|----------|----------|--------|----------|
| XTTS-v2 | EN | "Hello, this is a test of voice cloning technology." | "Hello, this is a Test of Voice Cloning Technology." | **100%** |
| XTTS-v2 | FR | "Bonjour, ceci est un test..." | "Bonjour, ceci est un test..." | **100%** |
| XTTS-v2 | ES | "Hola, esta es una prueba..." | "Hola, este es una prueba..." | ~95% |
| OpenVoice | EN | "Hello, this is a test..." | "Hello, this is a test..." | **100%** |
| OpenVoice | FR | "Bonjour, ceci est un test..." | "Bonjour, ceci est un test de technologie de clôneage vocal." | ~95% |
| OpenVoice | ES | "Hola, esta es una prueba..." | "Estas son aprobados de la tecnología..." | ~60% |

---

## iOS Integration Considerations

### XTTS-v2 (Recommended for Quality)

**Pros:**
- 90.7% average voice similarity
- Excellent pitch and timbre preservation
- Works well across languages
- Zero-shot cloning (no fine-tuning needed)

**Cons:**
- 1.8 GB model size
- Requires CoreML conversion (not trivial)
- Slower processing (3.6s average)

**iOS Strategy:**
1. Convert to CoreML using `coremltools`
2. Split model for chunked download
3. Use on-device inference for privacy
4. Consider cloud fallback for initial release

### OpenVoice V2 (Recommended for Size)

**Pros:**
- 125 MB model size (14x smaller)
- Already converted to CoreML
- Fast processing (1.3s average)
- Good for real-time applications

**Cons:**
- 62.2% average similarity (noticeable difference)
- Poor timbre matching
- Pitch often shifted up

**iOS Strategy:**
1. Use existing CoreML models
2. Apply as lightweight option
3. Suitable for low-end devices

---

## Hybrid Architecture Recommendation

For optimal iOS integration, implement a **tiered approach**:

```
┌─────────────────────────────────────────────────────────┐
│                    Meeshy Voice Cloning                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐     ┌──────────────────┐          │
│  │   Quick Mode     │     │   Quality Mode   │          │
│  │   (OpenVoice)    │     │    (XTTS-v2)     │          │
│  ├──────────────────┤     ├──────────────────┤          │
│  │ • 125 MB         │     │ • 1.8 GB         │          │
│  │ • 1.3s latency   │     │ • 3.6s latency   │          │
│  │ • 62% similarity │     │ • 91% similarity │          │
│  │ • On-device      │     │ • On-device/Cloud│          │
│  └──────────────────┘     └──────────────────┘          │
│                                                          │
│  Use Cases:                Use Cases:                    │
│  • Preview mode            • Final export                │
│  • Real-time feedback      • High-quality output         │
│  • Low storage devices     • Professional use            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Action Items for iOS Integration

### Phase 1: OpenVoice V2 (Current)
- [x] CoreML models already converted
- [x] Spectrogram computation fixed
- [ ] Integrate into production app
- [ ] Test on device performance

### Phase 2: XTTS-v2 (Recommended Upgrade)
- [ ] Convert XTTS-v2 to CoreML
- [ ] Implement model splitting for download
- [ ] Add quality toggle in settings
- [ ] Test cross-language accuracy

### Phase 3: Optimization
- [ ] Implement streaming inference
- [ ] Add ANE optimization
- [ ] Profile memory usage
- [ ] Battery impact testing

---

## Files Generated

```
benchmark_results/
├── benchmark_results.json          # Full benchmark data
├── openvoice_v2_en_cloned.wav     # OpenVoice EN output
├── openvoice_v2_fr_cloned.wav     # OpenVoice FR output
├── openvoice_v2_es_cloned.wav     # OpenVoice ES output
├── xtts-v2_en_cloned.wav          # XTTS EN output
├── xtts-v2_fr_cloned.wav          # XTTS FR output
├── xtts-v2_es_cloned.wav          # XTTS ES output
└── VOICE_CLONING_BENCHMARK_REPORT.md
```

---

## Conclusion

**XTTS-v2 provides significantly better voice cloning quality (90.7% vs 62.2%)** and should be prioritized for iOS integration despite its larger size. The quality difference is substantial enough that users will notice improved voice similarity.

For immediate deployment, OpenVoice V2 can serve as a lightweight option, but the recommended path is to convert XTTS-v2 to CoreML for the best user experience.

---

*Generated: 2026-01-02*
*Benchmark Script: voice_cloning_benchmark.py*
