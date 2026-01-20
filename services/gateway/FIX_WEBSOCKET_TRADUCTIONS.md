# Fix : Réception des traductions via WebSocket

## Problème identifié 🔴

Les traductions (messages, audio, vidéo) ne remontaient **pas** au frontend via WebSocket car `MeeshySocketIOManager` créait sa **propre instance** de `MessageTranslationService` qui n'était **jamais initialisée** et ne recevait donc **jamais** les événements ZMQ du backend translator.

### Flux cassé (avant le fix)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Translator (Python)                                          │
│   - Traite les jobs de traduction                                   │
│   - Envoie voice_translation_completed via ZMQ                      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ ZMQ
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ server.ts                                                            │
│   ✅ this.translationService = new MessageTranslationService()      │
│   ✅ await this.translationService.initialize()                     │
│      - Écoute les événements ZMQ                                    │
│      - Reçoit voice_translation_completed                           │
│      - Récupère metadata depuis cache multi-niveau                  │
│      - Émet audioTranslationReady                                   │
└─────────────────────────────────────────────────────────────────────┘

                          ❌ PAS DE LIEN !

┌─────────────────────────────────────────────────────────────────────┐
│ MeeshySocketIOManager                                                │
│   ❌ this.translationService = new MessageTranslationService()      │
│      - Instance DIFFÉRENTE, jamais initialisée                      │
│   ❌ this.translationService.on('audioTranslationReady', ...)       │
│      - Écoute sa propre instance qui ne reçoit RIEN                 │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Socket.IO (ne reçoit jamais rien)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend                                                             │
│   ❌ N'a jamais reçu les traductions en temps réel                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Solution appliquée ✅

Passer l'instance **initialisée** de `MessageTranslationService` de `server.ts` à `MeeshySocketIOManager` pour qu'ils partagent la **même instance** qui écoute ZMQ.

### Flux corrigé (après le fix)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Translator (Python)                                          │
│   - Traite les jobs de traduction                                   │
│   - Envoie voice_translation_completed via ZMQ                      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ ZMQ
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ server.ts                                                            │
│   ✅ this.translationService = new MessageTranslationService()      │
│   ✅ await this.translationService.initialize()                     │
│      - Écoute les événements ZMQ                                    │
│      - Reçoit voice_translation_completed                           │
│      - Récupère metadata depuis cache multi-niveau                  │
│      - Émet audioTranslationReady                                   │
│                                                                      │
│   ✅ Passe this.translationService à MeeshySocketIOHandler          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Injection de dépendance
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MeeshySocketIOHandler                                                │
│   ✅ constructor(prisma, jwtSecret, translationService, redis)      │
│   ✅ Passe translationService à MeeshySocketIOManager               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Injection de dépendance
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MeeshySocketIOManager                                                │
│   ✅ this.translationService = translationService (partagée!)       │
│   ✅ this.translationService.on('audioTranslationReady', ...)       │
│      - Écoute la MÊME instance qui reçoit les événements ZMQ        │
│      - Reçoit audioTranslationReady avec tous les metadata          │
│      - Diffuse via Socket.IO vers le bon conversationId             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Socket.IO (room: conversationId)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend                                                             │
│   ✅ Reçoit les traductions en temps réel !                         │
│      - Événement: audioTranslationReady                             │
│      - Contenu: transcription + traductions audio                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Changements de code

### 1. `MeeshySocketIOManager.ts`

**Avant :**
```typescript
constructor(httpServer: HTTPServer, prisma: PrismaClient, redis?: any) {
  this.prisma = prisma;
  this.translationService = new MessageTranslationService(prisma, redis); // ❌ Nouvelle instance
}
```

**Après :**
```typescript
constructor(
  httpServer: HTTPServer,
  prisma: PrismaClient,
  translationService: MessageTranslationService, // ✅ Instance partagée
  redis?: any
) {
  this.prisma = prisma;
  this.translationService = translationService; // ✅ Utilise l'instance initialisée
}
```

### 2. `MeeshySocketIOHandler.ts`

**Avant :**
```typescript
constructor(
  private readonly prisma: PrismaClient,
  private readonly jwtSecret: string,
  private readonly redis?: any
) { }

public setupSocketIO(fastify: FastifyInstance): void {
  const httpServer = fastify.server as HTTPServer;
  this.socketIOManager = new MeeshySocketIOManager(httpServer, this.prisma, this.redis); // ❌
}
```

**Après :**
```typescript
constructor(
  private readonly prisma: PrismaClient,
  private readonly jwtSecret: string,
  private readonly translationService: MessageTranslationService, // ✅ Ajout
  private readonly redis?: any
) { }

public setupSocketIO(fastify: FastifyInstance): void {
  const httpServer = fastify.server as HTTPServer;
  this.socketIOManager = new MeeshySocketIOManager(
    httpServer,
    this.prisma,
    this.translationService, // ✅ Passe l'instance partagée
    this.redis
  );
}
```

