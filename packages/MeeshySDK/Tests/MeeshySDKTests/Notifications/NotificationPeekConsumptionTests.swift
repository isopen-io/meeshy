import XCTest
import Combine
@testable import MeeshySDK

/// #18721 — une conversation ouverte EN REGARD (bannière tirée) reste à
/// l'écran sans consommer ses notifications : ni cloche marquée lue, ni
/// bannières système retirées, et ce qui arrive pendant le regard naît NON
/// lu. Le premier acte qui compte (`onConversationReadingStarted`) consomme.
@MainActor
final class NotificationPeekConsumptionTests: XCTestCase {

    private func neuf() -> NotificationToastManager {
        let manager = NotificationToastManager.shared
        manager.forgetOpenConversations()
        manager.dismissToast()
        return manager
    }

    override func tearDown() {
        NotificationToastManager.shared.deliveredBannerPurger = nil
        NotificationToastManager.shared.forgetOpenConversations()
        NotificationToastManager.shared.dismissToast()
        super.tearDown()
    }

    private func messageEvent(id: String, conversationId: String) throws -> SocketNotificationEvent {
        let json = "{ \"id\": \"\(id)\", \"userId\": \"u1\", \"type\": \"new_message\", \"content\": \"Salut\", \"context\": { \"conversationId\": \"\(conversationId)\" } }"
        return try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    private func reads(_ manager: NotificationToastManager, into bag: inout Set<AnyCancellable>) -> () -> [String] {
        var emitted: [String] = []
        manager.conversationNotificationsRead.sink { emitted.append($0) }.store(in: &bag)
        return { emitted }
    }

    // MARK: - Regarder ne consomme rien

    func test_onConversationOpened_inPeek_consumesNothing() {
        let manager = neuf()
        var bag = Set<AnyCancellable>()
        let emitted = reads(manager, into: &bag)
        var purged: [NotificationRef] = []
        manager.deliveredBannerPurger = { purged.append($0) }

        manager.onConversationOpened("peek-1", consumes: false)

        XCTAssertEqual(emitted(), [])
        XCTAssertEqual(purged, [])
        XCTAssertEqual(manager.activeConversationId, "peek-1", "la conversation reste l'écran actif : ses toasts se taisent")
    }

    func test_onConversationOpened_byDefault_stillConsumes() {
        let manager = neuf()
        var bag = Set<AnyCancellable>()
        let emitted = reads(manager, into: &bag)

        manager.onConversationOpened("peek-2")

        XCTAssertEqual(emitted(), ["peek-2"], "un ancien appelant garde la lecture à l'ouverture")
    }

    // MARK: - Le premier acte consomme

    func test_onConversationReadingStarted_afterAPeek_consumesOnce() {
        let manager = neuf()
        var bag = Set<AnyCancellable>()
        let emitted = reads(manager, into: &bag)
        var purged: [NotificationRef] = []
        manager.deliveredBannerPurger = { purged.append($0) }
        manager.onConversationOpened("peek-3", consumes: false)

        manager.onConversationReadingStarted("peek-3")
        manager.onConversationReadingStarted("peek-3")

        XCTAssertEqual(emitted(), ["peek-3"])
        XCTAssertEqual(purged, [.conversation(id: "peek-3")])
    }

    func test_onConversationReadingStarted_withoutAPeek_doesNothing() {
        let manager = neuf()
        manager.onConversationOpened("peek-4")
        var bag = Set<AnyCancellable>()
        let emitted = reads(manager, into: &bag)

        manager.onConversationReadingStarted("peek-4")

        XCTAssertEqual(emitted(), [], "une lecture ordinaire a déjà consommé à l'ouverture")
    }

    func test_closingAPeek_forgetsIt_soTheNextOpeningConsumes() {
        let manager = neuf()
        manager.onConversationOpened("peek-5", consumes: false)
        manager.onConversationClosed("peek-5")
        var bag = Set<AnyCancellable>()
        let emitted = reads(manager, into: &bag)

        manager.onConversationReadingStarted("peek-5")
        manager.onConversationOpened("peek-5")

        XCTAssertEqual(emitted(), ["peek-5"])
    }

    // MARK: - Ce qui arrive pendant le regard attend

    func test_handleNewNotification_duringAPeek_staysUnreadAndCounts_withoutBanner() throws {
        let manager = neuf()
        manager.onConversationOpened("peek-6", consumes: false)
        let unreadBefore = NotificationCoordinator.shared.inAppNotificationUnread
        var markedRead: [String] = []
        var bag = Set<AnyCancellable>()
        manager.notificationMarkedRead.sink { markedRead.append($0) }.store(in: &bag)
        defer { NotificationCoordinator.shared.setInAppNotificationUnread(unreadBefore) }

        manager.handleNewNotification(try messageEvent(id: "peek-n-6", conversationId: "peek-6"))

        XCTAssertEqual(markedRead, [], "le regard ne lit pas ce qui arrive")
        XCTAssertEqual(NotificationCoordinator.shared.inAppNotificationUnread, unreadBefore + 1)
        XCTAssertNil(manager.currentToast, "la conversation est à l'écran : aucune bannière par-dessus")
    }

    func test_handleNewNotification_onAReadConversation_isStillConsumedOnArrival() throws {
        let manager = neuf()
        manager.onConversationOpened("peek-7")
        var markedRead: [String] = []
        var bag = Set<AnyCancellable>()
        manager.notificationMarkedRead.sink { markedRead.append($0) }.store(in: &bag)

        manager.handleNewNotification(try messageEvent(id: "peek-n-7", conversationId: "peek-7"))

        XCTAssertEqual(markedRead, ["peek-n-7"])
    }
}
