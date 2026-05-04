# Plan 1: Core Persistence — State Machine + Actor + GRDB + Store

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational persistence layer — formal state machine, GRDB write-through actor with SQLCipher WAL, observable message store, and dependency container — that Plans 2 and 3 build upon.

**Architecture:** Actor-isolated write-through persistence using Swift 6.2 actors + GRDB DatabasePool in WAL mode with SQLCipher encryption. MessageStore uses DatabaseRegionObservation to push changes to UI. All DB reads happen off-main via Task.detached. State machine is a pure Sendable struct with compile-safe transitions.

**Tech Stack:** Swift 6.2, GRDB 6.29.3, SQLCipher, XCTest

**Spec reference:** `docs/superpowers/specs/2026-05-04-ios-persistence-statemachine-design.md` (Sections 1, 2, 3, 6 partial)

---

## File Structure

### New Files (MeeshySDK)

| File | Responsibility |
|------|---------------|
| `Sources/MeeshySDK/Persistence/MessageState.swift` | MessageState enum + MessageEvent enum |
| `Sources/MeeshySDK/Persistence/MessageStateMachine.swift` | Pure state machine struct |
| `Sources/MeeshySDK/Persistence/MessageRecord.swift` | GRDB record (35+ fields) + Equatable via changeVersion |
| `Sources/MeeshySDK/Persistence/TranslationRecords.swift` | TranslationRecord, TranscriptionRecord, AudioTranslationRecord |
| `Sources/MeeshySDK/Persistence/PendingIdRecord.swift` | tempId → serverId mapping |
| `Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` | Actor + write-through + AsyncStream buffer |
| `Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift` | 6 GRDB migrations (messages, pending_ids, translations, transcriptions, audio_translations, local_attachments) |
| `Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift` | CTFramesetter-based pre-computed layout |

### New Files (App)

| File | Responsibility |
|------|---------------|
| `Meeshy/Core/DependencyContainer.swift` | Root DI, DatabasePool init, App Group path |
| `Meeshy/Features/Main/Stores/MessageStore.swift` | @Observable, DatabaseRegionObservation, anchor windowing, off-main reads |

### New Test Files

| File | Tests |
|------|-------|
| `Tests/MeeshySDKTests/Persistence/MessageStateMachineTests.swift` | ~15 tests |
| `Tests/MeeshySDKTests/Persistence/MessageRecordTests.swift` | ~5 tests |
| `Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift` | ~12 tests |
| `Tests/MeeshySDKTests/Persistence/BubbleLayoutEngineTests.swift` | ~8 tests |
| `Tests/MeeshySDKTests/Persistence/MessageDatabaseMigrationV2Tests.swift` | ~3 tests |

### Modified Files

| File | Changes |
|------|---------|
| `Sources/MeeshySDK/Persistence/AppDatabase.swift` | Add new migrations, switch to App Group path |
| `Meeshy/MeeshyApp.swift` | Init DependencyContainer at launch |

---

## Task 1: MessageState + MessageEvent enums

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageStateMachineTests.swift`

- [ ] **Step 1: Create MessageState enum**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift

import Foundation

/// Delivery state of a message — monotone progression for delivery, retry loop for failures
public enum MessageState: String, Codable, Sendable, Comparable {
    case draft
    case queued
    case sending
    case sent
    case delivered
    case read
    case failed

    private var ordinal: Int {
        switch self {
        case .draft: 0
        case .queued: 1
        case .sending: 2
        case .sent: 3
        case .delivered: 4
        case .read: 5
        case .failed: -1
        }
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.ordinal < rhs.ordinal
    }
}

/// Events that trigger state transitions
public enum MessageEvent: Sendable {
    case enqueue
    case startSending
    case serverAck(serverId: String, at: Date)
    case delivered(count: Int, at: Date)
    case readBy(userId: String, at: Date)
    case sendFailed(Error)
    case retry
    case retryExhausted
}
```

- [ ] **Step 2: Write basic MessageState tests**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageStateMachineTests.swift

import XCTest
@testable import MeeshySDK

final class MessageStateTests: XCTestCase {

    func test_comparable_sentIsGreaterThanSending() {
        XCTAssertTrue(MessageState.sent > MessageState.sending)
    }

    func test_comparable_readIsGreaterThanDelivered() {
        XCTAssertTrue(MessageState.read > MessageState.delivered)
    }

    func test_comparable_failedIsLessThanDraft() {
        XCTAssertTrue(MessageState.failed < MessageState.draft)
    }

