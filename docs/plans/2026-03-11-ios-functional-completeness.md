# iOS Functional Completeness — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Combler tous les gaps fonctionnels identifiés dans l'app iOS Meeshy pour la rendre pleinement fonctionnelle, en 3 phases parallélisées via git worktrees avec review, completion, et optimisation à chaque étape.

**Architecture:** Chaque phase lance N worktrees parallèles (fichiers exclusifs par worktree), chaque worktree suit le pipeline IMPLEMENT → CODE-REVIEW → COMPLETION → RE-REVIEW → COMMIT. Après merge de tous les worktrees d'une phase, un agent `ios-architect-expert` fait un pass d'optimisation senior. Les phases sont séquentielles : Phase 1 → merge → optimize → Phase 2 → merge → optimize → Phase 3 → merge → optimize.

**Tech Stack:** Swift 6, SwiftUI, Combine, Socket.IO (SocketIO-Client-Swift), CryptoKit, XCTest, GRDB

---

## Workflow par Worktree (chaque agent)

```
1. git worktree add ../v2_meeshy-{branch} -b {branch} dev
2. IMPLEMENT (TDD) : RED → GREEN → REFACTOR
3. ./apps/ios/meeshy.sh build (DOIT passer)
4. CODE-REVIEW : agent code-reviewer valide le diff
5. Fix issues trouvées
6. COMPLETION : agent explore les aspects négligés
   - Edge cases non couverts
   - Error handling manquant
   - Accessibility (VoiceOver, Dynamic Type)
   - Offline behavior
   - Memory leaks / retain cycles
   - Localization strings manquantes
   - Tests additionnels
7. ./apps/ios/meeshy.sh build (re-validation)
8. RE-REVIEW : code-reviewer re-valide
9. COMMIT FINAL
```

## Workflow d'intégration (entre phases)

```
1. Merge worktrees dans l'ordre défini (UI-only d'abord, SDK en dernier)
2. Après chaque merge : ./apps/ios/meeshy.sh build
3. Après TOUS les merges :
   a. Clean build complet
   b. Agent ios-architect-expert : optimization pass senior
   c. ./apps/ios/meeshy.sh build
   d. Tag phase-{N}-optimized
```

---

# PHASE 1 — Bloqueurs Critiques

**4 worktrees parallèles. Objectif : rendre l'app fonctionnelle end-to-end.**

---

## WT-1A: `feat/sdk-socket-completeness`

**Objectif:** Ajouter `sendWithAttachments()` (débloquer pipeline audio), handlers call signaling, events manquants, heartbeat SocialSocketManager.

**Fichiers exclusifs:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`

**Référence events:** `packages/shared/types/socketio-events.ts` (lines 59-189)

### Task 1: Add `sendWithAttachments()` to MessageSocketManager

**Context:** iOS sends audio via REST which does NOT trigger the Whisper→NLLB→Chatterbox pipeline. Only the WebSocket event `message:send-with-attachments` triggers it. The gateway's `MessageHandler.ts` listens for this event.

**Step 1: Add method to protocol `MessageSocketProviding`**

File: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

Add to `MessageSocketProviding` protocol (after existing `requestTranslation` method):

```swift
func sendWithAttachments(
    conversationId: String,
    content: String?,
    attachmentIds: [String],
    replyToId: String?,
    isEncrypted: Bool
)
```

**Step 2: Implement in `MessageSocketManager`**

Add implementation in the class body:

```swift
func sendWithAttachments(
    conversationId: String,
    content: String?,
    attachmentIds: [String],
    replyToId: String?,
    isEncrypted: Bool = false
) {
    let payload: [String: Any] = [
        "conversationId": conversationId,
        "content": content ?? "",
        "attachmentIds": attachmentIds,
        "replyToId": replyToId as Any,
        "isEncrypted": isEncrypted
    ].compactMapValues { $0 }

    socket?.emit("message:send-with-attachments", payload)
}
```

**Step 3: Wire in `ConversationView+AttachmentHandlers.swift`**

In `sendMessageWithAttachments()`, after successful TUS upload, call the socket method instead of (or in addition to) REST for audio attachments:

```swift
// After TUS upload completes and we have attachmentIds
if attachments.contains(where: { $0.mimeType?.hasPrefix("audio/") == true }) {
    socketManager.sendWithAttachments(
        conversationId: conversationId,
        content: messageText.isEmpty ? nil : messageText,
        attachmentIds: uploadedIds,
        replyToId: replyToMessageId,
        isEncrypted: false
    )
} else {
    // REST path for non-audio
    try await viewModel.sendMessage(content: messageText, attachmentIds: uploadedIds)
}
```

**Step 4: Build and verify**

```bash
cd ../v2_meeshy-feat-sdk-socket-completeness
./apps/ios/meeshy.sh build
```

### Task 2: Add call signaling event handlers to MessageSocketManager

**Context:** `CallManager.swift` subscribes to `NotificationCenter` posts (`.callOfferReceived`, etc.) but `MessageSocketManager` never posts them — the `call:*` socket events are not handled.

**Step 1: Add Combine publishers to `MessageSocketManager`**

Add to the class properties (alongside existing publishers like `messageReceived`):

```swift
let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
let callEnded = PassthroughSubject<CallEndData, Never>()
let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
let callError = PassthroughSubject<CallErrorData, Never>()
```

**Step 2: Define data structs**

Add at the top of the file (or in a new `CallSocketModels.swift` if preferred but that adds a file — keep in same file):

```swift
struct CallOfferData: Sendable {
    let callId: String
    let callerId: String
    let callerName: String
    let conversationId: String
    let sdp: String
    let isVideo: Bool
}

