# Architecture Socket.IO - Diagrammes et Flux

## Vue d'ensemble de l'Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Applications                          │
│                    (Web, Mobile, Desktop)                            │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ WebSocket/Polling
                          ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     Socket.IO Server                                 │
│                  (MeeshySocketIOManager)                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐                │
│  │   Auth      │  │   Message    │  │  Reaction   │                │
│  │  Handler    │  │   Handler    │  │   Handler   │                │
│  └─────────────┘  └──────────────┘  └─────────────┘                │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐                │
│  │   Status    │  │ Conversation │  │   Utils     │                │
│  │  Handler    │  │   Handler    │  │  (Helpers)  │                │
│  └─────────────┘  └──────────────┘  └─────────────┘                │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       Service Layer                                  │
├─────────────────────────────────────────────────────────────────────┤
│  MessagingService  │  StatusService  │  NotificationService         │
│  ReactionService   │  TranslationService  │  PrivacyService         │
│  ConversationStatsService  │  AttachmentService                     │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      Database Layer                                  │
│                    (MongoDB via Prisma)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Modulaire des Handlers

```
MeeshySocketIOManager
├── Dependencies
│   ├── PrismaClient
│   ├── MessageTranslationService
│   ├── MessagingService
│   ├── StatusService
│   ├── NotificationService
│   └── ... (autres services)
│
├── Handlers (Injection de dépendances)
│   ├── AuthHandler
│   │   ├── Dépendances: Prisma, StatusService
│   │   └── Responsabilité: Authentification
│   │
│   ├── MessageHandler
│   │   ├── Dépendances: Prisma, MessagingService, StatusService, NotificationService
│   │   └── Responsabilité: Messages
│   │
│   ├── ReactionHandler
│   │   ├── Dépendances: Prisma, NotificationService
│   │   └── Responsabilité: Réactions
│   │
│   ├── StatusHandler
│   │   ├── Dépendances: Prisma, StatusService, PrivacyService
│   │   └── Responsabilité: Typing indicators
│   │
│   └── ConversationHandler
│       ├── Dépendances: Prisma
│       └── Responsabilité: Join/Leave
│
└── Maps de Connexion (Partagées)
    ├── connectedUsers: Map<string, SocketUser>
    ├── socketToUser: Map<string, string>
    └── userSockets: Map<string, Set<string>>
```

---

## Flux de Connexion Utilisateur

```
┌─────────┐                                                     ┌──────────┐
│ Client  │                                                     │ Database │
└────┬────┘                                                     └─────┬────┘
     │                                                                │
     │ 1. connect(token/sessionToken)                                │
     ├──────────────────────────────────────────────┐                │
     │                                               │                │
     │                           ┌───────────────────▼────────────┐   │
     │                           │  MeeshySocketIOManager          │   │
     │                           │  (connection event)             │   │
     │                           └───────────────────┬────────────┘   │
     │                                               │                │
     │                           ┌───────────────────▼────────────┐   │
     │                           │     AuthHandler                 │   │
     │                           │  handleTokenAuthentication()    │   │
     │                           └───────────────────┬────────────┘   │
     │                                               │                │
     │                                    2. extractJWTToken()        │
     │                                    3. extractSessionToken()    │
     │                                               │                │
     │                                    4. Validate JWT             │
     │                                               ├────────────────┤
     │                                               │ findUnique()   │
     │                                               │                │
     │                                    5. Check user/anonymous    │
     │                                               ◄────────────────┤
     │                                               │ User data      │
     │                                               │                │
     │                           6. Register in maps                  │
     │                           - connectedUsers.set()               │
     │                           - socketToUser.set()                 │
     │                           - userSockets.set()                  │
     │                                               │                │
     │ 7. authenticated event                        │                │
     ◄───────────────────────────────────────────────┤                │
     │ { userId, isAnonymous }                       │                │
     │                                               │                │
     │                           8. updateLastSeen() │                │
     │                                               ├────────────────┤
     │                                               │ Update DB      │
     │                                               ◄────────────────┤
     │                                                                │
     │ 9. USER_STATUS broadcast (to all)                             │
     ◄────────────────────────────────────────────────────────────────┤
     │ { userId, isOnline: true }                                    │
     │                                                                │
```

