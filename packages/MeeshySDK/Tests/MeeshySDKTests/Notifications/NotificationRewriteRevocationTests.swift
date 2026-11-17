import XCTest
import Combine
@testable import MeeshySDK

/// Revue des notifications (#19104) — ce que la cloche iOS fait d'une
/// notification RÉÉCRITE (édition : `notification:deleted` puis
/// `notification:new`, même id), d'une notification RÉVOQUÉE et d'une PURGE
/// des lues venue d'un autre appareil. Comportement réel du singleton, sans
/// mock, comme `NotificationServerRevocationTests`.
@MainActor
final class NotificationRewriteRevocationTests: XCTestCase {

    private func socialEvent(id: String, isRead: Bool? = nil, conversationId: String? = nil) throws -> SocketNotificationEvent {
        let state = isRead.map { ", \"state\": { \"isRead\": \($0), \"createdAt\": \"2026-11-01T10:00:00.000Z\" }" } ?? ""
        let context = conversationId.map { ", \"context\": { \"conversationId\": \"\($0)\" }" } ?? ""
        let json = "{ \"id\": \"\(id)\", \"userId\": \"u1\", \"type\": \"post_comment\", \"content\": \"Superbe\"\(state)\(context) }"
        return try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    // MARK: - La bannière d'une notification révoquée se retire

    func test_applyRevocationLocally_dismissesTheBannerOfTheRevokedNotification() throws {
        let manager = NotificationToastManager.shared
        defer { manager.dismissToast() }
        manager.currentToast = try socialEvent(id: "rw-toast-1")

        manager.applyRevocationLocally("rw-toast-1")

        XCTAssertNil(manager.currentToast)
        XCTAssertNil(manager.currentToastPresentation)
    }

    func test_applyRevocationLocally_keepsTheBannerOfAnotherNotification() throws {
        let manager = NotificationToastManager.shared
        defer { manager.dismissToast() }
        manager.currentToast = try socialEvent(id: "rw-toast-2")

        manager.applyRevocationLocally("rw-toast-3")

        XCTAssertEqual(manager.currentToast?.id, "rw-toast-2")
    }

    func test_applyRevocationDurably_dismissesTheBannerOfTheRevokedNotification() async throws {
        let manager = NotificationToastManager.shared
        defer { manager.dismissToast() }
        manager.currentToast = try socialEvent(id: "rw-toast-4")

        await manager.applyRevocationDurably("rw-toast-4")

        XCTAssertNil(manager.currentToast)
    }

    // MARK: - Une notification arrivée lue ne rejoue rien

    func test_handleNewNotification_aNotificationArrivingRead_neitherShowsNorCountsNorAnnouncesAnArrival() throws {
        let manager = NotificationToastManager.shared
        defer { manager.dismissToast() }
        manager.dismissToast()
        let unreadBefore = NotificationCoordinator.shared.inAppNotificationUnread
        var arrivals: [String] = []
        var quiet: [APINotification] = []
        var bag = Set<AnyCancellable>()
        manager.newNotificationReceived.sink { arrivals.append($0.id) }.store(in: &bag)
        manager.notificationArrivedQuietly.sink { quiet.append($0) }.store(in: &bag)

        manager.handleNewNotification(try socialEvent(id: "rw-read-1", isRead: true))

        XCTAssertNil(manager.currentToast)
        XCTAssertEqual(NotificationCoordinator.shared.inAppNotificationUnread, unreadBefore)
        XCTAssertEqual(arrivals, [])
        XCTAssertEqual(quiet.map(\.id), ["rw-read-1"])
        XCTAssertEqual(quiet.first?.isRead, true)
    }

    /// Une notification déjà lue arrivée sur la conversation OUVERTE n'est pas relue : la lecture à l'arrivée
    /// (`notificationMarkedRead`, `POST /read`) ne concerne que ce qui attend encore (#19104, revue N7).
    func test_handleNewNotification_aNotificationArrivingRead_onTheOpenConversation_isNotReadAgain() throws {
        let manager = NotificationToastManager.shared
        manager.onConversationOpened("rw-open-conv")
        defer { manager.onConversationClosed("rw-open-conv") }
        var markedRead: [String] = []
        var quiet: [String] = []
        var bag = Set<AnyCancellable>()
        manager.notificationMarkedRead.sink { markedRead.append($0) }.store(in: &bag)
        manager.notificationArrivedQuietly.sink { quiet.append($0.id) }.store(in: &bag)

        manager.handleNewNotification(try socialEvent(id: "rw-read-open", isRead: true, conversationId: "rw-open-conv"))

        XCTAssertEqual(markedRead, [])
        XCTAssertEqual(quiet, ["rw-read-open"])
    }

    /// Revue N1 — l'édition d'une notification NON LUE (`deleted` puis `new`, même id) reprend son rang sans
    /// rien rejouer : ni compte (la suppression ne l'a pas décomptée), ni bannière, ni haptique, ni annonce
    /// d'arrivée — et la cloche montée reçoit la ligne pour la ranger.
    func test_handleNewNotification_anUnreadRewrite_neitherCountsNorShowsNorAnnouncesAnArrival() throws {
        let manager = NotificationToastManager.shared
        defer { manager.dismissToast() }
        manager.dismissToast()
        var arrivals: [String] = []
        var quiet: [APINotification] = []
        var bag = Set<AnyCancellable>()
        manager.newNotificationReceived.sink { arrivals.append($0.id) }.store(in: &bag)
        manager.notificationArrivedQuietly.sink { quiet.append($0) }.store(in: &bag)

        manager.handleNotificationDeleted(NotificationDeletedEvent(notificationId: "rw-unread-1"))
        let unreadBefore = NotificationCoordinator.shared.inAppNotificationUnread
        manager.handleNewNotification(try socialEvent(id: "rw-unread-1", isRead: false))

        XCTAssertNil(manager.currentToast, "une édition ne fait pas redescendre la bannière")
        XCTAssertEqual(NotificationCoordinator.shared.inAppNotificationUnread, unreadBefore, "ni ne compte une seconde fois")
        XCTAssertEqual(arrivals, [])
        XCTAssertEqual(quiet.map(\.id), ["rw-unread-1"])
        XCTAssertEqual(quiet.first?.isRead, false)
    }

    func test_takeRecentRevocation_isARewriteOnlyWithinTheWindow_andOnlyOnce() {
        let manager = NotificationToastManager.shared
        let now = Date()
        manager.recentRevocations["rw-window-fresh"] = now.addingTimeInterval(-1)
        manager.recentRevocations["rw-window-stale"] = now.addingTimeInterval(-(NotificationToastManager.rewriteWindow + 1))

        XCTAssertTrue(manager.takeRecentRevocation("rw-window-fresh", now: now))
        XCTAssertFalse(manager.takeRecentRevocation("rw-window-fresh", now: now), "une réécriture ne se consomme qu'une fois")
        XCTAssertFalse(manager.takeRecentRevocation("rw-window-stale", now: now))
        XCTAssertFalse(manager.takeRecentRevocation("rw-window-never", now: now))
    }

    /// Corrigée dans les 2 s de son envoi, une notification était prise pour un
    /// doublon par la mémoire anti-doublon : la suppression l'avait retirée de
    /// la cloche, la réécriture était jetée, la ligne disparaissait.
    func test_handleNotificationDeleted_freesTheIdForTheRewriteThatFollows() {
        let manager = NotificationToastManager.shared
        manager.recentNotificationIds.insert("rw-del-1")

        manager.handleNotificationDeleted(NotificationDeletedEvent(notificationId: "rw-del-1"))

        XCTAssertFalse(manager.recentNotificationIds.contains("rw-del-1"))
    }

    // MARK: - Une purge des lues faite ailleurs est annoncée à la cloche montée

    func test_handleNotificationDeletedBulk_announcesThePurge_evenWithNothingCached() throws {
        let manager = NotificationToastManager.shared
        var purges = 0
        var bag = Set<AnyCancellable>()
        manager.readNotificationsPurged.sink { purges += 1 }.store(in: &bag)
        let event = try JSONDecoder().decode(NotificationDeletedBulkEvent.self, from: Data(#"{"scope":{"kind":"read"}}"#.utf8))

        manager.handleNotificationDeletedBulk(event)

        XCTAssertEqual(purges, 1)
    }
}
