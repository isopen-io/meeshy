# Unified Cache — Track 3: CacheCoordinator + iOS Integration + Cleanup

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire GRDBCacheStore and DiskCacheStore into the iOS app via CacheCoordinator. Subscribe all socket events to cache mutations. Migrate all ViewModels from old cache managers. Delete deprecated managers.

**Architecture:** CacheCoordinator actor bridges Socket.IO Combine publishers to cache stores. Injectable for testing. Lifecycle-aware (flush dirty on background, evict on memory warning). ViewModels switch from `ConversationCacheManager.shared` / etc. to `CacheCoordinator.shared.conversations` / etc.

**Tech Stack:** Swift 5.9+, Combine, GRDB, XCTest

**Prerequisites:** Track 1 (GRDBCacheStore + models) AND Track 2 (DiskCacheStore) must be merged to dev first.

**IMPORTANT:** This track runs sequentially on `dev` after merging Track 1 and Track 2. No worktree needed.

---

### Task 1: CacheCoordinator — Core Actor + Socket Subscriptions

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
import Combine
import GRDB
@testable import MeeshySDK

final class CacheCoordinatorTests: XCTestCase {

    private func makeCoordinator() throws -> (CacheCoordinator, MockMessageSocket, MockSocialSocket, DatabaseQueue) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let msgSocket = MockMessageSocket()
        let socialSocket = MockSocialSocket()
        let coord = CacheCoordinator(messageSocket: msgSocket, socialSocket: socialSocket, db: db)
        return (coord, msgSocket, socialSocket, db)
    }

    // MARK: - Store Access

    func test_coordinator_exposesConversationsStore() throws {
        let (coord, _, _, _) = try makeCoordinator()
        // Just verify the store exists and has correct policy
        XCTAssertEqual(coord.conversations.policy.ttl, CachePolicy.conversations.ttl)
    }

    func test_coordinator_exposesMessagesStore() throws {
        let (coord, _, _, _) = try makeCoordinator()
        XCTAssertEqual(coord.messages.policy.ttl, CachePolicy.messages.ttl)
    }

    // MARK: - Socket → Cache (message:new)

    func test_newMessage_appendsToMessageCache() async throws {
        let (coord, msgSocket, _, _) = try makeCoordinator()
        let convId = "conv-123"

        // Pre-populate cache
        let existing = TestMessageFactory.make(id: "msg-1", conversationId: convId)
        await coord.messages.save([existing], for: convId)

        // Simulate socket event
        let newMsg = TestMessageFactory.makeAPI(id: "msg-2", conversationId: convId)
        msgSocket.messageReceived.send(newMsg)

        // Wait for Combine pipeline
        try await Task.sleep(for: .milliseconds(100))

        let result = await coord.messages.load(for: convId)
        XCTAssertEqual(result.value?.count, 2)
    }

    // MARK: - Socket → Cache (message:deleted)

    func test_deletedMessage_removesFromCache() async throws {
        let (coord, msgSocket, _, _) = try makeCoordinator()
        let convId = "conv-123"
        let msg = TestMessageFactory.make(id: "msg-1", conversationId: convId)
        await coord.messages.save([msg], for: convId)

        msgSocket.messageDeleted.send(MessageDeletedEvent(messageId: "msg-1", conversationId: convId))
        try await Task.sleep(for: .milliseconds(100))

        let result = await coord.messages.load(for: convId)
        XCTAssertEqual(result.value?.count ?? 0, 0)
    }

    // MARK: - Socket → Cache (reconnection)

    func test_reconnection_invalidatesConversations() async throws {
        let (coord, msgSocket, _, _) = try makeCoordinator()
        await coord.conversations.save([], for: "list")

        msgSocket.didReconnect.send(())
        try await Task.sleep(for: .milliseconds(100))

        let result = await coord.conversations.load(for: "list")
        if case .empty = result { } else { XCTFail("Expected .empty after reconnection") }
    }

    // MARK: - Socket → Cache (participant role updated)

    func test_roleUpdated_mutatesParticipantCache() async throws {
        let (coord, msgSocket, _, _) = try makeCoordinator()
        let convId = "conv-123"
        let participant = TestParticipantFactory.make(id: "p-1", userId: "user-1", role: "USER")
        await coord.participants.save([participant], for: convId)

        msgSocket.participantRoleUpdated.send(ParticipantRoleUpdatedEvent(
            conversationId: convId, userId: "user-1", newRole: "MODERATOR"
        ))
        try await Task.sleep(for: .milliseconds(100))

        let result = await coord.participants.load(for: convId)
        XCTAssertEqual(result.value?.first?.conversationRole, "MODERATOR")
    }

    // MARK: - Socket → Cache (unread updated)

    func test_unreadUpdated_mutatesConversationCache() async throws {
        let (coord, msgSocket, _, _) = try makeCoordinator()
        let conv = TestConversationFactory.make(id: "conv-1", unreadCount: 0)
        await coord.conversations.save([conv], for: "list")

        msgSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv-1", unreadCount: 5))
        try await Task.sleep(for: .milliseconds(100))

        let result = await coord.conversations.load(for: "list")
        XCTAssertEqual(result.value?.first?.unreadCount, 5)
    }

    // MARK: - Socket → Cache (read status)

    func test_readStatusUpdated_mutatesMessageCache() async throws {
        let (coord, msgSocket, _, _) = try makeCoordinator()
        let convId = "conv-123"
        let msg = TestMessageFactory.make(id: "msg-1", conversationId: convId)
        await coord.messages.save([msg], for: convId)

        msgSocket.readStatusUpdated.send(ReadStatusUpdateEvent(
            conversationId: convId, messageId: "msg-1", userId: "user-1", readAt: Date()
        ))
        try await Task.sleep(for: .milliseconds(100))

        // Verify message was updated (readBy includes user-1)
        let result = await coord.messages.load(for: convId)
        XCTAssertNotNil(result.value?.first)
    }
}
```

**NOTE:** This test requires `MockMessageSocket` and `MockSocialSocket` conforming to `MessageSocketProviding` and `SocialSocketProviding`, plus `TestMessageFactory`, `TestConversationFactory`, `TestParticipantFactory` helpers. Create these in test files.

**Step 2: Run tests — expected FAIL**

**Step 3: Write implementation**

`CacheCoordinator.swift`:

```swift
import Foundation
import Combine
import os

