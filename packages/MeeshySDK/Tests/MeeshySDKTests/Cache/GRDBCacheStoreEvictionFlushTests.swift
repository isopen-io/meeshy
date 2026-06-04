import XCTest
import GRDB
@testable import MeeshySDK

private struct EvictTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// T4 — Eviction must never silently drop a dirty L1 mutation.
///
/// `touchKey`'s LRU eviction and `evictL1` removed entries from memory without
/// flushing dirty ones to L2. A local mutation that hadn't reached its 2s
/// debounce window lived only in L1, so a burst of cross-key activity (e.g.
/// many conversations updated over the socket, maxL1Keys=20) could evict and
/// lose it. They also left the evicted keys in `dirtyKeys`, leaking the
/// debounce clock. Invariant under test: no eviction path drops a dirty L1
/// entry without first flushing it, and the dirty set never retains a key that
/// is no longer in L1.
final class GRDBCacheStoreEvictionFlushTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(maxL1Keys: Int, db: DatabaseQueue) -> GRDBCacheStore<String, EvictTestItem> {
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: db, maxL1Keys: maxL1Keys)
    }

    private func l2Count(_ key: String, db: DatabaseQueue) async throws -> Int {
        try await db.read { db in
            try CacheEntry.filter(Column("key") == key).fetchCount(db)
        }
    }

    func test_lruEviction_flushesDirtyVictimToL2_andClearsDirtySet() async throws {
        let db = try makeDB()
        let store = makeStore(maxL1Keys: 2, db: db)

        // k1 saved (1 item in L2), then locally mutated (2 items in L1, dirty,
        // NOT yet flushed — the 2s debounce hasn't fired).
        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k1")
        await store.update(for: "k1") { $0 + [EvictTestItem(id: "2", name: "B")] }

        // Touch two more keys so the LRU evicts k1.
        try await store.save([EvictTestItem(id: "3", name: "C")], for: "k2")
        try await store.save([EvictTestItem(id: "4", name: "D")], for: "k3")

        let k1L2 = try await l2Count("k1", db: db)
        XCTAssertEqual(k1L2, 2, "Evicting a dirty key must flush its mutation to L2 (not lose it)")

        let dirty = await store.dirtyKeyCount()
        XCTAssertEqual(dirty, 0, "A flushed-on-eviction key must be removed from the dirty set")
    }

    func test_evictL1_flushesDirtyToL2_andClearsDirtySet() async throws {
        let db = try makeDB()
        let store = makeStore(maxL1Keys: 20, db: db)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k")
        await store.update(for: "k") { $0 + [EvictTestItem(id: "2", name: "B")] }

        await store.evictL1()

        let k1L2 = try await l2Count("k", db: db)
        XCTAssertEqual(k1L2, 2, "evictL1 must flush dirty mutations to L2 before dropping memory")

        let dirty = await store.dirtyKeyCount()
        XCTAssertEqual(dirty, 0, "evictL1 must not leave evicted keys in the dirty set")
    }
}
