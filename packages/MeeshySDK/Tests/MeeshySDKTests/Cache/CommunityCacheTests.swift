import XCTest
import GRDB
@testable import MeeshySDK

/// Task 2.1 of the iOS Local-First Wave 1 plan — Communities cache-first.
///
/// These tests pin the contract the conversation-list call site relies on:
///   1. `APICommunity` round-trips through `GRDBCacheStore` without losing
///      identity or fields, i.e. it really is `Codable + CacheIdentifiable`.
///   2. The new `CachePolicy.communities` declares a non-zero stale window
///      so the conversation list gets a `.stale` branch (cache-instant +
///      silent revalidate) rather than collapsing to `.fresh` -> `.expired`
///      on the next reopen.
///   3. The `communities` typed store on `CacheCoordinator` is wired with
///      the new policy and namespace so the SDK and the iOS app converge
///      on the same key bucket.
///
/// We deliberately exercise the store directly rather than the
/// `ConversationListView.loadUserCommunities()` call site: that function is a
/// `private func` on a SwiftUI `View` (not a ViewModel) so it has no testable
/// seam from MeeshyTests today. The cache contract is the load-bearing piece
/// — the view-level switch is a straight switch over `CacheResult` that just
/// applies/persists. Extracting it into a ViewModel is queued as a follow-up.
final class CommunityCacheTests: XCTestCase {

    // MARK: - Helpers

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    /// Creates a fresh store backed by an in-memory GRDB queue using the
    /// real production policy (`CachePolicy.communities`). This guarantees
    /// the tests fail the day someone tightens the policy past the SWR
    /// window the conversation list depends on.
    private func makeCommunitiesStore(db: DatabaseQueue? = nil) throws -> GRDBCacheStore<String, APICommunity> {
        let database = try db ?? makeDB()
        return GRDBCacheStore(policy: .communities, db: database, namespace: "communities")
    }

    private static func makeAPICommunity(
        id: String = "comm-1",
        name: String = "Meeshy Devs"
    ) -> APICommunity {
        let json = """
        {
          "id": "\(id)",
          "identifier": "\(id)-slug",
          "name": "\(name)",
          "description": null,
          "avatar": null,
          "banner": null,
          "isPrivate": true,
          "createdBy": "user-1",
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": null,
          "creator": null,
          "members": null,
          "_count": { "members": 3 }
        }
        """
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { dec in
            let str = try dec.singleValueContainer().decode(String.self)
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(
                in: try dec.singleValueContainer(),
                debugDescription: "Unparseable date \(str)"
            )
        }
        // swiftlint:disable:next force_try
        return try! decoder.decode(APICommunity.self, from: Data(json.utf8))
    }

    // MARK: - Codable round-trip

    /// The store layers JSON encode/decode on top of GRDB. If `APICommunity`
    /// is missing `Codable` (was previously only `Decodable`) the save path
    /// would fail to compile; this test exercises the runtime round-trip
    /// against the production policy + namespace so we catch any future
    /// regression that drops a field from the encodable surface.
    func test_save_thenLoad_roundTripsAPICommunity() async throws {
        let store = try makeCommunitiesStore()
        let community = Self.makeAPICommunity(id: "comm-42", name: "Meeshy Core")

        try await store.save([community], for: "list")
        let result = await store.load(for: "list")

        switch result {
        case .fresh(let loaded, _):
            XCTAssertEqual(loaded.count, 1)
            XCTAssertEqual(loaded.first?.id, "comm-42")
            XCTAssertEqual(loaded.first?.name, "Meeshy Core")
            XCTAssertEqual(loaded.first?.identifier, "comm-42-slug")
            XCTAssertEqual(loaded.first?._count?.members, 3)
        default:
            XCTFail("Expected .fresh after save; got \(result)")
        }
    }

    /// A cold L1 (new actor instance pointed at the same DB) MUST still
    /// hydrate from L2. This is the cache-on-cold-start guarantee the
    /// conversation list relies on for instant render.
    func test_load_afterSave_servesFromL2OnFreshActor() async throws {
        let db = try makeDB()
        let writer = try makeCommunitiesStore(db: db)
        try await writer.save([Self.makeAPICommunity(id: "c1"), Self.makeAPICommunity(id: "c2")], for: "list")

        let reader = try makeCommunitiesStore(db: db)
        let result = await reader.load(for: "list")

        XCTAssertEqual(result.value?.map(\.id), ["c1", "c2"])
    }

    // MARK: - Policy contract

    /// The conversation-list switch only triggers a silent revalidate if the
    /// policy actually emits `.stale` for some non-empty age window. If the
    /// staleTTL ever gets clamped to ttl (or removed) every reopen would
    /// short-circuit on `.fresh` until the 24 h expiry, defeating the SWR
    /// loop. Pin the window so any policy regression fails this test.
    func test_communitiesPolicy_hasStaleWindow() {
        let policy = CachePolicy.communities
        XCTAssertNotNil(policy.staleTTL, "Communities policy must expose a stale window for SWR")
        if let stale = policy.staleTTL {
            XCTAssertLessThan(stale, policy.ttl, "staleTTL must be strictly less than ttl so .stale is reachable")
            XCTAssertGreaterThan(stale, 0, "staleTTL must be positive")
        }
    }

    /// Drives the policy through `freshness(age:)` so the test pins the
    /// three buckets the switch consumes. If anyone widens fresh past
    /// stale, or shrinks stale past ttl, the switch logic in
    /// `loadUserCommunities` would drop into the wrong branch.
    func test_communitiesPolicy_freshnessBoundaries() {
        let policy = CachePolicy.communities
        XCTAssertEqual(policy.freshness(age: 0), .fresh)
        if let stale = policy.staleTTL {
            XCTAssertEqual(policy.freshness(age: stale - 1), .fresh)
            XCTAssertEqual(policy.freshness(age: stale + 1), .stale)
        }
        XCTAssertEqual(policy.freshness(age: policy.ttl + 1), .expired)
    }

    // MARK: - CacheCoordinator wiring

    /// The store the iOS app actually targets is
    /// `CacheCoordinator.shared.communities`. Save through the singleton
    /// then load back to prove the store really is reachable, mutable, and
    /// keyed under `"list"` — the same bucket the conversation list uses.
    /// The store property is actor-isolated on `CacheCoordinator`, so the
    /// awaits below pin the wiring contract end-to-end.
    func test_cacheCoordinator_communitiesStore_savesAndLoadsThroughSingleton() async throws {
        let store = await CacheCoordinator.shared.communities
        await store.invalidate(for: "list")

        let community = Self.makeAPICommunity(id: "comm-singleton")
        try await store.save([community], for: "list")

        let result = await store.load(for: "list")
        XCTAssertEqual(result.value?.first?.id, "comm-singleton")

        // Cleanup so the singleton doesn't leak state into other tests.
        await store.invalidate(for: "list")
    }
}
