# Architecture de Messagerie de Meeshy
## Vue d'ensemble et analyse pour intégration DMA/MLS

**Date:** 2025-11-16  
**Projet:** Meeshy  
**Objectif:** Comprendre l'architecture actuelle pour proposer une intégration avec les standards d'interopérabilité DMA (Message Layer Security - MLS)

---

## TABLE DES MATIÈRES

1. [Vue d'ensemble de l'architecture](#vue-densemble)
2. [Modèles de données](#modèles-de-données)
3. [Services de messagerie](#services-de-messagerie)
4. [Protocoles de communication](#protocoles-de-communication)
5. [Flux de messages](#flux-de-messages)
6. [Sécurité et authentification](#sécurité-et-authentification)
7. [Structure des conversations/rooms](#structure-des-conversations-et-rooms)
8. [Formats de messages](#formats-de-messages)
9. [Points clés pour intégration DMA/MLS](#points-clés-pour-intégration-dmamls)

---

## 1. Vue d'ensemble de l'architecture

### Stack technologique

**Backend:**
- Fastify (Node.js) - Framework web haute performance
- Socket.IO - Communication temps réel bidirectionnelle
- MongoDB - Base de données (Prisma ORM)
- JWT - Authentification
- ZMQ (Zero Message Queue) - Service de traduction asynchrone

**Frontend:**
- Next.js (React)
- Socket.IO Client
- TypeScript
- Services et hooks personnalisés

**Architecture globale:**
```
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Next.js + React)                │
│  - Components: BubbleMessage, ChatInterface, ConversationList    │
│  - Services: meeshy-socketio.service, conversations.service      │
│  - Hooks: use-socketio-messaging, use-message-translations      │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     REST/HTTP      Socket.IO (WS)    Polling (fallback)
        │                │                │
        └────────────────┼────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              GATEWAY (Fastify + Node.js)                        │
│  - Routes: /messages, /conversations, /translations             │
│  - Services: MessagingService, TranslationService, etc.        │
│  - Socket.IO Manager: MeeshySocketIOManager                    │
│  - Middleware: Auth, Rate Limiting, Validation                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
      MongoDB       ZMQ (Translation)    Cache/Redis
        │                │                │
        └────────────────┼────────────────┘
```

---

## 2. Modèles de données

### 2.1 Modèle principal: Message

**Fichier:** `/home/user/meeshy/shared/schema.prisma` (lignes 207-237)

```typescript
model Message {
  id                String                @id @default(auto()) @map("_id") @db.ObjectId
  conversationId    String                @db.ObjectId
  senderId          String?               @db.ObjectId           // Utilisateur authentifié
  anonymousSenderId String?               @db.ObjectId           // Utilisateur anonyme
  
  // CONTENU
  content           String                                        // Texte du message
  originalLanguage  String                @default("fr")        // Langue source
  messageType       String                @default("text")      // text|image|file|audio|video|location|system
  
  // ÉTAT DU MESSAGE
  isEdited          Boolean               @default(false)       // Édité?
  editedAt          DateTime?                                    // Quand?
  isDeleted         Boolean               @default(false)       // Supprimé (soft delete)?
  deletedAt         DateTime?                                    // Quand?
  
  // RÉPONSES/THREADS
  replyToId         String?               @db.ObjectId          // Message de réponse (thread)
  
  // MENTIONS
  validatedMentions String[]              @default([])          // Usernames mentionnés
  
  // MÉTADONNÉES
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt
  
  // RELATIONS
  status            MessageStatus[]       // Statut de réception/lecture
  translations      MessageTranslation[]  // Traductions en autres langues
  attachments       MessageAttachment[]   // Fichiers joints
  reactions         Reaction[]            // Emoji reactions
  mentions          Mention[]             // Relations de mentions
  sender            User?                 // Expéditeur authentifié
  anonymousSender   AnonymousParticipant? // Expéditeur anonyme
  conversation      Conversation
}
```

### 2.2 Modèle Conversation

```typescript
model Conversation {
  id                String                @id @default(auto()) @map("_id") @db.ObjectId
  identifier        String                @unique              // Human-readable (ex: "mee_meeshy")
  type              String                                      // direct|group|public|global
  title             String?
  description       String?
  image             String?
  avatar            String?
  
  // ÉTAT
  isActive          Boolean               @default(true)
  isArchived        Boolean               @default(false)
  lastMessageAt     DateTime              @default(now())
  
  // RELATIONS
  members           ConversationMember[]  // Participants
  messages          Message[]             // Historique de messages
  anonymousParticipants AnonymousParticipant[]
  
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt
}
```

### 2.3 Modèle Traduction

```typescript
model MessageTranslation {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId         String   @db.ObjectId
  sourceLanguage    String                // ex: "fr"
  targetLanguage    String                // ex: "en"
  translatedContent String                // Contenu traduit
  translationModel  String                // "basic"|"medium"|"premium"
  cacheKey          String   @unique      // Clé de cache
  confidenceScore   Float?                // Score de confiance (0-1)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  // Contrainte: Une seule traduction par message/langue cible
  @@unique([messageId, targetLanguage])
}
```

### 2.4 Types TypeScript (Frontend/Backend)

**Fichier:** `/home/user/meeshy/shared/types/message-types.ts`

```typescript
// MESSAGE GATEWAY (API/Backend)
export interface GatewayMessage {
  id: string;
  conversationId: string;
  senderId?: string;
  anonymousSenderId?: string;
  content: string;
  originalLanguage: string;
  messageType: MessageType;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  replyToId?: string;
  createdAt: Date;
  updatedAt?: Date;
  sender?: User | AnonymousParticipant;
  translations: readonly MessageTranslation[];
  replyTo?: GatewayMessage;  // Support des threads
}

// MESSAGE UI (Frontend)
export interface UIMessage extends GatewayMessage {
  // États visuels
  uiTranslations: readonly UITranslationState[];
  translatingLanguages: Set<string>;
  currentDisplayLanguage: string;
  showingOriginal: boolean;
  originalContent: string;
  
  // États de lecture
  readStatus?: readonly ReadStatus[];
  
  // Permissions
  canEdit: boolean;
  canDelete: boolean;
  canTranslate: boolean;
  canReply: boolean;
}
```

---

## 3. Services de messagerie

### 3.1 MessagingService (Backend)

**Fichier:** `/home/user/meeshy/gateway/src/services/MessagingService.ts`

**Responsabilités principales:**
- Gestion du cycle de vie des messages (création, édition, suppression)
- Authentification et autorisation
- Validation des messages
- Gestion des mentions et notifications
- Interaction avec la base de données

**Méthodes clés:**
```typescript
class MessagingService {
  // Point d'entrée principal
  async handleMessage(
    request: MessageRequest,
    senderId: string,
    isAuthenticated: boolean = true,
    jwtToken?: string,
    sessionToken?: string
  ): Promise<MessageResponse>
  
  // Contexte d'authentification
  private createAuthenticationContext(
    senderId: string,
    jwtToken?: string,
    sessionToken?: string
  ): AuthenticationContext
  
  // Validation
  private validateMessage(request: MessageRequest): MessageValidationResult
  
  // Permissions
  private checkPermissions(senderId: string, conversationId: string): MessagePermissionResult
}
```

### 3.2 TranslationService

**Fichier:** `/home/user/meeshy/gateway/src/services/TranslationService.ts`

**Responsabilités:**
- Gestion asynchrone des traductions
- Interaction avec service ZMQ
- Cache des traductions
- Multi-langue support

### 3.3 NotificationService

**Responsabilités:**
- Génération des notifications
- Mentions tracking
- Notifications push

### 3.4 ReactionService

**Responsabilités:**
- Gestion des emoji reactions
- Agrégation des réactions par emoji
- Synchronisation temps réel

---

## 4. Protocoles de communication

### 4.1 Socket.IO (Temps réel, bidirectionnel)

**Fichier:** `/home/user/meeshy/gateway/src/socketio/MeeshySocketIOManager.ts`

**Configuration:**
```typescript
const io = new SocketIOServer(httpServer, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],  // Fallback sur polling
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
    allowedHeaders: ['authorization', 'content-type', 'x-session-token'],
    credentials: true
  },
  pingTimeout: 10000,   // 10s - Timeout de réponse
  pingInterval: 25000,  // 25s - Intervalle de ping
  connectTimeout: 45000 // 45s - Timeout de connexion initiale
});
```

**Événements CLIENT → SERVER (ClientToServerEvents):**

```typescript
export const CLIENT_EVENTS = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  AUTHENTICATE: 'authenticate',
  REQUEST_TRANSLATION: 'request_translation',
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',
  CALL_INITIATE: 'call:initiate',
  CALL_JOIN: 'call:join',
  CALL_END: 'call:end'
};
```

**Événements SERVER → CLIENT (ServerToClientEvents):**

```typescript
export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',              // Nouveau message
  MESSAGE_EDITED: 'message:edited',        // Message modifié
  MESSAGE_DELETED: 'message:deleted',      // Message supprimé
  MESSAGE_TRANSLATION: 'message:translation', // Traduction demandée
  MESSAGE_TRANSLATED: 'message_translated', // Traduction complète
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  CONVERSATION_JOINED: 'conversation:joined',
  CONVERSATION_LEFT: 'conversation:left',
  ERROR: 'error',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  CALL_INITIATED: 'call:initiated',
  CALL_ENDED: 'call:ended'
};
```

### 4.2 REST API

**Routes messagerie:**
- `GET /messages/:messageId` - Récupérer un message
- `PUT /messages/:messageId` - Éditer un message
- `DELETE /messages/:messageId` - Supprimer un message
- `GET /conversations/:conversationId/messages` - Lister les messages
- `POST /conversations/:conversationId/messages` - Envoyer un message

**Routes conversations:**
- `GET /conversations` - Lister les conversations
- `POST /conversations` - Créer une conversation
- `GET /conversations/:conversationId` - Récupérer les détails
- `PUT /conversations/:conversationId` - Mettre à jour

### 4.3 Authentification

**Types:**
1. **JWT (Utilisateurs authentifiés)**
   - Token dans Authorization header: `Bearer <token>`
   - Utilisateur identifié par `senderId` (ObjectId MongoDB)

2. **Session Token (Utilisateurs anonymes)**
   - Token dans header: `x-session-token`
   - Utilisateur identifié par `anonymousSenderId`

**Middleware d'authentification:**
```typescript
// Authentification obligatoire
const requiredAuth = createUnifiedAuthMiddleware(prisma, { 
  requireAuth: true, 
  allowAnonymous: false 
});

// Authentification optionnelle (authentifié OU anonyme)
const optionalAuth = createUnifiedAuthMiddleware(prisma, { 
  requireAuth: false, 
  allowAnonymous: true 
});
```

---

## 5. Flux de messages

### 5.1 Flux d'envoi de message (Socket.IO)

```
FRONTEND (Client)
    │
    ├─ Utilisateur envoie message
    │
    ├─ Validation locale (longueur, contenu)
    │
    └─ EMIT: message:send {
         conversationId: string;
         content: string;
         originalLanguage?: string;
         messageType?: string;
         replyToId?: string;
       }
         │
         │ [Optionnel] CALLBACK avec ACK
         │
         ▼
    
    GATEWAY (Fastify + Socket.IO)
         │
         ├─ Authentification (JWT ou session token)
         │
         ├─ Validation du message (MessageService)
         │
         ├─ Vérification des permissions
         │
         ├─ Insertion en base de données (MongoDB)
         │
         ├─ Extraction des mentions (@username)
         │
         ├─ Génération des notifications
         │
         ├─ Enqueue pour traduction asynchrone (ZMQ)
         │
         └─ BROADCAST: message:new {
              message: SocketIOMessage (complet avec sender);
              conversationId: string;
              metadata: { stats, translations, etc. }
            }
              │
              ▼
         
    TOUS LES CLIENTS connectés à la conversation
         │
         ├─ Mise à jour de l'état local
         │
         ├─ Affichage du message dans le chat
         │
         ├─ Demande de traduction (si auto-translation activée)
         │
         └─ Notifications visuelles/sonores

    TRADUCTION (ZMQ)
         │
         ├─ Service de traduction reçoit le message
         │
         ├─ Traduit dans les langues demandées
         │
         ├─ Cache la traduction
         │
         └─ EMIT: message:translation {
              messageId: string;
              translations: [{
                targetLanguage: string;
                translatedContent: string;
              }]
            }
              │
              ▼
         
    CLIENTS (Mise à jour des traductions)
         │
         └─ Affichage des traductions
```

### 5.2 Flux de réception de message

**Frontend:**
1. Hook `useSocketIOMessaging` enregistre les listeners
2. Reçoit événement `message:new`
3. Ajoute le message à l'état local
4. Re-render du composant chat
5. Enregistre le statut "delivered"
6. Demande les traductions si nécessaire

---

## 6. Sécurité et authentification

### 6.1 Authentification

**Mécanismes:**
- JWT (utilisateurs enregistrés)
- Session tokens (utilisateurs anonymes)
- Rate limiting sur les endpoints sensibles
- Password hashing (bcrypt)
- Email/Phone verification optionnelle
- Two-factor authentication (TFA) supportée

**Middleware:**
```typescript
// /gateway/src/middleware/auth.ts
export function createUnifiedAuthMiddleware(prisma: PrismaClient, options: {
  requireAuth: boolean;
  allowAnonymous: boolean;
}) {
  // Valide JWT token OU session token anonyme
  // Attache authContext à la requête
  // authContext.type: 'jwt' | 'session'
  // authContext.userId (JWT) ou authContext.sessionToken (anonyme)
}
```

### 6.2 Autorisation

**Niveaux de rôles:**
- `USER` - Utilisateur enregistré standard
- `ADMIN` - Administrateur système
- `MODO` (MODERATOR) - Modérateur de contenu
- `AUDIT` - Audit/compliance
- `ANALYST` - Analyste de données
- `BIGBOSS` - Super administrateur

**Permissions par conversation:**
```typescript
interface ConversationMember {
  role: string;  // admin|moderator|member
  canSendMessage: boolean;
  canSendFiles: boolean;
  canSendImages: boolean;
  canSendVideos: boolean;
  canSendAudios: boolean;
  canSendLocations: boolean;
  canSendLinks: boolean;
}
```

### 6.3 Chiffrement et sécurité au transport

**HTTPS/TLS:**
- Gateway configurée avec Fastify helmet middleware
- Support du CORS avec configuration stricte
- Headers de sécurité (CSP, X-Frame-Options, etc.)

**Chiffrement des données en transit:**
- WebSocket sur TLS (wss://)
- REST sur HTTPS

**⚠️ NOTE IMPORTANTE:** 
- **Aucun chiffrement end-to-end détecté dans le code actuel**
- Les messages sont stockés en clair en MongoDB
- Les traductions sont en clair
- Les traductions en cache ne sont pas chiffrées

### 6.4 Rate Limiting

**Service:** `SocketRateLimiter`  
**Fichier:** `/gateway/src/utils/socket-rate-limiter.ts`

```typescript
// Middleware rate limiting
registerGlobalRateLimiter(fastify, {
  max: 100,                    // 100 requêtes
  timeWindow: '15 minutes'
});
```

### 6.5 Validation

**Validation des messages:**
```typescript
interface MessageValidationResult {
  isValid: boolean;
  errors: ValidationError[];      // Champs invalides
  warnings?: ValidationWarning[];  // Avertissements
}

// Limits configurés
export const MESSAGE_LIMITS = {
  maxContentLength: 10000,        // 10k caractères
  maxAttachments: 5,
  allowedMimeTypes: [...]
};
```

---

## 7. Structure des conversations et rooms

### 7.1 Rooms Socket.IO

**Convention de naming:**
```
conversation:{conversationId}      // Room pour une conversation
user:{userId}                      // Room privée utilisateur
typing:{conversationId}            // Room des indicateurs de frappe
calls:{conversationId}             // Room des appels vidéo
```

**Gestion des rooms:**
```typescript
class MeeshySocketIOManager {
  // Normalisation des IDs (ObjectId ou identifier)
  private async normalizeConversationId(conversationId: string): Promise<string>
  
  // Join room
  public joinConversation(socket: Socket, conversationId: string): void
  
  // Leave room
  public leaveConversation(socket: Socket, conversationId: string): void
  
  // Broadcast à une room
  private broadcastToConversation(conversationId: string, event: string, data: any)
}
```

### 7.2 Types de conversations

```typescript
type ConversationType = 'direct' | 'group' | 'public' | 'global' | 'broadcast';
type ConversationStatus = 'active' | 'archived' | 'deleted';
type ConversationVisibility = 'public' | 'private' | 'restricted';
```

**Modèle de conversation:**
- **direct**: 1:1 entre utilisateurs
- **group**: Multi-utilisateurs privé
- **public**: Accessible via lien de partage
- **global**: Broadcast à tous (actualités, annonces)
- **broadcast**: Similaire à public

### 7.3 Participants

**Types de participants:**
1. **Utilisateurs authentifiés** (`User`)
   - Identifiés par `userId` (ObjectId MongoDB)
   - Ont un profil complet

2. **Utilisateurs anonymes** (`AnonymousParticipant`)
   - Identifiés par `anonymousUserId`
   - Identifiés aussi par `sessionToken`
   - Accès via liens de partage `ConversationShareLink`
   - Permissions limitées configurables par lien

**Lien de partage:**
```typescript
model ConversationShareLink {
  identifier: string;                    // Human-readable
  allowAnonymousMessages: boolean;       // Peut envoyer?
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  allowViewHistory: boolean;             // Peut voir l'historique?
  requireAccount: boolean;               // Force inscription?
  requireNickname: boolean;
  requireEmail: boolean;
  requireBirthday: boolean;
  maxUses?: number;                      // Limite d'utilisations
  expiresAt?: Date;                      // Date d'expiration
}
```

---

## 8. Formats de messages

### 8.1 Format MessageRequest (Envoi)

```typescript
interface MessageRequest {
  // Requis
  conversationId: string;
  content: string;
  
  // Optionnels
  originalLanguage?: string;           // Auto-détection si absent
  messageType?: string;                // Default: "text"
  replyToId?: string;                  // Thread/réponse
  
  // Mentions
  mentionedUserIds?: readonly string[];
  
  // Anonyme (DEPRECATED - utiliser authContext)
  isAnonymous?: boolean;
  anonymousDisplayName?: string;
  
  // Optionnels
  priority?: MessagePriority;          // low|normal|high|urgent
  encrypted?: boolean;
  attachments?: readonly MessageAttachment[];
  
  // Traduction
  translationPreferences?: MessageTranslationPreferences;
  
  // Contexte d'authentification
  authContext?: AuthenticationContext;
  
  // Métadonnées
  metadata?: MessageRequestMetadata;
}
```

### 8.2 Format SocketIOMessage (Socket.IO)

```typescript
interface SocketIOMessage {
  id: string;
  conversationId: string;
  senderId?: string;
  anonymousSenderId?: string;
  
  // Contenu
  content: string;
  originalLanguage: string;
  messageType: MessageType;        // text|image|file|audio|video|location|system
  
  // État
  isEdited?: boolean;
  editedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  
  // Références
  replyToId?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
  
  // Relations
  sender?: SocketIOUser | AnonymousParticipant;
  translations?: MessageTranslation[];  // OPTIONNEL
  attachments?: MessageAttachment[];     // OPTIONNEL
}
```

### 8.3 Format MessageResponse (Réponse API)

```typescript
interface MessageResponse extends ApiResponse<SocketIOMessage> {
  data: SocketIOMessage;  // Message complet avec relations
  
  metadata: MessageResponseMetadata;  // Métadonnées enrichies
}

interface MessageResponseMetadata {
  conversationStats?: ConversationStats;
  translationStatus?: TranslationStatus;
  deliveryStatus?: DeliveryStatus;
  performance?: PerformanceMetrics;
  context?: MessageContext;
  debug?: DebugInfo;  // Development only
}
```

### 8.4 Types de messages

```typescript
type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system';
```

### 8.5 Pièces jointes

```typescript
interface MessageAttachment {
  id: string;
  messageId: string;
  fileName: string;           // Nom généré unique
  originalName: string;       // Nom original de l'utilisateur
  mimeType: string;
  fileSize: number;
  filePath: string;           // Relatif: attachments/YYYY/mm/userId/filename
  fileUrl: string;            // URL complète
  
  // Images
  width?: number;
  height?: number;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  
  // Audio/Vidéo
  duration?: number;          // Secondes
  bitrate?: number;
  sampleRate?: number;
  codec?: string;
  channels?: number;
  
  // Vidéo
  fps?: number;
  videoCodec?: string;
  
  // Documents
  pageCount?: number;
  
  // Texte/Code
  lineCount?: number;
  
  uploadedBy: string;
  isAnonymous: boolean;
  createdAt: Date;
}
```

---

## 9. Points clés pour intégration DMA/MLS

### 9.1 Besoins pour Message Layer Security (MLS)

**MLS est un protocole de chiffrement de groupe qui fournit:**
1. **Forward secrecy** - Clés anciennes ne déchiffrent pas les futurs messages
2. **Post-compromise security** - Même si une clé est compromise, les messages futurs restent sécurisés
3. **Scalabilité** - Efficace même pour les groupes de milliers d'utilisateurs
4. **Authentification** - Authentification des messages et des sources

### 9.2 Architecture actuelle vs MLS

**Ce qui existe:**
- ✅ Authentification (JWT + sessions)
- ✅ Authorization (rôles et permissions)
- ✅ Rate limiting
- ✅ Validation des messages
- ✅ Support multi-conversations et participants
- ✅ Gestion des statuts des utilisateurs

**Ce qui manque pour MLS:**
- ❌ Chiffrement end-to-end
- ❌ Gestion de clés cryptographiques
- ❌ Support de l'évolution des clés
- ❌ Vérification d'authenticité des messages
- ❌ Protection contre les attaques par rejeu
- ❌ Gestion des secrets partagés de groupe

### 9.3 Points d'intégration proposés

#### 9.3.1 Couche de chiffrement
```
MESSAGE REQUEST/RESPONSE
    ↓
[NOUVEAU] Message Encryption Layer
    - Chiffrement avec clés MLS
    - Génération/rotation des clés
    - Vérification de l'authenticité
    ↓
MessagingService (existant)
    ↓
[NOUVEAU] Message Decryption Layer (côté destinataire)
    ↓
Socket.IO broadcast
```

#### 9.3.2 Gestion des clés
```typescript
// Nouveau service: MLSKeyManagementService
class MLSKeyManagementService {
  // Initialiser groupe MLS pour une conversation
  async initializeMLS(conversationId: string): Promise<void>
  
  // Ajouter participant à groupe MLS
  async addParticipantToMLS(conversationId: string, userId: string): Promise<void>
  
  // Retirer participant
  async removeParticipantFromMLS(conversationId: string, userId: string): Promise<void>
  
  // Obtenir l'état du groupe MLS
  async getMLS(conversationId: string): Promise<MLSState>
  
  // Générer nouvelles clés (commit)
  async generateNewKeysForGroup(conversationId: string): Promise<void>
}
```

#### 9.3.3 Chiffrement/déchiffrement des messages
```typescript
// Nouveau service: MessageEncryptionService
interface IMessageEncryption {
  // Chiffrer un message avant envoi
  encryptMessage(
    message: MessageRequest,
    conversationId: string,
    senderId: string
  ): Promise<EncryptedMessage>
  
  // Déchiffrer un message reçu
  decryptMessage(
    encryptedMessage: EncryptedMessage,
    recipientUserId: string
  ): Promise<DecryptedMessage>
  
  // Vérifier l'intégrité/authenticité
  verifyMessageSignature(encryptedMessage: EncryptedMessage): Promise<boolean>
}
```

#### 9.3.4 Modèles de données pour MLS
```typescript
// Nouvelles tables MongoDB
model MLSGroupState {
  id: ObjectId;
  conversationId: String;
  groupId: String;              // MLS group ID
  epoch: Int;                    // Numéro d'époque MLS
  treeKem: Json;                 // État du TreeKEM
  credentials: [String];         // Credentials des membres
  createdAt: DateTime;
  updatedAt: DateTime;
}

model MLSPendingCommit {
  id: ObjectId;
  conversationId: String;
  userId: String;
  commitData: Json;              // Commit en attente
  expiresAt: DateTime;
  createdAt: DateTime;
}

model MLSKeyPackage {
  id: ObjectId;
  userId: String;
  keyPackageData: String;        // Serialisé
  publicKey: String;
  isUsed: Boolean;
  createdAt: DateTime;
  expiresAt: DateTime;
}
```

### 9.4 Flux de message avec MLS

```
CLIENT A (Sender)
    │
    ├─ Message en clair
    │
    ├─ [MLS] Chiffrer avec clé groupe
    │
    ├─ [MLS] Signer le message
    │
    └─ EMIT: message:send (encrypted)
         │
         ▼
GATEWAY
    │
    ├─ [MLS] Vérifier signature
    │
    ├─ [MLS] Vérifier authenticité de sender
    │
    ├─ Stocker message chiffré en BD
    │
    └─ BROADCAST: message:new (encrypted)
         │
         ├────────────────────────────────┐
         │                                │
         ▼                                ▼
    CLIENT B              CLIENT C
         │                     │
         ├─ Recevoir message  ├─ Recevoir message
         │  chiffré           │  chiffré
         │                     │
         ├─ [MLS] Déchiffrer ├─ [MLS] Déchiffrer
         │  avec clé groupe  │  avec clé groupe
         │                     │
         └─ Message en clair  └─ Message en clair
```

### 9.5 Points d'attention pour l'implémentation

1. **Compatibilité backward**: Comment gérer les anciens messages non chiffrés?
2. **Performance**: Impact du chiffrement/déchiffrement sur latence
3. **Gestion des états**: Synchroniser l'état MLS entre clients et serveur
4. **Offline users**: Comment gérer les utilisateurs offline rejoignant?
5. **Audit/Compliance**: Les logs doivent-ils être chiffrés aussi?
6. **Migration**: Plan pour passer de l'existant à MLS

---

## 10. Fichiers clés de l'architecture

### Backend
| Fichier | Description |
|---------|-------------|
| `/gateway/src/services/MessagingService.ts` | Service principal de messagerie |
| `/gateway/src/services/TranslationService.ts` | Traduction asynchrone |
| `/gateway/src/services/NotificationService.ts` | Notifications |
| `/gateway/src/socketio/MeeshySocketIOManager.ts` | Gestion Socket.IO |
| `/gateway/src/routes/messages.ts` | API REST messages |
| `/gateway/src/routes/conversations.ts` | API REST conversations |
| `/gateway/src/middleware/auth.ts` | Authentification unifiée |

### Frontend
| Fichier | Description |
|---------|-------------|
| `/apps/web/services/meeshy-socketio.service.ts` | Client Socket.IO |
| `/apps/web/services/messages.service.ts` | Service API messages |
| `/apps/web/services/conversations.service.ts` | Service API conversations |
| `/apps/web/components/common/BubbleMessage.tsx` | Composant affichage message |
| `/apps/web/hooks/use-socketio-messaging.ts` | Hook gestion temps réel |

### Types partagés
| Fichier | Description |
|---------|-------------|
| `/shared/types/socketio-events.ts` | Événements Socket.IO |
| `/shared/types/message-types.ts` | Types de messages |
| `/shared/types/messaging.ts` | Types request/response |
| `/shared/types/conversation.ts` | Types conversations |
| `/shared/schema.prisma` | Schéma base de données |

---

## 11. Résumé des observations

### Forces de l'architecture actuelle
✅ **Architecture bien organisée**: Separation des concerns claire  
✅ **Communication temps réel**: Socket.IO bien intégré  
✅ **Support multi-langue**: Traductions asynchrones avec cache  
✅ **Authentification robuste**: JWT et sessions anonymes  
✅ **Type-safe**: TypeScript dans frontend et backend  
✅ **Scalable**: Rooms Socket.IO, rate limiting, caching  

### Points à améliorer pour DMA/MLS
⚠️ **Aucun chiffrement end-to-end**: Critique pour sécurité  
⚠️ **Pas de gestion de clés cryptographiques**  
⚠️ **Messages en clair en base de données**  
⚠️ **Pas de vérification d'intégrité des messages**  
⚠️ **Gestion d'état centralisée**: Nécessite redesign pour MLS distribué  

### Recommandations
1. **Phase 1**: Ajouter TLS obligatoire et certificats
2. **Phase 2**: Implémenter chiffrement simple (symétrique par conversation)
3. **Phase 3**: Intégrer MLS progressive (d'abord conversations 1:1)
4. **Phase 4**: Étendre MLS à conversations de groupe
5. **Phase 5**: Migration complète et audit de sécurité