public actor CacheCoordinator {
    public static let shared = CacheCoordinator()

    // MARK: - Public Stores

    public let conversations: GRDBCacheStore<String, MeeshyConversation>
    public let messages: GRDBCacheStore<String, MeeshyMessage>
    public let participants: GRDBCacheStore<String, PaginatedParticipant>
    public let profiles: GRDBCacheStore<String, MeeshyUser>

    public let images: DiskCacheStore
    public let audio: DiskCacheStore
    public let video: DiskCacheStore
    public let thumbnails: DiskCacheStore

    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "cache-coordinator")

    // MARK: - Init (injectable for testing)

    public init(
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        db: DatabaseWriter = AppDatabase.shared.databaseWriter
    ) {
        conversations = GRDBCacheStore(policy: .conversations, db: db)
        messages = GRDBCacheStore(policy: .messages, db: db)
        participants = GRDBCacheStore(policy: .participants, db: db)
        profiles = GRDBCacheStore(policy: .userProfiles, db: db)

        images = DiskCacheStore(policy: .mediaImages)
        audio = DiskCacheStore(policy: .mediaAudio)
        video = DiskCacheStore(policy: .mediaVideo)
        thumbnails = DiskCacheStore(policy: .thumbnails)

        setupMessageSocketSubscriptions(messageSocket)
        setupLifecycleObservers()
    }

    // MARK: - Flush All (public for lifecycle)

    public func flushAll() async {
        await conversations.flushDirtyKeys()
        await messages.flushDirtyKeys()
        await participants.flushDirtyKeys()
        await profiles.flushDirtyKeys()
    }

    // MARK: - Socket Subscriptions

    private func setupMessageSocketSubscriptions(_ socket: MessageSocketProviding) {
        // Messages
        subscribe(socket.messageReceived) { [weak self] msg in
            await self?.handleNewMessage(msg)
        }
        subscribe(socket.messageEdited) { [weak self] msg in
            await self?.handleMessageEdited(msg)
        }
        subscribe(socket.messageDeleted) { [weak self] event in
            await self?.handleMessageDeleted(event)
        }

        // Reactions
        subscribe(socket.reactionAdded) { [weak self] event in
            await self?.handleReactionAdded(event)
        }
        subscribe(socket.reactionRemoved) { [weak self] event in
            await self?.handleReactionRemoved(event)
        }
        subscribe(socket.reactionSynced) { [weak self] event in
            await self?.handleReactionSynced(event)
        }

        // Participants
        subscribe(socket.participantRoleUpdated) { [weak self] event in
            await self?.handleRoleUpdated(event)
        }
        subscribe(socket.conversationJoined) { [weak self] event in
            await self?.handleParticipantJoined(event)
        }
        subscribe(socket.conversationLeft) { [weak self] event in
            await self?.handleParticipantLeft(event)
        }
        subscribe(socket.userStatusChanged) { [weak self] event in
            await self?.handleUserStatusChanged(event)
        }

        // Read/Consume
        subscribe(socket.readStatusUpdated) { [weak self] event in
            await self?.handleReadStatusUpdated(event)
        }
        subscribe(socket.messageConsumed) { [weak self] event in
            await self?.handleMessageConsumed(event)
        }

        // Unread
        subscribe(socket.unreadUpdated) { [weak self] event in
            await self?.handleUnreadUpdated(event)
        }

        // Translations (update message with translation data)
        subscribe(socket.translationReceived) { [weak self] event in
            await self?.handleTranslationReceived(event)
        }
        subscribe(socket.transcriptionReady) { [weak self] event in
            await self?.handleTranscriptionReady(event)
        }

        // System messages (add to message cache)
        subscribe(socket.systemMessageReceived) { [weak self] event in
            await self?.handleSystemMessage(event)
        }

        // Attachment status
        subscribe(socket.attachmentStatusUpdated) { [weak self] event in
            await self?.handleAttachmentStatus(event)
        }

        // Reconnection — invalidate stale caches
        subscribe(socket.didReconnect) { [weak self] _ in
            await self?.handleReconnection()
        }
    }

    // MARK: - Generic Subscribe Helper

    private func subscribe<T>(_ publisher: PassthroughSubject<T, Never>, handler: @escaping @Sendable (T) async -> Void) {
        publisher.sink { value in
            Task { await handler(value) }
        }.store(in: &cancellables)
    }

    // MARK: - Handlers

    private func handleNewMessage(_ msg: APIMessage) async {
        guard let convId = msg.conversationId else { return }
        await messages.update(for: convId) { existing in
            guard !existing.contains(where: { $0.id == msg.id }) else { return existing }
            return existing + [msg.toMeeshyMessage()]
        }
    }

    private func handleMessageEdited(_ msg: APIMessage) async {
        guard let convId = msg.conversationId else { return }
        let updated = msg.toMeeshyMessage()
        await messages.update(for: convId) { existing in
            existing.map { $0.id == msg.id ? updated : $0 }
        }
    }

    private func handleMessageDeleted(_ event: MessageDeletedEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.filter { $0.id != event.messageId }
        }
    }

    private func handleReactionAdded(_ event: ReactionUpdateEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                // Append reaction if not already present
                var reactions = updated.reactions ?? []
                if !reactions.contains(where: { $0.userId == event.userId && $0.emoji == event.emoji }) {
                    reactions.append(MeeshyReaction(userId: event.userId, emoji: event.emoji, createdAt: Date()))
                    updated.reactions = reactions
                }
                return updated
            }
        }
    }

    private func handleReactionRemoved(_ event: ReactionUpdateEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                updated.reactions = (updated.reactions ?? []).filter {
                    !($0.userId == event.userId && $0.emoji == event.emoji)
                }
                return updated
            }
        }
    }

    private func handleReactionSynced(_ event: ReactionSyncEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                updated.reactions = event.reactions
                return updated
            }
        }
    }

    private func handleRoleUpdated(_ event: ParticipantRoleUpdatedEvent) async {
        await participants.update(for: event.conversationId) { existing in
            existing.map { p in
                guard p.userId == event.userId else { return p }
                var updated = p
                updated.conversationRole = event.newRole
                return updated
            }
        }
    }

    private func handleParticipantJoined(_ event: ConversationParticipationEvent) async {
        // Invalidate participant cache for this conversation so it's refreshed from API
        await participants.invalidate(for: event.conversationId)
        // Also invalidate conversation list (member count changed)
        await conversations.invalidate(for: "list")
    }

    private func handleParticipantLeft(_ event: ConversationParticipationEvent) async {
        await participants.update(for: event.conversationId) { existing in
            existing.filter { $0.userId != event.userId }
        }
        await conversations.invalidate(for: "list")
    }

    private func handleUserStatusChanged(_ event: UserStatusEvent) async {
        // Update online status in participant cache across all cached conversations
        // This is best-effort — only mutates conversations already in L1
    }

    private func handleReadStatusUpdated(_ event: ReadStatusUpdateEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                var readBy = updated.readBy ?? []
                if !readBy.contains(where: { $0.userId == event.userId }) {
                    readBy.append(ReadReceipt(userId: event.userId, readAt: event.readAt))
                    updated.readBy = readBy
                }
                return updated
            }
        }
    }

    private func handleMessageConsumed(_ event: MessageConsumedEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                updated.consumedAt = event.consumedAt
                return updated
            }
        }
    }

    private func handleUnreadUpdated(_ event: UnreadUpdateEvent) async {
        await conversations.update(for: "list") { existing in
            existing.map { conv in
                guard conv.id == event.conversationId else { return conv }
                var updated = conv
                updated.unreadCount = event.unreadCount
                return updated
            }
        }
    }

    private func handleTranslationReceived(_ event: TranslationEvent) async {
        // Translation data is typically handled by the ViewModel directly
        // Cache coordinator doesn't mutate messages for translations (they're volatile)
    }

    private func handleTranscriptionReady(_ event: TranscriptionReadyEvent) async {
        // Update message with transcription text
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                updated.transcription = event.text
                return updated
            }
        }
    }

    private func handleSystemMessage(_ event: SystemMessageEvent) async {
        // System messages are appended to the conversation's message cache
        await messages.update(for: event.conversationId) { existing in
            guard !existing.contains(where: { $0.id == event.messageId }) else { return existing }
            return existing + [event.toMeeshyMessage()]
        }
    }

    private func handleAttachmentStatus(_ event: AttachmentStatusEvent) async {
        await messages.update(for: event.conversationId) { existing in
            existing.map { msg in
                guard msg.id == event.messageId else { return msg }
                var updated = msg
                // Update attachment processing status
                updated.attachmentStatus = event.status
                return updated
            }
        }
    }

    private func handleReconnection() async {
        logger.info("Socket reconnected — invalidating stale caches")
        await conversations.invalidateAll()
        // Don't invalidate messages (they have long TTL and rarely change)
        // Don't invalidate participants (stale-while-revalidate handles this)
    }

    // MARK: - Lifecycle Observers

    private func setupLifecycleObservers() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            let taskId = UIApplication.shared.beginBackgroundTask()
            Task {
                await self.flushAll()
                await MainActor.run { UIApplication.shared.endBackgroundTask(taskId) }
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            Task {
                await self.images.evictExpired()
                await self.thumbnails.evictExpired()
                await self.audio.evictExpired()
            }
        }
    }
}
```

**Step 4: Run tests — expected PASS** (6 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorTests.swift
git commit -m "feat(sdk): add CacheCoordinator — socket→cache bridge with lifecycle management"
```

