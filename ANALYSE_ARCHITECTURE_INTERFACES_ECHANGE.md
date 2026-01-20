# Analyse Architecture des Interfaces d'Échange

**Date**: 2026-01-20
**Scope**: Architecture des types et interfaces pour transcription/traduction multi-formats
**Status**: ✅ Architecture généralisée V2 implémentée

---

## 📋 Résumé Exécutif

### Verdict Global
**Architecture: 7.5/10** - Bonne généralisation avec quelques incohérences à résoudre

**Forces principales:**
- ✅ Généralisation réussie audio → multi-formats (audio, video, document, image)
- ✅ Séparation claire REST API vs Socket.IO
- ✅ Type guards pour discrimination des unions discriminées
- ✅ Helpers utilitaires bien pensés (hasTranslation, getTranslation, softDelete, upsert)

**Faiblesses identifiées:**
- ⚠️ **Duplication de types** entre `attachment-audio.ts` et `attachment-transcription.ts`
- ⚠️ **Incohérences de nommage** (TranscriptableType vs TranscriptionSourceType)
- ⚠️ **Interfaces partiellement alignées** entre gateway ZMQ et shared types
- ⚠️ **Schémas API manquants** pour les nouveaux types généralisés

---

## 1. Cohérence Architecturale

### 1.1 État des Types de Base

#### ✅ **TranscriptableType** (attachment-audio.ts)
```typescript
export type TranscriptableType = 'audio' | 'video' | 'document' | 'image';
```
- **Usage**: Discriminant de type pour `AttachmentTranscription`
- **Cohérence**: ✅ Bien défini et utilisé partout
- **Extensibilité**: ✅ Facile d'ajouter 'podcast', '3d_model', etc.

#### ⚠️ **TranscriptionSource** (attachment-audio.ts)
```typescript
export type TranscriptionSource =
  | 'mobile'      // Transcription depuis mobile
  | 'whisper'     // Whisper AI (audio/video)
  | 'voice_api'   // API vocale
  | 'ocr'         // OCR pour documents/images
  | 'vision_api'; // Vision API pour images
```
- **Usage**: Indique la source/méthode de transcription
- **Problème**: ⚠️ Nom différent dans `attachment-transcription.ts` (`TranscriptionSourceType`)
- **Incohérence**: Les valeurs diffèrent légèrement

#### ⚠️ **TranscriptionSourceType** (attachment-transcription.ts)
```typescript
export type TranscriptionSourceType = 'mobile' | 'whisper' | 'ocr' | 'vision';
```
- **Problème**: Manque `'voice_api'` et utilise `'vision'` au lieu de `'vision_api'`
- **Impact**: Incohérence entre les deux fichiers de types

#### ✅ **TranslationType** (attachment-audio.ts)
```typescript
export type TranslationType = 'audio' | 'video' | 'text' | 'document' | 'image';
```
- **Usage**: Discriminant de type pour `AttachmentTranslation`
- **Cohérence**: ✅ Bien défini
- **Note**: Inclut `'text'` en plus des types transcriptables (logique pour traduction pure)

### 1.2 Analyse de Duplication

#### 🔴 **Problème Majeur: Deux Définitions de AttachmentTranscription**

**Fichier 1: `attachment-audio.ts` (Version flat/flexible)**
```typescript
export interface AttachmentTranscription {
  type: TranscriptableType;
  text: string;
  language: string;
  confidence: number;
  source: TranscriptionSource;
  model?: string;

  // Tous les champs optionnels dans une seule interface
  segments?: TranscriptionSegment[];
  speakerCount?: number;
  primarySpeakerId?: string;
  durationMs?: number;
  speakerAnalysis?: any;
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string;
  voiceQualityAnalysis?: any;

  // Document fields
  pageCount?: number;
  documentLayout?: any;

  // Image fields
  imageDescription?: string;
  detectedObjects?: any[];
  ocrRegions?: any[];
}
```

