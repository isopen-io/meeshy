import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CommunityListViewModelTests: XCTestCase {

    func test_refresh_remplaceLaListe_hasMoreSuitLaPagination() async {
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a"), CommunityStubs.community(id: "b")], hasMore: true))
        let sut = CommunityListViewModel(service: service)

        await sut.refresh()

        XCTAssertEqual(sut.communities.map(\.id), ["a", "b"])
        XCTAssertTrue(sut.hasMore)
        XCTAssertEqual(service.lastListOffset, 0)
    }

    func test_loadMore_ajouteSansDoublon_depuisLOffsetCourant() async {
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a")], hasMore: true))
        let sut = CommunityListViewModel(service: service)
        await sut.refresh()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a"), CommunityStubs.community(id: "c")]))

        await sut.loadMore()

        XCTAssertEqual(sut.communities.map(\.id), ["a", "c"])
        XCTAssertEqual(service.lastListOffset, 1)
        XCTAssertFalse(sut.hasMore)
    }

    func test_loadIfNeeded_secondAppel_neRappellePasLeService() async {
        await CacheCoordinator.shared.communities.invalidate(for: "list")
        let service = MockCommunityService()
        let sut = CommunityListViewModel(service: service)

        await sut.loadIfNeeded()
        await sut.loadIfNeeded()

        XCTAssertEqual(service.listCallCount, 1)
    }

    // MARK: - Cache-first (#18935)

    /// L'écran des communautés n'avait aucun cache : un indicateur à chaque
    /// ouverture, et une liste vide hors ligne. Il se peint désormais depuis
    /// « mes communautés », puis se revalide en silence.
    func test_loadIfNeeded_withCachedCommunities_paintsBeforeNetwork() async throws {
        let store = await CacheCoordinator.shared.communities
        try await store.save([CommunityStubs.community(id: "a")], for: "list")
        await store.debugRewindFetchTimestamp(by: 600, for: "list")
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a"), CommunityStubs.community(id: "b", name: "Beta")]))
        let sut = CommunityListViewModel(service: service)
        var firstPaint: [String]?
        var networkCallsAtFirstPaint: Int?
        var loadingAtFirstPaint: Bool?
        let revalidated = expectation(description: "revalidée en silence")
        revalidated.assertForOverFulfill = false
        let watch = sut.$communities.dropFirst().sink { communities in
            if firstPaint == nil {
                firstPaint = communities.map(\.id)
                networkCallsAtFirstPaint = service.listCallCount
                loadingAtFirstPaint = sut.isLoading
            }
            if communities.count == 2 { revalidated.fulfill() }
        }

        await sut.loadIfNeeded()
        await fulfillment(of: [revalidated], timeout: 2)
        watch.cancel()
        await store.invalidate(for: "list")

        XCTAssertEqual(firstPaint, ["a"], "le cache se peint d'abord")
        XCTAssertEqual(networkCallsAtFirstPaint, 0, "avant tout appel réseau")
        XCTAssertEqual(loadingAtFirstPaint, false, "aucun indicateur sur un cache non vide")
        XCTAssertEqual(sut.communities.map(\.id), ["a", "b"])
    }

    func test_loadIfNeeded_offlineWithCachedCommunities_keepsThem() async throws {
        let store = await CacheCoordinator.shared.communities
        try await store.save([CommunityStubs.community(id: "a")], for: "list")
        await store.debugRewindFetchTimestamp(by: 25 * 3600, for: "list")
        let service = MockCommunityService()
        service.listResult = .failure(URLError(.notConnectedToInternet))
        let sut = CommunityListViewModel(service: service)

        await sut.loadIfNeeded()
        await store.invalidate(for: "list")

        XCTAssertEqual(sut.communities.map(\.id), ["a"], "hors ligne, le disque reste à l'écran")
        XCTAssertFalse(sut.isLoading)
    }

    func test_refresh_freshCache_stillAsksTheNetworkAndKeepsTheFirstPage() async throws {
        let store = await CacheCoordinator.shared.communities
        try await store.save([CommunityStubs.community(id: "a")], for: "list")
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "b", name: "Beta")]))
        let sut = CommunityListViewModel(service: service)

        await sut.refresh()

        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertEqual(service.listCallCount, 1, "tirer pour rafraîchir interroge toujours le serveur")
        XCTAssertEqual(cached, ["b"], "la première page servie devient « mes communautés »")
    }

    func test_load_echec_gardeLaListeEtNeLeveRien() async {
        let service = MockCommunityService()
        service.listResult = .failure(MeeshyError.server(statusCode: 500, message: "boom"))
        let sut = CommunityListViewModel(service: service)

        await sut.refresh()

        XCTAssertTrue(sut.communities.isEmpty)
        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - community:updated (#18439)

    func test_communityUpdated_reecritLaLigneSansRelancerLeReseau() async {
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a"), CommunityStubs.community(id: "b", name: "Beta")]))
        let updates = PassthroughSubject<CommunityUpdatedEvent, Never>()
        let sut = CommunityListViewModel(service: service, communityUpdates: updates.eraseToAnyPublisher())
        await sut.refresh()

        sut.apply(CommunityStubs.communityUpdated(communityId: "a", name: "Alpha renommée", memberCount: 9))

        XCTAssertEqual(sut.communities.map(\.name), ["Alpha renommée", "Beta"])
        XCTAssertEqual(sut.communities.first?.memberCount, 9)
        XCTAssertEqual(sut.communities.first?.isPrivate, true)
        XCTAssertEqual(service.listCallCount, 1)
    }

    func test_communityUpdated_recuParLeFlux_atteintLaLigne() async {
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a")]))
        let updates = PassthroughSubject<CommunityUpdatedEvent, Never>()
        let sut = CommunityListViewModel(service: service, communityUpdates: updates.eraseToAnyPublisher())
        await sut.refresh()
        let renamed = expectation(description: "ligne renommée")
        let watch = sut.$communities.dropFirst().sink { if $0.first?.name == "Par le flux" { renamed.fulfill() } }

        updates.send(CommunityStubs.communityUpdated(communityId: "a", name: "Par le flux"))

        await fulfillment(of: [renamed], timeout: 2)
        watch.cancel()
    }

    func test_communityUpdated_communauteAbsente_neChangeRien() async {
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "a")]))
        let sut = CommunityListViewModel(service: service, communityUpdates: Empty().eraseToAnyPublisher())
        await sut.refresh()

        sut.apply(CommunityStubs.communityUpdated(communityId: "ghost", name: "Fantôme"))

        XCTAssertEqual(sut.communities.map(\.name), ["Alpha"])
    }
}

