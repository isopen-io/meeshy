# Option D : Fusion Intelligente des Segments

**Date** : 19 janvier 2026
**Objectif** : Créer des segments naturels adaptés au rythme de la parole

---

## 🎯 Le Problème

Avec les segments mot-par-mot de Whisper, on obtient **beaucoup** de segments :

```
"Bonjour comment allez-vous aujourd'hui ?"
→ 5 segments individuels
```

**Trop de segments** :
- ❌ Charge le frontend avec des milliers de petits éléments
- ❌ Difficulté d'affichage pour les sous-titres
- ❌ Pas naturel pour la lecture

**Mais on ne veut PAS perdre la précision !**

---

## ✅ La Solution : Option D

**Fusion intelligente basée sur 2 critères** :

### Critère 1 : Pause courte (< 90ms)
Les mots prononcés rapidement sont probablement liés.

### Critère 2 : Total court (< 8 caractères)
Ne fusionner que les petits mots pour garder la lisibilité.

### Résultat
Des segments **naturels** qui respectent le rythme de la parole !

---

## 📊 Exemples Concrets

### Exemple 1 : Articles et petits mots

**Input** (Whisper mot-par-mot) :
```json
[
  {"text": "le", "start_ms": 0, "end_ms": 200},
  {"text": "chat", "start_ms": 210, "end_ms": 500},    // pause 10ms
  {"text": "mange", "start_ms": 600, "end_ms": 900}   // pause 100ms
]
```

**Output** (après fusion intelligente) :
```json
[
  {"text": "le chat", "start_ms": 0, "end_ms": 500},  // ✅ Fusionné
  {"text": "mange", "start_ms": 600, "end_ms": 900}   // ✅ Séparé
]
```

**Pourquoi ?**
- "le" + "chat" : pause 10ms < 90ms ET 6 chars < 8 → **fusionné**
- "chat" + "mange" : pause 100ms > 90ms → **séparé**

---

### Exemple 2 : Mots longs restent séparés

**Input** :
```json
[
  {"text": "Bonjour", "start_ms": 0, "end_ms": 480},
  {"text": "comment", "start_ms": 500, "end_ms": 920}  // pause 20ms
]
```

**Output** :
```json
[
  {"text": "Bonjour", "start_ms": 0, "end_ms": 480},   // ✅ Séparé
  {"text": "comment", "start_ms": 500, "end_ms": 920}  // ✅ Séparé
]
```

**Pourquoi ?**
- "Bonjour" + "comment" : 14 chars > 8 → **séparé**

---

### Exemple 3 : Phrase complète

**Input** :
```json
[
  {"text": "Je", "start_ms": 0, "end_ms": 150},
  {"text": "vais", "start_ms": 160, "end_ms": 350},   // pause 10ms
  {"text": "bien", "start_ms": 370, "end_ms": 580},   // pause 20ms
  {"text": "merci", "start_ms": 700, "end_ms": 1000}  // pause 120ms
]
```

**Output** :
```json
[
  {"text": "Je vais", "start_ms": 0, "end_ms": 350},    // ✅ Fusionné
  {"text": "bien", "start_ms": 370, "end_ms": 580},    // ✅ Séparé (total deviendrait 12 chars)
  {"text": "merci", "start_ms": 700, "end_ms": 1000}   // ✅ Séparé (pause > 90ms)
]
```

**Pourquoi ?**
- "Je" + "vais" : pause 10ms < 90ms ET 7 chars < 8 → **fusionné**
- + "bien" : 11 chars > 8 → **séparé**
- "bien" + "merci" : pause 120ms > 90ms → **séparé**

---

## 🔧 Algorithme

```python
def merge_short_segments(segments, max_pause_ms=90, max_total_chars=8):
    """
    Fusionne intelligemment les segments de mots courts.
    """
    merged = []
    current_group = [segments[0]]

    for next_segment in segments[1:]:
        # Calculer la pause
        pause = next_segment.start_ms - current_group[-1].end_ms

        # Calculer la longueur totale si on fusionne
        total_text = " ".join([s.text for s in current_group] + [next_segment.text])
        total_chars = len(total_text)

        # Décider si on fusionne
        if pause < max_pause_ms and total_chars <= max_total_chars:
            # Ajouter au groupe courant
            current_group.append(next_segment)
        else:
            # Finaliser le groupe et démarrer un nouveau
            merged.append(merge_group(current_group))
            current_group = [next_segment]

    # Finaliser le dernier groupe
    merged.append(merge_group(current_group))

    return merged
```

---

## 📈 Statistiques de Réduction

Exemple sur une phrase de 20 mots :

| Méthode | Nombre de segments | Réduction |
|---------|-------------------|-----------|
| **Mot-par-mot** (natif Whisper) | 20 segments | 0% |
| **Chunks fixes** (1-5 mots) | 6 segments | 70% |
| **Option D** (fusion intelligente) | 8 segments | **60%** |

**Avantages de l'Option D** :
- ✅ Moins de segments que mot-par-mot
- ✅ Plus naturel que les chunks fixes
- ✅ S'adapte au rythme de la parole
- ✅ Préserve les timestamps exacts

---

## 🎨 Impact sur l'Affichage

### Sans fusion (20 segments) :
```
[0.0s] Je
[0.2s] vais
[0.4s] bien
[0.6s] merci
[0.9s] et
[1.0s] vous
[1.2s] comment
[1.5s] allez
[1.7s] vous
[1.9s] aujourd'hui
...
```
→ **Défilement trop rapide, difficile à lire**

