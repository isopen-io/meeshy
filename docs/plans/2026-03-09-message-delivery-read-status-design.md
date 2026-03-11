# Message Delivery, Read Status & Media Consumption — Design

**Date**: 2026-03-09
**Scope**: Gateway + Web App + iOS App + MeeshySDK
**Goal**: Systeme fonctionnel end-to-end de statuts de livraison, lecture, et consommation media (WhatsApp-style + detail per-user + tracking audio/video)

---

## 1. Etat Actuel — Audit des Incoherences

### 1.1 Champs morts sur Message

Les champs suivants existent dans `schema.prisma` (model Message) et dans `GatewayMessage` (`message-types.ts:118-128`) mais ne sont **JAMAIS mis a jour** par le gateway :

| Champ | Schema | GatewayMessage | Gateway update | Verdict |
|-------|--------|---------------|----------------|---------|
| `deliveredToAllAt` | `DateTime?` | `readonly Date?` | JAMAIS | MORT |
| `receivedByAllAt` | `DateTime?` | `readonly Date?` | JAMAIS | MORT |
| `readByAllAt` | `DateTime?` | `readonly Date?` | JAMAIS | MORT |
| `deliveredCount` | `Int @default(0)` | `readonly number?` | JAMAIS | MORT |
| `readCount` | `Int @default(0)` | `readonly number?` | JAMAIS | MORT |

**`MessageReadStatusService.updateMessageComputedStatus()`** (ligne 966-970) est un no-op explicite.

**Decision**: Supprimer ces champs du schema Message et de GatewayMessage. Les statuts sont calcules dynamiquement via `ConversationReadCursor`. L'event socket enrichi fournira un `summary` pour eviter les REST calls.

### 1.2 Socket Event `ReadStatusUpdatedEventData` — Trop maigre

**Actuel** (`socketio-events.ts:335-340`) :
```typescript
interface ReadStatusUpdatedEventData {
  conversationId: string;
  userId: string;          // participantId qui a lu/recu
  type: 'read' | 'received';
  updatedAt: Date;
}
```

**Probleme** : Le sender recoit cet event mais ne sait pas combien de personnes au total ont lu/recu. Il devrait refaire un GET `/read-statuses` pour mettre a jour ses checkmarks → latence, surcharge.

**Decision**: Enrichir avec un `summary` :
```typescript
interface ReadStatusUpdatedEventData {
  conversationId: string;
  userId: string;
  type: 'read' | 'received';
  updatedAt: Date;
  summary: {
    totalMembers: number;
    deliveredCount: number;
    readCount: number;
  };
}
```

### 1.3 `SocketIOMessage` vs `GatewayMessage` — Desalignement

**`SocketIOMessage`** (`socketio-events.ts:760-775`) n'a PAS les champs de statut. C'est le type emis par `message:new`. Le client recoit un message sans aucune info de statut.

**Decision**: Ne pas ajouter de statut a `SocketIOMessage`. Un message fraichement cree a toujours `deliveredCount=0, readCount=0`. Le client infere `.sent` quand il recoit le message:new callback.

### 1.4 Gateway — `mark-as-read` utilise `userId` au lieu de `participantId`

**Bug critique** (`message-read-status.ts:194`) :
```typescript
await readStatusService.markMessagesAsRead(userId, conversationId);
```

Mais `MessageReadStatusService.markMessagesAsRead()` attend un **`participantId`** (ligne 219). Le `userId` passe est celui de `authContext.userId` (User.id), pas `Participant.id`.

Le `ConversationReadCursor` utilise `participantId` comme cle. Si on passe `userId` la ou `participantId` est attendu, le cursor sera cree avec une mauvaise cle → les lookups par `participantId` ne le trouveront jamais.

**Verification** : Le schema Prisma a `@@unique([conversationId, participantId], name: "conversation_participant_cursor")`. Si `userId != participantId`, les curseurs sont orphelins.

**Decision**: Le gateway doit d'abord resoudre `userId → participantId` via `Participant.findFirst({ where: { userId, conversationId } })` puis passer le `participantId` au service. Verifier que le code existant ne cree pas deja des curseurs orphelins.

### 1.5 iOS — 5 maillons casses

