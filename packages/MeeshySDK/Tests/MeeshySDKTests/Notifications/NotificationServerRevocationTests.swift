import XCTest
import Combine
@testable import MeeshySDK

/// #3894 — un push de révocation reçu app fermée/arrière-plan doit toucher le
/// cache in-app, le compteur ET le badge de la cloche, exactement comme le
/// fait le socket `notification:deleted` app ouverte — pas seulement la
/// bannière (déjà couverte par `NotificationActionHandlerTests`).
///
/// `NotificationToastManager.applyRevocationLocally(_:)` est l'atome PARTAGÉ
/// (cache + republication) entre `delete()` (geste local), `handleNotificationDeleted`
/// (socket) et `applyServerRevocation(notificationIds:)` (push, appelé par
/// `AppDelegate`). Ces tests exercent son comportement RÉEL — le vrai
/// `CacheCoordinator.shared.notifications` (GRDB) et le vrai
/// `Combine.PassthroughSubject` — sans aucun mock.
///
/// `applyServerRevocation` referme la boucle du compteur via
/// `refreshUnreadCount()`, qui tape le RÉSEAU (`NotificationService.shared`,
/// `APIClient.shared` — `NotificationToastManager` n'a aucune seam
/// d'injection, singleton pur comme `delete()` en production). Aucun test
/// d'ici n'invoque `applyServerRevocation` avec une liste non vide : ce
/// serait un vrai appel réseau depuis un test unitaire. Son câblage est gardé
/// par une garde de SOURCE (`test_applyServerRevocation_sourceReusesTheSharedAtomAndRefreshesTheCounter`),
/// même technique que ce dépôt applique déjà à `AppDelegate.swift`
/// (`NotificationActionHandlerTests` § Câblage).
@MainActor
final class NotificationServerRevocationTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []

    private func makeNotification(id: String, isRead: Bool = false) -> APINotification {
        APINotification(
            id: id,
            userId: "u1",
            type: "new_message",
            priority: nil,
            title: "Titre",
            subtitle: "Sous-titre",
            content: "Contenu",
            actor: nil,
            context: NotificationContext(conversationId: nil, postId: nil),
            metadata: nil,
            state: NotificationState(
                isRead: isRead,
                readAt: isRead ? "2026-08-27T10:00:00.000Z" : nil,
                createdAt: "2026-08-27T09:00:00.000Z",
                expiresAt: nil
            ),
            delivery: nil
        )
    }

    /// L'écriture cache d'`applyRevocationLocally` part dans un `Task` interne
    /// fire-and-forget (même mécanisme que `handleNotificationDeleted` en
    /// production) — pas de continuation à `await` directement, donc on
    /// attend la condition plutôt qu'une durée fixe.
    private func waitUntil(timeout: TimeInterval = 2, _ predicate: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if await predicate() { return true }
            try? await Task.sleep(nanoseconds: 20_000_000)
        } while Date() < deadline
        return await predicate()
    }

    override func tearDown() async throws {
        // Le store "all" est le VRAI singleton partagé — ne pas laisser les
        // fixtures de ce test contaminer une suite voisine qui le lirait.
        try? await CacheCoordinator.shared.notifications.save([], for: "all")
        cancellables.removeAll()
        try await super.tearDown()
    }

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Notifications
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Cache (dimension « cache »)

    func test_applyRevocationLocally_removesTheNotificationFromTheRealCache() async throws {
        try await CacheCoordinator.shared.notifications.save(
            [makeNotification(id: "revoc-n1"), makeNotification(id: "revoc-n2")],
            for: "all"
        )

        NotificationToastManager.shared.applyRevocationLocally("revoc-n1")

        let removed = await waitUntil {
            let snapshot = await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: "all")
            return snapshot.map { !$0.items.contains(where: { $0.id == "revoc-n1" }) } ?? false
        }
        XCTAssertTrue(removed, "la notification révoquée doit disparaître du cache réel")

        let snapshot = await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: "all")
        XCTAssertEqual(snapshot?.items.map(\.id), ["revoc-n2"], "les autres lignes ne sont pas touchées")
    }

    // MARK: - Republication (ce que le retrait de bannière consomme)

    func test_applyRevocationLocally_publishesEachIdOnNotificationWasDeleted() {
        var received: [String] = []
        NotificationToastManager.shared.notificationWasDeleted
            .sink { received.append($0) }
            .store(in: &cancellables)

        NotificationToastManager.shared.applyRevocationLocally("revoc-b1")
        NotificationToastManager.shared.applyRevocationLocally("revoc-b2")

        XCTAssertEqual(received, ["revoc-b1", "revoc-b2"],
                       "chaque id révoqué doit être republié — c'est ce que NotificationActionHandler.observeRevocations traduit en retrait de bannière")
    }

    // MARK: - Garde d'entrée d'applyServerRevocation (comportement réel, sans réseau)

    func test_applyServerRevocation_withNoIds_touchesNothing() async {
        var received: [String] = []
        NotificationToastManager.shared.notificationWasDeleted
            .sink { received.append($0) }
            .store(in: &cancellables)

        // Sûr à `await` en entier : le `guard` de tête retourne AVANT tout
        // appel réseau — aucune requête ne part pour un lot vide.
        await NotificationToastManager.shared.applyServerRevocation(notificationIds: [])

        XCTAssertTrue(received.isEmpty, "un lot vide ne doit ni patcher le cache ni republier ni interroger le réseau")
    }

    // MARK: - Câblage (garde de source — le recalcul réseau du compteur ne se rejoue pas en test)

    /// `applyServerRevocation` doit RÉUTILISER l'atome cache+publication
    /// partagé avec le socket (`applyRevocationLocally`, pas une seconde
    /// implémentation) ET recaler le compteur de la cloche
    /// (`refreshUnreadCount()`) — le push `notification_revoked` n'a pas de
    /// `notification:counts` compagnon, contrairement au socket.
    func test_applyServerRevocation_sourceReusesTheSharedAtomAndRefreshesTheCounter() throws {
        let code = try sdkSource("Sources/MeeshySDK/Notifications/NotificationToastManager.swift")
        guard let range = code.range(of: "func applyServerRevocation(notificationIds: [String]) async {") else {
            XCTFail("applyServerRevocation doit exister sur NotificationToastManager"); return
        }
        let body = code[range.upperBound...].prefix(400)
        XCTAssertTrue(body.contains("applyRevocationLocally"),
                      "doit réutiliser l'atome cache+publication partagé avec le socket, pas le réimplémenter")
        XCTAssertTrue(body.contains("refreshUnreadCount()"),
                      "doit recaler le compteur — le push n'a pas de notification:counts compagnon (#3894)")
    }
}
