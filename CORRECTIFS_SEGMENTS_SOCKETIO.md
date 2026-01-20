# Correctifs - Préservation des segments de transcription via SocketIO

## 🎯 Objectif

Préserver la structure complète des segments de transcription depuis la base de données jusqu'au frontend via les événements SocketIO, pour permettre la synchronisation audio/texte en temps réel.

---

## 📋 Modifications apportées

### 1. ✅ Type TypeScript `AudioTranslationReadyEventData`

**Fichier:** `packages/shared/types/socketio-events.ts` (ligne 243-274)

**AVANT:**
```typescript
export interface AudioTranslationReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly transcription?: {
    readonly text: string;
    readonly language: string;
    readonly confidence?: number;
    // ❌ PAS DE SEGMENTS
  };
  readonly translatedAudios: readonly TranslatedAudioData[];
  readonly processingTimeMs?: number;
}
```

**APRÈS:**
```typescript
// Import TranscriptionSegment for real-time audio synchronization
import type { TranscriptionSegment } from './attachment-transcription.js';

/**
 * Données pour l'événement de traduction audio prête
 * Inclut les segments de transcription pour synchronisation audio/texte en temps réel
 */
export interface AudioTranslationReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly transcription?: {
    readonly text: string;
    readonly language: string;
    readonly confidence?: number;
    readonly durationMs?: number;
    readonly source?: string;
    readonly model?: string;
    /**
     * Segments de transcription avec timestamps pour synchronisation audio/texte
     * Divisés en morceaux de 1-5 mots pour synchronisation fine
     */
    readonly segments?: readonly TranscriptionSegment[];
  };
  readonly translatedAudios: readonly TranslatedAudioData[];
  readonly processingTimeMs?: number;
}
```

**Changements:**
- ✅ Import de `TranscriptionSegment`
- ✅ Ajout du champ `segments`
- ✅ Ajout des métadonnées: `durationMs`, `source`, `model`
- ✅ Documentation explicite pour la synchronisation

---

### 2. ✅ Type du handler `_handleAudioTranslationReady`

**Fichier:** `services/gateway/src/socketio/MeeshySocketIOManager.ts` (ligne 1515-1530)

**AVANT:**
```typescript
private async _handleAudioTranslationReady(data: {
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription?: {
    text: string;
    language: string;
    confidence?: number;
    // ❌ PAS DE SEGMENTS
  };
  translatedAudios: TranslatedAudioData[];
  processingTimeMs?: number;
}) {
```

**APRÈS:**
```typescript
/**
 * Gère la réception d'une traduction audio prête depuis le Translator
 * Diffuse l'événement AUDIO_TRANSLATION_READY aux clients de la conversation
 * Utilise le type TranslatedAudioData unifié de @meeshy/shared/types
 * Inclut les segments de transcription pour synchronisation audio/texte
 */
private async _handleAudioTranslationReady(data: {
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription?: {
    text: string;
    language: string;
    confidence?: number;
    durationMs?: number;
    source?: string;
    model?: string;
    segments?: Array<{ text: string; startMs: number; endMs: number; confidence?: number }>;
  };
  translatedAudios: TranslatedAudioData[];
  processingTimeMs?: number;
}) {
```

**Changements:**
- ✅ Ajout du champ `segments` avec structure complète
- ✅ Ajout des métadonnées: `durationMs`, `source`, `model`
- ✅ Documentation mise à jour

---

### 3. ✅ Logs de debugging améliorés

**Fichier:** `services/gateway/src/socketio/MeeshySocketIOManager.ts` (ligne 1539-1542)

**AJOUT:**
```typescript
console.log(`   📝 Transcription Segments: ${data.transcription.segments?.length || 0} segments`);
if (data.transcription.segments && data.transcription.segments.length > 0) {
  console.log(`   📝 Premier segment: "${data.transcription.segments[0].text}" (${data.transcription.segments[0].startMs}ms - ${data.transcription.segments[0].endMs}ms)`);
}
```

