import XCTest
import GRDB
@testable import MeeshySDK

final class OutboxFlusherTests: XCTestCase {

    func test_flush_processesPendingItems_inFifoOrder() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "1", kind: .sendMessage, conversationId: "c1",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
            try OutboxRecord(
                id: "2", kind: .sendMessage, conversationId: "c1",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now.addingTimeInterval(0.1), updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let dispatcher = MockOutboxDispatcher()
        let flusher = OutboxFlusher(pool: pool, dispatcher: dispatcher)

        await flusher.flush()

        let processed = await dispatcher.processedIds
        XCTAssertEqual(processed, ["1", "2"])

        let remaining = try await pool.read { db in
            try OutboxRecord.filter(Column("status") == OutboxStatus.pending.rawValue).fetchCount(db)
        }
        XCTAssertEqual(remaining, 0)
    }

    func test_flush_failure_marksAttempts_andSchedulesBackoff() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.attempts, 1)
        XCTAssertEqual(after.status, .pending)
        XCTAssertGreaterThan(after.nextAttemptAt, now,
            "Failed item must be rescheduled after a backoff delay")
    }

    func test_flush_marksExhausted_after5Attempts() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                payload: Data(), status: .pending, attempts: 4, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.status, .exhausted,
            "After maxAttempts (5) failed dispatches, the item must be marked exhausted")
    }

    private func makeFreshPool() throws -> DatabaseQueue {
        return try DatabaseQueue()
    }
}

actor MockOutboxDispatcher: OutboxDispatching {
    private var _processedIds: [String] = []
    let shouldFail: Bool

    init(shouldFail: Bool = false) {
        self.shouldFail = shouldFail
    }

    var processedIds: [String] { _processedIds }

    func dispatch(_ record: OutboxRecord) async throws {
        _processedIds.append(record.id)
        if shouldFail {
            throw NSError(domain: "test", code: -1)
        }
    }
}
