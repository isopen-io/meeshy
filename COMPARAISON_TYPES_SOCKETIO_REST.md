# Comparaison des types de données - SocketIO vs REST API

## 📊 Vue d'ensemble

Ce document compare les types TypeScript des données retournées par:
1. **SocketIO** (événements temps réel)
2. **REST API** (endpoint `/api/conversations/:id/messages`)

---

## 🔴 1. SOCKETIO - Événements temps réel

### Événement principal: `AUDIO_TRANSLATION_READY`

```typescript
// Fichier: packages/shared/types/socketio-events.ts (ligne 252)

interface AudioTranslationReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;

  // ❌ TRANSCRIPTION SANS SEGMENTS !
  readonly transcription?: {
    readonly text: string;
    readonly language: string;
    readonly confidence?: number;
    // PAS DE SEGMENTS ICI ❌
  };

  readonly translatedAudios: readonly TranslatedAudioData[];
  readonly processingTimeMs?: number;
}
```

### Type `TranslatedAudioData`

```typescript
// Fichier: packages/shared/types/translated-audio.ts (ligne 32)

interface TranslatedAudioData {
  readonly id: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly voiceCloned: boolean;
  readonly voiceQuality: number;

  // Champs optionnels
  readonly audioPath?: string;
  readonly format?: string;
  readonly ttsModel?: string;
  readonly voiceModelId?: string;
  readonly audioDataBase64?: string;
  readonly audioMimeType?: string;
}
```

### ⚠️ **PROBLÈME IDENTIFIÉ**

L'événement `AUDIO_TRANSLATION_READY` retourne une transcription **simplifiée** sans les segments !

```typescript
transcription?: {
  text: string;
  language: string;
  confidence?: number;
  // ❌ MANQUE segments ici !
}
```

**Segments envoyés depuis Python (zmq_audio_handler.py:440):**
```python
'transcription': {
    'text': result.original.text,
    'language': result.original.language,
    'confidence': result.original.confidence,
    'durationMs': result.original.duration_ms,
    'source': result.original.source,
    'segments': result.original.segments  # ✅ ENVOYÉ depuis Python
}
```

**Mais le type TypeScript ne les inclut pas !**

---

## 🟢 2. REST API - Endpoint `/api/conversations/:id/messages`

### Type principal: `Message`

```typescript
// Fichier: packages/shared/types/conversation.ts (ligne 134)

interface Message {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly conversationId: string;
  readonly senderId?: string;
  readonly anonymousSenderId?: string;

  // ===== CONTENU =====
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly messageSource: MessageSource;

  // ===== ÉTAT DU MESSAGE =====
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly isDeleted: boolean;
  readonly deletedAt?: Date;

  // ===== RÉPONSE & FORWARDING =====
  readonly replyToId?: string;
  readonly replyTo?: Message;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;

  // ===== EXPIRATION =====
  readonly expiresAt?: Date;

  // ===== VIEW-ONCE & BLUR =====
  readonly isViewOnce: boolean;
  readonly maxViewOnceCount?: number;
  readonly viewOnceCount: number;
  readonly isBlurred: boolean;

  // ===== PINNING =====
  readonly pinnedAt?: Date;
  readonly pinnedBy?: string;

  // ===== DELIVERY STATUS =====
  readonly deliveredToAllAt?: Date;
  readonly receivedByAllAt?: Date;
  readonly readByAllAt?: Date;
  readonly deliveredCount: number;
  readonly readCount: number;

  // ===== REACTION SUMMARY =====
  readonly reactionSummary?: Record<string, number>;
  readonly reactionCount: number;

  // ===== E2EE / ENCRYPTION =====
  readonly encryptedContent?: string;
  readonly encryptionMode?: EncryptionMode;
  readonly encryptionMetadata?: Record<string, unknown>;
  readonly isEncrypted: boolean;

  // ===== MÉTADONNÉES =====
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly timestamp: Date;

  // ===== MENTIONS =====
  readonly validatedMentions?: readonly string[];

  // ===== EXPÉDITEUR =====
  readonly sender?: User | AnonymousParticipant;

  // ===== TRADUCTIONS =====
  readonly translations: readonly MessageTranslation[];

  // ===== ATTACHMENTS ✅ =====
  readonly attachments?: readonly Attachment[];

  // ===== PARTICIPANT ANONYME =====
  readonly anonymousSender?: AnonymousSenderInfo;
}
```

### Type `Attachment` (inclus dans Message)