**Fichier 2: `attachment-transcription.ts` (Version union discriminée)**
```typescript
export interface AudioTranscription {
  readonly type: 'audio';
  readonly transcribedText: string;  // ⚠️ Nom différent: "transcribedText" vs "text"
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSourceType;  // ⚠️ Type différent
  readonly model?: string;
  readonly segments?: readonly TranscriptionSegment[];
  readonly audioDurationMs?: number;  // ⚠️ Nom différent: "audioDurationMs" vs "durationMs"
  readonly speakerCount?: number;
  readonly primarySpeakerId?: string;
  readonly senderVoiceIdentified?: boolean;
  readonly senderSpeakerId?: string | null;
  readonly speakerAnalysis?: SpeakerAnalysis;  // ⚠️ Type structuré vs any
}

// + VideoTranscription, DocumentTranscription, ImageTranscription

export type AttachmentTranscription =
  | AudioTranscription
  | VideoTranscription
  | DocumentTranscription
  | ImageTranscription;
```

**Impact:**
- ❌ **Confusion**: Quel fichier est la source de vérité?
- ❌ **Incohérences de nommage**: `text` vs `transcribedText`, `durationMs` vs `audioDurationMs`
- ❌ **Type safety compromise**: Version flat avec `any` vs union discriminée stricte
- ❌ **Maintenance difficile**: Changements doivent être dupliqués

**Recommandation**: 🔧 **CONSOLIDER** en une seule définition (voir section 5)

### 1.3 Cohérence des Interfaces TranslatedAudio

#### ✅ **Bonne séparation des responsabilités**

**1. MessageTranslatedAudio (translated-audio.ts)** - Modèle Prisma complet
```typescript
export interface MessageTranslatedAudio {
  readonly id: string;
  readonly attachmentId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly audioPath: string;
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly format: string;
  readonly voiceCloned: boolean;
  readonly voiceQuality: number;
  readonly voiceModelId?: string | null;
  readonly ttsModel: string;
  readonly createdAt: Date | string;
}
```

**2. TranslatedAudioData (translated-audio.ts)** - Version API/WebSocket allégée
```typescript
export interface TranslatedAudioData {
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

**3. SocketIOTranslation (attachment-audio.ts)** - Format Socket.IO générique
```typescript
export interface SocketIOTranslation {
  readonly id: string;
  readonly type: TranslationType;  // ✅ Support multi-formats
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly url: string;
  readonly durationMs?: number;
  readonly voiceCloned?: boolean;
  readonly voiceQuality?: number;
  readonly path?: string;
  readonly format?: string;
  readonly ttsModel?: string;
  readonly voiceModelId?: string;
  readonly pageCount?: number;
  readonly overlayApplied?: boolean;
}
```

**Analyse:**
- ✅ **Séparation claire**: Prisma DB ↔ API ↔ WebSocket
- ✅ **Généralisé**: `SocketIOTranslation` supporte tous les types
- ⚠️ **Problème mineur**: `TranslatedAudioData` est audio-spécifique alors que `SocketIOTranslation` est générique
- 💡 **Suggestion**: Renommer `TranslatedAudioData` → `TranslatedMediaData` ou créer versions typées

---

## 2. Séparation des Responsabilités

### 2.1 Couches Architecturales

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Web/Mobile)                   │
│  - SocketIOTranslation (temps réel)                        │
│  - API REST responses (AttachmentTranscription)            │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Socket.IO Events / REST API
                              │
┌─────────────────────────────────────────────────────────────┐
│                         GATEWAY                             │
│  - MessageTranslatedAudio (Prisma models)                  │
│  - TranslatedAudioData (API responses)                     │
│  - ZMQ Request/Response (gateway ↔ translator)             │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ ZMQ Multipart Messages
                              │
┌─────────────────────────────────────────────────────────────┐
│                       TRANSLATOR (Python)                   │
│  - AudioProcessRequest/AudioProcessCompletedEvent          │
│  - TranscriptionOnlyRequest/TranscriptionCompletedEvent    │
│  - VoiceAPIRequest/VoiceAPISuccessEvent                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Évaluation par Couche

#### ✅ **Frontend ↔ Gateway** (Excellent 9/10)

**REST API:**
- ✅ Schémas OpenAPI bien définis (`messageAttachmentSchema` dans `api-schemas.ts`)
- ✅ Validation Fastify automatique
- ✅ Types TypeScript alignés

**Socket.IO:**
```typescript
// packages/shared/types/socketio-events.ts
export const SERVER_EVENTS = {
  AUDIO_TRANSLATION_READY: 'audio:translation-ready',
  TRANSCRIPTION_READY: 'audio:transcription-ready'
} as const;