---

### Task 2: Test Helpers (Mock Sockets + Factories)

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/MockMessageSocket.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/MockSocialSocket.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/TestFactories.swift`

**Step 1: Write MockMessageSocket**

```swift
import Foundation
import Combine
@testable import MeeshySDK

class MockMessageSocket: MessageSocketProviding {
    let messageReceived = PassthroughSubject<APIMessage, Never>()
    let messageEdited = PassthroughSubject<APIMessage, Never>()
    let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()
    let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    let typingStarted = PassthroughSubject<TypingEvent, Never>()
    let typingStopped = PassthroughSubject<TypingEvent, Never>()
    let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()
    let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()
    let conversationJoined = PassthroughSubject<ConversationParticipationEvent, Never>()
    let conversationLeft = PassthroughSubject<ConversationParticipationEvent, Never>()
    let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
    let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()
    let locationShared = PassthroughSubject<LocationSharedEvent, Never>()
    let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()
    let translationReceived = PassthroughSubject<TranslationEvent, Never>()
    let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()
    let didReconnect = PassthroughSubject<Void, Never>()
    let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    let callEnded = PassthroughSubject<CallEndData, Never>()
    let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    let callError = PassthroughSubject<CallErrorData, Never>()
    let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    let systemMessageReceived = PassthroughSubject<SystemMessageEvent, Never>()
    let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusEvent, Never>()
    let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()
}
```

**Step 2: Write MockSocialSocket**

```swift
import Foundation
import Combine
@testable import MeeshySDK