---

## Flux d'Envoi de Message

```
┌─────────┐                                                     ┌──────────┐
│ Client  │                                                     │ Database │
└────┬────┘                                                     └─────┬────┘
     │                                                                │
     │ message:send                                                   │
     │ { conversationId, content, ... }                               │
     ├──────────────────────────────────────────────┐                │
     │                                               │                │
     │                           ┌───────────────────▼────────────┐   │
     │                           │    MessageHandler               │   │
     │                           │  handleMessageSend()            │   │
     │                           └───────────────────┬────────────┘   │
     │                                               │                │
     │                           1. _getUserContext()                 │
     │                           2. validateMessageLength()           │
     │                           3. getAnonymousDisplayName()         │
     │                                               ├────────────────┤
     │                                               │ Query DB       │
     │                                               ◄────────────────┤
     │                                               │                │
     │                           4. MessagingService.handleMessage()  │
     │                              - Create message                  │
     │                              - Detect mentions                 │
     │                              - Request translations            │
     │                                               ├────────────────┤
     │                                               │ Insert message │
     │                                               ◄────────────────┤
     │                                               │ messageId      │
     │                                               │                │
     │ 5. ACK callback                               │                │
     ◄───────────────────────────────────────────────┤                │
     │ { success: true, messageId }                  │                │
     │                                               │                │
     │                           6. broadcastNewMessage()             │
     │                              - Fetch full message              │
     │                              - Get translations               │
     │                              - Get stats                      │
     │                                               ├────────────────┤
     │                                               │ Query with     │
     │                                               │ includes       │
     │                                               ◄────────────────┤
     │                                               │                │
     │ 7. MESSAGE_NEW (to conversation room)         │                │
     ◄───────────────────────────────────────────────┤                │
     │ { message, translations, stats }              │                │
     │                                               │                │
     │ 8. CONVERSATION_UNREAD_UPDATED                │                │
     ◄───────────────────────────────────────────────┤                │
     │ { conversationId, unreadCount }               │                │
     │                                                                │
```

---

## Flux de Réaction

```
┌─────────┐                                                     ┌──────────┐
│ Client  │                                                     │ Database │
└────┬────┘                                                     └─────┬────┘
     │                                                                │
     │ reaction:add                                                   │
     │ { messageId, emoji }                                           │
     ├──────────────────────────────────────────────┐                │
     │                                               │                │
     │                           ┌───────────────────▼────────────┐   │
     │                           │   ReactionHandler               │   │
     │                           │  handleReactionAdd()            │   │
     │                           └───────────────────┬────────────┘   │
     │                                               │                │
     │                           1. getConnectedUser()                │
     │                           2. ReactionService.addReaction()     │
     │                                               ├────────────────┤
     │                                               │ Insert reaction│
     │                                               ◄────────────────┤
     │                                               │ reactionId     │
     │                                               │                │
     │ 3. ACK callback                               │                │
     ◄───────────────────────────────────────────────┤                │
     │ { success: true, data: reaction }             │                │
     │                                               │                │
     │                           4. createUpdateEvent()               │
     │                           5. broadcastReactionEvent()          │
     │                                               │                │
     │ 6. REACTION_ADDED (to conversation)           │                │
     ◄───────────────────────────────────────────────┤                │
     │ { emoji, count, userReacted, ... }            │                │
     │                                               │                │
     │                           7. createReactionNotification()      │
     │                              (pour l'auteur du message)        │
     │                                               ├────────────────┤
     │                                               │ Insert notif   │
     │                                               ◄────────────────┤
     │                                                                │
```

---

## Flux Typing Indicator

