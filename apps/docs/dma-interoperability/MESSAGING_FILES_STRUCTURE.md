# Résumé des fichiers clés - Architecture de Messagerie Meeshy

## Hiérarchie des fichiers et dépendances

### 1. TYPES PARTAGÉS (Fondation - Shared)

```
/shared/types/
├── socketio-events.ts          ⭐ Core - Définit tous les événements
│   ├── SERVER_EVENTS et CLIENT_EVENTS
│   ├── ClientToServerEvents et ServerToClientEvents (interfaces)
│   ├── SocketIOMessage, SocketIOUser, SocketIOResponse
│   └── Événements: MESSAGE_SEND, MESSAGE_NEW, TYPING, etc.
│
├── messaging.ts                ⭐ Core - Types requête/réponse
│   ├── MessageRequest (format standard d'envoi)
│   ├── MessageResponse (réponse avec métadonnées)
│   ├── AuthenticationContext (JWT vs Session)
│   ├── MessageValidationResult
│   └── MessagePermissionResult
│
├── message-types.ts            ⭐ Core - Types de messages
│   ├── GatewayMessage (API backend)
│   ├── UIMessage (Frontend avec états visuels)
│   ├── MessageTranslation
│   └── Fonctions de conversion: gatewayToUIMessage()
│
├── conversation.ts             ⭐ Core - Types conversations
│   ├── Message (modèle principal)
│   ├── Conversation
│   ├── ConversationType, ConversationStatus
│   ├── ConversationMember
│   └── AnonymousSenderInfo
│
└── schema.prisma              ⭐⭐⭐ Core - Schéma base de données
    ├── model User
    ├── model Message
    ├── model Conversation
    ├── model MessageTranslation
    ├── model MessageAttachment
    ├── model MessageStatus
    ├── model Reaction
    ├── model Mention
    ├── model AnonymousParticipant
    └── 30+ modèles au total
```

### 2. BACKEND - GATEWAY (Fastify)

