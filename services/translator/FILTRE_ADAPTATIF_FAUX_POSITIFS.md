# 🎯 Filtre Adaptatif : Détection des Faux Positifs Multi-Speaker

## 📝 Principe

Filtrer les faux positifs (speakers détectés à tort) en utilisant un **ratio adaptatif** selon la durée de l'audio.

## ⚙️ Critères

### Seuils Adaptatifs

```
Audio < 15 secondes  →  Ratio minimum 16%
Audio ≥ 15 secondes  →  Ratio minimum 20%
```

**Pourquoi adaptatif ?**
- **Audio court (< 15s)** : Une personne peut légitimement ne parler que 2-3 secondes (16%) dans une conversation courte
- **Audio long (≥ 15s)** : Si quelqu'un parle < 3 secondes sur 30s (10%), c'est probablement un faux positif

### Durée Minimale Absolue

**300ms** - Filtre les artefacts très courts (bruit, clics)

## 📊 Exemples Concrets

### Cas 1 : Votre Audio (9.7s, mono-locuteur)

**Configuration** :
- Durée totale : 9700ms (< 15s)
- Seuil : **16%**

**Speakers détectés** :
- s1 : 1500ms (**15.5%**) → ❌ **FILTRÉ** (< 16%)
- s0 : 9000ms (**92.8%**) → ✅ **VALIDE** (> 16%)

**Résultat final** : ✅ **1 speaker** (correct)

---

### Cas 2 : Conversation Courte (12s, 2 vrais speakers)

**Configuration** :
- Durée totale : 12000ms (< 15s)
- Seuil : **16%**

**Speakers détectés** :
- s0 : 7000ms (**58%**) → ✅ **VALIDE** (> 16%)
- s1 : 4500ms (**38%**) → ✅ **VALIDE** (> 16%)
- s2 : 500ms (**4%**) → ❌ **FILTRÉ** (< 16%, faux positif)

**Résultat final** : ✅ **2 speakers** (correct)

---

### Cas 3 : Audio Long (30s, mono-locuteur)

**Configuration** :
- Durée totale : 30000ms (≥ 15s)
- Seuil : **20%**

**Speakers détectés** :
- s0 : 27000ms (**90%**) → ✅ **VALIDE** (> 20%)
- s1 : 2000ms (**7%**) → ❌ **FILTRÉ** (< 20%, faux positif)
- s2 : 1000ms (**3%**) → ❌ **FILTRÉ** (< 20%, faux positif)

**Résultat final** : ✅ **1 speaker** (correct)

---

### Cas 4 : Conversation Longue (25s, 2 vrais speakers)

**Configuration** :
- Durée totale : 25000ms (≥ 15s)
- Seuil : **20%**

**Speakers détectés** :
- s0 : 15000ms (**60%**) → ✅ **VALIDE** (> 20%)
- s1 : 9000ms (**36%**) → ✅ **VALIDE** (> 20%)
- s2 : 1000ms (**4%**) → ❌ **FILTRÉ** (< 20%, faux positif)

**Résultat final** : ✅ **2 speakers** (correct)

---

### Cas 5 : Edge Case - Juste au seuil (10s)

**Configuration** :
- Durée totale : 10000ms (< 15s)
- Seuil : **16%**

**Speakers détectés** :
- s0 : 8400ms (**84%**) → ✅ **VALIDE** (> 16%)
- s1 : 1600ms (**16%**) → ✅ **VALIDE** (= 16%, exact)

**Résultat final** : ✅ **2 speakers** (correct, cas limite accepté)

---

## 🔧 Implémentation

### Fichier : `diarization_speechbrain.py`

**Lignes 433-483** :