```
┌─────────┐                                                     ┌──────────┐
│ Client  │                                                     │ Database │
└────┬────┘                                                     └─────┬────┘
     │                                                                │
     │ typing:start                                                   │
     │ { conversationId }                                             │
     ├──────────────────────────────────────────────┐                │
     │                                               │                │
     │                           ┌───────────────────▼────────────┐   │
     │                           │    StatusHandler                │   │
     │                           │  handleTypingStart()            │   │
     │                           └───────────────────┬────────────┘   │
     │                                               │                │
     │                           1. normalizeConversationId()         │
     │                           2. getConnectedUser()                │
     │                           3. updateLastSeen() (throttled)      │
     │                                               │                │
     │                           4. Check privacy preferences         │
     │                              shouldShowTypingIndicator()       │
     │                                               ├────────────────┤
     │                                               │ Query prefs    │
     │                                               ◄────────────────┤
     │                                               │ showTyping=true│
     │                                               │                │
     │                           5. getDisplayName()                  │
     │                                               ├────────────────┤
     │                                               │ Query user     │
     │                                               ◄────────────────┤
     │                                               │ displayName    │
     │                                               │                │
     │ 6. TYPING_START (to conversation, except sender)              │
     ◄───────────────────────────────────────────────┤                │
     │ { userId, username, conversationId, isTyping:true }           │
     │                                                                │
     │                                                                │
     │ (15 secondes plus tard)                                        │
     │                                                                │
     │ typing:stop                                                    │
     │ { conversationId }                                             │
     ├──────────────────────────────────────────────►                │
     │                                                                │
     │ 7. TYPING_STOP                                                │
     ◄───────────────────────────────────────────────                │
     │ { userId, username, conversationId, isTyping:false }          │
     │                                                                │
```

---

## Diagramme de Dépendances

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                      MeeshySocketIOManager                           │
│                                                                      │
└──┬────────┬────────┬────────┬────────┬──────────────────────────────┘
   │        │        │        │        │
   │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼
┌─────┐ ┌────────┐ ┌──────┐ ┌──────┐ ┌─────────┐
│Auth │ │Message │ │React │ │Status│ │Convers. │
│Hand.│ │Handler │ │Hand. │ │Hand. │ │Handler  │
└──┬──┘ └───┬────┘ └──┬───┘ └──┬───┘ └────┬────┘
   │        │           │        │          │
   │        │           │        │          │
   │        ├───────────┼────────┤          │
   │        │           │        │          │
   ▼        ▼           ▼        ▼          ▼
┌──────────────────────────────────────────────┐
│           socket-helpers (Utils)             │
│  - extractJWTToken()                         │
│  - getConnectedUser()                        │
│  - normalizeConversationId()                 │
│  - buildAnonymousDisplayName()               │
└──────────────────────────────────────────────┘
   │        │           │        │          │
   │        │           │        │          │
   ▼        ▼           ▼        ▼          ▼