/// « Mes communautés » (#18935) — la source que la bande Communautés observe :
/// témoins sur le modèle, puisque le repeint d'un `@State` de vue ne se prouve
/// pas sans lui.
@MainActor
final class MyCommunitiesTests: XCTestCase {

    private func seed(_ ids: [String]) async throws -> GRDBCacheStore<String, APICommunity> {
        let store = await CacheCoordinator.shared.communities
        await store.invalidate(for: "list")
        try await store.save(ids.map { CommunityStubs.community(id: $0, name: "Club \($0)") }, for: "list")
        return store
    }

    func test_load_freshCache_publishesItWithoutTheNetwork() async throws {
        let store = try await seed(["c1", "c2"])
        let service = MockCommunityService()
        let sut = MyCommunities(service: service)

        await sut.load()
        await store.invalidate(for: "list")

        XCTAssertEqual(sut.communities.map(\.id), ["c1", "c2"])
        XCTAssertEqual(service.listCallCount, 0)
    }

    func test_remove_dropsItFromTheStripAndTheCache() async throws {
        let store = try await seed(["c1", "c2"])
        let sut = MyCommunities(service: MockCommunityService())
        await sut.load()
        var repainted: [[String]] = []
        let watch = sut.$communities.dropFirst().sink { repainted.append($0.map(\.id)) }

        await sut.remove(communityId: "c1")

        watch.cancel()
        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertEqual(repainted, [["c2"]], "la bande se repeint sans la communauté quittée")
        XCTAssertEqual(cached, ["c2"], "et la feuille de partage ne la propose plus")
    }

    func test_add_insertsItAtTheHeadOnce() async throws {
        let store = try await seed(["c2"])
        let sut = MyCommunities(service: MockCommunityService())
        await sut.load()

        await sut.add(CommunityStubs.community(id: "c1", name: "Club Lecture"))
        await sut.add(CommunityStubs.community(id: "c1", name: "Club Lecture"))

        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertEqual(sut.communities.map(\.id), ["c1", "c2"])
        XCTAssertEqual(cached, ["c1", "c2"])
    }

    func test_communityUpdated_repaintsTheStripRow() async throws {
        let store = try await seed(["c1"])
        let sut = MyCommunities(service: MockCommunityService(), communityUpdates: Empty().eraseToAnyPublisher())
        await sut.load()
        await store.invalidate(for: "list")

        sut.apply(CommunityStubs.communityUpdated(communityId: "c1", name: "Club renommé"))

        XCTAssertEqual(sut.communities.map(\.name), ["Club renommé"])
    }

    func test_refresh_freshCache_stillAsksTheNetwork() async throws {
        let store = try await seed(["c1"])
        let service = MockCommunityService()
        service.listResult = .success(CommunityStubs.page([CommunityStubs.community(id: "c3", name: "Club Neuf")]))
        let sut = MyCommunities(service: service)

        await sut.refresh()

        let cached = await store.load(for: "list").snapshot()?.map(\.id)
        await store.invalidate(for: "list")
        XCTAssertEqual(service.listCallCount, 1, "tirer pour rafraîchir ne s'arrête pas au cache frais")
        XCTAssertEqual(sut.communities.map(\.id), ["c3"])
        XCTAssertEqual(cached, ["c3"])
    }
}