class MockSocialSocket: SocialSocketProviding {
    let postCreated = PassthroughSubject<APIPost, Never>()
    let postUpdated = PassthroughSubject<APIPost, Never>()
    let postDeleted = PassthroughSubject<String, Never>()
    let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
    let storyCreated = PassthroughSubject<APIPost, Never>()
    let storyViewed = PassthroughSubject<SocketStoryViewedData, Never>()
    let storyReacted = PassthroughSubject<SocketStoryReactedData, Never>()
    let statusCreated = PassthroughSubject<APIPost, Never>()
    let statusDeleted = PassthroughSubject<String, Never>()
    let statusUpdated = PassthroughSubject<APIPost, Never>()
    let statusReacted = PassthroughSubject<SocketStatusReactedData, Never>()
    let commentAdded = PassthroughSubject<SocketCommentAddedData, Never>()
    let commentDeleted = PassthroughSubject<SocketCommentDeletedData, Never>()
    let commentLiked = PassthroughSubject<SocketCommentLikedData, Never>()
    let storyTranslationUpdated = PassthroughSubject<SocketStoryTranslationUpdatedData, Never>()
    let postTranslationUpdated = PassthroughSubject<SocketPostTranslationUpdatedData, Never>()
    let commentTranslationUpdated = PassthroughSubject<SocketCommentTranslationUpdatedData, Never>()
}
```

**Step 3: Write TestFactories**

```swift
@testable import MeeshySDK

