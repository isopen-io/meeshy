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
        let service = MockCommunityService()
        let sut = CommunityListViewModel(service: service)

        await sut.loadIfNeeded()
        await sut.loadIfNeeded()

        XCTAssertEqual(service.listCallCount, 1)
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
