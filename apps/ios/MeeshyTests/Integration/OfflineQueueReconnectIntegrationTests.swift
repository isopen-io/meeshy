import XCTest
import Combine
import GRDB
import MeeshySDK
@testable import Meeshy

/// Integration tests for the offline-to-online message delivery pipeline.
///
/// Combines three components that are individually unit-tested:
///   - `OutboxRetryScheduler` — reconnect trigger
///   - `OutboxFlusher` — queue processor
///   - `MessagePersistenceActor` + `MessageStore` — state machine
///
/// These tests verify that the components hand off correctly when wired
/// together, covering the failure modes that individual unit tests cannot
/// catch (e.g. ordering bugs between reconnect signal and flush, state
/// not propagating from flusher to persistence actor).
@MainActor
final class OfflineQueueReconnectIntegrationTests: XCTestCase {

    // MARK: - Reconnect → Flush Pipeline

    /// Verifies that when the network transitions offline → online, the
    /// OutboxRetryScheduler fires a flush that processes pending outbox records.
    func test_reconnect_flushesPendingOutboxRecord() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_reconnect_001",
                kind: .sendMessage,
                conversationId: "conv-reconnect",
                clientMessageId: "cid_reconnect_001",
                payload: Data(),
                status: .pending,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let dispatcher = TrackingOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        let networkSubject = PassthroughSubject<NetworkCondition, Never>()
        let exp = expectation(description: "flush triggered on reconnect")

        OutboxRetryScheduler.shared.startObservingNetworkReconnect(
            conditionPublisher: networkSubject.eraseToAnyPublisher(),
            flush: {
                await flusher.flush()
                exp.fulfill()
            }
        )

        networkSubject.send(.wifi)    // dropFirst — ignored
        networkSubject.send(.offline)
        networkSubject.send(.wifi)    // offline→online → flush

        await fulfillment(of: [exp], timeout: 2.0)

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed, ["ofq_reconnect_001"],
            "reconnect must trigger a flush that processes the pending outbox record")

        let remaining = try await pool.read { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .fetchCount(db)
        }
        XCTAssertEqual(remaining, 0, "successful dispatch removes the record from pending queue")
    }

    // MARK: - FIFO Order

    /// Verifies that multiple queued records are flushed in creation order
    /// (oldest first), which is the FIFO guarantee messages depend on.
    func test_flush_processesPendingRecords_inFifoOrder() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let base = Date()
        let ids = ["ofq_fifo_1", "ofq_fifo_2", "ofq_fifo_3"]
        try await pool.write { db in
            for (index, id) in ids.enumerated() {
                try OutboxRecord(
                    id: id,
                    kind: .sendMessage,
                    conversationId: "conv-fifo",
                    clientMessageId: "cid_\(id)",
                    payload: Data(),
                    status: .pending,
                    createdAt: base.addingTimeInterval(Double(index) * 0.1),
                    updatedAt: base,
                    nextAttemptAt: base
                ).insert(db)
            }
        }

        let dispatcher = TrackingOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)
        await flusher.flush()

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed, ids, "records must be dispatched in FIFO (creation) order")
    }

    // MARK: - Failure → Retry Scheduling

    /// Verifies that a failed dispatch increments the retry counter and keeps
    /// the record pending (not exhausted prematurely). The flusher must also
    /// return the next retry date so the scheduler can re-arm itself.
    func test_flush_onDispatchFailure_incrementsAttemptsAndRetains() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_fail_001",
                kind: .sendReaction,
                conversationId: "conv-fail",
                clientMessageId: "cid_fail_001",
                payload: Data(),
                status: .pending,
                attempts: 0,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: FailingOutboxDispatcher())
        let nextRetry = await flusher.flush()

        let record = try await pool.read { db in try OutboxRecord.fetchOne(db, key: "ofq_fail_001")! }
        XCTAssertEqual(record.attempts, 1, "failed dispatch must increment attempt count")
        XCTAssertEqual(record.status, .pending, "first failure must not exhaust the record")
        XCTAssertNotNil(nextRetry, "flusher must return a retry date after a failure")
        XCTAssertGreaterThan(record.nextAttemptAt, now, "next attempt must be scheduled with backoff")
    }

    // MARK: - Message State Machine Integration

    /// Verifies the full offline message delivery cycle:
    ///   1. Message persisted as `.queued` (was sent offline)
    ///   2. Outbox record exists for the queued message
    ///   3. Network reconnects, flush runs
    ///   4. Dispatcher succeeds → applies serverAck to persistence actor
    ///   5. Message state transitions to `.sent` in the MessageStore
    func test_fullCycle_queuedMessage_becomeSentAfterFlush() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)

        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "conv-cycle", persistence: persistence)
        store.startObserving(dbPool: pool)

        let localId = "ofq_cycle_001"
        let clientMsgId = "cid_cycle_001"

        // 1. Persist a message as .queued (sent while offline)
        let record = makeQueuedMessageRecord(
            localId: localId,
            conversationId: "conv-cycle",
            clientMessageId: clientMsgId
        )
        try await persistence.insertOptimistic(record)
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(store.messages.last?.state, .queued, "initial state must be .queued")

        // 2. Create outbox record linked to the queued message
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: clientMsgId,
                kind: .sendMessage,
                conversationId: "conv-cycle",
                messageLocalId: localId,
                clientMessageId: clientMsgId,
                payload: Data(),
                status: .pending,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        // 3. Flush with a dispatcher that applies serverAck on success
        let ackDispatcher = AcknowledgingOutboxDispatcher(
            persistence: persistence,
            localId: localId
        )
        let flusher = OutboxFlusher(pool: pool, dispatcher: ackDispatcher)
        await flusher.flush()

        // 4. Wait for GRDB observation to propagate
        try await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(
            store.messages.last?.state,
            .sent,
            "message must transition to .sent after successful flush dispatch + serverAck"
        )

        store.stopObserving()
    }
}

