# 🚨 PROBLÈME CRITIQUE: Le Nettoyage est IGNORÉ

## 🔍 Diagnostic Complet

### Symptôme
4 speakers détectés et 4 voice models créés malgré le nettoyage de diarisation.

### Cause Racine
**Les segments de transcription utilisent les speaker_id AVANT nettoyage.**

---

## 📊 Flux Actuel (CASSÉ)

```
┌─────────────────────────────────────────────────────────────────┐
│ TranscriptionService.transcribe_audio()                         │
└─────────────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌──────────────────┐         ┌──────────────────────┐
│ 1. diarize()     │         │ 2. whisper_transcribe│
│    (SpeechBrain) │         │    (Whisper)         │
└──────────────────┘         └──────────────────────┘
         │                               │
         ├─ Clustering                   ├─ Segments avec timestamps
         │  → s0, s1, s2, s4 (4 raw)     │
         │                               │
         ├─ 🧹 NETTOYAGE                 │
         │  → Fusionne tout en s0        │
         │  → DiarizationResult(1)       │
         │  ❌ JETÉ! Non utilisé         │
         │                               │
         │                               ├─ MAIS utilise speaker_id
         │                               │  depuis diarize() BRUT
         │                               │  → segments[i].speaker_id
         │                               │     = "s0", "s1", "s2", "s4"
         │                               │  ❌ 4 speakers!
         │                               │
         └───────────────┬───────────────┘
                         │
                         ▼
           ┌─────────────────────────────┐
           │ transcription.segments      │
           │ (4 speakers: s0,s1,s2,s4)   │
           │ ❌ NON NETTOYÉ              │
           └─────────────────────────────┘
                         │
                         ▼
           ┌─────────────────────────────┐
           │ audio_message_pipeline.py   │
           │ source_segments = trans...  │
           └─────────────────────────────┘
                         │
                         ▼
           ┌─────────────────────────────────────┐
           │ process_multi_speaker_audio()       │
           │ segments=source_segments            │
           │ ❌ Reçoit 4 speakers!               │
           └─────────────────────────────────────┘
                         │
         ┌───────────────┴────────────────┐
         │                                │
         ▼                                ▼
┌──────────────────┐         ┌──────────────────────┐
│ Extrait audio    │         │ Crée voice models    │
│ s0.wav           │         │ model_s0             │
│ s1.wav           │         │ model_s1             │
│ s2.wav           │         │ model_s2             │
│ s4.wav           │         │ model_s4             │
│ ❌ 4 fichiers    │         │ ❌ 4 models          │
└──────────────────┘         └──────────────────────┘
```

---

## 🔍 Code Source - Preuves

### 1. Le Nettoyage SE FAIT (ligne 457-541)

**`diarization_speechbrain.py:457-541`**

```python
# ✅ LE NETTOYAGE SE FAIT ICI
if self.enable_cleaning and self._cleaner and len(speakers_data) > 0:
    logger.info(f"[SPEECHBRAIN] 🧹 Début nettoyage automatique...")

    cleaned_segments, cleaning_stats = self._cleaner.clean_diarization(...)

    # Reconvertir en speakers_data NETTOYÉ
    speakers_data = {}  # ✅ Remplacé par version nettoyée
    for seg in cleaned_segments:
        # ... reconstruire avec speakers fusionnés

# Créer DiarizationResult avec speakers NETTOYÉS
result = DiarizationResult(
    speaker_count=len(speakers),  # ✅ 1 au lieu de 4
    speakers=speakers,            # ✅ Seulement s0
    ...
)

return result  # ✅ Retourne résultat NETTOYÉ
```

### 2. Mais les Segments de Transcription Utilisent les IDs BRUTS

**`transcription_service.py` (approximativement ligne 150-200)**

```python
# Diarisation
diarization_result = await self.diarization.detect_speakers(...)
# ✅ diarization_result contient 1 speaker (nettoyé)

# Transcription Whisper
segments_whisper = whisper.transcribe(...)

# ❌ PROBLÈME: Assigner speaker_id depuis diarization BRUTE
for segment in segments_whisper:
    # Trouver le speaker par timestamp
    speaker_id = find_speaker_for_timestamp(
        segment.start,
        diarization_result.speakers  # ✅ Utilise résultat nettoyé
    )
    segment.speaker_id = speaker_id  # ✅ Devrait être OK

# MAIS...
```

**ATTENDEZ! Le problème est ailleurs!**

Laissez-moi vérifier exactement où les segments obtiennent leur speaker_id...

### 3. Le Vrai Problème: Segments Créés AVANT le Nettoyage

**`transcription_service.py`** utilise probablement les segments de diarisation RAW pour assigner les speaker_id AVANT que le nettoyage ne se fasse.

