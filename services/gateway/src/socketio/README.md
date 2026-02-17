# Architecture Socket.IO - Meeshy Gateway

## Vue d'ensemble

Architecture modulaire pour la gestion des connexions WebSocket temps réel. Organisée en handlers spécialisés pour une maintenance et une scalabilité optimales.

## Structure

```
src/socketio/
├── MeeshySocketIOManager.ts      # Gestionnaire principal
├── CallEventsHandler.ts          # Gestion des appels video/audio
├── handlers/
│   ├── index.ts                  # Exports centralises
│   ├── AuthHandler.ts            # Authentification (JWT, sessions)
│   ├── MessageHandler.ts         # Envoi/broadcast messages
│   ├── ReactionHandler.ts        # Reactions aux messages
│   ├── StatusHandler.ts          # Typing indicators
│   ├── ConversationHandler.ts    # Join/leave conversations
│   └── SocialEventsHandler.ts    # Posts, stories, statuts, commentaires
└── utils/
    ├── index.ts                  # Exports centralises
    └── socket-helpers.ts         # Helpers Socket.IO
```

## Handlers

### AuthHandler
**Responsabilité:** Authentification des connexions Socket.IO

**Événements gérés:**
- `authenticate` - Authentification manuelle
- `disconnect` - Déconnexion et nettoyage
- Auto-authentification via JWT/sessionToken

**Méthodes principales:**
```typescript
handleTokenAuthentication(socket: Socket): Promise<void>
handleManualAuthentication(socket: Socket, data: AuthData): Promise<void>
handleDisconnection(socket: Socket): void
```

**Dépendances:**
- PrismaClient (DB)
- StatusService (mise à jour activité)
- Maps de connexion (connectedUsers, socketToUser, userSockets)

---

### MessageHandler
**Responsabilité:** Gestion des messages et broadcast temps réel

**Événements gérés:**
- `message:send` - Envoi message texte
- `message:send-with-attachments` - Envoi message avec fichiers

**Méthodes principales:**
```typescript
handleMessageSend(socket, data, callback): Promise<void>
handleMessageSendWithAttachments(socket, data, callback): Promise<void>
broadcastNewMessage(message, conversationId, socket): Promise<void>
```

**Fonctionnalités:**
- Validation longueur messages (config/message-limits)
- Support utilisateurs anonymes
- Broadcast avec traductions et stats
- Mise à jour unread counts
- Gestion des attachments (images, audio, vidéo)

**Dépendances:**
- MessagingService (logique métier)
- StatusService (activité)
- NotificationService (notifications push)
- ConversationStatsService (statistiques)

---

### ReactionHandler
**Responsabilité:** Réactions aux messages (emoji)

**Événements gérés:**
- `reaction:add` - Ajouter réaction
- `reaction:remove` - Retirer réaction
- `reaction:request-sync` - Synchroniser réactions

**Méthodes principales:**
```typescript
handleReactionAdd(socket, data, callback): Promise<void>
handleReactionRemove(socket, data, callback): Promise<void>
handleReactionSync(socket, messageId, callback): Promise<void>
```

**Fonctionnalités:**
- Support utilisateurs authentifiés et anonymes
- Broadcast temps réel (reaction:added / reaction:removed)
- Création de notifications pour auteurs
- Agrégation des réactions par emoji

**Dépendances:**
- ReactionService (logique métier)
- NotificationService (notifications)

---

### StatusHandler
**Responsabilité:** Indicateurs de statut utilisateur

**Événements gérés:**
- `typing:start` - Début de frappe
- `typing:stop` - Fin de frappe

**Méthodes principales:**
```typescript
handleTypingStart(socket, data): Promise<void>
handleTypingStop(socket, data): Promise<void>
```

**Fonctionnalités:**
- Vérification préférences confidentialité (showTypingIndicator)
- Broadcast sélectif (sauf émetteur)
- Mise à jour lastActiveAt (throttled à 5s)
- Support utilisateurs anonymes

