# 🚀 Actions Requises pour Activer le Nettoyage

## ✅ Résumé du Diagnostic

### Situation Actuelle
- ✅ **sklearn EST installé** dans `.venv` (version 1.7.2)
- ✅ **sklearn EST installé** dans les Dockerfiles
- ✅ **DiarizationCleaner fonctionne** (testé avec succès dans `.venv`)
- ✅ **Threshold augmenté** à 0.60 (ultra-strict)
- ✅ **Window size augmenté** à 2500ms (réduit sur-segmentation)

### Problème
- ❌ **Le service translator ne tourne PAS actuellement**
- ❌ **Quand il tournait**, il n'utilisait probablement PAS le `.venv` avec sklearn
- ❌ **Résultat** : `enable_cleaning=False` → pas de logs `🧹` → 4 speakers créés

---

## 📋 Actions à Effectuer (Par Priorité)

### ✅ 1. **REDÉMARRER LE SERVICE** avec le bon environnement

Choisir UNE des options ci-dessous:

#### Option A: Utiliser Docker (Recommandé)

```bash
cd /Users/smpceo/Documents/v2_meeshy

# Rebuilder l'image avec les nouvelles modifications
docker-compose build translator

# Démarrer le service
docker-compose up -d translator

# Vérifier les logs
docker-compose logs -f translator | grep -E "sklearn|🧹|Nettoyage"
```

**Attendu dans les logs**:
```
✅ scikit-learn available
[SPEECHBRAIN] ✅ Nettoyeur de diarisation activé
[SPEECHBRAIN] 🧹 Début nettoyage automatique
```

#### Option B: Utiliser .venv Local

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator

# Activer .venv
source .venv/bin/activate

# Vérifier sklearn
python -c "import sklearn; print('✅ sklearn:', sklearn.__version__)"

# Démarrer le service
PYTHONPATH=/Users/smpceo/Documents/v2_meeshy/services/translator/src:$PYTHONPATH \
python src/main.py
```

#### Option C: pm2 (Si utilisé)

```bash
# Vérifier la configuration pm2
pm2 list

# Redémarrer translator
pm2 restart translator

# Vérifier les logs
pm2 logs translator | grep -E "sklearn|🧹|Nettoyage"
```

---

### ✅ 2. **VÉRIFIER** que le nettoyage est activé

Après avoir redémarré le service:

```bash
# Tester avec curl (si l'API est exposée)
curl -X POST http://localhost:8001/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "audioPath": "/path/to/test_audio.wav",
    "userId": "test_user"
  }'

# OU utiliser le test Python
cd /Users/smpceo/Documents/v2_meeshy/services/translator
source .venv/bin/activate
python test_sklearn_availability.py
```

**Logs Attendus**:
```
[SPEECHBRAIN] ✅ Nettoyeur de diarisation activé
[SPEECHBRAIN] 🧹 Début nettoyage automatique (4 speakers bruts)...
🧹 Début nettoyage diarisation: 45 segments
🔄 Fusion embeddings: s1 → s0 (sim: 0.912)
🎯 Fusion minoritaire: s1 (8.3%) → s0
✅ Nettoyage terminé: 4 → 1 speakers
[SPEECHBRAIN] ✅ Nettoyage terminé: 4 → 1 speaker(s)
```

---

### ✅ 3. **TESTER** avec l'audio problématique

Une fois le service redémarré avec sklearn:

```bash
# Utiliser l'audio qui détectait 4 speakers
# Maintenant devrait détecter 1 seul speaker

curl -X POST http://localhost:8001/transcribe \
  -F "audio=@/path/to/audio_4s_1person.wav" \
  -F "userId=test_user"
```

**Résultat Attendu**:
```json
{
  "speakerCount": 1,
  "primarySpeakerId": "s0",
  "speakers": [
    {
      "speakerId": "s0",
      "segments": [...],
      "speakingTimeMs": 4000,
      "speakingRatio": 1.0
    }
  ]
}
```

**Au lieu de** (avant):
```json
{
  "speakerCount": 4,  // ❌
  "speakers": [
    {"speakerId": "s0", ...},
    {"speakerId": "s1", ...},
    {"speakerId": "s2", ...},
    {"speakerId": "s4", ...}
  ]
}
```

---

## 🔍 Diagnostic Si Ça Ne Fonctionne Pas

### Vérification 1: sklearn est-il chargé?

Ajouter un log temporaire dans `diarization_speechbrain.py` ligne 88:

```python
def __init__(self, models_dir: Optional[str] = None, enable_cleaning: bool = True):
    # ... code existant ...

    if self.enable_cleaning:
        try:
            # AJOUTER CE LOG
            import sklearn
            logger.info(f"[SPEECHBRAIN] 🔍 sklearn version: {sklearn.__version__}")

            from services.audio_processing.diarization_cleaner import (
                DiarizationCleaner,
                merge_consecutive_same_speaker
            )
            # ... reste du code
