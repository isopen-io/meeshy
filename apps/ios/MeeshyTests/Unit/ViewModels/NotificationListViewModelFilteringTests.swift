import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class NotificationListViewModelFilteringTests: XCTestCase {

    func test_select_chargeLaPageServeurDeLaCategorie() async {
        let mock = MockNotificationListService()
        mock.pages = [NotificationStubs.page(["men"], type: "user_mentioned", hasMore: true, nextCursor: "ancre")]
        let vm = NotificationListViewModel(service: mock, feed: MockNotificationFeed())

        await vm.select(.mentions)

        XCTAssertEqual(mock.appels.last?.types, NotificationCategory.mentions.serverQuery.types)
        XCTAssertEqual(vm.filteredNotifications.map(\.id), ["men"])
        XCTAssertTrue(vm.hasMore)
    }

    func test_loadMore_sousUneCategorie_garderSesTypes_etSonAncre() async {
        let mock = MockNotificationListService()
        mock.pages = [
            NotificationStubs.page(["m1"], type: "new_message", hasMore: true, nextCursor: "ancre-m1"),
            NotificationStubs.page(["m2"], type: "new_message")
        ]
        let vm = NotificationListViewModel(service: mock, feed: MockNotificationFeed())

        await vm.select(.messages)
        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 2)
        XCTAssertEqual(mock.appels[1].types, NotificationCategory.messages.serverQuery.types)
        XCTAssertEqual(mock.appels[1].cursor, "ancre-m1")
        XCTAssertEqual(vm.filteredNotifications.map(\.id), ["m1", "m2"])
    }

    func test_select_laMemeCategorie_neRechargePas() async {
        let mock = MockNotificationListService()
        let vm = NotificationListViewModel(service: mock, feed: MockNotificationFeed())

        await vm.select(.all)

        XCTAssertTrue(mock.appels.isEmpty)
    }

    func test_evenementToutLu_marqueLesLignesLuesLocalement() async {
        let mock = MockNotificationListService()
        let feed = MockNotificationFeed()
        let vm = NotificationListViewModel(service: mock, feed: feed)
        vm.notifications = [NotificationStubs.notification("n1")]

        feed.allReadSubject.send()
        for _ in 0..<200 where !vm.notifications.allSatisfy(\.isRead) {
            try? await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertTrue(vm.notifications.allSatisfy(\.isRead))
    }

    func test_markAllRead_refusServeur_neMarquePasLesLignes() async {
        let feed = MockNotificationFeed()
        feed.markAllResult = false
        let vm = NotificationListViewModel(service: MockNotificationListService(), feed: feed)
        vm.notifications = [NotificationStubs.notification("n1")]

        await vm.markAllRead()

        XCTAssertFalse(vm.notifications[0].isRead)
    }

    func test_deleteNotification_refusServeur_remetLaLigneAsaPlace() async {
        let feed = MockNotificationFeed()
        feed.deleteResult = false
        let vm = NotificationListViewModel(service: MockNotificationListService(), feed: feed)
        let rows = [NotificationStubs.notification("n1"), NotificationStubs.notification("n2")]
        vm.notifications = rows

        await vm.deleteNotification(rows[0])

        XCTAssertEqual(vm.notifications.map(\.id), ["n1", "n2"])
    }
}
