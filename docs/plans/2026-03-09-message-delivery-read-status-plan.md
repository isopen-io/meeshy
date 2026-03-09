# Message Delivery, Read Status & Media Consumption — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre fonctionnel le systeme de checkmarks (sent/delivered/read) end-to-end + tracking media (audio ecouté, video regardée) + presence en ligne.

**Architecture:** Cursor-based (ConversationReadCursor = source de verite). Le gateway enrichit l'event `read-status:updated` avec un `summary` (counts). Les clients appellent `mark-as-received` automatiquement sur `message:new` et `mark-as-read` quand la conversation est visible. Le SDK a deja le listener socket — il manque la subscription cote app iOS et le rendu cote web.

**Tech Stack:** TypeScript/Fastify (gateway), Swift/SwiftUI (iOS), React/Next.js (web), Socket.IO, Prisma/MongoDB

**Design doc:** `docs/plans/2026-03-09-message-delivery-read-status-design.md`

---

## Phase 1 — Fix Backend (prerequis)

### Task 1: Fix bug userId vs participantId dans mark-as-read/received

Le gateway passe `authContext.userId` (User.id) au service qui attend `participantId` (Participant.id). Les curseurs sont crees avec la mauvaise cle.

**Files:**
- Modify: `services/gateway/src/routes/message-read-status.ts:167-234` (mark-as-read)
- Modify: `services/gateway/src/routes/message-read-status.ts:241-308` (mark-as-received)
- Test: `services/gateway/src/__tests__/message-read-status.test.ts` (a creer)

**Step 1: Ecrire un test verifiant que mark-as-read utilise participantId**

```typescript
// services/gateway/src/__tests__/message-read-status.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('mark-as-read endpoint', () => {
  it('should resolve userId to participantId before calling service', async () => {
    // Setup: mock prisma.participant.findFirst to return { id: 'participant-123' }
    // Call: POST /conversations/:id/mark-as-read with userId 'user-456'
    // Assert: readStatusService.markMessagesAsRead called with 'participant-123', not 'user-456'
  });
});
```

**Step 2: Executer le test pour verifier qu'il echoue**

```bash
cd services/gateway && npx vitest run src/__tests__/message-read-status.test.ts
```
Expected: FAIL

**Step 3: Fix mark-as-read — resoudre userId → participantId**

```typescript
// services/gateway/src/routes/message-read-status.ts
// Ligne ~178-194: Remplacer le bloc existant

// Le membership check retourne deja le participant — reutiliser
const membership = await prisma.participant.findFirst({
  where: {
    conversationId,
    userId: userId,
    isActive: true
  },
  select: { id: true }  // <-- AJOUTER select id
});

if (!membership) {
  return reply.status(403).send({
    success: false,
    error: 'Accès non autorisé à cette conversation'
  });
}

// FIX: passer membership.id (participantId) au lieu de userId
await readStatusService.markMessagesAsRead(membership.id, conversationId);
```

**Step 4: Meme fix pour mark-as-received (lignes ~252-268)**

Meme pattern : `membership.id` au lieu de `userId`.

**Step 5: Executer le test pour verifier le fix**

```bash
cd services/gateway && npx vitest run src/__tests__/message-read-status.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add services/gateway/src/routes/message-read-status.ts services/gateway/src/__tests__/message-read-status.test.ts
git commit -m "fix(gateway): resolve userId to participantId in mark-as-read/received endpoints"
```

---

### Task 2: Enrichir ReadStatusUpdatedEventData avec summary

Le sender a besoin des counts pour mettre a jour ses checkmarks sans faire de REST call.

**Files:**
- Modify: `packages/shared/types/socketio-events.ts:335-340` (enrichir interface)
- Modify: `services/gateway/src/routes/message-read-status.ts:203-220,278-294` (enrichir emit)

**Step 1: Ajouter summary a ReadStatusUpdatedEventData**