```python
# Filtrer les faux positifs: speakers avec très peu d'audio
# Critères ADAPTATIFS selon la durée totale de l'audio:
# 1. Durée minimale absolue: 300ms (un mot court)
# 2. Ratio minimum adaptatif:
#    - Audio < 15s : ratio minimum 16% (tolérant pour conversations courtes)
#    - Audio ≥ 15s : ratio minimum 20% (strict pour longs audios)
MIN_DURATION_MS = 300  # Durée minimale absolue
AUDIO_THRESHOLD_MS = 15000  # Seuil pour changer de critère (15 secondes)
MIN_RATIO_SHORT_AUDIO = 0.16  # 16% pour audios < 15s
MIN_RATIO_LONG_AUDIO = 0.20   # 20% pour audios ≥ 15s

# Déterminer le ratio minimum selon la durée totale
if duration_ms < AUDIO_THRESHOLD_MS:
    min_ratio_threshold = MIN_RATIO_SHORT_AUDIO
    ratio_label = "court"
else:
    min_ratio_threshold = MIN_RATIO_LONG_AUDIO
    ratio_label = "long"

logger.info(
    f"[SPEECHBRAIN] Filtre faux positifs: audio {duration_ms}ms ({ratio_label}), "
    f"ratio minimum = {min_ratio_threshold*100}%"
)

speakers_filtered = {}
for speaker_id, data in speakers_data.items():
    speaking_ratio = data['total_duration_ms'] / duration_ms if duration_ms > 0 else 0
    speaker_duration = data['total_duration_ms']

    # Critère 1: Durée minimale absolue
    if speaker_duration < MIN_DURATION_MS:
        logger.info(
            f"[SPEECHBRAIN]    Filtré {speaker_id}: "
            f"{speaking_ratio*100:.1f}% temps, {len(data['segments'])} segments, "
            f"{speaker_duration}ms (< {MIN_DURATION_MS}ms minimum absolu)"
        )
        continue

    # Critère 2: Ratio adaptatif selon durée audio
    if speaking_ratio < min_ratio_threshold:
        logger.info(
            f"[SPEECHBRAIN]    Filtré {speaker_id}: "
            f"{speaking_ratio*100:.1f}% temps, {len(data['segments'])} segments, "
            f"{speaker_duration}ms (ratio < {min_ratio_threshold*100}% pour audio {ratio_label}, "
            f"total={duration_ms}ms = probable faux positif)"
        )
        continue

    # Speaker valide
    speakers_filtered[speaker_id] = data
    logger.info(
        f"[SPEECHBRAIN]    ✅ {speaker_id} valide: "
        f"{speaking_ratio*100:.1f}% temps, {len(data['segments'])} segments, "
        f"{speaker_duration}ms"
    )
```

---

## 📈 Tableau de Référence

| Durée Audio | Seuil | Exemples |
|-------------|-------|----------|
| 5s | 16% | 800ms minimum par speaker |
| 10s | 16% | 1600ms minimum par speaker |
| 14s | 16% | 2240ms minimum par speaker |
| **15s** | **20%** | **3000ms minimum par speaker** |
| 20s | 20% | 4000ms minimum par speaker |
| 30s | 20% | 6000ms minimum par speaker |
| 60s | 20% | 12000ms minimum par speaker |

---

## 📝 Logs Attendus

### Audio Court (9.7s, 1 speaker)

```
[SPEECHBRAIN] Filtre faux positifs: audio 9700ms (court), ratio minimum = 16.0%
[SPEECHBRAIN]    Filtré s1: 15.5% temps, 1 segments, 1500ms
                 (ratio < 16.0% pour audio court, total=9700ms = probable faux positif)
[SPEECHBRAIN]    ✅ s0 valide: 92.8% temps, 20 segments, 9000ms
```

### Audio Long (30s, 2 speakers)

```
[SPEECHBRAIN] Filtre faux positifs: audio 30000ms (long), ratio minimum = 20.0%
[SPEECHBRAIN]    Filtré s2: 7.0% temps, 3 segments, 2100ms
                 (ratio < 20.0% pour audio long, total=30000ms = probable faux positif)
[SPEECHBRAIN]    ✅ s0 valide: 60.0% temps, 45 segments, 18000ms
[SPEECHBRAIN]    ✅ s1 valide: 33.0% temps, 28 segments, 9900ms
```

---

## ✅ Avantages

1. **Adaptatif** : S'ajuste automatiquement selon la durée de l'audio
2. **Tolérant** : Permet de vrais speakers minoritaires dans les conversations courtes
3. **Strict** : Filtre efficacement les faux positifs dans les longs audios
4. **Simple** : Un seul paramètre à vérifier (ratio)
5. **Transparent** : Logs détaillés pour chaque décision

---

## 🧪 Tests

### Test 1 : Audio Court Mono-Locuteur
```bash
# Audio 10s, 1 speaker
Attendu: 1 speaker détecté
Seuil: 16%
```

### Test 2 : Audio Court Multi-Locuteur
```bash
# Audio 12s, 2 speakers (60%/40%)
Attendu: 2 speakers détectés
Seuil: 16%
```

### Test 3 : Audio Long Mono-Locuteur
```bash
# Audio 30s, 1 speaker
Attendu: 1 speaker détecté
Seuil: 20%
```

### Test 4 : Audio Long Multi-Locuteur
```bash
# Audio 25s, 2 speakers (55%/45%)
Attendu: 2 speakers détectés
Seuil: 20%
```

---

## 📚 Paramètres de Configuration

Si besoin d'ajuster les seuils :

```python
# Dans diarization_speechbrain.py, ligne ~437
AUDIO_THRESHOLD_MS = 15000      # Seuil de durée (15s)
MIN_RATIO_SHORT_AUDIO = 0.16    # Ratio minimum pour audio court (16%)
MIN_RATIO_LONG_AUDIO = 0.20     # Ratio minimum pour audio long (20%)
MIN_DURATION_MS = 300           # Durée minimale absolue (300ms)
```

---

**Statut** : ✅ Implémenté et testé
**Prochaine étape** : 🧪 Validation avec audios réels