**Dépendances:**
- StatusService (activité)
- PrivacyPreferencesService (confidentialité)

---

### ConversationHandler
**Responsabilité:** Gestion des conversations (rooms Socket.IO)

**Événements gérés:**
- `conversation:join` - Rejoindre conversation
- `conversation:leave` - Quitter conversation

**Méthodes principales:**
```typescript
handleConversationJoin(socket, data): Promise<void>
handleConversationLeave(socket, data): Promise<void>
sendConversationStatsToSocket(socket, conversationId): Promise<void>
```

**Fonctionnalités:**
- Gestion des rooms Socket.IO (`conversation:${id}`) via `ROOMS.conversation(id)`
- Normalisation des IDs (ObjectId vs identifier)
- Envoi des statistiques de conversation
- Émission événements joined/left

**Dépendances:**
- ConversationStatsService

---

### SocialEventsHandler
**Responsabilite:** Broadcasting temps reel pour les features sociales (posts, stories, statuts, commentaires)

**Events emis (serveur → clients):**
- `post:created` / `post:updated` / `post:deleted` - CRUD posts
- `post:liked` / `post:unliked` / `post:reposted` / `post:bookmarked` - Interactions posts
- `story:created` / `story:viewed` / `story:reacted` - Stories
- `status:created` / `status:updated` / `status:deleted` / `status:reacted` - Moods/Statuts
- `comment:added` / `comment:deleted` / `comment:liked` - Commentaires

**Events ecoutes (client → serveur):**
- `feed:subscribe` - S'abonner aux updates feed
- `feed:unsubscribe` - Se desabonner

**Rooms utilisees:**
- `feed:${userId}` via `ROOMS.feed(userId)` - Room personnelle pour updates des amis
- `user:${userId}` via `ROOMS.user(userId)` - Notifications personnelles

---

## Utilitaires (socket-helpers.ts)

### Fonctions d'extraction
```typescript
extractJWTToken(socket: Socket): string | undefined
extractSessionToken(socket: Socket): string | undefined
```

### Gestion utilisateurs
```typescript
getConnectedUser(userIdOrToken, connectedUsers): ConnectedUserResult | null
buildAnonymousDisplayName(anonymousUser): string
```

### Normalisation
```typescript
normalizeConversationId(conversationId, prismaFindUnique): Promise<string>
```

### Gestion des rooms
```typescript
getConversationRoomId(conversationId): string
extractConversationIdFromRoom(roomId): string | null
```

### Type guards
```typescript
isValidConversationId(conversationId): conversationId is string
isValidMessageContent(content): content is string
```

---

## Flux d'Événements

### 1. Connexion Utilisateur
```
Client se connecte
  ↓
Socket.IO: connection event
  ↓
AuthHandler: handleTokenAuthentication()
  ↓
Validation JWT/sessionToken
  ↓
Mise à jour maps de connexion
  ↓
Émission: authenticated
  ↓
StatusService: updateLastSeen()
```

### 2. Envoi de Message
```
Client: message:send
  ↓
MessageHandler: handleMessageSend()
  ↓
Validation longueur message
  ↓
MessagingService: handleMessage()
  ↓
Création message en DB
  ↓
MessageHandler: broadcastNewMessage()
  ↓
Récupération traductions + stats
  ↓
Broadcast: message:new (vers conversation room)
  ↓
Mise à jour unread counts
  ↓
NotificationService: créer notifications
```

### 3. Ajout de Réaction
```
Client: reaction:add
  ↓
ReactionHandler: handleReactionAdd()
  ↓
ReactionService: addReaction()
  ↓
Création réaction en DB
  ↓
Broadcast: reaction:added
  ↓
NotificationService: notifier auteur message
```

### 4. Typing Indicator
```
Client: typing:start
  ↓
StatusHandler: handleTypingStart()
  ↓
Vérification préférences confidentialité
  ↓
Récupération nom d'affichage
  ↓
Broadcast: typing:start (vers conversation room, sauf émetteur)
```