// MARK: - Test Infrastructure

/// Records which outbox record IDs were dispatched.
private actor TrackingOutboxDispatcher: OutboxDispatching {
    private var _processedIds: [String] = []

    var processedIds: [String] { _processedIds }

    func dispatch(_ record: OutboxRecord) async throws {
        _processedIds.append(record.id)
    }
}

/// Always throws a transient network error, simulating offline dispatch.
private actor FailingOutboxDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {
        throw NSError(domain: "NetworkError", code: -1009,
                      userInfo: [NSLocalizedDescriptionKey: "No internet connection"])
    }
}

/// On success, applies a `serverAck` to the MessagePersistenceActor, wiring
/// the outbox flush to the message state machine — the same flow the real
/// OutboxDispatcher performs after a successful REST/socket send.
private actor AcknowledgingOutboxDispatcher: OutboxDispatching {
    private let persistence: MessagePersistenceActor
    private let localId: String

    init(persistence: MessagePersistenceActor, localId: String) {
        self.persistence = persistence
        self.localId = localId
    }

    func dispatch(_ record: OutboxRecord) async throws {
        _ = try await persistence.applyEvent(
            localId: localId,
            event: .serverAck(serverId: "server_\(record.id)", at: Date())
        )
    }
}

// MARK: - Factories

private func makeQueuedMessageRecord(
    localId: String,
    conversationId: String,
    clientMessageId: String
) -> MessageRecord {
    let now = Date()
    return MessageRecord(
        localId: localId,
        serverId: nil,
        conversationId: conversationId,
        senderId: "user_me",
        content: "Hello from offline",
        originalLanguage: "fr",
        messageType: "text",
        messageSource: "user",
        contentType: "text",
        state: .queued,
        retryCount: 1,
        lastError: "Network offline",
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
        createdAt: now,
        sentAt: nil,
        deliveredAt: nil,
        readAt: nil,
        updatedAt: now,
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
        changeVersion: 0
    )
}