```
/gateway/src/

SERVICE TIER (Logique métier)
├── services/
│   ├── MessagingService.ts      ⭐⭐⭐ SERVICE PRINCIPAL
│   │   ├── handleMessage() - Point d'entrée
│   │   ├── createAuthenticationContext()
│   │   ├── validateMessage()
│   │   ├── checkPermissions()
│   │   └── Gère: auth, validation, DB, mentions, notifications
│   │
│   ├── TranslationService.ts    ⭐⭐ Traduction asynchrone
│   │   ├── Communication via ZMQ
│   │   ├── Cache des traductions
│   │   └── Support multi-langue
│   │
│   ├── NotificationService.ts   ⭐⭐ Notifications
│   │   ├── Génération de notifications
│   │   ├── Mention tracking
│   │   └── Notifications push
│   │
│   ├── ReactionService.ts       ⭐ Emoji reactions
│   │   ├── Gestion des réactions
│   │   ├── Agrégation
│   │   └── Synchronisation temps réel
│   │
│   ├── ConversationStatsService.ts
│   │   └── Statistiques de conversation
│   │
│   ├── MentionService.ts
│   │   └── Gestion des mentions
│   │
│   ├── AttachmentService.ts
│   │   └── Gestion des fichiers joints
│   │
│   └── CallService.ts
│       └── Gestion des appels vidéo

SOCKET.IO TIER (Communication temps réel)
├── socketio/
│   ├── MeeshySocketIOHandler.ts    ⭐⭐⭐ Initialisation
│   │   ├── setupSocketIO()
│   │   └── Routes: /api/socketio/stats, /api/socketio/disconnect-user
│   │
│   └── MeeshySocketIOManager.ts    ⭐⭐⭐ GESTION DES CONNEXIONS
│       ├── initialize() - Setup serveur
│       ├── joinConversation()
│       ├── leaveConversation()
│       ├── _broadcastToConversation()
│       ├── _broadcastUserStatus()
│       ├── getStats()
│       ├── disconnectUser()
│       └── Mapping: connectedUsers, socketToUser, userSockets

REST API TIER (Endpoints)
├── routes/
│   ├── messages.ts              ⭐⭐ API Messages
│   │   ├── GET /messages/:messageId
│   │   ├── PUT /messages/:messageId (éditer)
│   │   ├── DELETE /messages/:messageId
│   │   ├── PATCH /messages/:messageId/status (read/delivered)
│   │   └── POST /messages/:messageId/translate
│   │
│   ├── conversations.ts         ⭐⭐ API Conversations
│   │   ├── GET /conversations
│   │   ├── POST /conversations
│   │   ├── GET /conversations/:conversationId
│   │   ├── PUT /conversations/:conversationId
│   │   ├── GET /conversations/:conversationId/messages
│   │   └── POST /conversations/:conversationId/messages
│   │
│   ├── translation*.ts          ⭐ Traductions
│   ├── reactions.ts             ⭐ Réactions
│   ├── mentions.ts              ⭐ Mentions
│   ├── notifications.ts         ⭐ Notifications
│   ├── calls.ts                 ⭐ Appels vidéo
│   ├── attachments.ts           ⭐ Fichiers
│   └── admin/                   - Routes admin

MIDDLEWARE TIER
├── middleware/
│   ├── auth.ts                  ⭐⭐⭐ AUTHENTIFICATION UNIFIÉE
│   │   ├── createUnifiedAuthMiddleware()
│   │   ├── Valide JWT ou session token
│   │   └── Attache authContext à la requête
│   │
│   ├── rate-limit.ts            ⭐ Rate limiting
│   ├── validation.ts            ⭐ Validation requêtes
│   └── admin-*.middleware.ts    - Admin permissions

UTILITAIRES
├── utils/
│   ├── socket-rate-limiter.ts   - Limite Socket.IO
│   ├── logger.ts                - Winston logger
│   └── normalize.ts             - Normalisation IDs
│
├── config/
│   └── message-limits.ts        - Limites de messages
│
└── server.ts                    ⭐⭐⭐ POINT D'ENTRÉE
    ├── Configuration Fastify
    ├── Helmet (sécurité)
    ├── CORS
    ├── JWT setup
    ├── Prisma initialization
    ├── Routes registration
    └── Socket.IO setup
```

### 3. FRONTEND (Next.js + React)

