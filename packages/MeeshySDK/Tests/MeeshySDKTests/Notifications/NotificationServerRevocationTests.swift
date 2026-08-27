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
/// serait un vrai appel réseau depuis un test unitaire. Sa PART LOCALE, elle,
/// est exercée en comportement réel — `applyServerRevocationLocally` existe
/// exactement pour cette raison — et seule sa COMPOSITION avec le compteur
/// reste gardée par la source, même technique que ce dépôt applique déjà à
/// `AppDelegate.swift` (`NotificationActionHandlerTests` § Câblage).
///
/// La dimension que ces tests ajoutent au socket : la DURABILITÉ. App ouverte,
/// une écriture cache confiée à un `Task` détaché a tout le temps de partir ;
/// sur le chemin push, l'appelant rend la main à iOS dès le retour et le
/// processus est couramment suspendu puis tué avant le débounce de 2 s de
/// `GRDBCacheStore` — la ligne révoquée ressuscitait alors au démarrage à
/// froid, servie par le cache (le défaut même que #3894 vient corriger).
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
        // `save()` écrit L2 mais ne VIDE PAS l'ensemble des clés sales : sans
        // ce flush, une mutation laissée en attente par un test d'ici
        // fausserait le compte de clés sales lu par le test de durabilité.
        await CacheCoordinator.shared.notifications.flushDirtyKeys()
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

    /// Un `notificationIds` qui ne porte QUE des entrées vides n'a rien à
    /// révoquer. Le parseur ne les filtre plus (leur RANG qualifie
    /// `conversationIds`, cf. `NotificationRevocationPayloadTests`), donc
    /// `""` parse en `[""]` — un tableau NON vide. Sans filtre côté
    /// consommateur, ce lot passait le garde d'entrée, republiait un id vide
    /// (que `observeRevocations` traduit en un `getDeliveredNotifications`
    /// pour rien) et émettait un `GET /notifications/unread-count` inutile.
    func test_applyServerRevocationLocally_withOnlyEmptyIds_touchesNothing() async {
        var received: [String] = []
        NotificationToastManager.shared.notificationWasDeleted
            .sink { received.append($0) }
            .store(in: &cancellables)

        // Ce que rend le parseur pour `notificationIds = ","` ou `" , "` :
        // des entrées rognées, donc vides — jamais absentes.
        let revoked = await NotificationToastManager.shared
            .applyServerRevocationLocally(notificationIds: ["", ""])

        XCTAssertFalse(revoked, "aucun id RÉEL ⇒ rien n'a été révoqué, donc rien à redemander au réseau")
        XCTAssertTrue(received.isEmpty, "un id vide ne désigne aucune bannière — ne rien republier")
    }

    // MARK: - Durabilité (la dimension que le push exige, et que le socket n'exige pas)

    /// Le chemin PUSH rend la main à iOS (`completionHandler(.noData)`) dès le
    /// retour d'`applyServerRevocation` : ce qui n'a pas atteint SQLite à cet
    /// instant peut ne jamais l'atteindre (iOS suspend, puis tue couramment un
    /// processus lancé en arrière-plan, et `GRDBCacheStore` ne pousse L1 vers
    /// L2 qu'après un débounce de 2 s).
    ///
    /// Deux assertions, indissociables — c'est leur CONJONCTION qui interdit
    /// le `Task` détaché de `applyDeletionToCache` : ou bien il n'a pas encore
    /// tourné au retour (la ligne est encore là, 1re assertion rouge), ou bien
    /// il a tourné et sa mutation attend le débounce (clé sale, 2de rouge).
    func test_applyServerRevocationLocally_removesTheRowAndLeavesNothingUnflushed() async throws {
        try await CacheCoordinator.shared.notifications.save(
            [makeNotification(id: "revoc-d1"), makeNotification(id: "revoc-d2")],
            for: "all"
        )

        let revoked = await NotificationToastManager.shared
            .applyServerRevocationLocally(notificationIds: ["revoc-d1"])
        XCTAssertTrue(revoked)

        let snapshot = await CacheCoordinator.shared.notifications.loadIgnoringExpiry(for: "all")
        XCTAssertEqual(snapshot?.items.map(\.id), ["revoc-d2"],
                       "au RETOUR — pas « bientôt » : la ligne révoquée doit déjà avoir quitté le cache")

        let pending = await CacheCoordinator.shared.notifications.dirtyKeyCount()
        XCTAssertEqual(pending, 0,
                       "le patch doit avoir atteint SQLite avant que l'appelant rende la main à iOS — une clé sale ici, c'est la notification révoquée qui ressuscite au prochain démarrage à froid")
    }

    // MARK: - Câblage (garde de source — le recalcul réseau du compteur ne se rejoue pas en test)

    /// `applyServerRevocation` = la part locale DURABLE (ci-dessus, exercée en
    /// comportement réel) + le recalage du compteur de la cloche
    /// (`refreshUnreadCount()`) — le push `notification_revoked` n'a pas de
    /// `notification:counts` compagnon, contrairement au socket. Le compteur
    /// vient EN DERNIER : la durabilité ne doit pas être l'otage d'un GET lent.
    func test_applyServerRevocation_sourceComposesTheDurableLocalPartThenTheCounter() throws {
        let code = try sdkSource("Sources/MeeshySDK/Notifications/NotificationToastManager.swift")
        guard let range = code.range(of: "func applyServerRevocation(notificationIds: [String]) async {") else {
            XCTFail("applyServerRevocation doit exister sur NotificationToastManager"); return
        }
        let body = code[range.upperBound...].prefix(200)
        guard let localIdx = body.range(of: "applyServerRevocationLocally")?.lowerBound,
              let counterIdx = body.range(of: "refreshUnreadCount()")?.lowerBound else {
            XCTFail("applyServerRevocation doit appeler la part locale durable PUIS refreshUnreadCount() (#3894)")
            return
        }
        XCTAssertTrue(localIdx < counterIdx,
                      "le cache doit être posé et flushé AVANT l'appel réseau — sinon un GET lent emporte la durabilité avec lui")
    }

    /// Et cette part locale doit RÉUTILISER l'atome cache+publication partagé
    /// avec le socket (sa jumelle qui ATTEND l'écriture), pas une seconde
    /// implémentation, puis forcer le flush.
    func test_applyServerRevocationLocally_sourceReusesTheSharedAtomAndForcesTheFlush() throws {
        let code = try sdkSource("Sources/MeeshySDK/Notifications/NotificationToastManager.swift")
        guard let range = code.range(of: "func applyServerRevocationLocally(notificationIds: [String]) async -> Bool {") else {
            XCTFail("applyServerRevocationLocally doit exister sur NotificationToastManager"); return
        }
        let body = code[range.upperBound...].prefix(300)
        XCTAssertTrue(body.contains("applyRevocationDurably"),
                      "doit réutiliser l'atome cache+publication partagé avec le socket, pas le réimplémenter")
        XCTAssertTrue(body.contains("flushDirtyKeys()"),
                      "doit forcer l'écriture SQLite — le débounce de 2 s ne survit pas à la suspension du processus (#3894)")
    }
}
