import XCTest
import GRDB
@testable import MeeshySDK

final class GRDBModelsTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    // MARK: - CacheEntry Codable (point 60)

    func test_cacheEntry_codableRoundtrip() throws {
        let now = Date()
        let original = CacheEntry(key: "conv:list", itemId: "item-1", encodedData: Data("test payload".utf8), updatedAt: now)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(CacheEntry.self, from: data)

        XCTAssertEqual(decoded.key, original.key)
        XCTAssertEqual(decoded.itemId, original.itemId)
        XCTAssertEqual(decoded.encodedData, original.encodedData)
    }

    func test_cacheEntry_emptyEncodedData() throws {
        let db = try makeDatabase()
        let entry = CacheEntry(key: "empty", itemId: "e1", encodedData: Data(), updatedAt: Date())

        try db.write { db in
            try entry.save(db)
        }

        let fetched = try db.read { db in
            try CacheEntry.filter(Column("key") == "empty" && Column("itemId") == "e1").fetchOne(db)
        }
        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.encodedData, Data())
    }

    func test_cacheEntry_largeEncodedData() throws {
        let db = try makeDatabase()
        let largeData = Data(repeating: 0xAB, count: 100_000)
        let entry = CacheEntry(key: "large", itemId: "big1", encodedData: largeData, updatedAt: Date())

        try db.write { db in
            try entry.save(db)
        }

        let fetched = try db.read { db in
            try CacheEntry.filter(Column("key") == "large" && Column("itemId") == "big1").fetchOne(db)
        }
        XCTAssertEqual(fetched?.encodedData.count, 100_000)
    }

    func test_cacheEntry_multipleItemsSameKey() throws {
        let db = try makeDatabase()
        let now = Date()

        try db.write { db in
            for i in 1...5 {
                try CacheEntry(key: "batch", itemId: "item-\(i)", encodedData: Data("data-\(i)".utf8), updatedAt: now).save(db)
            }
        }

        let entries = try db.read { db in
            try CacheEntry.filter(Column("key") == "batch").fetchAll(db)
        }
        XCTAssertEqual(entries.count, 5)

        let itemIds = entries.map(\.itemId).sorted()
        XCTAssertEqual(itemIds, ["item-1", "item-2", "item-3", "item-4", "item-5"])
    }

    // MARK: - DBCacheMetadata Codable (point 60)

    func test_dbCacheMetadata_codableRoundtrip() throws {
        let now = Date()
        let original = DBCacheMetadata(
            key: "messages:conv-123",
            nextCursor: "abc_cursor",
            hasMore: true,
            totalCount: 42,
            lastFetchedAt: now
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(DBCacheMetadata.self, from: data)

        XCTAssertEqual(decoded.key, original.key)
        XCTAssertEqual(decoded.nextCursor, original.nextCursor)
        XCTAssertEqual(decoded.hasMore, original.hasMore)
        XCTAssertEqual(decoded.totalCount, original.totalCount)
    }

    func test_dbCacheMetadata_codableWithNilFields() throws {
        let original = DBCacheMetadata(
            key: "test",
            nextCursor: nil,
            hasMore: false,
            totalCount: nil,
            lastFetchedAt: Date()
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(DBCacheMetadata.self, from: data)

        XCTAssertEqual(decoded.key, "test")
        XCTAssertNil(decoded.nextCursor)
        XCTAssertFalse(decoded.hasMore)
        XCTAssertNil(decoded.totalCount)
    }

    // MARK: - CacheEntry GRDB Record Compliance

    func test_cacheEntry_databaseTableName() {
        XCTAssertEqual(CacheEntry.databaseTableName, "cache_entries")
    }

    func test_dbCacheMetadata_databaseTableName() {
        XCTAssertEqual(DBCacheMetadata.databaseTableName, "cache_metadata")
    }
}