```typescript
// packages/shared/types/socketio-events.ts — Remplacer lignes 335-340

/**
 * Données pour l'événement de mise à jour du statut de lecture
 */
export interface ReadStatusSummary {
  readonly totalMembers: number;
  readonly deliveredCount: number;
  readonly readCount: number;
}

export interface ReadStatusUpdatedEventData {
  readonly conversationId: string;
  readonly participantId: string;  // Renommé: était userId
  readonly type: 'read' | 'received';
  readonly updatedAt: Date;
  readonly summary: ReadStatusSummary;
}
```

**Step 2: Extraire la logique de calcul summary dans le service**

```typescript
// services/gateway/src/services/MessageReadStatusService.ts — Ajouter methode

/**
 * Calcule le summary de statut pour le dernier message d'une conversation
 * Utilisé pour enrichir l'event socket read-status:updated
 */
async getLatestMessageSummary(
  conversationId: string
): Promise<{ totalMembers: number; deliveredCount: number; readCount: number }> {
  const latestMessage = await this.prisma.message.findFirst({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, senderId: true }
  });

  if (!latestMessage) {
    return { totalMembers: 0, deliveredCount: 0, readCount: 0 };
  }

  const totalMembers = await this.prisma.participant.count({
    where: { conversationId, isActive: true, id: { not: latestMessage.senderId } }
  });

  const cursors = await this.prisma.conversationReadCursor.findMany({
    where: { conversationId, participantId: { not: latestMessage.senderId } },
    select: { lastDeliveredAt: true, lastReadAt: true }
  });

  const deliveredCount = cursors.filter(c =>
    c.lastDeliveredAt && c.lastDeliveredAt >= latestMessage.createdAt
  ).length;

  const readCount = cursors.filter(c =>
    c.lastReadAt && c.lastReadAt >= latestMessage.createdAt
  ).length;

  return { totalMembers, deliveredCount, readCount };
}
```

**Step 3: Utiliser le summary dans les broadcasts socket**

```typescript
// services/gateway/src/routes/message-read-status.ts
// Dans le bloc if (shouldShowReadReceipts) de mark-as-read (~ligne 203) :

if (shouldShowReadReceipts) {
  try {
    const summary = await readStatusService.getLatestMessageSummary(conversationId);
    const socketIOHandler = fastify.socketIOHandler;
    const socketIOManager = socketIOHandler.getManager();
    if (socketIOManager) {
      const room = ROOMS.conversation(conversationId);
      (socketIOManager as any).io.to(room).emit(SERVER_EVENTS.READ_STATUS_UPDATED, {
        conversationId,
        participantId: membership.id,  // FIX: était userId
        type: 'read',
        updatedAt: new Date(),
        summary
      });
    }
  } catch (socketError) {
    console.error('[MessageReadStatus] Erreur broadcast:', socketError);
  }
}
```

Meme pattern pour mark-as-received (type: 'received').

**Step 4: Build shared + gateway pour verifier compilation**

```bash
cd packages/shared && npm run build
cd services/gateway && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/shared/types/socketio-events.ts services/gateway/src/routes/message-read-status.ts services/gateway/src/services/MessageReadStatusService.ts
git commit -m "feat(gateway): enrich read-status:updated event with summary counts"
```

---

### Task 3: Presence — Heartbeat + connect/disconnect broadcast

**Files:**
- Modify: `services/gateway/src/socketio/handlers/StatusHandler.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts` (disconnect handler)

**Step 1: Ajouter heartbeat handler dans StatusHandler**

Le client envoie `heartbeat` toutes les 30s. Le gateway met a jour `lastActiveAt`.

```typescript
// Dans StatusHandler — ajouter handler
socket.on('heartbeat', async () => {
  try {
    const userId = socketToUser.get(socket.id);
    if (!userId) return;

    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: now }
    });
  } catch (error) {
    // Silent — heartbeat failure is not critical
  }
});
```

