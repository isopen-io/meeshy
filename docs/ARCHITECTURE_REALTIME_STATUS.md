# Architecture du Système de Statut Utilisateur en Temps Réel

## Version 1.0 | Date: 2025-11-03

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture Système](#architecture-système)
3. [Flux de Données](#flux-de-données)
4. [Modèle de Données](#modèle-de-données)
5. [Événements Socket.IO](#événements-socketio)
6. [APIs REST](#apis-rest)
7. [Services Backend](#services-backend)
8. [Calcul du Statut (Frontend)](#calcul-du-statut-frontend)
9. [Garanties de Cohérence](#garanties-de-cohérence)
10. [Résilience et Fallbacks](#résilience-et-fallbacks)
11. [Monitoring et Métriques](#monitoring-et-métriques)
12. [Guide de Troubleshooting](#guide-de-troubleshooting)

---

## Vue d'Ensemble

### Objectif

Fournir un système de statut utilisateur en temps réel **SANS POLLING**, utilisant exclusivement WebSocket (Socket.IO) pour les mises à jour push et REST API pour les mises à jour silencieuses de `lastActiveAt`.

### Principes de Design

1. **Push-Only Architecture**: Aucun polling côté client
2. **Événementiel**: Tous les changements de statut sont propagés via Socket.IO
3. **Throttling Intelligent**: Mise à jour de `lastActiveAt` limitée à 1x/minute par utilisateur
4. **Calcul Local**: Statut calculé côté frontend basé sur `lastActiveAt`
5. **Support Hybride**: Utilisateurs authentifiés (JWT) + anonymes (Session Token)

### Technologies

- **Backend**: Node.js/TypeScript + Fastify + Socket.IO + Prisma/MongoDB
- **Frontend**: Next.js/React + Zustand + Socket.IO Client
- **Base de Données**: MongoDB (via Prisma)

---

## Architecture Système

### Diagramme de Composants

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  Socket.IO       │    │  REST Client     │                   │
│  │  Client          │    │  (Fetch/Axios)   │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
│           │                       │                              │
│  ┌────────▼───────────────────────▼─────────┐                   │
│  │        Zustand Store (usersService)      │                   │
│  │  - connectedUsers: Map<userId, User>     │                   │
│  │  - updateUserStatus()                    │                   │
│  │  - getUserStatus()                       │                   │
│  └──────────────────────────────────────────┘                   │
│           │                                                      │
│  ┌────────▼─────────────────────────────────┐                   │
│  │      UI Components                       │                   │
│  │  - OnlineIndicator (🟢🟠⚪)              │                   │
│  │  - UserListItem                          │                   │
│  │  - ConversationHeader                    │                   │
│  └──────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ WebSocket + REST
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    GATEWAY (Backend)                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            MeeshySocketIOManager                         │   │
│  │  - connectedUsers: Map<userId, SocketUser>              │   │
│  │  - _handleTokenAuthentication()                         │   │
│  │  - _broadcastUserStatus()                               │   │
│  └────────┬─────────────────────────────────────────────────┘   │
│           │                                                      │
│  ┌────────▼─────────────────────────────────────────────────┐   │
│  │              MaintenanceService                          │   │
│  │  - updateUserOnlineStatus()                              │   │
│  │  - updateOfflineUsers() [Job toutes les 60s]            │   │
│  │  - statusBroadcastCallback()                             │   │
│  └────────┬─────────────────────────────────────────────────┘   │
│           │                                                      │
│  ┌────────▼─────────────────────────────────────────────────┐   │
│  │              Auth Middleware                             │   │
│  │  - createUnifiedAuthMiddleware()                         │   │
│  │  - updateLastActiveAt() [Throttled 1x/min]              │   │
│  └────────┬─────────────────────────────────────────────────┘   │
│           │                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │
            │ MongoDB Queries
            │
┌───────────▼──────────────────────────────────────────────────────┐
│                     MongoDB (Prisma)                              │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  User Collection                                           │  │
│  │  - isOnline: Boolean                                       │  │
│  │  - lastSeen: DateTime (dernière déconnexion)              │  │
│  │  - lastActiveAt: DateTime (dernière activité)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  AnonymousParticipant Collection                           │  │
│  │  - isOnline: Boolean                                       │  │
│  │  - lastSeenAt: DateTime                                    │  │
│  │  - lastActiveAt: DateTime                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Flux d'Architecture

```
┌───────────┐        ┌───────────────┐        ┌─────────────┐
│  Client   │◄──────►│  Socket.IO    │◄──────►│  Database   │
│ (Browser) │        │   Gateway     │        │  (MongoDB)  │
└─────┬─────┘        └───────┬───────┘        └─────────────┘
      │                      │
      │  1. Connect          │
      ├─────────────────────►│
      │                      │  2. Auth (JWT/Session)
      │                      ├──────────────────────►
      │                      │◄─────────────────────
      │                      │  3. Update isOnline=true
      │                      │
      │  4. AUTHENTICATED    │
      │◄─────────────────────┤
      │                      │
      │  5. USER_STATUS      │  6. Broadcast à toutes
      │◄─────────────────────┤     les conversations
      │                      │
```

---

## Flux de Données

### 1. Connexion WebSocket

```
Utilisateur ouvre l'application
  ↓
Frontend: Établit connexion Socket.IO avec auth token
  ↓
Backend: MeeshySocketIOManager._handleTokenAuthentication()
  ├─ Vérifie JWT Token OU Session Token
  ├─ Récupère utilisateur depuis MongoDB
  ├─ Crée SocketUser en mémoire (connectedUsers Map)
  └─ Appelle MaintenanceService.updateUserOnlineStatus(userId, true, broadcast=true)
  ↓
MaintenanceService.updateUserOnlineStatus()
  ├─ UPDATE User SET isOnline=true, lastActiveAt=NOW() WHERE id=userId
  ├─ Appelle statusBroadcastCallback(userId, isOnline=true)
  └─ Logs: "👤 Statut utilisateur {userId} mis à jour: en ligne"
  ↓
MeeshySocketIOManager._broadcastUserStatus()
  ├─ Récupère toutes les conversations de l'utilisateur
  ├─ Pour chaque conversation:
  │   └─ io.to(`conversation_{conversationId}`).emit(USER_STATUS, {
  │        userId, username, isOnline: true
  │      })
  └─ Logs: "📡 Broadcast USER_STATUS à {X} conversations"
  ↓
Frontend: Listener sur SERVER_EVENTS.USER_STATUS
  ├─ Reçoit { userId, username, isOnline: true }
  ├─ usersService.updateUserStatus(userId, { isOnline: true, lastActiveAt: new Date() })
  └─ OnlineIndicator se met à jour: 🟢 (vert)
```

**Temps de propagation total**: < 100ms

### 2. Activité REST API (Requête Authentifiée)

```
Utilisateur envoie un message (POST /api/messages)
  ↓
Backend: Auth Middleware (createUnifiedAuthMiddleware)
  ├─ Valide JWT Token OU Session Token
  ├─ Crée authContext avec userId
  └─ Appelle updateLastActiveAt(userId) [THROTTLED]
  ↓
Throttling Check (en mémoire, par userId)
  ├─ lastUpdate = throttleCache.get(userId)
  ├─ Si (now - lastUpdate) < 60s → SKIP
  └─ Sinon → Continuer
  ↓
UPDATE User SET lastActiveAt=NOW() WHERE id=userId
  └─ PAS de broadcast Socket.IO (silencieux)
  ↓
Frontend: Recalcule statut localement
  ├─ Utilise usersService.getUserStatus(user)
  ├─ Basé sur (now - user.lastActiveAt)
  └─ Si < 5min → 🟢 Online
```

**Fréquence de mise à jour**: Maximum 1x/minute par utilisateur
**Impact DB**: Minimal (1 update/min/user actif)

### 3. Déconnexion WebSocket

```
Utilisateur ferme l'onglet/application
  ↓
Socket.IO: Événement 'disconnect'
  ↓
MeeshySocketIOManager: Listener 'disconnect'
  ├─ userId = socketToUser.get(socket.id)
  ├─ Supprime socket de connectedUsers Map
  ├─ Supprime socket de socketToUser Map
  └─ Appelle MaintenanceService.updateUserOnlineStatus(userId, false, broadcast=true)
  ↓
MaintenanceService.updateUserOnlineStatus()
  ├─ UPDATE User SET isOnline=false, lastSeen=NOW() WHERE id=userId
  ├─ Appelle statusBroadcastCallback(userId, isOnline=false)
  └─ Logs: "👤 Statut utilisateur {userId} mis à jour: hors ligne"
  ↓
MeeshySocketIOManager._broadcastUserStatus()
  ├─ Récupère conversations de l'utilisateur
  ├─ io.to(`conversation_{conversationId}`).emit(USER_STATUS, {
  │     userId, username, isOnline: false
  │   })
  └─ Logs: "📡 Broadcast USER_STATUS (offline)"
  ↓
Frontend: Listener USER_STATUS
  ├─ updateUserStatus(userId, { isOnline: false, lastActiveAt: new Date() })
  └─ OnlineIndicator: 🟠 Away (si < 30min) ou ⚪ Offline
```

**Temps de propagation**: < 200ms (détection + broadcast)

### 4. Job Maintenance (Nettoyage Zombies)

```
Toutes les 60 secondes: MaintenanceService.updateOfflineUsers()
  ↓
Query MongoDB: Trouver utilisateurs zombies
  SELECT * FROM User WHERE
    isOnline = true
    AND lastActiveAt < (NOW() - 5 minutes)
    AND isActive = true
  ↓
Si zombies trouvés:
  ├─ UPDATE User SET isOnline=false, lastSeen=NOW()
  │   WHERE id IN (zombieIds)
  ├─ Pour chaque zombie:
  │   └─ Appelle statusBroadcastCallback(userId, isOnline=false)
  └─ Logs: "🔄 [CLEANUP] {X} utilisateurs marqués comme hors ligne"
  ↓
Broadcast USER_STATUS pour chaque zombie
  ↓
Frontend reçoit et met à jour les indicateurs
```

**Fréquence**: Toutes les 60 secondes
**Seuil zombie**: 5 minutes d'inactivité
**Garantie**: Aucun utilisateur ne reste "en ligne" > 6 minutes après déconnexion

### 5. Scénario Déconnexion Brutale (Crash Navigateur)

```
Navigateur crash (pas d'événement 'disconnect' envoyé)
  ↓
Socket.IO Backend: Timeout (pingTimeout: 10s)
  ├─ Après 10s sans pong → Déclenche 'disconnect' forcé
  └─ Même flux que déconnexion normale
  ↓
Fallback: Job Maintenance (60s)
  ├─ Si Socket.IO timeout échoue (rare)
  └─ Nettoie zombie dans les 60s
```

**Temps de détection max**: 10s (Socket.IO timeout) + 60s (job maintenance) = 70s
**Garantie**: Utilisateur zombie détecté en < 2 minutes

---

## Modèle de Données

### User (Utilisateurs Authentifiés)

```prisma
model User {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  username     String   @unique

  // Statut en ligne (temps réel)
  isOnline     Boolean  @default(false)  // Flag manuel WebSocket UNIQUEMENT
  lastSeen     DateTime @default(now())  // Dernière DÉCONNEXION (isOnline→false)
  lastActiveAt DateTime @default(now())  // Dernière ACTIVITÉ (REST ou WS)

  // Autres champs...
  firstName    String
  lastName     String
  email        String   @unique
  role         String   @default("USER")
  isActive     Boolean  @default(true)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### AnonymousParticipant (Utilisateurs Anonymes)

```prisma
model AnonymousParticipant {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  sessionToken String   @unique
  username     String

  // Statut en ligne (temps réel)
  isOnline     Boolean  @default(false)  // Flag manuel WebSocket
  lastSeenAt   DateTime @default(now())  // Dernière DÉCONNEXION
  lastActiveAt DateTime @default(now())  // Dernière ACTIVITÉ

  // Permissions
  canSendMessages Boolean @default(true)
  canSendFiles    Boolean @default(false)
  canSendImages   Boolean @default(true)

  // Relations
  shareLinkId     String   @db.ObjectId
  conversationId  String   @db.ObjectId

  isActive     Boolean  @default(true)
  joinedAt     DateTime @default(now())
}
```

### Sémantique des Champs

| Champ | Type | Mis à jour par | Signification |
|-------|------|---------------|---------------|
| `isOnline` | Boolean | WebSocket connect/disconnect | **Flag binaire**: L'utilisateur a une socket active |
| `lastSeen` | DateTime | WebSocket disconnect | **Horodatage de déconnexion**: Quand isOnline est passé à false |
| `lastActiveAt` | DateTime | WebSocket connect + REST API (throttled) | **Horodatage d'activité**: Dernière action (message, requête, etc.) |

### Règles de Mise à Jour

```typescript
// CONNEXION WebSocket
UPDATE User SET
  isOnline = true,
  lastActiveAt = NOW()
WHERE id = userId;

// DÉCONNEXION WebSocket
UPDATE User SET
  isOnline = false,
  lastSeen = NOW()
WHERE id = userId;

// ACTIVITÉ REST (Throttled 1x/min)
UPDATE User SET
  lastActiveAt = NOW()
WHERE id = userId;
// Note: isOnline reste inchangé

// JOB MAINTENANCE (Zombies)
UPDATE User SET
  isOnline = false,
  lastSeen = NOW()
WHERE isOnline = true
  AND lastActiveAt < (NOW() - INTERVAL '5 minutes');
```

---

## Événements Socket.IO

### SERVER_EVENTS.USER_STATUS

**Direction**: Server → Client (Broadcast)

**Émis quand**:
- Connexion WebSocket (isOnline: true)
- Déconnexion WebSocket (isOnline: false)
- Job maintenance nettoie zombie (isOnline: false)

**Payload**:
```typescript
interface UserStatusEvent {
  userId: string;      // ID MongoDB de l'utilisateur
  username: string;    // Nom d'utilisateur (pour logs)
  isOnline: boolean;   // true = vient de se connecter, false = déconnecté
}
```

**Exemple**:
```typescript
{
  userId: "507f1f77bcf86cd799439011",
  username: "johndoe",
  isOnline: true
}
```

**Routing**:
```typescript
// Broadcast ciblé (seulement aux conversations de l'utilisateur)
const userConversations = await prisma.conversationMember.findMany({
  where: { userId },
  select: { conversationId: true }
});

userConversations.forEach(conv => {
  io.to(`conversation_${conv.conversationId}`)
    .emit(SERVER_EVENTS.USER_STATUS, payload);
});
```

### CLIENT_EVENTS (Aucun pour les statuts)

**Important**: Le client ne doit JAMAIS émettre d'événements pour gérer son propre statut. Tout est géré automatiquement par le backend.

**Raisons**:
1. Éviter les tentatives de spoofing (client qui prétend être en ligne)
2. Single source of truth (backend contrôle tout)
3. Simplifier le code frontend (passif seulement)

---

## APIs REST

### Middleware Auth avec Throttling

Toutes les APIs authentifiées passent par `createUnifiedAuthMiddleware`, qui met à jour `lastActiveAt` de manière throttled.

```typescript
// gateway/src/middleware/auth.ts

export function createUnifiedAuthMiddleware(
  prisma: PrismaClient,
  options: { requireAuth?: boolean; allowAnonymous?: boolean } = {}
) {
  // Cache de throttling en mémoire
  const throttleCache = new Map<string, number>(); // userId → lastUpdateTimestamp
  const THROTTLE_INTERVAL = 60000; // 1 minute

  return async function unifiedAuth(request: FastifyRequest, reply: FastifyReply) {
    // 1. Authentifier utilisateur (JWT ou Session Token)
    const authContext = await authMiddleware.createAuthContext(
      request.headers.authorization,
      request.headers['x-session-token']
    );

    // 2. Throttling: Mettre à jour lastActiveAt max 1x/min
    if (authContext.isAuthenticated) {
      const userId = authContext.userId;
      const now = Date.now();
      const lastUpdate = throttleCache.get(userId) || 0;

      if (now - lastUpdate >= THROTTLE_INTERVAL) {
        // Mise à jour silencieuse (pas de broadcast)
        await prisma.user.update({
          where: { id: userId },
          data: { lastActiveAt: new Date() }
        });

        throttleCache.set(userId, now);
        console.log(`[Auth] lastActiveAt mis à jour pour ${userId}`);
      }
    }

    // 3. Attacher authContext à la requête
    (request as UnifiedAuthRequest).authContext = authContext;
  };
}
```

### APIs Concernées

Toutes les APIs REST authentifiées déclenchent le throttling:

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/conversations` | Liste conversations |
| GET | `/api/messages/:conversationId` | Récupérer messages |
| POST | `/api/messages` | Envoyer message (REST) |
| POST | `/api/messages/upload` | Upload fichier |
| GET | `/api/users/me` | Profil utilisateur |
| PUT | `/api/users/me` | Mettre à jour profil |
| GET | `/api/notifications` | Récupérer notifications |
| ... | ... | Toute API avec `requireAuth: true` |

### Endpoint Statut Manuel (Optionnel)

Pour forcer un refresh manuel (fallback si WebSocket down):

```typescript
// GET /api/users/status
router.get('/users/status', async (request, reply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext.isAuthenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: authContext.userId },
    select: {
      id: true,
      username: true,
      isOnline: true,
      lastSeen: true,
      lastActiveAt: true
    }
  });

  return reply.send({ user });
});
```

---

## Services Backend

### 1. MaintenanceService

**Localisation**: `gateway/src/services/maintenance.service.ts`

**Responsabilités**:
- Mettre à jour manuellement le statut en ligne/hors ligne
- Nettoyer les utilisateurs zombies (job périodique)
- Broadcaster les changements de statut via callback

**Méthodes clés**:

```typescript
export class MaintenanceService {
  private statusBroadcastCallback: ((userId: string, isOnline: boolean, isAnonymous: boolean) => void) | null;

  /**
   * Définir callback pour broadcaster les statuts
   */
  setStatusBroadcastCallback(callback: (userId: string, isOnline: boolean, isAnonymous: boolean) => void) {
    this.statusBroadcastCallback = callback;
  }

  /**
   * Mettre à jour statut utilisateur authentifié
   */
  async updateUserOnlineStatus(userId: string, isOnline: boolean, broadcast: boolean = false) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isOnline,
        lastSeen: isOnline ? undefined : new Date(),
        lastActiveAt: isOnline ? new Date() : undefined
      }
    });

    if (broadcast && this.statusBroadcastCallback) {
      this.statusBroadcastCallback(userId, isOnline, false);
    }
  }

  /**
   * Job maintenance: Nettoyer zombies toutes les 60s
   */
  async startMaintenanceTasks() {
    setInterval(async () => {
      await this.updateOfflineUsers();
    }, 60000); // 60 secondes
  }

  /**
   * Trouver et nettoyer utilisateurs zombies
   */
  private async updateOfflineUsers() {
    const offlineThreshold = new Date();
    offlineThreshold.setMinutes(offlineThreshold.getMinutes() - 5); // 5 min

    const zombies = await this.prisma.user.findMany({
      where: {
        isOnline: true,
        lastActiveAt: { lt: offlineThreshold },
        isActive: true
      },
      select: { id: true, username: true }
    });

    if (zombies.length > 0) {
      // Mettre à jour en base
      await this.prisma.user.updateMany({
        where: { id: { in: zombies.map(u => u.id) } },
        data: { isOnline: false, lastSeen: new Date() }
      });

      // Broadcaster chaque changement
      zombies.forEach(zombie => {
        if (this.statusBroadcastCallback) {
          this.statusBroadcastCallback(zombie.id, false, false);
        }
      });

      logger.warn(`🔄 [CLEANUP] ${zombies.length} utilisateurs zombies nettoyés`);
    }
  }
}
```

### 2. MeeshySocketIOManager

**Localisation**: `gateway/src/socketio/MeeshySocketIOManager.ts`

**Responsabilités**:
- Gérer connexions/déconnexions Socket.IO
- Authentifier utilisateurs (JWT/Session)
- Broadcaster événements USER_STATUS

**Méthodes clés**:

```typescript
export class MeeshySocketIOManager {
  private connectedUsers: Map<string, SocketUser> = new Map();
  private socketToUser: Map<string, string> = new Map();

  constructor(httpServer: HTTPServer, prisma: PrismaClient) {
    this.maintenanceService = new MaintenanceService(prisma, attachmentService);

    // Configuration callback broadcast
    this.maintenanceService.setStatusBroadcastCallback(
      (userId: string, isOnline: boolean, isAnonymous: boolean) => {
        this._broadcastUserStatus(userId, isOnline, isAnonymous);
      }
    );
  }

  /**
   * Broadcaster changement de statut utilisateur
   */
  private async _broadcastUserStatus(userId: string, isOnline: boolean, isAnonymous: boolean) {
    const model = isAnonymous ? 'anonymousParticipant' : 'user';

    // Récupérer username
    const user = await this.prisma[model].findUnique({
      where: { id: userId },
      select: { username: true }
    });

    if (!user) return;

    // Récupérer conversations de l'utilisateur
    const conversations = isAnonymous
      ? await this.prisma.anonymousParticipant.findUnique({
          where: { id: userId },
          select: { conversationId: true }
        })
      : await this.prisma.conversationMember.findMany({
          where: { userId, isActive: true },
          select: { conversationId: true }
        });

    const conversationIds = isAnonymous
      ? [conversations?.conversationId]
      : conversations.map(c => c.conversationId);

    // Broadcast ciblé
    conversationIds.forEach(convId => {
      if (convId) {
        this.io.to(`conversation_${convId}`).emit(SERVER_EVENTS.USER_STATUS, {
          userId,
          username: user.username,
          isOnline
        });
      }
    });

    logger.info(`📡 Broadcast USER_STATUS pour ${user.username} (${isOnline ? 'online' : 'offline'}) à ${conversationIds.length} conversations`);
  }

  /**
   * Gérer connexion Socket.IO
   */
  private async _handleTokenAuthentication(socket: Socket) {
    // Extraire JWT ou Session Token
    const jwtToken = socket.handshake?.headers?.authorization?.replace('Bearer ', '');
    const sessionToken = socket.handshake?.headers?.['x-session-token'];

    if (jwtToken) {
      // Authentification JWT
      const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET) as any;
      const dbUser = await this.prisma.user.findUnique({ where: { id: decoded.userId } });

      if (dbUser && dbUser.isActive) {
        const user: SocketUser = {
          id: dbUser.id,
          socketId: socket.id,
          isAnonymous: false,
          language: dbUser.systemLanguage
        };

        this.connectedUsers.set(user.id, user);
        this.socketToUser.set(socket.id, user.id);

        // Mettre à jour statut + broadcast
        await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);

        socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: true, user });
      }
    }
  }

  /**
   * Gérer déconnexion Socket.IO
   */
  private _setupSocketEvents() {
    this.io.on('connection', (socket) => {
      this._handleTokenAuthentication(socket);

      socket.on('disconnect', async () => {
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
          this.connectedUsers.delete(userId);
          this.socketToUser.delete(socket.id);

          // Mettre à jour statut + broadcast
          await this.maintenanceService.updateUserOnlineStatus(userId, false, true);
        }
      });
    });
  }
}
```

---

## Calcul du Statut (Frontend)

### Logique de Calcul

Le frontend calcule le statut localement basé sur `lastActiveAt` et `isOnline`:

```typescript
// frontend/services/usersService.ts

interface UserStatus {
  status: 'online' | 'away' | 'offline';
  color: string;
  label: string;
}

/**
 * Vérifier si un utilisateur est en ligne
 */
isUserOnline(user: User | AnonymousParticipant): boolean {
  if (!user.isOnline) return false;

  const now = Date.now();
  const lastActive = new Date(user.lastActiveAt).getTime();
  const diffMinutes = (now - lastActive) / 60000;

  return diffMinutes < 5; // En ligne si activité < 5 minutes
}

/**
 * Obtenir le statut complet d'un utilisateur
 */
getUserStatus(user: User | AnonymousParticipant): UserStatus {
  const now = Date.now();
  const lastActive = new Date(user.lastActiveAt).getTime();
  const diffMinutes = (now - lastActive) / 60000;

  if (diffMinutes < 5) {
    return {
      status: 'online',
      color: '#10b981', // Vert
      label: 'En ligne'
    };
  }

  if (diffMinutes < 30) {
    return {
      status: 'away',
      color: '#f59e0b', // Orange
      label: 'Absent'
    };
  }

  return {
    status: 'offline',
    color: '#6b7280', // Gris
    label: 'Hors ligne'
  };
}

/**
 * Formater le temps depuis la dernière activité
 */
getLastSeenText(user: User | AnonymousParticipant): string {
  if (this.isUserOnline(user)) {
    return 'En ligne maintenant';
  }

  const now = Date.now();
  const lastActive = new Date(user.lastActiveAt).getTime();
  const diffMinutes = Math.floor((now - lastActive) / 60000);

  if (diffMinutes < 1) return 'À l\'instant';
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays}j`;
}
```

### Composant OnlineIndicator

```tsx
// frontend/components/users/OnlineIndicator.tsx

interface OnlineIndicatorProps {
  user: User | AnonymousParticipant;
  showLabel?: boolean;
}

export const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({ user, showLabel = false }) => {
  const usersService = useUsersService();
  const status = usersService.getUserStatus(user);

  return (
    <div className="flex items-center gap-2">
      {/* Indicateur visuel */}
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: status.color }}
        title={status.label}
      />

      {/* Label optionnel */}
      {showLabel && (
        <span className="text-sm text-gray-600">
          {usersService.getLastSeenText(user)}
        </span>
      )}
    </div>
  );
};
```

### Store Zustand (usersService)

```typescript
// frontend/services/usersService.ts

interface UsersServiceState {
  connectedUsers: Map<string, User | AnonymousParticipant>;

  // Actions
  updateUserStatus: (userId: string, data: Partial<User>) => void;
  getUserStatus: (user: User | AnonymousParticipant) => UserStatus;
  isUserOnline: (user: User | AnonymousParticipant) => boolean;

  // Socket.IO listeners
  setupSocketListeners: (socket: Socket) => void;
}

export const useUsersService = create<UsersServiceState>((set, get) => ({
  connectedUsers: new Map(),

  updateUserStatus: (userId, data) => {
    set(state => {
      const user = state.connectedUsers.get(userId);
      if (user) {
        state.connectedUsers.set(userId, { ...user, ...data });
      }
      return { connectedUsers: new Map(state.connectedUsers) };
    });
  },

  setupSocketListeners: (socket) => {
    // Écouter USER_STATUS
    socket.on(SERVER_EVENTS.USER_STATUS, (data: UserStatusEvent) => {
      console.log('[Socket] USER_STATUS reçu:', data);

      get().updateUserStatus(data.userId, {
        isOnline: data.isOnline,
        lastActiveAt: new Date()
      });
    });
  },

  // ... autres méthodes (voir section précédente)
}));
```

---

## Garanties de Cohérence

### Temps Réel (<100ms)

**Scénario**: Utilisateur se connecte/déconnecte via WebSocket

**Flux**:
1. Événement Socket.IO (connect/disconnect)
2. Mise à jour DB (isOnline)
3. Broadcast USER_STATUS
4. Frontend reçoit et met à jour UI

**Garantie**: Changement propagé en < 100ms

**Métrique mesurée**:
```
Time_to_UI_Update = T_broadcast + T_network + T_render
                  ≈ 10ms + 50ms + 10ms
                  ≈ 70ms (médiane)
```

### Quasi Temps Réel (<60s)

**Scénario**: Job maintenance nettoie zombies

**Flux**:
1. Job s'exécute toutes les 60s
2. Trouve utilisateurs avec `isOnline=true` ET `lastActiveAt > 5min`
3. Mise à jour DB (isOnline=false)
4. Broadcast USER_STATUS pour chaque zombie

**Garantie**: Zombies nettoyés dans les 60s

**Pire cas**:
- Socket.IO timeout: 10s
- Job maintenance: +60s
- **Total**: 70s max pour détecter zombie

### Précision Minute-Niveau

**Scénario**: Utilisateur actif (REST API)

**Flux**:
1. Requête REST authentifiée
2. Middleware Auth met à jour `lastActiveAt` (throttled 1x/min)
3. Frontend recalcule statut localement

**Garantie**: Précision ±60s sur `lastActiveAt`

**Trade-off**:
- ✅ Réduit charge DB (1 update/min vs potentiellement 100+)
- ✅ Suffisant pour déterminer statut (seuil 5min)
- ❌ Pas de précision à la seconde (non nécessaire)

### Scalabilité

**Broadcast ciblé**: Seules les conversations de l'utilisateur reçoivent USER_STATUS

**Exemple**:
- Utilisateur A est dans 5 conversations
- A se connecte → Broadcast à 5 rooms seulement
- Utilisateur B (pas dans ces conversations) ne reçoit rien

**Avantages**:
- Réduit bande passante (pas de broadcast global)
- Respecte la vie privée (statut visible seulement aux contacts)
- Scalable (O(n) où n = nombre de conversations, pas d'utilisateurs)

**Limite théorique**:
- 10,000 utilisateurs actifs
- Moyenne 10 conversations/utilisateur
- 100 broadcasts/seconde lors de pics
- **Soutenable** avec Socket.IO standard

---

## Résilience et Fallbacks

### Si WebSocket Down

**Symptômes**:
- Connexion Socket.IO échoue
- Événements USER_STATUS non reçus

**Fallback**:
1. Statut calculé localement via `lastActiveAt` (reste valide)
2. Bouton refresh manuel disponible:
   ```tsx
   <button onClick={() => usersService.refreshUserStatus(userId)}>
     Actualiser statut
   </button>
   ```
3. Appel REST `GET /api/users/:userId` pour récupérer données fraîches

**Dégradation gracieuse**:
- Statut affiché basé sur dernière `lastActiveAt` connue
- Indicateur "WebSocket déconnecté" affiché
- Auto-reconnexion Socket.IO (tentatives toutes les 5s)

### Si Job Maintenance Crash

**Symptômes**:
- Zombies ne sont plus nettoyés automatiquement
- Utilisateurs restent "en ligne" indéfiniment

**Fallback**:
1. Socket.IO timeout (10s) assure déconnexion côté serveur
2. Restart automatique du job au redémarrage du gateway
3. Endpoint manuel de nettoyage:
   ```bash
   curl -X POST http://localhost:8000/api/admin/maintenance/cleanup
   ```

**Impact**:
- Zombies max: 60s de plus (jusqu'au prochain job)
- Détection garantie par Socket.IO timeout

### Si Throttling Rate Limitée

**Symptômes**:
- Utilisateur très actif (> 1 requête/min)
- `lastActiveAt` pas mis à jour à chaque requête

**Impact**:
- Précision: ±60s sur `lastActiveAt`
- **Acceptable**: Seuil de statut est 5min (60s << 5min)

**Aucun fallback nécessaire**: Design intentionnel pour protéger DB

### Si MongoDB Lent

**Symptômes**:
- Requêtes de mise à jour `lastActiveAt` prennent > 100ms

**Mitigations**:
1. Index sur `lastActiveAt` (accélère requêtes de cleanup)
2. Throttling réduit charge (max 1 update/min/user)
3. Mise à jour asynchrone (non-bloquante pour requête REST)

**Code**:
```typescript
// Mise à jour asynchrone (fire-and-forget)
prisma.user.update({ ... }).catch(err => {
  logger.error('[Throttle] Failed to update lastActiveAt:', err);
});
```

---

## Monitoring et Métriques

### Métriques Backend

**MaintenanceService**:
```typescript
interface MaintenanceMetrics {
  zombiesCleanedPerMinute: number;    // Nombre de zombies nettoyés/min
  lastCleanupDuration: number;         // Durée du dernier nettoyage (ms)
  totalUsersOnline: number;            // Utilisateurs actuellement en ligne
  totalUsersActive: number;            // Utilisateurs actifs (< 5min)
}
```

**MeeshySocketIOManager**:
```typescript
interface SocketIOMetrics {
  broadcastsPerSecond: number;         // USER_STATUS broadcasts/s
  activeConnections: number;           // Sockets connectées
  avgBroadcastLatency: number;         // Latence moyenne broadcast (ms)
}
```

**Auth Middleware**:
```typescript
interface ThrottleMetrics {
  updatesPerMinute: number;            // lastActiveAt updates/min
  throttledRequests: number;           // Requêtes throttled (skipped)
  throttleCacheSize: number;           // Taille cache throttle
}
```

### Métriques Frontend

**usersService (Zustand)**:
```typescript
interface FrontendMetrics {
  userStatusEventsReceived: number;    // USER_STATUS reçus/s
  avgEventToUILatency: number;         // Latence event → UI update (ms)
  localStatusCalculations: number;     // Calculs locaux/s
  socketReconnects: number;            // Tentatives reconnexion Socket.IO
}
```

### Dashboard Monitoring

**Grafana/Prometheus queries**:

```promql
# Zombies nettoyés par minute
rate(meeshy_zombies_cleaned_total[1m])

# Broadcasts USER_STATUS par seconde
rate(meeshy_user_status_broadcasts_total[1s])

# Latence broadcast (p95)
histogram_quantile(0.95, meeshy_broadcast_latency_seconds_bucket)

# Utilisateurs en ligne (gauge)
meeshy_users_online_total

# Throttling efficiency (% de requêtes throttled)
meeshy_throttled_requests_total / meeshy_auth_requests_total * 100
```

### Logs Clés

```typescript
// Connexion utilisateur
logger.info('[Socket] User connected', {
  userId,
  username,
  isAnonymous,
  timestamp: new Date()
});

// Broadcast USER_STATUS
logger.info('[Broadcast] USER_STATUS sent', {
  userId,
  isOnline,
  conversationsCount,
  duration: broadcastDuration
});

// Cleanup zombies
logger.warn('[Cleanup] Zombies cleaned', {
  count: zombies.length,
  zombieIds: zombies.map(z => z.id),
  inactiveMinutes: avgInactiveMinutes
});

// Throttling
logger.debug('[Throttle] lastActiveAt skipped', {
  userId,
  timeSinceLastUpdate: diffMs,
  nextUpdateIn: THROTTLE_INTERVAL - diffMs
});
```

### Alertes

**Alert 1: Trop de zombies**
```yaml
alert: HighZombieRate
expr: rate(meeshy_zombies_cleaned_total[5m]) > 10
for: 5m
labels:
  severity: warning
annotations:
  summary: "Taux élevé de zombies détectés ({{ $value }}/min)"
  description: "Possibles problèmes de connexion Socket.IO"
```

**Alert 2: Broadcast lent**
```yaml
alert: SlowBroadcast
expr: histogram_quantile(0.95, meeshy_broadcast_latency_seconds_bucket) > 0.5
for: 2m
labels:
  severity: warning
annotations:
  summary: "Broadcast USER_STATUS lent (p95: {{ $value }}s)"
```

**Alert 3: Job maintenance down**
```yaml
alert: MaintenanceJobDown
expr: time() - meeshy_last_cleanup_timestamp > 120
labels:
  severity: critical
annotations:
  summary: "Job maintenance n'a pas tourné depuis 2 minutes"
```

---

## Guide de Troubleshooting

### Problème: Utilisateur reste "en ligne" après fermeture navigateur

**Diagnostic**:
1. Vérifier si Socket.IO timeout fonctionne:
   ```bash
   # Logs backend
   grep "disconnect" gateway.log | tail -n 20
   ```
2. Vérifier si job maintenance tourne:
   ```bash
   curl http://localhost:8000/api/admin/maintenance/stats
   ```

**Solutions**:
- Si Socket.IO timeout ne déclenche pas: Réduire `pingTimeout` (actuellement 10s)
- Si job maintenance down: Redémarrer gateway
- Si zombies persistent > 2min: Forcer cleanup manuel:
  ```bash
  curl -X POST http://localhost:8000/api/admin/maintenance/cleanup-zombies
  ```

### Problème: Statut pas mis à jour en temps réel

**Diagnostic**:
1. Vérifier connexion Socket.IO frontend:
   ```javascript
   console.log('Socket connected:', socket.connected);
   console.log('Socket ID:', socket.id);
   ```
2. Vérifier listeners installés:
   ```javascript
   console.log('Listeners:', socket.eventNames());
   ```
3. Vérifier broadcast backend:
   ```bash
   grep "Broadcast USER_STATUS" gateway.log | tail -n 10
   ```

**Solutions**:
- Si socket.connected = false: Problème réseau ou CORS
- Si listeners manquants: Vérifier `setupSocketListeners()` appelé
- Si broadcast OK mais pas reçu: Vérifier room Socket.IO (`conversation_{id}`)

### Problème: `lastActiveAt` jamais mis à jour

**Diagnostic**:
1. Vérifier middleware Auth installé:
   ```typescript
   // Dans routes Fastify
   router.get('/messages', {
     preHandler: createUnifiedAuthMiddleware(prisma, { requireAuth: true })
   }, handler);
   ```
2. Vérifier logs throttling:
   ```bash
   grep "lastActiveAt mis à jour" gateway.log
   grep "lastActiveAt skipped" gateway.log
   ```

**Solutions**:
- Si middleware pas installé: Ajouter `preHandler` à toutes les routes authentifiées
- Si throttling trop agressif: Réduire `THROTTLE_INTERVAL` (actuellement 60s)

### Problème: Trop de broadcasts (performance)

**Diagnostic**:
1. Mesurer broadcasts/seconde:
   ```promql
   rate(meeshy_user_status_broadcasts_total[1s])
   ```
2. Identifier utilisateurs "flappy" (connect/disconnect rapide):
   ```bash
   grep "USER_STATUS" gateway.log | awk '{print $5}' | sort | uniq -c | sort -rn | head
   ```

**Solutions**:
- Si broadcasts > 100/s: Augmenter seuil zombie (actuellement 5min)
- Si utilisateur flappy: Implémenter debouncing (attendre 5s avant broadcast disconnect)

### Problème: MongoDB lent sur `lastActiveAt` updates

**Diagnostic**:
1. Vérifier index MongoDB:
   ```javascript
   db.User.getIndexes()
   ```
2. Profiler requêtes lentes:
   ```javascript
   db.setProfilingLevel(2);
   db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 });
   ```

**Solutions**:
- Si index manquant sur `lastActiveAt`: Créer index:
  ```javascript
  db.User.createIndex({ lastActiveAt: 1 });
  ```
- Si updates toujours lents: Passer à write concern `w: 1` (fire-and-forget):
  ```typescript
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() }
  }, { writeConcern: { w: 1 } });
  ```

---

## Annexes

### A. Configuration Socket.IO Recommandée

```typescript
// gateway/src/socketio/MeeshySocketIOManager.ts

const io = new SocketIOServer(httpServer, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],

  cors: {
    origin: '*', // À restreindre en production
    methods: ["GET", "POST"],
    credentials: true
  },

  // Timeouts critiques pour détection déconnexions
  pingTimeout: 10000,    // 10s - Temps d'attente pong avant disconnect
  pingInterval: 25000,   // 25s - Intervalle entre pings
  connectTimeout: 45000, // 45s - Timeout connexion initiale

  // Performance
  maxHttpBufferSize: 1e6, // 1MB - Taille max payload

  // Résilience
  allowEIO3: true,        // Support Engine.IO v3 (fallback)
  perMessageDeflate: true // Compression (réduit bande passante)
});
```

### B. Exemple Complet Frontend

```typescript
// frontend/hooks/useRealtimeStatus.ts

import { useEffect } from 'react';
import { useSocketIO } from '@/services/socketService';
import { useUsersService } from '@/services/usersService';
import { SERVER_EVENTS } from '@shared/types/socketio-events';

export const useRealtimeStatus = () => {
  const { socket, isConnected } = useSocketIO();
  const usersService = useUsersService();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Écouter USER_STATUS
    const handleUserStatus = (data: UserStatusEvent) => {
      console.log('[Status] Received:', data);

      usersService.updateUserStatus(data.userId, {
        isOnline: data.isOnline,
        lastActiveAt: new Date()
      });
    };

    socket.on(SERVER_EVENTS.USER_STATUS, handleUserStatus);

    return () => {
      socket.off(SERVER_EVENTS.USER_STATUS, handleUserStatus);
    };
  }, [socket, isConnected]);

  return {
    isConnected,
    getUserStatus: usersService.getUserStatus,
    isUserOnline: usersService.isUserOnline
  };
};
```

### C. Tests de Performance Attendus

| Métrique | Valeur Attendue | Méthode de Mesure |
|----------|-----------------|-------------------|
| Latence broadcast | < 100ms (p95) | Timestamp backend → frontend |
| Détection zombie | < 70s | Crash navigateur → statut "offline" |
| Throughput broadcasts | 100 broadcasts/s | Load test avec 1000 utilisateurs |
| Charge DB (throttling) | 1 update/min/user | Monitoring MongoDB ops/s |
| Précision `lastActiveAt` | ±60s | Comparer horodatages attendus vs réels |

### D. Checklist Déploiement Production

- [ ] Socket.IO CORS configuré pour domaines de production uniquement
- [ ] Index MongoDB créés sur `isOnline` et `lastActiveAt`
- [ ] Job maintenance activé (`startMaintenanceTasks()` appelé)
- [ ] Monitoring Grafana/Prometheus configuré
- [ ] Alertes configurées (zombies, broadcast lent, job down)
- [ ] Tests de charge réussis (1000+ utilisateurs simultanés)
- [ ] Fallbacks testés (WebSocket down, MongoDB lent)
- [ ] Logs de debug réduits (passer à `logger.level = 'info'`)
- [ ] Rate limiting configuré (anti-DDoS)
- [ ] Sécurité WebSocket testée (JWT validation, anti-spoofing)

---

## Références

- **Socket.IO Documentation**: https://socket.io/docs/v4/
- **Prisma MongoDB Guide**: https://www.prisma.io/docs/concepts/database-connectors/mongodb
- **WebSocket Best Practices**: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- **Zustand State Management**: https://github.com/pmndrs/zustand

---

**Document Rédigé Par**: Claude (Anthropic)
**Date**: 2025-11-03
**Version**: 1.0
**Statut**: ✅ Prêt pour Implémentation