struct CallAnswerData: Sendable {
    let callId: String
    let answererId: String
    let sdp: String
}

struct CallICECandidateData: Sendable {
    let callId: String
    let senderId: String
    let candidate: String
    let sdpMLineIndex: Int32
    let sdpMid: String?
}

struct CallEndData: Sendable {
    let callId: String
    let reason: String?
}

struct CallParticipantData: Sendable {
    let callId: String
    let userId: String
    let username: String?
}

struct CallMediaToggleData: Sendable {
    let callId: String
    let userId: String
    let mediaType: String
    let enabled: Bool
}

struct CallErrorData: Sendable {
    let callId: String
    let error: String
}
```

**Step 3: Register handlers in `setupEventHandlers()`**

Add in `setupEventHandlers()` after existing event registrations:

```swift
socket.on("call:initiated") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String,
          let callerId = dict["callerId"] as? String,
          let callerName = dict["callerName"] as? String,
          let conversationId = dict["conversationId"] as? String,
          let sdp = dict["sdp"] as? String else { return }
    let isVideo = dict["isVideo"] as? Bool ?? false
    self?.callOfferReceived.send(CallOfferData(
        callId: callId, callerId: callerId, callerName: callerName,
        conversationId: conversationId, sdp: sdp, isVideo: isVideo
    ))
}

socket.on("call:signal") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String,
          let type = dict["type"] as? String else { return }

    if type == "answer", let sdp = dict["sdp"] as? String {
        let answererId = dict["senderId"] as? String ?? ""
        self?.callAnswerReceived.send(CallAnswerData(
            callId: callId, answererId: answererId, sdp: sdp
        ))
    } else if type == "ice-candidate",
              let candidate = dict["candidate"] as? String {
        let sdpMLineIndex = dict["sdpMLineIndex"] as? Int32 ?? 0
        let sdpMid = dict["sdpMid"] as? String
        let senderId = dict["senderId"] as? String ?? ""
        self?.callICECandidateReceived.send(CallICECandidateData(
            callId: callId, senderId: senderId,
            candidate: candidate, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid
        ))
    }
}

socket.on("call:ended") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String else { return }
    self?.callEnded.send(CallEndData(
        callId: callId, reason: dict["reason"] as? String
    ))
}

socket.on("call:participant-joined") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String,
          let userId = dict["userId"] as? String else { return }
    self?.callParticipantJoined.send(CallParticipantData(
        callId: callId, userId: userId, username: dict["username"] as? String
    ))
}

socket.on("call:participant-left") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String,
          let userId = dict["userId"] as? String else { return }
    self?.callParticipantLeft.send(CallParticipantData(
        callId: callId, userId: userId, username: dict["username"] as? String
    ))
}

socket.on("call:media-toggled") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String,
          let userId = dict["userId"] as? String,
          let mediaType = dict["mediaType"] as? String else { return }
    let enabled = dict["enabled"] as? Bool ?? false
    self?.callMediaToggled.send(CallMediaToggleData(
        callId: callId, userId: userId, mediaType: mediaType, enabled: enabled
    ))
}

socket.on("call:error") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let callId = dict["callId"] as? String,
          let error = dict["error"] as? String else { return }
    self?.callError.send(CallErrorData(callId: callId, error: error))
}
```

**Step 4: Add client emit methods for call actions**

```swift
func emitCallInitiate(conversationId: String, isVideo: Bool) {
    socket?.emit("call:initiate", [
        "conversationId": conversationId,
        "isVideo": isVideo
    ])
}

func emitCallJoin(callId: String) {
    socket?.emit("call:join", ["callId": callId])
}

func emitCallLeave(callId: String) {
    socket?.emit("call:leave", ["callId": callId])
}

func emitCallSignal(callId: String, type: String, payload: [String: Any]) {
    var data: [String: Any] = ["callId": callId, "type": type]
    data.merge(payload) { _, new in new }
    socket?.emit("call:signal", data)
}

func emitCallToggleAudio(callId: String, enabled: Bool) {
    socket?.emit("call:toggle-audio", ["callId": callId, "enabled": enabled])
}

func emitCallToggleVideo(callId: String, enabled: Bool) {
    socket?.emit("call:toggle-video", ["callId": callId, "enabled": enabled])
}

func emitCallEnd(callId: String) {
    socket?.emit("call:end", ["callId": callId])
}
```

**Step 5: Update protocol `MessageSocketProviding`**

Add all new publishers and emit methods to the protocol.

**Step 6: Wire CallManager to Combine publishers**

File: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`

Replace `NotificationCenter` subscriptions with direct Combine subscriptions to `MessageSocketManager.shared`:

```swift
private var cancellables = Set<AnyCancellable>()

private func setupSocketSubscriptions() {
    let socket = MessageSocketManager.shared

    socket.callOfferReceived
        .receive(on: DispatchQueue.main)
        .sink { [weak self] offer in
            self?.handleIncomingCall(offer)
        }
        .store(in: &cancellables)

    socket.callAnswerReceived
        .receive(on: DispatchQueue.main)
        .sink { [weak self] answer in
            self?.handleCallAnswer(answer)
        }
        .store(in: &cancellables)

    socket.callICECandidateReceived
        .receive(on: DispatchQueue.main)
        .sink { [weak self] candidate in
            self?.handleICECandidate(candidate)
        }
        .store(in: &cancellables)

    socket.callEnded
        .receive(on: DispatchQueue.main)
        .sink { [weak self] end in
            self?.handleCallEnded(end)
        }
        .store(in: &cancellables)

    socket.callMediaToggled
        .receive(on: DispatchQueue.main)
        .sink { [weak self] toggle in
            self?.handleMediaToggle(toggle)
        }
        .store(in: &cancellables)
}
```

**Step 7: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

### Task 3: Add missing server event handlers

**Step 1: Add `reaction:sync` handler in `setupEventHandlers()`**

```swift
socket.on("reaction:sync") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let messageId = dict["messageId"] as? String,
          let reactionsData = dict["reactions"] as? [[String: Any]] else { return }
    // Parse and publish full reaction state for message
    // This replaces the local reaction list entirely
    self?.reactionSynced.send((messageId, reactionsData))
}
```

Add publisher: `let reactionSynced = PassthroughSubject<(String, [[String: Any]]), Never>()`

**Step 2: Add `system:message` handler**

```swift
socket.on("system:message") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any] else { return }
    self?.systemMessageReceived.send(dict)
}
```

Add publisher: `let systemMessageReceived = PassthroughSubject<[String: Any], Never>()`

**Step 3: Add `attachment-status:updated` handler**

```swift
socket.on("attachment-status:updated") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let attachmentId = dict["attachmentId"] as? String,
          let status = dict["status"] as? String else { return }
    self?.attachmentStatusUpdated.send((attachmentId, status))
}
```

Add publisher: `let attachmentStatusUpdated = PassthroughSubject<(String, String), Never>()`

**Step 4: Add `mention:created` handler**

```swift
socket.on("mention:created") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any] else { return }
    self?.mentionCreated.send(dict)
}
```

Add publisher: `let mentionCreated = PassthroughSubject<[String: Any], Never>()`

### Task 4: Add heartbeat to SocialSocketManager

File: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift`

**Step 1: Add heartbeat timer property and start/stop methods**

Mirror the pattern from `MessageSocketManager.startHeartbeat()`:

```swift
private var heartbeatTimer: Timer?

private func startHeartbeat() {
    heartbeatTimer?.invalidate()
    heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
        self?.socket?.emit("heartbeat", ["timestamp": Date().timeIntervalSince1970])
    }
}

private func stopHeartbeat() {
    heartbeatTimer?.invalidate()
    heartbeatTimer = nil
}
```

**Step 2: Call `startHeartbeat()` on connect, `stopHeartbeat()` on disconnect**

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-1B: `feat/auth-completions`

**Objectif:** Extraire `changePassword()` dans `AuthService` et wirer correctement la vue.

**Fichiers exclusifs:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`

### Task 1: Add `changePassword()` to AuthService

**Step 1: Add method to AuthService**

File: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift`

```swift
func changePassword(currentPassword: String, newPassword: String) async throws {
    let body: [String: String] = [
        "currentPassword": currentPassword,
        "newPassword": newPassword
    ]
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/users/me/password",
        method: .patch,
        body: body
    )
}
```

**Step 2: Refactor ChangePasswordView to use AuthService**

File: `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`

Replace the inline `URLRequest` / `URLSession` call (around lines 335-350) with:

```swift
try await AuthService(apiClient: APIClient.shared).changePassword(
    currentPassword: currentPassword,
    newPassword: newPassword
)
```

**Step 3: Build and verify**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-1C: `feat/ui-error-states`

**Objectif:** Supprimer les fallbacks mock data, afficher les erreurs, ajouter des empty states.

**Fichiers exclusifs:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

### Task 1: Remove sample data fallback in StatusViewModel

File: `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift`

**Step 1: Find and remove `fallbackToSampleData()` or `sampleStatuses`**

Replace the fallback with an empty state:

```swift
// BEFORE (approximate):
// func fallbackToSampleData() { self.statuses = Self.sampleStatuses }