**Step 2: Sur socket connect (authenticate success), broadcast user:status online**

Verifier dans `MeeshySocketIOManager.ts` que l'event `user:status` est emis quand un user se connecte. Si pas le cas, ajouter :

```typescript
// Apres authentication success
await prisma.user.update({
  where: { id: userId },
  data: { isOnline: true, lastActiveAt: new Date() }
});

// Broadcast aux conversations de l'utilisateur
const participations = await prisma.participant.findMany({
  where: { userId, isActive: true },
  select: { conversationId: true }
});

for (const p of participations) {
  io.to(ROOMS.conversation(p.conversationId)).emit(SERVER_EVENTS.USER_STATUS, {
    userId,
    username: user.username,
    isOnline: true,
    lastActiveAt: new Date()
  });
}
```

**Step 3: Sur socket disconnect, broadcast user:status offline**

```typescript
// Dans disconnect handler
await prisma.user.update({
  where: { id: userId },
  data: { isOnline: false, lastActiveAt: new Date() }
});

// Broadcast offline aux conversations
// Meme pattern que connect mais isOnline: false
```

**Step 4: Ajouter `HEARTBEAT` aux CLIENT_EVENTS**

```typescript
// packages/shared/types/socketio-events.ts — dans CLIENT_EVENTS
HEARTBEAT: 'heartbeat',
```

**Step 5: Commit**

```bash
git add services/gateway/src/socketio/ packages/shared/types/socketio-events.ts
git commit -m "feat(gateway): add heartbeat handler + presence broadcast on connect/disconnect"
```

---

## Phase 2 — SDK + iOS

### Task 4: Mettre a jour ReadStatusUpdateEvent dans le SDK

Le SDK a deja le listener (ligne 621-626 de MessageSocketManager.swift) et le publisher (ligne 264). Mais le struct `ReadStatusUpdateEvent` (ligne 152-157) n'a pas le `summary`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:152-157`

**Step 1: Enrichir ReadStatusUpdateEvent avec summary**

```swift
// Remplacer le struct existant (lignes 152-157)

public struct ReadStatusSummary: Decodable, Sendable {
    public let totalMembers: Int
    public let deliveredCount: Int
    public let readCount: Int
}

public struct ReadStatusUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let participantId: String  // Renommé: était userId
    public let type: String           // "read" | "received"
    public let updatedAt: Date
    public let summary: ReadStatusSummary
}
```

**ATTENTION** : Socket.IO envoie du camelCase natif JS. Pas de CodingKeys snake_case ici. Le struct Decodable sans CodingKeys decode correctement du camelCase.

**Step 2: Mettre a jour le listener socket pour utiliser le nouveau champ**

Verifier que le listener existant (lignes 621-626) decode correctement. Le `decode()` generique devrait fonctionner tel quel car le struct est Decodable.

**Step 3: Build SDK**

```bash
cd packages/MeeshySDK && swift build
```

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift
git commit -m "feat(sdk): enrich ReadStatusUpdateEvent with summary counts"
```

---

### Task 5: iOS — ConversationSocketHandler subscribe to readStatusUpdated

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:~200`

**Step 1: Ajouter subscription readStatusUpdated**

Apres les subscriptions existantes (messageReceived, messageEdited, etc.), ajouter :

```swift
// Dans subscribeToSocket(), apres les subscriptions existantes

socketManager.readStatusUpdated
    .filter { [weak self] event in
        event.conversationId == self?.conversationId
    }
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        self?.delegate?.handleReadStatusUpdate(event)
    }
    .store(in: &cancellables)
```

**Step 2: Ajouter methode au delegate protocol**

Le delegate de ConversationSocketHandler doit avoir une methode `handleReadStatusUpdate`. Trouver le protocol (probablement dans le meme fichier ou ConversationViewModel) et ajouter :

```swift
func handleReadStatusUpdate(_ event: ReadStatusUpdateEvent)
```

