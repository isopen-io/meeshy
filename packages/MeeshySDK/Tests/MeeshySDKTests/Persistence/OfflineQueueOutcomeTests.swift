import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Tests for Phase 4 Batch 1 — OfflineQueue outcome observation APIs.
///
/// Covers:
/// - `OutboxOutcome` enum cases (`.applied(cmid:)` / `.exhausted(cmid:)`)
/// - `outcomeStream(for cmid:)` — per-mutation completion observation
/// - `pendingCountPublisher` — Combine publisher of pending outbox count
/// - `retryItem(_:)` — manual retry of a failed/exhausted outbox row
final class OfflineQueueOutcomeTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.clearAll()
        try await pool.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? await pool.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
        pool = nil
        try await super.tearDown()
    }

    // MARK: - outcomeStream — applied

    func test_outcomeStream_emitsAppliedWhenItemRemoved() async throws {
        let cmid = "cid_applied_\(UUID().uuidString)"
        let item = OfflineQueueItem(
            conversationId: "conv-applied",
            content: "applied test",
            clientMessageId: cmid
        )
        try await queue.enqueue(item)

        let stream = await queue.outcomeStream(for: cmid)

        await queue.setRetrySend { @Sendable _ in
            return "server-applied-1"
        }
        await queue.retryAll()

        var iterator = stream.makeAsyncIterator()
        let event = await iterator.next()

        switch event {
        case .applied(let observed):
            XCTAssertEqual(observed, cmid)
        case .exhausted, .none:
            XCTFail("Expected .applied(\(cmid)), got \(String(describing: event))")
        }
    }

    // MARK: - outcomeStream — exhausted

    func test_outcomeStream_emitsExhaustedAfterRetryBudget() async throws {
        let cmid = "cid_exhausted_\(UUID().uuidString)"
        let outboxId = "ofq_exhausted_\(UUID().uuidString)"
        let now = Date()
        try await pool.write { [pool] db in
            _ = pool
            try OutboxRecord(
                id: outboxId,
                kind: .sendMessage,
                conversationId: "conv-exh",
                messageLocalId: cmid,
                clientMessageId: cmid,
                payload: Data(),
                status: .pending,
                attempts: 4,
                lastError: nil,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            ).insert(db)
        }

        let stream = await queue.outcomeStream(for: cmid)

        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutcomeFailingDispatcher(),
            onOutcome: { @Sendable outcome in
                Task { await OfflineQueue.shared.publishOutcome(outcome) }
            }
        )
        await flusher.flush()

        var iterator = stream.makeAsyncIterator()
        let event = await iterator.next()

        switch event {
        case .exhausted(let observed):
            XCTAssertEqual(observed, cmid)
        case .applied, .none:
            XCTFail("Expected .exhausted(\(cmid)), got \(String(describing: event))")
        }
    }

    // MARK: - pendingCountPublisher

    func test_pendingCountPublisher_emitsCurrentCountAndUpdates() async throws {
        let publisher = queue.pendingCountPublisher

        let stable = await stabilizePendingCount()

        let recorder = Recorder<Int>()
        let cancellable = publisher
            .sink { value in
                recorder.append(value)
            }

        try await queue.enqueue(OfflineQueueItem(conversationId: "c1", content: "one"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "c1", content: "two"))

        // Allow the actor to flush its CurrentValueSubject sends.
        try await Task.sleep(nanoseconds: 200_000_000)
        cancellable.cancel()

        let received = recorder.snapshot()
        XCTAssertEqual(received.first, stable,
            "First emission MUST be the current count at subscription time")
        XCTAssertEqual(received.last, stable + 2,
            "After two enqueues, the latest emission MUST reflect the new count")
        XCTAssertTrue(received.contains(stable + 1),
            "Publisher MUST emit each intermediate count change")
    }

    /// Item H — le DRAIN de la file doit refermer le bandeau
    /// « Synchronisation… » : quand le flusher termine une row (delete sur
    /// `.applied`), le callback `onOutcome → publishOutcome` rafraîchit
    /// `pendingCountSubject` (fix 80e7dc874 — avant, le compteur ne tournait
    /// que sur enqueue/retry, jamais sur le drainage → bannière figée à vie).
    /// Ce test verrouille le chemin DESCENDANT complet avec un vrai flusher
    /// câblé comme en production ; seul le chemin montant était testé.
    func test_pendingCountPublisher_returnsToBaseline_afterFlusherDrainsQueue() async throws {
        let stable = await stabilizePendingCount()

        let cmid = "cid_drain_\(UUID().uuidString)"
        try await queue.enqueue(OfflineQueueItem(
            conversationId: "conv-drain",
            content: "drain test",
            clientMessageId: cmid
        ))

        let recorder = Recorder<Int>()
        let cancellable = queue.pendingCountPublisher
            .sink { recorder.append($0) }
        defer { cancellable.cancel() }

        // Vrai flusher, câblage production (onOutcome → publishOutcome) :
        // claim atomique → dispatch OK → delete de la row → outcome publié.
        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutcomeSucceedingDispatcher(),
            onOutcome: { @Sendable outcome in
                Task { await OfflineQueue.shared.publishOutcome(outcome) }
            }
        )
        await flusher.flush()

        // Laisse le Task de publishOutcome + refreshPendingCount se poser.
        try await Task.sleep(nanoseconds: 300_000_000)

        let received = recorder.snapshot()
        XCTAssertEqual(received.last, stable,
            "After the flusher drains the queue, pendingCount MUST return to baseline — otherwise the « Synchronisation… » banner never closes (item H)")
    }

    // MARK: - retryItem — resets counter and status

    func test_retryItem_resetsCounterAndStatus() async throws {
        let outboxId = "ofqm_retry_\(UUID().uuidString)"
        let cmid = "cmid_retry_\(UUID().uuidString)"
        let oldDate = Date().addingTimeInterval(3600)
        try await pool.write { db in
            try OutboxRecord(
                id: outboxId,
                kind: .markAsRead,
                conversationId: "conv-retry",
                messageLocalId: nil,
                clientMessageId: cmid,
                payload: Data(),
                status: .exhausted,
                attempts: 5,
                lastError: "boom",
                createdAt: Date(),
                updatedAt: Date(),
                nextAttemptAt: oldDate
            ).insert(db)
        }

        try await queue.retryItem(outboxId)

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: outboxId)
        }
        XCTAssertNotNil(after, "Outbox record must still exist after retryItem")
        XCTAssertEqual(after?.status, .pending, "retryItem MUST reset status to .pending")
        XCTAssertEqual(after?.attempts, 0, "retryItem MUST reset retryCount/attempts to 0")
        XCTAssertNil(after?.lastError, "retryItem MUST clear lastError")
        XCTAssertLessThanOrEqual(after!.nextAttemptAt.timeIntervalSinceNow, 1.0,
            "retryItem MUST schedule nextAttemptAt for immediate retry")
    }

    // MARK: - retryItem — throws when missing

    func test_retryItem_throwsItemNotFound_whenMissing() async throws {
        do {
            try await queue.retryItem("nonexistent-outbox-id")
            XCTFail("retryItem MUST throw when the outbox row does not exist")
        } catch OfflineQueueError.itemNotFound {
            // expected
        } catch {
            XCTFail("Expected .itemNotFound, got \(error)")
        }
    }

    // MARK: - markAsRead coalescing (latest-state-wins on enqueue)

    /// Regression: a busy group conversation that fires markAsRead on every
    /// inbound message must NOT accumulate one outbox row per fire. The
    /// generic `enqueue<P>` collapses earlier `.pending` rows for the same
    /// `(kind: .markAsRead, conversationId: anchor)` before inserting the
    /// newer payload — only the latest upToMessageId is kept (subsumes all
    /// previous reads by monotonic property).
    func test_enqueueMarkAsRead_coalescesPendingForSameConversation() async throws {
        let conv = "conv-coalesce-\(UUID().uuidString)"

        for i in 0..<5 {
            let payload = MarkAsReadPayload(
                clientMutationId: ClientMutationId.generate(),
                conversationId: conv,
                upToMessageId: "msg-\(i)"
            )
            _ = try await queue.enqueue(.markAsRead, payload: payload, conversationId: conv)
        }

        let rows = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.markAsRead.rawValue)
                .filter(Column("conversationId") == conv)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1, "5 markAsRead enqueues for the same conversation must coalesce into 1 row")

        // The surviving row must carry the LATEST payload (upToMessageId = msg-4)
        let decoded = try JSONDecoder().decode(MarkAsReadPayload.self, from: rows[0].payload)
        XCTAssertEqual(decoded.upToMessageId, "msg-4", "Surviving row must carry the latest upToMessageId")
    }

    /// Coalescing is scoped per conversation — enqueuing markAsRead for two
    /// distinct conversations must keep both rows alive. The outbox is not
    /// a single global drain queue, each conversation tracks its own read
    /// cursor.
    func test_enqueueMarkAsRead_keepsRowsAcrossDifferentConversations() async throws {
        let convA = "conv-A-\(UUID().uuidString)"
        let convB = "conv-B-\(UUID().uuidString)"

        for _ in 0..<3 {
            let payloadA = MarkAsReadPayload(
                clientMutationId: ClientMutationId.generate(),
                conversationId: convA,
                upToMessageId: "msg-A"
            )
            _ = try await queue.enqueue(.markAsRead, payload: payloadA, conversationId: convA)
        }
        for _ in 0..<3 {
            let payloadB = MarkAsReadPayload(
                clientMutationId: ClientMutationId.generate(),
                conversationId: convB,
                upToMessageId: "msg-B"
            )
            _ = try await queue.enqueue(.markAsRead, payload: payloadB, conversationId: convB)
        }

        let rowsA = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.markAsRead.rawValue)
                .filter(Column("conversationId") == convA)
                .fetchAll(db)
        }
        let rowsB = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.markAsRead.rawValue)
                .filter(Column("conversationId") == convB)
                .fetchAll(db)
        }
        XCTAssertEqual(rowsA.count, 1, "Conversation A markAsRead must collapse to 1 row")
        XCTAssertEqual(rowsB.count, 1, "Conversation B markAsRead must collapse to 1 row")
    }

    /// Other (non-coalescing) kinds must keep accumulating one row per
    /// enqueue — only `.markAsRead` opts in. A friend-request burst must
    /// preserve every payload because they are not monotonically idempotent
    /// (each is a distinct action targeting a distinct user).
    func test_enqueueNonCoalescingKind_accumulatesRows() async throws {
        let userIds = ["u-1", "u-2", "u-3"]
        for userId in userIds {
            let payload = SendFriendRequestPayload(
                clientMutationId: ClientMutationId.generate(),
                targetUserId: userId
            )
            _ = try await queue.enqueue(.sendFriendRequest, payload: payload)
        }

        let rows = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.sendFriendRequest.rawValue)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 3, "Non-coalescing kinds (.sendFriendRequest) MUST keep every enqueue")
    }

    // MARK: - Helpers

    /// Reads the current pending count after any setUp churn so subsequent
    /// assertions can be relative to a stable baseline (the publisher emits the
    /// `CurrentValueSubject`'s initial value plus every change downstream).
    private func stabilizePendingCount() async -> Int {
        try? await Task.sleep(nanoseconds: 50_000_000)
        return await queue.count
    }
}

// MARK: - Test Dispatchers

/// Dispatcher that always succeeds — used to exercise the happy drain path
/// (claim → dispatch OK → row deleted → `.applied` outcome).
actor MockOutcomeSucceedingDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {}
}

/// Dispatcher that always fails — used to exercise the retry-budget path that
/// flips an `OutboxRecord` from `.pending(attempts=4)` to `.exhausted`.
actor MockOutcomeFailingDispatcher: OutboxDispatching {
    func dispatch(_ record: OutboxRecord) async throws {
        throw NSError(domain: "outcome.test", code: -1)
    }
}

// MARK: - Sendable Recorder

/// Thread-safe recorder for capturing values emitted from a `@Sendable` closure
/// (Combine `sink`) without using locks from async contexts.
final class Recorder<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [T] = []

    func append(_ value: T) {
        lock.lock()
        values.append(value)
        lock.unlock()
    }

    func snapshot() -> [T] {
        lock.lock()
        defer { lock.unlock() }
        return values
    }
}
