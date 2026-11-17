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

    // MARK: - #18916 — la cloche ouverte se relit et se peint depuis le disque

    /// Écran Notifications ouvert, app en arrière-plan une heure : au retour, la
    /// resync remplace le cache et le compteur, mais `notification:new` n'est
    /// pas rejoué. Sans relecture sur ce signal, les lignes restaient celles
    /// d'il y a une heure sous un compteur à jour.
    func test_feedResynced_whileListIsShown_refetchesServedRows() async {
        let mock = MockNotificationListService()
        mock.pages = [NotificationStubs.page(["A"]), NotificationStubs.page(["B", "A"])]
        let feed = MockNotificationFeed()
        let vm = makeSUT(mock, feed: feed)
        await vm.loadInitial()

        feed.resyncedSubject.send(())
        for _ in 0..<300 where vm.notifications.map(\.id) != ["B", "A"] {
            try? await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(vm.notifications.map(\.id), ["B", "A"], "la resync relit la page servie de la cloche ouverte")
    }

    /// Cloche rouverte plus de 24 h après son dernier usage, hors ligne : `.expired`
    /// dit « revalide », jamais « il n'y a rien ». Les lignes du disque se
    /// peignent tout de suite, sans squelette, et restent là si le réseau échoue.
    func test_loadInitial_whenCacheExpired_paintsDiskRowsWithoutSkeleton() async {
        let feed = MockNotificationFeed()
        feed.cached = .expired
        feed.diskFeed = [NotificationStubs.notification("A"), NotificationStubs.notification("B")]
        let vm = makeSUT(MockNotificationListService(), feed: feed)
        var loadingStates: [Bool] = []
        let watch = vm.$isLoading.sink { loadingStates.append($0) }

        await vm.loadInitial()
        watch.cancel()

        XCTAssertEqual(vm.notifications.map(\.id), ["A", "B"], "les lignes du disque restent peintes malgré l'échec réseau")
        XCTAssertFalse(loadingStates.contains(true), "aucun squelette sur un disque qui tient des lignes")
    }
}
