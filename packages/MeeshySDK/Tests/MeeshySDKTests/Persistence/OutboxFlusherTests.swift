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
                clientMessageId: "cid_1",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
            try OutboxRecord(
                id: "2", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_2",
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
                clientMessageId: "cid_x",
                payload: Data(), status: .pending, attempts: 0, lastError: nil,
                createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher(shouldFail: true))
        let nextRetry = await flusher.flush()

        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.attempts, 1)
        XCTAssertEqual(after.status, .pending)
        XCTAssertGreaterThan(after.nextAttemptAt, now,
            "Failed item must be rescheduled after a backoff delay")
        XCTAssertEqual(nextRetry, after.nextAttemptAt,
            "flush() must report the earliest deferred retry so OutboxRetryScheduler can re-arm")
    }

    func test_flush_marksExhausted_after5Attempts() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_x",
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

    // MARK: - A7+A8 — local file cleanup on terminal outcomes

    /// When a `.sendMessage` outbox row terminates (applied OR exhausted),
    /// the local audio file referenced via `OfflineQueueItem.localAudioPath`
    /// must be removed from disk. Otherwise `Documents/pending-audio/`
    /// accumulates orphan `.m4a` indefinitely (cf. audit A7/A8).
    func test_flush_exhausted_cleansLocalAudioFile() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        // Create a real fixture file under Documents/pending-audio/
        let fixturePath = try OfflineQueue.pendingAudioRelativePath(for: "cid_cleanup")
        let absolutePath = OfflineQueue.absoluteAudioPath(forStored: fixturePath)
        FileManager.default.createFile(atPath: absolutePath, contents: Data("audio".utf8))
        XCTAssertTrue(FileManager.default.fileExists(atPath: absolutePath))

        // Encode a payload that references this file
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let item = OfflineQueueItem(
            id: "qid_cleanup",
            clientMessageId: "cid_cleanup",
            conversationId: "c1",
            content: "hi",
            originalLanguage: "en",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: fixturePath,
            createdAt: Date()
        )
        let payload = try encoder.encode(item)

        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_cleanup",
                payload: payload,
                status: .pending, attempts: 4, lastError: nil,
                createdAt: Date(), updatedAt: Date(), nextAttemptAt: Date()
            ).insert(db)
        }

        let flusher = OutboxFlusher(
            pool: pool,
            dispatcher: MockOutboxDispatcher(shouldFail: true)
        )
        await flusher.flush()

        // Verify the row went exhausted AND the file is gone
        let after = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "x")!
        }
        XCTAssertEqual(after.status, .exhausted)
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: absolutePath),
            "Local audio file must be removed when outbox terminates as .exhausted"
        )
    }

    /// On the happy path the SDK adoption already moved the file into the
    /// typed media cache, so the cleanup must be a no-op (and not crash on
    /// a missing file). Pins idempotency.
    func test_flush_applied_doesNotCrashOnMissingLocalFile() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let item = OfflineQueueItem(
            id: "qid_applied",
            clientMessageId: "cid_applied",
            conversationId: "c1",
            content: "hi",
            originalLanguage: "en",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: "pending-audio/does-not-exist.m4a",
            createdAt: Date()
        )
        let payload = try encoder.encode(item)

        try await pool.write { db in
            try OutboxRecord(
                id: "x", kind: .sendMessage, conversationId: "c1",
                clientMessageId: "cid_applied",
                payload: payload,
                status: .pending, attempts: 0, lastError: nil,
                createdAt: Date(), updatedAt: Date(), nextAttemptAt: Date()
            ).insert(db)
        }

        let flusher = OutboxFlusher(pool: pool, dispatcher: MockOutboxDispatcher())
        await flusher.flush()

        // Row was deleted (.applied path), no crash.
        let count = try await pool.read { db in
            try OutboxRecord.fetchCount(db)
        }
        XCTAssertEqual(count, 0)
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