// AFTER:
// Remove the sampleStatuses array entirely
// In the catch block of loadStatuses():
catch {
    self.statuses = []
    self.error = error.localizedDescription
}
```

**Step 2: Add `@Published var error: String?` if not present**

### Task 2: Add error display and empty state in FeedView

File: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

**Step 1: Remove `FeedSampleData` struct and `_legacyPosts` dead code**

Delete the entire `FeedSampleData` struct (lines 9-37 approx) and any `_legacyPosts` computed var.

**Step 2: Add error banner when `viewModel.error` is non-nil**

In the view body, after the loading check:

```swift
if let error = viewModel.error {
    VStack(spacing: 12) {
        Image(systemName: "exclamationmark.triangle")
            .font(.largeTitle)
            .foregroundStyle(.secondary)
        Text(String(localized: "Impossible de charger le fil", defaultValue: "Impossible de charger le fil"))
            .font(.headline)
        Text(error)
            .font(.caption)
            .foregroundStyle(.secondary)
        Button(String(localized: "Reessayer", defaultValue: "Reessayer")) {
            Task { await viewModel.loadFeed() }
        }
        .buttonStyle(.bordered)
    }
    .padding()
}
```

**Step 3: Add empty state when `posts.isEmpty && !isLoading && error == nil`**

```swift
if viewModel.posts.isEmpty, !viewModel.isLoading, viewModel.error == nil {
    ContentUnavailableView {
        Label(
            String(localized: "Aucune publication", defaultValue: "Aucune publication"),
            systemImage: "text.bubble"
        )
    } description: {
        Text(String(localized: "Les publications de vos contacts apparaitront ici", defaultValue: "Les publications de vos contacts apparaitront ici"))
    }
}
```

### Task 3: Add error banner in ConversationView

File: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

**Step 1: Add inline error banner**

Find where `viewModel.error` is set but not rendered. Add an error banner overlay or inline view:

```swift
if let error = viewModel.error {
    HStack {
        Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(.yellow)
        Text(error)
            .font(.caption)
            .lineLimit(1)
        Spacer()
        Button {
            viewModel.error = nil
        } label: {
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(.secondary)
        }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(.ultraThinMaterial)
    .transition(.move(edge: .top).combined(with: .opacity))
}
```

### Task 4: Build and verify

```bash
./apps/ios/meeshy.sh build
```

---

## WT-1D: `feat/thread-reply-wiring`

**Objectif:** Wirer le reply composer de ThreadView à `MessageService.send()`.

**Fichiers exclusifs:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`

### Task 1: Wire reply send action

**Step 1: Read the current ThreadView** to understand the composer state

The ThreadView likely has a `@State var replyText: String` and a send button. The send button needs to call `MessageService.send()` with `replyToId` set to the parent message ID.

**Step 2: Add send reply logic**

```swift
private func sendReply() {
    let text = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }

    let conversationId = self.conversationId
    let parentId = self.parentMessage.id
    isSending = true

    Task {
        do {
            try await MessageService(apiClient: APIClient.shared).send(
                conversationId: conversationId,
                content: text,
                replyToId: parentId
            )
            await MainActor.run {
                replyText = ""
                isSending = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                isSending = false
            }
        }
    }
}
```

**Step 3: Wire button action to `sendReply()`**

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## Phase 1 — Merge Order & Integration

```bash
# Ordre: UI-only d'abord, SDK en dernier
git merge feat/thread-reply-wiring     # WT-1D (1 fichier app-only)
./apps/ios/meeshy.sh build

git merge feat/ui-error-states          # WT-1C (4 fichiers app-only)
./apps/ios/meeshy.sh build

git merge feat/auth-completions         # WT-1B (1 SDK + 1 app)
./apps/ios/meeshy.sh build

git merge feat/sdk-socket-completeness  # WT-1A (2 SDK + 2 app)
./apps/ios/meeshy.sh build

# Post-merge: iOS Senior Optimization Pass
# Agent ios-architect-expert reviews all Phase 1 changes
git tag phase-1-optimized
```

---

# PHASE 2 — Features Significatives

**5 worktrees parallèles. Basé sur `dev` post-Phase 1.**

---

## WT-2A: `feat/e2ee-persistence`

**Objectif:** Persister les clés de session E2EE dans le Keychain au lieu de la mémoire.

**Fichiers exclusifs:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/E2EEService.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift`

### Task 1: Persist session keys in Keychain

**Context:** `E2ESessionManager` stores `activeSessions: [String: SymmetricKey]` in memory only. On app restart, all sessions are lost and must re-ECDH.

**Step 1: Add Keychain persistence for session keys**

In `E2ESessionManager`, replace in-memory storage:

```swift
private let keychainPrefix = "com.meeshy.e2ee.session."

func persistSession(peerId: String, key: SymmetricKey) throws {
    let keyData = key.withUnsafeBytes { Data($0) }
    let keychainKey = keychainPrefix + peerId
    try KeychainManager.shared.save(keyData, forKey: keychainKey)
    activeSessions[peerId] = key
}

func loadSession(peerId: String) -> SymmetricKey? {
    if let cached = activeSessions[peerId] { return cached }
    guard let data = try? KeychainManager.shared.load(forKey: keychainPrefix + peerId) else { return nil }
    let key = SymmetricKey(data: data)
    activeSessions[peerId] = key
    return key
}

func removeSession(peerId: String) {
    activeSessions.removeValue(forKey: peerId)
    try? KeychainManager.shared.delete(forKey: keychainPrefix + peerId)
}
```

**Step 2: Update `getOrCreateSession()` to use `loadSession()` first**

### Task 2: Fix random IDs in generatePublicBundle()

**Context:** `E2EEService.generatePublicBundle()` uses `Int.random(in:)` for `registrationId`, `preKeyId`, `signedPreKeyId` — these should be stable.

**Step 1: Persist IDs in Keychain**

```swift
private func getOrCreateStableId(key: String) -> Int {
    if let data = try? KeychainManager.shared.load(forKey: key),
       data.count >= 4 {
        return Int(data.withUnsafeBytes { $0.load(as: Int32.self) })
    }
    let newId = Int.random(in: 1...65535)
    var value = Int32(newId)
    let data = Data(bytes: &value, count: 4)
    try? KeychainManager.shared.save(data, forKey: key)
    return newId
}
```

Use in `generatePublicBundle()`:

```swift
let registrationId = getOrCreateStableId(key: "com.meeshy.e2ee.registrationId")
let preKeyId = getOrCreateStableId(key: "com.meeshy.e2ee.preKeyId")
let signedPreKeyId = getOrCreateStableId(key: "com.meeshy.e2ee.signedPreKeyId")
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-2B: `feat/community-actions`

**Objectif:** Ajouter `join()`, `leave()`, `invite()` au CommunityService SDK et wirer l'UI.

**Fichiers exclusifs:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityMembersView.swift`

### Task 1: Add methods to CommunityService

```swift
func join(communityId: String) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/communities/\(communityId)/join",
        method: .post
    )
}