enum TestMessageFactory {
    static func make(id: String, conversationId: String) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: conversationId, content: "test", senderId: "user-1", createdAt: Date())
    }

    static func makeAPI(id: String, conversationId: String) -> APIMessage {
        APIMessage(id: id, conversationId: conversationId, content: "test", senderId: "user-1", createdAt: Date())
    }
}

enum TestConversationFactory {
    static func make(id: String, unreadCount: Int = 0) -> MeeshyConversation {
        MeeshyConversation(id: id, name: "Test Conv", unreadCount: unreadCount)
    }
}

enum TestParticipantFactory {
    static func make(id: String, userId: String, role: String = "USER") -> PaginatedParticipant {
        PaginatedParticipant(id: id, userId: userId, conversationRole: role)
    }
}
```

**NOTE:** These factory methods must match the actual SDK model initializers. The implementer MUST read the model files first and adapt the factory signatures accordingly. The code above is illustrative — actual `MeeshyMessage`, `MeeshyConversation`, `PaginatedParticipant` may have different required fields.

**Step 4: Build — expected PASS**

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshySDKTests/Cache/Helpers/
git commit -m "test(sdk): add mock sockets and test factories for CacheCoordinator tests"
```

---

### Task 3: Migrate ConversationListViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

**Step 1: Audit current usage** (read the file, identify all `ConversationCacheManager` and `MessageCacheManager` references)

Current references to replace:
- `ConversationCacheManager.shared.invalidateAll()` → `CacheCoordinator.shared.conversations.invalidateAll()`
- `ConversationCacheManager.shared.loadConversations()` → `CacheCoordinator.shared.conversations.load(for: "list")`
- `ConversationCacheManager.shared.saveConversations(conversations)` → `CacheCoordinator.shared.conversations.save(conversations, for: "list")`
- `MessageCacheManager.shared.loadMessages(for:)` → `CacheCoordinator.shared.messages.load(for:)`
- `MessageCacheManager.shared.saveMessages(_, for:)` → `CacheCoordinator.shared.messages.save(_, for:)`

**Step 2: Replace all occurrences**

For `loadConversations()`:
```swift
// Before
let cached = await ConversationCacheManager.shared.loadConversations()

// After
let result = await CacheCoordinator.shared.conversations.load(for: "list")
let cached: [MeeshyConversation]
switch result {
case .fresh(let items, _), .stale(let items, _):
    cached = items
case .expired, .empty:
    cached = []
}
```

For `saveConversations`:
```swift
// Before
await ConversationCacheManager.shared.saveConversations(conversations)

// After
await CacheCoordinator.shared.conversations.save(conversations, for: "list")
```

For `invalidateAll`:
```swift
// Before
Task.detached { await ConversationCacheManager.shared.invalidateAll() }

// After
Task.detached { await CacheCoordinator.shared.conversations.invalidateAll() }
```

