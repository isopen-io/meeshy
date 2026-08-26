import XCTest
@testable import MeeshySDK

/// Gardes de SOURCE pour les branchements ajoutés à `setupEventHandlers()` :
/// `auth:session-revoked`, `friend-request:cancelled`, `friend-request:rejected`
/// et les deux événements de masse `notification:read-bulk` /
/// `notification:deleted-bulk`.
///
/// Le client Socket.IO est un type concret tiers, sans mock : le seul niveau où
/// l'on peut prouver qu'un événement est ÉCOUTÉ, et vers QUOI il route, est la
/// source — même motif que `CallEmitSourceGuardTests`. Le comportement en aval
/// (cache d'amitié, ré-authentification, mapping de portée) est couvert par des
/// tests de comportement dans `Cache/`, `Auth/` et `Notifications/`.
///
/// Chaque garde vise le BLOC de son écouteur, jamais le fichier : c'est la
/// seule façon de prouver qu'un chemin appelle une méthode ET PAS sa voisine.
final class SocketLifecycleBindingGuardTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func messageSocketSource() throws -> String {
        try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")
    }

    /// Bloc d'un écouteur : de son `socket.on("<event>")` jusqu'au `socket.on(`
    /// suivant. Un commentaire qui PRÉCÈDE la ligne d'enregistrement appartient
    /// donc au bloc précédent — voulu : la garde ne doit pas pouvoir être
    /// satisfaite par une phrase écrite au-dessus.
    private func listenerBlock(for event: String, in source: String) -> String? {
        let marker = "socket.on(\"\(event)\")"
        for segment in source.components(separatedBy: "socket.on(").dropFirst() {
            let block = "socket.on(" + segment
            if block.hasPrefix(marker) { return block }
        }
        return nil
    }

    /// Corps d'une déclaration : du marqueur jusqu'à la première accolade
    /// fermante indentée de quatre espaces (fin de méthode).
    private func declarationBlock(after marker: String, in source: String) -> String? {
        guard let range = source.range(of: marker) else { return nil }
        let tail = source[range.lowerBound...]
        guard let end = tail.range(of: "\n    }") else { return String(tail) }
        return String(tail[tail.startIndex..<end.upperBound])
    }

    // MARK: - auth:session-revoked

    func test_authSessionRevokedListener_isRegistered() throws {
        let source = try messageSocketSource()
        XCTAssertNotNil(
            listenerBlock(for: "auth:session-revoked", in: source),
            "Le gateway émet `auth:session-revoked` PUIS coupe la socket (mot de passe changé, révocation " +
            "de tous les appareils, action admin). Sans écouteur, l'app garde une session morte jusqu'au prochain 401"
        )
    }

    func test_authSessionRevokedListener_routesToHandleSessionRevoked() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(listenerBlock(for: "auth:session-revoked", in: source))

        XCTAssertTrue(
            block.contains("AuthManager.shared.handleSessionRevoked()"),
            "La révocation doit aller droit à la ré-authentification"
        )
    }

    func test_authSessionRevokedListener_neverTriggersARefresh() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(listenerBlock(for: "auth:session-revoked", in: source))

        XCTAssertFalse(
            block.contains("handleUnauthorized"),
            "Surtout PAS `handleUnauthorized()` (la voisine de `auth:token-expired`) : son `refreshSession(force:)` " +
            "obtiendrait un JWT neuf — `/auth/refresh` ne vérifie pas que la session existe encore — et " +
            "RÉARMERAIT pour 24 h la session que le serveur vient de révoquer"
        )
        XCTAssertFalse(
            block.contains("refreshSession"),
            "Aucun rafraîchissement ne doit partir de ce chemin, quelle que soit la porte empruntée"
        )
    }

    /// Contre-épreuve : la garde négative ci-dessus rougirait-elle si le
    /// mauvais appel revenait dans ce bloc ?
    func test_listenerBlock_onFabricatedRefreshingBlock_exposesTheForbiddenCall() {
        let fabricated = """
        socket.on("auth:token-expired") { _, _ in
            Task { @MainActor in AuthManager.shared.handleUnauthorized() }
        }

        socket.on("auth:session-revoked") { _, _ in
            Task { @MainActor in AuthManager.shared.handleUnauthorized() }
        }
        """
        let block = listenerBlock(for: "auth:session-revoked", in: fabricated)

        XCTAssertNotNil(block)
        XCTAssertTrue(
            block?.contains("handleUnauthorized") == true,
            "Le découpage doit ramener le CORPS de l'écouteur visé — sans quoi la garde négative serait morte"
        )
    }

    // MARK: - friend-request:cancelled / friend-request:rejected

    func test_friendRequestCancelledListener_appliesWithdrawal() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(
            listenerBlock(for: "friend-request:cancelled", in: source),
            "`friend-request:cancelled` est le SEUL signal de ce geste : aucune ligne `Notification` n'est persistée, " +
            "donc sans écouteur la demande retirée reste affichée jusqu'au prochain chargement complet"
        )

        XCTAssertTrue(
            block.contains("applyFriendRequestWithdrawal(otherUserId: event.cancelledBy)"),
            "La charge ne porte que `{friendRequestId, cancelledBy}` et ne dit pas de quel côté est le lecteur : " +
            "`cancelledBy` est l'AUTRE partie, quel que soit le sens"
        )
    }

    func test_friendRequestRejectedListener_clearsTheSentRequest() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(listenerBlock(for: "friend-request:rejected", in: source))

        XCTAssertTrue(
            block.contains("applyFriendRequestRejection(rejecterId: event.rejecterId)"),
            "L'événement arrive chez l'EXPÉDITEUR d'origine : c'est `_sentPending` qu'il faut vider, " +
            "et `rejecterId` en est la clé"
        )
    }

    func test_friendRequestWithdrawal_clearsBothDirectionsThenInvalidatesPersistence() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(
            declarationBlock(after: "static func applyFriendRequestWithdrawal", in: source)
        )

        XCTAssertTrue(block.contains("didCancelRequest(to: otherUserId)"))
        XCTAssertTrue(block.contains("didRejectRequest(from: otherUserId)"))
        XCTAssertTrue(
            block.contains("await FriendshipCache.shared.invalidatePersistedFriendCaches()"),
            "Muter FriendshipCache ne repeint PAS l'écran Demandes : ses lignes viennent de GRDB, encore `.fresh`. " +
            "`notifyChange()` n'incrémente que `version` — l'invalidation doit être explicite"
        )
    }

    func test_friendRequestRejection_clearsSentPendingThenInvalidatesPersistence() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(
            declarationBlock(after: "static func applyFriendRequestRejection", in: source)
        )

        XCTAssertTrue(block.contains("didCancelRequest(to: rejecterId)"))
        XCTAssertFalse(
            block.contains("didRejectRequest"),
            "`didRejectRequest(from:)` viderait `_receivedPending` — mauvaise direction, no-op garanti sur ce chemin"
        )
        XCTAssertTrue(block.contains("await FriendshipCache.shared.invalidatePersistedFriendCaches()"))
    }

    /// Garde NÉGATIVE : le correctif « ajouter `friend_rejected` à
    /// `MeeshyNotificationType` » a été RÉFUTÉ — aucun émetteur du dépôt ne
    /// produit cette valeur (le gateway envoie une notification `system` sans
    /// `senderId`), et le cas de switch qu'elle activerait appellerait la
    /// mauvaise direction du cache. Le réintroduire fabriquerait du code mort.
    private func declaresFriendRejectedCase(_ source: String) -> Bool {
        source.contains("friend_rejected")
    }

    func test_meeshyNotificationType_declaresNoFriendRejectedCase() throws {
        let source = try sdkSource("Sources/MeeshySDK/Models/NotificationModels.swift")

        XCTAssertFalse(
            declaresFriendRejectedCase(source),
            "Aucun émetteur ne produit `friend_rejected` : le signal typé `friend-request:rejected` est " +
            "l'unique chemin, et il est écouté par MessageSocketManager"
        )
    }

    /// Contre-épreuve : la garde négative ci-dessus rougirait-elle si le cas
    /// interdit était réintroduit dans `MeeshyNotificationType` ?
    func test_meeshyNotificationType_guardWouldRedden_onReintroducedCase() {
        let fabricated = """
        public enum MeeshyNotificationType: String, Codable, Sendable {
            case friendRequest = "friend_request"
            case friendRejected = "friend_rejected"
        }
        """

        XCTAssertTrue(
            declaresFriendRejectedCase(fabricated),
            "Contre-épreuve du prédicat : il doit voir le cas réintroduit"
        )
    }

    // MARK: - notification:read-bulk / notification:deleted-bulk

    func test_notificationReadBulkListener_republishesToItsSubject() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(listenerBlock(for: "notification:read-bulk", in: source))

        XCTAssertTrue(block.contains("NotificationReadBulkEvent.self"))
        XCTAssertTrue(block.contains("notificationReadBulk.send(event)"))
    }

    func test_notificationDeletedBulkListener_republishesToItsSubject() throws {
        let source = try messageSocketSource()
        let block = try XCTUnwrap(listenerBlock(for: "notification:deleted-bulk", in: source))

        XCTAssertTrue(block.contains("NotificationDeletedBulkEvent.self"))
        XCTAssertTrue(block.contains("notificationDeletedBulk.send(event)"))
    }

    func test_notificationToastManager_subscribesToBothBulkPublishers() throws {
        let source = try sdkSource("Sources/MeeshySDK/Notifications/NotificationToastManager.swift")

        XCTAssertTrue(
            source.contains("socket.notificationReadBulk")
                && source.contains("handleNotificationReadBulk(event)"),
            "Republier depuis la socket ne sert à rien sans abonné : le manager est le propriétaire unique du store"
        )
        XCTAssertTrue(
            source.contains("socket.notificationDeletedBulk")
                && source.contains("handleNotificationDeletedBulk(event)")
        )
    }

    /// La purge de masse ne porte AUCUN id : le handler doit relever ceux des
    /// lignes déjà lues AVANT d'écrire, puis les republier une à une sur le
    /// canal que la liste montée écoute déjà. Patcher le seul cache laisserait
    /// les lignes purgées à l'écran jusqu'au prochain chargement.
    func test_deletedBulkHandler_removesReadRowsFromCacheAndFromTheMountedList() throws {
        let source = try sdkSource("Sources/MeeshySDK/Notifications/NotificationToastManager.swift")
        let block = try XCTUnwrap(declarationBlock(after: "func handleNotificationDeletedBulk", in: source))

        XCTAssertTrue(
            block.contains("NotificationBulkScopeMapping.removingRead(items)"),
            "l'écriture cache doit passer par la transformation pure, seule couverte par ses propres tests"
        )
        XCTAssertTrue(
            block.contains("notificationWasDeleted.send("),
            "sans republication, la liste montée garde les lignes purgées — le correctif n'atteindrait aucun lecteur"
        )
    }

    /// Aucun refetch REST ne doit être déclenché par ces deux chemins : le
    /// compteur autoritatif arrive par `notification:counts`, et un GET par
    /// événement de masse changerait le coût réseau du produit.
    func test_bulkHandlers_triggerNoRESTRefetch() throws {
        let source = try sdkSource("Sources/MeeshySDK/Notifications/NotificationToastManager.swift")
        let readBulk = try XCTUnwrap(declarationBlock(after: "func handleNotificationReadBulk", in: source))
        let deletedBulk = try XCTUnwrap(declarationBlock(after: "func handleNotificationDeletedBulk", in: source))

        for (name, block) in [("read-bulk", readBulk), ("deleted-bulk", deletedBulk)] {
            XCTAssertFalse(
                block.contains("refreshUnreadCount"),
                "\(name) ne doit pas déclencher de refetch : `notification:counts` porte déjà le compteur"
            )
            XCTAssertFalse(
                block.contains("NotificationService.shared"),
                "\(name) ne doit toucher aucune route REST : le prédicat suffit à rejouer le lot localement"
            )
        }
    }
}
