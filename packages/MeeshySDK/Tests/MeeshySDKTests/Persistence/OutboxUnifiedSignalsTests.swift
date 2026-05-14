import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Wave 1 Task 3.6 — verifies the three new unified signals (`retrySucceeded`
/// extended with `kind`, `retryExhausted`, `retryDropped`) plus the new
/// `enqueueReaction` coalescing state machine on `OfflineQueue`.
///
/// These tests lock the API contract before consumers (ConversationViewModel,
/// OutboxDispatcher) are migrated off the legacy `MessageRetryQueue` /
/// `ReactionQueue` Combine publishers.
final class OutboxUnifiedSignalsTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []

    override func setUp() async throws {
        cancellables.removeAll()
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        cancellables.removeAll()
        await OfflineQueue.shared.clearAll()
    }

    // MARK: - retryExhausted signal (Phase A.1)

    /// When `OutboxFlusher` exhausts a `.sendMessage` record at maxAttempts,
    /// the unified `OfflineQueue.shared.retryExhausted` signal fires with the
    /// matching `kind`, `clientMessageId`, and `conversationId`.
    func test_retryExhausted_emitsForSendMessage_whenFlusherExhaustsRow() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let cid = "cid_exhaust_send_\(UUID().uuidString)"
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_test_exhaust_send",
                kind: .sendMessage,
                conversationId: "c1",
                messageLocalId: cid,
                clientMessageId: cid,
                payload: Data(),
                status: .pending,
                attempts: 4, // one shy of the default maxAttempts=5
                lastError: "previous-failure",
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let expectation = expectation(description: "retryExhausted fires")
        var received: OfflineRetryExhausted?
        OfflineQueue.shared.retryExhausted
            .sink { payload in
                if payload.clientMessageId == cid {
                    received = payload
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let flusher = OutboxFlusher(pool: pool, dispatcher: AlwaysFailDispatcher())
        await flusher.flush()

        await fulfillment(of: [expectation], timeout: 2)

        XCTAssertEqual(received?.kind, .sendMessage)
        XCTAssertEqual(received?.clientMessageId, cid)
        XCTAssertEqual(received?.conversationId, "c1")
        XCTAssertNil(received?.reaction, "Non-reaction kinds must leave the reaction context nil")
    }

    /// When `OutboxFlusher` exhausts a `.sendReaction` record, the unified
    /// signal carries the typed `ReactionContext` so reaction-specific
    /// subscribers can roll back optimistic UI without re-decoding the row.
    func test_retryExhausted_emitsForSendReaction_withReactionContext() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let cid = "cid_exhaust_react_\(UUID().uuidString)"
        let payload = ReactionOutboxPayload(
            messageId: "msg-1",
            emoji: "❤️",
            action: .add,
            conversationId: "c2",
            clientMessageId: cid
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payloadData = try encoder.encode(payload)
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "rxq_test_exhaust_react",
                kind: .sendReaction,
                conversationId: "c2",
                messageLocalId: cid,
                clientMessageId: cid,
                payload: payloadData,
                status: .pending,
                attempts: 4,
                lastError: nil,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let expectation = expectation(description: "retryExhausted fires for reaction")
        var received: OfflineRetryExhausted?
        OfflineQueue.shared.retryExhausted
            .sink { event in
                if event.clientMessageId == cid {
                    received = event
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)

        let flusher = OutboxFlusher(pool: pool, dispatcher: AlwaysFailDispatcher())
        await flusher.flush()

        await fulfillment(of: [expectation], timeout: 2)

        XCTAssertEqual(received?.kind, .sendReaction)
        XCTAssertEqual(received?.reaction?.messageId, "msg-1")
        XCTAssertEqual(received?.reaction?.emoji, "❤️")
        XCTAssertEqual(received?.reaction?.action, .add)
    }

    // MARK: - enqueueReaction coalescing (Phase A.2)

    func test_enqueueReaction_writesSendReactionRow_whenNoPendingExists() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-1", emoji: "👍", action: .add, conversationId: "c-1"
        )

        let pending = await OfflineQueue.shared.pendingReactions
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.messageId, "m-1")
        XCTAssertEqual(pending.first?.emoji, "👍")
        XCTAssertEqual(pending.first?.action, .add)

        let rows = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows.first?.id.hasPrefix("rxq_") ?? false,
            "Reaction rows MUST keep the rxq_* prefix so legacy in-flight rows continue draining")
    }

    /// Idempotent re-enqueue: a duplicate `add` on the same (messageId, emoji)
    /// keeps the existing pending row and emits `retryDropped` so the UI can
    /// reconcile the duplicate optimistic action.
    func test_enqueueReaction_droppedNew_whenSameActionAlreadyPending() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-1", emoji: "❤️", action: .add, conversationId: "c-1"
        )

        let expectation = expectation(description: "retryDropped fires")
        var received: OfflineRetryDropped?
        OfflineQueue.shared.retryDropped
            .sink { event in
                received = event
                expectation.fulfill()
            }
            .store(in: &cancellables)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-1", emoji: "❤️", action: .add, conversationId: "c-1"
        )

        await fulfillment(of: [expectation], timeout: 1)

        XCTAssertEqual(received?.kind, .sendReaction)
        XCTAssertEqual(received?.reaction?.action, .add)

        let pending = await OfflineQueue.shared.pendingReactions
        XCTAssertEqual(pending.count, 1, "Duplicate enqueue must NOT insert a second row")
    }

    /// Opposite directions cancel: an `add` followed by a `remove` for the
    /// same (messageId, emoji) deletes the existing pending row and emits
    /// `retryDropped` twice (once for each cancelled side).
    func test_enqueueReaction_cancelledBoth_whenOppositeActionAlreadyPending() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-2", emoji: "🔥", action: .add, conversationId: "c-1"
        )

        let expectation = expectation(description: "retryDropped fires twice (cancelledBoth)")
        expectation.expectedFulfillmentCount = 2
        var receivedEvents: [OfflineRetryDropped] = []
        OfflineQueue.shared.retryDropped
            .sink { event in
                receivedEvents.append(event)
                expectation.fulfill()
            }
            .store(in: &cancellables)

        try await OfflineQueue.shared.enqueueReaction(
            messageId: "m-2", emoji: "🔥", action: .remove, conversationId: "c-1"
        )

        await fulfillment(of: [expectation], timeout: 1)

        let pending = await OfflineQueue.shared.pendingReactions
        XCTAssertEqual(pending.count, 0, "Add+remove on the same (msg,emoji) must cancel BOTH")

        XCTAssertEqual(receivedEvents.count, 2)
        // One of the two emitted events references the original add, the
        // other the cancelling remove — order is implementation-defined but
        // both must appear.
        let actions = Set(receivedEvents.map { $0.reaction?.action })
        XCTAssertEqual(actions, Set<ReactionAction>([.add, .remove]))
    }

    // MARK: - Helpers

    private func makeFreshPool() throws -> DatabaseQueue {
        return try DatabaseQueue()
    }
}

// MARK: - Always-fail dispatcher

/// Always throws so `OutboxFlusher` increments the attempt counter without
/// touching the real network layer. Used to drive the exhausted path.
private actor AlwaysFailDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {
        throw NSError(domain: "test-always-fail", code: -1)
    }
}