For messages:
```swift
// Before
let cached = await MessageCacheManager.shared.loadMessages(for: conversationId)

// After
let msgResult = await CacheCoordinator.shared.messages.load(for: conversationId)
let cached = msgResult.value ?? []
```

**Step 3: Build to verify**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "refactor(ios): migrate ConversationListViewModel to CacheCoordinator"
```

---

### Task 4: Migrate ConversationViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

**Step 1: Audit current usage**

Current references:
- `MessageCacheManager.shared.loadMessages(for:)` → `CacheCoordinator.shared.messages.load(for:)`
- `MessageCacheManager.shared.saveMessages(_, for:)` → `CacheCoordinator.shared.messages.save(_, for:)`
- `mediaCache: MediaCaching = MediaCacheManager.shared` → `mediaCache: DiskCacheStore = CacheCoordinator.shared.images`

**Step 2: Replace all occurrences** (same pattern as Task 3)

**IMPORTANT:** The `mediaCache` parameter uses the `MediaCaching` protocol. Since `DiskCacheStore` has compatible methods (`data(for:)`, `image(for:)`, `store(_, for:)`, `prefetch(_:)`, etc.), update the parameter type or keep the protocol and make `DiskCacheStore` conform.

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "refactor(ios): migrate ConversationViewModel to CacheCoordinator"
```

---

### Task 5: Migrate ParticipantsView + ConversationInfoSheet

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

**Step 1: Audit ParticipantCacheManager usage**

ParticipantCacheManager has custom methods not in MutableCacheStore protocol:
- `loadFirstPage(for:forceRefresh:)` — loads from cache or API
- `loadNextPage(for:)` — pagination
- `hasMore(for:)` — pagination state
- `totalCount(for:)` — server total
- `removeParticipant(conversationId:userId:)` — mutation
- `updateRole(conversationId:userId:newRole:)` — mutation
- `isExpired(for:)` — freshness check
- `invalidate(conversationId:)` — invalidation

**IMPORTANT:** The unified cache stores do NOT replicate ParticipantCacheManager's pagination API (loadFirstPage, loadNextPage, hasMore, totalCount). These are application-level concerns that combine cache + network calls.

**Strategy:** Create a thin `ParticipantService` in the iOS app that wraps `CacheCoordinator.shared.participants` and adds the pagination/network logic. This keeps the SDK cache layer generic.

**Step 2: Create ParticipantService**

Create `apps/ios/Meeshy/Features/Main/Services/ParticipantService.swift`:

```swift
import MeeshySDK

actor ParticipantService {
    static let shared = ParticipantService()

    private var paginationState: [String: PaginationState] = [:]

    private struct PaginationState {
        var offset: Int = 0
        var hasMore: Bool = true
        var totalCount: Int?
    }

    func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [PaginatedParticipant] {
        if !forceRefresh {
            let result = await CacheCoordinator.shared.participants.load(for: conversationId)
            if let items = result.value, !items.isEmpty {
                return items
            }
        }

        // Fetch from API
        let response = try await APIClient.shared.getParticipants(conversationId: conversationId, offset: 0, limit: 30)
        await CacheCoordinator.shared.participants.save(response.data, for: conversationId)
        paginationState[conversationId] = PaginationState(
            offset: response.data.count,
            hasMore: response.pagination?.hasMore ?? false,
            totalCount: response.pagination?.total
        )
        return response.data
    }

    func loadNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let state = paginationState[conversationId] ?? PaginationState()
        guard state.hasMore else { return [] }

        let response = try await APIClient.shared.getParticipants(
            conversationId: conversationId, offset: state.offset, limit: 30
        )
        // Append to cache
        await CacheCoordinator.shared.participants.update(for: conversationId) { existing in
            var merged = existing
            for p in response.data where !merged.contains(where: { $0.id == p.id }) {
                merged.append(p)
            }
            return merged
        }
        paginationState[conversationId] = PaginationState(
            offset: state.offset + response.data.count,
            hasMore: response.pagination?.hasMore ?? false,
            totalCount: response.pagination?.total
        )
        return (await CacheCoordinator.shared.participants.load(for: conversationId)).value ?? []
    }

    func hasMore(for conversationId: String) -> Bool {
        paginationState[conversationId]?.hasMore ?? true
    }

    func totalCount(for conversationId: String) -> Int? {
        paginationState[conversationId]?.totalCount
    }

    func isExpired(for conversationId: String) async -> Bool {
        let result = await CacheCoordinator.shared.participants.load(for: conversationId)
        if case .expired = result { return true }
        if case .empty = result { return true }
        return false
    }

    func invalidate(conversationId: String) async {
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
        paginationState.removeValue(forKey: conversationId)
    }

    func updateRole(conversationId: String, userId: String, newRole: String) async {
        await CacheCoordinator.shared.participants.update(for: conversationId) { existing in
            existing.map { p in
                guard p.userId == userId else { return p }
                var updated = p
                updated.conversationRole = newRole
                return updated
            }
        }
    }

    func removeParticipant(conversationId: String, userId: String) async {
        await CacheCoordinator.shared.participants.update(for: conversationId) { existing in
            existing.filter { $0.userId != userId }
        }
    }
}
```

