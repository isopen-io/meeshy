# iOS ↔ Webapp Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aligner l'app iOS avec les corrections récentes de la webapp : supprimer `isDeleted` redondant (convention `deletedAt` only), ajouter le listener socket `participant:role-updated`, et enrichir `APIMessageSender` avec les champs manquants.

**Architecture:** Les changements touchent 3 couches : SDK (models + sockets), App (ViewModels + Views), Tests. Chaque tâche est autonome et peut être commitée indépendamment.

**Tech Stack:** Swift 5.9, SwiftUI, Combine, Socket.IO, XCTest

---

### Task 1: Supprimer `isDeleted` de `APIMessage` — dériver de `deletedAt`

Le shared package a supprimé `isDeleted` de `SocketIOMessage` (convention : `deletedAt` nullable suffit). Le gateway n'envoie plus `isDeleted` pour les messages. L'iOS doit suivre.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:88-124` (APIMessage)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:260-264` (toMessage conversion)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:286-290` (MeeshyMessage)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:335-355` (MeeshyMessage init)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/MessageServiceTests.swift`

**Step 1: Update `APIMessage` — remove `isDeleted`, add `deletedAt`**

In `MessageModels.swift`, the `APIMessage` struct:
- Remove `public let isDeleted: Bool?` (line 97)
- Ensure `deletedAt` field exists (it may not — check, add if missing as `public let deletedAt: Date?`)
- Add computed `isDeleted`: `public var isDeleted: Bool { deletedAt != nil }`

```swift
// In APIMessage struct — REMOVE:
public let isDeleted: Bool?

// KEEP or ADD:
public let deletedAt: Date?

// ADD computed property:
public var isDeleted: Bool { deletedAt != nil }
```

**Step 2: Update `MeeshyMessage` — derive `isDeleted` from `deletedAt`**

In `CoreModels.swift`, the `MeeshyMessage` struct:
- Change `public var isDeleted: Bool = false` to a computed property
- Remove `isDeleted` from the init parameter list
- Adjust all init assignments accordingly

```swift
// In MeeshyMessage struct — REPLACE:
public var isDeleted: Bool = false
public var deletedAt: Date?

// WITH:
public var deletedAt: Date?
public var isDeleted: Bool { deletedAt != nil }
```

The init must remove the `isDeleted` parameter but keep `deletedAt`:
```swift
public init(..., deletedAt: Date? = nil, ...) {
    // Remove: self.isDeleted = isDeleted
    self.deletedAt = deletedAt
    ...
}
```

**Step 3: Update `toMessage()` conversion**

In `MessageModels.swift:260-264`, the `APIMessage.toMessage()` function:
```swift
// REPLACE:
isEdited: isEdited ?? false, isDeleted: isDeleted ?? false, replyToId: replyToId,

// WITH:
isEdited: isEdited ?? false, deletedAt: deletedAt, replyToId: replyToId,
```

Note: `deletedAt` is already a `Date?` on both sides, so direct assignment works.

**Step 4: Update app code that sets `isDeleted = true`**

Since `isDeleted` is now computed from `deletedAt`, all direct assignments must change:

In `ConversationSocketHandler.swift:210`:
```swift
// REPLACE:
delegate.messages[idx].isDeleted = true
delegate.messages[idx].content = ""

// WITH:
delegate.messages[idx].deletedAt = Date()
delegate.messages[idx].content = ""
```

In `ConversationViewModel.swift:845`:
```swift
// REPLACE:
messages[idx].isDeleted = true
messages[idx].content = ""

// WITH:
messages[idx].deletedAt = Date()
messages[idx].content = ""
```

In `ConversationViewModel.swift:854` (revert on failure):
```swift
// REPLACE:
messages[idx].isDeleted = false

// WITH:
messages[idx].deletedAt = nil
```

**Step 5: Update tests**

In `MessageModelsTests.swift:17`:
```swift
// CHANGE assertion to test computed property via deletedAt:
XCTAssertFalse(msg.isDeleted) // Still works — deletedAt is nil
```

In `MessageServiceTests.swift:29`:
```swift
// REMOVE isDeleted from the JSON stub or factory if it's a parameter
// The factory should use deletedAt: nil instead
```

In `ConversationViewModelTests.swift:125`:
```swift
// REMOVE isDeleted parameter from makeMessage factory
// Use deletedAt: Date() instead of isDeleted: true
```

In `ConversationViewModelTests.swift:349`:
```swift
// Change: XCTAssertTrue(sut.messages.first?.isDeleted ?? false)
// This still works since isDeleted is computed from deletedAt
```

In `ConversationViewModelTests.swift:361`:
```swift
// Change: XCTAssertFalse(sut.messages.first?.isDeleted ?? true)
// This still works since isDeleted is computed
```

In `ConversationSocketHandlerTests.swift:288`:
```swift
// XCTAssertTrue(delegate.messages[0].isDeleted) — still works (computed)
// But verify: delegate.messages[0].deletedAt is not nil
XCTAssertNotNil(delegate.messages[0].deletedAt)
```

In `ConversationSocketHandlerTests.swift:302`:
```swift
// XCTAssertFalse(delegate.messages[0].isDeleted) — still works (computed)
```

**Step 6: Build and test**

```bash
./apps/ios/meeshy.sh build
```

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift \
       apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift \
       apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
       packages/MeeshySDK/Tests/ \
       apps/ios/MeeshyTests/
git commit -m "refactor(ios): derive isDeleted from deletedAt, remove redundant boolean

Align with shared package convention: nullable DateTime? is sufficient.
isDeleted is now a computed property returning deletedAt != nil."
```