```typescript
// Fichier: packages/shared/types/attachment.ts (ligne 129)

interface Attachment {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;

  // ===== PATHS & URLS =====
  readonly filePath?: string;
  readonly fileUrl: string;
  readonly thumbnailPath?: string;
  readonly thumbnailUrl?: string;

  // ===== METADATA =====
  readonly title?: string;
  readonly alt?: string;
  readonly caption?: string;

  // ===== IMAGE METADATA =====
  readonly width?: number;
  readonly height?: number;

  // ===== AUDIO/VIDEO METADATA =====
  readonly duration?: number;
  readonly bitrate?: number;
  readonly sampleRate?: number;
  readonly codec?: string;
  readonly channels?: number;
  readonly fps?: number;
  readonly videoCodec?: string;

  // ===== DOCUMENT METADATA =====
  readonly pageCount?: number;
  readonly lineCount?: number;

  // ===== UPLOADER =====
  readonly uploadedBy: string;
  readonly isAnonymous: boolean;
  readonly createdAt: string;

  // ===== FORWARDING =====
  readonly forwardedFromAttachmentId?: string;
  readonly isForwarded: boolean;

  // ===== VIEW-ONCE & BLUR =====
  readonly isViewOnce: boolean;
  readonly maxViewOnceCount?: number;
  readonly viewOnceCount: number;
  readonly isBlurred: boolean;

  // ===== SECURITY & MODERATION =====
  readonly scanStatus?: ScanStatus;
  readonly scanCompletedAt?: Date;
  readonly moderationStatus?: ModerationStatus;
  readonly moderationReason?: string;

  // ===== DELIVERY STATUS =====
  readonly deliveredToAllAt?: Date;
  readonly viewedByAllAt?: Date;
  readonly downloadedByAllAt?: Date;
  readonly listenedByAllAt?: Date;
  readonly watchedByAllAt?: Date;
  readonly viewedCount: number;
  readonly downloadedCount: number;
  readonly consumedCount: number;

  // ===== ENCRYPTION =====
  readonly isEncrypted: boolean;
  readonly encryptionIv?: string;
  readonly encryptionAuthTag?: string;
  readonly encryptionHmac?: string;
  readonly originalFileHash?: string;
  readonly encryptedFileHash?: string;
  readonly originalFileSize?: number;
  readonly serverKeyId?: string;
  readonly thumbnailEncryptionIv?: string;
  readonly thumbnailEncryptionAuthTag?: string;

  // ===== TRANSCRIPTION & TRANSLATION ✅ =====
  readonly serverCopyUrl?: string;
  readonly transcriptionText?: string;
  readonly translationsJson?: Record<string, AttachmentTranslation>;

  // ✅ TRANSCRIPTION COMPLÈTE AVEC SEGMENTS
  readonly transcription?: AttachmentTranscription;

  // ✅ AUDIOS TRADUITS
  readonly translatedAudios?: readonly TranslatedAudioData[];
}
```

### Type `AttachmentTranscription` (union discriminée)

```typescript
// Fichier: packages/shared/types/attachment-transcription.ts (ligne 91)

type AttachmentTranscription =
  | AudioTranscription
  | VideoTranscription
  | DocumentTranscription
  | ImageTranscription;

// Pour les audios:
interface AudioTranscription {
  readonly type: 'audio';
  readonly transcribedText: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;
  readonly model?: string;

  // ✅ SEGMENTS PRÉSENTS !
  readonly segments?: readonly TranscriptionSegment[];

  readonly audioDurationMs?: number;
  readonly speakerCount?: number;
  readonly primarySpeakerId?: string;
}

// Structure d'un segment
interface TranscriptionSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly speakerId?: string;
  readonly confidence?: number;
}
```

### Type `MessageAudioTranscription` (modèle Prisma)

```typescript
// Fichier: packages/shared/types/audio-transcription.ts (ligne 43)

interface MessageAudioTranscription {
  readonly id: string;
  readonly attachmentId: string;
  readonly messageId: string;

  // Texte transcrit
  readonly transcribedText: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;

  // ✅ SEGMENTS AVEC TIMESTAMPS
  readonly segments?: readonly TranscriptionSegment[];

  readonly audioDurationMs: number;
  readonly model?: string;

  // Speaker diarization
  readonly speakerCount?: number;
  readonly primarySpeakerId?: string;
  readonly speakerAnalysis?: SpeakerDiarizationAnalysis;

  readonly createdAt: Date;
}
```

---

## 📋 Tableau comparatif

| Donnée | SocketIO (`AUDIO_TRANSLATION_READY`) | REST API (`/api/conversations/:id/messages`) |
|--------|--------------------------------------|----------------------------------------------|
| **Message ID** | ✅ `messageId` | ✅ `id` |
| **Attachment ID** | ✅ `attachmentId` | ✅ `attachments[].id` |
| **Transcription texte** | ✅ `transcription.text` | ✅ `transcription.transcribedText` |
| **Transcription langue** | ✅ `transcription.language` | ✅ `transcription.language` |
| **Transcription confiance** | ✅ `transcription.confidence` | ✅ `transcription.confidence` |
| **Transcription segments** | ❌ **MANQUANT** | ✅ `transcription.segments[]` |
| **Audios traduits** | ✅ `translatedAudios[]` | ✅ `translatedAudios[]` |
| **Processing time** | ✅ `processingTimeMs` | ❌ Non retourné |