    func test_codable_roundtrip() throws {
        let state = MessageState.delivered
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(MessageState.self, from: data)
        XCTAssertEqual(decoded, .delivered)
    }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageStateMachineTests.swift
git commit -m "feat(sdk): add MessageState + MessageEvent enums with Comparable"
```

---

## Task 2: MessageStateMachine — pure state transitions

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStateMachine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageStateMachineTests.swift`

- [ ] **Step 1: Write failing tests for happy path transitions**

Add to `MessageStateMachineTests.swift`:

```swift
final class MessageStateMachineTests: XCTestCase {

    // MARK: - Happy Path

    func test_apply_serverAck_fromSending_transitionsToSent() {
        var sm = MessageStateMachine(state: .sending)
        let result = sm.apply(.serverAck(serverId: "srv_123", at: Date()))
        XCTAssertEqual(result, .sent)
        XCTAssertEqual(sm.state, .sent)
        XCTAssertEqual(sm.serverId, "srv_123")
    }

    func test_apply_delivered_fromSent_transitionsToDelivered() {
        var sm = MessageStateMachine(state: .sent)
        let result = sm.apply(.delivered(count: 1, at: Date()))
        XCTAssertEqual(result, .delivered)
        XCTAssertNotNil(sm.deliveredAt)
    }

    func test_apply_readBy_fromDelivered_transitionsToRead() {
        var sm = MessageStateMachine(state: .delivered)
        let result = sm.apply(.readBy(userId: "u1", at: Date()))
        XCTAssertEqual(result, .read)
        XCTAssertNotNil(sm.readAt)
    }

    func test_apply_readBy_fromSent_skipsDelivered() {
        var sm = MessageStateMachine(state: .sent)
        let result = sm.apply(.readBy(userId: "u1", at: Date()))
        XCTAssertEqual(result, .read)
    }

    // MARK: - Retry Logic

    func test_apply_sendFailed_requeuesIfRetriesRemain() {
        var sm = MessageStateMachine(state: .sending)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertEqual(result, .queued)
        XCTAssertEqual(sm.retryCount, 1)
    }

    func test_apply_sendFailed_afterMaxRetries_transitionsToFailed() {
        var sm = MessageStateMachine(state: .sending, retryCount: 2)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertEqual(result, .failed)
        XCTAssertEqual(sm.retryCount, 3)
    }

    func test_apply_retry_fromFailed_resetsAndRequeues() {
        var sm = MessageStateMachine(state: .failed, retryCount: 3)
        let result = sm.apply(.retry)
        XCTAssertEqual(result, .queued)
        XCTAssertEqual(sm.retryCount, 0)
    }

    // MARK: - Invalid Transitions

    func test_apply_serverAck_fromRead_returnsNil() {
        var sm = MessageStateMachine(state: .read)
        let result = sm.apply(.serverAck(serverId: "srv", at: Date()))
        XCTAssertNil(result)
        XCTAssertEqual(sm.state, .read)
    }

    func test_apply_sendFailed_fromDelivered_returnsNil() {
        var sm = MessageStateMachine(state: .delivered)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertNil(result)
        XCTAssertEqual(sm.state, .delivered)
    }

    // MARK: - Monotonicity

    func test_fullLifecycle_stateNeverGoesBackward() {
        var sm = MessageStateMachine(state: .sending)
        let events: [MessageEvent] = [
            .serverAck(serverId: "srv_1", at: Date()),
            .delivered(count: 1, at: Date()),
            .readBy(userId: "u1", at: Date())
        ]
        var prev = sm.state
        for event in events {
            let next = sm.apply(event)
            XCTAssertNotNil(next)
            XCTAssertTrue(next! > prev)
            prev = next!
        }
    }

    // MARK: - Error Capture

    func test_sendFailed_capturesErrorDescription() {
        var sm = MessageStateMachine(state: .sending)
        _ = sm.apply(.sendFailed(TestError.timeout))
        XCTAssertEqual(sm.lastError, "timeout")
    }
}

private enum TestError: Error, LocalizedError {
    case network
    case timeout
    var errorDescription: String? { String(describing: self) }
}
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: FAIL — `MessageStateMachine` not defined

- [ ] **Step 3: Implement MessageStateMachine**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStateMachine.swift

import Foundation

/// Pure state machine — no side effects, no dependencies, fully testable
public struct MessageStateMachine: Sendable {
    public private(set) var state: MessageState
    public private(set) var retryCount: Int
    public private(set) var serverId: String?
    public private(set) var lastError: String?
    public private(set) var deliveredAt: Date?
    public private(set) var readAt: Date?

    public static let maxRetries = 3

    public init(
        state: MessageState,
        retryCount: Int = 0,
        serverId: String? = nil,
        lastError: String? = nil,
        deliveredAt: Date? = nil,
        readAt: Date? = nil
    ) {
        self.state = state
        self.retryCount = retryCount
        self.serverId = serverId
        self.lastError = lastError
        self.deliveredAt = deliveredAt
        self.readAt = readAt
    }

    /// Apply an event — returns the new state, or nil if the transition is invalid
    public mutating func apply(_ event: MessageEvent) -> MessageState? {
        switch (state, event) {
        case (.draft, .enqueue), (.draft, .startSending):
            state = .queued

        case (.queued, .startSending):
            state = .sending

        case (.sending, .serverAck(let id, _)):
            serverId = id
            state = .sent

        case (.sent, .delivered(let count, let at)) where count > 0:
            deliveredAt = at
            state = .delivered

        case (.delivered, .readBy(_, let at)):
            readAt = at
            state = .read

        case (.sent, .readBy(_, let at)):
            readAt = at
            state = .read

        case (.sending, .sendFailed(let error)):
            lastError = error.localizedDescription
            if retryCount < Self.maxRetries {
                retryCount += 1
                state = .queued
            } else {
                state = .failed
            }

        case (.failed, .retry):
            retryCount = 0
            state = .queued

        case (.queued, .retryExhausted):
            state = .failed

        default:
            return nil
        }
        return state
    }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All 11 MessageStateMachine tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStateMachine.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageStateMachineTests.swift
git commit -m "feat(sdk): add MessageStateMachine with compile-safe transitions"
```

---

## Task 3: MessageRecord — GRDB record with 35+ fields

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageRecordTests.swift`

- [ ] **Step 1: Write failing test for MessageRecord roundtrip**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageRecordTests.swift

import XCTest
import GRDB
@testable import MeeshySDK

final class MessageRecordTests: XCTestCase {

    func test_equatable_sameIdDifferentVersion_areNotEqual() {
        let a = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        let b = MessageRecordFactory.make(localId: "msg_1", changeVersion: 2)
        XCTAssertNotEqual(a, b)
    }

    func test_equatable_sameIdSameVersion_areEqual() {
        let a = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        let b = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        XCTAssertEqual(a, b)
    }

    func test_equatable_differentIdSameVersion_areNotEqual() {
        let a = MessageRecordFactory.make(localId: "msg_1", changeVersion: 1)
        let b = MessageRecordFactory.make(localId: "msg_2", changeVersion: 1)
        XCTAssertNotEqual(a, b)
    }

    func test_grdb_insertAndFetch_roundtrip() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        let record = MessageRecordFactory.make(localId: "test_rt", content: "Hello world")
        try dbQueue.write { db in try record.insert(db) }

        let fetched = try dbQueue.read { db in
            try MessageRecord.fetchOne(db, key: "test_rt")
        }

        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.localId, "test_rt")
        XCTAssertEqual(fetched?.content, "Hello world")
        XCTAssertEqual(fetched?.state, .sending)
    }

    func test_grdb_allFieldsPersist() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        var record = MessageRecordFactory.make(localId: "full_test")
        record.replyToId = "reply_1"
        record.forwardedFromId = "fwd_1"
        record.isEncrypted = true
        record.encryptionMode = "E2EE"
        record.effectFlags = 3
        record.pinnedAt = Date()
        record.pinnedBy = "admin"
        record.isEdited = true
        record.senderName = "Alice"
        record.senderColor = "#FF0000"

        try dbQueue.write { db in try record.insert(db) }

        let fetched = try dbQueue.read { db in
            try MessageRecord.fetchOne(db, key: "full_test")
        }!

        XCTAssertEqual(fetched.replyToId, "reply_1")
        XCTAssertEqual(fetched.forwardedFromId, "fwd_1")
        XCTAssertTrue(fetched.isEncrypted)
        XCTAssertEqual(fetched.encryptionMode, "E2EE")
        XCTAssertEqual(fetched.effectFlags, 3)
        XCTAssertNotNil(fetched.pinnedAt)
        XCTAssertEqual(fetched.pinnedBy, "admin")
        XCTAssertTrue(fetched.isEdited)
        XCTAssertEqual(fetched.senderName, "Alice")
        XCTAssertEqual(fetched.senderColor, "#FF0000")
    }
}

// MARK: - Factory

enum MessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "conv_default",
        senderId: String = "user_me",
        content: String? = "Test message",
        state: MessageState = .sending,
        createdAt: Date = Date(),
        changeVersion: Int64 = 0
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
            contentType: "text",
            state: state,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 0,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: changeVersion
        )
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: FAIL — `MessageRecord` not defined

- [ ] **Step 3: Implement MessageRecord**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift

import Foundation
import GRDB

public struct MessageRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "messages"

    // Identity
    public var localId: String
    public var serverId: String?
    public var conversationId: String
    public var senderId: String

    // Content
    public var content: String?
    public var originalLanguage: String
    public var messageType: String
    public var messageSource: String
    public var contentType: String

    // State machine
    public var state: MessageState
    public var retryCount: Int
    public var lastError: String?

    // Encryption
    public var isEncrypted: Bool
    public var encryptionMode: String?
    public var encryptedPayload: Data?

    // Reply / Forward
    public var replyToId: String?
    public var storyReplyToId: String?
    public var forwardedFromId: String?
    public var forwardedFromConversationId: String?
    public var replyToJson: Data?
    public var forwardedFromJson: Data?

    // Ephemeral / Effects
    public var expiresAt: Date?
    public var effectFlags: UInt32
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int

    // Edit / Delete
    public var isEdited: Bool
    public var editedAt: Date?
    public var deletedAt: Date?

    // Pin
    public var pinnedAt: Date?
    public var pinnedBy: String?

    // Sender metadata (denormalized for offline display)
    public var senderName: String?
    public var senderUsername: String?
    public var senderColor: String?
    public var senderAvatarURL: String?

    // Delivery tracking
    public var deliveredCount: Int
    public var readCount: Int
    public var deliveredToAllAt: Date?
    public var readByAllAt: Date?

    // Timestamps
    public var createdAt: Date
    public var sentAt: Date?
    public var deliveredAt: Date?
    public var readAt: Date?
    public var updatedAt: Date

    // Attachments + Reactions (JSON blobs)
    public var attachmentsJson: Data?
    public var reactionsJson: Data?
    public var reactionCount: Int
    public var currentUserReactionsJson: Data?
    public var mentionedUsersJson: Data?

    // Pre-computed layout (CTFramesetter)
    public var cachedBubbleWidth: Double?
    public var cachedBubbleHeight: Double?
    public var cachedLastLineWidth: Double?
    public var cachedLineCount: Int?
    public var cachedTimestampInline: Bool?
    public var layoutVersion: Int
    public var layoutMaxWidth: Double?

    // Change tracking
    public var changeVersion: Int64
}

// (O1) Equatable via changeVersion — O(1) per record, no blob comparison
extension MessageRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.localId == rhs.localId && lhs.changeVersion == rhs.changeVersion
    }
}
```

- [ ] **Step 4: Create PendingIdRecord**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingIdRecord.swift

import Foundation
import GRDB

public struct PendingIdRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "pending_ids"

