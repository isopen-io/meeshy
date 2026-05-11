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
