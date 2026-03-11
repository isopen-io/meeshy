import XCTest
import GRDB
@testable import MeeshySDK

final class AppDatabaseMigrationTests: XCTestCase {

    private func migratedDatabase() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    // MARK: - cached_participants table

    func test_v2Migration_createsCachedParticipantsTable() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let exists = try db.tableExists("cached_participants")
            XCTAssertTrue(exists, "cached_participants table should exist after v2 migration")
        }
    }

    func test_v2Migration_cachedParticipantsHasAllColumns() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let columns = try db.columns(in: "cached_participants")
            let columnNames = columns.map(\.name)
            let expected = [
                "id", "conversationId", "userId", "username",
                "firstName", "lastName", "displayName", "avatar",
                "conversationRole", "isOnline", "lastActiveAt",
                "joinedAt", "isActive", "cachedAt"
            ]
            for col in expected {
                XCTAssertTrue(columnNames.contains(col), "cached_participants should have column '\(col)' but has: \(columnNames)")
            }
        }
    }

    func test_v2Migration_cachedParticipantsIdIsPrimaryKey() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let primaryKey = try db.primaryKey("cached_participants")
            XCTAssertEqual(primaryKey.columns, ["id"])
        }
    }

    func test_v2Migration_cachedParticipantsConversationIdIndex() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let indexes = try db.indexes(on: "cached_participants")
            let indexNames = indexes.map(\.name)
            XCTAssertTrue(indexNames.contains("idx_cached_participants_conversationId"), "Index idx_cached_participants_conversationId should exist but found: \(indexNames)")
        }
    }

    // MARK: - cache_metadata table

    func test_v2Migration_createsCacheMetadataTable() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let exists = try db.tableExists("cache_metadata")
            XCTAssertTrue(exists, "cache_metadata table should exist after v2 migration")
        }
    }

    func test_v2Migration_cacheMetadataHasAllColumns() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let columns = try db.columns(in: "cache_metadata")
            let columnNames = columns.map(\.name)
            let expected = ["key", "nextCursor", "hasMore", "totalCount", "lastFetchedAt"]
            for col in expected {
                XCTAssertTrue(columnNames.contains(col), "cache_metadata should have column '\(col)' but has: \(columnNames)")
            }
        }
    }

    func test_v2Migration_cacheMetadataKeyIsPrimaryKey() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let primaryKey = try db.primaryKey("cache_metadata")
            XCTAssertEqual(primaryKey.columns, ["key"])
        }
    }

    // MARK: - v1 tables still exist

    func test_v2Migration_preservesV1Tables() throws {
        let db = try migratedDatabase()
        try db.read { db in
            XCTAssertTrue(try db.tableExists("conversations"), "v1 conversations table should still exist")
            XCTAssertTrue(try db.tableExists("messages"), "v1 messages table should still exist")
        }
    }
}