export interface AudioTranslationReadyEventData {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly transcription?: {
    readonly text: string;
    readonly language: string;
    readonly confidence: number;
    readonly durationMs?: number;
    readonly segments?: readonly TranscriptionSegment[];
    readonly speakerCount?: number;
    readonly primarySpeakerId?: string;
  };
  readonly translatedAudios?: readonly SocketIOTranslation[];
}
```

**Points forts:**
- ✅ Événements bien nommés et typés
- ✅ Données en lecture seule (`readonly`)
- ✅ Support segments pour UI synchronisée

**Point d'amélioration:**
- ⚠️ `AudioTranslationReadyEventData` devrait supporter video/document/image aussi
- 💡 Renommer en `MediaTranslationReadyEventData`

#### ⚠️ **Gateway ↔ Translator** (Correct mais améliorable 7/10)

**ZMQ Request Types:**
```typescript
// services/gateway/src/services/zmq-translation/types.ts

export interface AudioProcessRequest {
  type: 'audio_process';
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;
  audioPath?: string;
  audioUrl?: string;
  audioBase64?: string;
  audioMimeType?: string;
  binaryFrames?: BinaryFrameInfo;
  audioDurationMs: number;
  mobileTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
  targetLanguages: string[];
  generateVoiceClone: boolean;
  modelType: string;
  // ...
}
```

**Problèmes identifiés:**
- ⚠️ **Pas de types génériques**: Seulement `AudioProcessRequest`, pas de `VideoProcessRequest`, `DocumentProcessRequest`
- ⚠️ **Nommage incohérent**: `audioDurationMs` dans request vs `durationMs` dans response
- ⚠️ **Structures imbriquées non typées**: `mobileTranscription` inline vs `AttachmentTranscription` partagé

**Recommandation:**
```typescript
// ✅ Version généralisée
export interface MediaProcessRequest {
  type: 'media_process';
  mediaType: 'audio' | 'video' | 'document' | 'image';
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;

  // Media source
  mediaPath?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  binaryFrames?: BinaryFrameInfo;

  // Metadata
  durationMs?: number;  // audio/video
  pageCount?: number;   // document

  // Existing transcription
  mobileTranscription?: AttachmentTranscription;  // ✅ Réutilise type partagé

  // Translation params
  targetLanguages: string[];
  generateVoiceClone?: boolean;  // audio only
  modelType: string;
  // ...
}
```

#### ✅ **ZMQ Response Events** (Bon 8/10)

```typescript
export interface AudioProcessCompletedEvent {
  type: 'audio_process_completed';
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription: TranscriptionData;
  translatedAudios: TranslatedAudioData[];
  voiceModelUserId: string;
  voiceModelQuality: number;
  processingTimeMs: number;
  timestamp: number;
}

export interface TranscriptionCompletedEvent {
  type: 'transcription_completed';
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription: {
    text: string;
    language: string;
    confidence: number;
    durationMs: number;
    source: string;
    model?: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  };
  processingTimeMs: number;
  timestamp: number;
}
```

**Points forts:**
- ✅ Discriminants `type` clairs
- ✅ Metadata de performance (`processingTimeMs`)
- ✅ Identifiants de corrélation (`taskId`, `messageId`, `attachmentId`)

**Points d'amélioration:**
- ⚠️ Structure `transcription` inline devrait utiliser `AttachmentTranscription` partagé
- ⚠️ Pas d'événements génériques pour video/document/image

---

## 3. Extensibilité

### 3.1 Facilité d'Ajout de Nouveaux Types

#### ✅ **Scenario: Ajouter 'podcast'**

**Étape 1: Types de base**
```typescript
// packages/shared/types/attachment-audio.ts
export type TranscriptableType = 'audio' | 'video' | 'document' | 'image' | 'podcast';
export type TranslationType = 'audio' | 'video' | 'text' | 'document' | 'image' | 'podcast';
```

**Étape 2: Interface spécifique**
```typescript
export interface AttachmentTranscription {
  type: TranscriptableType;
  text: string;
  // ...

  // Spécifique podcast
  episodeTitle?: string;
  episodeNumber?: number;
  showName?: string;
  chaptersMarkers?: Array<{ timestamp: number; title: string }>;
}

export interface AttachmentTranslation {
  type: TranslationType;
  // ...

