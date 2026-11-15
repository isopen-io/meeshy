# Guide de Lecture Rapide - Architecture Messagerie Meeshy

## Pour comprendre l'architecture en 15 minutes

### Approche 1: Vue d'ensemble globale (5 min)

1. **Lire les fichiers types d'abord** (fondation)
   - `/shared/types/socketio-events.ts` - Voir les constantes d'événements (ligne 25-81)
   - `/shared/types/messaging.ts` - Voir MessageRequest et MessageResponse
   - `/shared/schema.prisma` - Voir modèle Message (ligne 207-237)

2. **Comprendre le flux de base**
   - Client envoie: `message:send` event (Socket.IO)
   - Server traite: `MessagingService.handleMessage()`
   - Server diffuse: `message:new` event
   - Clients reçoivent et affichent

### Approche 2: Par couches technologiques (10 min)

#### BACKEND (Fastify):
1. Point d'entrée: `/gateway/src/server.ts` (100 lignes)
   - Configuration Fastify
   - Enregistrement routes
   - Setup Socket.IO

2. Socket.IO: `/gateway/src/socketio/MeeshySocketIOManager.ts` (1ère 150 lignes)
   - Initialisation
   - Gestion rooms
   - Mapping utilisateurs

3. Service principal: `/gateway/src/services/MessagingService.ts` (1ères 100 lignes)
   - handleMessage() méthode clé
   - Authentification
   - Validation

#### FRONTEND (Next.js):
1. Service Socket.IO: `/apps/web/services/meeshy-socketio.service.ts` (1ères 150 lignes)
   - Singleton pattern
   - Connection/reconnection
   - Event listeners

2. Hook principal: `/apps/web/hooks/use-socketio-messaging.ts` (1ères 100 lignes)
   - useEffect pour connexion
   - Listeners d'événements
   - Join/leave conversation

3. Composant d'affichage: `/apps/web/components/common/BubbleMessage.tsx` (1ères 80 lignes)
   - Props structure
   - Gestion d'états
   - Callbacks aux parents

### Approche 3: Par cas d'usage (15 min)

#### CAS 1: Envoyer un message
```
Frontend
  ├─ Composant form
  └─ meeshySocketIOService.sendMessage()
      ├─ EMIT message:send
      └─ Callback avec ACK

Backend
  ├─ Socket.IO on('message:send')
  ├─ MessagingService.handleMessage()
  │   ├─ Auth (JWT ou session token)
  │   ├─ Validation
  │   ├─ Insert DB
  │   └─ Enqueue traduction
  └─ BROADCAST message:new

Tous les clients
  ├─ Hook reçoit event
  ├─ Met à jour state
  └─ BubbleMessage affiche
```

#### CAS 2: Traduction d'un message
```
Backend
  ├─ TranslationService.enqueueTranslation()
  └─ ZMQ envoie au service traduction

Translation service
  ├─ Reçoit message
  ├─ Traduit (cache check)
  └─ Retour résultat

Backend
  ├─ Reçoit traduction
  ├─ Sauvegarde MessageTranslation
  └─ EMIT message:translation

Frontend
  ├─ Hook reçoit event
  ├─ Met à jour traductions
  └─ BubbleMessage affiche langue traduite
```

#### CAS 3: Rejoindre une conversation
```
Frontend
  ├─ Navigation vers conversation
  ├─ useSocketIOMessaging hook with conversationId
  └─ Appelle joinConversation()
      └─ EMIT conversation:join

Backend
  ├─ Socket join room: conversation:{conversationId}
  ├─ Charge messages historiques
  ├─ Met à jour user status
  └─ BROADCAST conversation:joined

Frontend
  ├─ Charge messages historiques (REST API)
  └─ Hook émet BROADCAST reçu
```

---

## Structure de répertoires décryptée

### `/shared/` - Code partagé frontend + backend

```
/shared/types/              = Type definitions (TypeScript purs)
  ├─ socketio-events.ts     = 🔴 CŒUR: Tous les événements Socket.IO
  ├─ messaging.ts           = Request/Response
  ├─ message-types.ts       = Types de messages (Gateway vs UI)
  └─ conversation.ts        = Types conversations

/shared/schema.prisma       = 🔴 CŒUR: Schéma base de données MongoDB
```

**Pourquoi partagé?**
- Les types doivent être identiques frontend ET backend
- TypeScript compile en JavaScript côté frontend
- Prisma génère client JS automatiquement

### `/gateway/src/` - Backend (Fastify + Node.js)

```
server.ts                   = 🔴 Point d'entrée
  └─ initialise tout: Fastify, DB, routes, Socket.IO

services/                   = Logique métier
  ├─ MessagingService.ts    = 🔴 CŒUR: Gère messages
  ├─ TranslationService.ts  = Traductions asynchrones
  └─ NotificationService.ts = Notifications

socketio/                   = Temps réel
  ├─ MeeshySocketIOHandler.ts   = 🔴 Setup Socket.IO
  └─ MeeshySocketIOManager.ts   = 🔴 Gère connexions/rooms

routes/                     = Endpoints REST
  ├─ messages.ts            = GET/PUT/DELETE messages
  └─ conversations.ts       = CRUD conversations

middleware/                 = Filtres requêtes
  └─ auth.ts                = 🔴 Authentification (JWT/session)
```

