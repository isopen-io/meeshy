# Correction : Utiliser les segments de mots natifs de Whisper

## 🚨 Problème identifié

Actuellement, on **réinvente la roue** :
1. ✅ On active `word_timestamps=True` dans Whisper
2. ❌ On **ignore** `segment.words` (les mots avec timestamps précis)
3. ❌ On crée manuellement `split_segments_into_words()` pour diviser les phrases
4. ❌ On interpole les timestamps au lieu d'utiliser les vrais timestamps de Whisper

## 📊 Structure native de Faster-Whisper

Quand on appelle `model.transcribe(audio, word_timestamps=True)` :

```python
segments, info = model.transcribe(audio, word_timestamps=True)

for segment in segments:
    # Segment au niveau de la phrase
    print(f"Phrase: {segment.text}")
    print(f"Temps: {segment.start}s -> {segment.end}s")

    # ✅ MOTS INDIVIDUELS avec timestamps précis
    for word in segment.words:
        print(f"  [{word.start:.2f}s -> {word.end:.2f}s] {word.word}")
        print(f"  Confiance: {word.probability}")
```

### Exemple de sortie

```
Phrase: "Bonjour comment allez-vous aujourd'hui mon ami"
Temps: 0.0s -> 3.0s
  [0.00s -> 0.48s] Bonjour
  [0.50s -> 0.92s] comment
  [0.94s -> 1.38s] allez
  [1.40s -> 1.62s] vous
  [1.64s -> 2.24s] aujourd'hui
  [2.26s -> 2.58s] mon
  [2.60s -> 3.00s] ami
```

### Structure des objets

```python
# Segment (phrase complète)
class Segment:
    text: str          # "Bonjour comment allez-vous..."
    start: float       # 0.0 (secondes)
    end: float         # 3.0 (secondes)
    avg_logprob: float # Confiance du segment
    words: List[Word]  # ✅ MOTS INDIVIDUELS !

# Word (mot individuel)
class Word:
    word: str          # "Bonjour"
    start: float       # 0.0 (secondes)
    end: float         # 0.48 (secondes)
    probability: float # 0.95 (confiance du mot)
```

---

## ❌ Code actuel (PROBLÉMATIQUE)

```python
# services/translator/src/services/transcription_service.py (ligne 306-317)

segments = []
if return_timestamps:
    # Créer les segments originaux de Whisper
    for s in segments_list:
        segments.append(TranscriptionSegment(
            text=s.text.strip(),        # Phrase complète !
            start_ms=int(s.start * 1000),
            end_ms=int(s.end * 1000),
            confidence=getattr(s, 'avg_logprob', 0.0)
        ))

    # ❌ Division manuelle avec interpolation !
    segments = split_segments_into_words(segments, max_words=5)
```

**Problèmes :**
- On utilise `s.text` (phrase complète) au lieu de `s.words` (mots individuels)
- On crée `split_segments_into_words()` pour diviser manuellement
- On **interpole** les timestamps au lieu d'utiliser les vrais timestamps de Whisper
- Moins précis que les timestamps natifs de Whisper

---

## ✅ Code corrigé (UTILISER segment.words)

```python
# services/translator/src/services/transcription_service.py (ligne 306-320)

segments = []
if return_timestamps:
    # Utiliser les mots individuels de Whisper (plus précis !)
    for s in segments_list:
        # Vérifier si le segment a des words
        if hasattr(s, 'words') and s.words:
            # ✅ Utiliser les timestamps NATIFS de Whisper
            for word in s.words:
                segments.append(TranscriptionSegment(
                    text=word.word.strip(),
                    start_ms=int(word.start * 1000),
                    end_ms=int(word.end * 1000),
                    confidence=getattr(word, 'probability', 0.0)
                ))
        else:
            # Fallback : segment complet si pas de words
            segments.append(TranscriptionSegment(
                text=s.text.strip(),
                start_ms=int(s.start * 1000),
                end_ms=int(s.end * 1000),
                confidence=getattr(s, 'avg_logprob', 0.0)
            ))

# ❌ SUPPRIMER cette ligne - plus besoin de division manuelle !
# segments = split_segments_into_words(segments, max_words=5)
```