  // Spécifique podcast
  translatedChapters?: Array<{ timestamp: number; title: string }>;
}
```

**Étape 3: Schéma API**
```typescript
// packages/shared/types/api-schemas.ts
transcription: {
  properties: {
    type: {
      enum: ['audio', 'video', 'document', 'image', 'podcast']
    },
    // ...
    episodeTitle: { type: 'string', nullable: true },
    episodeNumber: { type: 'number', nullable: true },
  }
}
```

**Étape 4: ZMQ**
```typescript
// services/gateway/src/services/zmq-translation/types.ts
export interface PodcastProcessRequest extends AudioProcessRequest {
  type: 'podcast_process';
  episodeMetadata?: {
    title: string;
    number: number;
    showName: string;
  };
}
```

**Évaluation: 8/10** - Relativement facile mais nécessite toucher plusieurs fichiers

### 3.2 Points de Friction

1. **Duplication de types** ⚠️
   - Doit modifier `attachment-audio.ts` ET `attachment-transcription.ts`
   - Risque d'oubli et d'incohérence

2. **Schémas API non synchronisés** ⚠️
   - `api-schemas.ts` doit être mis à jour manuellement
   - Pas de génération automatique depuis types TypeScript

3. **ZMQ types isolés** ⚠️
   - Types gateway/zmq ne réutilisent pas assez les types partagés
   - Structures imbriquées dupliquées

**Recommandation:**
- 🔧 **Générer schémas API depuis types TypeScript** (ex: `ts-json-schema-generator`)
- 🔧 **Consolider types partagés** en une seule source de vérité
- 🔧 **Type guards centralisés** pour validation runtime

---

## 4. Patterns de Communication

### 4.1 Gateway ↔ Translator (ZMQ)

#### Architecture Actuelle

```
GATEWAY                                    TRANSLATOR
   │                                           │
   │  1. PUSH: AudioProcessRequest           │
   ├──────────────────────────────────────────>│
   │     {                                     │
   │       type: 'audio_process',              │
   │       messageId: '...',                   │
   │       audioPath: '...',                   │
   │       targetLanguages: ['en', 'es'],      │
   │       binaryFrames: {audio: 1}            │ ← Multipart
   │     }                                     │
   │     [Binary Frame: Audio Data]            │
   │                                           │
   │                                       ┌───▼───┐
   │                                       │Process│
   │                                       │ Audio │
   │                                       └───┬───┘
   │                                           │
   │  2. PUB: AudioProcessCompletedEvent      │
   │<──────────────────────────────────────────┤
   │     {                                     │
   │       type: 'audio_process_completed',    │
   │       taskId: '...',                      │
   │       transcription: {...},               │
   │       translatedAudios: [                 │
   │         {targetLanguage: 'en', ...},      │
   │         {targetLanguage: 'es', ...}       │
   │       ]                                   │
   │     }                                     │
   │                                           │
```

#### ✅ **Points Forts**

1. **ZMQ Multipart pour données binaires**
   ```typescript
   export interface BinaryFrameInfo {
     audio?: number;              // Index du frame audio
     embedding?: number;          // Index du frame embedding
     voiceProfile?: number;       // Index du voice profile
     audioMimeType?: string;
     audioSize?: number;
     embeddingSize?: number;
     voiceProfileSize?: number;
   }
   ```
   - ✅ Évite base64 pour gros fichiers
   - ✅ Performance optimale

2. **Pattern PUB/SUB pour événements asynchrones**
   - ✅ Gateway peut traiter plusieurs événements simultanés
   - ✅ Découplage temporel

3. **Identifiants de corrélation**
   ```typescript
   request: { messageId, attachmentId }
   response: { taskId, messageId, attachmentId }
   ```
   - ✅ Traçabilité garantie

#### ⚠️ **Points d'Amélioration**

1. **Pas de timeout explicite**
   - Problème: Si translator crash, gateway attend indéfiniment
   - Recommandation: Ajouter `timeoutMs` dans request + événement `timeout` côté gateway

2. **Pas de retry automatique**
   - Problème: Échec définitif sur erreur réseau temporaire
   - Recommandation: Implémenter retry avec backoff exponentiel

3. **Pas de versioning des messages**
   - Problème: Évolution du format de message peut casser la compatibilité
   - Recommandation: Ajouter `version: string` dans tous les messages

**Recommandation: Pattern amélioré**
```typescript
export interface ZMQRequest {
  version: '2.0';                    // ✅ Versioning
  requestId: string;                 // ✅ Unique ID
  type: 'audio_process' | 'voice_api' | ...;
  timeoutMs?: number;                // ✅ Timeout explicite
  retryPolicy?: {                    // ✅ Retry configurable
    maxRetries: number;
    backoffMs: number;
  };
  payload: AudioProcessRequest | VoiceAPIRequest | ...;
}

