# Implémentation Multi-Speaker TTS avec Préservation des Silences

## Vue d'ensemble

Cette implémentation ajoute le support complet de la synthèse audio multi-locuteurs avec préservation des voix individuelles et des silences naturels dans le pipeline de traduction audio.

## Architecture

### Modules créés

#### 1. `audio_silence_manager.py`
Gère la détection, la préservation et la génération de silences audio.

**Fonctionnalités:**
- Détection des silences entre segments de transcription
- Génération de fichiers audio de silence
- Concaténation d'audios avec préservation des silences
- Option pour supprimer les silences (`preserve_silences=False`)

**Classes principales:**
- `SilenceSegment`: Représente un silence entre deux segments
- `AudioSegmentWithSilence`: Segment audio enrichi avec info de silence
- `AudioSilenceManager`: Gestionnaire principal

**Paramètres configurables:**
- `preserve_silences`: Préserver (True) ou supprimer (False) les silences
- `min_silence_ms`: Durée minimale d'un silence (défaut: 100ms)
- `max_silence_ms`: Durée maximale d'un silence (défaut: 3000ms)
- `silence_threshold_db`: Seuil de détection en dB (défaut: -40dB)

#### 2. `multi_speaker_synthesis.py`
Gère la synthèse TTS multi-locuteurs avec clonage vocal par speaker.

**Fonctionnalités:**
- Création de mappings `speaker_id → voice_model`
- Groupement des segments par speaker
- Synthèse TTS par segment avec la voix appropriée
- Concaténation des résultats avec préservation des silences

**Classes principales:**
- `SpeakerVoiceMap`: Mapping speaker → modèle vocal
- `SegmentSynthesisResult`: Résultat de synthèse d'un segment
- `MultiSpeakerSynthesizer`: Synthétiseur principal

**Pipeline de synthèse:**
1. Analyser les segments pour identifier les speakers uniques
2. Créer un voice model pour chaque speaker
3. Synthétiser chaque segment avec la bonne voix
4. Concaténer avec les silences appropriés

#### 3. Modifications dans `translation_stage.py`
Le `TranslationStage` a été modifié pour supporter le mode multi-speakers.

**Nouvelles fonctionnalités:**
- Détection automatique du mode (mono-speaker vs multi-speaker)
- Traduction segment par segment pour multi-speakers
- Synthèse avec préservation des voix et silences
- Fallback vers synthèse mono-speaker classique

## Utilisation

### Mode automatique

Le système détecte automatiquement si l'audio est multi-speakers :

```python
# Le pipeline détecte automatiquement le mode
translations = await translation_stage.process_languages(
    target_languages=['fr', 'es'],
    source_text="Hello how are you?",
    source_language='en',
    audio_hash='abc123',
    voice_model=user_voice_model,
    message_id='msg_001',
    attachment_id='att_001',
    source_audio_path='/path/to/audio.mp3',
    source_segments=segments,  # ← Segments avec speaker_id
    diarization_result=diarization  # ← Résultat de diarisation
)
```

**Critères de détection:**
- Mode **MULTI-SPEAKER** : Plus de 1 `speaker_id` unique dans les segments
- Mode **MONO-SPEAKER** : 0 ou 1 `speaker_id` unique

### Configuration des silences

```python
# Avec préservation des silences (par défaut)
translation_stage = create_translation_stage(
    translation_service=translation_service,
    tts_service=tts_service,
    voice_clone_service=voice_clone_service,
    preserve_silences=True  # ← Préserver les silences naturels
)

# Sans préservation des silences
translation_stage = create_translation_stage(
    translation_service=translation_service,
    tts_service=tts_service,
    voice_clone_service=voice_clone_service,
    preserve_silences=False  # ← Supprimer les silences
)
```

### Configuration avancée

```python
# Configuration manuelle du silence manager
from services.audio_pipeline.audio_silence_manager import create_silence_manager

silence_manager = create_silence_manager(
    preserve_silences=True,
    min_silence_ms=100,      # Silences < 100ms ignorés
    max_silence_ms=3000,     # Silences > 3s cappés à 3s
    silence_threshold_db=-40 # Seuil de détection
)

# Configuration manuelle du multi-speaker synthesizer
from services.audio_pipeline.multi_speaker_synthesis import create_multi_speaker_synthesizer

multi_speaker_synth = create_multi_speaker_synthesizer(
    tts_service=tts_service,
    voice_clone_service=voice_clone_service,
    preserve_silences=True,
    temp_dir='/tmp/multi_speaker_tts'
)
```

## Workflow détaillé

### 1. Mode MONO-SPEAKER (comportement existant)

```
1. Traduire le texte complet
2. Synthétiser avec une seule voix
3. Re-transcrire l'audio traduit
4. Retourner le résultat
```

### 2. Mode MULTI-SPEAKER (nouveau)

```
1. Détecter les speakers uniques dans les segments
2. Traduire chaque segment individuellement
   └─ Cache utilisé pour éviter les traductions dupliquées
3. Créer les voice models par speaker
   ├─ Utiliser le modèle utilisateur existant si identifié
   └─ Créer des modèles temporaires pour les autres speakers
4. Détecter les silences entre segments
   ├─ Calculer les durées
   ├─ Capper à max_silence_ms
   └─ Filtrer selon min_silence_ms
5. Synthétiser chaque segment avec sa voix
   ├─ TTS avec le voice model approprié
   └─ Gestion des erreurs par segment
6. Concaténer les audios
   ├─ Insérer les silences appropriés
   └─ Maintenir l'ordre chronologique
7. Re-transcrire l'audio final (optionnel)
8. Retourner le résultat
```

## Format des segments

Les segments doivent avoir cette structure :

