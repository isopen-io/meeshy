# Correctif des Segments Manquants dans voice_api

## Problème Identifié

Les transcriptions avec source `voice_api` ne retournaient pas les segments, même si whisper_boost génère ces segments.

### Cause Racine

1. **translation_pipeline_service.py** ligne 470 : `return_timestamps=False`
2. **PipelineResult** ne stockait pas les segments
3. **operation_handlers.py** ligne 178 : appel à transcribe sans `return_timestamps`

## Modifications Appliquées

### 1. PipelineResult - Stockage des segments

**Fichier:** `services/translator/src/services/translation_pipeline_service.py`

```python
@dataclass
class PipelineResult:
    # ...
    transcription_segments: Optional[List[Dict[str, Any]]] = None  # ✅ Nouveau champ
```

### 2. Activation de return_timestamps

**Fichier:** `services/translator/src/services/translation_pipeline_service.py` ligne 467

```python
# AVANT
transcription = await self.transcription_service.transcribe(
    audio_path=audio_path,
    mobile_transcription=job.mobile_transcription,
    return_timestamps=False  # ❌
)

# APRÈS
transcription = await self.transcription_service.transcribe(
    audio_path=audio_path,
    mobile_transcription=job.mobile_transcription,
    return_timestamps=True  # ✅ Activer pour whisper_boost
)

# ✅ Stocker les segments
if hasattr(transcription, 'segments') and transcription.segments:
    result.transcription_segments = transcription.segments
```

### 3. Inclusion dans to_dict()

**Fichier:** `services/translator/src/services/translation_pipeline_service.py` ligne 149

```python
# Construire originalAudio avec segments si disponibles
original_audio = {
    "transcription": self.original_text,
    "language": self.original_language,
    "durationMs": self.original_duration_ms,
    "confidence": self.transcription_confidence
}

# ✅ Ajouter segments si disponibles
if self.transcription_segments:
    original_audio["segments"] = self.transcription_segments

return {
    "originalAudio": original_audio,
    # ...
}
```

### 4. Interface TypeScript Gateway

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts` ligne 24

```typescript
// ✅ Import du type partagé
import type {
  AttachmentTranscription,
  AttachmentTranslations,
  AttachmentTranslation,
  TranscriptionSegment  // ✅ Type partagé pour segments
} from '@meeshy/shared/types/attachment-audio';
```

**Ligne 1050:**

```typescript
originalAudio: {
  transcription: string;
  language: string;
  durationMs: number;
  confidence: number;
  segments?: TranscriptionSegment[];  // ✅ Utiliser type partagé
};
```

### 5. Construction de transcriptionData

**Fichier:** `services/gateway/src/services/message-translation/MessageTranslationService.ts` ligne 1124

```typescript
// AVANT
segments: undefined,  // ❌ Hardcodé

// APRÈS
segments: data.result.originalAudio.segments,  // ✅ Utiliser du résultat
```

### 6. Chemin alternatif (operation_handlers.py)

**Fichier:** `services/translator/src/services/voice_api/operation_handlers.py` ligne 177

```python
# ✅ Activer return_timestamps
trans_result = await self.transcription_service.transcribe(
    audio_path,
    return_timestamps=True
)

# ✅ Stocker les segments
if hasattr(trans_result, 'segments') and trans_result.segments:
    transcription_segments = trans_result.segments

# ✅ Inclure dans originalAudio
original_audio = {
    'transcription': transcription_text,
    'language': detected_language,
    'durationMs': 0,
    'confidence': transcription_confidence
}
if transcription_segments:
    original_audio['segments'] = transcription_segments
```

## Test de Vérification

### Commandes de test

```bash
# 1. Tester l'API de transcription directe
cd services/translator
python3 -c "
import asyncio
from services.transcription_service import TranscriptionService

async def test():
    svc = TranscriptionService()
    result = await svc.transcribe(
        '/path/to/audio.mp3',
        return_timestamps=True
    )
    print('Segments:', len(result.segments) if result.segments else 0)
    if result.segments:
        print('Premier segment:', result.segments[0])

asyncio.run(test())
"

# 2. Tester via le pipeline complet
# Envoyer un message audio via l'API et vérifier en BD

# 3. Vérifier en MongoDB
node check-segments.js
```

### Validation en Base de Données

```javascript
// Vérifier qu'un nouveau message audio a des segments
const { MongoClient } = require('mongodb');

async function checkNewMessage() {
  const client = new MongoClient(process.env.DATABASE_URL);
  await client.connect();

  const db = client.db();
  const attachments = db.collection('MessageAttachment');

  // Trouver le dernier attachment audio
  const latest = await attachments.findOne(
    { mimeType: /^audio\// },
    { sort: { createdAt: -1 } }
  );

  if (latest?.transcription) {
    console.log('✅ Transcription présente');
    console.log('Source:', latest.transcription.source);
    console.log('Segments:', latest.transcription.segments?.length || 0);

    if (latest.transcription.segments?.length > 0) {
      console.log('✅ SEGMENTS PRÉSENTS !');
      console.log('Premier segment:', latest.transcription.segments[0]);
    } else {
      console.log('❌ Pas de segments');
    }
  }

  await client.close();
}

checkNewMessage();
```

## Résultat Attendu

Après ce correctif, tous les messages audio transcrits via `voice_api` devraient avoir :

```json
{
  "transcription": {
    "text": "Transcription complète...",
    "language": "fr",
    "confidence": 0.96,
    "source": "voice_api",
    "segments": [
      {
        "text": "Premier segment",
        "startMs": 0,
        "endMs": 800,
        "confidence": 0.98
      },
      {
        "text": "Deuxième segment",
        "startMs": 850,
        "endMs": 2100,
        "confidence": 0.94
      }
    ]
  }
}
```

## Impact

- ✅ Les segments sont maintenant disponibles pour la diarisation
- ✅ Le frontend peut afficher les timestamps
- ✅ Alignement total avec la documentation de l'API ZMQ
- ✅ Pas de transformation - données passées directement de whisper_boost → BD → Frontend