### 3. `server.ts`

**Avant :**
```typescript
this.socketIOHandler = new MeeshySocketIOHandler(
  this.prisma,
  config.jwtSecret,
  this.redis || undefined
); // ❌ Ne passe pas translationService
```

**Après :**
```typescript
// Initialiser le handler Socket.IO avec l'instance de translationService qui reçoit les événements ZMQ
this.socketIOHandler = new MeeshySocketIOHandler(
  this.prisma,
  config.jwtSecret,
  this.translationService, // ✅ Instance initialisée qui reçoit les événements ZMQ
  this.redis || undefined
);
```

## Flux complet des traductions (détaillé)

### 1. Traduction de message texte

```
Frontend → POST /api/conversations/:id/messages → MessagingService
  → translationService.translateMessage()
  → emit('translationReady')
  → MeeshySocketIOManager.on('translationReady')
  → Socket.IO: message_translation_ready → Frontend
```

### 2. Traduction audio (via attachment API)

```
Frontend → POST /api/attachments/:id/translate → AttachmentTranslateService
  → audioTranslateService.translateAsync() → ZMQ: voice_translate_async
  → jobMappingCache.saveJobMapping(jobId, {messageId, attachmentId, conversationId})

Backend Translator → traite le job → ZMQ: voice_translation_completed

Gateway:
  → translationService._handleVoiceTranslationCompleted()
  → jobMappingCache.getAndDeleteJobMapping(jobId)
  → Si metadata trouvée: emit('audioTranslationReady')
  → MeeshySocketIOManager.on('audioTranslationReady')
  → Socket.IO: audio_translation_ready (room: conversationId) → Frontend
```

### 3. Transcription seule (audio sans traduction)

```
Frontend → POST /api/attachments/:id/transcribe → AttachmentService
  → audioProcessingService.transcribeAsync() → ZMQ: audio_process
  → jobMappingCache.saveJobMapping(jobId, {messageId, attachmentId, conversationId})

Backend Translator → traite le job → ZMQ: audio_process_completed

Gateway:
  → translationService._handleAudioProcessCompleted()
  → jobMappingCache.getAndDeleteJobMapping(jobId)
  → Si metadata trouvée: emit('transcriptionReady')
  → MeeshySocketIOManager.on('transcriptionReady')
  → Socket.IO: transcription_ready (room: conversationId) → Frontend
```

## Événements Socket.IO supportés

| Événement Backend (EventEmitter) | Événement Socket.IO → Frontend | Description |
|----------------------------------|--------------------------------|-------------|
| `translationReady` | `message_translation_ready` | Message texte traduit |
| `audioTranslationReady` | `audio_translation_ready` | Audio transcrit + traduit |
| `transcriptionReady` | `transcription_ready` | Audio transcrit uniquement |

## Vérification que ça fonctionne

### Logs à vérifier au démarrage

```
✓ Translation service initialized successfully
[GWY] ✅ Socket.IO configured with MeeshySocketIOHandler
[MeeshySocketIOManager] ✅ Initialized with Redis support
```

### Logs lors d'une traduction audio

```
💾 [JobMapping] Valeur sauvegardée en mémoire: mshy_20260119_...
   🔴 Redis: sauvegardé avec TTL 3600s
📡 [TranslationService] Job d'attachment détecté - diffusion au frontend
✅ [JobMapping] Valeur trouvée et supprimée en mémoire: mshy_20260119_...
[SocketIO] 📡 Broadcasting audio_translation_ready to conversation: conv_...
```

### Dans le frontend (console développeur)

```javascript
socket.on('audio_translation_ready', (data) => {
  console.log('Traduction audio reçue:', data);
  // data contient: taskId, messageId, attachmentId, transcription, translatedAudios
});
```

## Impact de ce fix

✅ **Messages texte** : Traductions temps réel fonctionnent (déjà fonctionnel)
✅ **Traductions audio** : Maintenant reçues en temps réel par le frontend
✅ **Transcriptions seules** : Maintenant reçues en temps réel par le frontend
✅ **Traductions vidéo** : Flux identique, fonctionneront une fois implémentées

## Conclusion

Le fix est simple mais critique : **une seule instance** de `MessageTranslationService` initialisée et partagée entre tous les composants garantit que les événements ZMQ remontent correctement jusqu'au frontend via Socket.IO.

**Avant** : 2 instances déconnectées → événements perdus ❌
**Après** : 1 instance partagée → événements propagés ✅