**Step 3: Build pour verifier**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift
git commit -m "feat(ios): subscribe to read-status:updated in ConversationSocketHandler"
```

---

### Task 6: iOS — ConversationViewModel handles read status updates

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift` (rendre deliveryStatus mutable)

**Step 1: Rendre Message.deliveryStatus mutable**

Dans `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift`, changer :
```swift
// De:
let deliveryStatus: DeliveryStatus
// A:
var deliveryStatus: DeliveryStatus
```

**Step 2: Implementer handleReadStatusUpdate dans ConversationViewModel**

```swift
func handleReadStatusUpdate(_ event: ReadStatusUpdateEvent) {
    let currentParticipantId = self.currentParticipantId
    guard !currentParticipantId.isEmpty else { return }

    let summary = event.summary
    for i in messages.indices {
        // Seulement les messages envoyes par le current user
        guard messages[i].senderId == currentParticipantId else { continue }

        let newStatus: Message.DeliveryStatus
        if summary.totalMembers > 0 && summary.readCount >= summary.totalMembers {
            newStatus = .read
        } else if summary.readCount > 0 {
            // Au moins 1 personne a lu → .read pour DM, .delivered pour group
            // En DM (totalMembers == 1), readCount >= 1 = read
            newStatus = summary.totalMembers == 1 ? .read : .delivered
        } else if summary.deliveredCount > 0 {
            newStatus = .delivered
        } else {
            continue  // Pas de changement
        }

        // Ne jamais regrader un statut
        if newStatus.rawValue > messages[i].deliveryStatus.rawValue {
            messages[i].deliveryStatus = newStatus
        }
    }
}
```

**IMPORTANT** : Verifier que `DeliveryStatus` a un rawValue ordonne. Actuellement c'est un `String` enum. Il faut ajouter un comparable ou un ordre :

```swift
// Dans CoreModels.swift (SDK) ou MessageModels.swift (app)
extension Message.DeliveryStatus: Comparable {
    private var order: Int {
        switch self {
        case .sending: return 0
        case .sent: return 1
        case .delivered: return 2
        case .read: return 3
        case .failed: return -1
        }
    }
    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.order < rhs.order
    }
}
```

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/Meeshy/Features/Main/Models/MessageModels.swift
git commit -m "feat(ios): handle read-status:updated events and update message checkmarks"
```

---

### Task 7: iOS — Auto mark-as-received sur message:new

Quand un `message:new` arrive, le recipient doit appeler `mark-as-received`.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` ou le handler global de messages

**Step 1: Trouver ou les messages:new sont recus globalement**

Le `mark-as-received` doit etre appele meme si l'utilisateur n'a pas la conversation ouverte. Chercher un handler global (probablement dans AppDelegate, ou un service qui ecoute tous les messages).

Si aucun handler global n'existe, l'ajouter dans `ConversationSocketHandler` pour les conversations ouvertes, et dans un handler global pour les notifications.

**Step 2: Appeler mark-as-received**

```swift
// Quand message:new arrive pour une conversation dont on est membre
private func markConversationAsReceived(_ conversationId: String) {
    Task {
        do {
            let _: APIResponse<EmptyData> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/mark-as-received",
                method: .post
            )
        } catch {
            // Enqueue for retry
            PendingStatusQueue.shared.enqueue(.init(
                conversationId: conversationId, type: "received", timestamp: Date()
            ))
        }
    }
}
```

**Step 3: Appeler mark-as-received dans le handler messageReceived**

```swift
// Dans le sink de socketManager.messageReceived
.sink { [weak self] message in
    guard let self else { return }
    // Existant: ajouter le message a la liste
    self.delegate?.didReceiveNewMessage(message)

    // NOUVEAU: marquer comme recu
    if message.senderId != self.currentParticipantId {
        self.markConversationAsReceived(message.conversationId)
    }
}
```

