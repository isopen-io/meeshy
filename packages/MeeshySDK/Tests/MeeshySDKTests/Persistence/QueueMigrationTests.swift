import XCTest
import GRDB
@testable import MeeshySDK

final class QueueMigrationTests: XCTestCase {

    override func setUp() async throws {
        // Clear both shared queues so tests start from a known-empty state
        await OfflineQueue.shared.clearAll()
        // MessageRetryQueue exposes pendingItems but no clearAll — dequeue each pending item
        let retryItems = await MessageRetryQueue.shared.pendingItems
        for item in retryItems {
            await MessageRetryQueue.shared.dequeue(item.id)
        }
    }

    override func tearDown() async throws {
        await OfflineQueue.shared.clearAll()
        let retryItems = await MessageRetryQueue.shared.pendingItems
        for item in retryItems {
            await MessageRetryQueue.shared.dequeue(item.id)
        }
    }

    // MARK: - OfflineQueue migration

    func test_offlineQueueItems_migrateIntoOutboxTable() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

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

    // MARK: - MessageRetryQueue migration

    func test_retryQueueItems_migrateIntoOutboxTable() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let item = RetryQueueItem(
            conversationId: "c2",
            content: "hello retry",
            originalLanguage: "en"
        )
        try await MessageRetryQueue.shared.enqueue(item)

        await MessageRetryQueue.shared.migrateToOutbox(pool: pool)

        let outboxRecords = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                .fetchAll(db)
        }
        XCTAssertGreaterThanOrEqual(outboxRecords.count, 1,
            "At least one outbox row should have been created for the enqueued RetryQueueItem")

        let migratedId = "mrq_\(item.id)"
        let found = outboxRecords.contains { $0.id == migratedId }
        XCTAssertTrue(found, "Outbox row id must be prefixed with 'mrq_' and match the item's id")
    }

    func test_retryQueueMigration_preservesRetryCount() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let item = RetryQueueItem(
            conversationId: "c2",
            content: "retry content"
        )
        try await MessageRetryQueue.shared.enqueue(item)

        await MessageRetryQueue.shared.migrateToOutbox(pool: pool)

        let record = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: "mrq_\(item.id)")
        }
        XCTAssertEqual(record?.attempts, item.retryCount)
        XCTAssertEqual(record?.conversationId, "c2")
        XCTAssertEqual(record?.status, .pending)
    }

    func test_retryQueueMigration_isIdempotent() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        try await MessageRetryQueue.shared.enqueue(
            RetryQueueItem(conversationId: "c2", content: "msg")
        )

        await MessageRetryQueue.shared.migrateToOutbox(pool: pool)
        let firstCount = try await pool.read { db in try OutboxRecord.fetchCount(db) }

        await MessageRetryQueue.shared.migrateToOutbox(pool: pool)
        let secondCount = try await pool.read { db in try OutboxRecord.fetchCount(db) }

        XCTAssertEqual(firstCount, secondCount,
            "Repeated MessageRetryQueue migration must not duplicate outbox rows")
    }

    // MARK: - MigrateLegacyQueues entry point

    func test_migrateOnce_migatesBothQueues() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        try await OfflineQueue.shared.enqueue(
            OfflineQueueItem(conversationId: "c1", content: "offline msg")
        )
        try await MessageRetryQueue.shared.enqueue(
            RetryQueueItem(conversationId: "c2", content: "retry msg")
        )

        await MigrateLegacyQueues.migrateOnce(into: pool)

        let count = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertGreaterThanOrEqual(count, 2,
            "migrateOnce should migrate items from both queues")
    }

    func test_migrateOnce_isIdempotent() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

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
