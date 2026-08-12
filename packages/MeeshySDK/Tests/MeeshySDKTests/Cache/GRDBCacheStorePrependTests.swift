import XCTest
import GRDB
@testable import MeeshySDK

private struct PrependTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// Covers `GRDBCacheStore.prependToExisting`, the primitive used to durably add a
/// real-time event (e.g. an incoming notification) to a cache the user already
/// populated, without disturbing its freshness clock or fabricating a misleading
/// single-item `.fresh` cache from an empty store.
final class GRDBCacheStorePrependTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(
        ttl: TimeInterval = .hours(1),
        staleTTL: TimeInterval? = .minutes(5),
        maxItemCount: Int? = nil,
        db: DatabaseQueue? = nil
    ) throws -> GRDBCacheStore<String, PrependTestItem> {
        let database = try db ?? makeDB()
        let policy = CachePolicy(ttl: ttl, staleTTL: staleTTL, maxItemCount: maxItemCount, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: database)
    }

    func test_prependToExisting_onEmptyStore_isNoOp() async throws {
        let store = try makeStore()

        await store.prependToExisting(PrependTestItem(id: "1", name: "Solo"), for: "key")

        let result = await store.load(for: "key")
        switch result {
        case .empty:
            break
        default:
            XCTFail("Empty store must stay .empty (never fabricate a fresh single-item cache), got \(result)")
        }
    }

    func test_prependToExisting_onPopulatedStore_prependsNewestFirst() async throws {
        let store = try makeStore()
        try await store.save([PrependTestItem(id: "a", name: "Alice")], for: "key")

        await store.prependToExisting(PrependTestItem(id: "b", name: "Bob"), for: "key")

        let result = await store.load(for: "key")
        let items = result.snapshot()
        XCTAssertEqual(items?.map(\.id), ["b", "a"])
    }

    func test_prependToExisting_dedupsById() async throws {
        let store = try makeStore()
        try await store.save([PrependTestItem(id: "a", name: "Alice")], for: "key")

        await store.prependToExisting(PrependTestItem(id: "a", name: "Alice v2"), for: "key")

        let items = await store.load(for: "key").snapshot()
        XCTAssertEqual(items?.count, 1)
        XCTAssertEqual(items?.first?.name, "Alice", "an already-present id must leave the list untouched")
    }

    func test_prependToExisting_trimsOldestPastMax() async throws {
        let store = try makeStore(maxItemCount: 2)
        try await store.save(
            [PrependTestItem(id: "a", name: "A"), PrependTestItem(id: "b", name: "B")],
            for: "key"
        )

        await store.prependToExisting(PrependTestItem(id: "c", name: "C"), for: "key")

        let items = await store.load(for: "key").snapshot()
        XCTAssertEqual(items?.map(\.id), ["c", "a"], "newest kept at front, oldest (b) trimmed from the tail")
    }

    func test_prependToExisting_preservesFreshnessClock() async throws {
        // staleTTL in the past forces every entry to read as .stale; a prepend must
        // NOT reset the clock to .fresh (which would suppress a background refresh).
        let store = try makeStore(ttl: .hours(1), staleTTL: -1)
        try await store.save([PrependTestItem(id: "a", name: "A")], for: "key")

        await store.prependToExisting(PrependTestItem(id: "b", name: "B"), for: "key")

        let result = await store.load(for: "key")
        switch result {
        case .stale(let items, _):
            XCTAssertEqual(items.map(\.id), ["b", "a"])
        default:
            XCTFail("Expected .stale (freshness preserved), got \(result)")
        }
    }
}
