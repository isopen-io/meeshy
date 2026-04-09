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

    // MARK: - Pagination metadata (point 59)

    func test_pagination_cursorProgression() throws {
        let db = try makeDatabase()

        var page1 = DBCacheMetadata(
            key: "messages:conv-abc",
            nextCursor: "cursor_page2",
            hasMore: true,
            totalCount: 100,
            lastFetchedAt: Date()
        )
        try db.write { try page1.save($0) }

        let fetched1 = try db.read { try DBCacheMetadata.fetchOne($0, key: "messages:conv-abc") }
        XCTAssertEqual(fetched1?.nextCursor, "cursor_page2")
        XCTAssertTrue(fetched1?.hasMore ?? false)

        page1.nextCursor = "cursor_page3"
        page1.totalCount = 100
        try db.write { try page1.save($0) }

        let fetched2 = try db.read { try DBCacheMetadata.fetchOne($0, key: "messages:conv-abc") }
        XCTAssertEqual(fetched2?.nextCursor, "cursor_page3")
    }

    func test_pagination_lastPage_hasMoreFalse_cursorNil() throws {
        let db = try makeDatabase()

        var record = DBCacheMetadata(
            key: "messages:conv-last",
            nextCursor: nil,
            hasMore: false,
            totalCount: 25,
            lastFetchedAt: Date()
        )
        try db.write { try record.save($0) }

        let fetched = try db.read { try DBCacheMetadata.fetchOne($0, key: "messages:conv-last") }
        XCTAssertNil(fetched?.nextCursor)
        XCTAssertFalse(fetched?.hasMore ?? true)
        XCTAssertEqual(fetched?.totalCount, 25)
    }

    func test_pagination_multipleKeys_independent() throws {
        let db = try makeDatabase()

        var meta1 = DBCacheMetadata(
            key: "messages:conv-1",
            nextCursor: "c1",
            hasMore: true,
            totalCount: 50,
            lastFetchedAt: Date()
        )
        var meta2 = DBCacheMetadata(
            key: "messages:conv-2",
            nextCursor: "c2",
            hasMore: false,
            totalCount: 10,
            lastFetchedAt: Date()
        )

        try db.write { db in
            try meta1.save(db)
            try meta2.save(db)
        }

        let f1 = try db.read { try DBCacheMetadata.fetchOne($0, key: "messages:conv-1") }
        let f2 = try db.read { try DBCacheMetadata.fetchOne($0, key: "messages:conv-2") }

        XCTAssertEqual(f1?.nextCursor, "c1")
        XCTAssertTrue(f1?.hasMore ?? false)
        XCTAssertEqual(f2?.nextCursor, "c2")
        XCTAssertFalse(f2?.hasMore ?? true)
    }

    func test_isExpired_exactlyAtTTL_isExpired() throws {
        let record = DBCacheMetadata(
            key: "test",
            nextCursor: nil,
            hasMore: false,
            totalCount: nil,
            lastFetchedAt: Date().addingTimeInterval(-60)
        )
        XCTAssertTrue(record.isExpired(ttl: 60))
    }
}