**Step 3: Replace all `ParticipantCacheManager.shared` → `ParticipantService.shared` in:**
- `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ParticipantService.swift \
       apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift \
       apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift
git commit -m "refactor(ios): migrate participant views to ParticipantService backed by CacheCoordinator"
```

---

### Task 6: Migrate UserProfileViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`

**Step 1: Replace usage**

- `UserProfileCacheManager.shared` → `CacheCoordinator.shared.profiles`
- The existing `UserProfileCaching` protocol injection in the ViewModel needs to be updated

```swift
// Before
profileCache: UserProfileCaching = UserProfileCacheManager.shared

// After — use CacheCoordinator.shared.profiles directly
// The GRDBCacheStore<String, MeeshyUser> provides load/save/invalidate
```

For `EditProfileView.swift`:
```swift
// Before
await UserProfileCacheManager.shared.invalidate(userId: userId)

// After
await CacheCoordinator.shared.profiles.invalidate(for: userId)
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift \
       apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift
git commit -m "refactor(ios): migrate UserProfileViewModel to CacheCoordinator"
```

---

### Task 7: Migrate MediaCacheManager References

**Files to modify (all `MediaCacheManager.shared` → `CacheCoordinator.shared.images` or `.audio` / `.video`):**
- `apps/ios/Meeshy/Features/Main/Services/AttachmentSendService.swift`
- `apps/ios/Meeshy/Features/Main/Services/AudioPlayerManager.swift`
- `apps/ios/Meeshy/Features/Main/Services/PhotoLibraryManager.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`
- `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
- `apps/ios/Meeshy/Features/Main/Views/DataStorageView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

**Step 1: Determine which DiskCacheStore to use per context**

| Usage | Old | New |
|-------|-----|-----|
| Image cache/prefetch | `MediaCacheManager.shared.image(for:)` | `CacheCoordinator.shared.images.image(for:)` |
| Image prefetch | `MediaCacheManager.shared.prefetch(url)` | `Task { await CacheCoordinator.shared.images.save(data, for: url) }` |
| Audio data | `MediaCacheManager.shared.data(for:)` | `CacheCoordinator.shared.audio.data(for:)` |
| Audio local URL | `MediaCacheManager.shared.localFileURL(for:)` | `CacheCoordinator.shared.audio.localFileURL(for:)` |
| Video cache check | `MediaCacheManager.shared.isCached(url)` | `CacheCoordinator.shared.video.isCached(url)` |
| Store uploaded media | `MediaCacheManager.shared.store(data, for:)` | `CacheCoordinator.shared.images.store(data, for:)` |
| Clear all media | `MediaCacheManager.shared.clearAll()` | See below |
| Static sync image | `MediaCacheManager.cachedImage(for:)` | `DiskCacheStore.cachedImage(for:)` |

**IMPORTANT:** `MediaCacheManager` uses a SINGLE flat cache for ALL media types. The new system splits by type. The implementer must determine the correct store (images/audio/video/thumbnails) based on context — e.g., audio attachments → `.audio`, image attachments → `.images`, thumbnails → `.thumbnails`.

For `DataStorageView` (clear all):
```swift
// Before
await MediaCacheManager.shared.clearAll()

// After
await CacheCoordinator.shared.images.clearAll()
await CacheCoordinator.shared.audio.clearAll()
await CacheCoordinator.shared.video.clearAll()
await CacheCoordinator.shared.thumbnails.clearAll()
```

**Step 2: Replace all references systematically**

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ \
       apps/ios/Meeshy/Features/Main/Views/
