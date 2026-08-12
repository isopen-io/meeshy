import XCTest
import GRDB
@testable import MeeshySDK

private struct TouchTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// `touch(for:)` resets the freshness clock to "now" WITHOUT refetching so the
/// next `load` reads `.fresh` and retention is extended on access (e.g. a
/// profile re-visited bumps its 30-day horizon). It bumps L1 `loadedAt` and L2
/// `lastFetchedAt`, and is a no-op when no entry exists.
final class GRDBCacheStoreTouchTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(
        ttl: TimeInterval = .hours(1),
        staleTTL: TimeInterval? = 0.2,
        maxL1Keys: Int = 20,
        db: DatabaseQueue
    ) -> GRDBCacheStore<String, TouchTestItem> {
        let policy = CachePolicy(ttl: ttl, staleTTL: staleTTL, maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: db, maxL1Keys: maxL1Keys)
    }

    func test_touch_resets_freshness_clock() async throws {
        let db = try makeDB()
        // staleTTL 0.2s, large ttl: anything older than ~0.2s reads .stale.
        let store = makeStore(ttl: .hours(1), staleTTL: 0.2, db: db)
        try await store.save([TouchTestItem(id: "1", name: "Alice")], for: "k")

        // Sleep past the staleTTL so the page falls into the .stale branch.
        try await Task.sleep(nanoseconds: 350_000_000)
        let staleResult = await store.load(for: "k")
        guard case .stale = staleResult else {
            return XCTFail("Expected .stale after staleTTL elapsed, got \(staleResult)")
        }

        // touch resets the freshness clock to now without refetching.
        await store.touch(for: "k")

        let afterTouch = await store.load(for: "k")
        guard case .fresh(let items, _) = afterTouch else {
            return XCTFail("Expected .fresh after touch, got \(afterTouch)")
        }
        XCTAssertEqual(items, [TouchTestItem(id: "1", name: "Alice")])
    }

    func test_touch_noop_when_absent() async throws {
        let db = try makeDB()
        let store = makeStore(db: db)

        // Must not crash on a missing key.
        await store.touch(for: "ghost")

        let result = await store.load(for: "ghost")
        guard case .empty = result else {
            return XCTFail("Expected .empty for a never-saved key, got \(result)")
        }
    }
}