**Utilité:**
- Affiche le nombre de segments dans les logs
- Affiche le premier segment pour vérification rapide
- Facilite le debugging de la chaîne complète

---

## 🔄 Flux complet de données

### 1. Backend Python (Translator)

```python
# services/translator/src/services/transcription_service.py (ligne 317)

# Diviser en sous-segments de 1-5 mots pour synchronisation fine
segments = split_segments_into_words(segments, max_words=5)

return TranscriptionResult(
    text=full_text,
    language=info.language,
    confidence=info.language_probability,
    segments=segments,  # ✅ Segments divisés (1-5 mots)
    duration_ms=int(info.duration * 1000),
    source="whisper",
    model="whisper_boost"
)
```

**Segments produits:**
```python
[
    TranscriptionSegment(text="Bonjour comment allez-vous aujourd'hui", startMs=0, endMs=2142),
    TranscriptionSegment(text="mon ami", startMs=2142, endMs=3000)
]
```

---

### 2. Envoi ZMQ vers Gateway

```python
# services/translator/src/services/zmq_audio_handler.py (ligne 440)

'transcription': {
    'text': result.original.text,
    'language': result.original.language,
    'confidence': result.original.confidence,
    'durationMs': result.original.duration_ms,
    'source': result.original.source,
    'segments': result.original.segments  # ✅ Segments envoyés
}
```

---

### 3. Réception Gateway et sauvegarde DB

```typescript
// services/gateway/src/services/message-translation/MessageTranslationService.ts (ligne 727, 737)

// Sauvegarde en base de données
await this.prisma.messageAudioTranscription.upsert({
  where: { attachmentId: data.attachmentId },
  update: {
    transcribedText: data.transcription.text,
    language: data.transcription.language,
    confidence: data.transcription.confidence,
    source: data.transcription.source,
    segments: data.transcription.segments || null,  // ✅ Segments sauvegardés
    audioDurationMs: attachment.duration || 0
  },
  create: {
    attachmentId: data.attachmentId,
    messageId: data.messageId,
    transcribedText: data.transcription.text,
    language: data.transcription.language,
    confidence: data.transcription.confidence,
    source: data.transcription.source,
    segments: data.transcription.segments || null,  // ✅ Segments sauvegardés
    audioDurationMs: attachment.duration || 0
  }
});
```

---

### 4. Émission événement SocketIO

```typescript
// services/gateway/src/services/message-translation/MessageTranslationService.ts (ligne 885-892)

this.emit('audioTranslationReady', {
  taskId: data.taskId,
  messageId: data.messageId,
  attachmentId: data.attachmentId,
  transcription: data.transcription,  // ✅ Segments inclus
  translatedAudios: savedTranslatedAudios,
  processingTimeMs: data.processingTimeMs
});
```

---

### 5. Diffusion SocketIO vers clients

```typescript
// services/gateway/src/socketio/MeeshySocketIOManager.ts (ligne 1564-1575)

const audioTranslationData = {
  messageId: data.messageId,
  attachmentId: data.attachmentId,
  conversationId: normalizedId,
  transcription: data.transcription,  // ✅ Segments inclus
  translatedAudios: data.translatedAudios,
  processingTimeMs: data.processingTimeMs
};

this.io.to(roomName).emit(SERVER_EVENTS.AUDIO_TRANSLATION_READY, audioTranslationData);
```

---

### 6. Réception frontend

```typescript
// apps/web/components/attachments/AudioAttachment.tsx (ligne 22-56)

const initialTranscription = useMemo(() => {
  if (!attachment.transcription) return undefined;

  const transcription = attachment.transcription as any;

  const result = {
    text: transcription.transcribedText || transcription.text,
    language: transcription.language,
    confidence: transcription.confidence,
    segments: transcription.segments,  // ✅ Segments reçus
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('🎵 [AudioAttachment] Transcription extraite:', {
      ...result,
      segmentsCount: result.segments?.length || 0,
    });
  }

  return result;
}, [attachment.transcription]);
```

