import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class NotificationListViewModelPaginationTests: XCTestCase {

    private func makeSUT(_ service: MockNotificationListService, feed: MockNotificationFeed = MockNotificationFeed()) -> NotificationListViewModel {
        NotificationListViewModel(service: service, feed: feed)
    }

    func test_loadMore_empruntesLAncreServie_pageApresPage_etSarreteAuStop() async {
        let mock = MockNotificationListService()
        mock.pages = [
            NotificationStubs.page(["n1", "n2"], hasMore: true, nextCursor: "ancre-n2"),
            NotificationStubs.page(["n3"], hasMore: false, nextCursor: "ancre-n3")
        ]
        let vm = makeSUT(mock)
        vm.hasMore = true

        await vm.loadMore()
        await vm.loadMore()
        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 2)
        XCTAssertEqual(mock.appels[0].cursor, nil)
        XCTAssertEqual(mock.appels[1].cursor, "ancre-n2")
        XCTAssertEqual(mock.appels[1].offset, nil)
        XCTAssertEqual(vm.notifications.map(\.id), ["n1", "n2", "n3"])
        XCTAssertFalse(vm.hasMore)
    }

    func test_loadMore_sansAncreServie_resteAuRang_leRepliDuGatewayAnterieur() async {
        let mock = MockNotificationListService()
        mock.pages = [
            NotificationStubs.page(["n1", "n2"], hasMore: true, nextCursor: nil),
            NotificationStubs.page(["n3"], hasMore: false, nextCursor: nil)
        ]
        let vm = makeSUT(mock)
        vm.hasMore = true

        await vm.loadMore()
        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 2)
        XCTAssertEqual(mock.appels[1].cursor, nil)
        XCTAssertEqual(mock.appels[1].offset, 2)
    }

    func test_uneErreurRéseau_neCasseNiLaListe_niLaReprise() async {
        let mock = MockNotificationListService()
        let vm = makeSUT(mock)
        vm.hasMore = true

        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 1)
        XCTAssertEqual(vm.notifications, [])
        XCTAssertTrue(vm.hasMore)
    }

    func test_loadInitial_cacheFraisToutes_neTouchePasLeReseau() async {
        let mock = MockNotificationListService()
        let feed = MockNotificationFeed()
        feed.cached = .fresh([NotificationStubs.notification("c1")], age: 5)
        let vm = makeSUT(mock, feed: feed)

        await vm.loadInitial()

        XCTAssertEqual(vm.notifications.map(\.id), ["c1"])
        XCTAssertTrue(mock.appels.isEmpty)
    }

    func test_loadInitial_cacheVide_chargeLeReseau_etEcritLeCacheDeLaListeToutes() async {
        let mock = MockNotificationListService()
        mock.pages = [NotificationStubs.page(["n1"])]
        let feed = MockNotificationFeed()
        let vm = makeSUT(mock, feed: feed)

        await vm.loadInitial()

        XCTAssertEqual(vm.notifications.map(\.id), ["n1"])
        XCTAssertEqual(feed.storedFeeds.map { $0.map(\.id) }, [["n1"]])
        XCTAssertEqual(feed.refreshUnreadCountCallCount, 1)
        XCTAssertFalse(vm.loadDidFail)
    }

    func test_loadInitial_echecReseauSansCache_poseLEtatDErreur() async {
        let vm = makeSUT(MockNotificationListService())

        await vm.loadInitial()

        XCTAssertTrue(vm.loadDidFail)
        XCTAssertFalse(vm.isLoading)
    }
}
