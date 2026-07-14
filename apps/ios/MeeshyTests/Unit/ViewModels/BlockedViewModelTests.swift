import XCTest
@testable import Meeshy
import MeeshySDK

/// Local network monitor stub used to drive `CacheFirstLoader`'s
/// online/offline branching deterministically. The shared
/// `NetworkMonitor.shared` reports the simulator host's path status
/// asynchronously, which races with synchronous tests and makes the
/// error/offline mapping non-deterministic.
private final class TestNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool

    init(isOnline: Bool = true) {
        self.isOnline = isOnline
    }
}

@MainActor
final class BlockedViewModelTests: XCTestCase {

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        // The ViewModel uses `CacheCoordinator.shared.blockedUsers` for the
        // cache-first pipeline. Tests must start from a clean slate so the
        // cache from a previous run doesn't pre-empt the mock fetch.
        await CacheCoordinator.shared.blockedUsers.invalidate(for: "blocked:list")
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.blockedUsers.invalidate(for: "blocked:list")
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        blockService: MockBlockService = MockBlockService(),
        networkMonitor: TestNetworkMonitor = TestNetworkMonitor(isOnline: true)
    ) -> (sut: BlockedViewModel, blockService: MockBlockService) {
        let sut = BlockedViewModel(blockService: blockService, networkMonitor: networkMonitor)
        return (sut, blockService)
    }

    private static func makeBlockedUser(id: String, username: String = "user") -> BlockedUser {
        JSONStub.decode("""
        {"id":"\(id)","username":"\(username)","displayName":null,"avatar":null,"blockedAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    // MARK: - loadBlocked

    func test_loadBlocked_success_populatesList() async {
        let (sut, mock) = makeSUT()
        let users = [Self.makeBlockedUser(id: "b1", username: "alice"), Self.makeBlockedUser(id: "b2", username: "bob")]
        mock.listBlockedUsersResult = .success(users)

        await sut.loadBlocked()

        XCTAssertEqual(sut.blockedUsers.count, 2)
        XCTAssertEqual(sut.blockedUsers[0].id, "b1")
        XCTAssertEqual(sut.blockedUsers[1].id, "b2")
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(mock.listBlockedUsersCallCount, 1)
    }

    func test_loadBlocked_empty_setsLoadedWithEmptyList() async {
        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .success([])

        await sut.loadBlocked()

        XCTAssertTrue(sut.blockedUsers.isEmpty)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_loadBlocked_error_setsErrorState() async {
        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadBlocked()

        XCTAssertTrue(sut.blockedUsers.isEmpty)
        XCTAssertEqual(sut.loadState, .error("Erreur lors du chargement"))
    }

    // MARK: - unblock

    /// R6-4 incr.2 — unblock passe désormais par l'outbox (durable offline),
    /// pas par l'appel REST direct (online-only, perdu offline) : retrait
    /// optimiste de la liste + flip de la blocklist canonique
    /// (`setBlockedOptimistic`), SANS toucher `unblockUser` (le dispatcher
    /// outbox possède le DELETE).
    func test_unblock_routesThroughOutbox_notDirectRESTCall() async {
        let (sut, mock) = makeSUT()
        let users = [Self.makeBlockedUser(id: "b1"), Self.makeBlockedUser(id: "b2")]
        mock.listBlockedUsersResult = .success(users)
        await sut.loadBlocked()
        mock.blockedUserIds = ["b1", "b2"]

        await sut.unblock(userId: "b1")

        XCTAssertEqual(sut.blockedUsers.count, 1)
        XCTAssertEqual(sut.blockedUsers[0].id, "b2")
        XCTAssertEqual(mock.unblockUserCallCount, 0,
            "unblock must NOT hit the direct REST path — the outbox dispatcher owns it")
        XCTAssertEqual(mock.setBlockedOptimisticCallCount, 1,
            "unblock must flip the canonical blocklist optimistically")
        XCTAssertFalse(mock.isBlocked(userId: "b1"),
            "the canonical blocklist must reflect the optimistic unblock")
    }

    // MARK: - initial state

    func test_initialState_isIdle() {
        let (sut, _) = makeSUT()
        XCTAssertTrue(sut.blockedUsers.isEmpty)
        XCTAssertEqual(sut.loadState, .idle)
    }

    // MARK: - loadState transitions

    func test_loadState_transitionsToLoadingThenLoaded() async {
        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .success([])

        XCTAssertEqual(sut.loadState, .idle)
        await sut.loadBlocked()
        XCTAssertEqual(sut.loadState, .loaded)
    }

    // MARK: - Cache-First Behavior

    /// When the cache holds fresh data, the ViewModel surfaces it immediately
    /// and skips the network call. This is the core "no spinner when cache
    /// has data" promise from the architecture bible.
    func test_loadBlocked_withCachedFreshData_skipsNetworkAndAppliesCache() async {
        let cached = [Self.makeBlockedUser(id: "cached-1", username: "cached")]
        try? await CacheCoordinator.shared.blockedUsers.save(cached, for: "blocked:list")

        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .success([Self.makeBlockedUser(id: "fresh-1", username: "fresh")])

        await sut.loadBlocked()

        XCTAssertEqual(sut.blockedUsers.map(\.id), ["cached-1"])
        XCTAssertEqual(mock.listBlockedUsersCallCount, 0, "Fresh cache must short-circuit the network call")
        XCTAssertEqual(sut.loadState, .loaded)
    }

    /// Cold start with empty cache: spinner shown, network fetch happens,
    /// results saved to cache for the next visit.
    func test_loadBlocked_withEmptyCache_callsNetworkAndPersistsToCache() async {
        let fresh = [Self.makeBlockedUser(id: "n1", username: "alice")]

        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .success(fresh)

        await sut.loadBlocked()

        XCTAssertEqual(sut.blockedUsers.map(\.id), ["n1"])
        XCTAssertEqual(mock.listBlockedUsersCallCount, 1)

        let cacheValue = await CacheCoordinator.shared.blockedUsers.load(for: "blocked:list").snapshot()
        XCTAssertEqual(cacheValue?.map(\.id), ["n1"], "Network result must be persisted")
    }
}