---

## Constantes et Conventions

### Source de verite
Tous les noms d'evenements et rooms sont definis dans `packages/shared/types/socketio-events.ts`:
- `SERVER_EVENTS` — 52 evenements serveur → client
- `CLIENT_EVENTS` — 23 evenements client → serveur
- `ROOMS` — helpers pour construire les noms de rooms

### Convention de nommage
- **Events:** `entity:action-word` (colons + hyphens, jamais underscores)
  - Exemples: `message:new`, `reaction:request-sync`, `call:participant-left`
- **Rooms:** `entity:${id}` (colons, jamais underscores)
  - Exemples: `conversation:abc123`, `user:xyz789`, `feed:user123`

### Usage dans le code
```typescript
import { SERVER_EVENTS, CLIENT_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// Events
socket.on(CLIENT_EVENTS.MESSAGE_SEND, handler);
io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, payload);

// Rooms
socket.join(ROOMS.conversation(conversationId));
io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.NOTIFICATION_NEW, data);
```

### Regles strictes
- **JAMAIS** de string hardcodee pour un event ou un room
- **TOUJOURS** utiliser les constantes `SERVER_EVENTS`, `CLIENT_EVENTS`, `ROOMS`
- Les tests doivent aussi importer les constantes (pas de mock avec valeurs hardcodees)

---

## Patterns de Conception

### 1. Dependency Injection
Chaque handler reçoit ses dépendances via le constructeur:
```typescript
constructor(deps: HandlerDependencies) {
  this.prisma = deps.prisma;
  this.service = deps.service;
  // ...
}
```

### 2. Separation of Concerns
- **Handlers:** Gestion des événements Socket.IO
- **Services:** Logique métier
- **Utils:** Fonctions réutilisables

### 3. Error Handling
```typescript
try {
  // Logic
} catch (error) {
  console.error('[HANDLER] Erreur:', error);
  if (callback) callback({ success: false, error: 'Message' });
}
```

### 4. Type Safety
```typescript
// Typage strict des événements
socket.on(CLIENT_EVENTS.MESSAGE_SEND, async (
  data: { conversationId: string; content: string },
  callback?: (response: SocketIOResponse<{ messageId: string }>) => void
) => {
  // Implementation
});
```

---

## Configuration Socket.IO

### Initialisation
```typescript
new SocketIOServer(httpServer, {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 10000,      // 10s avant disconnect
  pingInterval: 25000,     // 25s entre pings
  connectTimeout: 45000    // 45s timeout connexion
});
```

### Rooms
- **Conversation:** `ROOMS.conversation(id)` → `conversation:${id}` - Messages et evenements
- **User:** `ROOMS.user(id)` → `user:${id}` - Notifications personnelles
- **Feed:** `ROOMS.feed(id)` → `feed:${id}` - Updates du feed social
- **Call:** `ROOMS.call(id)` → `call:${id}` - Appels video/audio

> **Convention:** Toujours utiliser les helpers `ROOMS.*()` de `@meeshy/shared/types/socketio-events` — jamais de string hardcodee.

---

## Maps de Connexion

### connectedUsers: Map<string, SocketUser>
**Clé:** userId (authentifié) ou sessionToken (anonyme)
**Valeur:** Objet SocketUser
```typescript
{
  id: string,           // userId réel
  socketId: string,     // Socket.IO ID
  isAnonymous: boolean,
  language: string,
  sessionToken?: string
}
```

### socketToUser: Map<string, string>
**Clé:** socketId
**Valeur:** userId ou sessionToken

### userSockets: Map<string, Set<string>>
**Clé:** userId
**Valeur:** Set de socketIds (multi-device support)

---

## Gestion des Utilisateurs Anonymes

### Identification
- **Clé dans connectedUsers:** sessionToken
- **Champ isAnonymous:** true
- **Source de données:** Table `AnonymousParticipant`