### `/apps/web/` - Frontend (Next.js + React)

```
services/                   = Appels API/Socket.IO
  ├─ meeshy-socketio.service.ts    = 🔴 Client Socket.IO
  ├─ messages.service.ts            = Appels REST messages
  └─ conversations.service.ts       = Appels REST conversations

hooks/                      = React hooks
  ├─ use-socketio-messaging.ts     = 🔴 Hook principal temps réel
  ├─ use-message-translations.ts   = Gestion traductions
  └─ use-message-reactions.ts      = Gestion réactions

components/                 = Composants React
  └─ common/
      ├─ BubbleMessage.tsx         = 🔴 Affichage messages
      └─ bubble-stream-page.tsx    = Page chat

app/                        = Pages Next.js (App Router)
  └─ chat/[id]/page.tsx    = Page d'une conversation
```

---

## Les 5 fichiers CRITIQUES à connaître

| Fichier | Raison | À lire: |
|---------|--------|---------|
| `/shared/schema.prisma` | MODÈLE DE DONNÉES | Modèle Message (207-237) + Conversation (85-111) |
| `/shared/types/socketio-events.ts` | ÉVÉNEMENTS | SERVER_EVENTS (25-56) + CLIENT_EVENTS (59-81) |
| `/gateway/src/services/MessagingService.ts` | LOGIQUE PRINCIPALE | handleMessage() (84-120) |
| `/gateway/src/socketio/MeeshySocketIOManager.ts` | WEBSOCKET SERVEUR | initialize() + event listeners |
| `/apps/web/services/meeshy-socketio.service.ts` | WEBSOCKET CLIENT | sendMessage() + event listeners |

---

## Flux données pour chaque opération

### ENVOYER UN MESSAGE

```
1️⃣  FRONTEND
    └─ useSocketIOMessaging().sendMessage(content)
        └─ meeshySocketIOService.sendMessage()
            └─ socket.emit('message:send', { content, conversationId })

2️⃣  GATEWAY
    └─ on('message:send', async (data, callback) => {
        ├─ MessagingService.handleMessage()
        │   ├─ Authentifier utilisateur
        │   ├─ Valider message
        │   ├─ Insérer en BD
        │   └─ Enqueue traduction
        ├─ callback({ success: true })
        └─ io.to(`conversation:${convId}`).emit('message:new', message)

3️⃣  TOUS LES CLIENTS
    └─ socket.on('message:new', (message) => {
        ├─ setMessages([...messages, message])
        └─ <BubbleMessage message={message} />
```

### REJOINDRE CONVERSATION

```
1️⃣  FRONTEND
    └─ useSocketIOMessaging({ conversationId })
        └─ meeshySocketIOService.joinConversation(conversationId)
            └─ socket.emit('conversation:join', { conversationId })

2️⃣  GATEWAY
    └─ on('conversation:join', (data) => {
        ├─ socket.join(`conversation:${data.conversationId}`)
        ├─ Charger historique messages
        └─ io.to(`conversation:${id}`).emit('conversation:joined', ...)

3️⃣  FRONTEND
    └─ socket.on('conversation:joined', () => {
        └─ Charger messages via REST API
            └─ GET /conversations/:id/messages
```

### ÉDITER TEXTE TRADUIT

```
1️⃣  FRONTEND
    └─ BubbleMessage switch langage
        └─ onLanguageSwitch(messageId, 'en')
            └─ meeshySocketIOService.requestTranslation(messageId, 'en')
                └─ socket.emit('request_translation', ...)

2️⃣  GATEWAY
    └─ on('request_translation', (data) => {
        └─ TranslationService.translateMessage()
            └─ ZMQ → Translation Service

3️⃣  TRANSLATION SERVICE
    └─ Traduit message

4️⃣  GATEWAY
    └─ socket.emit('message:translation', {
        ├─ messageId
        └─ translations: [{ targetLanguage, translatedContent }]
    })

5️⃣  FRONTEND
    └─ socket.on('message:translation', (data) => {
        ├─ Ajouter traduction à state
        └─ BubbleMessage affiche
```

---

## Points d'intégration MLS - Vue détaillée

### Où faire l'intégration?

