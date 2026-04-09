import XCTest
import GRDB
@testable import MeeshySDK

private struct CacheTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

final class GRDBCacheStoreTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(
        ttl: TimeInterval = .hours(1),
        staleTTL: TimeInterval? = .minutes(5),
        maxItemCount: Int? = nil,
        maxL1Keys: Int = 20,
        db: DatabaseQueue? = nil
    ) throws -> GRDBCacheStore<String, CacheTestItem> {
        let database = try db ?? makeDB()
        let policy = CachePolicy(ttl: ttl, staleTTL: staleTTL, maxItemCount: maxItemCount, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: database, maxL1Keys: maxL1Keys)
    }

    // MARK: - save + load

    func test_saveAndLoad_returnsFresh() async throws {
        let store = try makeStore()
        let items = [CacheTestItem(id: "1", name: "Alice"), CacheTestItem(id: "2", name: "Bob")]

        await store.save(items, for: "key1")
        let result = await store.load(for: "key1")

        switch result {
        case .fresh(let loaded, _):
            XCTAssertEqual(loaded, items)
        default:
            XCTFail("Expected .fresh but got \(result)")
        }
    }

    func test_load_nonexistentKey_returnsEmpty() async throws {
        let store = try makeStore()
        let result = await store.load(for: "nonexistent")

        switch result {
        case .empty:
            break
        default:
            XCTFail("Expected .empty but got \(result)")
        }
    }

    func test_save_persistsToL2() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        let items = [CacheTestItem(id: "1", name: "Alice")]

        await store.save(items, for: "testkey")

        let count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "testkey").fetchCount(db)
        }
        XCTAssertEqual(count, 1)
    }

    func test_save_updatesMetadata() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        let items = [CacheTestItem(id: "1", name: "Alice")]

        await store.save(items, for: "metakey")

        let meta = try await db.read { db in
            try DBCacheMetadata.filter(Column("key") == "metakey").fetchOne(db)
        }
        XCTAssertNotNil(meta)
        XCTAssertEqual(meta?.key, "metakey")
    }

    func test_save_trimsToMaxItemCount() async throws {
        let store = try makeStore(maxItemCount: 2)
        let items = [
            CacheTestItem(id: "1", name: "A"),
            CacheTestItem(id: "2", name: "B"),
            CacheTestItem(id: "3", name: "C")
        ]

        await store.save(items, for: "trimkey")
        let result = await store.load(for: "trimkey")

        XCTAssertEqual(result.value?.count, 2)
    }

    // MARK: - update

    func test_update_mutatesL1() async throws {
        let store = try makeStore()
        let items = [CacheTestItem(id: "1", name: "Alice")]
        await store.save(items, for: "upkey")

        await store.update(for: "upkey") { existing in
            existing + [CacheTestItem(id: "2", name: "Bob")]
        }

        let result = await store.load(for: "upkey")
        XCTAssertEqual(result.value?.count, 2)
    }

    func test_update_onMissingKey_isNoOp() async throws {
        let store = try makeStore()

        await store.update(for: "missing") { existing in
            existing + [CacheTestItem(id: "1", name: "Alice")]
        }

        let result = await store.load(for: "missing")
        switch result {
        case .empty:
            break
        default:
            XCTFail("Expected .empty but got \(result)")
        }
    }

    // MARK: - invalidate

    func test_invalidate_clearsL1AndL2() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        let items = [CacheTestItem(id: "1", name: "Alice")]
        await store.save(items, for: "invkey")

        await store.invalidate(for: "invkey")

        let result = await store.load(for: "invkey")
        switch result {
        case .empty:
            break
        default:
            XCTFail("Expected .empty but got \(result)")
        }

        let count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "invkey").fetchCount(db)
        }
        XCTAssertEqual(count, 0)
    }

    func test_invalidateAll_clearsEverything() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        await store.save([CacheTestItem(id: "1", name: "A")], for: "k1")
        await store.save([CacheTestItem(id: "2", name: "B")], for: "k2")

        await store.invalidateAll()

        let r1 = await store.load(for: "k1")
        let r2 = await store.load(for: "k2")
        switch (r1, r2) {
        case (.empty, .empty):
            break
        default:
            XCTFail("Expected both .empty but got \(r1), \(r2)")
        }
    }

    // MARK: - flushDirtyKeys

    func test_flushDirtyKeys_persistsMutation() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        await store.save([CacheTestItem(id: "1", name: "Alice")], for: "flushkey")

        await store.update(for: "flushkey") { existing in
            existing + [CacheTestItem(id: "2", name: "Bob")]
        }

        await store.flushDirtyKeys()

        let count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "flushkey").fetchCount(db)
        }
        XCTAssertEqual(count, 2)
    }

    func test_flushDirtyKeys_noDirty_isNoOp() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        await store.save([CacheTestItem(id: "1", name: "Alice")], for: "cleankey")

        await store.flushDirtyKeys()

        let count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "cleankey").fetchCount(db)
        }
        XCTAssertEqual(count, 1)
    }

    func test_flushDirtyKeys_removesDeletedItems() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)
        await store.save([CacheTestItem(id: "1", name: "A"), CacheTestItem(id: "2", name: "B")], for: "delkey")

        await store.update(for: "delkey") { _ in
            [CacheTestItem(id: "1", name: "A")]
        }

        await store.flushDirtyKeys()

        let count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "delkey").fetchCount(db)
        }
        XCTAssertEqual(count, 1)
    }

    // MARK: - LRU eviction

    func test_lru_evictsOldestButPreservesL2() async throws {
        let db = try makeDB()
        let store = try makeStore(maxL1Keys: 2, db: db)

        await store.save([CacheTestItem(id: "1", name: "A")], for: "lru1")
        await store.save([CacheTestItem(id: "2", name: "B")], for: "lru2")
        await store.save([CacheTestItem(id: "3", name: "C")], for: "lru3")

        let l2Count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "lru1").fetchCount(db)
        }
        XCTAssertEqual(l2Count, 1, "Evicted key should still have L2 entries")

        let result = await store.load(for: "lru1")
        XCTAssertNotNil(result.value, "Evicted key should still be loadable from L2")
    }

    // MARK: - L2 freshness

    func test_loadFromL2_checksFreshness() async throws {
        let db = try makeDB()
        let store = try makeStore(ttl: 1, staleTTL: 0.5, maxL1Keys: 1, db: db)

        await store.save([CacheTestItem(id: "1", name: "A")], for: "freshkey")
        await store.save([CacheTestItem(id: "2", name: "B")], for: "otherkey")

        try await Task.sleep(nanoseconds: 600_000_000)

        let result = await store.load(for: "freshkey")
        switch result {
        case .stale(let items, _):
            XCTAssertEqual(items.count, 1)
        case .expired:
            break
        default:
            XCTFail("Expected .stale or .expired but got \(result)")
        }
    }

    // MARK: - L1 eviction ordering

    func test_lru_evictsLeastRecentlyUsed_notMostRecent() async throws {
        let db = try makeDB()
        let store = try makeStore(maxL1Keys: 3, db: db)

        await store.save([CacheTestItem(id: "1", name: "A")], for: "k1")
        await store.save([CacheTestItem(id: "2", name: "B")], for: "k2")
        await store.save([CacheTestItem(id: "3", name: "C")], for: "k3")

        // Touch k1 to make it recently used
        _ = await store.load(for: "k1")

        // Adding k4 should evict k2 (least recently used), not k1
        await store.save([CacheTestItem(id: "4", name: "D")], for: "k4")

        let loadedKeys = await store.loadedKeys()
        XCTAssertTrue(loadedKeys.contains("k1"), "k1 should remain in L1 (recently accessed)")
        XCTAssertFalse(loadedKeys.contains("k2"), "k2 should be evicted from L1 (LRU)")
        XCTAssertTrue(loadedKeys.contains("k3"), "k3 should remain in L1")
        XCTAssertTrue(loadedKeys.contains("k4"), "k4 should be in L1 (just added)")

        // k2 should still be loadable from L2
        let k2Result = await store.load(for: "k2")
        XCTAssertNotNil(k2Result.value, "Evicted key should still be loadable from L2")
    }

    func test_lru_multipleSaves_evictsMultipleOldEntries() async throws {
        let db = try makeDB()
        let store = try makeStore(maxL1Keys: 2, db: db)

        await store.save([CacheTestItem(id: "1", name: "A")], for: "a")
        await store.save([CacheTestItem(id: "2", name: "B")], for: "b")
        await store.save([CacheTestItem(id: "3", name: "C")], for: "c")
        await store.save([CacheTestItem(id: "4", name: "D")], for: "d")

        let loadedKeys = await store.loadedKeys()
        XCTAssertEqual(loadedKeys.count, 2, "Only maxL1Keys entries should remain in L1")

        // All entries should be loadable from L2
        for key in ["a", "b", "c", "d"] {
            let result = await store.load(for: key)
            XCTAssertNotNil(result.value, "Key '\(key)' should be loadable from L2")
        }
    }

    // MARK: - Concurrent access

    func test_concurrentSaveAndLoad_doesNotCrash() async throws {
        let db = try makeDB()
        let store = try makeStore(maxL1Keys: 5, db: db)

        await withTaskGroup(of: Void.self) { group in
            for i in 0..<20 {
                group.addTask {
                    let item = CacheTestItem(id: "\(i)", name: "Item \(i)")
                    await store.save([item], for: "concurrent-\(i % 5)")
                }
                group.addTask {
                    _ = await store.load(for: "concurrent-\(i % 5)")
                }
            }
        }

        // If we get here without crash, the test passes.
        // Verify at least some data is accessible
        let result = await store.load(for: "concurrent-0")
        XCTAssertNotNil(result.value)
    }

    func test_concurrentUpdatesAndFlush_doesNotCrash() async throws {
        let db = try makeDB()
        let store = try makeStore(db: db)

        await store.save([CacheTestItem(id: "1", name: "Initial")], for: "shared")

        await withTaskGroup(of: Void.self) { group in
            for i in 0..<10 {
                group.addTask {
                    await store.update(for: "shared") { items in
                        items + [CacheTestItem(id: "extra-\(i)", name: "Extra \(i)")]
                    }
                }
            }
            group.addTask {
                await store.flushDirtyKeys()
            }
        }

        let result = await store.load(for: "shared")
        XCTAssertNotNil(result.value)
    }
}
