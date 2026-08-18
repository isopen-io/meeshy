import XCTest
@testable import MeeshySDK

/// « Cet auteur a-t-il un compte ? » — la réponse existait, elle n'arrivait pas.
///
/// `APIMessageSender.type` est décodé depuis toujours (`"user"` / `"anonymous"`),
/// et ne remontait à AUCUN modèle de domaine : `MeeshyMessage` porte cinq champs
/// d'auteur aplatis — nom, pseudo, couleur, avatar, `userId` — et pas celui-là.
/// Un visiteur sans compte s'affichait donc exactement comme un inscrit.
///
/// Défaut jumeau du web, au même endroit du trajet : là-bas le champ était
/// chargé, mappé, puis retiré à la sérialisation faute d'être déclaré au schéma
/// de réponse. Ici il est décodé puis abandonné au mapping. Dans les deux cas la
/// donnée existait à un mètre de l'écran.
///
/// Le PSEUDO ne prouve rien : `ano_` est un préfixe lisible, pas un espace
/// réservé, et un compte peut parfaitement le porter. Seul `type` tranche.
final class MessageSenderAnonymityTests: XCTestCase {

    private func decodeMessage(senderType: String?, username: String = "ano_bob_sm123") -> MeeshyMessage {
        var sender: [String: Any] = [
            "id": "p1",
            "username": username,
            "displayName": username,
            "userId": NSNull(),
        ]
        if let senderType { sender["type"] = senderType }

        let json: [String: Any] = [
            "id": "m1",
            "conversationId": "c1",
            "senderId": "p1",
            "content": "Bonjour",
            "originalLanguage": "fr",
            "messageType": "text",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "sender": sender,
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try! decoder.decode(APIMessage.self, from: data)
        return api.toMessage(currentUserId: "someone-else")
    }

    func test_sender_typeAnonymous_marksTheMessage() {
        let message = decodeMessage(senderType: "anonymous")

        XCTAssertTrue(message.senderIsAnonymous)
    }

    func test_sender_typeUser_doesNotMarkTheMessage() {
        let message = decodeMessage(senderType: "user")

        XCTAssertFalse(message.senderIsAnonymous)
    }

    /// Le pseudo ne décide de rien — c'est tout l'intérêt de trancher sur `type`.
    func test_sender_accountNamedLikeAnAnonymous_isNotMarked() {
        let message = decodeMessage(senderType: "user", username: "ano_bob_sm123")

        XCTAssertFalse(message.senderIsAnonymous)
    }

    /// Un écho socket allégé peut omettre `type`. Marquer à tort un inscrit
    /// comme « sans compte » serait une affirmation FAUSSE sur son identité ; ne
    /// rien affirmer est le seul repli acceptable.
    func test_sender_typeAbsent_assumesNothing() {
        let message = decodeMessage(senderType: nil)

        XCTAssertFalse(message.senderIsAnonymous)
    }

    /// Le prédicat lui-même, au plus près : `type` décide, `username` non.
    func test_sender_isAnonymous_readsTypeNotUsername() {
        func sender(type: String, username: String) -> APIMessageSender {
            let data = try! JSONSerialization.data(withJSONObject: [
                "id": "p1", "username": username, "displayName": username, "type": type,
            ])
            return try! JSONDecoder().decode(APIMessageSender.self, from: data)
        }

        XCTAssertTrue(sender(type: "anonymous", username: "bob").isAnonymous)
        XCTAssertFalse(sender(type: "user", username: "ano_bob").isAnonymous)
    }
}
