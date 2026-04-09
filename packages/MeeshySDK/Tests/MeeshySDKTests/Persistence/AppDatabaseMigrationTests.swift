import XCTest
import GRDB
@testable import MeeshySDK

final class AppDatabaseMigrationTests: XCTestCase {

    private func migratedDatabase() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
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

    // MARK: - v3 migration: cache_entries table

    func test_v3Migration_createsCacheEntriesTable() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let exists = try db.tableExists("cache_entries")
            XCTAssertTrue(exists, "cache_entries table should exist after v3 migration")
        }
    }

    func test_v3Migration_cacheEntriesHasCompoundPK() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let columns = try db.columns(in: "cache_entries")
            let columnNames = columns.map(\.name)
            let expected = ["key", "itemId", "encodedData", "updatedAt"]
            for col in expected {
                XCTAssertTrue(columnNames.contains(col), "cache_entries should have column '\(col)' but has: \(columnNames)")
            }
            let primaryKey = try db.primaryKey("cache_entries")
            XCTAssertEqual(primaryKey.columns.sorted(), ["itemId", "key"])
        }
    }

    func test_v3Migration_cacheEntriesKeyIndex() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let indexes = try db.indexes(on: "cache_entries")
            let indexNames = indexes.map(\.name)
            XCTAssertTrue(indexNames.contains("idx_cache_entries_key"), "Index idx_cache_entries_key should exist but found: \(indexNames)")
        }
    }

    func test_v3Migration_dropsCachedParticipants() throws {
        let db = try migratedDatabase()
        try db.read { db in
            let exists = try db.tableExists("cached_participants")
            XCTAssertFalse(exists, "cached_participants table should be dropped after v3 migration")
        }
    }

    func test_v3Migration_preservesExistingTables() throws {
        let db = try migratedDatabase()
        try db.read { db in
            XCTAssertTrue(try db.tableExists("conversations"), "conversations table should still exist")
            XCTAssertTrue(try db.tableExists("messages"), "messages table should still exist")
            XCTAssertTrue(try db.tableExists("cache_metadata"), "cache_metadata table should still exist")
        }
    }

    func test_cacheEntry_insertAndFetch() throws {
        let db = try migratedDatabase()
        let now = Date()
        let entry = CacheEntry(key: "conversations", itemId: "abc123", encodedData: Data("test".utf8), updatedAt: now)

        try db.write { db in
            try entry.save(db)
        }

        let fetched = try db.read { db in
            try CacheEntry.filter(Column("key") == "conversations" && Column("itemId") == "abc123").fetchOne(db)
        }

        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.key, "conversations")
        XCTAssertEqual(fetched?.itemId, "abc123")
        XCTAssertEqual(fetched?.encodedData, Data("test".utf8))
    }

    func test_cacheEntry_upsertOnConflict() throws {
        let db = try migratedDatabase()
        let now = Date()
        let entry1 = CacheEntry(key: "conversations", itemId: "abc123", encodedData: Data("old".utf8), updatedAt: now)
        let entry2 = CacheEntry(key: "conversations", itemId: "abc123", encodedData: Data("new".utf8), updatedAt: now.addingTimeInterval(60))

        try db.write { db in
            try entry1.save(db)
            try entry2.save(db)
        }

        let count = try db.read { db in
            try CacheEntry.filter(Column("key") == "conversations" && Column("itemId") == "abc123").fetchCount(db)
        }
        XCTAssertEqual(count, 1)

        let fetched = try db.read { db in
            try CacheEntry.filter(Column("key") == "conversations" && Column("itemId") == "abc123").fetchOne(db)
        }
        XCTAssertEqual(fetched?.encodedData, Data("new".utf8))
    }

    // MARK: - CacheEntry delete (point 58)

    func test_cacheEntry_deleteByKey() throws {
        let db = try migratedDatabase()
        let now = Date()

        try db.write { db in
            try CacheEntry(key: "messages", itemId: "m1", encodedData: Data("a".utf8), updatedAt: now).save(db)
            try CacheEntry(key: "messages", itemId: "m2", encodedData: Data("b".utf8), updatedAt: now).save(db)
            try CacheEntry(key: "other", itemId: "o1", encodedData: Data("c".utf8), updatedAt: now).save(db)
        }

        try db.write { db in
            try CacheEntry.filter(Column("key") == "messages").deleteAll(db)
        }

        let messagesCount = try db.read { db in
            try CacheEntry.filter(Column("key") == "messages").fetchCount(db)
        }
        XCTAssertEqual(messagesCount, 0)

        let otherCount = try db.read { db in
            try CacheEntry.filter(Column("key") == "other").fetchCount(db)
        }
        XCTAssertEqual(otherCount, 1, "Other keys should be unaffected")
    }

    func test_cacheEntry_updateEncodedData() throws {
        let db = try migratedDatabase()
        let now = Date()

        try db.write { db in
            try CacheEntry(key: "test", itemId: "item1", encodedData: Data("original".utf8), updatedAt: now).save(db)
        }

        let later = now.addingTimeInterval(30)
        try db.write { db in
            try CacheEntry(key: "test", itemId: "item1", encodedData: Data("updated".utf8), updatedAt: later).save(db)
        }

        let fetched = try db.read { db in
            try CacheEntry.filter(Column("key") == "test" && Column("itemId") == "item1").fetchOne(db)
        }
        XCTAssertEqual(fetched?.encodedData, Data("updated".utf8))
    }

    // MARK: - v4 migration (point 56 — all migrations)

    func test_v4Migration_dropsLegacyTables() throws {
        let db = try migratedDatabase()
        try db.read { db in
            XCTAssertFalse(try db.tableExists("conversations"), "conversations table should be dropped after v4")
            XCTAssertFalse(try db.tableExists("messages"), "messages table should be dropped after v4")
        }
    }

    func test_allMigrations_cacheEntriesAndMetadataCoexist() throws {
        let db = try migratedDatabase()
        try db.read { db in
            XCTAssertTrue(try db.tableExists("cache_entries"))
            XCTAssertTrue(try db.tableExists("cache_metadata"))
        }
    }

    func test_migrations_runIdempotently() throws {
        let db1 = try migratedDatabase()
        // Running migrations again on the same db should not error
        XCTAssertNoThrow(try AppDatabase.runMigrations(on: db1))
    }
}
