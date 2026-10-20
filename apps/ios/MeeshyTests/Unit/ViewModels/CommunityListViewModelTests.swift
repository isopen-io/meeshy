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
}