**Avantages :**
- ✅ Timestamps **exacts** de Whisper (pas d'interpolation)
- ✅ Confiance par mot (plus précise que par phrase)
- ✅ Pas de division manuelle
- ✅ Code plus simple et plus fiable

---

## 🎯 Comparaison

### Avant (interpolation manuelle)

```json
{
  "text": "Bonjour comment allez-vous aujourd'hui",
  "startMs": 0,
  "endMs": 2142,
  "confidence": 0.95
}
```
Divisé manuellement en :
```json
[
  {"text": "Bonjour comment allez-vous aujourd'hui", "startMs": 0, "endMs": 2142}
]
```
→ **Timestamps interpolés linéairement** (imprécis)

### Après (timestamps natifs Whisper)

```json
[
  {"text": "Bonjour", "startMs": 0, "endMs": 480, "confidence": 0.96},
  {"text": "comment", "startMs": 500, "endMs": 920, "confidence": 0.94},
  {"text": "allez", "startMs": 940, "endMs": 1380, "confidence": 0.95},
  {"text": "vous", "startMs": 1400, "endMs": 1620, "confidence": 0.93},
  {"text": "aujourd'hui", "startMs": 1640, "endMs": 2240, "confidence": 0.92}
]
```
→ **Timestamps exacts de Whisper** (précis au mot près)

---

## 🎤 Speaker Diarization (tagging des locuteurs)

**Whisper NE fait PAS de diarization nativement !**

Pour identifier et taguer les locuteurs, il faut utiliser des bibliothèques séparées :

### 1. **WhisperX** (recommandé)
- Extension de Whisper avec diarization intégrée
- Utilise pyannote.audio pour la diarization
- Alignement précis des timestamps
- GitHub: https://github.com/m-bain/whisperX

```python
import whisperx

# Transcription + Diarization
result = whisperx.transcribe(audio, batch_size=16)
result = whisperx.align(result["segments"], model, audio)

# Diarization
diarization = whisperx.diarize(audio)
result = whisperx.assign_speakers(result, diarization)

# Résultat avec speaker tags
for segment in result["segments"]:
    print(f"[{segment['start']:.2f}s - {segment['end']:.2f}s] Speaker {segment['speaker']}: {segment['text']}")
```

### 2. **pyannote.audio** (standalone)
- Bibliothèque de diarization de référence
- Pré-entraîné sur VoxCeleb
- Nécessite un token HuggingFace

```python
from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")
diarization = pipeline(audio)

# Résultat avec speaker segments
for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"[{turn.start:.2f}s - {turn.end:.2f}s] {speaker}")
```

### 3. **Resemblyzer**
- Extraction d'embeddings vocaux
- Identification de locuteurs par similarité

---

## 📋 Modifications recommandées

### 1. Corriger `transcription_service.py`

**Fichier:** `services/translator/src/services/transcription_service.py`

**Supprimer :**
```python
# Import inutile
from ..utils.segment_splitter import split_segments_into_words

# Ligne 317 - Division manuelle
segments = split_segments_into_words(segments, max_words=5)
```

**Remplacer (lignes 306-317) par :**
```python
segments = []
if return_timestamps:
    for s in segments_list:
        # Utiliser les mots individuels de Whisper
        if hasattr(s, 'words') and s.words:
            for word in s.words:
                segments.append(TranscriptionSegment(
                    text=word.word.strip(),
                    start_ms=int(word.start * 1000),
                    end_ms=int(word.end * 1000),
                    confidence=getattr(word, 'probability', 0.0)
                ))
        else:
            # Fallback si pas de words
            segments.append(TranscriptionSegment(
                text=s.text.strip(),
                start_ms=int(s.start * 1000),
                end_ms=int(s.end * 1000),
                confidence=getattr(s, 'avg_logprob', 0.0)
            ))
```

### 2. Supprimer le fichier inutile

```bash
rm services/translator/src/utils/segment_splitter.py
```

### 3. (Optionnel) Ajouter la diarization avec WhisperX

Si tu veux le tagging des locuteurs, il faudrait :
1. Installer WhisperX : `pip install whisperx`
2. Modifier le pipeline pour utiliser WhisperX au lieu de faster-whisper
3. Remplir les champs `speakerCount`, `primarySpeakerId`, `speakerAnalysis`

---

## ✅ Avantages de la correction

| Aspect | Avant (interpolation) | Après (natif Whisper) |
|--------|----------------------|----------------------|
| **Précision timestamps** | Interpolés (imprécis) | Exacts (Whisper) |
| **Confiance** | Par phrase | Par mot |
| **Complexité** | Division manuelle | Utilisation directe |
| **Performance** | Calcul supplémentaire | Aucun calcul |
| **Fiabilité** | Dépend de l'interpolation | Dépend de Whisper |
| **Granularité** | Chunks de 1-5 mots | Mots individuels |

---

## 📚 Sources

- [faster-whisper word_timestamps documentation](https://github.com/SYSTRAN/faster-whisper/issues/12)
- [Whisper word-level timestamps discussion](https://github.com/openai/whisper/discussions/1855)
- [WhisperX - Automatic Speech Recognition with Word-level Timestamps & Diarization](https://github.com/m-bain/whisperX)
- [Word-Level Timestamping: Build Faster STT Apps | Groq](https://groq.com/blog/build-fast-with-word-level-timestamping)
- [whisper-timestamped - Multilingual ASR with word-level timestamps](https://github.com/linto-ai/whisper-timestamped)

---

## 🎯 Conclusion

**Notre fonction `split_segments_into_words()` est inutile !**

Whisper fournit déjà :
- ✅ Timestamps au niveau des mots
- ✅ Confiance par mot
- ✅ Précision optimale

Il suffit d'utiliser `segment.words` directement au lieu de réinventer la roue avec des interpolations linéaires imprécises.

Pour la diarization (speaker tagging), il faut intégrer **WhisperX** ou **pyannote.audio**, car Whisper ne fait pas de diarization nativement.