**Step 4: Build + Commit**

```bash
./apps/ios/meeshy.sh build
git commit -m "feat(ios): auto mark-as-received when message:new arrives"
```

---

### Task 8: iOS — Auto mark-as-read quand conversation visible

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` ou le ViewModel

**Step 1: Appeler mark-as-read dans onAppear de ConversationView**

```swift
// Dans ConversationView body, sur le .onAppear ou .task
.task {
    await viewModel.markConversationAsRead()
}
```

**Step 2: Implementer dans ConversationViewModel**

```swift
func markConversationAsRead() async {
    do {
        let _: APIResponse<EmptyData> = try await APIClient.shared.request(
            endpoint: "/conversations/\(conversationId)/mark-as-read",
            method: .post
        )
    } catch {
        // Non-critique, ne pas afficher d'erreur
    }
}
```

**Step 3: Aussi appeler quand on scroll vers le bas (nouveaux messages visibles)**

Si le scroll est deja en bas et qu'un nouveau message arrive, appeler `markConversationAsRead()` immediatement.

**Step 4: Build + Commit**

```bash
./apps/ios/meeshy.sh build
git commit -m "feat(ios): auto mark-as-read when conversation is visible"
```

---

### Task 9: iOS — Offline Queue pour status pending

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/PendingStatusQueue.swift`

**Step 1: Creer PendingStatusQueue**

```swift
import Foundation
import MeeshySDK

final class PendingStatusQueue {
    static let shared = PendingStatusQueue()
    private let key = "meeshy_pending_status_actions"
    private let maxActions = 100

    struct PendingAction: Codable {
        let conversationId: String
        let type: String  // "read" | "received"
        let timestamp: Date
    }

    func enqueue(_ action: PendingAction) {
        var actions = load()
        actions.append(action)
        if actions.count > maxActions {
            actions = Array(actions.suffix(maxActions))
        }
        save(actions)
    }

    func flush() async {
        let actions = load()
        guard !actions.isEmpty else { return }

        var remaining: [PendingAction] = []
        for action in actions {
            let endpoint = action.type == "read"
                ? "/conversations/\(action.conversationId)/mark-as-read"
                : "/conversations/\(action.conversationId)/mark-as-received"
            do {
                let _: APIResponse<EmptyData> = try await APIClient.shared.request(
                    endpoint: endpoint, method: .post
                )
            } catch {
                remaining.append(action)
            }
        }
        save(remaining)
    }

    private func load() -> [PendingAction] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let actions = try? JSONDecoder().decode([PendingAction].self, from: data) else {
            return []
        }
        return actions
    }

    private func save(_ actions: [PendingAction]) {
        let data = try? JSONEncoder().encode(actions)
        UserDefaults.standard.set(data, forKey: key)
    }
}
```

**Step 2: Appeler flush() au reconnect socket**

Dans le handler de reconnexion socket (probablement dans AppDelegate ou un service global) :

```swift
// Quand socket se reconnecte
Task { await PendingStatusQueue.shared.flush() }
```

**Step 3: Build + Commit**

```bash
./apps/ios/meeshy.sh build
git commit -m "feat(ios): add PendingStatusQueue for offline status resilience"
```

---

## Phase 3 — Web App

### Task 10: Web — mark-as-received sur message:new

**Files:**
- Modify: `apps/web/hooks/queries/use-socket-cache-sync.ts` ou le handler socket message:new

**Step 1: Trouver le handler socket message:new dans la web app**

Chercher ou `MESSAGE_NEW` est ecoute. Probablement dans un hook ou service.

**Step 2: Ajouter mark-as-received**