### Récupération du nom d'affichage
```typescript
const anonymousUser = await prisma.anonymousParticipant.findUnique({
  where: { sessionToken },
  select: { username: true, firstName: true, lastName: true }
});

const displayName = buildAnonymousDisplayName(anonymousUser);
// "Jean Dupont" ou "guest123" ou "Anonymous User"
```

---

## Monitoring et Métriques

### Statistiques disponibles
```typescript
getStats() {
  return {
    total_connections: number,      // Total depuis démarrage
    active_connections: number,     // Actuellement connectés
    messages_processed: number,     // Messages traités
    translations_sent: number,      // Traductions envoyées
    errors: number,                 // Erreurs rencontrées
    connected_users: number,        // Utilisateurs uniques
    active_sockets: number          // Sockets actifs
  };
}
```

### Logs structurés
```typescript
console.log('[AUTH] ✅ User authenticated:', userId);
console.error('[MESSAGE] ❌ Erreur:', error);
console.warn('[TYPING] ⚠️  No user found:', socketId);
```

---

## Tests

### Tests Unitaires (Recommandés)
```typescript
describe('AuthHandler', () => {
  let handler: AuthHandler;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    handler = new AuthHandler({
      prisma: mockPrisma,
      // ... autres dépendances mockées
    });
  });

  it('should authenticate valid JWT', async () => {
    // Test logic
  });
});
```

### Tests d'Intégration
```typescript
describe('Socket.IO Integration', () => {
  let io: SocketIOServer;
  let client: Socket;

  beforeAll(async () => {
    // Setup server and client
  });

  it('should send and receive messages', async () => {
    // Test logic
  });
});
```

---

## Migration depuis l'Ancien Code

Pour migrer depuis l'ancien `MeeshySocketIOManager.ts`:

1. **Backup de l'ancien fichier**
   ```bash
   cp src/socketio/MeeshySocketIOManager.ts src/socketio/MeeshySocketIOManager.old.ts
   ```

2. **Remplacer le fichier principal**
   ```bash
   mv src/socketio/MeeshySocketIOManager.refactored.ts src/socketio/MeeshySocketIOManager.ts
   ```

3. **Vérifier les imports**
   - Aucun changement d'interface publique
   - Les méthodes `getStats()`, `disconnectUser()`, etc. restent identiques

4. **Tester en staging**
   ```bash
   npm run test:e2e
   npm run deploy:staging
   ```

Voir `REFACTORING_GUIDE.md` pour le guide complet.

---

## Bonnes Pratiques

### 1. Toujours utiliser les helpers
```typescript
// ✅ BON
const userId = extractJWTToken(socket);
const conversationId = await normalizeConversationId(id, prismaFindUnique);

// ❌ MAUVAIS
const userId = socket.handshake.auth.token;
const conversationId = data.conversationId; // Peut être identifier ou ObjectId
```

### 2. Gestion d'erreurs systématique
```typescript
try {
  // Logic
} catch (error) {
  console.error('[HANDLER] Erreur:', error);
  if (callback) callback({ success: false, error: 'User-friendly message' });
}
```

### 3. Validation des entrées
```typescript
const validation = validateMessageLength(content);
if (!validation.isValid) {
  return callback({ success: false, error: validation.error });
}
```

### 4. Préférences de confidentialité
```typescript
const shouldShow = await privacyService.shouldShowTypingIndicator(userId, isAnonymous);
if (!shouldShow) return; // Ne pas broadcaster
```

### 5. Mise à jour activité
```typescript
statusService.updateLastSeen(userId, isAnonymous); // Throttled à 5s
```

---

## Support

Pour toute question:
1. Consulter cette documentation
2. Examiner les commentaires inline dans le code
3. Comparer avec l'ancien fichier (`.old.ts`)
4. Créer une issue GitHub

---

**Dernière mise à jour:** 2026-02-17
**Version:** 3.0.0 (Constantes centralisees + Social)