| # | Maillon | Fichier | Probleme |
|---|---------|---------|----------|
| 1 | `MessageSocketManager` n'ecoute pas `read-status:updated` | `MessageSocketManager.swift` | Aucun listener |
| 2 | `ConversationViewModel` n'appelle jamais `mark-as-read/received` | `ConversationViewModel.swift` | Aucun REST call |
| 3 | `Message.deliveryStatus` est fige a la conversion | `MessageModels.swift:136-141` | Calcule une fois, jamais recalcule |
| 4 | `ThemedMessageBubble` depend de `deliveryStatus` statique | `ThemedMessageBubble.swift:931-965` | Affichage correct mais donnees mortes |
| 5 | Pas de `mark-as-received` sur `message:new` | — | Le recipient ne signale jamais la reception |

### 1.6 Web App — Listeners existent, rendu manque

| Composant | Etat | Fichier |
|-----------|------|---------|
| Socket listener `read-status:updated` | Existe | `presence.service.ts:85-88` |
| `mark-as-read` au scroll bottom | Existe | `ConversationLayout.tsx:390-429` |
| `mark-as-read` apres envoi | Existe | `ConversationLayout.tsx:515-527` |
| Checkmarks visuels | **ABSENT** | `BubbleMessage.tsx` accepte `readStatus` prop mais ne rend rien |
| `mark-as-received` sur `message:new` | **ABSENT** | — |
| Presence online indicator | Socket listener existe, affichage minimal | `presence.service.ts:45-46` |

---

## 2. Architecture Cible

### 2.1 Flux de Statut — Diagramme

```
SENDER                          GATEWAY                         RECIPIENT
  |                                |                                |
  |-- message:send --------------->|                                |
  |<- message:sent (callback) -----|-- message:new ---------------->|
  |   deliveryStatus = .sent       |                                |
  |                                |<-- POST mark-as-received ------|
  |                                |    (auto, sur message:new)     |
  |                                |--- compute summary ----------->|
  |<- read-status:updated ---------|    {type:'received',           |
  |   {summary:{delivered:1...}}   |     summary:{...}}             |
  |   deliveryStatus = .delivered  |                                |
  |                                |                                |
  |                                |<-- POST mark-as-read ----------|
  |                                |    (auto, conversation visible)|
  |                                |--- compute summary ----------->|
  |<- read-status:updated ---------|    {type:'read',               |
  |   {summary:{read:1...}}        |     summary:{...}}             |
  |   deliveryStatus = .read       |                                |
```

### 2.2 Source de Verite

`ConversationReadCursor` reste la source de verite unique :
- `lastDeliveredAt` + `lastDeliveredMessageId` → reception
- `lastReadAt` + `lastReadMessageId` → lecture
- Status calcule dynamiquement : `cursor.lastReadAt >= message.createdAt` → lu

### 2.3 Event Socket Enrichi

```typescript
// socketio-events.ts — ReadStatusUpdatedEventData (v2)
interface ReadStatusUpdatedEventData {
  readonly conversationId: string;
  readonly userId: string;           // participantId qui a lu/recu
  readonly type: 'read' | 'received';
  readonly updatedAt: Date;
  readonly summary: {
    readonly totalMembers: number;     // participants - sender
    readonly deliveredCount: number;   // cursor.lastDeliveredAt >= msg.createdAt
    readonly readCount: number;        // cursor.lastReadAt >= msg.createdAt
  };
}
```

Le `summary` est calcule par le gateway AVANT broadcast :
1. Recuperer le dernier message de la conversation
2. Compter les curseurs ou `lastDeliveredAt >= message.createdAt`
3. Compter les curseurs ou `lastReadAt >= message.createdAt`
4. Compter les participants actifs (- sender)

### 2.4 Attachment Status Event Enrichi

```typescript
// socketio-events.ts — AttachmentStatusUpdatedEventData (v2)
interface AttachmentStatusUpdatedEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly action: 'viewed' | 'listened' | 'watched' | 'downloaded';
  readonly progress?: {
    readonly positionMs: number;
    readonly durationMs: number;
    readonly complete: boolean;
  };
  readonly updatedAt: Date;
}
```

---

## 3. Modifications par Couche

### 3.1 Gateway

#### 3.1.1 Fix Bug `userId` vs `participantId`

Dans `message-read-status.ts`, les endpoints `mark-as-read` (ligne 194) et `mark-as-received` (ligne 268) passent `userId` au service. Corriger :