```typescript
// Apres reception du message:new
socket.on(SERVER_EVENTS.MESSAGE_NEW, async (message) => {
  // Existant: ajouter au cache/store
  // ...

  // NOUVEAU: marquer comme recu (sauf si c'est notre message)
  if (message.senderId !== currentUserId) {
    try {
      await fetch(`${API_URL}/conversations/${message.conversationId}/mark-as-received`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {
      // Non-critique
    }
  }
});
```

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): auto mark-as-received when message:new arrives"
```

---

### Task 11: Web — Store read-status + Checkmarks dans BubbleMessage

**Files:**
- Modify: `apps/web/stores/conversation-store.ts` (ajouter read status tracking)
- Modify: `apps/web/services/socketio/presence.service.ts` (utiliser le listener existant pour mettre a jour le store)
- Modify: `apps/web/components/common/bubble-message/BubbleMessageNormalView.tsx` (rendu checkmarks)

**Step 1: Ajouter read status summary au store**

```typescript
// apps/web/stores/conversation-store.ts
// Ajouter au state:
readStatusSummaries: Record<string, { totalMembers: number; deliveredCount: number; readCount: number }>;

// Action:
updateReadStatusSummary: (conversationId: string, summary: ReadStatusSummary) => void;
```

**Step 2: Connecter le listener socket au store**

Le listener dans `presence.service.ts:86-88` recoit deja les events. Le connecter au store :

```typescript
presenceService.onReadStatusUpdated((data) => {
  useConversationStore.getState().updateReadStatusSummary(
    data.conversationId,
    data.summary
  );
});
```

**Step 3: Ajouter les checkmarks dans BubbleMessageNormalView**

```tsx
// Checkmark component
function DeliveryCheckmarks({ summary, isOwnMessage }: {
  summary?: { totalMembers: number; deliveredCount: number; readCount: number };
  isOwnMessage: boolean;
}) {
  if (!isOwnMessage || !summary) return null;

  const { totalMembers, deliveredCount, readCount } = summary;

  if (readCount >= totalMembers && totalMembers > 0) {
    // Double check blue (read by all)
    return <DoubleCheck className="text-indigo-400" />;
  }
  if (deliveredCount > 0) {
    // Double check gray (delivered)
    return <DoubleCheck className="text-gray-400" />;
  }
  // Single check (sent)
  return <SingleCheck className="text-gray-400" />;
}
```

**Step 4: Build + Commit**

```bash
cd apps/web && npm run build
git commit -m "feat(web): add delivery checkmarks to message bubbles"
```

---

### Task 12: Web — Fetch initial read statuses au chargement conversation

Les messages charges par REST n'ont pas de statut. Faire un batch fetch au chargement.

**Files:**
- Modify: `apps/web/hooks/queries/` (le hook qui charge les messages)

**Step 1: Apres chargement des messages, fetcher les statuts**

```typescript
// Apres avoir charge les messages d'une conversation
const ownMessageIds = messages
  .filter(m => m.senderId === currentUserId)
  .map(m => m.id);

if (ownMessageIds.length > 0) {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}/read-statuses?messageIds=${ownMessageIds.join(',')}`
  );
  const data = await response.json();
  // Stocker dans le store
}
```

**Step 2: Commit**

```bash
git commit -m "feat(web): fetch initial read statuses when loading conversation messages"
```

---

## Phase 4 — Media Consumption

### Task 13: iOS — Tracking audio listened

**Files:**
- Modify: Le composant iOS qui joue les audios (AudioPlayerView ou similaire)

**Step 1: Trouver le composant audio player**

Chercher dans `apps/ios/` le composant qui gere la lecture audio des messages (probablement un `AudioBubbleView` ou `AudioPlayerView`).

**Step 2: Appeler attachment-status quand l'audio est joue**

```swift
// Quand l'utilisateur appuie sur play et ecoute
func onAudioPlayComplete(attachmentId: String, positionMs: Int, complete: Bool) {
    Task {
        try? await APIClient.shared.request(
            endpoint: "/attachments/\(attachmentId)/status",
            method: .post,
            body: [
                "action": "listened",
                "complete": complete,
                "positionMs": positionMs
            ]
        )
    }
}
```

