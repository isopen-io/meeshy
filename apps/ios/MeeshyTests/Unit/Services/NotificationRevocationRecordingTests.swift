import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// ios-systeme-7 (#19104) — **la révocation s'inscrit AVANT le retrait.**
///
/// Le push silencieux `notification_revoked` et le socket `notification:deleted` convergent
/// tous deux sur `revokeDeliveredBanners` — le site unique. Il ne retirait que les bannières
/// DÉJÀ livrées : une bannière que l'extension préparait encore (téléchargement de la pièce
/// jointe) n'existait pas, et sa livraison suivante survivait au message supprimé. Il inscrit
/// désormais les ids dans le fichier du groupe d'apps que l'extension relit avant de livrer
/// (témoins de l'atome : `PendingBannerRevocationsTests`, côté SDK).
@MainActor
final class NotificationRevocationRecordingTests: XCTestCase {

    private final class NoopBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }
        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private final class Ledger {
        var events: [String] = []
        var recorded: [[String]] = []
        var removed: [[String]] = []
    }

    private func makeSUT(ledger: Ledger) -> NotificationActionHandler {
        NotificationActionHandler(
            backgroundTasks: NoopBackgroundTasks(),
            authTokenProvider: { "jwt-token" },
            applyAuthToken: { _ in },
            currentUserId: { "user1" },
            preferredLanguage: { "fr" },
            isRegisteredUser: { true },
            openNotification: { _ in },
            localMarkRead: { _ in },
            consume: { _ in },
            removeDeliveredForConversation: { _ in },
            removeDeliveredForPost: { _ in },
            removeDeliveredForNotificationIds: { ids in
                ledger.events.append("remove")
                ledger.removed.append(ids)
            },
            recordPendingRevocations: { ids in
                ledger.events.append("record")
                ledger.recorded.append(ids)
            }
        )
    }

    func test_revokeDeliveredBanners_recordsTheIdsBeforeRemovingTheDeliveredOnes() async {
        let ledger = Ledger()
        let sut = makeSUT(ledger: ledger)

        await sut.revokeDeliveredBanners(notificationIds: ["n1", "n2"])

        XCTAssertEqual(ledger.recorded, [["n1", "n2"]])
        XCTAssertEqual(ledger.removed, [["n1", "n2"]])
        XCTAssertEqual(ledger.events, ["record", "remove"],
                       "inscrire d'abord : l'extension qui relit entre les deux doit déjà voir la révocation")
    }

    func test_revokeDeliveredBanners_withoutIds_recordsNothing() async {
        let ledger = Ledger()
        let sut = makeSUT(ledger: ledger)

        await sut.revokeDeliveredBanners(notificationIds: [])

        XCTAssertTrue(ledger.events.isEmpty)
    }

    /// Les deux entrées convergent sur le site unique : ni l'AppDelegate (push silencieux) ni le
    /// flux du socket n'inscrivent à part — une seconde source ferait deux comportements.
    func test_bothEntryPoints_reachTheSingleRecordingSite() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let appDelegate = try String(contentsOf: appRoot.appendingPathComponent("Meeshy/AppDelegate.swift"), encoding: .utf8)
        let revocation = try String(
            contentsOf: appRoot.appendingPathComponent("Meeshy/Features/Main/Services/NotificationActionHandler+BannerRevocation.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(appDelegate.contains("NotificationActionHandler.shared.revokeDeliveredBanners(notificationIds:"))
        XCTAssertFalse(appDelegate.contains("PendingBannerRevocations"))
        XCTAssertTrue(revocation.contains("await self?.revokeDeliveredBanners(notificationIds: notificationIds)"))
        XCTAssertTrue(revocation.contains("revokedIdentifiers") || revocation.contains("isRevoked("),
                      "le balayage de retour au premier plan retire aussi les bannières révoquées")
    }
}
