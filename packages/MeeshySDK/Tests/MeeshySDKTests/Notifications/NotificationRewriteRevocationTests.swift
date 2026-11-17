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

    private var cancellables: Set<AnyCancellable> = []

    private func socialEvent(id: String, isRead: Bool? = nil) throws -> SocketNotificationEvent {
        let state = isRead.map { ", \"state\": { \"isRead\": \($0), \"createdAt\": \"2026-11-01T10:00:00.000Z\" }" } ?? ""
        let json = "{ \"id\": \"\(id)\", \"userId\": \"u1\", \"type\": \"post_comment\", \"content\": \"Superbe\"\(state) }"
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
        var arrivedRead: [String] = []
        manager.newNotificationReceived.sink { arrivals.append($0.id) }.store(in: &cancellables)
        manager.notificationArrivedRead.sink { arrivedRead.append($0) }.store(in: &cancellables)

        manager.handleNewNotification(try socialEvent(id: "rw-read-1", isRead: true))

        XCTAssertNil(manager.currentToast)
        XCTAssertEqual(NotificationCoordinator.shared.inAppNotificationUnread, unreadBefore)
        XCTAssertEqual(arrivals, [])
        XCTAssertEqual(arrivedRead, ["rw-read-1"])
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
        manager.readNotificationsPurged.sink { purges += 1 }.store(in: &cancellables)
        let event = try JSONDecoder().decode(NotificationDeletedBulkEvent.self, from: Data(#"{"scope":{"kind":"read"}}"#.utf8))

        manager.handleNotificationDeletedBulk(event)

        XCTAssertEqual(purges, 1)
    }
}