---

## 📊 Structure des segments

### Format backend (Python)

```python
@dataclass
class TranscriptionSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0
```

### Format TypeScript (Frontend/Gateway)

```typescript
interface TranscriptionSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly speakerId?: string;
  readonly confidence?: number;
}
```

### Exemple de données réelles

```json
{
  "messageId": "msg_abc123",
  "attachmentId": "att_xyz789",
  "conversationId": "conv_def456",
  "transcription": {
    "text": "Bonjour comment allez-vous aujourd'hui mon ami",
    "language": "fr",
    "confidence": 0.95,
    "durationMs": 3000,
    "source": "whisper",
    "model": "whisper_boost",
    "segments": [
      {
        "text": "Bonjour comment allez-vous aujourd'hui",
        "startMs": 0,
        "endMs": 2142,
        "confidence": 0.96
      },
      {
        "text": "mon ami",
        "startMs": 2142,
        "endMs": 3000,
        "confidence": 0.94
      }
    ]
  },
  "translatedAudios": [
    {
      "id": "ta_123",
      "targetLanguage": "en",
      "translatedText": "Hello how are you today my friend",
      "audioUrl": "https://gate.meeshy.me/uploads/translated/audio_en_123.mp3",
      "durationMs": 2800,
      "voiceCloned": true,
      "voiceQuality": 0.87
    }
  ],
  "processingTimeMs": 4523
}
```

---

## ✅ Vérifications

| Étape | Statut | Détails |
|-------|--------|---------|
| **Backend Python** | ✅ | Génère segments 1-5 mots |
| **Envoi ZMQ** | ✅ | Envoie segments dans événement |
| **Réception Gateway** | ✅ | Type inclut segments |
| **Sauvegarde DB** | ✅ | Segments sauvegardés dans `MessageAudioTranscription.segments` |
| **Émission SocketIO** | ✅ | Type `AudioTranslationReadyEventData` inclut segments |
| **Frontend** | ✅ | `AudioAttachment` extrait et passe segments |
| **Synchronisation** | ✅ | `TranscriptionViewer` utilise segments pour highlight |

---

## 🎯 Résultat final

Les segments de transcription sont maintenant préservés sur **toute la chaîne** :

1. **Python Translator** → Génère segments de 1-5 mots
2. **ZMQ** → Envoie segments au Gateway
3. **Gateway DB** → Sauvegarde segments
4. **SocketIO** → Émet segments vers clients
5. **Frontend** → Reçoit et affiche segments synchronisés

Le frontend peut désormais synchroniser l'affichage du texte avec la lecture audio en temps réel grâce aux timestamps précis de chaque segment de 1-5 mots ! 🎵

---

## 🔧 Logs de debugging

Lors de la réception d'une traduction audio, les logs afficheront :

```
🎵 [SocketIOManager] ======== DIFFUSION SOCKET.IO VERS CLIENTS ========
🎵 [SocketIOManager] Audio translation ready pour message msg_abc123, attachment att_xyz789
   📝 Has Transcription: true
   📝 Transcription Text: "Bonjour comment allez-vous aujourd'hui mon ami"
   📝 Transcription Language: fr
   📝 Transcription Confidence: 0.95
   📝 Transcription Segments: 2 segments
   📝 Premier segment: "Bonjour comment allez-vous aujourd'hui" (0ms - 2142ms)
   🌍 Translated Audios: 1
   🔊 Langues: en
📡 [SocketIOManager] Émission événement 'audio:translation-ready' vers room 'conversation_conv_def456' (3 clients)
✅ [SocketIOManager] ======== ÉVÉNEMENT SOCKET.IO DIFFUSÉ ========
✅ [SocketIOManager] Traduction audio diffusée vers 3 client(s)
   📝 Transcription: OUI
   🌍 Audios traduits: 1
```

Ces logs permettent de vérifier rapidement que les segments sont bien transmis à chaque étape.