export interface ZMQResponse {
  version: '2.0';
  requestId: string;                 // ✅ Corrélation
  status: 'success' | 'error' | 'timeout' | 'retry';
  processingTimeMs: number;
  payload: AudioProcessCompletedEvent | AudioProcessErrorEvent | ...;
}
```

### 4.2 Gateway ↔ Frontend (Socket.IO + REST)

#### REST API Pattern

```typescript
// GET /api/messages/:messageId/attachments/:attachmentId
{
  "id": "att_123",
  "messageId": "msg_456",
  "fileName": "audio.mp3",
  "fileUrl": "https://...",
  "transcription": {              // ✅ Champ JSON
    "type": "audio",
    "text": "Hello world",
    "language": "en",
    "confidence": 0.95,
    "segments": [...]
  },
  "translations": {               // ✅ Champ JSON
    "fr": {
      "type": "audio",
      "transcription": "Bonjour le monde",
      "url": "https://...",
      "voiceCloned": true
    },
    "es": {
      "type": "audio",
      "transcription": "Hola mundo",
      "url": "https://...",
      "voiceCloned": true
    }
  }
}
```

**Évaluation: ✅ Excellent (9/10)**
- ✅ Structure normalisée
- ✅ Champs JSON pour flexibilité
- ✅ Soft-delete support (`deletedAt`)
- ⚠️ Schéma OpenAPI incomplet (pas de détails sur `transcription`/`translations`)

#### Socket.IO Pattern

```typescript
// Event: 'audio:translation-ready'
{
  messageId: 'msg_456',
  attachmentId: 'att_123',
  conversationId: 'conv_789',
  transcription: {
    text: 'Hello world',
    language: 'en',
    confidence: 0.95,
    segments: [
      { text: 'Hello', startMs: 0, endMs: 500 },
      { text: 'world', startMs: 500, endMs: 1000 }
    ]
  },
  translatedAudios: [
    {
      id: 'att_123_fr',
      type: 'audio',
      targetLanguage: 'fr',
      translatedText: 'Bonjour le monde',
      url: 'https://...',
      voiceCloned: true,
      durationMs: 1200
    }
  ]
}
```

**Évaluation: ✅ Très bon (8.5/10)**
- ✅ Données complètes pour mise à jour UI immédiate
- ✅ Segments inclus pour sync audio/texte
- ✅ Type discriminant présent
- ⚠️ Nommage `translatedAudios` devrait être `translatedMedia` pour généricité

---

## 5. Recommandations d'Amélioration

### 🔴 Priorité 1: Résoudre la Duplication de Types

**Problème:** Deux définitions de `AttachmentTranscription` créent confusion et risque d'incohérence.

**Solution: Approche Hybride**

```typescript
// packages/shared/types/attachment-transcription.ts (SOURCE DE VÉRITÉ)

/**
 * Segment de transcription avec timestamps
 */
export interface TranscriptionSegment {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly speakerId?: string;
  readonly confidence?: number;
  readonly voiceSimilarityScore?: number | null;
}

/**
 * Source de transcription
 */
export type TranscriptionSource =
  | 'mobile'      // Mobile app transcription
  | 'whisper'     // Whisper AI
  | 'voice_api'   // Voice API
  | 'ocr'         // OCR for documents
  | 'vision_api'; // Vision API for images

/**
 * Analyse des locuteurs (audio)
 */
export interface SpeakerAnalysis {
  readonly speakers: readonly SpeakerInfo[];
  readonly totalDurationMs: number;
  readonly method: 'pyannote' | 'pitch_clustering' | 'single_speaker';
}

/**
 * Champs communs à toutes les transcriptions
 */
interface BaseTranscription {
  readonly type: 'audio' | 'video' | 'document' | 'image';
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly source: TranscriptionSource;
  readonly model?: string;
}

/**
 * Transcription audio
 */
export interface AudioTranscription extends BaseTranscription {
  readonly type: 'audio';
  readonly segments?: readonly TranscriptionSegment[];
  readonly durationMs?: number;
  readonly speakerCount?: number;
  readonly primarySpeakerId?: string;
  readonly senderVoiceIdentified?: boolean;
  readonly senderSpeakerId?: string | null;
  readonly speakerAnalysis?: SpeakerAnalysis;
}

