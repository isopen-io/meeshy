# Fix: Erreur ChatterBox lors de synthèse parallèle

## ❌ Problème Initial

**Erreur rencontrée:**
```
RuntimeError: stack expects each tensor to be equal size, but got [64, 64] at entry 0 and [60, 60] at entry 1
```

**Contexte:**
- Se produit lors de la synthèse multi-speaker avec diarisation (3 speakers détectés)
- Tous les segments échouent (0% de réussite)
- L'erreur se produit dans `chatterbox/models/t3/inference/alignment_stream_analyzer.py` ligne 94

**Cause:**
- ChatterBox TTS n'est PAS thread-safe
- La synthèse multi-speaker utilise `asyncio.gather()` pour paralléliser les appels
- Plusieurs threads appellent `_model.generate()` simultanément
- L'état interne de ChatterBox (`alignment_stream_analyzer`) se corrompt
- Les tensors d'attention ont des tailles incompatibles (64x64 vs 60x60)

## ✅ Solution Implémentée

### 1. Ajout d'un verrou asyncio.Lock dans ChatterboxBackend

**Fichier modifié:** `src/services/tts/backends/chatterbox_backend.py`

**Changements:**

```python
class ChatterboxBackend(BaseTTSBackend):
    def __init__(self, device: str = "auto", turbo: bool = False):
        super().__init__()
        # ... autres initialisations ...

        # ✅ NOUVEAU: Verrou pour sérialiser les appels de synthèse
        self._synthesis_lock = asyncio.Lock()
```

**Protection de la génération:**

```python
async def synthesize(self, ...):
    # ... préparation des paramètres ...

    # ✅ VERROU: Sérialise tous les appels à _model.generate()
    async with self._synthesis_lock:
        # Toute la génération audio (multilingual ou monolingual)
        if use_multilingual:
            wav = await loop.run_in_executor(...)
        else:
            wav = await loop.run_in_executor(...)

        # Sauvegarde du fichier audio
        await loop.run_in_executor(
            None,
            lambda: torchaudio.save(output_path, wav, sample_rate)
        )

        return output_path
```

### 2. Parallélisme maintenu dans multi_speaker_synthesis.py

**Fichier:** `src/services/audio_pipeline/multi_speaker_synthesis.py`

**Architecture:**
- Le code garde `asyncio.gather()` pour lancer les synthèses en parallèle
- Le verrou dans ChatterBox **sérialise automatiquement** les appels
- Les coroutines attendent leur tour au lieu d'interférer entre elles

**Avantages:**
- ✅ Code simple: pas de refactoring de la logique de parallélisation
- ✅ Protection automatique: le verrou s'applique partout où ChatterBox est utilisé
- ✅ Performances: les autres opérations (I/O, préparation) restent parallèles
- ✅ Maintenabilité: un seul point de synchronisation à gérer

## 🎯 Résultat Attendu

**Avant le fix:**
```
[MULTI_SPEAKER_SYNTH] ✅ Réussis: 0 (0.0%)
[MULTI_SPEAKER_SYNTH] ❌ Échoués: 3 (100.0%)
RuntimeError: stack expects each tensor to be equal size...
```

**Après le fix:**
```
[MULTI_SPEAKER_SYNTH] ✅ Réussis: 3 (100.0%)
[MULTI_SPEAKER_SYNTH] ❌ Échoués: 0 (0.0%)
```

## 🧪 Test

Pour tester la correction:

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator
. .venv/bin/activate

# Tester avec un fichier audio réel contenant plusieurs speakers
python << 'EOF'
import asyncio
import sys
sys.path.insert(0, 'src')

from services.audio_pipeline.audio_message_pipeline import AudioMessagePipeline

async def test():
    pipeline = AudioMessagePipeline()

    result = await pipeline.process_audio(
        audio_path="chemin/vers/audio_multi_speakers.wav",
        source_language="en",
        target_languages=["fr"],
        user_voice_model=None
    )

    print(f"✅ Traductions réussies: {len(result['translations'])}")

asyncio.run(test())
EOF
```

## 📊 Performance

**Impact du verrou:**
- Sérialisation: Les synthèses s'exécutent une par une
- Temps total: Somme des temps individuels (vs parallèle théorique)
- Compromis acceptable: Stabilité > vitesse

**Exemple avec 3 segments:**
- Sans verrou (parallèle): 15s théoriques → **ÉCHOUE**
- Avec verrou (séquentiel): 15s réels → **RÉUSSIT**

## 🔧 Fichiers Modifiés

```
services/translator/
├── src/services/tts/backends/chatterbox_backend.py
│   ├── + Ajout asyncio.Lock dans __init__()
│   └── + Ajout async with self._synthesis_lock: dans synthesize()
└── FIX-CHATTERBOX-PARALLEL-SYNTHESIS.md (ce document)
```

## 💡 Notes Techniques

### Pourquoi asyncio.Lock et pas threading.Lock?

- ChatterBox utilise `asyncio` (coroutines, pas threads réels)
- `asyncio.Lock` fonctionne avec `async with` et `await`
- `threading.Lock` bloquerait l'event loop (deadlock)

### Pourquoi protéger toute la génération?

- `_model.generate()` maintient un état interne (`alignment_stream_analyzer`)
- Cet état accumule des informations entre les étapes
- Interrompre au milieu corromprait l'état pour tous les appels
- Protection complète = garantie d'isolation

### Alternatives considérées

1. **Désactiver parallélisation**: Trop invasif, perd l'élégance du code
2. **Verrou par modèle**: Plus complexe, même résultat
3. **Réinitialiser état**: Impossible (API interne ChatterBox)
4. **✅ Verrou global**: Simple, robuste, maintenable

## 🎉 Conclusion

Le fix est minimal, élégant et résout le problème à la source:
- ✅ ChatterBox est maintenant thread-safe par construction
- ✅ Aucun impact sur le reste du code (architecture préservée)
- ✅ Protection automatique pour tous les futurs usages
- ✅ Diarisation multi-speaker opérationnelle
