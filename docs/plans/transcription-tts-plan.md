# Plan d'Implémentation : Transcription, Traduction & Clonage Vocal pour Meeshy

## Vue d'ensemble

Ce plan détaille l'intégration d'un **pipeline audio complet** dans le service `translator` de Meeshy:
1. **Transcription** (Speech-to-Text) - avec support des métadonnées mobiles
2. **Traduction** - vers toutes les langues des destinataires
3. **Clonage Vocal** - reproduction de la voix de l'émetteur
4. **Synthèse TTS** - génération d'audio traduit avec voix clonée

**IMPORTANT**: Le service Translator fonctionne de manière **autonome** (sans dépendre du Gateway).

---

## INTÉGRATION AVEC LE CODE EXISTANT

### Analyse du Code Actuel

#### 1. Structures Gateway Existantes

**AttachmentService** (`services/gateway/src/services/AttachmentService.ts`):
- Le champ `metadata` JSON dans `messageAttachment` stocke déjà `audioEffectsTimeline`
- Les métadonnées audio (duration, codec, sampleRate) sont extraites côté client (Web Audio API) ou serveur
- Format actuel des métadonnées passées à l'upload:

```typescript
// EXISTANT - services/gateway/src/services/AttachmentService.ts:469-490
metadata: {
  duration: number,           // secondes
  bitrate: number,            // bps
  sampleRate: number,         // Hz
  codec: string,
  channels: number,
  audioEffectsTimeline?: {    // Effets audio appliqués
    events: AudioEffect[]
  }
}
```

**ZMQ Translation Client** (`services/gateway/src/services/zmq-translation-client.ts`):
- Pattern PUSH/SUB sur ports 5555 (commandes) et 5558 (résultats)
- Interface `TranslationRequest` existante:

```typescript
// EXISTANT - zmq-translation-client.ts:11-18
interface TranslationRequest {
  messageId: string;
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
  conversationId: string;
  modelType?: string;
}
```

**Message Flow** (`services/gateway/src/socketio/MeeshySocketIOManager.ts`):
- `CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS` pour messages avec fichiers
- Broadcast via `SERVER_EVENTS.MESSAGE_NEW` avec attachments inclus
- `SERVER_EVENTS.MESSAGE_TRANSLATION` pour traductions prêtes

#### 2. Structures Translator Existantes

**MeeshyTranslationServer** (`services/translator/src/main.py`):
- Initialisation: Settings → TranslationMLService → ZMQTranslationServer → TranslationAPI
- Modèles chargés en arrière-plan (non-bloquant)
- Pattern Singleton pour TranslationMLService

**ZMQ Message Types** (`services/translator/src/services/zmq_server.py`):
- `type: "translation"` - Traduction de texte
- `type: "ping"` - Health check
- Résultats: `translation_completed`, `translation_error`, `translation_skipped`

---

### NOUVELLES STRUCTURES À AJOUTER

#### 1. Extension du champ `metadata` pour transcription mobile

**Format étendu pour `messageAttachment.metadata`**:

```typescript
// NOUVEAU - À documenter pour les clients mobiles
interface AudioAttachmentMetadata {
  // EXISTANT
  audioEffectsTimeline?: {
    events: AudioEffect[]
  };

  // NOUVEAU - Transcription faite sur mobile
  transcription?: {
    text: string;              // Texte transcrit
    language: string;          // Code langue ISO 639-1 (fr, en, es...)
    confidence: number;        // Score 0-1
    source: "ios_speech" | "android_speech" | "whisperkit" | "other";
    segments?: Array<{         // Optionnel - timestamps
      text: string;
      startMs: number;
      endMs: number;
    }>;
  };
}
```

**Modification AttachmentService** (`services/gateway/src/services/AttachmentService.ts`):

```typescript
// À AJOUTER dans uploadFile() après ligne 490
if (providedMetadata.transcription) {
  console.log('📝 [AttachmentService] Mobile transcription found:', {
    text: providedMetadata.transcription.text.substring(0, 50) + '...',
    language: providedMetadata.transcription.language,
    source: providedMetadata.transcription.source
  });
  metadata.transcription = providedMetadata.transcription;
}
```

#### 2. Nouveau Type de Message ZMQ: `audio_process`

**Interface AudioProcessRequest** (Gateway → Translator):

```typescript
// NOUVEAU - services/gateway/src/services/zmq-translation-client.ts
interface AudioProcessRequest {
  type: "audio_process";

  // Identifiants
  messageId: string;
  attachmentId: string;
  conversationId: string;
  senderId: string;

  // Audio source
  audioUrl: string;            // URL accessible du fichier audio
  audioPath: string;           // Chemin relatif dans uploads/
  audioDurationMs: number;

  // Transcription mobile (optionnelle)
  mobileTranscription?: {
    text: string;
    language: string;
    confidence: number;
    source: string;
  };

  // Langues cibles (extraites des membres de la conversation)
  targetLanguages: string[];

  // Options
  generateVoiceClone: boolean;  // true par défaut
  modelType: "basic" | "medium" | "premium";
}
```

**Interface AudioProcessResult** (Translator → Gateway):

```typescript
// NOUVEAU - services/gateway/src/services/zmq-translation-client.ts
interface AudioProcessResult {
  type: "audio_process_completed";
  taskId: string;
  messageId: string;
  attachmentId: string;

  // Transcription
  transcription: {
    text: string;
    language: string;
    confidence: number;
    source: "mobile" | "whisper";
    segments?: TranscriptionSegment[];
  };

  // Traductions audio générées (une par langue)
  translatedAudios: Array<{
    targetLanguage: string;
    translatedText: string;
    audioUrl: string;          // URL accessible
    audioPath: string;         // Chemin stockage
    durationMs: number;
    voiceCloned: boolean;
    voiceQuality: number;      // 0-1
  }>;

  // Métadonnées
  voiceModelUserId: string;
  voiceModelQuality: number;
  processingTimeMs: number;
  timestamp: number;
}

interface AudioProcessError {
  type: "audio_process_error";
  taskId: string;
  messageId: string;
  attachmentId: string;
  error: string;
  errorCode: "transcription_failed" | "translation_failed" | "tts_failed" | "voice_clone_failed";
}
```

#### 3. Nouveaux Événements Socket.IO

**Ajout dans `packages/shared/types/socketio-events.ts`**:

```typescript
// NOUVEAU - Événements Audio
export const SERVER_EVENTS = {
  // ... existants ...

  // Audio Processing
  AUDIO_TRANSCRIPTION_READY: 'audio:transcription:ready',
  AUDIO_TRANSLATION_READY: 'audio:translation:ready',      // Émis pour chaque langue
  AUDIO_PROCESSING_COMPLETE: 'audio:processing:complete',  // Tout le pipeline terminé
  AUDIO_PROCESSING_ERROR: 'audio:processing:error',

  // Voice Model
  VOICE_MODEL_CREATED: 'voice:model:created',
  VOICE_MODEL_IMPROVED: 'voice:model:improved',
  VOICE_MODEL_RECALIBRATED: 'voice:model:recalibrated',
} as const;

// Payloads
interface AudioTranscriptionReadyPayload {
  messageId: string;
  attachmentId: string;
  transcription: {
    text: string;
    language: string;
    confidence: number;
    source: "mobile" | "whisper";
  };
}

interface AudioTranslationReadyPayload {
  messageId: string;
  attachmentId: string;
  targetLanguage: string;
  translatedText: string;
  audioUrl: string;
  durationMs: number;
  voiceCloned: boolean;
}

interface AudioProcessingCompletePayload {
  messageId: string;
  attachmentId: string;
  transcription: TranscriptionData;
  translatedAudios: TranslatedAudioData[];
  processingTimeMs: number;
}
```

#### 4. Déclenchement du Pipeline Audio

**Option retenue: Automatique pour les messages audio**

Modification dans `MeeshySocketIOManager.ts` après création du message:

```typescript
// NOUVEAU - services/gateway/src/socketio/MeeshySocketIOManager.ts
// Après la création du message avec attachments (vers ligne 1950)

private async _triggerAudioProcessingIfNeeded(
  message: Message,
  attachments: MessageAttachment[],
  conversationId: string
): Promise<void> {
  // Filtrer les attachments audio
  const audioAttachments = attachments.filter(att =>
    att.mimeType.startsWith('audio/')
  );

  if (audioAttachments.length === 0) return;

  // Récupérer les langues cibles des membres
  const targetLanguages = await this._getConversationTargetLanguages(
    conversationId,
    message.senderId,
    message.originalLanguage
  );

  // Envoyer chaque audio au pipeline
  for (const attachment of audioAttachments) {
    const request: AudioProcessRequest = {
      type: "audio_process",
      messageId: message.id,
      attachmentId: attachment.id,
      conversationId: conversationId,
      senderId: message.senderId,
      audioUrl: attachment.fileUrl,
      audioPath: attachment.filePath,
      audioDurationMs: (attachment.duration || 0) * 1000,
      mobileTranscription: (attachment.metadata as any)?.transcription,
      targetLanguages: targetLanguages,
      generateVoiceClone: true,
      modelType: "medium"
    };

    await this.zmqClient.sendAudioProcessRequest(request);

    logger.info(`[Audio] Triggered processing for attachment ${attachment.id}`);
  }
}
```

#### 5. Gestion des Résultats Audio (Gateway)

**Nouveau handler dans ZMQTranslationClient**:

```typescript
// NOUVEAU - services/gateway/src/services/zmq-translation-client.ts

private _handleAudioProcessResult(event: AudioProcessResult | AudioProcessError): void {
  if (event.type === 'audio_process_completed') {
    // Émettre transcription ready
    this.emit('audioTranscriptionReady', {
      messageId: event.messageId,
      attachmentId: event.attachmentId,
      transcription: event.transcription
    });

    // Émettre chaque traduction audio
    for (const audio of event.translatedAudios) {
      this.emit('audioTranslationReady', {
        messageId: event.messageId,
        attachmentId: event.attachmentId,
        targetLanguage: audio.targetLanguage,
        translatedText: audio.translatedText,
        audioUrl: audio.audioUrl,
        durationMs: audio.durationMs,
        voiceCloned: audio.voiceCloned
      });
    }

    // Émettre processing complete
    this.emit('audioProcessingComplete', event);

  } else if (event.type === 'audio_process_error') {
    this.emit('audioProcessingError', event);
  }
}
```

**Handler Socket.IO dans MeeshySocketIOManager**:

```typescript
// NOUVEAU - Écouter les événements audio du ZMQ client
this.zmqClient.on('audioTranscriptionReady', async (data) => {
  // Sauvegarder en BDD
  await this.saveAudioTranscription(data);

  // Broadcast à la conversation
  this.io.to(`conversation_${data.conversationId}`)
    .emit(SERVER_EVENTS.AUDIO_TRANSCRIPTION_READY, data);
});

this.zmqClient.on('audioTranslationReady', async (data) => {
  // Sauvegarder en BDD
  await this.saveTranslatedAudio(data);

  // Broadcast à la conversation
  this.io.to(`conversation_${data.conversationId}`)
    .emit(SERVER_EVENTS.AUDIO_TRANSLATION_READY, data);
});
```

#### 6. Stockage des Audios Générés

**Structure de fichiers**:

```
uploads/
└── attachments/           # Existant - audios originaux
    └── YYYY/mm/userId/
        └── audio_UUID.webm

outputs/                   # NOUVEAU - audios générés
└── audio/
    └── translated/
        └── YYYY/mm/
            └── {messageId}_{targetLang}.mp3
    └── voice_models/
        └── {userId}/
            └── embedding.pkl
            └── metadata.json
```

**Nouvelle route pour servir les audios générés**:

```typescript
// NOUVEAU - services/gateway/src/routes/audio-outputs.ts
router.get('/outputs/audio/:path(*)', async (request, reply) => {
  const filePath = path.join(OUTPUTS_DIR, 'audio', request.params.path);

  if (!fs.existsSync(filePath)) {
    return reply.status(404).send({ error: 'Audio not found' });
  }

  const mimeType = getMimeType(filePath);
  return reply.type(mimeType).send(fs.createReadStream(filePath));
});
```

#### 7. Relation Prisma: Attachment → TranslatedAudios

**Modification du schéma**:

```prisma
// packages/shared/prisma/schema.prisma

model MessageAttachment {
  // ... champs existants ...

  // NOUVEAU - Relation vers la transcription
  transcription    MessageAudioTranscription?

  // NOUVEAU - Relation vers les audios traduits
  translatedAudios MessageTranslatedAudio[]
}

model MessageAudioTranscription {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId

  // Relation vers l'attachment source
  attachmentId    String   @unique @db.ObjectId
  attachment      MessageAttachment @relation(fields: [attachmentId], references: [id], onDelete: Cascade)

  // Relation vers le message (pour requêtes directes)
  messageId       String   @db.ObjectId
  message         Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  // Données de transcription
  transcribedText String
  language        String
  confidence      Float
  source          String   // "mobile" | "whisper"
  segments        Json?    // Timestamps optionnels
  audioDurationMs Int
  model           String?  // "whisper-large-v3" si serveur

  createdAt       DateTime @default(now())

  @@index([messageId])
  @@index([language])
  @@map("message_audio_transcriptions")
}

model MessageTranslatedAudio {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId

  // Relation vers l'attachment source
  attachmentId    String   @db.ObjectId
  attachment      MessageAttachment @relation(fields: [attachmentId], references: [id], onDelete: Cascade)

  // Relation vers le message
  messageId       String   @db.ObjectId
  message         Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  // Données audio traduit
  targetLanguage  String
  translatedText  String
  audioPath       String
  audioUrl        String
  durationMs      Int
  format          String   @default("mp3")

  // Clonage vocal
  voiceCloned     Boolean  @default(true)
  voiceQuality    Float
  voiceModelId    String?  @db.ObjectId

  // Métadonnées
  ttsModel        String   @default("xtts")
  createdAt       DateTime @default(now())

  // Contrainte: une seule version par attachment + langue
  @@unique([attachmentId, targetLanguage])
  @@index([messageId])
  @@index([targetLanguage])
  @@map("message_translated_audios")
}
```

---

