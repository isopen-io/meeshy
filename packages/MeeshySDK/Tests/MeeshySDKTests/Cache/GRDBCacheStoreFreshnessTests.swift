import XCTest
import GRDB
@testable import MeeshySDK

private struct FreshnessTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// T3 — Local-first cache freshness honesty.
///
/// `flushKeyToL2` used to stamp `lastFetchedAt = now` on every dirty flush, even
/// though dirty flushes are triggered by purely-LOCAL mutations (update/upsert/
/// mergeUpdate). After L1 eviction or a restart, `load()` computes age against
/// that bumped timestamp and reports `.fresh`, suppressing the
/// stale-while-revalidate network refresh. Only a genuine network `save()` may
/// advance the freshness clock.
final class GRDBCacheStoreFreshnessTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(
        ttl: TimeInterval = .hours(1),
        staleTTL: TimeInterval? = .minutes(5),
        maxL1Keys: Int = 20,
        db: DatabaseQueue
    ) -> GRDBCacheStore<String, FreshnessTestItem> {
        let policy = CachePolicy(ttl: ttl, staleTTL: staleTTL, maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: db, maxL1Keys: maxL1Keys)
    }

    private func backdateLastFetchedAt(_ date: Date, key: String, db: DatabaseQueue) async throws {
        let existing = try await db.read { db in
            try DBCacheMetadata.filter(Column("key") == key).fetchOne(db)
        }
        var meta = try XCTUnwrap(existing, "metadata row must exist after save()")
        meta.lastFetchedAt = date
        let toSave = meta
        try await db.write { db in try toSave.save(db) }
    }

    private func readLastFetchedAt(key: String, db: DatabaseQueue) async throws -> Date? {
        try await db.read { db in
            try DBCacheMetadata.filter(Column("key") == key).fetchOne(db)?.lastFetchedAt
        }
    }

    func test_localMutationFlush_preservesLastFetchedAt() async throws {
        let db = try makeDB()
        let store = makeStore(db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")

        let networkFetchedAt = Date(timeIntervalSince1970: 1_600_000_000) // 2020-09-13
        try await backdateLastFetchedAt(networkFetchedAt, key: "k", db: db)

        await store.update(for: "k") { $0 + [FreshnessTestItem(id: "2", name: "Bob")] }
        await store.flushDirtyKeys()

        let after = try await readLastFetchedAt(key: "k", db: db)
        XCTAssertEqual(after?.timeIntervalSince1970 ?? -1, networkFetchedAt.timeIntervalSince1970, accuracy: 1.0,
                       "A local-mutation flush must preserve lastFetchedAt, not reset it to now")
    }

    func test_networkSave_advancesLastFetchedAt() async throws {
        let db = try makeDB()
        let store = makeStore(db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")

        let old = Date(timeIntervalSince1970: 1_600_000_000)
        try await backdateLastFetchedAt(old, key: "k", db: db)

        // A genuine network fetch (save) MUST advance the freshness clock.
        try await store.save([FreshnessTestItem(id: "1", name: "Alice"), FreshnessTestItem(id: "2", name: "Bob")], for: "k")

        let after = try await readLastFetchedAt(key: "k", db: db)
        let unwrapped = try XCTUnwrap(after)
        XCTAssertGreaterThan(unwrapped, old, "A genuine network save() must advance lastFetchedAt")
    }

    func test_localMutationFlush_doesNotResurrectFreshness_afterEviction() async throws {
        let db = try makeDB()
        // ttl 1s / staleTTL 0.5s: anything ~1.5s+ old is expired.
        let store = makeStore(ttl: 1, staleTTL: 0.5, maxL1Keys: 1, db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")

        // Backdate well beyond the TTL: the cached page is genuinely expired.
        try await backdateLastFetchedAt(Date(timeIntervalSince1970: 1_600_000_000), key: "k", db: db)

        await store.update(for: "k") { $0 + [FreshnessTestItem(id: "2", name: "Bob")] }
        await store.flushDirtyKeys()
        await store.evictL1()

        let result = await store.load(for: "k")
        if case .fresh = result {
            XCTFail("A local-mutation flush must not resurrect freshness; load() returned .fresh for expired data")
        }
    }

    // MARK: - loadIgnoringExpiry (P2 — offline > 24h recovery)

    func test_loadIgnoringExpiry_whenL2EntryIsExpired_returnsThePersistedPayload() async throws {
        let db = try makeDB()
        let store = makeStore(ttl: 1, staleTTL: 0.5, db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")
        try await backdateLastFetchedAt(Date(timeIntervalSince1970: 1_600_000_000), key: "k", db: db)
        await store.evictL1()

        // Baseline: `load()` refuses to hand back the data once it's expired.
        let expired = await store.load(for: "k")
        guard case .expired = expired else {
            return XCTFail("Expected .expired once L1 is evicted and the disk entry is past the expiry threshold")
        }

        // The recovery path must still surface the same payload.
        let recovered = await store.loadIgnoringExpiry(for: "k")
        XCTAssertEqual(recovered?.items, [FreshnessTestItem(id: "1", name: "Alice")],
                       "loadIgnoringExpiry must return the on-disk payload even when load() reports .expired")
    }

    func test_loadIgnoringExpiry_whenNothingWasEverSaved_returnsNil() async throws {
        let db = try makeDB()
        let store = makeStore(db: db)

        let recovered = await store.loadIgnoringExpiry(for: "never-saved")

        XCTAssertNil(recovered, "loadIgnoringExpiry must return nil when there is truly no persisted payload")
    }

    func test_loadIgnoringExpiry_whenL1IsStillPopulated_returnsItDirectlyWithoutRequiringEviction() async throws {
        let db = try makeDB()
        let store = makeStore(db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")

        // No `evictL1()` round-trip here — `loadIgnoringExpiry` must serve
        // straight from the in-memory entry when one is present, the same
        // way `load()` does for its `.fresh`/`.stale` cases.
        let recovered = await store.loadIgnoringExpiry(for: "k")

        XCTAssertEqual(recovered?.items, [FreshnessTestItem(id: "1", name: "Alice")])
    }

    // MARK: - debugRewindFetchTimestamp (test seam for `.expired` integration tests)
    //
    // `DBCacheMetadata` (the table backing `lastFetchedAt`) is SDK-internal,
    // so a `CacheCoordinator.shared`-driven ViewModel test outside this
    // module has no way to force a real, singleton-backed store (e.g. the
    // 24h-TTL conversations store) into `.expired` short of waiting out the
    // wall clock. This seam mirrors the private `backdateLastFetchedAt`
    // helper above as a public, additive method so integration tests can
    // drive that path deterministically.

    func test_debugRewindFetchTimestamp_pastTTL_makesLoadReportExpiredButPayloadSurvives() async throws {
        let db = try makeDB()
        let store = makeStore(ttl: 1, staleTTL: 0.5, db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")

        await store.debugRewindFetchTimestamp(by: 10, for: "k")

        let result = await store.load(for: "k")
        guard case .expired = result else {
            return XCTFail("Expected .expired after rewinding lastFetchedAt past the TTL, got \(result)")
        }
        let recovered = await store.loadIgnoringExpiry(for: "k")
        XCTAssertEqual(recovered?.items, [FreshnessTestItem(id: "1", name: "Alice")],
                       "the payload must survive the rewind — only the freshness clock moves")
    }

    func test_debugRewindFetchTimestamp_afterL1Eviction_stillReportsExpiredFromL2() async throws {
        let db = try makeDB()
        let store = makeStore(ttl: 1, staleTTL: 0.5, db: db)
        try await store.save([FreshnessTestItem(id: "1", name: "Alice")], for: "k")

        await store.debugRewindFetchTimestamp(by: 10, for: "k")
        await store.evictL1()

        let result = await store.load(for: "k")
        guard case .expired = result else {
            return XCTFail("Expected .expired from L2 (not just L1) after eviction, got \(result)")
        }
    }

    func test_debugRewindFetchTimestamp_unknownKey_isNoOp() async throws {
        let db = try makeDB()
        let store = makeStore(db: db)

        await store.debugRewindFetchTimestamp(by: 10, for: "never-saved")

        let result = await store.load(for: "never-saved")
        guard case .empty = result else {
            return XCTFail("Rewinding a key that was never saved must not synthesize an entry, got \(result)")
        }
    }
}
