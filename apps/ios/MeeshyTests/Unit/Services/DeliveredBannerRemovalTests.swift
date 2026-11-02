import XCTest
import UserNotifications
@testable import Meeshy

/// **Le retrait d'une bannière livrée se confirme par RELECTURE du centre
/// système, jamais par la seule émission** — et la fermeture PAR DÉFAUT
/// (`DeliveredBannerCenter.system()`) lie bien le prédicat au centre réel
/// (#3896). Sorti de `NotificationActionHandlerTests` : ces témoins éprouvent
/// la couture statique de retrait, pas le gestionnaire d'actions.
@MainActor
final class DeliveredBannerRemovalTests: XCTestCase {

    // MARK: - Retrait de bannières : confirmé par RELECTURE, jamais par l'émission

    /// Double du centre système. Compte les LECTURES — c'est elles que le
    /// contrat porte : `removeDeliveredNotifications(withIdentifiers:)` n'a
    /// aucun completion handler, donc seule une seconde lecture prouve que le
    /// retrait a été TRAITÉ. `appliesRemoval: false` rejoue un système qui ne
    /// confirme jamais.
    private nonisolated final class SpyBannerCenter: @unchecked Sendable {
        private let lock = NSLock()
        private var storedReads = 0
        private var storedRemoved: [[String]] = []
        private var storedDelivered: [DeliveredBanner]
        private let appliesRemoval: Bool

        init(delivered: [DeliveredBanner], appliesRemoval: Bool = true) {
            self.storedDelivered = delivered
            self.appliesRemoval = appliesRemoval
        }

        var reads: Int { lock.withLock { storedReads } }
        var removed: [[String]] { lock.withLock { storedRemoved } }

        func center() -> DeliveredBannerCenter {
            DeliveredBannerCenter(
                delivered: { [self] completion in
                    let snapshot = lock.withLock { () -> [DeliveredBanner] in
                        storedReads += 1
                        return storedDelivered
                    }
                    completion(snapshot)
                },
                remove: { [self] identifiers in
                    lock.withLock {
                        storedRemoved.append(identifiers)
                        guard appliesRemoval else { return }
                        storedDelivered.removeAll { identifiers.contains($0.identifier) }
                    }
                }
            )
        }
    }

    private func banner(_ identifier: String, notificationId: String) -> DeliveredBanner {
        DeliveredBanner(identifier: identifier, userInfo: ["notificationId": notificationId])
    }

    /// `removeDeliveredNotifications(withIdentifiers:)` n'est qu'une ÉMISSION.
    /// Rendre la main à iOS derrière elle (`completionHandler(.noData)`) laisse
    /// le système libre de suspendre le processus AVANT le retrait — la
    /// bannière reste affichée, ce que la révocation prétend justement
    /// empêcher. Le contrat : on attend la RELECTURE.
    func test_removeDeliveredAwaiting_returnsOnlyOnceTheRemovalIsConfirmedByARereading() async {
        let spy = SpyBannerCenter(delivered: [
            banner("d1", notificationId: "n1"),
            banner("d2", notificationId: "other")
        ])

        await NotificationActionHandler.removeDeliveredNotificationsAwaiting(
            matching: { ($0["notificationId"] as? String) == "n1" },
            center: spy.center()
        )

        XCTAssertEqual(spy.removed, [["d1"]])
        XCTAssertEqual(spy.reads, 2,
                       "une seule lecture = on a rendu la main sur l'ÉMISSION ; la seconde est la preuve d'effet")
    }

    /// Le budget d'un push silencieux n'est pas extensible : un système qui ne
    /// confirme jamais ne doit pas le consommer entier.
    func test_removeDeliveredAwaiting_returnsAnyway_whenTheSystemNeverConfirms() async {
        let spy = SpyBannerCenter(delivered: [banner("d1", notificationId: "n1")], appliesRemoval: false)
        let start = ContinuousClock.now

        await NotificationActionHandler.removeDeliveredNotificationsAwaiting(
            matching: { _ in true },
            center: spy.center(),
            confirmationTimeout: .milliseconds(200)
        )

        XCTAssertLessThan(start.duration(to: .now), .seconds(3))
        XCTAssertGreaterThan(spy.reads, 1, "la confirmation a bien été TENTÉE avant d'abandonner")
        XCTAssertEqual(spy.removed, [["d1"]])
    }

    /// Fire-and-forget (nettoyage de bannières après une action) : personne
    /// n'attend, donc aucune boucle de confirmation — sinon chaque action
    /// brûlerait jusqu'à trois secondes d'allers-retours système pour rien.
    func test_removeDelivered_withoutACompletion_doesNotPollForConfirmation() async {
        let spy = SpyBannerCenter(delivered: [banner("d1", notificationId: "n1")], appliesRemoval: false)

        NotificationActionHandler.removeDeliveredNotifications(
            matching: { _ in true },
            center: spy.center()
        )
        try? await Task.sleep(for: .milliseconds(300))

        XCTAssertEqual(spy.removed, [["d1"]])
        XCTAssertEqual(spy.reads, 1)
    }