---

### Task 2: Ajouter listener socket `participant:role-updated`

Le gateway émet `participant:role-updated` quand un admin/mod change le rôle d'un participant. L'iOS n'a aucun listener pour cet événement — les changements de rôle ne se reflètent pas en temps réel.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` (event struct + publisher + listener)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` (subscribe)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift` (react to role changes)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/` (new event model test)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationSocketHandlerTests.swift`

**Step 1: Add event struct in MessageSocketManager.swift**

Add after `ReadStatusUpdateEvent` (around line 170):

```swift
// MARK: - Participant Role Updated Event Data

public struct ParticipantRoleUpdatedParticipantInfo: Decodable, Sendable {
    public let id: String
    public let role: String
    public let displayName: String
    public let userId: String?
}

public struct ParticipantRoleUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let newRole: String
    public let updatedBy: String
    public let participant: ParticipantRoleUpdatedParticipantInfo
}
```

This matches the gateway emit at `services/gateway/src/routes/conversations/participants.ts:693-698` and the shared type `ParticipantRoleUpdatedEventData` at `packages/shared/types/socketio-events.ts:529-541`.

**Step 2: Add publisher to protocol and class**

In `MessageSocketProviding` protocol (around line 214), add:
```swift
var participantRoleUpdated: PassthroughSubject<ParticipantRoleUpdatedEvent, Never> { get }
```

In `MessageSocketManager` class properties (after other publishers), add:
```swift
public let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
```

**Step 3: Add socket listener in `setupEventHandlers()`**

After the `read-status:updated` listener (around line 658), add:

```swift
// --- Participant role events ---

socket.on("participant:role-updated") { [weak self] data, _ in
    guard let self else { return }
    self.decode(ParticipantRoleUpdatedEvent.self, from: data) { [weak self] event in
        self?.participantRoleUpdated.send(event)
    }
}
```

**Step 4: Subscribe in ConversationSocketHandler**

In `ConversationSocketHandler.swift`, add a new subscription in `subscribe()` method (after read-status subscription):

```swift
// Participant role updated
socketManager.participantRoleUpdated
    .filter { $0.conversationId == convId }
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let delegate = self?.delegate else { return }
        delegate.handleParticipantRoleUpdated(
            participantId: event.participant.id,
            newRole: event.newRole
        )
    }
    .store(in: &cancellables)
```

**Step 5: Add handler in ConversationViewModel (the delegate)**

In `ConversationViewModel.swift`, add method:

```swift
func handleParticipantRoleUpdated(participantId: String, newRole: String) {
    // Update participant in the local list if present
    if let idx = participants.firstIndex(where: { $0.id == participantId }) {
        participants[idx].conversationRole = newRole.lowercased()
    }
}
```

Check if `ConversationViewModel` has a `participants` array — if it uses a different participant storage (e.g., via ParticipantsView's `@State`), adapt accordingly. The key is: when the event arrives, the participant's role in the local UI must be updated without a full refresh.

**Step 6: Update MockMessageSocketManager in tests**

In `apps/ios/MeeshyTests/Mocks/MockMessageSocketManager.swift`, add:
```swift
public let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
```

**Step 7: Build and test**

```bash
./apps/ios/meeshy.sh build
```

**Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift \
       apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift \
       apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
       apps/ios/MeeshyTests/
git commit -m "feat(ios): add participant:role-updated socket listener

Real-time role change updates are now reflected in ParticipantsView
without requiring a manual refresh."
```

---

### Task 3: Enrichir `APIMessageSender` avec les champs manquants

Le shared `SocketIOMessageSender` inclut `type`, `userId`, `firstName`, `lastName` mais l'iOS `APIMessageSender` n'a que `id`, `username`, `displayName`, `avatar`. Le gateway envoie ces champs dans `message:new` — l'iOS les ignore silencieusement.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:5-10` (APIMessageSender)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift`

**Step 1: Add missing fields to `APIMessageSender`**

```swift
public struct APIMessageSender: Decodable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let type: String?        // "user", "anonymous", "bot"
    public let userId: String?      // User.id (nil for anonymous)
    public let firstName: String?
    public let lastName: String?
}
```

These are all optional with no CodingKeys needed (camelCase matches JSON).

**Step 2: Build and test**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift \
       packages/MeeshySDK/Tests/
git commit -m "feat(sdk): add type, userId, firstName, lastName to APIMessageSender

Align with shared SocketIOMessageSender contract."
```

---

## Verification Checklist

After all tasks:

1. `./apps/ios/meeshy.sh build` — passes
2. `./apps/ios/meeshy.sh test` — passes (or only pre-existing failures)
3. No `isDeleted` stored boolean in SDK message models
4. `participant:role-updated` socket event handled in real-time
5. `APIMessageSender` has all fields from shared `SocketIOMessageSender`
6. Gateway contracts verified (no `isDeleted` in message responses, `participant:role-updated` emitted on role change)