```
/apps/web/

SERVICES LAYER (Communication)
├── services/
│   ├── meeshy-socketio.service.ts    ⭐⭐⭐ CLIENT SOCKET.IO
│   │   ├── Singleton pattern
│   │   ├── connect() / disconnect()
│   │   ├── joinConversation()
│   │   ├── leaveConversation()
│   │   ├── sendMessage()
│   │   ├── editMessage()
│   │   ├── deleteMessage()
│   │   ├── Event listeners (message, typing, status, etc.)
│   │   ├── Reconnection logic
│   │   └── Manages: connectedUsers, typingUsers, translationCache
│   │
│   ├── messages.service.ts           ⭐⭐ API Messages (REST)
│   │   ├── createMessage()
│   │   ├── getMessagesByConversation()
│   │   ├── sendMessageToConversation()
│   │   ├── updateMessage()
│   │   ├── deleteMessage()
│   │   └── searchMessages()
│   │
│   ├── conversations.service.ts      ⭐⭐ API Conversations (REST)
│   │   ├── getConversations()
│   │   ├── getConversation()
│   │   ├── createConversation()
│   │   ├── updateConversation()
│   │   └── Participant management
│   │
│   ├── message-translation.service.ts ⭐ Traductions
│   ├── attachmentService.ts          ⭐ Attachments
│   ├── auth-manager.service.ts       ⭐ Auth tokens
│   └── webrtc-service.ts             ⭐ WebRTC

HOOKS LAYER (State management)
├── hooks/
│   ├── use-socketio-messaging.ts     ⭐⭐⭐ HOOK PRINCIPAL
│   │   ├── useSocketIOMessaging()
│   │   ├── Manages: connection, events, listeners
│   │   ├── Auto-reconnect logic
│   │   ├── useEffect pour: mount, join/leave, listeners
│   │   └── Returns: isConnected, send, edit, delete functions
│   │
│   ├── use-message-translations.ts   ⭐⭐ Traductions
│   ├── use-message-reactions.ts      ⭐⭐ Réactions
│   ├── use-message-view-state.tsx    ⭐⭐ État de message
│   ├── use-conversation-messages.ts  ⭐⭐ Messages conversation
│   ├── use-conversations-pagination.ts
│   ├── use-anonymous-messages.ts
│   └── use-websocket.ts

COMPONENTS LAYER (UI)
├── components/
│   ├── common/
│   │   ├── BubbleMessage.tsx         ⭐⭐⭐ MESSAGE DISPLAY
│   │   │   ├── Memoized pour performance
│   │   │   ├── Props: message, user, language, handlers
│   │   │   ├── States: viewing, editing, reacting, translating
│   │   │   ├── Sous-composants:
│   │   │   │   ├── BubbleMessageNormalView
│   │   │   │   ├── ReactionSelectionMessageView
│   │   │   │   ├── LanguageSelectionMessageView
│   │   │   │   ├── EditMessageView
│   │   │   │   ├── DeleteConfirmationView
│   │   │   │   └── ReportMessageView
│   │   │   └── Callbacks: onEdit, onDelete, onLanguageSwitch, etc.
│   │   │
│   │   └── bubble-stream-page.tsx    - Page chat
│   │
│   ├── chat/
│   │   └── message-with-links.tsx    - Messages avec liens
│   │
│   ├── messages/
│   │   └── [Composants de messages]
│   │
│   ├── translation/
│   │   └── [Composants de traduction]
│   │
│   ├── attachments/
│   │   └── [Gestion fichiers joints]
│   │
│   └── video-calls/
│       └── [Appels vidéo]

PAGES LAYER (Routes Next.js)
├── app/
│   ├── chat/[id]/page.tsx           - Page chat
│   ├── chat/[id]/layout.tsx
│   ├── conversation/[conversationId]/page.tsx
│   ├── conversations/layout.tsx
│   └── conversations/[[...id]]/page.tsx
```

### 4. DÉPENDANCES CLÉS

```
Backend:
  fastify              - Framework web
  @fastify/jwt         - JWT support
  @fastify/cors        - CORS
  @fastify/helmet      - Sécurité headers
  socket.io            - WebSocket bidirectionnel
  prisma               - ORM
  mongodb              - Base de données
  jsonwebtoken         - Création JWT
  winston              - Logging
  zmq                  - Message queue (traduction)

Frontend:
  next.js              - Framework React
  socket.io-client     - Client Socket.IO
  react                - UI library
  framer-motion        - Animations
  zustand              - State management (optionnel)
  typescript           - Type safety
```

---

## Architecture détaillée de MessagingService

### Flux principal: handleMessage()

```typescript
MessagingService.handleMessage()
    │
    ├─ ÉTAPE 1: Authentification
    │   ├─ createAuthenticationContext()
    │   └─ Détermine type: JWT ou Session
    │
    ├─ ÉTAPE 2: Validation
    │   ├─ validateMessage()
    │   ├─ Vérifie contenu, longueur, etc.
    │   └─ Retourne MessageValidationResult
    │
    ├─ ÉTAPE 3: Permissions
    │   ├─ checkPermissions()
    │   └─ Vérifie actions autorisées
    │
    ├─ ÉTAPE 4: Insertion BD
    │   ├─ prisma.message.create()
    │   └─ Stocke dans MongoDB
    │
    ├─ ÉTAPE 5: Mentions
    │   ├─ MentionService.extractMentions()
    │   └─ Crée notifications
    │
    ├─ ÉTAPE 6: Traduction
    │   ├─ TranslationService.enqueueTranslation()
    │   └─ Asynchrone via ZMQ
    │
    ├─ ÉTAPE 7: Notifications
    │   ├─ NotificationService.create()
    │   └─ Génère notifications push
    │
    ├─ ÉTAPE 8: Stats
    │   ├─ ConversationStatsService.update()
    │   └─ Met à jour statistiques
    │
    └─ RETOUR: MessageResponse
        ├─ data: SocketIOMessage (complet)
        └─ metadata: ConversationStats, TranslationStatus, etc.
```