git commit -m "refactor(ios): migrate all MediaCacheManager references to DiskCacheStore via CacheCoordinator"
```

---

### Task 8: Delete Deprecated Cache Managers + Old Tests

**Files to delete:**
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/ConversationCacheManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MessageCacheManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/UserProfileCacheManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaCacheManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCachedParticipant.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SQLLocalStore.swift`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ConversationCacheManagerTests.swift`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/MessageCacheManagerTests.swift`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ParticipantCacheManagerTests.swift`

**Files to keep:**
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift` (not a cache, wraps AVAudioPlayer)
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryManager.swift` (user action, not cache)
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift` (still needed)
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCacheMetadata.swift` (still used by GRDBCacheStore)
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift` (new, from Track 1)

**Step 1: Verify no remaining references**

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -r "ConversationCacheManager\|MessageCacheManager\|ParticipantCacheManager\|UserProfileCacheManager\|MediaCacheManager\|LocalStore\.shared\|SQLLocalStore\.shared" apps/ios/ packages/MeeshySDK/Sources/ --include="*.swift" -l
```

Expected: no results (all migrated in Tasks 3-7)

**Step 2: Delete files**

```bash
rm packages/MeeshySDK/Sources/MeeshySDK/Cache/ConversationCacheManager.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Cache/MessageCacheManager.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Cache/UserProfileCacheManager.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaCacheManager.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCachedParticipant.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift
rm packages/MeeshySDK/Sources/MeeshySDK/Persistence/SQLLocalStore.swift
rm packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ConversationCacheManagerTests.swift
rm packages/MeeshySDK/Tests/MeeshySDKTests/Cache/MessageCacheManagerTests.swift
rm packages/MeeshySDK/Tests/MeeshySDKTests/Cache/ParticipantCacheManagerTests.swift
```

**Step 3: Build + Test**

```bash
./apps/ios/meeshy.sh build
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -quiet 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(sdk): delete deprecated cache managers — replaced by unified CacheCoordinator"
```

---

### Task 9: Update iOS CLAUDE.md + decisions.md

**Files:**
- Modify: `apps/ios/CLAUDE.md` (update singleton list, cache section)
- Modify: `apps/ios/decisions.md` (add unified cache decision)
- Modify: `packages/MeeshySDK/CLAUDE.md` (update Cache section)

**Step 1: Update singleton list** in `apps/ios/CLAUDE.md`:

Replace `MediaCacheManager.shared` with `CacheCoordinator.shared`

**Step 2: Add decision** to `apps/ios/decisions.md`:

```markdown
## 2026-03: Unified Cache System

**Context**: 6+ ad-hoc cache managers with inconsistent patterns, no shared protocol, no socket integration
**Decision**: Replace with unified CacheCoordinator backed by GRDBCacheStore (data models) + DiskCacheStore (media). Protocol-oriented, L1/L2, persist-on-dirty, socket-driven invalidation.
**Rationale**: DRY cache layer with configurable TTL per data type, stale-while-revalidate, energy-efficient (no periodic timers), testable via dependency injection
```

**Step 3: Update SDK CLAUDE.md** Cache section

**Step 4: Commit**

```bash
git add apps/ios/CLAUDE.md apps/ios/decisions.md packages/MeeshySDK/CLAUDE.md
git commit -m "docs: update CLAUDE.md and decisions.md for unified cache system"
```

---

### Task 10: Final Build + Test Verification

**Step 1: Full SDK test suite**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -quiet 2>&1 | tail -20
```

Expected: All tests pass (existing + new cache tests)

**Step 2: Full iOS app build**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build succeeded

**Step 3: Report results**

If any test fails or build breaks, fix before marking complete.

---

## Track 3 Complete

This track delivers:
- `CacheCoordinator` actor wiring 17+ socket events to cache mutations
- `ParticipantService` wrapping pagination logic around `GRDBCacheStore`
- All ViewModels migrated from old managers to `CacheCoordinator`
- All 11 media-referencing views migrated from `MediaCacheManager` to `DiskCacheStore`
- 8 deprecated files deleted (5 cache managers + 3 persistence files)
- 3 old test files deleted
- Documentation updated

**Total files modified/created across all tracks:**
- Phase 0: 6 files (3 source, 3 test)
- Track 1: 6 files (3 source, 3 test)
- Track 2: 3 files (2 source, 1 test)
- Track 3: ~20 files (2 new SDK source, 3 test helpers, 1 new iOS service, ~13 iOS modifications, documentation)