### FLOW COMPLET INTÉGRÉ

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 1. CLIENT MOBILE (iOS/Android)                                                       │
│    ┌──────────────────────────────────────────────────────────────────────────────┐ │
│    │  a. Enregistre audio                                                          │ │
│    │  b. Transcrit localement (iOS Speech / Android Speech / WhisperKit)          │ │
│    │  c. Upload avec metadata:                                                      │ │
│    │     POST /attachments/upload                                                   │ │
│    │     FormData: {                                                                │ │
│    │       file: audio.webm,                                                        │ │
│    │       metadata_0: {                                                            │ │
│    │         duration: 5.2,                                                         │ │
│    │         codec: "opus",                                                         │ │
│    │         transcription: {        // ← NOUVEAU                                   │ │
│    │           text: "Bonjour!",                                                    │ │
│    │           language: "fr",                                                      │ │
│    │           confidence: 0.92,                                                    │ │
│    │           source: "ios_speech"                                                 │ │
│    │         }                                                                      │ │
│    │       }                                                                        │ │
│    │     }                                                                          │ │
│    │  d. Socket: MESSAGE_SEND_WITH_ATTACHMENTS { attachmentIds: [...] }            │ │
│    └──────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                          ↓
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 2. GATEWAY                                                                           │
│    ┌──────────────────────────────────────────────────────────────────────────────┐ │
│    │  a. AttachmentService.uploadFile()                                            │ │
│    │     → Stocke metadata.transcription dans messageAttachment.metadata           │ │
│    │                                                                                │ │
│    │  b. MeeshySocketIOManager._handleMessageSendWithAttachments()                 │ │
│    │     → Crée Message + associe Attachments                                       │ │
│    │     → Broadcast MESSAGE_NEW                                                    │ │
│    │                                                                                │ │
│    │  c. _triggerAudioProcessingIfNeeded() // ← NOUVEAU                            │ │
│    │     → Détecte mimeType audio/*                                                │ │
│    │     → Récupère targetLanguages des membres                                    │ │
│    │     → ZMQ PUSH: AudioProcessRequest {                                         │ │
│    │         type: "audio_process",                                                │ │
│    │         messageId, attachmentId, audioPath,                                   │ │
│    │         mobileTranscription: metadata.transcription,                          │ │
│    │         targetLanguages: ["en", "es", "de"]                                   │ │
│    │       }                                                                        │ │
│    └──────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                          ↓ ZMQ PUSH (port 5555)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 3. TRANSLATOR SERVICE                                                                │
│    ┌──────────────────────────────────────────────────────────────────────────────┐ │
│    │  ZMQTranslationServer._handle_audio_process()  // ← NOUVEAU                   │ │
│    │                                                                                │ │
│    │  ÉTAPE 1: TRANSCRIPTION                                                       │ │
│    │  ┌────────────────────────────────────────────────────────────────────────┐   │ │
│    │  │  if mobileTranscription:                                               │   │ │
│    │  │      transcription = mobileTranscription  # Réutiliser                 │   │ │
│    │  │  else:                                                                 │   │ │
│    │  │      transcription = TranscriptionService.transcribe(audioPath)        │   │ │
│    │  └────────────────────────────────────────────────────────────────────────┘   │ │
│    │                                    ↓                                           │ │
│    │  ÉTAPE 2: CLONAGE VOCAL                                                       │ │
│    │  ┌────────────────────────────────────────────────────────────────────────┐   │ │
│    │  │  voice_model = VoiceCloneService.get_or_create(                        │   │ │
│    │  │      user_id=senderId,                                                 │   │ │
│    │  │      audio_path=audioPath,                                             │   │ │
│    │  │      duration_ms=audioDurationMs                                       │   │ │
│    │  │  )                                                                     │   │ │
│    │  │  # Si audio trop court → agrège historique audios de l'utilisateur    │   │ │
│    │  │  # Cache modèle 30 jours, amélioration continue                        │   │ │
│    │  └────────────────────────────────────────────────────────────────────────┘   │ │
│    │                                    ↓                                           │ │
│    │  ÉTAPE 3: POUR CHAQUE targetLanguage                                          │ │
│    │  ┌────────────────────────────────────────────────────────────────────────┐   │ │
│    │  │  # 3a. Traduire texte                                                  │   │ │
│    │  │  translated_text = TranslationMLService.translate(                     │   │ │
│    │  │      text=transcription.text,                                          │   │ │
│    │  │      source=transcription.language,                                    │   │ │
│    │  │      target=targetLanguage                                             │   │ │
│    │  │  )                                                                     │   │ │
│    │  │                                                                        │   │ │
│    │  │  # 3b. Générer audio avec voix clonée                                  │   │ │
│    │  │  audio_result = TTSService.synthesize_with_voice(                      │   │ │
│    │  │      text=translated_text,                                             │   │ │
│    │  │      voice_model=voice_model,                                          │   │ │
│    │  │      language=targetLanguage                                           │   │ │
│    │  │  )                                                                     │   │ │
│    │  │                                                                        │   │ │
│    │  │  # 3c. Stocker fichier audio                                           │   │ │
│    │  │  audio_path = f"outputs/audio/translated/{messageId}_{lang}.mp3"       │   │ │
│    │  └────────────────────────────────────────────────────────────────────────┘   │ │
│    │                                    ↓                                           │ │
│    │  ÉTAPE 4: PUBLIER RÉSULTAT                                                    │ │
│    │  ┌────────────────────────────────────────────────────────────────────────┐   │ │
│    │  │  ZMQ PUB: AudioProcessResult {                                         │   │ │
│    │  │      type: "audio_process_completed",                                  │   │ │
│    │  │      messageId, attachmentId,                                          │   │ │
│    │  │      transcription: { text, language, confidence, source },            │   │ │
│    │  │      translatedAudios: [                                               │   │ │
│    │  │          { targetLanguage: "en", audioUrl: "...", ... },               │   │ │
│    │  │          { targetLanguage: "es", audioUrl: "...", ... },               │   │ │
│    │  │      ]                                                                 │   │ │
│    │  │  }                                                                     │   │ │
│    │  └────────────────────────────────────────────────────────────────────────┘   │ │
│    └──────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                          ↓ ZMQ PUB (port 5558)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 4. GATEWAY (réception résultat)                                                      │
│    ┌──────────────────────────────────────────────────────────────────────────────┐ │
│    │  ZMQTranslationClient._handleAudioProcessResult()                             │ │
│    │                                                                                │ │
│    │  a. Sauvegarder en BDD:                                                       │ │
│    │     → MessageAudioTranscription                                               │ │
│    │     → MessageTranslatedAudio[] (une par langue)                               │ │
│    │                                                                                │ │
│    │  b. Émettre événements Socket.IO:                                             │ │
│    │     → AUDIO_TRANSCRIPTION_READY                                               │ │
│    │     → AUDIO_TRANSLATION_READY (pour chaque langue)                            │ │
│    │     → AUDIO_PROCESSING_COMPLETE                                               │ │
│    └──────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                          ↓ Socket.IO
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 5. CLIENTS (tous les membres de la conversation)                                     │
│    ┌──────────────────────────────────────────────────────────────────────────────┐ │
│    │  socket.on('audio:transcription:ready', (data) => {                           │ │
│    │      // Afficher texte transcrit sous le message audio                        │ │
│    │  });                                                                           │ │
│    │                                                                                │ │
│    │  socket.on('audio:translation:ready', (data) => {                             │ │
│    │      // Si data.targetLanguage === user.preferredLanguage                     │ │
│    │      // → Afficher bouton "Écouter traduction" avec audioUrl                  │ │
│    │      // → Afficher texte traduit                                              │ │
│    │  });                                                                           │ │
│    └──────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### MODIFICATIONS FICHIERS EXISTANTS (RÉSUMÉ)

| Fichier | Modification |
|---------|-------------|
| `gateway/src/services/AttachmentService.ts` | Stocker `metadata.transcription` |
| `gateway/src/services/zmq-translation-client.ts` | Ajouter `AudioProcessRequest`, handler résultats |
| `gateway/src/socketio/MeeshySocketIOManager.ts` | Trigger audio processing, émettre événements |
| `shared/types/socketio-events.ts` | Nouveaux événements `AUDIO_*` |
| `shared/prisma/schema.prisma` | Relations Attachment ↔ Transcription ↔ TranslatedAudio |
| `translator/src/services/zmq_server.py` | Handler `audio_process` |
| `translator/src/main.py` | Initialiser nouveaux services |

---

---

## Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CLIENT (iOS/Android/Web)                                      │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  1. Enregistrement Audio                                                   │  │
│  │  2. Transcription locale (optionnelle) → metadata.transcription           │  │
│  │  3. Envoi: { audio_file, metadata: { transcription?, language? } }        │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│              TRANSLATOR SERVICE (Autonome - services/translator)                 │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    AudioMessagePipeline (NOUVEAU)                        │    │
│  │                                                                          │    │
│  │   ÉTAPE 1: TRANSCRIPTION                                                │    │
│  │   ┌────────────────────────────────────────────────────────────────┐    │    │
│  │   │  Si metadata.transcription existe → utiliser directement       │    │    │
│  │   │  Sinon → TranscriptionService (Whisper)                        │    │    │
│  │   │  Résultat: { text, language, confidence, segments[] }          │    │    │
│  │   └────────────────────────────────────────────────────────────────┘    │    │
│  │                              ↓                                           │    │
│  │   ÉTAPE 2: TRADUCTION (pour chaque langue destinataire)                 │    │
│  │   ┌────────────────────────────────────────────────────────────────┐    │    │
│  │   │  TranslationMLService.translate_with_structure()               │    │    │
│  │   │  → Générer N versions traduites (1 par langue destinataire)    │    │    │
│  │   │  Résultat: { "fr": "Bonjour", "en": "Hello", "es": "Hola" }   │    │    │
│  │   └────────────────────────────────────────────────────────────────┘    │    │
│  │                              ↓                                           │    │
│  │   ÉTAPE 3: CLONAGE VOCAL                                                │    │
│  │   ┌────────────────────────────────────────────────────────────────┐    │    │
│  │   │  VoiceCloneService.get_or_create_voice_model(user_id)          │    │    │
│  │   │  → Charger modèle voix depuis cache                            │    │    │
│  │   │  → Si audio trop court: agréger tous les audios de l'auteur    │    │    │
│  │   │  → Amélioration continue du modèle (mise à jour mensuelle)     │    │    │
│  │   │  Résultat: VoiceModel (embedding ou modèle fine-tuné)          │    │    │
│  │   └────────────────────────────────────────────────────────────────┘    │    │
│  │                              ↓                                           │    │
│  │   ÉTAPE 4: SYNTHÈSE TTS (pour chaque langue)                            │    │
│  │   ┌────────────────────────────────────────────────────────────────┐    │    │
│  │   │  TTSService.synthesize_with_voice(text, voice_model, lang)     │    │    │
│  │   │  → Générer N fichiers audio (1 par langue destinataire)        │    │    │
│  │   │  Résultat: { "fr": audio_fr.mp3, "en": audio_en.mp3, ... }    │    │    │
│  │   └────────────────────────────────────────────────────────────────┘    │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────────┐ │
│  │ TranscriptionService │  │ VoiceCloneService    │  │ TTSService             │ │
│  │ (Whisper)            │  │ (OpenVoice V2)       │  │ (XTTS + Voice Clone)   │ │
│  └──────────────────────┘  └──────────────────────┘  └────────────────────────┘ │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                      VoiceModelCache (NOUVEAU)                            │   │
│  │  - Cache des modèles de voix par utilisateur                             │   │
│  │  - Mise à jour automatique mensuelle                                      │   │
│  │  - Agrégation des audios pour amélioration continue                      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           RÉSULTAT FINAL                                         │
│                                                                                  │
│  AudioMessageResult {                                                            │
│    original: {                                                                   │
│      audio_url: "uploads/audio/msg_123_original.mp3",                           │
│      transcription: "Bonjour, comment allez-vous?",                             │
│      language: "fr",                                                             │
│      duration_ms: 3500                                                           │
│    },                                                                            │
│    translations: {                                                               │
│      "en": {                                                                     │
│        text: "Hello, how are you?",                                             │
│        audio_url: "outputs/audio/msg_123_en.mp3",                               │
│        voice_cloned: true                                                        │
│      },                                                                          │
│      "es": {                                                                     │
│        text: "Hola, ¿cómo estás?",                                              │
│        audio_url: "outputs/audio/msg_123_es.mp3",                               │
│        voice_cloned: true                                                        │
│      }                                                                           │
│    }                                                                             │
│  }                                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Audio Complet

### Flux de Traitement

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         FLUX DE TRAITEMENT AUDIO                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────┐                                                                  │
│  │ Audio reçu  │                                                                  │
│  │ + metadata  │                                                                  │
│  └──────┬──────┘                                                                  │
│         │                                                                         │
│         ▼                                                                         │
│  ┌──────────────────────────────────────┐                                        │
│  │ Transcription fournie par mobile?    │                                        │
│  └──────────────┬───────────────────────┘                                        │
│         │                    │                                                    │
│        OUI                  NON                                                   │
│         │                    │                                                    │
│         ▼                    ▼                                                    │
│  ┌─────────────────┐  ┌─────────────────────┐                                    │
│  │ Utiliser        │  │ TranscriptionService │                                    │
│  │ metadata.text   │  │ (Whisper large-v3)   │                                    │
│  └────────┬────────┘  └──────────┬──────────┘                                    │
│           │                      │                                                │
│           └──────────┬───────────┘                                                │
│                      ▼                                                            │
│           ┌─────────────────────┐                                                 │
│           │ Texte transcrit     │                                                 │
│           │ + langue détectée   │                                                 │
│           └──────────┬──────────┘                                                 │
│                      │                                                            │
│                      ▼                                                            │
│  ┌───────────────────────────────────────────────────────────────┐               │
│  │ Récupérer les langues de destination de tous les membres      │               │
│  │ de la conversation (User.systemLanguage ou regionalLanguage)  │               │
│  └───────────────────────────────────┬───────────────────────────┘               │
│                                      │                                            │
│                                      ▼                                            │
│  ┌───────────────────────────────────────────────────────────────┐               │
│  │           POUR CHAQUE LANGUE DESTINATAIRE                     │               │
│  │  ┌─────────────────────────────────────────────────────────┐  │               │
│  │  │  1. Traduire texte → TranslationMLService               │  │               │
│  │  │  2. Charger/créer modèle voix → VoiceCloneService       │  │               │
│  │  │  3. Générer audio traduit → TTSService + VoiceModel     │  │               │
│  │  └─────────────────────────────────────────────────────────┘  │               │
│  └───────────────────────────────────┬───────────────────────────┘               │
│                                      │                                            │
│                                      ▼                                            │
│           ┌─────────────────────────────────────────┐                            │
│           │ Sauvegarder résultats en BDD            │                            │
│           │ - MessageAudioTranscription             │                            │
│           │ - MessageTranslatedAudio[] (par langue) │                            │
│           └─────────────────────────────────────────┘                            │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 : TranscriptionService

### 1.1 Service de Transcription

**Fichier**: `services/translator/src/services/transcription_service.py`

```python
"""
Service de transcription audio - Singleton
Supporte les transcriptions mobiles (metadata) et serveur (Whisper)
"""

class TranscriptionService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.model = None  # faster-whisper model
        self.device = "cpu"  # ou "cuda"
        self.compute_type = "float16"
        self.is_initialized = False

    async def initialize(self) -> bool:
        """Charge le modèle Whisper au démarrage"""
        from faster_whisper import WhisperModel
        self.model = WhisperModel(
            "large-v3",
            device=self.device,
            compute_type=self.compute_type
        )
        self.is_initialized = True
        return True

    async def transcribe(
        self,
        audio_path: str,
        mobile_transcription: Optional[str] = None,
        mobile_language: Optional[str] = None,
        return_timestamps: bool = True
    ) -> TranscriptionResult:
        """
        Transcrit un fichier audio.

        Si mobile_transcription est fourni, l'utilise directement.
        Sinon, utilise Whisper pour transcrire.

        Args:
            audio_path: Chemin vers le fichier audio
            mobile_transcription: Transcription fournie par le client mobile
            mobile_language: Langue détectée par le mobile
            return_timestamps: Retourner les segments avec timestamps

        Returns:
            TranscriptionResult avec text, language, confidence, segments
        """
        # Si transcription mobile fournie, l'utiliser
        if mobile_transcription:
            return TranscriptionResult(
                text=mobile_transcription,
                language=mobile_language or "auto",
                confidence=0.85,  # Confiance par défaut pour mobile
                segments=[],
                duration_ms=await self._get_audio_duration(audio_path),
                source="mobile"
            )

        # Sinon, transcrire avec Whisper
        segments, info = self.model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=return_timestamps
        )

        segments_list = list(segments)
        full_text = " ".join([s.text for s in segments_list])

        return TranscriptionResult(
            text=full_text,
            language=info.language,
            confidence=info.language_probability,
            segments=[
                TranscriptionSegment(
                    text=s.text,
                    start_ms=int(s.start * 1000),
                    end_ms=int(s.end * 1000),
                    confidence=s.avg_logprob
                ) for s in segments_list
            ],
            duration_ms=int(info.duration * 1000),
            source="whisper"
        )
```

### 1.2 Modèles de Données

```python
@dataclass
class TranscriptionResult:
    text: str
    language: str
    confidence: float
    segments: List[TranscriptionSegment]
    duration_ms: int
    source: str  # "mobile" ou "whisper"

@dataclass
class TranscriptionSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: float
```

---

## Phase 2 : VoiceCloneService (Clonage Vocal)

### 2.1 Architecture du Clonage Vocal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VoiceCloneService                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      VoiceModelCache                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Cache Redis/Fichier:                                            │  │ │
│  │  │  - Clé: user_id                                                  │  │ │
│  │  │  - Valeur: { embedding, model_path, created_at, updated_at,     │  │ │
│  │  │             audio_count, total_duration_ms, quality_score }      │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Logique de création/amélioration:                                     │ │
│  │                                                                         │ │
│  │  1. get_voice_model(user_id, audio_path)                               │ │
│  │     │                                                                   │ │
│  │     ├─→ Si modèle en cache ET < 30 jours → retourner                   │ │
│  │     │                                                                   │ │
│  │     ├─→ Si modèle en cache ET > 30 jours → recalibrer                  │ │
│  │     │                                                                   │ │
│  │     └─→ Si pas de modèle → créer nouveau                               │ │
│  │                                                                         │ │
│  │  2. create_voice_model(user_id, audio_paths[])                         │ │
│  │     │                                                                   │ │
│  │     ├─→ Si durée totale < 10s → chercher plus d'audios                 │ │
│  │     │   └─→ get_user_audio_history(user_id)                            │ │
│  │     │                                                                   │ │
│  │     ├─→ Concaténer audios → audio_combined.wav                         │ │
│  │     │                                                                   │ │
│  │     ├─→ Extraire embedding voix (OpenVoice)                            │ │
│  │     │                                                                   │ │
│  │     └─→ Sauvegarder en cache                                           │ │
│  │                                                                         │ │
│  │  3. improve_voice_model(user_id, new_audio_path)                       │ │
│  │     │                                                                   │ │
│  │     ├─→ Charger modèle existant                                        │ │
│  │     │                                                                   │ │
│  │     ├─→ Ajouter nouvel audio aux données d'entraînement                │ │
│  │     │                                                                   │ │
│  │     └─→ Recalculer embedding (moyenne pondérée)                        │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Service de Clonage Vocal

**Fichier**: `services/translator/src/services/voice_clone_service.py`

```python
"""
Service de clonage vocal - Singleton
Gère les modèles de voix des utilisateurs avec cache et amélioration continue
"""

import os
import pickle
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List
import numpy as np

class VoiceCloneService:
    _instance = None
    _lock = threading.Lock()

    # Configuration
    MIN_AUDIO_DURATION_MS = 10_000  # 10 secondes minimum pour clonage
    VOICE_MODEL_MAX_AGE_DAYS = 30   # Recalibrer après 30 jours

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.voice_cache_dir = Path("voice_models")
        self.voice_cache_dir.mkdir(exist_ok=True)
        self.tone_color_converter = None  # OpenVoice
        self.is_initialized = False

    async def initialize(self) -> bool:
        """Initialise OpenVoice pour le clonage vocal"""
        from openvoice import se_extractor
        from openvoice.api import ToneColorConverter

        self.tone_color_converter = ToneColorConverter(
            "checkpoints/converter",
            device=self.device
        )
        self.is_initialized = True
        return True

    async def get_or_create_voice_model(
        self,
        user_id: str,
        current_audio_path: str,
        current_audio_duration_ms: int
    ) -> VoiceModel:
        """
        Récupère ou crée un modèle de voix pour un utilisateur.

        Logique:
        1. Si modèle en cache et récent → utiliser
        2. Si modèle en cache mais ancien → améliorer avec nouvel audio
        3. Si pas de modèle et audio trop court → agréger historique
        4. Créer nouveau modèle

        Args:
            user_id: ID de l'utilisateur
            current_audio_path: Audio actuel pour le clonage
            current_audio_duration_ms: Durée de l'audio actuel

        Returns:
            VoiceModel prêt à l'emploi
        """
        # 1. Vérifier le cache
        cached_model = await self._load_cached_model(user_id)

        if cached_model:
            age_days = (datetime.now() - cached_model.updated_at).days

            # Modèle récent → utiliser directement
            if age_days < self.VOICE_MODEL_MAX_AGE_DAYS:
                logger.info(f"[VOICE] Using cached model for user {user_id} (age: {age_days} days)")
                return cached_model

            # Modèle ancien → améliorer avec nouvel audio
            logger.info(f"[VOICE] Model outdated for user {user_id}, improving...")
            return await self._improve_model(cached_model, current_audio_path)

        # 2. Pas de modèle → créer
        audio_paths = [current_audio_path]
        total_duration = current_audio_duration_ms

        # Si audio trop court, chercher l'historique
        if total_duration < self.MIN_AUDIO_DURATION_MS:
            logger.info(f"[VOICE] Audio too short ({total_duration}ms), fetching history...")
            historical_audios = await self._get_user_audio_history(user_id)
            audio_paths.extend(historical_audios)
            total_duration = await self._calculate_total_duration(audio_paths)

            logger.info(f"[VOICE] Found {len(historical_audios)} historical audios, total: {total_duration}ms")

        # Créer le modèle avec ce qu'on a (même si insuffisant)
        return await self._create_voice_model(user_id, audio_paths, total_duration)

    async def _create_voice_model(
        self,
        user_id: str,
        audio_paths: List[str],
        total_duration_ms: int
    ) -> VoiceModel:
        """Crée un nouveau modèle de voix à partir des audios"""
        from openvoice import se_extractor

        # Concaténer les audios si multiples
        if len(audio_paths) > 1:
            combined_audio = await self._concatenate_audios(audio_paths)
        else:
            combined_audio = audio_paths[0]

        # Extraire l'embedding de voix
        embedding = se_extractor.get_se(
            combined_audio,
            self.tone_color_converter,
            target_dir=str(self.voice_cache_dir / user_id)
        )

        # Calculer score de qualité
        quality_score = self._calculate_quality_score(total_duration_ms, len(audio_paths))

        # Créer le modèle
        model = VoiceModel(
            user_id=user_id,
            embedding=embedding,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            audio_count=len(audio_paths),
            total_duration_ms=total_duration_ms,
            quality_score=quality_score
        )

        # Sauvegarder en cache
        await self._save_model_to_cache(model)

        logger.info(f"[VOICE] Created model for user {user_id}: quality={quality_score:.2f}")
        return model

    async def _improve_model(
        self,
        existing_model: VoiceModel,
        new_audio_path: str
    ) -> VoiceModel:
        """Améliore un modèle existant avec un nouvel audio"""
        from openvoice import se_extractor

        # Extraire embedding du nouvel audio
        new_embedding = se_extractor.get_se(
            new_audio_path,
            self.tone_color_converter,
            target_dir=str(self.voice_cache_dir / existing_model.user_id / "temp")
        )

        # Moyenne pondérée (plus de poids aux anciens pour stabilité)
        weight_old = 0.7
        weight_new = 0.3
        improved_embedding = (
            weight_old * existing_model.embedding +
            weight_new * new_embedding
        )

        # Mettre à jour le modèle
        existing_model.embedding = improved_embedding
        existing_model.updated_at = datetime.now()
        existing_model.audio_count += 1
        existing_model.quality_score = min(1.0, existing_model.quality_score + 0.05)

        await self._save_model_to_cache(existing_model)

        logger.info(f"[VOICE] Improved model for user {existing_model.user_id}")
        return existing_model

    async def _get_user_audio_history(self, user_id: str) -> List[str]:
        """
        Récupère l'historique des messages audio d'un utilisateur.
        Utilise la base de données pour trouver les attachements audio.
        """
        # Requête Prisma pour récupérer les audios de l'utilisateur
        from services.database_service import DatabaseService
        db = DatabaseService()

        attachments = await db.prisma.messageattachment.find_many(
            where={
                "message": {
                    "senderId": user_id
                },
                "mimeType": {
                    "startswith": "audio/"
                }
            },
            order_by={"createdAt": "desc"},
            take=20  # Limiter aux 20 derniers audios
        )

        return [att.filePath for att in attachments if os.path.exists(att.filePath)]

    def _calculate_quality_score(self, duration_ms: int, audio_count: int) -> float:
        """
        Calcule un score de qualité basé sur la durée et le nombre d'audios.

        - 0-10s: 0.3 (faible)
        - 10-30s: 0.5 (moyen)
        - 30-60s: 0.7 (bon)
        - 60s+: 0.9 (excellent)
        - Bonus: +0.05 par audio supplémentaire (max +0.1)
        """
        if duration_ms < 10_000:
            base_score = 0.3
        elif duration_ms < 30_000:
            base_score = 0.5
        elif duration_ms < 60_000:
            base_score = 0.7
        else:
            base_score = 0.9

        audio_bonus = min(0.1, (audio_count - 1) * 0.05)
        return min(1.0, base_score + audio_bonus)

    async def schedule_monthly_recalibration(self):
        """
        Tâche planifiée pour recalibrer les modèles de voix mensuellement.
        À exécuter via un cron job ou un scheduler.
        """
        all_models = await self._list_all_cached_models()

        for model in all_models:
            age_days = (datetime.now() - model.updated_at).days

            if age_days >= self.VOICE_MODEL_MAX_AGE_DAYS:
                logger.info(f"[VOICE] Monthly recalibration for user {model.user_id}")

                # Récupérer les audios récents (dernier mois)
                recent_audios = await self._get_recent_user_audios(
                    model.user_id,
                    days=30
                )

                if recent_audios:
                    # Recréer le modèle avec les audios récents
                    await self._create_voice_model(
                        model.user_id,
                        recent_audios,
                        await self._calculate_total_duration(recent_audios)
                    )


@dataclass
class VoiceModel:
    user_id: str
    embedding: np.ndarray
    created_at: datetime
    updated_at: datetime
    audio_count: int
    total_duration_ms: int
    quality_score: float  # 0-1
```

---

## Phase 3 : TTSService avec Clonage

### 3.1 Service TTS

**Fichier**: `services/translator/src/services/tts_service.py`

```python
"""
Service TTS avec support du clonage vocal - Singleton
Génère des audios dans la voix de l'émetteur original
"""

class TTSService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.tts_model = None  # XTTS ou Coqui TTS
        self.output_dir = Path("outputs/audio")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.is_initialized = False

    async def initialize(self) -> bool:
        """Charge le modèle XTTS"""
        from TTS.api import TTS

        self.tts_model = TTS(
            model_name="tts_models/multilingual/multi-dataset/xtts_v2",
            device=self.device
        )
        self.is_initialized = True
        return True

    async def synthesize_with_voice(
        self,
        text: str,
        voice_model: VoiceModel,
        target_language: str,
        output_format: str = "mp3"
    ) -> TTSResult:
        """
        Synthétise du texte avec la voix clonée.

        Args:
            text: Texte à synthétiser
            voice_model: Modèle de voix de l'émetteur
            target_language: Langue de sortie
            output_format: Format audio (mp3, wav, ogg)

        Returns:
            TTSResult avec chemin du fichier audio généré
        """
        start_time = time.time()

        # Générer nom de fichier unique
        output_filename = f"tts_{uuid.uuid4()}.{output_format}"
        output_path = self.output_dir / output_filename

        # Mapper les codes de langue pour XTTS
        xtts_lang = self._map_language_code(target_language)

        # Synthèse avec voix clonée
        self.tts_model.tts_to_file(
            text=text,
            speaker_wav=voice_model.embedding,  # Utiliser l'embedding
            language=xtts_lang,
            file_path=str(output_path)
        )

        # Obtenir durée
        duration_ms = await self._get_audio_duration(output_path)

        processing_time = int((time.time() - start_time) * 1000)

        return TTSResult(
            audio_path=str(output_path),
            audio_url=f"/audio/{output_filename}",
            duration_ms=duration_ms,
            format=output_format,
            language=target_language,
            voice_cloned=True,
            voice_quality=voice_model.quality_score,
            processing_time_ms=processing_time
        )

    def _map_language_code(self, lang: str) -> str:
        """Mappe les codes de langue vers les codes XTTS"""
        mapping = {
            "fr": "fr", "en": "en", "es": "es", "de": "de",
            "pt": "pt", "it": "it", "pl": "pl", "tr": "tr",
            "ru": "ru", "nl": "nl", "cs": "cs", "ar": "ar",
            "zh": "zh-cn", "ja": "ja", "hu": "hu", "ko": "ko"
        }
        return mapping.get(lang, "en")


@dataclass
class TTSResult:
    audio_path: str
    audio_url: str
    duration_ms: int
    format: str
    language: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int
```

---

## Phase 4 : AudioMessagePipeline (Orchestrateur)

### 4.1 Pipeline Principal

**Fichier**: `services/translator/src/services/audio_message_pipeline.py`

```python
"""
Pipeline complet pour le traitement des messages audio.
Orchestre: Transcription → Traduction → Clonage → TTS

Ce pipeline fonctionne de manière AUTONOME (sans Gateway).
"""

class AudioMessagePipeline:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.transcription_service = TranscriptionService()
        self.translation_service = get_unified_ml_service()
        self.voice_clone_service = VoiceCloneService()
        self.tts_service = TTSService()
        self.database_service = DatabaseService()
        self.is_initialized = False

    async def initialize(self) -> bool:
        """Initialise tous les services du pipeline"""
        await self.transcription_service.initialize()
        await self.translation_service.initialize()
        await self.voice_clone_service.initialize()
        await self.tts_service.initialize()
        self.is_initialized = True
        return True

    async def process_audio_message(
        self,
        audio_path: str,
        sender_id: str,
        conversation_id: str,
        metadata: Optional[AudioMessageMetadata] = None
    ) -> AudioMessageResult:
        """
        Traite un message audio complet:
        1. Transcription (mobile ou Whisper)
        2. Traduction vers toutes les langues des destinataires
        3. Clonage de la voix de l'émetteur
        4. Génération audio traduit pour chaque langue

        Args:
            audio_path: Chemin vers le fichier audio original
            sender_id: ID de l'utilisateur émetteur
            conversation_id: ID de la conversation
            metadata: Métadonnées optionnelles (transcription mobile, langue)

        Returns:
            AudioMessageResult avec original + toutes les traductions audio
        """
        start_time = time.time()

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 1: TRANSCRIPTION
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"[PIPELINE] Step 1: Transcription for sender {sender_id}")

        transcription = await self.transcription_service.transcribe(
            audio_path=audio_path,
            mobile_transcription=metadata.transcription if metadata else None,
            mobile_language=metadata.language if metadata else None,
            return_timestamps=True
        )

        logger.info(f"[PIPELINE] Transcribed: '{transcription.text[:50]}...' (lang: {transcription.language})")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 2: RÉCUPÉRER LES LANGUES DESTINATAIRES
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"[PIPELINE] Step 2: Fetching target languages for conversation {conversation_id}")

        target_languages = await self._get_target_languages(
            conversation_id=conversation_id,
            source_language=transcription.language,
            sender_id=sender_id
        )

        logger.info(f"[PIPELINE] Target languages: {target_languages}")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 3: CLONAGE VOCAL
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"[PIPELINE] Step 3: Voice cloning for sender {sender_id}")

        voice_model = await self.voice_clone_service.get_or_create_voice_model(
            user_id=sender_id,
            current_audio_path=audio_path,
            current_audio_duration_ms=transcription.duration_ms
        )

        logger.info(f"[PIPELINE] Voice model ready: quality={voice_model.quality_score:.2f}")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 4: TRADUCTION + TTS POUR CHAQUE LANGUE
        # ═══════════════════════════════════════════════════════════════
        translations = {}

        for target_lang in target_languages:
            logger.info(f"[PIPELINE] Step 4: Processing language {target_lang}")

            # 4a. Traduire le texte
            translation_result = await self.translation_service.translate_with_structure(
                text=transcription.text,
                source_language=transcription.language,
                target_language=target_lang,
                model_type="medium",  # Qualité moyenne pour messages audio
                source_channel="audio_pipeline"
            )

            translated_text = translation_result.get('translated_text', transcription.text)

            # 4b. Générer audio avec voix clonée
            tts_result = await self.tts_service.synthesize_with_voice(
                text=translated_text,
                voice_model=voice_model,
                target_language=target_lang,
                output_format="mp3"
            )

            translations[target_lang] = TranslatedAudioVersion(
                language=target_lang,
                text=translated_text,
                audio_path=tts_result.audio_path,
                audio_url=tts_result.audio_url,
                duration_ms=tts_result.duration_ms,
                voice_cloned=True,
                voice_quality=voice_model.quality_score
            )

            logger.info(f"[PIPELINE] Generated {target_lang}: '{translated_text[:30]}...'")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 5: SAUVEGARDER EN BASE DE DONNÉES
        # ═══════════════════════════════════════════════════════════════
        await self._save_to_database(
            sender_id=sender_id,
            conversation_id=conversation_id,
            transcription=transcription,
            translations=translations
        )

        processing_time = int((time.time() - start_time) * 1000)

        return AudioMessageResult(
            original=OriginalAudio(
                audio_path=audio_path,
                transcription=transcription.text,
                language=transcription.language,
                duration_ms=transcription.duration_ms,
                confidence=transcription.confidence,
                source=transcription.source
            ),
            translations=translations,
            voice_model_quality=voice_model.quality_score,
            processing_time_ms=processing_time
        )

    async def _get_target_languages(
        self,
        conversation_id: str,
        source_language: str,
        sender_id: str
    ) -> List[str]:
        """
        Récupère les langues de destination uniques de tous les membres.
        Exclut la langue source si c'est la même.
        """
        members = await self.database_service.prisma.conversationmember.find_many(
            where={
                "conversationId": conversation_id,
                "userId": {"not": sender_id},  # Exclure l'émetteur
                "isActive": True
            },
            include={"user": True}
        )

        languages = set()
        for member in members:
            user = member.user
            # Priorité: customDestinationLanguage > systemLanguage
            if user.useCustomDestination and user.customDestinationLanguage:
                languages.add(user.customDestinationLanguage)
            elif user.translateToSystemLanguage:
                languages.add(user.systemLanguage)
            elif user.translateToRegionalLanguage:
                languages.add(user.regionalLanguage)

        # Exclure la langue source
        languages.discard(source_language)

        return list(languages) if languages else [source_language]


@dataclass
class AudioMessageMetadata:
    """Métadonnées fournies par le client mobile"""
    transcription: Optional[str] = None  # Transcription faite sur mobile
    language: Optional[str] = None       # Langue détectée par mobile

@dataclass
class OriginalAudio:
    audio_path: str
    transcription: str
    language: str
    duration_ms: int
    confidence: float
    source: str  # "mobile" ou "whisper"

@dataclass
class TranslatedAudioVersion:
    language: str
    text: str
    audio_path: str
    audio_url: str
    duration_ms: int
    voice_cloned: bool
    voice_quality: float

@dataclass
class AudioMessageResult:
    original: OriginalAudio
    translations: Dict[str, TranslatedAudioVersion]
    voice_model_quality: float
    processing_time_ms: int
```

---

## Phase 5 : API FastAPI (Autonome)

### 5.1 Routes Audio

**Fichier**: `services/translator/src/api/audio_api.py`

```python
"""
API REST pour le traitement audio.
Le Translator fonctionne de manière autonome.
"""

from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
import uuid
from pathlib import Path

router = APIRouter(prefix="/audio", tags=["Audio"])

UPLOAD_DIR = Path("uploads/audio")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/process-message")
async def process_audio_message(
    audio: UploadFile = File(...),
    sender_id: str = Form(...),
    conversation_id: str = Form(...),
    mobile_transcription: Optional[str] = Form(None),
    mobile_language: Optional[str] = Form(None)
) -> AudioMessageResponse:
    """
    Traite un message audio complet:
    - Transcription (mobile ou Whisper)
    - Traduction vers les langues des destinataires
    - Clonage vocal + TTS

    Ce endpoint est AUTONOME et ne nécessite pas le Gateway.
    """
    # Sauvegarder le fichier audio
    audio_filename = f"{uuid.uuid4()}_{audio.filename}"
    audio_path = UPLOAD_DIR / audio_filename

    with open(audio_path, "wb") as f:
        content = await audio.read()
        f.write(content)

    # Préparer les métadonnées
    metadata = AudioMessageMetadata(
        transcription=mobile_transcription,
        language=mobile_language
    ) if mobile_transcription else None

    # Traiter via le pipeline
    pipeline = AudioMessagePipeline()
    result = await pipeline.process_audio_message(
        audio_path=str(audio_path),
        sender_id=sender_id,
        conversation_id=conversation_id,
        metadata=metadata
    )

    return AudioMessageResponse.from_result(result)


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    return_timestamps: bool = Form(False)
) -> TranscriptionResponse:
    """
    Transcrit un fichier audio (endpoint autonome).
    Compatible avec l'API OpenAI Whisper.
    """
    # Sauvegarder le fichier
    audio_path = UPLOAD_DIR / f"transcribe_{uuid.uuid4()}.wav"
    with open(audio_path, "wb") as f:
        f.write(await audio.read())

    # Transcrire
    service = TranscriptionService()
    result = await service.transcribe(
        audio_path=str(audio_path),
        return_timestamps=return_timestamps
    )

    # Nettoyer
    audio_path.unlink()

    return TranscriptionResponse(
        text=result.text,
        language=result.language,
        confidence=result.confidence,
        duration_ms=result.duration_ms,
        segments=result.segments if return_timestamps else None
    )


@router.post("/tts")
async def text_to_speech(
    text: str = Form(...),
    language: str = Form("en"),
    user_id: Optional[str] = Form(None),  # Pour utiliser la voix clonée
    format: str = Form("mp3")
) -> FileResponse:
    """
    Synthèse vocale (endpoint autonome).
    Si user_id fourni, utilise la voix clonée de l'utilisateur.
    """
    tts_service = TTSService()

    if user_id:
        # Avec clonage vocal
        voice_service = VoiceCloneService()
        voice_model = await voice_service.get_or_create_voice_model(
            user_id=user_id,
            current_audio_path=None,  # Utiliser le cache
            current_audio_duration_ms=0
        )
        result = await tts_service.synthesize_with_voice(
            text=text,
            voice_model=voice_model,
            target_language=language,
            output_format=format
        )
    else:
        # Sans clonage (voix par défaut)
        result = await tts_service.synthesize(
            text=text,
            language=language,
            output_format=format
        )

    return FileResponse(
        result.audio_path,
        media_type=f"audio/{format}",
        filename=f"tts_{language}.{format}"
    )


@router.get("/voice-models/{user_id}")
async def get_voice_model_info(user_id: str) -> VoiceModelInfo:
    """
    Retourne les informations sur le modèle de voix d'un utilisateur.
    """
    service = VoiceCloneService()
    model = await service._load_cached_model(user_id)

    if not model:
        raise HTTPException(status_code=404, detail="Voice model not found")

    return VoiceModelInfo(
        user_id=model.user_id,
        quality_score=model.quality_score,
        audio_count=model.audio_count,
        total_duration_ms=model.total_duration_ms,
        created_at=model.created_at,
        updated_at=model.updated_at,
        age_days=(datetime.now() - model.updated_at).days
    )


@router.post("/voice-models/{user_id}/recalibrate")
async def recalibrate_voice_model(user_id: str) -> VoiceModelInfo:
    """
    Force la recalibration du modèle de voix d'un utilisateur.
    """
    service = VoiceCloneService()

    # Récupérer les audios récents
    recent_audios = await service._get_user_audio_history(user_id)

    if not recent_audios:
        raise HTTPException(status_code=400, detail="No audio history found")

    # Recréer le modèle
    model = await service._create_voice_model(
        user_id=user_id,
        audio_paths=recent_audios,
        total_duration_ms=await service._calculate_total_duration(recent_audios)
    )

    return VoiceModelInfo(
        user_id=model.user_id,
        quality_score=model.quality_score,
        audio_count=model.audio_count,
        total_duration_ms=model.total_duration_ms,
        created_at=model.created_at,
        updated_at=model.updated_at,
        age_days=0
    )
```

---

## Phase 6 : Modèles Base de Données

### 6.1 Nouveaux Modèles Prisma

**À ajouter dans `packages/shared/prisma/schema.prisma`**:

```prisma
/// Transcription d'un message audio
model MessageAudioTranscription {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId         String   @unique @db.ObjectId

  /// Texte transcrit
  transcribedText   String

  /// Langue détectée
  language          String

  /// Score de confiance (0-1)
  confidence        Float

  /// Source: "mobile" ou "whisper"
  source            String

  /// Segments avec timestamps (JSON)
  segments          Json?

  /// Durée audio en millisecondes
  audioDurationMs   Int

  /// Modèle utilisé (si whisper)
  model             String?

  createdAt         DateTime @default(now())

  message           Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([language])
  @@map("message_audio_transcriptions")
}

/// Version audio traduite d'un message (une par langue destinataire)
model MessageTranslatedAudio {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId         String   @db.ObjectId

  /// Langue de cette version
  targetLanguage    String

  /// Texte traduit
  translatedText    String

  /// Chemin du fichier audio généré
  audioPath         String

  /// URL accessible
  audioUrl          String

  /// Durée en millisecondes
  durationMs        Int

  /// Format audio
  format            String   @default("mp3")

  /// Voix clonée utilisée
  voiceCloned       Boolean  @default(true)

  /// Qualité du clonage (0-1)
  voiceQuality      Float

  /// Modèle TTS utilisé
  ttsModel          String   @default("xtts")

  createdAt         DateTime @default(now())

  message           Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  /// Une seule version par message + langue
  @@unique([messageId, targetLanguage])
  @@index([messageId])
  @@index([targetLanguage])
  @@map("message_translated_audios")
}

/// Modèle de voix cloné d'un utilisateur
model UserVoiceModel {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  userId            String   @unique @db.ObjectId

  /// Chemin vers le fichier d'embedding
  embeddingPath     String

  /// Nombre d'audios utilisés pour l'entraînement
  audioCount        Int

  /// Durée totale des audios d'entraînement (ms)
  totalDurationMs   Int

  /// Score de qualité (0-1)
  qualityScore      Float

  /// Version du modèle (incrémentée à chaque recalibration)
  version           Int      @default(1)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  /// Prochaine recalibration prévue
  nextRecalibrationAt DateTime?

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([updatedAt])
  @@map("user_voice_models")
}
```

### 6.2 Mise à jour du Message Model

```prisma
model Message {
  // ... champs existants ...

  // Nouvelles relations pour audio
  audioTranscription    MessageAudioTranscription?
  translatedAudios      MessageTranslatedAudio[]
}

model User {
  // ... champs existants ...

  // Relation vers le modèle de voix
  voiceModel            UserVoiceModel?
}
```

---

## Phase 7 : Configuration & Environnement

### 7.1 Variables d'Environnement

```bash
# ═══════════════════════════════════════════════════════════════
# TRANSCRIPTION (Whisper)
# ═══════════════════════════════════════════════════════════════
WHISPER_MODEL=large-v3          # tiny, base, small, medium, large, large-v3
WHISPER_DEVICE=cpu              # cpu, cuda
WHISPER_COMPUTE_TYPE=float16    # float16, float32, int8

# ═══════════════════════════════════════════════════════════════
# CLONAGE VOCAL (OpenVoice)
# ═══════════════════════════════════════════════════════════════
VOICE_CLONE_DEVICE=cpu          # cpu, cuda
VOICE_MODEL_CACHE_DIR=/app/voice_models
VOICE_MODEL_MAX_AGE_DAYS=30     # Recalibration mensuelle
VOICE_MIN_DURATION_MS=10000     # Durée min pour clonage (10s)

# ═══════════════════════════════════════════════════════════════
# TTS (XTTS)
# ═══════════════════════════════════════════════════════════════
TTS_MODEL=tts_models/multilingual/multi-dataset/xtts_v2
TTS_DEVICE=cpu                  # cpu, cuda
TTS_OUTPUT_DIR=/app/outputs/audio
TTS_DEFAULT_FORMAT=mp3

# ═══════════════════════════════════════════════════════════════
# AUDIO GÉNÉRAL
# ═══════════════════════════════════════════════════════════════
AUDIO_UPLOAD_DIR=/app/uploads/audio
AUDIO_MAX_SIZE_MB=50
AUDIO_SUPPORTED_FORMATS=mp3,wav,ogg,m4a,webm,flac
```

---

## Checklist d'Implémentation

### Phase 1 - TranscriptionService
- [ ] Créer `transcription_service.py` (Singleton, Whisper)
- [ ] Support des métadonnées mobiles
- [ ] Tests unitaires transcription

### Phase 2 - VoiceCloneService
- [ ] Créer `voice_clone_service.py` (OpenVoice)
- [ ] Implémenter cache modèles de voix
- [ ] Logique d'agrégation des audios
- [ ] Amélioration continue du modèle
- [ ] Tâche de recalibration mensuelle
- [ ] Tests unitaires clonage

### Phase 3 - TTSService
- [ ] Créer `tts_service.py` (XTTS)
- [ ] Synthèse avec voix clonée
- [ ] Tests unitaires TTS

### Phase 4 - AudioMessagePipeline
- [ ] Créer `audio_message_pipeline.py`
- [ ] Orchestrer les 4 étapes
- [ ] Gestion des langues destinataires
- [ ] Tests d'intégration pipeline

### Phase 5 - API FastAPI
- [ ] Créer `audio_api.py` avec routes
- [ ] Intégrer dans `main.py`
- [ ] Documentation OpenAPI

### Phase 6 - Base de Données
- [ ] Ajouter modèles Prisma
- [ ] Générer client (`pnpm db:generate`)
- [ ] Tests BDD

### Phase 7 - Docker & Déploiement
- [ ] Mettre à jour Dockerfile (FFmpeg, dépendances)
- [ ] Configurer volumes audio
- [ ] Tests environnement Docker

---

## Dépendances Python

**À ajouter dans `requirements.txt`**:

```
# Transcription
faster-whisper==1.0.0

# Clonage Vocal
openvoice @ git+https://github.com/myshell-ai/OpenVoice.git

# TTS
TTS==0.22.0

# Audio Processing
pydub==0.25.1
ffmpeg-python==0.2.0
scipy==1.11.4
librosa==0.10.0
soundfile==0.12.1
```

---

## Estimation de Complexité

| Composant | Complexité | Priorité | Effort |
|-----------|------------|----------|--------|
| TranscriptionService | Moyenne | P1 | 2j |
| VoiceCloneService | Haute | P1 | 4j |
| TTSService | Moyenne | P1 | 2j |
| AudioMessagePipeline | Haute | P1 | 3j |
| API FastAPI | Basse | P2 | 1j |
| Modèles Prisma | Basse | P1 | 0.5j |
| Tests | Moyenne | P2 | 2j |
| Docker | Basse | P3 | 1j |

**Total estimé: ~15 jours de développement**