func leave(communityId: String) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/communities/\(communityId)/leave",
        method: .post
    )
}

func invite(communityId: String, userIds: [String]) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/communities/\(communityId)/invite",
        method: .post,
        body: ["userIds": userIds]
    )
}
```

### Task 2: Wire UI

Add Join/Leave button in `CommunityDetailView` based on membership status.
Add Invite action in `CommunityMembersView`.

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-2C: `feat/2fa-setup`

**Objectif:** Créer le service 2FA dans le SDK et l'UI dans SecurityView.

**Fichiers exclusifs:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/TwoFactorService.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

### Task 1: Create TwoFactorService

```swift
import Foundation

protocol TwoFactorServiceProviding: Sendable {
    func getStatus() async throws -> TwoFactorStatus
    func setup() async throws -> TwoFactorSetup
    func enable(code: String) async throws -> TwoFactorBackupCodes
    func disable(code: String) async throws
    func verify(code: String) async throws
    func getBackupCodes() async throws -> TwoFactorBackupCodes
}

struct TwoFactorStatus: Codable, Sendable {
    let enabled: Bool
    let method: String?
}

struct TwoFactorSetup: Codable, Sendable {
    let secret: String
    let qrCodeUrl: String
    let manualEntryKey: String
}

struct TwoFactorBackupCodes: Codable, Sendable {
    let codes: [String]
}

final class TwoFactorService: TwoFactorServiceProviding, Sendable {
    private let apiClient: APIClientProviding

    init(apiClient: APIClientProviding = APIClient.shared) {
        self.apiClient = apiClient
    }

    func getStatus() async throws -> TwoFactorStatus {
        try await apiClient.request(endpoint: "/auth/2fa/status", method: .get)
    }

    func setup() async throws -> TwoFactorSetup {
        try await apiClient.request(endpoint: "/auth/2fa/setup", method: .post)
    }

    func enable(code: String) async throws -> TwoFactorBackupCodes {
        try await apiClient.request(
            endpoint: "/auth/2fa/enable",
            method: .post,
            body: ["code": code]
        )
    }

    func disable(code: String) async throws {
        let _: EmptyResponse = try await apiClient.request(
            endpoint: "/auth/2fa/disable",
            method: .post,
            body: ["code": code]
        )
    }

    func verify(code: String) async throws {
        let _: EmptyResponse = try await apiClient.request(
            endpoint: "/auth/2fa/verify",
            method: .post,
            body: ["code": code]
        )
    }

    func getBackupCodes() async throws -> TwoFactorBackupCodes {
        try await apiClient.request(endpoint: "/auth/2fa/backup-codes", method: .post)
    }
}
```

### Task 2: Add 2FA UI section in SecurityView

File: `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

Add a "Two-Factor Authentication" section with:
- Status indicator (enabled/disabled)
- Setup flow: show QR code, enter verification code
- Backup codes display
- Disable option

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-2D: `feat/group-admin`

**Objectif:** Ajouter `removeParticipant()`, `updateParticipantRole()` au SDK et wirer l'UI.

**Fichiers exclusifs:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`

### Task 1: Add methods to ConversationService

```swift
func removeParticipant(conversationId: String, participantId: String) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/conversations/\(conversationId)/participants/\(participantId)",
        method: .delete
    )
}

func updateParticipantRole(
    conversationId: String,
    participantId: String,
    role: String
) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/conversations/\(conversationId)/participants/\(participantId)/role",
        method: .patch,
        body: ["role": role]
    )
}
```

Add to `ConversationServiceProviding` protocol.

### Task 2: Add admin actions in ParticipantsView

Add swipe actions or context menu on participant rows:
- "Promouvoir" → role picker (MODERATOR, ADMIN)
- "Retirer" → confirmation alert + `removeParticipant()`

Only show for users with ADMIN or BIGBOSS role.

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-2E: `feat/email-verification`

**Objectif:** Ajouter la vérification email post-inscription.

**Fichiers exclusifs:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift`
- Create: `apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`

