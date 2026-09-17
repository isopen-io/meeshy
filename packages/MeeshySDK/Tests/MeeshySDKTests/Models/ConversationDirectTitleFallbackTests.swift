import XCTest
@testable import MeeshySDK

/// #6790 — un direct affiche son titre stocké au lieu du nom de l'interlocuteur.
///
/// Le décodeur préférait déjà le pair quand `participants` est servi — c'est
/// `GET /conversations` et `GET /conversations/:id`. `GET /sync`
/// (`services/gateway/src/routes/sync/conversations.ts`), le chemin de
/// rafraîchissement PRINCIPAL d'iOS, ne servait ni `participants` ni
/// `lastMessage` : une conversation directe qui apparaît pour la première
/// fois sur un appareil par ce chemin (nouvelle installation, nouvel appareil,
/// reconnexion) retombait sur le `title` STOCKÉ — un artefact du legacy
/// composé "X et Y" à la création, qui nomme les deux interlocuteurs y
/// compris le lecteur.
///
/// #6827 (suivi, RÉSOLU côté serveur) — `syncConversationSelect` embarque
/// désormais l'AUTRE participant d'un direct, borné à deux lignes, DIRECTEMENT
/// sur la ligne `conversations` de `/sync` (piste 2 de l'issue : l'alternative
/// étroite, jamais le roster complet de la collection `participants`). Zéro
/// changement de décodeur : `APIConversation.participants` existait déjà, et
/// `test_toConversation_withParticipants_prefersThePeerOverTheStoredTitle`
/// ci-dessous EST le témoin de ce chemin — un direct fraîchement découvert via
/// `/sync` affiche donc le nom du pair, plus le libellé générique. Le test
/// juste en dessous garde le repli pour ce que #6827 NE couvre pas : un type
/// autre que `direct`, ou une requête dont `?fields=` exclut `participants`.
final class ConversationDirectTitleFallbackTests: XCTestCase {

    private func decodeConversation(_ payload: [String: Any]) throws -> APIConversation {
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: data)
    }

    private func directPayload(
        title: String? = "Alice et Bob",
        includeParticipants: Bool = false,
        includeLastMessageSender: Bool = false
    ) -> [String: Any] {
        var body: [String: Any] = [
            "id": "conv1",
            "type": "direct",
            "createdAt": "2026-08-10T10:00:00Z",
        ]
        if let title { body["title"] = title }
        if includeParticipants {
            body["participants"] = [
                ["id": "p2", "userId": "u2", "displayName": "Bob"],
            ]
        }
        if includeLastMessageSender {
            body["lastMessage"] = [
                "id": "m1",
                "content": "Hello",
                "createdAt": "2026-08-10T10:00:00Z",
                "sender": ["id": "p2", "userId": "u2", "displayName": "Bob"],
            ]
        }
        return body
    }

    /// La forme exacte servie par `GET /sync` : ni `participants` ni
    /// `lastMessage`. C'est le chemin qui laissait passer le titre légataire.
    func test_toConversation_syncShapeWithoutParticipants_neverServesTheStoredTitle() throws {
        let api = try decodeConversation(directPayload(title: "Alice et Bob"))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.title, "Conversation")
        XCTAssertNotEqual(conversation.title, "Alice et Bob")
    }

    /// `GET /conversations` / `GET /conversations/:id` : `participants` est
    /// servi, le pair doit continuer à primer sur le titre stocké.
    func test_toConversation_withParticipants_prefersThePeerOverTheStoredTitle() throws {
        let api = try decodeConversation(directPayload(title: "Alice et Bob", includeParticipants: true))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.title, "Bob")
    }

    /// Sans `participants` mais avec un dernier message d'autrui : le nom de
    /// l'expéditeur reste un repli honnête, avant le titre stocké.
    func test_toConversation_withoutParticipantsButWithLastMessageSender_prefersTheSender() throws {
        let api = try decodeConversation(directPayload(title: "Alice et Bob", includeLastMessageSender: true))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.title, "Bob")
    }

    /// Une conversation de GROUPE garde son titre stocké — la règle est
    /// spécifique aux directs, elle ne s'étend pas.
    func test_toConversation_group_stillUsesStoredTitle() throws {
        var payload = directPayload(title: "Team Awesome")
        payload["type"] = "group"
        let api = try decodeConversation(payload)

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.title, "Team Awesome")
    }
}
