import XCTest
import GRDB
@testable import MeeshySDK

final class DBCacheMetadataTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    // MARK: - Insert and Fetch Roundtrip

    func test_insertAndFetch_allFieldsPreserved() throws {
        let db = try makeDatabase()
        let now = Date()

        var record = DBCacheMetadata(
            key: "participants:conv123",
            nextCursor: "cursor_abc",
            hasMore: true,
            totalCount: 42,
            lastFetchedAt: now
        )

        try db.write { try record.insert($0) }

        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:conv123") }
        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.key, "participants:conv123")
        XCTAssertEqual(fetched?.nextCursor, "cursor_abc")
        XCTAssertEqual(fetched?.hasMore, true)
        XCTAssertEqual(fetched?.totalCount, 42)
        XCTAssertNotNil(fetched?.lastFetchedAt)
    }

    func test_insertAndFetch_nilOptionalFields() throws {
        let db = try makeDatabase()

        var record = DBCacheMetadata(
            key: "conversations:list",
            nextCursor: nil,
            hasMore: false,
            totalCount: nil,
            lastFetchedAt: Date()
        )

        try db.write { try record.insert($0) }

        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "conversations:list") }
        XCTAssertNotNil(fetched)
        XCTAssertNil(fetched?.nextCursor)
        XCTAssertEqual(fetched?.hasMore, false)
        XCTAssertNil(fetched?.totalCount)
    }

    // MARK: - Upsert

    func test_upsert_updateExisting_countStaysOne() throws {
        let db = try makeDatabase()

        var record = DBCacheMetadata(
            key: "messages:conv456",
            nextCursor: "cursor_1",
            hasMore: true,
            totalCount: 10,
            lastFetchedAt: Date().addingTimeInterval(-60)
        )

        try db.write { try record.save($0) }

        record.nextCursor = "cursor_2"
        record.totalCount = 20
        record.hasMore = false
        record.lastFetchedAt = Date()

        try db.write { try record.save($0) }

        let count = try db.read { try DBCacheMetadata.fetchCount($0) }
        XCTAssertEqual(count, 1)

        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "messages:conv456") }
        XCTAssertEqual(fetched?.nextCursor, "cursor_2")
        XCTAssertEqual(fetched?.totalCount, 20)
        XCTAssertEqual(fetched?.hasMore, false)
    }

    // MARK: - isExpired

    func test_isExpired_returnsTrueWhenOlderThanTTL() throws {
        let record = DBCacheMetadata(
            key: "participants:conv1",
            nextCursor: nil,
            hasMore: false,
            totalCount: nil,
            lastFetchedAt: Date().addingTimeInterval(-120)
        )

        XCTAssertTrue(record.isExpired(ttl: 60))
    }

    func test_isExpired_returnsFalseWhenWithinTTL() throws {
        let record = DBCacheMetadata(
            key: "participants:conv1",
            nextCursor: nil,
            hasMore: false,
            totalCount: nil,
            lastFetchedAt: Date()
        )

        XCTAssertFalse(record.isExpired(ttl: 60))
    }

    // MARK: - Delete

    func test_delete_removesRecord() throws {
        let db = try makeDatabase()

        var record = DBCacheMetadata(
            key: "participants:conv789",
            nextCursor: nil,
            hasMore: true,
            totalCount: nil,
            lastFetchedAt: Date()
        )

        try db.write { try record.insert($0) }

        let deleted = try db.write { try record.delete($0) }
        XCTAssertTrue(deleted)

        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "participants:conv789") }
        XCTAssertNil(fetched)
    }
}