### Task 1: Add verification methods to AuthService

```swift
func verifyEmail(code: String) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/auth/verify-email",
        method: .post,
        body: ["code": code]
    )
}

func resendVerification(email: String) async throws {
    let _: EmptyResponse = try await apiClient.request(
        endpoint: "/auth/resend-verification",
        method: .post,
        body: ["email": email]
    )
}
```

### Task 2: Create EmailVerificationView

```swift
struct EmailVerificationView: View {
    let email: String
    @State private var code = ""
    @State private var isVerifying = false
    @State private var error: String?
    @State private var isResending = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "envelope.badge")
                .font(.system(size: 60))
                .foregroundStyle(.indigo)

            Text(String(localized: "Verifiez votre email", defaultValue: "Verifiez votre email"))
                .font(.title2.bold())

            Text(String(localized: "Un code a ete envoye a", defaultValue: "Un code a ete envoye a \(email)"))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField(String(localized: "Code de verification", defaultValue: "Code de verification"), text: $code)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)
                .padding(.horizontal)

            if let error {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.caption)
            }

            Button {
                verify()
            } label: {
                if isVerifying {
                    ProgressView()
                } else {
                    Text(String(localized: "Verifier", defaultValue: "Verifier"))
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.indigo)
            .disabled(code.count < 4 || isVerifying)

            Button {
                resend()
            } label: {
                Text(String(localized: "Renvoyer le code", defaultValue: "Renvoyer le code"))
                    .font(.caption)
            }
            .disabled(isResending)
        }
        .padding()
    }

    private func verify() {
        isVerifying = true
        Task {
            do {
                try await AuthService(apiClient: APIClient.shared).verifyEmail(code: code)
                dismiss()
            } catch {
                self.error = error.localizedDescription
                isVerifying = false
            }
        }
    }

    private func resend() {
        isResending = true
        Task {
            do {
                try await AuthService(apiClient: APIClient.shared).resendVerification(email: email)
                isResending = false
            } catch {
                self.error = error.localizedDescription
                isResending = false
            }
        }
    }
}
```

### Task 3: Present after registration

In the registration flow (OnboardingFlowView or LoginView post-register), present `EmailVerificationView` as a sheet after successful registration.

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## Phase 2 — Merge Order & Integration

```bash
# UI-only / new files first, SDK modifications last
git merge feat/2fa-setup               # WT-2C (1 new SDK + 1 app modify)
./apps/ios/meeshy.sh build

git merge feat/community-actions        # WT-2B (1 SDK + 2 MeeshyUI)
./apps/ios/meeshy.sh build

git merge feat/group-admin              # WT-2D (1 SDK + 1 app)
./apps/ios/meeshy.sh build

git merge feat/email-verification       # WT-2E (1 SDK + 1 new app)
./apps/ios/meeshy.sh build

git merge feat/e2ee-persistence         # WT-2A (2 app services)
./apps/ios/meeshy.sh build

# Post-merge: iOS Senior Optimization Pass
git tag phase-2-optimized
```

---

# PHASE 3 — Polish, Securite & UX

**5 worktrees paralleles. Base sur `dev` post-Phase 2.**

---

## WT-3A: `feat/brand-colors-fix`

**Objectif:** Migrer toutes les couleurs hardcodees non-brand vers l'echelle indigo.

**Fichiers exclusifs:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`
- Modify: `apps/ios/Meeshy/MeeshyApp.swift` (SplashScreen only)
- Modify: `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

### Task 1: Replace hardcoded colors

| File | Old Color | New Color |
|---|---|---|
| `EditProfileView.swift:21` | `"08D9D6"` (teal) | `MeeshyColors.indigo400` |
| `NewConversationView.swift` | `"4ECDC4"` (teal) | `MeeshyColors.indigo400` |
| `SecurityView.swift:38` | `"3498DB"` (blue) | `MeeshyColors.indigo500` |
| `MeeshyApp.swift` SplashScreen | `"2A9D8F"`, `"E76F51"`, `"B24BF3"` orbs | `MeeshyColors.indigo600`, `MeeshyColors.indigo400`, `MeeshyColors.indigo800` |
| `MeeshyApp.swift` SplashScreen | `"B24BF3"/"8B5CF6"/"A855F7"` gradient | `MeeshyColors.indigo500` → `MeeshyColors.indigo700` |

Reference: `packages/MeeshySDK/Sources/MeeshySDK/Theme/MeeshyColors.swift`

**Step 1: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-3B: `feat/session-management`

**Objectif:** Permettre aux utilisateurs de voir et revoquer leurs sessions actives.

**Fichiers exclusifs:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/SessionService.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/ActiveSessionsView.swift`

### Task 1: Create SessionService

```swift
import Foundation

protocol SessionServiceProviding: Sendable {
    func listSessions() async throws -> [UserSession]
    func revokeSession(sessionId: String) async throws
    func revokeAllOtherSessions() async throws
}

struct UserSession: Codable, Sendable, Identifiable {
    let id: String
    let deviceName: String?
    let ipAddress: String?
    let lastActive: Date?
    let createdAt: Date
    let isCurrent: Bool
}