    public var localId: String
    public var serverId: String
    public var conversationId: String
    public var reconciledAt: Date?
}
```

- [ ] **Step 5: Create TranslationRecords**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationRecords.swift

import Foundation
import GRDB

public struct TranslationRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "message_translations"

    public var id: String
    public var messageLocalId: String
    public var messageServerId: String?
    public var targetLanguage: String
    public var translatedContent: String
    public var translationModel: String
    public var confidenceScore: Double?
    public var sourceLanguage: String?
    public var receivedAt: Date
}

public struct TranscriptionRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "message_transcriptions"

    public var messageLocalId: String
    public var messageServerId: String?
    public var language: String
    public var text: String
    public var segmentsJson: Data?
    public var speakerCount: Int?
    public var receivedAt: Date
}

public struct AudioTranslationRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "message_audio_translations"

    public var id: String
    public var messageLocalId: String
    public var messageServerId: String?
    public var targetLanguage: String
    public var audioUrl: String?
    public var status: String
    public var receivedAt: Date
}
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: 4 MessageRecord tests PASS (migrations not yet created — tests use inline DatabaseQueue setup)

Note: Step 6 will fail because `MessageDatabaseMigrations` doesn't exist yet. That's Task 4. Mark this and proceed.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingIdRecord.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationRecords.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageRecordTests.swift
git commit -m "feat(sdk): add MessageRecord + PendingIdRecord + TranslationRecords GRDB models"
```

---

## Task 4: Database Migrations

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageDatabaseMigrationV2Tests.swift`

- [ ] **Step 1: Write failing migration test**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageDatabaseMigrationV2Tests.swift

import XCTest
import GRDB
@testable import MeeshySDK

final class MessageDatabaseMigrationV2Tests: XCTestCase {

    func test_migrations_createAllTables() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        try dbQueue.read { db in
            XCTAssertTrue(try db.tableExists("messages"))
            XCTAssertTrue(try db.tableExists("pending_ids"))
            XCTAssertTrue(try db.tableExists("message_translations"))
            XCTAssertTrue(try db.tableExists("message_transcriptions"))
            XCTAssertTrue(try db.tableExists("message_audio_translations"))
            XCTAssertTrue(try db.tableExists("local_attachments"))
        }
    }

    func test_migrations_messagesTableHasCorrectColumns() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        try dbQueue.read { db in
            let columns = try db.columns(in: "messages").map(\.name)
            XCTAssertTrue(columns.contains("localId"))
            XCTAssertTrue(columns.contains("conversationId"))
            XCTAssertTrue(columns.contains("state"))
            XCTAssertTrue(columns.contains("changeVersion"))
            XCTAssertTrue(columns.contains("cachedBubbleWidth"))
            XCTAssertTrue(columns.contains("cachedTimestampInline"))
            XCTAssertTrue(columns.contains("reactionsJson"))
        }
    }

    func test_migrations_indexesCreated() throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)

        try dbQueue.read { db in
            let indexes = try db.indexes(on: "messages").map(\.name)
            XCTAssertTrue(indexes.contains("idx_msg_conv_date"))
            XCTAssertTrue(indexes.contains("idx_msg_state"))
        }
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

Expected: FAIL — `MessageDatabaseMigrations` not defined

- [ ] **Step 3: Implement MessageDatabaseMigrations**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift

import Foundation
import GRDB

public enum MessageDatabaseMigrations {

    /// Run all message-layer migrations on the given database
    public static func runAll(on db: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        try migrator.migrate(db)
    }

    /// Register migrations without running — for use with shared migrator
    public static func registerAll(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("msg_v1_messages") { db in
            try db.create(table: "messages") { t in
                t.column("localId", .text).primaryKey()
                t.column("serverId", .text).indexed()
                t.column("conversationId", .text).notNull()
                t.column("senderId", .text).notNull()
                t.column("content", .text)
                t.column("originalLanguage", .text).notNull().defaults(to: "fr")
                t.column("messageType", .text).notNull().defaults(to: "text")
                t.column("messageSource", .text).notNull().defaults(to: "user")
                t.column("contentType", .text).notNull().defaults(to: "text")
                t.column("state", .text).notNull()
                t.column("retryCount", .integer).notNull().defaults(to: 0)
                t.column("lastError", .text)
                t.column("isEncrypted", .boolean).notNull().defaults(to: false)
                t.column("encryptionMode", .text)
                t.column("encryptedPayload", .blob)
                t.column("replyToId", .text)
                t.column("storyReplyToId", .text)
                t.column("forwardedFromId", .text)
                t.column("forwardedFromConversationId", .text)
                t.column("replyToJson", .blob)
                t.column("forwardedFromJson", .blob)
                t.column("expiresAt", .datetime)
                t.column("effectFlags", .integer).notNull().defaults(to: 0)
                t.column("maxViewOnceCount", .integer)
                t.column("viewOnceCount", .integer).notNull().defaults(to: 0)
                t.column("isEdited", .boolean).notNull().defaults(to: false)
                t.column("editedAt", .datetime)
                t.column("deletedAt", .datetime)
                t.column("pinnedAt", .datetime)
                t.column("pinnedBy", .text)
                t.column("senderName", .text)
                t.column("senderUsername", .text)
                t.column("senderColor", .text)
                t.column("senderAvatarURL", .text)
                t.column("deliveredCount", .integer).notNull().defaults(to: 0)
                t.column("readCount", .integer).notNull().defaults(to: 0)
                t.column("deliveredToAllAt", .datetime)
                t.column("readByAllAt", .datetime)
                t.column("createdAt", .datetime).notNull()
                t.column("sentAt", .datetime)
                t.column("deliveredAt", .datetime)
                t.column("readAt", .datetime)
                t.column("updatedAt", .datetime).notNull()
                t.column("attachmentsJson", .blob)
                t.column("reactionsJson", .blob)
                t.column("reactionCount", .integer).notNull().defaults(to: 0)
                t.column("currentUserReactionsJson", .blob)
                t.column("mentionedUsersJson", .blob)
                t.column("cachedBubbleWidth", .double)
                t.column("cachedBubbleHeight", .double)
                t.column("cachedLastLineWidth", .double)
                t.column("cachedLineCount", .integer)
                t.column("cachedTimestampInline", .boolean)
                t.column("layoutVersion", .integer).notNull().defaults(to: 0)
                t.column("layoutMaxWidth", .double)
                t.column("changeVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_msg_conv_date", on: "messages",
                          columns: ["conversationId", "createdAt"])
            try db.create(index: "idx_msg_state", on: "messages", columns: ["state"])
        }

        migrator.registerMigration("msg_v1_pending_ids") { db in
            try db.create(table: "pending_ids") { t in
                t.column("localId", .text).primaryKey()
                t.column("serverId", .text).notNull().indexed()
                t.column("conversationId", .text).notNull()
                t.column("reconciledAt", .datetime)
            }
        }

        migrator.registerMigration("msg_v1_translations") { db in
            try db.create(table: "message_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("messageServerId", .text)
                t.column("targetLanguage", .text).notNull()
                t.column("translatedContent", .text).notNull()
                t.column("translationModel", .text).notNull()
                t.column("confidenceScore", .double)
                t.column("sourceLanguage", .text)
                t.column("receivedAt", .datetime).notNull()
            }
            try db.create(index: "idx_trans_msg_lang", on: "message_translations",
                          columns: ["messageLocalId", "targetLanguage"], unique: true)
        }

        migrator.registerMigration("msg_v1_transcriptions") { db in
            try db.create(table: "message_transcriptions") { t in
                t.column("messageLocalId", .text).primaryKey()
                t.column("messageServerId", .text)
                t.column("language", .text).notNull()
                t.column("text", .text).notNull()
                t.column("segmentsJson", .blob)
                t.column("speakerCount", .integer)
                t.column("receivedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("msg_v1_audio_translations") { db in
            try db.create(table: "message_audio_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("messageServerId", .text)
                t.column("targetLanguage", .text).notNull()
                t.column("audioUrl", .text)
                t.column("status", .text).notNull()
                t.column("receivedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("msg_v1_local_attachments") { db in
            try db.create(table: "local_attachments") { t in
                t.column("localId", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("type", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("fileName", .text).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("localPath", .text).notNull()
                t.column("thumbnailPath", .text)
                t.column("width", .double)
                t.column("height", .double)
                t.column("duration", .double)
                t.column("createdAt", .datetime).notNull()
                t.column("remoteUrl", .text)
                t.column("uploadProgress", .double)
                t.column("uploadState", .text).notNull().defaults(to: "pending")
            }
        }
    }
}
```