/**
 * Transcription video
 */
export interface VideoTranscription extends BaseTranscription {
  readonly type: 'video';
  readonly segments?: readonly TranscriptionSegment[];
  readonly durationMs?: number;
  readonly subtitleUrl?: string;
  readonly format?: 'srt' | 'vtt' | 'ass';
}

/**
 * Transcription document
 */
export interface DocumentTranscription extends BaseTranscription {
  readonly type: 'document';
  readonly pageCount?: number;
  readonly layout?: 'single-column' | 'multi-column' | 'mixed';
}

/**
 * Transcription image
 */
export interface ImageTranscription extends BaseTranscription {
  readonly type: 'image';
  readonly description?: string;
  readonly detectedObjects?: readonly string[];
}

/**
 * Union discriminée de tous les types de transcription
 */
export type AttachmentTranscription =
  | AudioTranscription
  | VideoTranscription
  | DocumentTranscription
  | ImageTranscription;

/**
 * Type guards
 */
export function isAudioTranscription(t: AttachmentTranscription): t is AudioTranscription {
  return t.type === 'audio';
}

export function isVideoTranscription(t: AttachmentTranscription): t is VideoTranscription {
  return t.type === 'video';
}

export function isDocumentTranscription(t: AttachmentTranscription): t is DocumentTranscription {
  return t.type === 'document';
}

export function isImageTranscription(t: AttachmentTranscription): t is ImageTranscription {
  return t.type === 'image';
}
```

**Actions:**
1. 🔧 Supprimer `AttachmentTranscription` de `attachment-audio.ts`
2. 🔧 Réexporter depuis `attachment-transcription.ts` dans `attachment-audio.ts`
3. 🔧 Mettre à jour tous les imports

**Bénéfices:**
- ✅ Une seule source de vérité
- ✅ Type safety maximale avec union discriminée
- ✅ IntelliSense précis selon le type
- ✅ Impossible d'avoir des champs incohérents

### 🟡 Priorité 2: Généraliser les Interfaces ZMQ

**Problème:** Interfaces ZMQ trop spécifiques à l'audio.

**Solution:**

```typescript
// services/gateway/src/services/zmq-translation/types.ts

/**
 * Type de média transcriptible
 */
export type MediaType = 'audio' | 'video' | 'document' | 'image';

/**
 * Requête de traitement média générique
 */
export interface MediaProcessRequest {
  type: 'media_process';
  version: '2.0';
  taskId: string;

  // Identifiers
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;

  // Media type & source
  mediaType: MediaType;
  mediaPath?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  binaryFrames?: BinaryFrameInfo;

  // Metadata (optional selon type)
  durationMs?: number;     // audio, video
  pageCount?: number;      // document
  width?: number;          // image, video
  height?: number;         // image, video

  // Transcription existante (mobile)
  existingTranscription?: AttachmentTranscription;  // ✅ Réutilise type partagé

  // Translation settings
  targetLanguages: string[];
  modelType: string;

  // Audio-specific settings
  audioSettings?: {
    generateVoiceClone: boolean;
    existingVoiceProfile?: VoiceProfile;
    useOriginalVoice?: boolean;
    voiceCloneParams?: VoiceCloneParams;
  };

  // Timeouts & retry
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
}

/**
 * Événement de traitement complété
 */
export interface MediaProcessCompletedEvent {
  type: 'media_process_completed';
  version: '2.0';
  taskId: string;
  messageId: string;
  attachmentId: string;

  transcription: AttachmentTranscription;  // ✅ Type partagé
  translations: Array<{
    language: string;
    translation: AttachmentTranslation;  // ✅ Type partagé
  }>;

  processingTimeMs: number;
  timestamp: number;

  // Audio-specific results
  audioResults?: {
    voiceModelUserId: string;
    voiceModelQuality: number;
  };
}
```

**Bénéfices:**
- ✅ Support natif pour tous les types de média
- ✅ Réutilisation des types partagés
- ✅ Extensibilité pour nouveaux types
- ✅ Settings spécifiques isolés

### 🟡 Priorité 3: Synchroniser Schémas API

**Problème:** Schémas `api-schemas.ts` ne reflètent pas totalement la structure des types.

**Solution: Génération Automatique**

```bash
# Installation
npm install --save-dev ts-json-schema-generator

