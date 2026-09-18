import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK

/// Compteur thread-safe pour la closure `@Sendable` de resync.
private actor ResyncCounter {
    private(set) var count = 0
    func increment() { count += 1 }
}

/// SyncEngine A5.3 — le coordinateur app-side abonne `SyncSeqTracker.gapDetected`
/// et déclenche une resync (idempotente) des notifications sur trou détecté.
@MainActor
final class NotificationGapResyncCoordinatorTests: XCTestCase {

    /// Attend (borné) que le compteur atteigne `target`, robuste au débounce +
    /// aux hops de queue (vs un `Task.sleep` fixe fragile).
    private func waitForCount(_ counter: ResyncCounter, toReach target: Int, timeout: TimeInterval = 2.0) async -> Int {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await counter.count >= target { break }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return await counter.count
    }

    func test_gapEmission_triggersResync_once() async {
        let tracker = SyncSeqTracker()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: tracker.gapDetected.publisher,
            debounce: 0.05,
            resync: { await counter.increment() }
        )
        sut.start()

        // Premier event (pas de gap) puis un trou → une seule resync.
        _ = await tracker.observe(5)
        _ = await tracker.observe(9)

        let count = await waitForCount(counter, toReach: 1)
        XCTAssertEqual(count, 1, "un gap détecté doit déclencher exactement une resync")
    }

    func test_contiguousSeq_doesNotResync() async {
        let tracker = SyncSeqTracker()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: tracker.gapDetected.publisher,
            debounce: 0.05,
            resync: { await counter.increment() }
        )
        sut.start()

        _ = await tracker.observe(5)
        _ = await tracker.observe(6)
        _ = await tracker.observe(7)

        try? await Task.sleep(nanoseconds: 250_000_000)
        let count = await counter.count
        XCTAssertEqual(count, 0, "des seq contigus ne déclenchent aucune resync")
    }

    func test_burstOfGaps_coalescesToOneResync() async {
        let tracker = SyncSeqTracker()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: tracker.gapDetected.publisher,
            debounce: 0.15,
            resync: { await counter.increment() }
        )
        sut.start()

        _ = await tracker.observe(5)
        _ = await tracker.observe(9)   // gap
        _ = await tracker.observe(20)  // gap
        _ = await tracker.observe(40)  // gap

        let count = await waitForCount(counter, toReach: 1)
        // Laisse une fenêtre APRÈS la 1re resync pour prouver qu'aucune 2e ne suit.
        try? await Task.sleep(nanoseconds: 300_000_000)
        let final = await counter.count
        XCTAssertEqual(count, 1)
        XCTAssertEqual(final, 1, "une rafale de gaps doit être coalescée en une seule resync")
    }

    // MARK: - A5.4 — refresh au reconnect

    /// A5.4 — après une coupure socket, le client a raté des events dans la
    /// fenêtre aveugle (le gap detection ne couvre que les events REÇUS) →
    /// `didReconnect` doit déclencher une resync inconditionnelle.
    func test_reconnect_triggersResync() async {
        let reconnect = PassthroughSubject<Void, Never>()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: Empty().eraseToAnyPublisher(),
            reconnectPublisher: reconnect.eraseToAnyPublisher(),
            debounce: 0.05,
            resync: { await counter.increment() }
        )
        sut.start()

        reconnect.send(())

        let count = await waitForCount(counter, toReach: 1)
        XCTAssertEqual(count, 1, "un reconnect doit déclencher une resync des notifications")
    }

    // MARK: - #7000 — le retour au PREMIER PLAN

    /// La suspension est une fenêtre aveugle, exactement comme une coupure
    /// socket : au retour, la boîte se RELIT. `MeeshyApp` y effaçait au
    /// contraire toutes les bannières livrées, sans rien rafraîchir.
    func test_foreground_whenAuthenticated_triggersResync() async {
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: Empty().eraseToAnyPublisher(),
            reconnectPublisher: Empty().eraseToAnyPublisher(),
            debounce: 0.05,
            isAuthenticated: { true },
            resync: { await counter.increment() }
        )

        sut.refreshOnForeground()

        let count = await waitForCount(counter, toReach: 1)
        XCTAssertEqual(count, 1, "revenir au premier plan doit relire la liste et le compteur")
    }

    /// `scenePhase == .active` arrive AUSSI sur l'écran de connexion et au
    /// démarrage à froid d'une session expirée : une resync y serait un 401 et
    /// un cache qu'on n'a pas le droit de peupler.
    func test_foreground_whenSignedOut_doesNothing() async {
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: Empty().eraseToAnyPublisher(),
            reconnectPublisher: Empty().eraseToAnyPublisher(),
            debounce: 0.05,
            isAuthenticated: { false },
            resync: { await counter.increment() }
        )

        sut.refreshOnForeground()

        try? await Task.sleep(nanoseconds: 250_000_000)
        let count = await counter.count
        XCTAssertEqual(count, 0, "sans session, le premier plan ne déclenche aucune lecture")
    }

    // MARK: - #7000 — garde de source sur MeeshyApp

    /// **Le geste effacé, mesuré là où il vivait.**
    ///
    /// `removeAllDeliveredNotifications()` est un effet SYSTÈME sur
    /// `UNUserNotificationCenter` : aucun témoin de comportement ne peut
    /// l'observer depuis la racine SwiftUI, et son retrait ne fait rougir
    /// aucun test. La seule mesure possible est la SOURCE. Le retrait de
    /// bannières est désormais borné à ce qu'on vient de consommer
    /// (`NotificationActionHandler.removeDeliveredNotifications(matching:)`),
    /// jamais global.
    func test_meeshyApp_neverClearsEveryDeliveredBanner() throws {
        // Les COMMENTAIRES sont dépouillés avant la mesure : celui qui explique
        // le retrait NOMME la fonction retirée, et une garde par sous-chaîne
        // lue sur la source brute rougit sur sa propre explication.
        let source = AppSourceGuard.stripComments(
            try String(contentsOf: meeshyAppSourceURL(), encoding: .utf8)
        )

        XCTAssertFalse(
            source.contains("removeAllDeliveredNotifications"),
            """
            `MeeshyApp` efface toutes les bannières livrées. Ce geste retire celles d'AUTRES \
            conversations, s'exécute même sans session, et ne rafraîchit ni la cloche ni le badge : \
            on vide le seul endroit où l'utilisateur peut encore lire ce qu'il a manqué. \
            Le retrait doit être borné aux threads consommés (#6999).
            """
        )
    }

    func test_meeshyApp_refreshesNotificationsOnForeground() throws {
        let source = try String(contentsOf: meeshyAppSourceURL(), encoding: .utf8)

        XCTAssertTrue(
            source.contains("NotificationGapResyncCoordinator.shared.refreshOnForeground()"),
            "le retour au premier plan doit RELIRE la boîte — sinon cloche et badge restent périmés"
        )
    }

    private func meeshyAppSourceURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/MeeshyTests/Unit/Services
            .deletingLastPathComponent()  // …/MeeshyTests/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy/MeeshyApp.swift")
    }
}