```typescript
// Avant (BUG)
await readStatusService.markMessagesAsRead(userId, conversationId);

// Apres (FIX)
const participant = await prisma.participant.findFirst({
  where: { userId, conversationId, isActive: true },
  select: { id: true }
});
if (!participant) return reply.status(403).send({ success: false, error: 'Non membre' });
await readStatusService.markMessagesAsRead(participant.id, conversationId);
```

#### 3.1.2 Enrichir le broadcast `READ_STATUS_UPDATED`

Apres `markMessagesAsRead/Received`, calculer le summary AVANT d'emettre :

```typescript
const latestMessage = await prisma.message.findFirst({
  where: { conversationId, deletedAt: null },
  orderBy: { createdAt: 'desc' },
  select: { createdAt: true, senderId: true }
});

const totalMembers = await prisma.participant.count({
  where: { conversationId, isActive: true }
}) - 1; // - sender

const cursors = await prisma.conversationReadCursor.findMany({
  where: { conversationId, participantId: { not: latestMessage.senderId } }
});

const deliveredCount = cursors.filter(c =>
  c.lastDeliveredAt && c.lastDeliveredAt >= latestMessage.createdAt
).length;
const readCount = cursors.filter(c =>
  c.lastReadAt && c.lastReadAt >= latestMessage.createdAt
).length;

io.to(room).emit(SERVER_EVENTS.READ_STATUS_UPDATED, {
  conversationId, userId: participant.id, type, updatedAt: new Date(),
  summary: { totalMembers, deliveredCount, readCount }
});
```

#### 3.1.3 Supprimer les champs morts du Message model

Dans `schema.prisma`, retirer du model Message :
- `deliveredToAllAt`, `receivedByAllAt`, `readByAllAt`
- `deliveredCount`, `readCount`

Et `updateMessageComputedStatus()` (deja no-op).

#### 3.1.4 Presence Heartbeat

Ajouter un handler socket `heartbeat` :
- Client envoie un ping toutes les 30s
- Gateway met a jour `User.lastActiveAt` et `Participant.lastActiveAt`
- Sur socket disconnect : `User.isOnline = false`, broadcast `user:status`
- Sur socket connect/authenticate : `User.isOnline = true`, broadcast `user:status`

### 3.2 Shared Types

#### 3.2.1 `socketio-events.ts`

- Enrichir `ReadStatusUpdatedEventData` avec `summary`
- Ajouter type `AttachmentStatusUpdatedEventData` (formellement)
- Ajouter `CLIENT_EVENTS.HEARTBEAT: 'heartbeat'`

#### 3.2.2 `message-types.ts`

- Retirer de `GatewayMessage` : `deliveredToAllAt`, `receivedByAllAt`, `readByAllAt`, `deliveredCount`, `readCount`
- Garder `statusEntries` (pour fetch on-demand dans detail view)

### 3.3 MeeshySDK

#### 3.3.1 `MessageSocketManager`

Ajouter listener + publisher Combine :
```swift
// Nouveaux publishers
public let readStatusUpdatedPublisher = PassthroughSubject<ReadStatusUpdate, Never>()
public let attachmentStatusUpdatedPublisher = PassthroughSubject<AttachmentStatusUpdate, Never>()

// Listener
socket.on("read-status:updated") { [weak self] data, _ in
    // Decoder ReadStatusUpdate (sans CodingKeys snake_case !)
    self?.readStatusUpdatedPublisher.send(update)
}
```

**ATTENTION CodingKeys** : Socket.IO envoie du camelCase natif JS. NE PAS reutiliser de struct REST avec CodingKeys snake_case.

#### 3.3.2 Nouveaux modeles SDK

```swift
public struct ReadStatusUpdate: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let type: String  // "read" | "received"
    public let updatedAt: Date
    public let summary: ReadStatusSummary
}

public struct ReadStatusSummary: Decodable, Sendable {
    public let totalMembers: Int
    public let deliveredCount: Int
    public let readCount: Int
}

public struct AttachmentStatusUpdate: Decodable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let action: String  // "viewed" | "listened" | "watched" | "downloaded"
    public let progress: AttachmentProgress?
    public let updatedAt: Date
}

public struct AttachmentProgress: Decodable, Sendable {
    public let positionMs: Int
    public let durationMs: Int
    public let complete: Bool
}
```

#### 3.3.3 `APIMessage` — Retirer les champs morts

