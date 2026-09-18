import XCTest
import Combine
@testable import MeeshySDK

/// #7000 — le compteur de la cloche, mesuré sur les quatre chemins qui le
/// faisaient mentir : l'écho de notre propre marquage, le double marquage d'une
/// même ligne, le rollback d'un refus serveur, et la republication de « tout
/// lire » vers une cloche déjà montée.
///
/// Les témoins entrent par `applyReadOptimistically` / `rollbackRead` /
/// `handleNotificationRead` plutôt que par `markRead(notificationId:)` :
/// `NotificationToastManager` est un singleton sans couture de service, et ce
/// qu'on mesure ici est l'ARITHMÉTIQUE locale, pas l'aller-retour REST.
@MainActor
final class NotificationReadConsumptionTests: XCTestCase {

    private func seedUnread(_ count: Int) {
        NotificationCoordinator.shared.setInAppNotificationUnread(count)
    }

    private var unread: Int {
        NotificationCoordinator.shared.inAppNotificationUnread
    }

    override func tearDown() {
        NotificationToastManager.shared.selfReadLedger.removeAll()
        NotificationCoordinator.shared.setInAppNotificationUnread(0)
        super.tearDown()
    }

    // MARK: - L'écho de notre propre marquage

    func test_ownReadEcho_doesNotDecrementASecondTime() {
        seedUnread(5)
        let manager = NotificationToastManager.shared

        XCTAssertTrue(manager.applyReadOptimistically("n-echo"))
        XCTAssertEqual(unread, 4, "le marquage local décrémente immédiatement")

        manager.handleNotificationRead(NotificationReadEvent(notificationId: "n-echo"))

        XCTAssertEqual(
            unread, 4,
            "le gateway renvoie `notification:read` à la room `user:<id>`, donc aussi à l'acteur : " +
            "sans le registre, un seul tap faisait −2"
        )
    }

    func test_readEchoFromAnotherDevice_stillDecrements() {
        seedUnread(5)
        let manager = NotificationToastManager.shared
        _ = manager.applyReadOptimistically("n-mine")

        manager.handleNotificationRead(NotificationReadEvent(notificationId: "n-elsewhere"))

        XCTAssertEqual(
            unread, 3,
            "un id qu'on n'a pas marqué soi-même annonce une lecture faite AILLEURS — elle doit bien compter"
        )
    }

    func test_readEcho_republishesEvenWhenItIsOurOwn() {
        seedUnread(2)
        var republished: [String] = []
        let cancellable = NotificationToastManager.shared.notificationMarkedRead.sink { republished.append($0) }
        _ = NotificationToastManager.shared.applyReadOptimistically("n-1")

        NotificationToastManager.shared.handleNotificationRead(NotificationReadEvent(notificationId: "n-1"))

        XCTAssertEqual(
            republished, ["n-1", "n-1"],
            "seul le COMPTEUR est protégé : la republication est idempotente et repeint une vue montée pendant l'aller-retour"
        )
        cancellable.cancel()
    }

    // MARK: - Deux chemins pour une même ligne

    func test_consumingTheSameNotificationTwice_decrementsOnce() {
        seedUnread(4)
        let manager = NotificationToastManager.shared

        XCTAssertTrue(manager.applyReadOptimistically("n-7"))
        XCTAssertFalse(
            manager.applyReadOptimistically("n-7"),
            "bannière push tapée puis ligne de cloche tapée visent la même ligne — le second geste n'a rien à consommer"
        )

        XCTAssertEqual(unread, 3)
    }

    func test_emptyIdentifier_consumesNothing() {
        seedUnread(3)

        XCTAssertFalse(NotificationToastManager.shared.applyReadOptimistically(""))

        XCTAssertEqual(unread, 3)
    }

    // MARK: - Rollback

    func test_rollback_restoresTheCounter() {
        seedUnread(3)
        let manager = NotificationToastManager.shared
        _ = manager.applyReadOptimistically("n-ko")
        XCTAssertEqual(unread, 2)

        manager.rollbackRead("n-ko")

        XCTAssertEqual(unread, 3, "le serveur a refusé : le −1 optimiste est rendu")
    }

    func test_rollback_republishesSoMountedViewsRepaintTheRowUnread() {
        seedUnread(1)
        var rolledBack: [String] = []
        let cancellable = NotificationToastManager.shared.notificationReadRolledBack.sink { rolledBack.append($0) }
        _ = NotificationToastManager.shared.applyReadOptimistically("n-ko")

        NotificationToastManager.shared.rollbackRead("n-ko")

        XCTAssertEqual(
            rolledBack, ["n-ko"],
            "sans republication, l'optimisme deviendrait un mensonge durable : la ligne resterait lue à l'écran"
        )
        cancellable.cancel()
    }

    func test_rollback_releasesTheIdentifierToTheOutsideWorld() {
        seedUnread(2)
        let manager = NotificationToastManager.shared
        _ = manager.applyReadOptimistically("n-ko")
        manager.rollbackRead("n-ko")
        XCTAssertEqual(unread, 2)

        manager.handleNotificationRead(NotificationReadEvent(notificationId: "n-ko"))

        XCTAssertEqual(
            unread, 1,
            "le −1 a été rendu : une lecture faite ailleurs sur le même id doit de nouveau compter"
        )
    }

    // MARK: - « Tout lire » republié

    func test_republishRead_all_firesTheAllChannel() {
        var allFired = 0
        var conversations: [String] = []
        var posts: [String] = []
        var types: [[String]] = []
        var cancellables: [AnyCancellable] = [
            NotificationToastManager.shared.allNotificationsRead.sink { allFired += 1 },
            NotificationToastManager.shared.conversationNotificationsRead.sink { conversations.append($0) },
            NotificationToastManager.shared.postNotificationsRead.sink { posts.append($0) },
            NotificationToastManager.shared.typeNotificationsRead.sink { types.append($0) }
        ]

        NotificationToastManager.shared.republishRead(.all)

        XCTAssertEqual(allFired, 1, "`.all` a désormais son canal — le `break` laissait une cloche montée non repeinte")
        XCTAssertTrue(
            conversations.isEmpty && posts.isEmpty && types.isEmpty,
            "et toujours AUCUN canal partiel : emprunter `.types([...])` marquerait lues des lignes hors portée"
        )
        cancellables.removeAll()
    }

    func test_readBulkAllScope_reachesTheAllChannel() {
        var allFired = 0
        let cancellable = NotificationToastManager.shared.allNotificationsRead.sink { allFired += 1 }

        NotificationToastManager.shared.handleNotificationReadBulk(
            NotificationReadBulkEvent(scope: NotificationBulkScopePayload(kind: "all"))
        )

        XCTAssertEqual(allFired, 1, "un autre appareil vient de tout lire : la cloche ouverte ici doit se repeindre")
        cancellable.cancel()
    }
}