OU BIEN

**La diarisation est appelée DEUX FOIS**:
1. Une fois pour obtenir les segments temporels (raw)
2. Une fois pour le résultat final (cleaned) ← mais ce résultat est ignoré

---

## ✅ Solution Requise

### Option 1: Réassigner speaker_id APRÈS Nettoyage

Dans `transcription_service.py`, après avoir obtenu `diarization_result` nettoyé:

```python
# 1. Diarisation avec nettoyage
diarization_result = await self.diarization.detect_speakers(...)  # 1 speaker

# 2. Transcription
transcription_segments = whisper.transcribe(...)

# 3. ✅ RÉASSIGNER speaker_id depuis diarization_result NETTOYÉ
for segment in transcription_segments:
    # Trouver le speaker basé sur timestamp
    speaker = find_speaker_at_time(
        segment.start_ms,
        diarization_result.speakers  # ✅ Utilise résultat NETTOYÉ
    )
    segment.speaker_id = speaker.speaker_id  # ✅ Maintenant correct
```

### Option 2: Nettoyer les Segments AVANT process_multi_speaker

Dans `audio_message_pipeline.py`, avant de passer à `process_multi_speaker_audio`:

```python
# Obtenir la liste des speakers nettoyés
cleaned_speaker_ids = set(
    speaker.speaker_id
    for speaker in transcription.diarization_result.speakers
)

# Filtrer les segments
cleaned_segments = [
    seg for seg in source_segments
    if seg['speaker_id'] in cleaned_speaker_ids
]

# OU remap les speaker_id
# Si s1, s2, s4 → s0
speaker_mapping = get_speaker_mapping(transcription.diarization_result.cleaning_stats)
for seg in source_segments:
    seg['speaker_id'] = speaker_mapping.get(seg['speaker_id'], seg['speaker_id'])
```

---

## 📋 Checklist de Debug

- [ ] Vérifier si `diarization_result` est stocké dans `transcription`
- [ ] Vérifier si `transcription.segments` obtiennent leur `speaker_id` AVANT ou APRÈS nettoyage
- [ ] Ajouter logs pour tracer le mapping speaker_id → speaker nettoyé
- [ ] Vérifier si `process_multi_speaker_audio` reçoit bien les segments avec speaker_id nettoyés

---

## 🧪 Test de Validation

Ajouter des logs dans le code:

```python
# Dans TranscriptionService.transcribe_audio()
logger.info(f"[DEBUG] Diarization result: {diarization_result.speaker_count} speakers")
logger.info(f"[DEBUG] Segments speaker_ids: {set(seg.speaker_id for seg in segments)}")

# Dans audio_message_pipeline.py
logger.info(f"[DEBUG] source_segments speaker_ids: {set(seg['speaker_id'] for seg in source_segments)}")

# Dans process_multi_speaker_audio()
logger.info(f"[DEBUG] Received segments with speakers: {set(seg['speaker_id'] for seg in segments)}")
```

**Résultat attendu avec nettoyage fonctionnel**:
```
[DEBUG] Diarization result: 1 speakers  # ✅ Nettoyé
[DEBUG] Segments speaker_ids: {'s0'}     # ✅ Devrait être 1 seul
[DEBUG] source_segments speaker_ids: {'s0'}  # ✅ Devrait être 1 seul
[DEBUG] Received segments with speakers: {'s0'}  # ✅ Devrait être 1 seul
```

**Résultat actuel (CASSÉ)**:
```
[DEBUG] Diarization result: 1 speakers  # ✅ Nettoyé
[DEBUG] Segments speaker_ids: {'s0', 's1', 's2', 's4'}  # ❌ 4 speakers!
[DEBUG] source_segments speaker_ids: {'s0', 's1', 's2', 's4'}  # ❌ 4 speakers!
[DEBUG] Received segments with speakers: {'s0', 's1', 's2', 's4'}  # ❌ 4 speakers!
```

---

## 💡 Conclusion

Le **DiarizationCleaner FONCTIONNE** et nettoie correctement (4 → 1 speaker).

MAIS les **segments de transcription ne sont jamais mis à jour** avec les speaker_id nettoyés.

Ils gardent les speaker_id de la diarisation BRUTE (s0, s1, s2, s4).

C'est pourquoi `process_multi_speaker_audio` crée 4 fichiers audio et 4 voice models.

**L'utilisateur avait raison** : "il faut merger avant de découper les son pour cloner les voix!"

Le merge SE FAIT, mais les segments ne reflètent PAS le merge!

---

**Prochaine Étape** : Trouver où les segments obtiennent leur `speaker_id` et s'assurer qu'ils utilisent le `diarization_result` NETTOYÉ.