- [ ] **Step 4: Run tests — verify they pass (including Task 3 tests)**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All migration tests + MessageRecord roundtrip tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessageDatabaseMigrationV2Tests.swift
git commit -m "feat(sdk): add GRDB migrations for 6 message-layer tables"
```

---

## Task 5: MessagePersistenceActor — write-through with AsyncStream

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift`

- [ ] **Step 1: Write failing tests for insert + applyEvent**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift

import XCTest
import GRDB
@testable import MeeshySDK

final class MessagePersistenceActorTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbPool: DatabasePool!

    override func setUp() async throws {
        dbPool = try DatabasePool(path: ":memory:")
        try MessageDatabaseMigrations.runAll(on: dbPool)
        actor = MessagePersistenceActor(dbPool: dbPool)
    }

    // MARK: - Insert

    func test_insertOptimistic_persistsImmediately() async throws {
        let record = MessageRecordFactory.make(localId: "temp_001", conversationId: "conv_1")
        try await actor.insertOptimistic(record)

        let fetched = try actor.messages(for: "conv_1", limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].localId, "temp_001")
        XCTAssertEqual(fetched[0].state, .sending)
    }

    // MARK: - Apply Event

    func test_applyEvent_serverAck_updatesStateAndPersists() async throws {
        let record = MessageRecordFactory.make(localId: "temp_002")
        try await actor.insertOptimistic(record)

        let newState = try await actor.applyEvent(localId: "temp_002",
            event: .serverAck(serverId: "srv_abc", at: Date()))

        XCTAssertEqual(newState, .sent)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .sent)
        XCTAssertEqual(fetched[0].serverId, "srv_abc")
        XCTAssertEqual(fetched[0].changeVersion, 1)
    }

    func test_applyEvent_invalidTransition_returnsNil() async throws {
        let record = MessageRecordFactory.make(localId: "temp_003", state: .read)
        try await actor.insertOptimistic(record)

        let result = try await actor.applyEvent(localId: "temp_003", event: .startSending)
        XCTAssertNil(result)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .read)
    }

    func test_applyEvent_nonexistentId_returnsNil() async throws {
        let result = try await actor.applyEvent(localId: "nope", event: .startSending)
        XCTAssertNil(result)
    }

    // MARK: - Pending IDs

    func test_serverAck_createsPendingIdRecord() async throws {
        let record = MessageRecordFactory.make(localId: "temp_004")
        try await actor.insertOptimistic(record)
        _ = try await actor.applyEvent(localId: "temp_004",
            event: .serverAck(serverId: "srv_pid", at: Date()))

        let serverId = try actor.resolveServerId(for: "temp_004")
        XCTAssertEqual(serverId, "srv_pid")

        let localId = try actor.resolveLocalId(forServerId: "srv_pid")
        XCTAssertEqual(localId, "temp_004")
    }

    // MARK: - Translations

    func test_saveTranslation_persists() async throws {
        let translation = TranslationRecord(
            id: "tr_1", messageLocalId: "msg_1", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Hello",
            translationModel: "nllb-200", confidenceScore: 0.95,
            sourceLanguage: "fr", receivedAt: Date()
        )
        try await actor.saveTranslation(translation)

        let fetched = try actor.translations(for: "msg_1")
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].translatedContent, "Hello")
    }

    // MARK: - Edit / Delete

    func test_markEdited_updatesContentAndFlag() async throws {
        let record = MessageRecordFactory.make(localId: "edit_1", content: "Original")
        try await actor.insertOptimistic(record)

        try await actor.markEdited(localId: "edit_1", newContent: "Edited", editedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].content, "Edited")
        XCTAssertTrue(fetched[0].isEdited)
    }

    func test_markDeleted_clearsContentAndSetsTimestamp() async throws {
        let record = MessageRecordFactory.make(localId: "del_1", content: "Delete me")
        try await actor.insertOptimistic(record)

        try await actor.markDeleted(localId: "del_1", deletedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertNil(fetched[0].content)
        XCTAssertNotNil(fetched[0].deletedAt)
    }

    // MARK: - Reactions

    func test_updateReactions_persistsJsonAndCount() async throws {
        let record = MessageRecordFactory.make(localId: "react_1")
        try await actor.insertOptimistic(record)

        let reactionsJson = try JSONEncoder().encode(["👍": 3, "❤️": 1])
        try await actor.updateReactions(localId: "react_1", reactionsJson: reactionsJson,
                                         reactionCount: 4, currentUserReactionsJson: nil)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].reactionCount, 4)
        XCTAssertNotNil(fetched[0].reactionsJson)
    }

    // MARK: - Concurrent Safety

    func test_100ConcurrentInserts_noCorruption() async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<100 {
                group.addTask {
                    let record = MessageRecordFactory.make(
                        localId: "concurrent_\(i)", conversationId: "conv_stress")
                    try await self.actor.insertOptimistic(record)
                }
            }
            try await group.waitForAll()
        }

        let all = try actor.messages(for: "conv_stress", limit: 200)
        XCTAssertEqual(all.count, 100)
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

