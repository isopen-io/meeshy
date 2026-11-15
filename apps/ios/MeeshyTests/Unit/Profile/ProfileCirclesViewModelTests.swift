import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// La rangée « Mes cercles » de ma fiche (#18590) se peint depuis le MÊME cache que « Mes cercles » (store des liens,
/// clé `CirclesViewModel.cacheKey`) : zéro réseau quand le cache est frais, revalidation silencieuse quand il est
/// périmé, et un échec réseau ne retire jamais ce qui est déjà peint.
@MainActor
final class ProfileCirclesViewModelTests: XCTestCase {

    private final class StubPendingRequests: ProfilePendingRequestsCounting, @unchecked Sendable {
        var pendingReceivedCount: Int
        let changes = PassthroughSubject<Void, Never>()
        var pendingReceivedChanges: AnyPublisher<Void, Never> { changes.eraseToAnyPublisher() }
        init(_ count: Int) { pendingReceivedCount = count }
    }

    private struct Rig {
        let sut: ProfileCirclesViewModel
        let relations: MockRelationsService
        let pending: StubPendingRequests
    }

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        try await super.tearDown()
    }

    private func makeRig(online: Bool = true, pending: Int = 0) -> Rig {
        let relations = MockRelationsService()
        let pendingRequests = StubPendingRequests(pending)
        let sut = ProfileCirclesViewModel(
            relations: relations,
            pendingRequests: pendingRequests,
            networkMonitor: FakeNetworkMonitor(isOnline: online)
        )
        return Rig(sut: sut, relations: relations, pending: pendingRequests)
    }

    private func link(_ userId: String, _ level: RelationLevel) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level)
    }

    func test_load_withAFreshCache_servesItWithoutTheNetwork() async throws {
        let rig = makeRig()
        try await CacheCoordinator.shared.relationLinks.save([link("a", .friend), link("b", .close)], for: CirclesViewModel.cacheKey)

        await rig.sut.load()

        XCTAssertEqual(rig.relations.linksCallCount, 0, "un cache frais se sert sans réseau")
        XCTAssertEqual(rig.sut.summary.count(of: .friend), 1)
        XCTAssertEqual(rig.sut.summary.count(of: .close), 1)
        XCTAssertEqual(rig.sut.loadState, .cachedFresh)
    }

    func test_load_withAStaleCache_paintsItFirst_thenRevalidatesInSilence() async throws {
        let rig = makeRig()
        try await CacheCoordinator.shared.relationLinks.saveAsStale([link("a", .friend)], for: CirclesViewModel.cacheKey)
        rig.relations.linksResult = .success([link("a", .friend), link("b", .blood)])
        var painted: [Int] = []
        let watch = rig.sut.$summary.dropFirst().sink { painted.append($0.total) }

        await rig.sut.load()
        watch.cancel()

        XCTAssertEqual(painted.first, 1, "le cache se peint avant le réseau")
        XCTAssertEqual(rig.sut.summary.total, 2)
        XCTAssertEqual(rig.sut.summary.count(of: .blood), 1)
        XCTAssertEqual(rig.relations.linksCallCount, 1)
        XCTAssertEqual(rig.sut.loadState, .loaded)
    }

    func test_load_whenTheNetworkFails_keepsTheCachedCounts() async throws {
        let rig = makeRig(online: false)
        try await CacheCoordinator.shared.relationLinks.saveAsStale([link("a", .close)], for: CirclesViewModel.cacheKey)
        rig.relations.linksResult = .failure(URLError(.notConnectedToInternet))

        await rig.sut.load()

        XCTAssertEqual(rig.sut.summary.count(of: .close), 1, "un échec réseau ne retire jamais ce qui est peint")
        XCTAssertEqual(rig.sut.loadState, .offline)
    }

    func test_load_coldCache_emptyServer_isFiveZeros_notAnError() async {
        let rig = makeRig()

        await rig.sut.load()

        XCTAssertEqual(rig.sut.summary, .empty)
        XCTAssertEqual(rig.sut.loadState, .loaded)
    }

    func test_load_coldCache_failure_keepsZeros_neverInventsACount() async {
        let rig = makeRig()
        rig.relations.linksResult = .failure(URLError(.badServerResponse))

        await rig.sut.load()

        XCTAssertEqual(rig.sut.summary.total, 0)
        if case .error = rig.sut.loadState {} else { XCTFail("un échec en ligne sans cache est une erreur, pas un état vide") }
    }

    func test_load_carriesThePendingRequestsToAnswer() async {
        let rig = makeRig(pending: 2)

        await rig.sut.load()

        XCTAssertEqual(rig.sut.summary.pendingCount, 2)
    }

    func test_beforeAnyLoad_theSummaryIsFiveZeros() {
        XCTAssertEqual(makeRig(pending: 4).sut.summary, .empty, "rien n'est montré avant d'avoir été lu")
    }

    func test_pendingRequests_whenTheyChangeAfterLoad_theRowFollowsWithoutReloading() async {
        let rig = makeRig(pending: 0)
        await rig.sut.load()
        let followed = expectation(description: "la rangée suit les demandes reçues")
        let watch = rig.sut.$summary.dropFirst().sink { if $0.pendingCount == 3 { followed.fulfill() } }

        rig.pending.pendingReceivedCount = 3
        rig.pending.changes.send(())

        await fulfillment(of: [followed], timeout: 2)
        watch.cancel()
        XCTAssertEqual(rig.relations.linksCallCount, 1, "suivre les demandes ne relit pas les liens")
    }

    func test_hasServedLinks_beforeAnythingIsServed_isFalse() {
        XCTAssertFalse(makeRig().sut.hasServedLinks, "rien n'est servi tant que ni le cache ni le serveur n'ont répondu")
    }

    func test_load_coldCache_failure_hasNotServedLinks() async {
        let rig = makeRig()
        rig.relations.linksResult = .failure(URLError(.badServerResponse))

        await rig.sut.load()

        XCTAssertFalse(rig.sut.hasServedLinks, "un échec sans cache ne dit pas « aucun lien »")
    }

    func test_load_coldCache_emptyServer_hasServedLinks() async {
        let rig = makeRig()

        await rig.sut.load()

        XCTAssertTrue(rig.sut.hasServedLinks, "le serveur a répondu « aucun lien » : c'est une réponse")
    }
}