# Script de génération
# scripts/generate-api-schemas.ts
```

```typescript
import { createGenerator } from 'ts-json-schema-generator';

const config = {
  path: 'packages/shared/types/attachment-transcription.ts',
  tsconfig: 'tsconfig.json',
  type: '*', // Generate all exported types
};

const schema = createGenerator(config).createSchema();
const schemaString = JSON.stringify(schema, null, 2);
fs.writeFileSync('packages/shared/schemas/generated.json', schemaString);
```

**Alternative: Validation avec Zod**

```typescript
// packages/shared/types/attachment-transcription.zod.ts
import { z } from 'zod';

export const TranscriptionSegmentSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  speakerId: z.string().optional(),
  confidence: z.number().optional(),
  voiceSimilarityScore: z.number().nullable().optional(),
});

export const AudioTranscriptionSchema = z.object({
  type: z.literal('audio'),
  text: z.string(),
  language: z.string(),
  confidence: z.number(),
  source: z.enum(['mobile', 'whisper', 'voice_api', 'ocr', 'vision_api']),
  model: z.string().optional(),
  segments: z.array(TranscriptionSegmentSchema).optional(),
  durationMs: z.number().optional(),
  speakerCount: z.number().optional(),
  primarySpeakerId: z.string().optional(),
  senderVoiceIdentified: z.boolean().optional(),
  senderSpeakerId: z.string().nullable().optional(),
  speakerAnalysis: z.any().optional(),  // TODO: type properly
});

// Union discriminée
export const AttachmentTranscriptionSchema = z.discriminatedUnion('type', [
  AudioTranscriptionSchema,
  VideoTranscriptionSchema,
  DocumentTranscriptionSchema,
  ImageTranscriptionSchema,
]);

// Génération de types TypeScript depuis Zod
export type AttachmentTranscription = z.infer<typeof AttachmentTranscriptionSchema>;
```

**Bénéfices:**
- ✅ **Single source of truth**: Schémas Zod
- ✅ **Validation runtime**: Zod peut valider les données
- ✅ **Génération OpenAPI**: Zod peut générer schémas JSON
- ✅ **DRY**: Pas de duplication type ↔ schéma

### 🟢 Priorité 4: Améliorer Nommage et Cohérence

**Renommages suggérés:**

| Actuel | Suggéré | Raison |
|--------|---------|--------|
| `AudioTranslationReadyEventData` | `MediaTranslationReadyEventData` | Généralisation |
| `TranslatedAudioData` | `TranslatedMediaData` | Généralisation |
| `toSocketIOAudio` | `toSocketIOMedia` | Généralisation |
| `audioDurationMs` | `durationMs` | Cohérence |
| `transcribedText` | `text` | Cohérence |

**Migration:**
```typescript
// Étape 1: Créer nouveaux types
export type MediaTranslationReadyEventData = AudioTranslationReadyEventData;
export type TranslatedMediaData = TranslatedAudioData;

// Étape 2: Déprécier anciens
/** @deprecated Use MediaTranslationReadyEventData */
export type AudioTranslationReadyEventData = MediaTranslationReadyEventData;

// Étape 3: Migrer progressivement le code
// Étape 4: Supprimer anciens types (version majeure suivante)
```

### 🟢 Priorité 5: Documentation Architecture

**Créer un guide d'architecture:**

```markdown
# Architecture Guide: Transcription & Translation System

## 1. Overview
[Diagramme architecture]

## 2. Type System
### 2.1 Core Types
- TranscriptableType
- TranslationType
- TranscriptionSource

### 2.2 Data Models
- AttachmentTranscription (union discriminée)
- AttachmentTranslation
- SocketIOTranslation

### 2.3 Communication Types
- ZMQ Requests/Responses
- Socket.IO Events
- REST API Schemas

## 3. Data Flow
### 3.1 Audio Message Flow
[Sequence diagram]

### 3.2 Document Processing Flow
[Sequence diagram]

## 4. Adding New Media Types
[Step-by-step guide]