```python
{
    "text": "Hello",
    "start_ms": 0,          # ou "startMs"
    "end_ms": 500,          # ou "endMs"
    "speaker_id": "s0",     # ou "speakerId"
    "confidence": 0.95,
    "voice_similarity_score": 0.85  # ou "voiceSimilarityScore"
}
```

## Logs et monitoring

Le système génère des logs détaillés :

```
[TRANSLATION_STAGE] Mode détecté: MULTI-SPEAKER (3 speaker(s) unique(s))
[TRANSLATION_STAGE] 🎭 Utilisation synthèse MULTI-SPEAKER: 15 segments, 3 speakers
[TRANSLATION_STAGE] Traduction de 15 segments: en → fr
[MULTI_SPEAKER_SYNTH] 🎤 Création des voice models par speaker...
[MULTI_SPEAKER_SYNTH] Speakers détectés: 3 → ['s0', 's1', 's2']
[MULTI_SPEAKER_SYNTH]   • s0: utilisation du modèle utilisateur existant
[MULTI_SPEAKER_SYNTH]   • s1: création modèle temporaire (5 segments, 3500ms)
[MULTI_SPEAKER_SYNTH]   • s2: création modèle temporaire (3 segments, 2100ms)
[SILENCE_MANAGER] Silences détectés: 14 (durée totale: 2800ms)
[MULTI_SPEAKER_SYNTH] 🔗 Concaténation: 15 audios, 14 silences
[MULTI_SPEAKER_SYNTH] ✅ Synthèse multi-speaker terminée: output.mp3 (durée: 12500ms)
```

## Intégration dans le pipeline existant

### Modification nécessaire dans `audio_message_pipeline.py`

Le pipeline doit maintenant passer les segments et le résultat de diarisation :

```python
# Avant
translations = await translation_stage.process_languages(
    target_languages=target_languages,
    source_text=transcription_result.text,
    source_language=source_lang,
    audio_hash=audio_hash,
    voice_model=voice_model,
    message_id=message_id,
    attachment_id=attachment_id,
    source_audio_path=audio_path
)

# Après
translations = await translation_stage.process_languages(
    target_languages=target_languages,
    source_text=transcription_result.text,
    source_language=source_lang,
    audio_hash=audio_hash,
    voice_model=voice_model,
    message_id=message_id,
    attachment_id=attachment_id,
    source_audio_path=audio_path,
    source_segments=transcription_result.segments,  # ← Ajouter
    diarization_result=diarization_result           # ← Ajouter
)
```

## Dépendances

Le système nécessite `pydub` pour la manipulation audio :

```bash
pip install pydub
```

Si `pydub` n'est pas disponible, le système fonctionne en mode dégradé :
- ⚠️ Concaténation désactivée
- ⚠️ Génération de silences désactivée
- ✅ Détection de silences reste fonctionnelle

## Tests et validation

### Test basique mono-speaker

```python
# Devrait utiliser le mode MONO-SPEAKER classique
segments = [
    {"text": "Hello", "start_ms": 0, "end_ms": 500, "speaker_id": "s0"}
]
```

### Test multi-speakers

```python
# Devrait utiliser le mode MULTI-SPEAKER
segments = [
    {"text": "Hello", "start_ms": 0, "end_ms": 500, "speaker_id": "s0"},
    {"text": "Hi", "start_ms": 600, "end_ms": 900, "speaker_id": "s1"},
    {"text": "How are you?", "start_ms": 1000, "end_ms": 1500, "speaker_id": "s0"}
]
```

### Test sans silences

```python
# Les silences seront supprimés
translation_stage = create_translation_stage(
    preserve_silences=False
)
```

## Optimisations futures

1. **Extraction audio par speaker**
   - Actuellement, on utilise l'audio complet pour créer les voice models temporaires
   - TODO: Extraire uniquement les segments de chaque speaker pour un meilleur clonage

2. **Cache des voice models temporaires**
   - Les voice models temporaires sont recréés à chaque fois
   - TODO: Cacher les embeddings par speaker pour réutilisation

3. **Parallélisation de la synthèse par segment**
   - Actuellement séquentiel
   - TODO: Synthétiser les segments en parallèle avec ThreadPoolExecutor

4. **Ajustement automatique des silences**
   - Les silences sont préservés tels quels
   - TODO: Ajuster selon le ratio de vitesse de parole (TTS vs original)

## Compatibilité

✅ **Compatible** avec le système existant :
- Détection automatique du mode
- Fallback vers mono-speaker si pas de speaker_id
- Tous les paramètres existants préservés

✅ **Rétrocompatible** :
- Si `source_segments` non fourni → mode mono-speaker
- Si `preserve_silences` non spécifié → True par défaut

## Résumé des fichiers modifiés/créés

### Nouveaux fichiers
- `services/translator/src/services/audio_pipeline/audio_silence_manager.py`
- `services/translator/src/services/audio_pipeline/multi_speaker_synthesis.py`

### Fichiers modifiés
- `services/translator/src/services/audio_pipeline/translation_stage.py`
- `services/translator/src/utils/smart_segment_merger.py` (correction du bug de fusion)

### Fichiers à modifier (pour intégration complète)
- `services/translator/src/services/audio_pipeline/audio_message_pipeline.py` (passer segments + diarization)

## Support et maintenance

En cas de problème :
1. Vérifier les logs `[TRANSLATION_STAGE]`, `[MULTI_SPEAKER_SYNTH]`, `[SILENCE_MANAGER]`
2. Vérifier que les segments ont des `speaker_id` valides
3. Vérifier que `pydub` est installé
4. Tester avec `preserve_silences=False` pour isoler les problèmes de silences

---

**Date d'implémentation**: 2026-01-20
**Version**: 1.0.0
