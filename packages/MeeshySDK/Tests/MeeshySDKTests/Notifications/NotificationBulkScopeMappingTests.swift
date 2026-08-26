import XCTest
@testable import MeeshySDK

/// `notification:read-bulk` / `notification:deleted-bulk` n'envoient AUCUN id :
/// les chemins de masse du gateway (`updateMany`, `deleteMany`) n'en rendent
/// pas, et les énumérer coûterait un prix proportionnel à l'historique. Le
/// serveur annonce donc le PRÉDICAT qu'il vient d'appliquer, que chaque client
/// rejoue sur son propre cache.
///
/// Le prédicat lui-même existe déjà côté iOS (`NotificationCachePatch`,
/// couvert par `NotificationCachePatchTests`) : la seule pièce neuve est la
/// traduction de la forme SERVEUR vers `NotificationReadScope`. Elle est pure,
/// donc testée isolément — c'est là que se joue le risque de rejouer un
/// prédicat approximatif sur des lignes qui ne sont pas concernées.
final class NotificationBulkScopeMappingTests: XCTestCase {

    private func makeNotification(id: String, isRead: Bool) -> APINotification {
        APINotification(
            id: id,
            userId: "u1",
            type: "new_message",
            priority: nil,
            title: "Titre",
            subtitle: nil,
            content: "Contenu",
            actor: nil,
            context: nil,
            metadata: nil,
            state: NotificationState(
                isRead: isRead,
                readAt: isRead ? "2026-08-25T10:00:00.000Z" : nil,
                createdAt: "2026-08-25T09:00:00.000Z",
                expiresAt: nil
            ),
            delivery: nil
        )
    }

    // MARK: - readScope : les formes servies par le gateway

    func test_readScope_allKind_mapsToAll() {
        let scope = NotificationBulkScopeMapping.readScope(from: NotificationBulkScopePayload(kind: "all"))
        XCTAssertEqual(scope, NotificationReadScope.all)
    }

    func test_readScope_conversationContext_mapsToConversation() {
        let payload = NotificationBulkScopePayload(kind: "context", contextKey: "conversationId", contextValue: "c1")
        XCTAssertEqual(NotificationBulkScopeMapping.readScope(from: payload), NotificationReadScope.conversation(id: "c1"))
    }

    func test_readScope_postContext_mapsToPost() {
        let payload = NotificationBulkScopePayload(kind: "context", contextKey: "postId", contextValue: "p1")
        XCTAssertEqual(NotificationBulkScopeMapping.readScope(from: payload), NotificationReadScope.post(id: "p1"))
    }

    func test_readScope_typesKind_mapsToTypes() {
        let payload = NotificationBulkScopePayload(kind: "types", types: ["friend_request", "contact_request"])
        XCTAssertEqual(
            NotificationBulkScopeMapping.readScope(from: payload),
            NotificationReadScope.types(["friend_request", "contact_request"])
        )
    }

    // MARK: - readScope : ce qu'on refuse de traduire

    func test_readScope_friendRequestContext_returnsNil() {
        let payload = NotificationBulkScopePayload(
            kind: "context", contextKey: "friendRequestId", contextValue: "fr1"
        )

        XCTAssertNil(
            NotificationBulkScopeMapping.readScope(from: payload),
            "`NotificationReadScope` n'a pas de branche pour cette clé de contexte. La fabriquer depuis " +
            "`.types([...])` marquerait lues les lignes d'une AUTRE demande — ne rien appliquer est plus juste"
        )
    }

    func test_readScope_unknownContextKey_returnsNil() {
        let payload = NotificationBulkScopePayload(kind: "context", contextKey: "communityId", contextValue: "x1")
        XCTAssertNil(NotificationBulkScopeMapping.readScope(from: payload))
    }

    func test_readScope_contextWithoutValue_returnsNil() {
        let payload = NotificationBulkScopePayload(kind: "context", contextKey: "conversationId", contextValue: nil)
        XCTAssertNil(NotificationBulkScopeMapping.readScope(from: payload))
    }

    func test_readScope_contextWithEmptyValue_returnsNil() {
        let payload = NotificationBulkScopePayload(kind: "context", contextKey: "postId", contextValue: "")
        XCTAssertNil(
            NotificationBulkScopeMapping.readScope(from: payload),
            "Une valeur vide ne désigne aucune entité : l'appliquer ne matcherait rien, mais l'accepter " +
            "ouvrirait la porte à un `.post(id: \"\")` qui ressemble à une portée valide"
        )
    }

    func test_readScope_emptyTypes_returnsNil() {
        XCTAssertNil(NotificationBulkScopeMapping.readScope(from: NotificationBulkScopePayload(kind: "types", types: [])))
    }

    func test_readScope_typesKindWithoutTypes_returnsNil() {
        XCTAssertNil(NotificationBulkScopeMapping.readScope(from: NotificationBulkScopePayload(kind: "types")))
    }

    func test_readScope_unknownKind_returnsNilRatherThanAll() {
        let scope = NotificationBulkScopeMapping.readScope(from: NotificationBulkScopePayload(kind: "everything"))

        XCTAssertNil(
            scope,
            "Un `kind` inconnu (branche ajoutée côté serveur) ne doit JAMAIS retomber sur `.all` : " +
            "marquer toute la boîte lue est un dégât bien pire que ne rien faire"
        )
    }

    // MARK: - purgesReadRows

    func test_purgesReadRows_readKind_returnsTrue() {
        XCTAssertTrue(NotificationBulkScopeMapping.purgesReadRows(NotificationBulkScopePayload(kind: "read")))
    }

    func test_purgesReadRows_anyOtherKind_returnsFalse() {
        XCTAssertFalse(
            NotificationBulkScopeMapping.purgesReadRows(NotificationBulkScopePayload(kind: "all")),
            "La purge de masse n'a qu'UNE forme aujourd'hui ; un `kind` neuf doit être traité explicitement, " +
            "jamais interprété comme « tout supprimer »"
        )
    }

    // MARK: - removingRead

    func test_removingRead_keepsOnlyUnreadRowsInOrder() {
        let items = [
            makeNotification(id: "n1", isRead: true),
            makeNotification(id: "n2", isRead: false),
            makeNotification(id: "n3", isRead: true),
            makeNotification(id: "n4", isRead: false)
        ]

        let result = NotificationBulkScopeMapping.removingRead(items)

        XCTAssertEqual(result.map(\.id), ["n2", "n4"])
    }

    func test_removingRead_withNoReadRow_returnsTheSameSet() {
        let items = [makeNotification(id: "n1", isRead: false)]
        XCTAssertEqual(NotificationBulkScopeMapping.removingRead(items).map(\.id), ["n1"])
    }
}