Retirer de `APIMessage` :
- `deliveredToAllAt`, `readByAllAt`, `deliveredCount`, `readCount`

### 3.4 iOS App

#### 3.4.1 `ConversationViewModel` — Ecouter et reagir

```swift
// Nouveaux publishers a observer
private var readStatusCancellable: AnyCancellable?

// Dans init ou setupSubscriptions :
readStatusCancellable = MessageSocketManager.shared.readStatusUpdatedPublisher
    .filter { $0.conversationId == self.conversationId }
    .receive(on: DispatchQueue.main)
    .sink { [weak self] update in
        self?.handleReadStatusUpdate(update)
    }

func handleReadStatusUpdate(_ update: ReadStatusUpdate) {
    // Recalculer deliveryStatus pour les messages du currentUser
    let currentParticipantId = self.currentParticipantId
    for i in messages.indices {
        guard messages[i].senderId == currentParticipantId else { continue }
        let newStatus: DeliveryStatus
        if update.summary.readCount >= update.summary.totalMembers {
            newStatus = .read
        } else if update.summary.deliveredCount >= update.summary.totalMembers {
            newStatus = .delivered
        } else if update.summary.deliveredCount > 0 {
            newStatus = .delivered
        } else {
            newStatus = .sent
        }
        messages[i].deliveryStatus = newStatus
    }
}
```

#### 3.4.2 Mark-as-received automatique

Quand un `message:new` arrive pour une conversation dont l'utilisateur est membre :
```swift
// Dans ConversationListViewModel ou AppDelegate/socket handler
messageSocketManager.messageReceivedPublisher
    .sink { message in
        Task {
            try? await APIClient.shared.post(
                endpoint: "/conversations/\(message.conversationId)/mark-as-received"
            )
        }
    }
```

#### 3.4.3 Mark-as-read automatique

Quand la ConversationView est visible :
```swift
// Dans ConversationView.onAppear ou ConversationViewModel
func markConversationAsRead() {
    Task {
        try? await APIClient.shared.post(
            endpoint: "/conversations/\(conversationId)/mark-as-read"
        )
    }
}
```

#### 3.4.4 `Message.deliveryStatus` — Devenir mutable

Changer `deliveryStatus` de `let` a `var` dans le struct Message pour permettre la mise a jour reactive.

#### 3.4.5 Offline Queue

```swift
class PendingStatusQueue {
    static let shared = PendingStatusQueue()
    private let key = "pending_status_actions"

    struct PendingAction: Codable {
        let conversationId: String
        let type: String  // "read" | "received"
        let timestamp: Date
    }

    func enqueue(_ action: PendingAction) { /* UserDefaults */ }
    func flush() async { /* POST each, remove on success */ }
}
```

Flush au reconnect socket.

#### 3.4.6 Media Consumption Tracking

Quand l'utilisateur ecoute un audio ou regarde une video, appeler :
```swift
// Audio play complete
try? await APIClient.shared.post(
    endpoint: "/attachments/\(attachmentId)/status",
    body: ["action": "listened", "complete": true, "positionMs": position]
)

// Video watch
try? await APIClient.shared.post(
    endpoint: "/attachments/\(attachmentId)/status",
    body: ["action": "watched", "positionMs": position, "complete": complete]
)
```

### 3.5 Web App

#### 3.5.1 Checkmarks dans `BubbleMessage`

Le composant accepte deja `readStatus` prop. Ajouter le rendu :
- 1 check gris = sent
- 2 checks gris = delivered (au moins 1 recipient)
- 2 checks bleus (indigo-400) = read par tous

#### 3.5.2 `mark-as-received` sur `message:new`

Dans le handler socket `message:new`, appeler automatiquement :
```typescript
await messagesService.markAsReceived(message.conversationId);
```

#### 3.5.3 Store de statut

Ajouter au conversation store ou creer un `read-status-store` :
```typescript
readStatusSummaries: Map<string, { deliveredCount: number; readCount: number; totalMembers: number }>
```

Mis a jour via le listener `read-status:updated` existant.

#### 3.5.4 Presence enrichie

Utiliser le listener `user:status` existant pour afficher des indicateurs online dans :
- Liste des conversations (dot vert sur avatar)
- Header de conversation (statut sous le nom)

---

## 4. Verification de Coherence des Interfaces

### 4.1 Event `read-status:updated` — Coherence cross-stack

