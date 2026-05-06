import XCTest
import GRDB
@testable import MeeshySDK

final class OutboxRecordTests: XCTestCase {

    func test_migration_createsOutboxTable() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let exists = try pool.read { db in
            try db.tableExists("outbox")
        }
        XCTAssertTrue(exists)
    }

    func test_outboxRecord_insertAndFetch() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let now = Date()
        try pool.write { db in
            let record = OutboxRecord(
                id: "ob-1",
                kind: .sendMessage,
                conversationId: "c1",
                payload: Data("hello".utf8),
                status: .pending,
                attempts: 0,
                lastError: nil,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now
            )
            try record.insert(db)
        }

        let fetched = try pool.read { db in
            try OutboxRecord.fetchAll(db)
        }
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched.first?.id, "ob-1")
        XCTAssertEqual(fetched.first?.kind, .sendMessage)
        XCTAssertEqual(fetched.first?.status, .pending)
    }

    func test_outboxStatus_indexExists() throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)

        let indexes = try pool.read { db in
            try Row.fetchAll(db, sql: "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='outbox'")
                .compactMap { $0["name"] as? String }
        }
        XCTAssertTrue(indexes.contains(where: { $0.contains("status") }),
            "Outbox table must have an index on status+nextAttemptAt for efficient FIFO drain")
    }

    private func makeFreshPool() throws -> DatabaseQueue {
        return try DatabaseQueue()
    }
}
