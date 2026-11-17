import XCTest
@testable import MeeshySDK

/// ios-systeme-2 (revue des notifications du 2026-11-17, #18911) — quitter une
/// session vide le Centre de notifications.
///
/// Avant ce lot, la déconnexion remettait le badge à 0 (ce qui laissait croire que
/// tout était purgé) mais laissait sur l'écran verrouillé et dans le Centre les
/// aperçus en clair, les vignettes et les vocaux joints du compte quitté. Toucher
/// l'une d'elles sous le compte suivant ouvrait une conversation du premier.
///
/// La sortie qui purge est celle qui TERMINE la session (déconnexion, suspension
/// sans garde) ou retire le compte actif (supprimé côté serveur). Le simple
/// changement de compte garde la session de A : ses pushes restent prévus.
@MainActor
final class SessionExitNotificationPurgeTests: XCTestCase {

    private var createdSuiteNames: [String] = []

    override func tearDown() {
        createdSuiteNames.forEach { UserDefaults(suiteName: $0)?.removePersistentDomain(forName: $0) }
        createdSuiteNames.removeAll()
        super.tearDown()
    }

    private func makeSUT(purger: CountingDeliveredPurger) -> NotificationCoordinator {
        let suite = "group.test.meeshy.exit.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        return NotificationCoordinator(
            badgeWriter: SilentBadgeWriter(),
            appGroupSuiteName: suite,
            openConversationIdsProvider: { [] },
            ledger: ConversationReadLedger(),
            deliveredNotificationsPurger: purger
        )
    }

    // MARK: - Le coordinateur

    func test_reset_purgingDelivered_removesEveryDeliveredAndPendingNotification() {
        let purger = CountingDeliveredPurger()
        let sut = makeSUT(purger: purger)

        sut.reset(purgingDeliveredNotifications: true)

        XCTAssertEqual(purger.deliveredRemovals, 1, "les bannières déjà posées partent")
        XCTAssertEqual(purger.pendingRemovals, 1, "et celles qui étaient encore planifiées")
    }

    func test_reset_withoutPurging_leavesTheNotificationCenterAlone() {
        let purger = CountingDeliveredPurger()
        let sut = makeSUT(purger: purger)

        sut.reset()

        XCTAssertEqual(purger.deliveredRemovals, 0, "un changement de compte garde les pushes de A prévus")
        XCTAssertEqual(purger.pendingRemovals, 0)
    }

    // MARK: - La loi : quelle sortie purge

    func test_purgesDelivered_whenTheSessionEnds_orTheActiveAccountIsRetired_butNotOnASwitch() {
        XCTAssertTrue(SessionExitNotificationPolicy.purgesDelivered(endingIt: true, retiringActiveAccount: false),
                      "Déconnexion, suspension sans garde")
        XCTAssertTrue(SessionExitNotificationPolicy.purgesDelivered(endingIt: false, retiringActiveAccount: true),
                      "compte actif supprimé côté serveur")
        XCTAssertFalse(SessionExitNotificationPolicy.purgesDelivered(endingIt: false, retiringActiveAccount: false),
                       "changement de compte avec session gardée")
    }
}

// MARK: - Doubles

final class CountingDeliveredPurger: DeliveredNotificationsPurging, @unchecked Sendable {
    private let lock = NSLock()
    private var _delivered = 0
    private var _pending = 0

    var deliveredRemovals: Int { lock.withLock { _delivered } }
    var pendingRemovals: Int { lock.withLock { _pending } }

    func removeAllDeliveredNotifications() { lock.withLock { _delivered += 1 } }
    func removeAllPendingNotificationRequests() { lock.withLock { _pending += 1 } }
}

private struct SilentBadgeWriter: NotificationBadgeWriting {
    func setBadgeCount(_ count: Int) async {}
}