┌──────────────────────────────────────────────┐
│              Service Layer                   │
│  - MessagingService                          │
│  - StatusService                             │
│  - ReactionService                           │
│  - NotificationService                       │
│  - PrivacyPreferencesService                 │
│  - ConversationStatsService                  │
└──────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│           PrismaClient (Database)            │
└──────────────────────────────────────────────┘
```

---

## Gestion des Maps de Connexion

```
┌──────────────────────────────────────────────────────────────┐
│                  Connection Maps                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  connectedUsers: Map<string, SocketUser>                    │
│  ┌────────────────┬──────────────────────────────┐          │
│  │ Key            │ Value                        │          │
│  ├────────────────┼──────────────────────────────┤          │
│  │ user-123       │ { id, socketId, language }   │ (Auth)   │
│  │ anon-token-abc │ { id, socketId, isAnonymous }│ (Anon)   │
│  └────────────────┴──────────────────────────────┘          │
│                                                              │
│  socketToUser: Map<string, string>                          │
│  ┌────────────────┬──────────────────────────────┐          │
│  │ Socket ID      │ User ID / Session Token      │          │
│  ├────────────────┼──────────────────────────────┤          │
│  │ socket-abc     │ user-123                     │          │
│  │ socket-def     │ anon-token-abc               │          │
│  └────────────────┴──────────────────────────────┘          │
│                                                              │
│  userSockets: Map<string, Set<string>>                      │
│  ┌────────────────┬──────────────────────────────┐          │
│  │ User ID        │ Set of Socket IDs            │          │
│  ├────────────────┼──────────────────────────────┤          │
│  │ user-123       │ Set('socket-abc', 'socket-xyz')         │
│  │                │ (Multi-device support)        │          │
│  └────────────────┴──────────────────────────────┘          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Synchronisation:
- AuthHandler ajoute/supprime lors de connect/disconnect
- Partagée avec tous les handlers via injection de dépendances
- Thread-safe (JavaScript single-threaded)
```

---

## Rooms Socket.IO

```
┌──────────────────────────────────────────────────────────────┐
│                    Socket.IO Rooms                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  conversation_${conversationId}                              │
│  ┌──────────────────────────────────────────┐               │
│  │ Membres:                                 │               │
│  │  - socket-123 (user-1)                   │               │
│  │  - socket-456 (user-2)                   │               │
│  │  - socket-789 (anon-user)                │               │
│  ├──────────────────────────────────────────┤               │
│  │ Événements reçus:                        │               │
│  │  - MESSAGE_NEW                           │               │
│  │  - TYPING_START / TYPING_STOP            │               │
│  │  - REACTION_ADDED / REACTION_REMOVED     │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  user_${userId}                                              │
│  ┌──────────────────────────────────────────┐               │
│  │ Membres:                                 │               │
│  │  - socket-123 (device 1)                 │               │
│  │  - socket-124 (device 2)                 │               │
│  ├──────────────────────────────────────────┤               │
│  │ Événements reçus:                        │               │
│  │  - NOTIFICATION_NEW                      │               │
│  │  - CONVERSATION_UNREAD_UPDATED           │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  Broadcast global (io.emit)                                 │
│  ┌──────────────────────────────────────────┐               │
│  │ Tous les sockets connectés               │               │
│  ├──────────────────────────────────────────┤               │
│  │ Événements:                              │               │
│  │  - USER_STATUS (online/offline)          │               │
│  │  - MAINTENANCE_MODE                      │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Séquence de Tests Recommandée

```
1. Tests Unitaires (Handlers)
   ├── AuthHandler.test.ts
   │   ├── JWT authentication
   │   ├── Anonymous authentication
   │   ├── Multi-device handling
   │   └── Disconnection cleanup
   │
   ├── MessageHandler.test.ts
   │   ├── Message send (text)
   │   ├── Message send (with attachments)
   │   ├── Broadcast logic
   │   └── Unread count updates
   │
   ├── ReactionHandler.test.ts
   │   ├── Add reaction
   │   ├── Remove reaction
   │   ├── Sync reactions
   │   └── Notification creation
   │
   ├── StatusHandler.test.ts
   │   ├── Typing start
   │   ├── Typing stop
   │   └── Privacy check
   │
   └── socket-helpers.test.ts
       ├── Token extraction
       ├── Conversation ID normalization
       └── Display name building

2. Tests d'Intégration (E2E)
   ├── Full connection flow
   ├── Message sending + broadcast
   ├── Reaction flow
   └── Multi-user scenarios

3. Tests de Charge
   ├── 100 users concurrent
   ├── 1000 messages/min
   └── Memory leak detection
```

---

## Diagramme de Déploiement

```
┌─────────────────────────────────────────────────────────────┐
│                       Production                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Load Balancer (Nginx/ALB)                                 │
│         │                                                   │
│         ├─────────────────┬──────────────────┐             │
│         ▼                 ▼                  ▼             │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │ Gateway  │      │ Gateway  │      │ Gateway  │         │
│  │ Instance │      │ Instance │      │ Instance │         │
│  │    #1    │      │    #2    │      │    #3    │         │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘         │
│       │                 │                  │               │
│       └─────────────────┴──────────────────┘               │
│                         │                                  │
│                         ▼                                  │
│              ┌──────────────────────┐                      │
│              │   MongoDB Cluster    │                      │
│              │   (Replica Set)      │                      │
│              └──────────────────────┘                      │
│                                                             │
│  Sticky Sessions (par conversationId)                      │
│  - Permet le clustering Socket.IO                          │
│  - Redis Adapter pour sync des rooms                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Version:** 2.0.0
**Dernière mise à jour:** 2026-01-18