Expected: FAIL — `MessagePersistenceActor` not defined

- [ ] **Step 3: Implement MessagePersistenceActor**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift

import Foundation
import GRDB

public actor MessagePersistenceActor {
    private let dbPool: DatabasePool

    // (C6) AsyncStream serial buffer for high-frequency writes
    private let writeStream: AsyncStream<WriteOperation>
    private let writeContinuation: AsyncStream<WriteOperation>.Continuation
    private var processorTask: Task<Void, Never>?

    enum WriteOperation: Sendable {
        case reconcileBatch([IncomingMessageData])
        case batchDeliveryUpdate(conversationId: String, event: MessageEvent)
    }

    public struct IncomingMessageData: Sendable {
        public let id: String
        public let conversationId: String
        public let senderId: String
        public let content: String?
        public let createdAt: Date
        public let computedState: MessageState

        public init(id: String, conversationId: String, senderId: String,
                    content: String?, createdAt: Date, computedState: MessageState) {
            self.id = id
            self.conversationId = conversationId
            self.senderId = senderId
            self.content = content
            self.createdAt = createdAt
            self.computedState = computedState
        }
    }

    public init(dbPool: DatabasePool) {
        self.dbPool = dbPool
        let (stream, continuation) = AsyncStream.makeStream(of: WriteOperation.self)
        self.writeStream = stream
        self.writeContinuation = continuation
        startProcessor()
    }

    private func startProcessor() {
        processorTask = Task { [weak self, writeStream] in
            for await op in writeStream {
                guard let self else { break }
                switch op {
                case .reconcileBatch(let messages):
                    try? await self.reconcileBatchSync(messages)
                case .batchDeliveryUpdate(let convId, let event):
                    try? await self.batchDeliverySync(conversationId: convId, event: event)
                }
            }
        }
    }

    // MARK: - Synchronous Writes (direct, for operations needing return values)

    public func insertOptimistic(_ record: MessageRecord) throws {
        try dbPool.write { db in try record.insert(db) }
    }

    public func applyEvent(localId: String, event: MessageEvent) throws -> MessageState? {
        try dbPool.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return nil }

            var machine = MessageStateMachine(
                state: record.state,
                retryCount: record.retryCount,
                serverId: record.serverId,
                lastError: record.lastError,
                deliveredAt: record.deliveredAt,
                readAt: record.readAt
            )

            guard let newState = machine.apply(event) else { return nil }

            record.state = newState
            record.retryCount = machine.retryCount
            record.serverId = machine.serverId
            record.lastError = machine.lastError
            record.deliveredAt = machine.deliveredAt ?? record.deliveredAt
            record.readAt = machine.readAt ?? record.readAt
            record.updatedAt = Date()
            record.changeVersion += 1

            if case .serverAck(let serverId, let at) = event {
                record.serverId = serverId
                record.sentAt = at
                try PendingIdRecord(
                    localId: localId, serverId: serverId,
                    conversationId: record.conversationId, reconciledAt: nil
                ).insert(db)
            }

            try record.update(db)
            return newState
        }
    }

    // MARK: - Buffered Writes (via AsyncStream, for socket burst handling)

    public func bufferIncoming(_ messages: [IncomingMessageData]) {
        writeContinuation.yield(.reconcileBatch(messages))
    }

    public func bufferBatchDelivery(conversationId: String, event: MessageEvent) {
        writeContinuation.yield(.batchDeliveryUpdate(conversationId: conversationId, event: event))
    }

    private func reconcileBatchSync(_ messages: [IncomingMessageData]) throws {
        try dbPool.write { db in
            for msg in messages {
                let existingLocalId = try PendingIdRecord
                    .filter(Column("serverId") == msg.id)
                    .fetchOne(db)?.localId

                if let localId = existingLocalId,
                   var existing = try MessageRecord.fetchOne(db, key: localId) {
                    existing.state = max(existing.state, msg.computedState)
                    existing.content = msg.content
                    existing.updatedAt = Date()
                    existing.changeVersion += 1
                    try existing.update(db)
                } else {
                    var record = MessageRecord(
                        localId: msg.id, serverId: msg.id,
                        conversationId: msg.conversationId,
                        senderId: msg.senderId,
                        content: msg.content,
                        originalLanguage: "fr", messageType: "text",
                        messageSource: "user", contentType: "text",
                        state: msg.computedState, retryCount: 0, lastError: nil,
                        isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                        replyToId: nil, storyReplyToId: nil,
                        forwardedFromId: nil, forwardedFromConversationId: nil,
                        replyToJson: nil, forwardedFromJson: nil,
                        expiresAt: nil, effectFlags: 0,
                        maxViewOnceCount: nil, viewOnceCount: 0,
                        isEdited: false, editedAt: nil, deletedAt: nil,
                        pinnedAt: nil, pinnedBy: nil,
                        senderName: nil, senderUsername: nil,
                        senderColor: nil, senderAvatarURL: nil,
                        deliveredCount: 0, readCount: 0,
                        deliveredToAllAt: nil, readByAllAt: nil,
                        createdAt: msg.createdAt, sentAt: nil,
                        deliveredAt: nil, readAt: nil, updatedAt: Date(),
                        attachmentsJson: nil, reactionsJson: nil,
                        reactionCount: 0, currentUserReactionsJson: nil,
                        mentionedUsersJson: nil,
                        cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                        cachedLastLineWidth: nil, cachedLineCount: nil,
                        cachedTimestampInline: nil,
                        layoutVersion: 0, layoutMaxWidth: nil,
                        changeVersion: 0
                    )
                    try record.insert(db)
                }
            }
        }
    }

    private func batchDeliverySync(conversationId: String, event: MessageEvent) throws {
        try dbPool.write { db in
            let records = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter([MessageState.sending.rawValue, MessageState.sent.rawValue]
                    .contains(Column("state")))
                .fetchAll(db)

            for var record in records {
                var machine = MessageStateMachine(
                    state: record.state, retryCount: record.retryCount,
                    serverId: record.serverId
                )
                if let _ = machine.apply(event) {
                    record.state = machine.state
                    record.deliveredAt = machine.deliveredAt
                    record.readAt = machine.readAt
                    record.updatedAt = Date()
                    record.changeVersion += 1
                    try record.update(db)
                }
            }
        }
    }

    // MARK: - Translation / Transcription writes

    public func saveTranslation(_ translation: TranslationRecord) throws {
        try dbPool.write { db in try translation.save(db) }
    }

    public func saveTranscription(_ transcription: TranscriptionRecord) throws {
        try dbPool.write { db in try transcription.save(db) }
    }

    public func saveAudioTranslation(_ audio: AudioTranslationRecord) throws {
        try dbPool.write { db in try audio.save(db) }
    }

    // MARK: - Edit / Delete / Reactions / ViewOnce

    public func markEdited(localId: String, newContent: String, editedAt: Date) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET content = ?, isEdited = 1, editedAt = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [newContent, editedAt, Date(), localId]
            )
        }
    }

    public func markDeleted(localId: String, deletedAt: Date) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = ?, content = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [deletedAt, Date(), localId]
            )
        }
    }

    public func updateReactions(localId: String, reactionsJson: Data,
                                 reactionCount: Int, currentUserReactionsJson: Data?) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET reactionsJson = ?, reactionCount = ?,
                    currentUserReactionsJson = ?, updatedAt = ?,
                    changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [reactionsJson, reactionCount, currentUserReactionsJson, Date(), localId]
            )
        }
    }

    public func updateViewOnceCount(localId: String, count: Int) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET viewOnceCount = ?, updatedAt = ?,
                    changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [count, Date(), localId]
            )
        }
    }

    public func updateLayout(localId: String, width: Double, height: Double,
                              lastLineWidth: Double, lineCount: Int, timestampInline: Bool,
                              epoch: Int, maxWidth: Double) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET cachedBubbleWidth = ?, cachedBubbleHeight = ?,
                    cachedLastLineWidth = ?, cachedLineCount = ?, cachedTimestampInline = ?,
                    layoutVersion = ?, layoutMaxWidth = ? WHERE localId = ?
                    """,
                arguments: [width, height, lastLineWidth, lineCount, timestampInline,
                           epoch, maxWidth, localId]
            )
        }
    }

    // MARK: - Reads (nonisolated — zero contention with writer)

    public nonisolated var reader: DatabasePool { dbPool }

    public nonisolated func messages(for conversationId: String, before: Date? = nil,
                                      after: Date? = nil, limit: Int = 50) throws -> [MessageRecord] {
        try dbPool.read { db in
            var query = MessageRecord
                .filter(Column("conversationId") == conversationId)
                .order(Column("createdAt").desc)
                .limit(limit)
            if let before { query = query.filter(Column("createdAt") < before) }
            if let after { query = query.filter(Column("createdAt") > after) }
            return try query.fetchAll(db)
        }
    }

    public nonisolated func translations(for messageLocalId: String) throws -> [TranslationRecord] {
        try dbPool.read { db in
            try TranslationRecord.filter(Column("messageLocalId") == messageLocalId).fetchAll(db)
        }
    }

    public nonisolated func resolveServerId(for localId: String) throws -> String? {
        try dbPool.read { db in
            try PendingIdRecord.fetchOne(db, key: localId)?.serverId
        }
    }

    public nonisolated func resolveLocalId(forServerId serverId: String) throws -> String? {
        try dbPool.read { db in
            try PendingIdRecord.filter(Column("serverId") == serverId).fetchOne(db)?.localId
        }
    }

    deinit {
        writeContinuation.finish()
        processorTask?.cancel()
    }
}
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All 12 MessagePersistenceActor tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/MessagePersistenceActorTests.swift
git commit -m "feat(sdk): add MessagePersistenceActor with write-through + AsyncStream"
```

---

## Task 6: BubbleLayoutEngine — CTFramesetter

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/BubbleLayoutEngineTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/BubbleLayoutEngineTests.swift

import XCTest
@testable import MeeshySDK

final class BubbleLayoutEngineTests: XCTestCase {

    private let maxWidth: CGFloat = 393

    func test_textMessage_shortContent_fitsReasonableSize() {
        let result = BubbleLayoutEngine.computeLayout(
            content: "Hello", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(result.size.width, 0)
        XCTAssertLessThan(result.size.width, maxWidth * 0.5)
        XCTAssertGreaterThan(result.size.height, 20)
        XCTAssertEqual(result.lineCount, 1)
    }

    func test_textMessage_longContent_multipleLines() {
        let longText = String(repeating: "word ", count: 100)
        let result = BubbleLayoutEngine.computeLayout(
            content: longText, contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(result.lineCount, 5)
        XCTAssertGreaterThan(result.size.height, 100)
    }

    func test_textMessage_shortText_timestampInline() {
        let result = BubbleLayoutEngine.computeLayout(
            content: "Hi", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertTrue(result.timestampInline)
    }

    func test_textMessage_fullWidthLastLine_timestampNotInline() {
        let text = String(repeating: "A", count: 200)
        let result = BubbleLayoutEngine.computeLayout(
            content: text, contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        // With a full-width last line, timestamp should NOT be inline
        // (depends on exact font metrics, but with 200 chars it's likely full)
        XCTAssertFalse(result.timestampInline)
    }

    func test_imageMessage_respectsAspectRatio() {
        let result = BubbleLayoutEngine.computeLayout(
            content: nil, contentType: "image",
            attachmentDimensions: CGSize(width: 1920, height: 1080),
            replyPreview: false, reactionCount: 0, maxWidth: maxWidth
        )
        let mediaHeight = result.size.height - 18 // minus timestamp
        let ratio = result.size.width / mediaHeight
        XCTAssertEqual(ratio, 1920.0 / 1080.0, accuracy: 0.2)
    }

    func test_imageMessage_nilDimensions_fallback() {
        let result = BubbleLayoutEngine.computeLayout(
            content: nil, contentType: "image",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertEqual(result.size.width, 200, accuracy: 1)
    }

    func test_reactionBar_addsHeight() {
        let without = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        let with = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 3, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(with.size.height, without.size.height)
    }

    func test_replyPreview_addsHeight() {
        let without = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        let with = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: true,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(with.size.height, without.size.height)
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

Expected: FAIL — `BubbleLayoutEngine` not defined

- [ ] **Step 3: Implement BubbleLayoutEngine**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift

import CoreText
import Foundation

#if canImport(UIKit)
import UIKit
#endif

public enum BubbleLayoutEngine {

    public struct LayoutResult: Sendable {
        public let size: CGSize
        public let lastLineWidth: CGFloat
        public let lineCount: Int
        public let timestampInline: Bool
    }

    public static let timestampWidth: CGFloat = 52
    public static let timestampInlineGap: CGFloat = 8
    public static var globalLayoutEpoch: Int = 1

    @MainActor
    public static func invalidateAllLayouts() {
        globalLayoutEpoch += 1
    }

    /// Compute bubble size via CTFramesetter — thread-safe, call from any thread
    public static func computeLayout(
        content: String?,
        contentType: String,
        attachmentDimensions: CGSize?,
        replyPreview: Bool,
        reactionCount: Int,
        maxWidth: CGFloat
    ) -> LayoutResult {
        let bubblePadding: CGFloat = 12
        let timestampRowHeight: CGFloat = 18
        let replyPreviewHeight: CGFloat = replyPreview ? 44 : 0
        let reactionBarHeight: CGFloat = reactionCount > 0 ? 28 : 0
        let contentMaxWidth = maxWidth * 0.75 - (bubblePadding * 2)

        switch contentType {
        case "text":
            guard let text = content, !text.isEmpty else {
                return LayoutResult(
                    size: CGSize(width: 80, height: timestampRowHeight + bubblePadding * 2),
                    lastLineWidth: 0, lineCount: 0, timestampInline: false
                )
            }

            let font = CTFontCreateWithName("SFProText-Regular" as CFString, 16, nil)
            let attrString = CFAttributedStringCreate(
                nil, text as CFString,
                [kCTFontAttributeName: font] as CFDictionary
            )!
            let framesetter = CTFramesetterCreateWithAttributedString(attrString)

            var fitRange = CFRange()
            let textSize = CTFramesetterSuggestFrameSizeWithConstraints(
                framesetter,
                CFRange(location: 0, length: CFAttributedStringGetLength(attrString)),
                nil,
                CGSize(width: contentMaxWidth, height: .greatestFiniteMagnitude),
                &fitRange
            )

            let path = CGPath(
                rect: CGRect(origin: .zero,
                             size: CGSize(width: contentMaxWidth, height: textSize.height + 100)),
                transform: nil
            )
            let frame = CTFramesetterCreateFrame(
                framesetter,
                CFRange(location: 0, length: CFAttributedStringGetLength(attrString)),
                path, nil
            )
            let lines = CTFrameGetLines(frame) as! [CTLine]
            let lineCount = lines.count

            var lastLineWidth: CGFloat = 0
            if let lastLine = lines.last {
                var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
                lastLineWidth = CGFloat(CTLineGetTypographicBounds(lastLine, &ascent, &descent, &leading))
            }

            let spaceForTimestamp = contentMaxWidth - lastLineWidth
            let timestampInline = spaceForTimestamp >= (timestampWidth + timestampInlineGap)

            let textHeight = ceil(textSize.height)
            let totalHeight = textHeight
                + (timestampInline ? 0 : timestampRowHeight)
                + replyPreviewHeight
                + reactionBarHeight
                + bubblePadding * 2

            let totalWidth = ceil(max(
                textSize.width,
                timestampInline
                    ? lastLineWidth + timestampWidth + timestampInlineGap
                    : timestampWidth
            )) + bubblePadding * 2

            return LayoutResult(
                size: CGSize(width: min(totalWidth, maxWidth * 0.75), height: totalHeight),
                lastLineWidth: lastLineWidth,
                lineCount: lineCount,
                timestampInline: timestampInline
            )

        case "image", "video":
            guard let dims = attachmentDimensions else {
                return LayoutResult(
                    size: CGSize(width: 200, height: 200 + timestampRowHeight + reactionBarHeight),
                    lastLineWidth: 200, lineCount: 0, timestampInline: true
                )
            }
            let maxMediaWidth = maxWidth * 0.65
            let maxMediaHeight: CGFloat = 300
            let ratio = min(maxMediaWidth / dims.width, maxMediaHeight / dims.height, 1.0)
            return LayoutResult(
                size: CGSize(width: dims.width * ratio,
                             height: dims.height * ratio + timestampRowHeight + reactionBarHeight),
                lastLineWidth: dims.width * ratio,
                lineCount: 0,
                timestampInline: true
            )

        case "audio":
            return LayoutResult(
                size: CGSize(width: maxWidth * 0.65,
                             height: 56 + timestampRowHeight + reactionBarHeight),
                lastLineWidth: maxWidth * 0.65,
                lineCount: 0,
                timestampInline: true
            )

        default:
            return LayoutResult(
                size: CGSize(width: maxWidth * 0.6, height: 60 + reactionBarHeight),
                lastLineWidth: maxWidth * 0.6,
                lineCount: 0,
                timestampInline: false
            )
        }
    }
}
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All 8 BubbleLayoutEngine tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/BubbleLayoutEngineTests.swift
git commit -m "feat(sdk): add BubbleLayoutEngine with CTFramesetter + timestamp inline"
```

---

## Task 7: DependencyContainer — App Group DatabasePool

**Files:**
- Create: `apps/ios/Meeshy/Core/DependencyContainer.swift`

- [ ] **Step 1: Create DependencyContainer**

```swift
// apps/ios/Meeshy/Core/DependencyContainer.swift

import Foundation
import GRDB
import MeeshySDK

@MainActor
final class DependencyContainer {
    static let shared = DependencyContainer()

    let dbPool: DatabasePool
    let messagePersistence: MessagePersistenceActor

    private init() {
        let dbPath = Self.databasePath()
        let config = Self.dbConfig()

        do {
            let pool = try DatabasePool(path: dbPath, configuration: config)
            try MessageDatabaseMigrations.runAll(on: pool)
            self.dbPool = pool
            self.messagePersistence = MessagePersistenceActor(dbPool: pool)
        } catch {
            fatalError("Failed to initialize message database: \(error)")
        }
    }

    // MARK: - App Group shared path (O6)

    static func databasePath() -> String {
        let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
        )!
        let dbDir = container.appendingPathComponent("Database")
        try? FileManager.default.createDirectory(at: dbDir, withIntermediateDirectories: true)
        return dbDir.appendingPathComponent("meeshy_messages.sqlite").path
    }

    // MARK: - Database config (O7, N7, N8)

    static func dbConfig() -> Configuration {
        var config = Configuration()
        config.maximumReaderCount = min(ProcessInfo.processInfo.activeProcessorCount * 2, 16)
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA synchronous = NORMAL")
            try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
            try db.execute(sql: "PRAGMA wal_autocheckpoint = 1000")
        }
        return config
    }
}
```

Note: SQLCipher encryption (via `db.usePassphrase()`) will be added in Plan 2 when the KeychainManager integration is wired up. For now, the DB is unencrypted for testability.

- [ ] **Step 2: Commit**

```bash
git add apps/ios/Meeshy/Core/DependencyContainer.swift
git commit -m "feat(ios): add DependencyContainer with App Group DatabasePool"
```

---

## Task 8: MessageStore — @Observable + DatabaseRegionObservation

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift`

- [ ] **Step 1: Implement MessageStore**

```swift
// apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift

import Foundation
import Observation
import Combine
import GRDB
import MeeshySDK

@Observable
@MainActor
public final class MessageStore {
    static let windowSize = 200
    static let prefetchThreshold = 30

    // MARK: - Public State

    private(set) var messages: [MessageRecord] = []
    private(set) var sections: [MessageSection] = []
    private(set) var unreadBelowCount: Int = 0
    var currentVisibleMessageIds: Set<String> = []
    var isUserScrolling = false

    // MARK: - Internal

    let conversationId: String
    private let persistence: MessagePersistenceActor
    private var windowAnchor: Date?
    private var _idIndex: [String: Int]?
    private var regionCancellable: AnyDatabaseCancellable?

    // Change signal for UICollectionView observation
    let messagesDidChange = PassthroughSubject<Void, Never>()

    struct MessageSection: Sendable {
        let date: DateComponents
        let messageIds: [String]
    }

    init(conversationId: String, persistence: MessagePersistenceActor) {
        self.conversationId = conversationId
        self.persistence = persistence
    }

    // MARK: - Observation

    func startObserving(dbPool: DatabasePool) {
        let convId = conversationId
        let region = MessageRecord
            .filter(Column("conversationId") == convId)
            .databaseRegion

        var refreshTask: Task<Void, Never>?

        regionCancellable = DatabaseRegionObservation(tracking: region)
            .start(in: dbPool) { [weak self] _ in
                refreshTask?.cancel()
                refreshTask = Task { [weak self] in
                    guard let self else { return }
                    let delay: Duration = self.isUserScrolling
                        ? .milliseconds(200)
                        : .milliseconds(16)
                    try? await Task.sleep(for: delay)
                    guard !Task.isCancelled else { return }
                    await self.refreshFromDB()
                }
            }
    }

    func stopObserving() {
        regionCancellable = nil
    }

    // MARK: - Off-main DB read + progressive decrypt

    private func refreshFromDB() async {
        let convId = conversationId
        let anchor = windowAnchor
        let windowSize = Self.windowSize
        let reader = persistence.reader

        let newRecords = await Task.detached(priority: .userInitiated) {
            if let anchor {
                return try? reader.read { db in
                    try MessageRecord
                        .filter(Column("conversationId") == convId)
                        .filter(Column("createdAt") >= anchor)
                        .order(Column("createdAt").asc)
                        .limit(windowSize)
                        .fetchAll(db)
                }
            } else {
                return try? reader.read { db in
                    try Array(MessageRecord
                        .filter(Column("conversationId") == convId)
                        .order(Column("createdAt").desc)
                        .limit(windowSize)
                        .fetchAll(db)
                        .reversed())
                }
            }
        }.value

        guard let newRecords, newRecords != messages else { return }

        messages = newRecords
        _idIndex = nil
        recomputeSections()
        messagesDidChange.send()
    }

    // MARK: - Load Initial

    func loadInitial() async {
        await refreshFromDB()
    }

    // MARK: - Pagination

    func loadOlder(before: Date) async -> Bool {
        let convId = conversationId
        let reader = persistence.reader

        let older = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try MessageRecord
                    .filter(Column("conversationId") == convId)
                    .filter(Column("createdAt") < before)
                    .order(Column("createdAt").desc)
                    .limit(50)
                    .fetchAll(db)
            }
        }.value

        guard let older, !older.isEmpty else { return false }
        windowAnchor = older.last?.createdAt
        await refreshFromDB()
        return true
    }

    // MARK: - Lookup

    func index(of localId: String) -> Int? {
        if _idIndex == nil {
            var idx = [String: Int](minimumCapacity: messages.count)
            for (i, m) in messages.enumerated() { idx[m.localId] = i }
            _idIndex = idx
        }
        return _idIndex?[localId]
    }

    func message(for localId: String) -> MessageRecord? {
        guard let i = index(of: localId) else { return nil }
        return messages[i]
    }

    func post(for id: String) -> MessageRecord? {
        message(for: id)
    }

    // MARK: - Sections

    private func recomputeSections() {
        let calendar = Calendar.current
        var grouped: [(DateComponents, [String])] = []
        var currentDate: DateComponents?
        var currentIds: [String] = []

        for msg in messages {
            let components = calendar.dateComponents([.year, .month, .day], from: msg.createdAt)
            if components == currentDate {
                currentIds.append(msg.localId)
            } else {
                if let date = currentDate {
                    grouped.append((date, currentIds))
                }
                currentDate = components
                currentIds = [msg.localId]
            }
        }
        if let date = currentDate {
            grouped.append((date, currentIds))
        }

        sections = grouped.map { MessageSection(date: $0.0, messageIds: $0.1) }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift
git commit -m "feat(ios): add MessageStore with DatabaseRegionObservation + off-main reads"
```

---

## Task 9: Wire DependencyContainer in MeeshyApp

**Files:**
- Modify: `apps/ios/Meeshy/MeeshyApp.swift`

- [ ] **Step 1: Add DependencyContainer initialization at app launch**

Add to `MeeshyApp.swift` in the `init()` or `body` scene:

```swift
// In MeeshyApp.swift — add at the top of init() or as a lazy property
// The exact integration point depends on the current app structure.
// Find the @main App struct and add:

_ = DependencyContainer.shared // Initialize on launch
```

- [ ] **Step 2: Build to verify no compilation errors**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/MeeshyApp.swift
git commit -m "feat(ios): wire DependencyContainer at app launch"
```

---

## Task 10: Integration test — full pipeline

**Files:**
- Create: `apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift`

- [ ] **Step 1: Write integration test for the full Actor → Store pipeline**

```swift
// apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift

import XCTest
import GRDB
@testable import MeeshySDK
@testable import Meeshy

final class MessagePipelineIntegrationTests: XCTestCase {

    private var dbPool: DatabasePool!
    private var actor: MessagePersistenceActor!

    override func setUp() async throws {
        dbPool = try DatabasePool(path: ":memory:")
        try MessageDatabaseMigrations.runAll(on: dbPool)
        actor = MessagePersistenceActor(dbPool: dbPool)
    }

    @MainActor
    func test_fullSendLifecycle_stateTransitionsReachStore() async throws {
        let store = MessageStore(conversationId: "conv_int", persistence: actor)
        store.startObserving(dbPool: dbPool)

        // 1. Insert optimistic
        let record = MessageRecordFactory.make(
            localId: "temp_int_001", conversationId: "conv_int", state: .sending)
        try await actor.insertOptimistic(record)
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].state, .sending)

        // 2. Server ACK
        _ = try await actor.applyEvent(localId: "temp_int_001",
            event: .serverAck(serverId: "srv_int", at: Date()))
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].state, .sent)

        // 3. Delivered
        _ = try await actor.applyEvent(localId: "temp_int_001",
            event: .delivered(count: 1, at: Date()))
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].state, .delivered)

        // 4. Read
        _ = try await actor.applyEvent(localId: "temp_int_001",
            event: .readBy(userId: "reader", at: Date()))
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].state, .read)

        // Still 1 message (no duplicates)
        XCTAssertEqual(store.messages.count, 1)

        store.stopObserving()
    }

    @MainActor
    func test_messagesSurviveStoreRecreation() async throws {
        // Insert
        let record = MessageRecordFactory.make(
            localId: "survive_001", conversationId: "conv_survive")
        try await actor.insertOptimistic(record)

        // Create store, load, verify
        let store = MessageStore(conversationId: "conv_survive", persistence: actor)
        store.startObserving(dbPool: dbPool)
        await store.loadInitial()
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].localId, "survive_001")

        // Destroy store
        store.stopObserving()

        // Recreate — data persists
        let store2 = MessageStore(conversationId: "conv_survive", persistence: actor)
        store2.startObserving(dbPool: dbPool)
        await store2.loadInitial()
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store2.messages.count, 1)
        store2.stopObserving()
    }
}
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: All tests PASS — state machine, records, migrations, actor, layout engine, integration

- [ ] **Step 3: Commit**

```bash
git add apps/ios/MeeshyTests/Integration/MessagePipelineIntegrationTests.swift
git commit -m "test(ios): add integration tests for Actor → Store pipeline"
```

---

## Plan 1 Summary

| Task | Component | Tests | Status |
|------|-----------|-------|--------|
| 1 | MessageState + MessageEvent | 4 | - [ ] |
| 2 | MessageStateMachine | 11 | - [ ] |
| 3 | MessageRecord + PendingIdRecord + TranslationRecords | 4 | - [ ] |
| 4 | MessageDatabaseMigrations (6 tables) | 3 | - [ ] |
| 5 | MessagePersistenceActor (write-through + AsyncStream) | 12 | - [ ] |
| 6 | BubbleLayoutEngine (CTFramesetter) | 8 | - [ ] |
| 7 | DependencyContainer (App Group DatabasePool) | 0 (build check) | - [ ] |
| 8 | MessageStore (@Observable + DatabaseRegionObservation) | 0 (used in integration) | - [ ] |
| 9 | Wire in MeeshyApp | 0 (build check) | - [ ] |
| 10 | Integration tests (Actor → Store pipeline) | 2 | - [ ] |

**Total: 10 tasks, ~44 tests, ~1600 lines of production code**

After Plan 1 is complete, the foundation is in place for Plan 2 (Message UICollectionView) and Plan 3 (Feed + Comments UICollectionView).