**Step 3: Meme chose pour video**

```swift
func onVideoWatchProgress(attachmentId: String, positionMs: Int, durationMs: Int, complete: Bool) {
    Task {
        try? await APIClient.shared.request(
            endpoint: "/attachments/\(attachmentId)/status",
            method: .post,
            body: [
                "action": "watched",
                "complete": complete,
                "positionMs": positionMs,
                "durationMs": durationMs
            ]
        )
    }
}
```

**Step 4: Build + Commit**

```bash
./apps/ios/meeshy.sh build
git commit -m "feat(ios): track audio listened and video watched via attachment-status API"
```

---

### Task 14: Web — Tracking audio/video consumption

**Files:**
- Modify: Web audio player component
- Modify: Web video player component

Meme pattern que iOS mais avec `fetch()` calls.

**Commit:**

```bash
git commit -m "feat(web): track audio listened and video watched via attachment-status API"
```

---

## Phase 5 — Cleanup & Verification

### Task 15: iOS — Heartbeat client

**Files:**
- Modify: Le service socket iOS qui gere la connexion

**Step 1: Envoyer heartbeat toutes les 30s**

```swift
// Dans le socket manager ou AppDelegate apres connexion
private var heartbeatTimer: Timer?

func startHeartbeat() {
    heartbeatTimer?.invalidate()
    heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
        self?.socket.emit("heartbeat")
    }
}

func stopHeartbeat() {
    heartbeatTimer?.invalidate()
    heartbeatTimer = nil
}
```

**Commit:**

```bash
git commit -m "feat(ios): add 30s heartbeat for online presence"
```

---

### Task 16: Verification end-to-end

**Verifier avec 2 utilisateurs (atabeth + jcharlesnm):**

1. User A envoie message → 1 check (sent) ✓
2. User B est en ligne → User A voit 2 checks gris (delivered) ✓
3. User B ouvre la conversation → User A voit 2 checks bleus (read) ✓
4. User B ecoute un audio → MessageDetailSheet montre "Ecouté" ✓
5. Deconnecter User B → Reconnecter → Statuts pending flushes ✓
6. Web: memes checkmarks visibles ✓

**Test commands:**

```bash
# Gateway running
cd services/gateway && npm run dev

# iOS
./apps/ios/meeshy.sh run

# Web
cd apps/web && npm run dev
```

---

### Task 17: Script de migration — Fix curseurs orphelins

Les curseurs existants ont potentiellement `participantId = userId` (bug fixe dans Task 1). Creer un script de migration.

**Files:**
- Create: `scripts/fix-orphan-cursors.ts`

```typescript
// Script one-shot pour corriger les curseurs orphelins
// Pour chaque ConversationReadCursor:
//   Si participantId ne correspond a aucun Participant.id:
//     Chercher Participant par userId = cursor.participantId + conversationId
//     Si trouve: update cursor.participantId = participant.id
//     Sinon: supprimer le cursor orphelin
```

**Commit:**

```bash
git commit -m "fix(scripts): migration script to fix orphan read cursors from userId/participantId bug"
```

---

## Coherence Verification Checklist

A chaque task, verifier :

- [ ] Les types shared (`socketio-events.ts`, `message-types.ts`) matchent le gateway emit
- [ ] Le SDK decode le meme format que le gateway emit (camelCase, pas snake_case)
- [ ] L'iOS utilise `Participant.id` (pas `User.id`) pour le senderId
- [ ] Le web utilise le meme format de summary que le store attend
- [ ] Les REST endpoints utilisent `participantId` resolu (pas `userId` brut)
- [ ] Les dates sont en ISO8601 (gateway `new Date()` → Socket.IO serialise en string → iOS `ISO8601DateFormatter`)
- [ ] Le `DeliveryStatus` ne regresse jamais (sent → delivered → read, jamais l'inverse)
