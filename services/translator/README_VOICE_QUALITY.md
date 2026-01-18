# Voice Quality Analyzer - Quick Start

## Installation

Les dépendances sont déjà installées si vous avez le service Translator complet.

Si nécessaire:
```bash
pip install librosa soundfile numpy
```

## Usage rapide

### 1. Analyser la qualité d'un audio

```python
from services.voice_clone_service import get_voice_clone_service

service = get_voice_clone_service()

# Analyse rapide (sans MFCC)
metrics = await service.analyze_voice_quality("audio.wav", detailed=False)

print(f"Voice type: {metrics.voice_type}")
print(f"Pitch: {metrics.pitch_mean_hz:.1f} Hz")
print(f"Brightness: {metrics.brightness:.1f} Hz")
print(f"Duration: {metrics.duration_seconds:.1f}s")
```

### 2. Comparer deux audios

```python
# Comparer audio original vs cloné
similarity = await service.compare_voice_similarity(
    "original.wav",
    "cloned.wav"
)

print(f"Similarité globale: {similarity.overall_similarity:.2%}")
print(f"  - Pitch: {similarity.pitch_similarity:.2%}")
print(f"  - Brightness: {similarity.brightness_similarity:.2%}")
print(f"  - MFCC: {similarity.mfcc_similarity:.2%}")

# Interprétation
if similarity.overall_similarity >= 0.80:
    print("✅ EXCELLENT - Voix très similaires")
elif similarity.overall_similarity >= 0.60:
    print("👍 BON - Voix assez similaires")
else:
    print("⚠️  MOYEN - Amélioration possible")
```

### 3. Utilisation dans le pipeline

L'analyse est **automatique** après chaque génération TTS:

```
[PIPELINE] 📊 Qualité audio (fr): voice_type=Medium, pitch=165.3Hz, brightness=2841.7Hz, duration=3.42s
```

## Tests

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator

# Tester avec vos fichiers
python scripts/test_voice_quality_analyzer.py audio1.wav audio2.wav

# Auto-détection de fichiers de test
python scripts/test_voice_quality_analyzer.py
```

## Documentation complète

- **VOICE_QUALITY_ANALYZER.md**: Documentation technique complète (750+ lignes)
- **VOICE_QUALITY_INTEGRATION_SUMMARY.md**: Résumé d'intégration
- **examples/voice_quality_example.py**: Exemples d'utilisation avancés

## Métriques extraites

### Pitch (Fundamental Frequency)
- Mean pitch (Hz): Fréquence fondamentale moyenne
- Std pitch (Hz): Écart-type de la fréquence
- Min/Max pitch: Plage de fréquences

### Voice Type Detection
- **High (female/child)**: pitch > 200 Hz
- **Medium**: 140 Hz < pitch ≤ 200 Hz
- **Low (male)**: pitch ≤ 140 Hz

### Spectral Features
- Spectral centroid: Centre de masse du spectre (brightness)

### MFCC (Mel-Frequency Cepstral Coefficients)
- 13 coefficients standard
- Signature acoustique unique de la voix

## Algorithme de similarité

**Overall Similarity** = 30% pitch + 30% brightness + 40% MFCC

### Formules

**Pitch**: `max(0, 1 - |diff| / original)`
**Brightness**: `max(0, 1 - |diff| / original)`
**MFCC**: `(cosine_similarity + 1) / 2`

## Interprétation des scores

| Score | Qualité | Description |
|-------|---------|-------------|
| ≥ 0.80 | ✅ EXCELLENT | Clonage haute qualité |
| 0.60-0.79 | 👍 BON | Clonage acceptable |
| 0.40-0.59 | ⚠️ MOYEN | Amélioration possible |
| < 0.40 | ❌ FAIBLE | Re-génération recommandée |

## Performance

| Opération | Durée audio | Temps |
|-----------|-------------|-------|
| Analyse rapide | 3s | ~200ms |
| Analyse complète | 3s | ~350ms |
| Comparaison | 3s + 3s | ~700ms |

## Cas d'usage

### Validation pré-clonage
```python
metrics = await service.analyze_voice_quality(user_audio)
if metrics.duration_seconds < 5.0:
    raise ValueError("Audio trop court")
```

### Évaluation post-TTS
```python
similarity = await service.compare_voice_similarity(original, generated)
if similarity.overall_similarity < 0.60:
    # Re-générer avec meilleurs paramètres
    pass
```

### Tests A/B
```python
sim_a = await service.compare_voice_similarity(original, model_a)
sim_b = await service.compare_voice_similarity(original, model_b)
winner = "A" if sim_a.overall_similarity > sim_b.overall_similarity else "B"
```

## API complète

Voir `VOICE_QUALITY_ANALYZER.md` pour la documentation complète.

## Compatibilité

✅ 100% compatible avec le script iOS `voice_cloning_test.py`
✅ Format de sortie identique
✅ Algorithmes identiques
✅ Migration iOS facile

## Support

- Tests: `scripts/test_voice_quality_analyzer.py`
- Exemples: `examples/voice_quality_example.py`
- Documentation: `VOICE_QUALITY_ANALYZER.md`

## Status

✅ **PRODUCTION READY** - Intégration complète et testée