final class SessionService: SessionServiceProviding, Sendable {
    private let apiClient: APIClientProviding

    init(apiClient: APIClientProviding = APIClient.shared) {
        self.apiClient = apiClient
    }

    func listSessions() async throws -> [UserSession] {
        try await apiClient.request(endpoint: "/auth/sessions", method: .get)
    }

    func revokeSession(sessionId: String) async throws {
        let _: EmptyResponse = try await apiClient.request(
            endpoint: "/auth/sessions/\(sessionId)",
            method: .delete
        )
    }

    func revokeAllOtherSessions() async throws {
        let _: EmptyResponse = try await apiClient.request(
            endpoint: "/auth/sessions",
            method: .delete
        )
    }
}
```

### Task 2: Create ActiveSessionsView

SwiftUI view with:
- List of active sessions with device name, IP, last active date
- Current session badge
- Swipe-to-revoke on other sessions
- "Revoquer toutes les autres sessions" button
- Navigation from SecurityView

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-3C: `feat/feed-composer-media`

**Objectif:** Wirer le bouton + media du feed post composer.

**Fichiers exclusifs:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift`

### Task 1: Implement media picker in feed composer

Wire the `+` button (currently TODO) to a `PhotosPicker` or action sheet with:
- Photos/Videos from library
- Camera capture
- Audio recording

Use existing `PhotoLibraryManager` and `TusUploadManager` from the SDK.

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-3D: `feat/certificate-pinning`

**Objectif:** Ajouter le certificate pinning pour les connexions HTTPS.

**Fichiers exclusifs:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`

### Task 1: Add URLSession delegate for cert pinning

```swift
final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {
    private let pinnedHashes: Set<String> = [
        // SHA-256 hash of meeshy.me certificate public key
        // Get with: openssl s_client -connect gate.meeshy.me:443 | openssl x509 -pubkey | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
    ]

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard let serverTrust = challenge.protectionSpace.serverTrust,
              challenge.protectionSpace.host == "gate.meeshy.me" else {
            return (.performDefaultHandling, nil)
        }

        // Validate server certificate chain
        let policies = [SecPolicyCreateSSL(true, "gate.meeshy.me" as CFString)]
        SecTrustSetPolicies(serverTrust, policies as CFArray)

        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            return (.cancelAuthenticationChallenge, nil)
        }

        // In production, compare public key hash against pinned hashes
        // For now, trust after standard validation
        return (.useCredential, URLCredential(trust: serverTrust))
    }
}
```

Update `APIClient` init to use the delegate:

```swift
private let session: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30
    return URLSession(
        configuration: config,
        delegate: CertificatePinningDelegate(),
        delegateQueue: nil
    )
}()
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## WT-3E: `feat/attachment-send-extraction`

**Objectif:** Extraire le pipeline d'envoi d'attachments du ViewModel vers `AttachmentSendService`.

**Fichiers exclusifs:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/AttachmentSendService.swift`
- Reference only (no modify): `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`

**Note:** Ce worktree ne modifie PAS `ConversationView+AttachmentHandlers.swift` (propriete de WT-1A en Phase 1). Il extrait la logique dans `AttachmentSendService` et documente l'integration future.

### Task 1: Implement AttachmentSendService

Extract from `ConversationView+AttachmentHandlers.swift` the upload/send pipeline into the service:

```swift
@MainActor
final class AttachmentSendService {
    static let shared = AttachmentSendService()

    private let tusManager = TusUploadManager.shared
    private let messageService: MessageServiceProviding
    private let socketManager: MessageSocketProviding

    init(
        messageService: MessageServiceProviding = MessageService(apiClient: APIClient.shared),
        socketManager: MessageSocketProviding = MessageSocketManager.shared
    ) {
        self.messageService = messageService
        self.socketManager = socketManager
    }

    func send(
        conversationId: String,
        content: String?,
        attachments: [PendingAttachment],
        replyToId: String?,
        onProgress: @escaping (Double) -> Void
    ) async throws -> Message {
        // 1. Upload each attachment via TUS
        var uploadedIds: [String] = []
        for (index, attachment) in attachments.enumerated() {
            let id = try await tusManager.upload(
                data: attachment.data,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType
            ) { progress in
                let overall = (Double(index) + progress) / Double(attachments.count)
                onProgress(overall)
            }
            uploadedIds.append(id)
        }

        // 2. Send via appropriate channel
        let hasAudio = attachments.contains { $0.mimeType?.hasPrefix("audio/") == true }

        if hasAudio {
            // WebSocket path for audio pipeline
            socketManager.sendWithAttachments(
                conversationId: conversationId,
                content: content,
                attachmentIds: uploadedIds,
                replyToId: replyToId,
                isEncrypted: false
            )
            // Return optimistic message
            return Message.optimistic(
                conversationId: conversationId,
                content: content ?? "",
                attachmentIds: uploadedIds
            )
        } else {
            // REST path for non-audio
            return try await messageService.send(
                conversationId: conversationId,
                content: content ?? "",
                attachmentIds: uploadedIds,
                replyToId: replyToId
            )
        }
    }
}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

---

## Phase 3 — Merge Order & Integration

