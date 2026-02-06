# Design : Amélioration de la détection mono-locuteur

**Date** : 2026-02-06
**Statut** : Validé

## Problème

Quand un seul locuteur parle, le système détecte 5 speakers (s0-s4) à cause de :
- Fenêtres glissantes trop courtes (hop 500ms)
- Seuil de clustering trop permissif (0.30)
- Fusion post-diarisation trop stricte (85%)

## Solution retenue : Option A + C

Combinaison de :
- **Option C** : Ajuster les paramètres SpeechBrain
- **Option A** : Fusion agressive post-diarisation

## Contraintes utilisateur

- Cas d'usage : mono-locuteur majoritaire
- Doit détecter voix vraiment distinctes (homme/femme)
- Couverture prioritaire sur qualité (accepter segments courts)

---

## Changements

### 1. SpeechBrain (`diarization_speechbrain.py`)

```python
# Lignes 280-282 - Fenêtres glissantes
window_size_ms = 1500  # Inchangé
hop_size_ms = 1000     # Était 500
max_speakers = 3       # Inchangé

# Ligne 358 - Seuil clustering
if score > best_score and score > 0.40:  # Était 0.30, puis 0.50 (trop strict)

# Lignes 439-442 - Filtrage faux positifs
MIN_DURATION_MS = 500   # Était 300
MIN_RATIO_SHORT = 20    # Était 16
MIN_RATIO_LONG = 25     # Était 20
```

### 2. Fusion agressive (`multi_speaker_processor.py`)

```python
# Ligne 274
similarity_threshold = 0.65  # Était 0.85

# Nouvelle constante
PITCH_TOLERANCE_HZ = 25

# Calcul similarité amélioré
def calculate_similarity(model1, model2):
    pitch_diff = abs(model1.pitch - model2.pitch)

    # Fusion automatique si pitch très proche
    if pitch_diff < PITCH_TOLERANCE_HZ:
        return 0.90

    # Calcul normal avec poids ajustés
    pitch_sim = 1.0 - (pitch_diff / max(model1.pitch, model2.pitch))
    energy_sim = ...

    return 0.6 * pitch_sim + 0.4 * energy_sim  # Était 0.7/0.3
```

### 3. Segments courts (`voice_clone_model_creation.py`)

```python
MIN_AUDIO_RECOMMENDED_MS = 2000  # Était 3000
MIN_AUDIO_ABSOLUTE_MS = 500

# Fallback voix générique si < MIN_AUDIO_ABSOLUTE_MS
```

---

## Ordre d'implémentation

1. SpeechBrain (réduit le problème à la source)
2. Fusion agressive (nettoie les faux positifs)
3. Gestion segments courts (robustesse)

## Tests

- Audio mono-speaker 10s → 1 speaker
- Audio homme+femme → 2 speakers
- Audio court 2s → clonage sans warning excessif

## Risques

Faible - changements conservateurs, max_speakers=3 maintenu.