```
PHASE 1: Chiffrement côté client
  ├─ Fichier: /apps/web/services/message-encryption.service.ts (NOUVEAU)
  └─ Appel: Avant socket.emit('message:send')

PHASE 2: Gestion des clés
  ├─ Fichier: /gateway/src/services/MLSKeyManagementService.ts (NOUVEAU)
  └─ Appel: Lors création/modification conversation

PHASE 3: Déchiffrement côté gateway
  ├─ Fichier: /gateway/src/middleware/message-encryption.ts (NOUVEAU)
  └─ Appel: Dans MessagingService.handleMessage()

PHASE 4: Stockage sécurisé
  ├─ Fichier: /shared/schema.prisma (MODIFIER)
  └─ Ajouter: MLSGroupState, MLSKeyPackage, MLSCredential
```

### Intégration dans le flux existant

```
AVANT (flux actuel):
Client → message:send → Gateway → Validation → Message:new → Clients

APRÈS (avec MLS):
Client → [CHIFFRER] → message:send → Gateway → [VÉRIFIER SIG] → 
  Validation → [STOCKER CHIFFRÉ] → Message:new → 
  Clients → [DÉCHIFFRER] → Afficher

Point critique: Où intercepter?
  1. Chiffrement: AVANT emit() dans meeshySocketIOService
  2. Vérification: DÉBUT de MessagingService.handleMessage()
  3. Stockage: Nouveau champ encryptedContent dans BD
  4. Déchiffrement: Dans component BubbleMessage
```

---

## Checklist de compréhension

**✅ Comprendre l'architecture si vous pouvez répondre:**

1. Quels sont les 3 types d'événements Socket.IO?
   - CLIENT → SERVER: message:send, conversation:join, etc.
   - SERVER → CLIENT: message:new, message:edited, etc.
   - Bidirectionnels: typing:start/stop

2. Quel est le chemin d'un message du client au serveur?
   - Frontend emit → Socket.IO event → MessagingService → BD → Broadcast

3. Où se trouve la validation des messages?
   - MessagingService.validateMessage()
   - Et les permissions: MessagingService.checkPermissions()

4. Comment sont gérées les traductions?
   - TranslationService enqueue vers ZMQ
   - Puis broadcast message:translation aux clients

5. Quelle est la structure d'un Message en BD?
   - ObjectId, conversationId, senderId, content, originalLanguage, etc.

6. Quelle authentification pour anonymes?
   - Session token dans header x-session-token
   - AnonymousParticipant avec sessionToken unique

7. Où sont les événements Socket.IO définis?
   - /shared/types/socketio-events.ts (SERVER_EVENTS et CLIENT_EVENTS)

8. Comment une conversation crée une "room" Socket.IO?
   - MeeshySocketIOManager.joinConversation()
   - socket.join(`conversation:{conversationId}`)

9. Comment retrouver le code d'une feature?
   - Frontend UI → /components/common/BubbleMessage.tsx
   - Logique métier → /gateway/src/services/MessagingService.ts
   - API → /gateway/src/routes/messages.ts
   - Types → /shared/types/...ts

10. Où intégrer le chiffrement MLS?
    - Frontend: Avant socket.emit()
    - Backend: Dans MessagingService.handleMessage()
    - Stocker: Nouveau champ encryptedContent
    - Déchiffrer: Côté client dans React component

---

## Commandes utiles pour explorer

```bash
# Voir tous les événements Socket.IO
grep -n "SERVER_EVENTS\|CLIENT_EVENTS" /shared/types/socketio-events.ts

# Voir la structure Message en BD
grep -A 30 "^model Message" /shared/schema.prisma

# Voir flux d'authentification
grep -r "AuthenticationContext" /shared/types/

# Voir où MessagingService est utilisé
grep -r "MessagingService" /gateway/src --include="*.ts"

# Voir événements Socket.IO du frontend
grep -n "socket.emit\|socket.on" /apps/web/services/meeshy-socketio.service.ts

# Voir composants de messages
find /apps/web/components -name "*[Mm]essage*" -o -name "*[Bb]ubble*"

# Voir tests de messages
find /gateway -name "*test*" -o -name "*spec*" | grep -i message
```

---

## Dépannage rapide

**Q: Un message n'apparaît pas?**
A: Vérifier:
1. Client envoie event: `meeshy-socketio.service.ts` ligne ~200
2. Server traite: `MessagingService.handleMessage()` ligne 84
3. Broadcast: `MeeshySocketIOManager` método broadcast
4. Client affiche: `BubbleMessage.tsx` ligne ~80

**Q: Traduction ne marche pas?**
A: Vérifier:
1. TranslationService enqueue: `/gateway/src/services/TranslationService.ts`
2. ZMQ connection: Vérifier logs ZMQ
3. Event broadcast: `message:translation` event

**Q: Auth échoue?**
A: Vérifier:
1. Token présent: `authManager.getAuthToken()` (frontend)
2. Token valide: `createUnifiedAuthMiddleware()` (backend)
3. Header correct: `Authorization: Bearer <token>` ou `x-session-token`

**Q: Conversation room vide?**
A: Vérifier:
1. User rejoint room: `socket.join()` dans handler
2. ID normalisé: `normalizeConversationId()`
3. Broadcast à bon room: `io.to('conversation:...')`