## 5. Migration Guide
[Version upgrade guide]
```

---

## 6. Checklist de Conformité Architecturale

### Type System
- [x] ✅ Types de base définis (`TranscriptableType`, `TranslationType`)
- [ ] ⚠️ Éliminer duplication `AttachmentTranscription`
- [ ] ⚠️ Synchroniser `TranscriptionSource` entre fichiers
- [x] ✅ Type guards implémentés
- [x] ✅ Helpers utilitaires (hasTranslation, getTranslation, etc.)

### Séparation des Responsabilités
- [x] ✅ REST API types séparés
- [x] ✅ Socket.IO events typés
- [ ] ⚠️ ZMQ types trop spécifiques audio
- [x] ✅ Conversion Prisma ↔ API ↔ Socket.IO

### Extensibilité
- [x] ✅ Ajout de nouveaux types possible
- [ ] ⚠️ Nécessite modifications multiples fichiers
- [ ] ⚠️ Pas de génération automatique schémas

### Communication
- [x] ✅ ZMQ multipart pour binaires
- [x] ✅ Identifiants de corrélation
- [ ] ⚠️ Pas de timeout/retry explicite
- [ ] ⚠️ Pas de versioning messages
- [x] ✅ Socket.IO events bien structurés

### Documentation
- [x] ✅ Commentaires JSDoc présents
- [ ] ⚠️ Pas de guide d'architecture centralisé
- [ ] ⚠️ Exemples d'usage manquants
- [ ] ⚠️ Diagrammes de flux absents

---

## 7. Plan d'Action Recommandé

### Phase 1: Consolidation (Sprint 1-2)
1. ✅ **Fusionner définitions `AttachmentTranscription`**
   - Garder version union discriminée de `attachment-transcription.ts`
   - Supprimer version flat de `attachment-audio.ts`
   - Mettre à jour imports

2. ✅ **Synchroniser `TranscriptionSource`**
   - Utiliser définition de `attachment-audio.ts` partout
   - Ajouter `voice_api` dans `attachment-transcription.ts`

3. ✅ **Renommer pour cohérence**
   - `transcribedText` → `text`
   - `audioDurationMs` → `durationMs`

### Phase 2: Généralisation (Sprint 3-4)
1. ✅ **Généraliser interfaces ZMQ**
   - Créer `MediaProcessRequest` générique
   - Créer `MediaProcessCompletedEvent` générique
   - Maintenir compatibilité avec aliases

2. ✅ **Renommer événements Socket.IO**
   - `AudioTranslationReadyEventData` → `MediaTranslationReadyEventData`
   - Ajouter support pour video/document/image

3. ✅ **Mettre à jour schémas API**
   - Compléter `messageAttachmentSchema` avec détails `transcription`
   - Ajouter schémas pour video/document/image

### Phase 3: Validation & Tooling (Sprint 5-6)
1. ⚙️ **Implémenter validation Zod**
   - Créer schémas Zod pour tous les types
   - Ajouter validation runtime dans gateway
   - Générer types TypeScript depuis Zod

2. ⚙️ **Ajouter versioning ZMQ**
   - Implémenter `version` dans requests/responses
   - Gérer compatibilité multi-versions

3. ⚙️ **Améliorer robustesse ZMQ**
   - Timeout configurable
   - Retry avec backoff
   - Monitoring et métriques

### Phase 4: Documentation (Sprint 7)
1. 📚 **Créer guide d'architecture**
   - Diagrammes de flux
   - Exemples d'usage
   - Guide d'ajout de nouveaux types

2. 📚 **Générer documentation API**
   - OpenAPI complet
   - Exemples de requêtes/réponses
   - Guide de migration

---

## 8. Conclusion

### Points Forts de l'Architecture Actuelle
- ✅ **Généralisation réussie** audio → multi-formats
- ✅ **Séparation claire** entre couches (DB, API, WebSocket)
- ✅ **Type safety** avec TypeScript et unions discriminées
- ✅ **Performance** avec ZMQ multipart pour binaires
- ✅ **Helpers utilitaires** bien pensés

### Axes d'Amélioration Prioritaires
1. 🔴 **Éliminer duplication types** entre fichiers
2. 🟡 **Généraliser interfaces ZMQ** pour tous types de média
3. 🟡 **Synchroniser schémas API** avec types TypeScript
4. 🟢 **Améliorer nommage** pour cohérence
5. 🟢 **Documenter architecture** avec diagrammes

### Score Global: **7.5/10**
- Architecture solide avec bonne vision
- Quelques incohérences à résoudre
- Extensibilité bonne mais nécessite améliorations
- Communication bien structurée
- Documentation insuffisante

**Avec les recommandations appliquées: 9.5/10** 🎯