---

## 🔍 Détail des segments

### Backend Python (envoyé via ZMQ)

```python
# Fichier: services/translator/src/services/zmq_audio_handler.py (ligne 440)

'transcription': {
    'text': result.original.text,
    'language': result.original.language,
    'confidence': result.original.confidence,
    'durationMs': result.original.duration_ms,
    'source': result.original.source,
    'segments': result.original.segments  # ✅ Tableau de segments
}
```

### Structure d'un segment Python

```python
# Fichier: services/translator/src/services/transcription_service.py (ligne 56)

@dataclass
class TranscriptionSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0
```

**Après modification (1-5 mots par segment):**
```python
# Division automatique en sous-segments de max 5 mots
segments = split_segments_into_words(segments, max_words=5)
```

### Type TypeScript des segments (REST API)

```typescript
// Fichier: packages/shared/types/attachment-transcription.ts (ligne 19)

interface TranscriptionSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly speakerId?: string;
  readonly confidence?: number;
}
```

---

## ⚡ Solution requise

### Problème

Le type TypeScript `AudioTranslationReadyEventData` ne contient **PAS** le champ `segments` dans la transcription, alors que:
1. ✅ Le backend Python l'envoie
2. ✅ Le REST API le retourne
3. ❌ Le type SocketIO ne le déclare pas

### Correction nécessaire

**Fichier:** `packages/shared/types/socketio-events.ts`

**AVANT (ligne 252):**
```typescript
interface AudioTranslationReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly transcription?: {
    readonly text: string;
    readonly language: string;
    readonly confidence?: number;
  };
  readonly translatedAudios: readonly TranslatedAudioData[];
  readonly processingTimeMs?: number;
}
```

**APRÈS (proposition):**
```typescript
// Import du type segment
import type { TranscriptionSegment } from './attachment-transcription.js';

interface AudioTranslationReadyEventData {
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
    // ✅ AJOUT DES SEGMENTS
    readonly segments?: readonly TranscriptionSegment[];
  };
  readonly translatedAudios: readonly TranslatedAudioData[];
  readonly processingTimeMs?: number;
}
```

---

## 📝 Exemple de données réelles

### Données SocketIO (après correction)

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

### Données REST API

```json
{
  "id": "msg_abc123",
  "conversationId": "conv_def456",
  "content": "Audio message",
  "originalLanguage": "fr",
  "messageType": "audio",
  "attachments": [
    {
      "id": "att_xyz789",
      "messageId": "msg_abc123",
      "fileName": "audio_1234567890.m4a",
      "mimeType": "audio/m4a",
      "fileSize": 245678,
      "fileUrl": "https://gate.meeshy.me/uploads/audio_1234567890.m4a",
      "duration": 3000,
      "transcription": {
        "id": "trans_001",
        "attachmentId": "att_xyz789",
        "messageId": "msg_abc123",
        "transcribedText": "Bonjour comment allez-vous aujourd'hui mon ami",
        "language": "fr",
        "confidence": 0.95,
        "source": "whisper",
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
        ],
        "audioDurationMs": 3000,
        "model": "whisper_boost",
        "createdAt": "2026-01-19T10:30:00.000Z"
      },
      "translatedAudios": [
        {
          "id": "ta_123",
          "targetLanguage": "en",
          "translatedText": "Hello how are you today my friend",
          "audioUrl": "https://gate.meeshy.me/uploads/translated/audio_en_123.mp3",
          "durationMs": 2800,
          "voiceCloned": true,
          "voiceQuality": 0.87,
          "format": "mp3",
          "ttsModel": "xtts"
        }
      ]
    }
  ]
}
```

---

## ✅ Conclusion

| Aspect | État |
|--------|------|
| **Backend Python** | ✅ Envoie segments correctement |
| **REST API Types** | ✅ Type `Attachment.transcription.segments` présent |
| **SocketIO Types** | ❌ Type `AudioTranslationReadyEventData.transcription.segments` **MANQUANT** |
| **Frontend lecteur** | ✅ `TranscriptionViewer` supporte segments |
| **Segmentation 1-5 mots** | ✅ Implémentée dans `segment_splitter.py` |

**Action requise:** Corriger le type TypeScript `AudioTranslationReadyEventData` pour inclure les segments.