### Avec Option D (8 segments) :
```
[0.0s] Je vais
[0.4s] bien
[0.6s] merci
[0.9s] et vous
[1.2s] comment
[1.5s] allez-vous
[1.9s] aujourd'hui
```
→ **Naturel et lisible !**

---

## ⚙️ Configuration

### Paramètres ajustables :

```python
segments = merge_short_segments(
    segments,
    max_pause_ms=90,      # Pause maximale (défaut: 90ms)
    max_total_chars=8     # Longueur maximale (défaut: 8 caractères)
)
```

### Recommandations :

| Cas d'usage | max_pause_ms | max_total_chars |
|-------------|--------------|-----------------|
| **Sous-titres rapides** | 50ms | 6 chars |
| **Standard** (recommandé) | 90ms | 8 chars |
| **Transcription écrite** | 150ms | 12 chars |
| **Mot-par-mot strict** | 0ms | 0 chars |

---

## ✅ Préservation des Données

### Timestamps exacts

```python
# Groupe de 3 mots
["le", "petit", "chat"]
# Timestamps préservés :
start_ms = premier_mot.start_ms  # Début exact du premier mot
end_ms = dernier_mot.end_ms      # Fin exacte du dernier mot
```

→ **Aucune interpolation !**

### Confiance pondérée

```python
# Confiance moyenne pondérée par la durée
confidence = sum(
    word.confidence * word.duration / total_duration
    for word in group
)
```

→ Les mots longs ont plus de poids

### Speaker ID

```python
# Conserve le speaker_id si tous identiques
# Sinon garde le premier (ou None si divergent)
```

→ Compatible avec la diarisation

---

## 🔄 Intégration avec la Diarisation

La fusion intelligente **respecte les frontières de locuteurs** :

```python
# Si speaker_id différent → ne pas fusionner
if current_seg.speaker_id != previous_seg.speaker_id:
    # Finaliser le groupe et démarrer un nouveau
    merged.append(merge_group(current_group))
    current_group = [current_seg]
```

**Exemple** :
```
Speaker A: "Bonjour"     [0-500ms]
Speaker A: "comment"     [520-850ms]  → Fusionné en "Bonjour comment"
Speaker B: "ça va"       [1000-1300ms] → Séparé (différent speaker)
```

---

## 📊 Comparaison des Méthodes

| Critère | Mot-par-mot | Chunks fixes | **Option D** |
|---------|-------------|--------------|--------------|
| **Précision timestamps** | ✅ Exacte | ✅ Exacte | ✅ Exacte |
| **Nombre de segments** | ❌ Très élevé | ✅ Réduit | ✅ Réduit |
| **Naturel** | ❌ Fragmenté | ⚠️ Rigide | ✅ Adaptatif |
| **Performance frontend** | ❌ Lourd | ✅ Léger | ✅ Léger |
| **Lisibilité** | ❌ Difficile | ⚠️ Moyenne | ✅ Excellente |
| **Adaptation au rythme** | ❌ Non | ❌ Non | ✅ Oui |
| **Compatible diarisation** | ✅ Oui | ✅ Oui | ✅ Oui |

---

## 🚀 Utilisation

### Dans le code Python :

```python
# 1. Récupérer les mots de Whisper
for segment in whisper_segments:
    for word in segment.words:
        segments.append(TranscriptionSegment(
            text=word.word.strip(),
            start_ms=int(word.start * 1000),
            end_ms=int(word.end * 1000),
            confidence=word.probability
        ))

# 2. Fusionner intelligemment
from utils.smart_segment_merger import merge_short_segments

segments = merge_short_segments(
    segments,
    max_pause_ms=90,
    max_total_chars=8
)

# 3. Log des statistiques
logger.info(f"Segments: {original_count} → {len(segments)} (réduction {reduction}%)")
```

### Logs de sortie :

```
[TRANSCRIPTION] Fusion intelligente: 47 → 19 segments (réduction 59.6%)
```

---

## 📝 Tests Unitaires

### Test 1 : Fusion de petits mots
```python
input = [
    {"text": "le", "start_ms": 0, "end_ms": 200},
    {"text": "chat", "start_ms": 210, "end_ms": 500}
]
output = merge_short_segments(input)
assert len(output) == 1
assert output[0].text == "le chat"
assert output[0].start_ms == 0
assert output[0].end_ms == 500
```

### Test 2 : Pas de fusion si pause longue
```python
input = [
    {"text": "oui", "start_ms": 0, "end_ms": 300},
    {"text": "non", "start_ms": 500, "end_ms": 700}  # pause 200ms
]
output = merge_short_segments(input, max_pause_ms=90)
assert len(output) == 2
```

### Test 3 : Pas de fusion si trop long
```python
input = [
    {"text": "Bonjour", "start_ms": 0, "end_ms": 500},
    {"text": "monde", "start_ms": 520, "end_ms": 800}  # 12 chars > 8
]
output = merge_short_segments(input, max_total_chars=8)
assert len(output) == 2
```

---

## 🎯 Conclusion

**Option D = Le meilleur des deux mondes** :

✅ **Précision** des timestamps natifs Whisper
✅ **Performance** avec réduction intelligente du nombre de segments
✅ **Naturel** en respectant le rythme de la parole
✅ **Compatible** avec la diarisation des locuteurs

**C'est la solution idéale pour l'affichage de sous-titres avec identification des locuteurs !**

---

**Fichier** : `services/translator/src/utils/smart_segment_merger.py`
**Date** : 19 janvier 2026
**Version** : 1.0