```

### Vérification 2: Le nettoyage est-il appelé?

Logs à chercher dans les sorties du service:

```bash
# Logs positifs ✅
[SPEECHBRAIN] ✅ sklearn version: 1.7.2
[SPEECHBRAIN] ✅ Nettoyeur de diarisation activé
[SPEECHBRAIN] 🧹 Début nettoyage automatique

# Logs négatifs ❌
[SPEECHBRAIN] ⚠️ Nettoyeur non disponible: No module named 'sklearn'
# OU absence totale de logs 🧹
```

### Vérification 3: Les segments utilisent-ils les speaker_id nettoyés?

Dans `transcription_service.py` ligne 486, ajouter:

```python
# AVANT
logger.info(
    f"[TRANSCRIPTION]   Segment {idx}: '{segment.text[:20]}' → "
    f"speaker={speaker.speaker_id}, "
    f"score={speaker.voice_similarity_score}"
)

# AJOUTER APRÈS ligne 495
logger.info(f"[TRANSCRIPTION] 🔍 Diarization speakers count: {len(diarization.speakers)}")
logger.info(f"[TRANSCRIPTION] 🔍 Diarization speaker IDs: {[s.speaker_id for s in diarization.speakers]}")
logger.info(f"[TRANSCRIPTION] 🔍 Assigned speaker IDs: {set(seg.speaker_id for seg in transcription.segments if seg.speaker_id)}")
```

**Attendu** (nettoyage fonctionnel):
```
[TRANSCRIPTION] 🔍 Diarization speakers count: 1
[TRANSCRIPTION] 🔍 Diarization speaker IDs: ['s0']
[TRANSCRIPTION] 🔍 Assigned speaker IDs: {'s0'}
```

**Problème** (nettoyage non fonctionnel):
```
[TRANSCRIPTION] 🔍 Diarization speakers count: 4  # ❌
[TRANSCRIPTION] 🔍 Diarization speaker IDs: ['s0', 's1', 's2', 's4']  # ❌
[TRANSCRIPTION] 🔍 Assigned speaker IDs: {'s0', 's1', 's2', 's4'}  # ❌
```

---

## 📊 Checklist de Validation

- [ ] Service translator redémarré avec sklearn
- [ ] Log `✅ scikit-learn available` présent
- [ ] Log `✅ Nettoyeur de diarisation activé` présent
- [ ] Log `🧹 Début nettoyage automatique` présent lors de la diarisation
- [ ] Test sur audio 4s → 1 speaker détecté (au lieu de 4)
- [ ] Test sur dialogue réel → 2 speakers détectés correctement
- [ ] Logs montrent `Nettoyage terminé: X → Y speakers` avec X > Y

---

## 🎯 Métriques de Succès

| Métrique | Avant | Après (Attendu) |
|----------|-------|-----------------|
| **sklearn disponible** | ❌ Non (à runtime) | ✅ Oui |
| **Nettoyage activé** | ❌ Non | ✅ Oui |
| **Monologue 4s** | 4 speakers ❌ | 1 speaker ✅ |
| **Dialogue réel** | 2 speakers ✅ | 2 speakers ✅ |
| **Voice models créés** | 4 models ❌ | 1-2 models ✅ |
| **Faux positifs** | 40-50% ❌ | < 2% ✅ |

---

## 📞 Support

Si après avoir suivi ces étapes le problème persiste:

1. Capturer les logs complets du service
2. Vérifier que sklearn est bien dans l'environnement Python utilisé
3. Vérifier que le service charge bien `src/services/diarization_speechbrain.py` (pas une version cachée)
4. Vérifier qu'il n'y a pas de conflit de versions (numpy, scipy)

---

**Status** : 🟡 **EN ATTENTE de redémarrage du service**

Une fois le service redémarré, le nettoyage devrait fonctionner automatiquement!