### Flux Socket.IO: message:send

```typescript
CLIENT EMIT: message:send(data, callback)
    │
    ▼
GATEWAY REÇOIT: on('message:send', (data, callback) => {
    │
    ├─ Extraction auth depuis socket
    ├─ Extraction senderId
    ├─ Conversion data → MessageRequest
    │
    ├─ MessagingService.handleMessage(request, senderId)
    │
    ├─ SI succès:
    │   ├─ Callback avec ACK { success: true }
    │   └─ BROADCAST à room: message:new { message, conversationId }
    │
    └─ SI erreur:
        ├─ Callback avec erreur
        └─ EMIT error event
})
```

---

## Points clés d'intégration pour DMA/MLS

### 1. Où ajouter le chiffrement

**Point d'interception - Envoi:**
```
Client sends message
    ↓
[NOUVEAU] MessageEncryptionService.encryptMessage()
    ├─ Chiffre avec clés MLS
    ├─ Signe le message
    └─ Retourne EncryptedMessage
        ↓
    Envoyer à gateway
```

**Point d'interception - Réception:**
```
Gateway reçoit message:send
    ├─ MessagingService.handleMessage() (existant)
    │   └─ Valide et stocke
    │
    ├─ [NOUVEAU] MLSService.verifySignature()
    │   └─ Vérifie authenticité
    │
    └─ BROADCAST message:new
        ↓
        Client reçoit
        ├─ [NOUVEAU] MessageEncryptionService.decryptMessage()
        └─ Affiche texte en clair
```

### 2. Où ajouter la gestion des clés

**Initialisation conversation:**
```
Création conversation
    ↓
[NOUVEAU] MLSKeyManagementService.initializeMLS()
    ├─ Crée groupe MLS
    ├─ Génère key packages
    └─ Stocke dans DB
```

**Ajout participant:**
```
User rejoint conversation
    ↓
[NOUVEAU] MLSKeyManagementService.addParticipantToMLS()
    ├─ Génère commit pour groupe
    ├─ Met à jour tree KEM
    └─ Notifie autres membres
```

### 3. Où ajouter les modèles de données MLS

**Nouvelles tables à ajouter à schema.prisma:**
```typescript
model MLSGroupState {
  conversationId String  @unique @db.ObjectId
  groupId String
  epoch Int
  treeKem Json
  ...
}

model MLSKeyPackage {
  userId String  @db.ObjectId
  keyPackageData String
  publicKey String
  ...
}

model MLSCredential {
  userId String  @db.ObjectId
  credentialData String
  ...
}
```

---

## Migration vers MLS - Points d'attention

### Points de rupture potentiels

1. **MessagingService.handleMessage()**
   - Devra décider: chiffrer ou non?
   - Backward compat: support anciens messages non-chiffrés

2. **SocketIOMessage format**
   - `content` sera chiffré (String binaire?)
   - Ou nouveau champ `encryptedContent`?

3. **TranslationService**
   - Doit déchiffrer avant traduction
   - Puis re-chiffrer après

4. **BubbleMessage component**
   - Doit décrypter localement
   - Gestion des erreurs de déchiffrement

5. **Database**
   - Messages anciens: en clair
   - Messages nouveaux: chiffrés
   - Stratégie de migration?

