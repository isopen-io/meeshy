# Test Audio Fixtures

Ce répertoire contient les fixtures audio pour les tests du VoiceAnalyzerService.

## Génération des Fixtures

### Installation des Dépendances

```bash
pip install numpy soundfile
```

### Générer les Fichiers Audio

```bash
cd tests/fixtures
python generate_test_audio.py
```

Cela créera les fichiers suivants dans `test_audio_fixtures/`:

| Fichier | Type | Durée | Caractéristiques |
|---------|------|-------|------------------|
| `male_voice.wav` | Voix masculine | 3.0s | F0=120Hz, expressivité moyenne |
| `female_voice.wav` | Voix féminine | 3.0s | F0=220Hz, expressivité moyenne-haute |
| `child_voice.wav` | Voix enfant | 2.0s | F0=300Hz, haute expressivité |
| `expressive_voice.wav` | Voix expressive | 3.0s | Haute variance pitch, très expressive |
| `monotone_voice.wav` | Voix monotone | 3.0s | Faible variance pitch, peu expressive |
| `silence.wav` | Silence | 1.0s | Amplitude nulle |
| `white_noise.wav` | Bruit blanc | 1.0s | Pas de structure tonale |
| `short_audio.wav` | Audio court | 0.5s | Pour tester durée minimale |

### Options Avancées

```bash
# Répertoire de sortie personnalisé
python generate_test_audio.py --output-dir /path/to/output

# Durée par défaut différente
python generate_test_audio.py --duration 5.0

# Sample rate différent
python generate_test_audio.py --sample-rate 44100

# Mode verbose
python generate_test_audio.py --verbose
```

## Utilisation dans les Tests

Les fixtures sont générées automatiquement par les tests pytest, mais vous pouvez aussi utiliser les fichiers pré-générés:

```python
import pytest
from pathlib import Path

@pytest.fixture
def sample_audio_file():
    """Use pre-generated male voice"""
    return str(Path(__file__).parent / "fixtures" / "test_audio_fixtures" / "male_voice.wav")

@pytest.mark.asyncio
async def test_analyze(analyzer, sample_audio_file):
    char = await analyzer.analyze(sample_audio_file)
    assert char.pitch_mean > 100
```

## Caractéristiques Techniques

### Signal Vocal Synthétique

Le générateur crée des signaux qui imitent les caractéristiques d'une vraie voix:

- **Fondamentale (F0)**: Fréquence de base
- **Harmoniques**: 5 harmoniques avec amplitudes décroissantes
- **Modulation de pitch**: Variations naturelles
- **Enveloppe d'amplitude**: Modulation d'intensité
- **Bruit**: Petit bruit de fond pour le réalisme

### Formule de Génération

```python
signal = Σ(i=1 to 5) [A_i * sin(2π * F0 * i * pitch_mod * t)]
envelope = 0.5 + expressiveness * 0.5 * sin(2π * 4 * t)
final = (signal * envelope + noise) * normalization
```

## Notes

- Les fichiers générés sont en WAV mono 32-bit float
- Sample rate par défaut: 22050 Hz (standard pour analyse vocale)
- Normalisés à 90% du maximum pour éviter le clipping
- Générés de manière déterministe (pas de random seed pour cohérence)

## Troubleshooting

### "soundfile not found"

```bash
pip install soundfile
```

### "Permission denied"

```bash
chmod +x generate_test_audio.py
```

### Fichiers corrompus

Supprimez le répertoire et régénérez:

```bash
rm -rf test_audio_fixtures
python generate_test_audio.py
```