| Champ | `socketio-events.ts` | Gateway emit | iOS decode | Web decode |
|-------|---------------------|-------------|-----------|-----------|
| `conversationId` | `string` | `string` | `String` | `string` |
| `userId` | `string` | `participant.id` | `String` | `string` |
| `type` | `'read' \| 'received'` | `string` literal | `String` | `string` |
| `updatedAt` | `Date` | `new Date()` | `Date` (ISO8601) | `Date` |
| `summary.totalMembers` | `number` | `number` | `Int` | `number` |
| `summary.deliveredCount` | `number` | `number` | `Int` | `number` |
| `summary.readCount` | `number` | `number` | `Int` | `number` |

**Risque iOS** : Socket.IO envoie les dates en ISO8601 string. Le decoder Swift doit utiliser `ISO8601DateFormatter` ou `JSONDecoder` avec `.iso8601` strategy. Verifier que le SDK utilise le bon decoder.

### 4.2 REST Endpoints — Coherence

| Endpoint | Param actuel | Param correct | Action |
|----------|-------------|--------------|--------|
| `POST /conversations/:id/mark-as-read` | `userId` | `participantId` (resolu depuis userId) | FIX |
| `POST /conversations/:id/mark-as-received` | `userId` | `participantId` (resolu depuis userId) | FIX |
| `GET /messages/:id/read-status` | OK | OK | AUCUNE |
| `GET /conversations/:id/read-statuses` | OK | OK | AUCUNE |

### 4.3 SDK `APIMessage` vs Backend Response

Apres suppression des champs morts, `APIMessage` n'aura plus `deliveredToAllAt`, `readByAllAt`, `deliveredCount`, `readCount`. Le `deliveryStatus` sera calcule cote client via les events socket, pas via l'API response.

**Migration**: Les messages charges par REST auront `deliveryStatus = .sent` par defaut. Le client doit appeler `GET /conversations/:id/read-statuses?messageIds=...` au chargement initial pour calculer les statuts corrects des messages visibles (pagination).

### 4.4 `Participant.id` vs `User.id`

| Contexte | ID utilise | Type |
|----------|-----------|------|
| `ConversationReadCursor.participantId` | `Participant.id` | Correct |
| `message-read-status.ts` endpoints | `authContext.userId` = `User.id` | **BUG** |
| `ReadStatusUpdatedEventData.userId` | Nom trompeur, devrait etre `participantId` | A clarifier |
| iOS `message.senderId` | `Participant.id` (unified) | Correct |

**Decision**: Renommer `userId` en `participantId` dans `ReadStatusUpdatedEventData` pour coherence. Le gateway resout `User.id → Participant.id` avant toute operation.

---

## 5. Plan de Migration

### Phase 1 — Fix Backend (prerequis)
1. Fix bug userId vs participantId dans mark-as-read/received
2. Enrichir `ReadStatusUpdatedEventData` avec `summary`
3. Ajouter presence heartbeat handler

### Phase 2 — SDK + iOS
4. Ajouter models + listener socket dans MeeshySDK
5. iOS: mark-as-received auto sur message:new
6. iOS: mark-as-read auto sur conversation visible
7. iOS: recalculer deliveryStatus sur read-status:updated
8. iOS: offline queue

### Phase 3 — Web App
9. Web: mark-as-received sur message:new
10. Web: store read-status + checkmarks dans BubbleMessage
11. Web: presence indicators

### Phase 4 — Media Consumption
12. iOS: tracking audio listened / video watched
13. Web: tracking audio listened / video watched
14. Gateway: broadcast attachment-status:updated enrichi

### Phase 5 — Cleanup
15. Supprimer champs morts de schema.prisma (Message model)
16. Supprimer de GatewayMessage et APIMessage
17. Migration Prisma

---

## 6. Risques et Mitigations

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Curseurs orphelins existants (bug userId/participantId) | Read counts incorrects | Script de migration pour corriger les curseurs existants |
| Suppression champs Message casse des clients | iOS/Web crash | Rendre optionnels d'abord, supprimer apres deploy clients |
| Socket event enrichi plus lourd | Latence reseau | Summary = 3 ints, negligeable |
| mark-as-received sur chaque message:new | Charge backend | Dedup cache 2s existe deja |
| Offline queue iOS deborde | Perte de statuts | Limite a 100 actions, FIFO |