    /// Aucune bannière ne correspond : rien à confirmer, rien à relire.
    func test_removeDeliveredAwaiting_withoutAMatch_touchesTheSystemOnce() async {
        let spy = SpyBannerCenter(delivered: [banner("d1", notificationId: "n1")])

        await NotificationActionHandler.removeDeliveredNotificationsAwaiting(
            matching: { _ in false },
            center: spy.center()
        )

        XCTAssertEqual(spy.removed, [])
        XCTAssertEqual(spy.reads, 1)
    }

    // MARK: - #3896 : la fermeture PAR DÉFAUT (`.system()`), pas seulement la couture injectée

    /// `SpyBannerCenter` ci-dessus double `DeliveredBannerCenter` ENTIER — les
    /// tests au-dessus n'ont donc jamais exercé `DeliveredBannerCenter.system()`,
    /// les closures RÉELLEMENT utilisées en production. `MockUNUserNotificationCenter`
    /// double le cran plus bas, `UNUserNotificationCenterProviding` — le
    /// protocole que `.system()` appelle — pour que ces tests observent le
    /// câblage par défaut. `UNNotification` n'a aucun initialiseur public : le
    /// protocole s'arrête donc à `DeliveredBanner` (un type à nous, librement
    /// constructible), jamais à `UNNotification` lui-même.
    /// `@unchecked Sendable` : même patron que `SpyBannerCenter`, la synchronisation
    /// est portée par le lock, pas par le compilateur.
    nonisolated private final class MockUNUserNotificationCenter: UNUserNotificationCenterProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var storedDelivered: [DeliveredBanner]
        private var storedReads = 0
        private var storedRemoved: [[String]] = []

        init(delivered: [DeliveredBanner]) {
            self.storedDelivered = delivered
        }

        var reads: Int { lock.withLock { storedReads } }
        var removed: [[String]] { lock.withLock { storedRemoved } }

        func getDeliveredBanners(completionHandler: @escaping @Sendable ([DeliveredBanner]) -> Void) {
            let snapshot = lock.withLock { () -> [DeliveredBanner] in
                storedReads += 1
                return storedDelivered
            }
            completionHandler(snapshot)
        }

        func removeDeliveredNotifications(withIdentifiers identifiers: [String]) {
            lock.withLock {
                storedRemoved.append(identifiers)
                storedDelivered.removeAll { identifiers.contains($0.identifier) }
            }
        }
    }

    /// La fermeture par défaut doit réellement LIER la charge reçue du centre
    /// au prédicat de révocation, et appeler `removeDeliveredNotifications`
    /// avec les SEULS identifiants qui matchent — jamais tout retirer, jamais
    /// rien retirer. Un revert de `UNUserNotificationCenter.getDeliveredBanners`
    /// (ex. mapping `identifier`/`userInfo` cassé) ou de `.system()`
    /// (ex. appel à `notificationCenter().removeDeliveredNotifications`
    /// oublié) fait rougir ce test — aucun des tests `SpyBannerCenter`
    /// au-dessus n'aurait bougé, puisqu'ils remplacent `DeliveredBannerCenter`
    /// dans son ENTIER.
    func test_deliveredBannerCenter_system_wiresThePredicateToTheDefaultNotificationCenterSeam() async {
        let mock = MockUNUserNotificationCenter(delivered: [
            DeliveredBanner(identifier: "d1", userInfo: ["notificationId": "n1"]),
            DeliveredBanner(identifier: "d2", userInfo: ["notificationId": "other"])
        ])

        await NotificationActionHandler.removeDeliveredNotificationsAwaiting(
            matching: { ($0["notificationId"] as? String) == "n1" },
            center: .system(notificationCenter: { mock })
        )

        XCTAssertEqual(mock.removed, [["d1"]],
                       "seul l'identifiant dont le userInfo matche le prédicat doit être retiré")
        XCTAssertEqual(mock.reads, 2,
                       "lecture initiale + relecture de confirmation, comme pour le centre système réel")
    }

    /// Aucun identifiant ne matche : rien ne doit être retiré, le mapping
    /// identifier/userInfo doit tout de même avoir été lu une fois.
    func test_deliveredBannerCenter_system_withNoMatch_removesNothing() async {
        let mock = MockUNUserNotificationCenter(delivered: [
            DeliveredBanner(identifier: "d1", userInfo: ["notificationId": "n1"])
        ])

        await NotificationActionHandler.removeDeliveredNotificationsAwaiting(
            matching: { _ in false },
            center: .system(notificationCenter: { mock })
        )

        XCTAssertEqual(mock.removed, [])
        XCTAssertEqual(mock.reads, 1)
    }
}
