import XCTest
import GRDB
@testable import MeeshySDK

/// Wave 1 Task 3.6 — narrowed to OfflineQueue only after `MessageRetryQueue`
/// and `ReactionQueue` were folded into `OfflineQueue`. The legacy
/// `RetryQueueItem` / `ReactionQueueItem` migrations no longer exist because
/// both queues now share `OfflineQueue`'s outbox persistence from the very
/// first enqueue, so there is nothing to migrate from.
final class QueueMigrationTests: XCTestCase {

    override func setUp() async throws {
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await OfflineQueue.shared.clearAll()
    }

    // MARK: - OfflineQueue migration

    func test_offlineQueueItems_migrateIntoOutboxTable() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let item = OfflineQueueItem(
            conversationId: "c1",
            content: "hello offline"
        )
        try await OfflineQueue.shared.enqueue(item)

        await OfflineQueue.shared.migrateToOutbox(pool: pool)

        let outboxRecords = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                .fetchAll(db)
        }
        XCTAssertGreaterThanOrEqual(outboxRecords.count, 1,
            "At least one outbox row should have been created for the enqueued OfflineQueueItem")

        let migratedId = "ofq_\(item.id)"
        let found = outboxRecords.contains { $0.id == migratedId }
        XCTAssertTrue(found, "Outbox row id must be prefixed with 'ofq_' and match the item's id")
    }

    func test_offlineQueueMigration_preservesConversationId() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        let item = OfflineQueueItem(
            conversationId: "conv-abc",
            content: "test content"
        )
        try await OfflineQueue.shared.enqueue(item)

        await OfflineQueue.shared.migrateToOutbox(pool: pool)

        let record = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "ofq_\(item.id)")
        }
        XCTAssertEqual(record?.conversationId, "conv-abc")
        XCTAssertEqual(record?.messageLocalId, item.tempId)
        XCTAssertEqual(record?.status, .pending)
        XCTAssertEqual(record?.attempts, 0)
    }

    func test_offlineQueueMigration_isIdempotent() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(conversationId: "c1", content: "msg")
        )

        await OfflineQueue.shared.migrateToOutbox(pool: pool)
        let firstCount = try await pool.read { db in try OutboxRecord.fetchCount(db) }

        await OfflineQueue.shared.migrateToOutbox(pool: pool)
        let secondCount = try await pool.read { db in try OutboxRecord.fetchCount(db) }

        XCTAssertEqual(firstCount, secondCount,
            "Repeated OfflineQueue migration must not duplicate outbox rows")
    }

    // MARK: - MigrateLegacyQueues entry point

    func test_migrateOnce_migratesOfflineQueue() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(conversationId: "c1", content: "offline msg")
        )

        await MigrateLegacyQueues.migrateOnce(into: pool)

        let count = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertGreaterThanOrEqual(count, 1,
            "migrateOnce should migrate items from OfflineQueue")
    }

    func test_migrateOnce_isIdempotent() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(conversationId: "c1", content: "offline")
        )

        await MigrateLegacyQueues.migrateOnce(into: pool)
        let firstCount = try await pool.read { db in try OutboxRecord.fetchCount(db) }

        await MigrateLegacyQueues.migrateOnce(into: pool)
        let secondCount = try await pool.read { db in try OutboxRecord.fetchCount(db) }

        XCTAssertEqual(firstCount, secondCount,
            "Repeated migrateOnce must not duplicate outbox rows")
    }

    // MARK: - Helpers

    private func makeFreshPool() throws -> DatabaseQueue {
        return try DatabaseQueue()
    }
}