```bash
git merge feat/brand-colors-fix         # WT-3A (4 app views)
./apps/ios/meeshy.sh build

git merge feat/feed-composer-media      # WT-3C (2 app views)
./apps/ios/meeshy.sh build

git merge feat/session-management       # WT-3B (1 new SDK + 1 new app)
./apps/ios/meeshy.sh build

git merge feat/attachment-send-extraction # WT-3E (1 app service)
./apps/ios/meeshy.sh build

git merge feat/certificate-pinning      # WT-3D (1 SDK networking)
./apps/ios/meeshy.sh build

# Post-merge: iOS Senior Optimization Pass
git tag phase-3-optimized
```

---

# Agent Dispatch Reference

## Per-Worktree Agent Pipeline

```
Agent 1: feature-dev (subagent_type: general-purpose)
  → Implements TDD in isolated worktree
  → Runs ./apps/ios/meeshy.sh build

Agent 2: code-reviewer (subagent_type: superpowers:code-reviewer)
  → Reviews Agent 1 output
  → Reports issues

Agent 1: Fixes issues from review

Agent 3: completion (subagent_type: feature-dev:code-explorer + general-purpose)
  → Explores neglected aspects:
    - Edge cases, error handling, accessibility
    - Offline behavior, memory leaks
    - Localization, additional tests
  → Implements improvements

Agent 4: code-reviewer (subagent_type: superpowers:code-reviewer)
  → Re-reviews after completion
  → Final approval

Agent 1: Final commit
```

## Post-Phase Optimization Agent

```
Agent: ios-architect-expert
  → Reviews ALL phase changes as a senior Swift/iOS engineer
  → Focus areas:
    - Performance: allocations, copies, @MainActor overhead
    - Concurrency: Swift 6 Sendable, actor isolation, data races
    - Memory: retain cycles in closures/Combine, cache eviction
    - API design: protocol surface, naming conventions
    - SwiftUI: view identity, unnecessary redraws, lazy loading
    - iOS compat: backward compatibility iOS 16-26
  → Applies optimizations
  → ./apps/ios/meeshy.sh build
  → Commits as "perf(ios): phase-{N} senior optimization pass"
```

---

# File Ownership Matrix (No Conflicts)

| File | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `MessageSocketManager.swift` | WT-1A | — | — |
| `SocialSocketManager.swift` | WT-1A | — | — |
| `CallManager.swift` | WT-1A | — | — |
| `ConversationView+AttachmentHandlers.swift` | WT-1A | — | — |
| `AuthService.swift` | WT-1B | WT-2E | — |
| `ChangePasswordView.swift` | WT-1B | — | — |
| `StatusViewModel.swift` | WT-1C | — | — |
| `FeedView.swift` | WT-1C | — | — |
| `FeedViewModel.swift` | WT-1C | — | — |
| `ConversationView.swift` | WT-1C | — | — |
| `ThreadView.swift` | WT-1D | — | — |
| `E2EEService.swift` | — | WT-2A | — |
| `E2ESessionManager.swift` | — | WT-2A | — |
| `CommunityService.swift` | — | WT-2B | — |
| `CommunityDetailView.swift` | — | WT-2B | — |
| `CommunityMembersView.swift` | — | WT-2B | — |
| `TwoFactorService.swift` (new) | — | WT-2C | — |
| `SecurityView.swift` | — | WT-2C | WT-3A* |
| `ConversationService.swift` | — | WT-2D | — |
| `ParticipantsView.swift` | — | WT-2D | — |
| `EmailVerificationView.swift` (new) | — | WT-2E | — |
| `EditProfileView.swift` | — | — | WT-3A |
| `MeeshyApp.swift` | — | — | WT-3A |
| `NewConversationView.swift` | — | — | WT-3A |
| `SessionService.swift` (new) | — | — | WT-3B |
| `ActiveSessionsView.swift` (new) | — | — | WT-3B |
| `FeedView+Attachments.swift` | — | — | WT-3C |
| `AudioPostComposerView.swift` | — | — | WT-3C |
| `APIClient.swift` | — | — | WT-3D |
| `AttachmentSendService.swift` | — | — | WT-3E |

*SecurityView: WT-2C adds 2FA section, WT-3A changes colors. WT-2C merges first (Phase 2), WT-3A merges in Phase 3 on top. No conflict since they touch different parts of the file.

---

# Success Criteria

After Phase 3 completion:
- [ ] Audio messages from iOS trigger server-side transcription + translation
- [ ] Call signaling events flow between iOS and gateway
- [ ] E2EE session keys persist across app restarts
- [ ] No mock/sample data shown to users
- [ ] All errors displayed with actionable UI
- [ ] Thread replies work end-to-end
- [ ] Community join/leave/invite functional
- [ ] 2FA setup/verify/disable functional
- [ ] Group admin can remove participants and change roles
- [ ] Email verification post-registration works
- [ ] All UI uses brand indigo colors
- [ ] Active sessions viewable and revocable
- [ ] Feed composer media attachment works
- [ ] Certificate pinning active for gate.meeshy.me
- [ ] AttachmentSendService extracted and reusable
- [ ] `./apps/ios/meeshy.sh build` passes at every step
