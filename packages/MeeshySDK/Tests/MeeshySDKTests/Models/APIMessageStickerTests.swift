import XCTest
@testable import MeeshySDK

/// #4823 — le sticker d'un message traverse le fil dans les deux sens.
///
/// À la lecture : le gateway le HISSE à la racine sur ses deux producteurs
/// (REST et `message:new`) ; une charge qui ne le hisse pas le laisse sous
/// `metadata.sticker`. Les deux formes doivent donner le même `APIMessage`,
/// et un sticker vide doit valoir ABSENT. À l'écriture : `SendMessageRequest`
/// l'encode sous la clé `sticker`, absente quand il n'y en a pas.
///
/// Le décodeur est celui de la PRODUCTION (`APIClient.makeAPIPayloadDecoder`),
/// comme dans `LocationModelsTests` : un `.iso8601` nu refuserait les
/// fractions de seconde du gateway et le test rougirait sur son outillage.
final class APIMessageStickerTests: XCTestCase {

    private func decodeMessage(_ json: String) throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
    }

    private static let head = """
    "id":"m1","conversationId":"c1","senderId":"u1","content":"",
    "createdAt":"2026-09-02T10:00:00.000Z"
    """

    // MARK: - Lecture

    func test_apiMessage_decodesTopLevelSticker() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "sticker":{"templateId":"love.heartFrame","slots":{"caption":"Toi"},"animation":"heartbeat","emoji":"❤️"}}
        """)
        let sticker = try XCTUnwrap(message.sticker)
        XCTAssertEqual(sticker.templateId, "love.heartFrame")
        XCTAssertEqual(sticker.slots, ["caption": "Toi"])
        XCTAssertEqual(sticker.animation, .heartbeat)
        XCTAssertEqual(sticker.emoji, "❤️")
    }

    /// Une charge qui ne hisse pas le sticker — un producteur non mis à jour,
    /// un document relu tel quel — le porte encore sous `metadata`.
    func test_apiMessage_fallsBackToMetadataSticker() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "metadata":{"sticker":{"emoji":"🎉"}}}
        """)
        XCTAssertEqual(message.sticker?.emoji, "🎉")
    }

    /// Le témoin de RANG : quand les deux formes sont présentes, la racine —
    /// la forme que le gateway sert — gagne. Au cas nominal (une seule forme),
    /// un mauvais ordre et le bon rendent le même verdict.
    func test_apiMessage_topLevelStickerWinsOverMetadata() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "sticker":{"emoji":"❤️"},
         "metadata":{"sticker":{"emoji":"🎉"}}}
        """)
        XCTAssertEqual(message.sticker?.emoji, "❤️")
    }

    func test_apiMessage_withoutStickerDecodesToNil() throws {
        let message = try decodeMessage("{\(Self.head)}")
        XCTAssertNil(message.sticker)
    }

    /// Un objet `sticker` sans `templateId` ni `emoji` n'a rien à peindre : il
    /// vaut ABSENT, pas une bulle vide (règle de `MessageSticker.ifRenderable`).
    func test_apiMessage_emptyStickerIsAbsent() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "sticker":{"slots":{"caption":"Toi"},"animation":"pulse"}}
        """)
        XCTAssertNil(message.sticker)
    }

    /// Un mouvement publié par une version plus récente ne fait tomber ni le
    /// sticker ni le message : le sticker reste, immobile.
    func test_apiMessage_unknownAnimationKeepsTheStickerStill() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "sticker":{"emoji":"❤️","animation":"venu-du-futur"}}
        """)
        let sticker = try XCTUnwrap(message.sticker)
        XCTAssertNil(sticker.animation)
        XCTAssertEqual(sticker.emoji, "❤️")
    }

    /// Un `metadata.sticker` malformé ne doit pas emporter `trackingLinks`
    /// avec lui : les deux enveloppes se lisent séparément.
    func test_apiMessage_malformedMetadataStickerLeavesTrackingLinksIntact() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "metadata":{"sticker":"pas-un-objet",
                     "trackingLinks":[{"url":"https://meeshy.me","token":"abc"}]}}
        """)
        XCTAssertNil(message.sticker)
        XCTAssertEqual(message.trackedLinkMap["https://meeshy.me"], "abc")
    }

    // MARK: - Conversion domaine

    func test_toMessage_carriesTheSticker() throws {
        let message = try decodeMessage("""
        {\(Self.head),
         "sticker":{"templateId":"love.heartFrame","animation":"heartbeat","emoji":"❤️"}}
        """)
        let domain = message.toMessage(currentUserId: "someone-else")
        XCTAssertEqual(domain.sticker, message.sticker)
    }

    // MARK: - Écriture

    private func encodedJSONObject(_ request: SendMessageRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(
            try JSONSerialization.jsonObject(with: data) as? [String: Any],
            "le corps encodé doit être un objet JSON"
        )
    }

    func test_sendMessageRequest_encodesStickerUnderItsKey() throws {
        let request = SendMessageRequest(
            content: nil,
            attachmentIds: ["att_png"],
            sticker: MessageSticker(templateId: "love.heartFrame",
                                    slots: ["caption": "Toi"],
                                    animation: .heartbeat,
                                    emoji: "❤️")
        )

        let json = try encodedJSONObject(request)
        let sticker = try XCTUnwrap(json["sticker"] as? [String: Any],
                                    "la clé `sticker` doit porter un objet")
        XCTAssertEqual(sticker["templateId"] as? String, "love.heartFrame")
        XCTAssertEqual(sticker["slots"] as? [String: String], ["caption": "Toi"])
        XCTAssertEqual(sticker["animation"] as? String, "heartbeat")
        XCTAssertEqual(sticker["emoji"] as? String, "❤️")
    }

    func test_sendMessageRequest_omitsStickerWhenNil() throws {
        let json = try encodedJSONObject(SendMessageRequest(content: "Sans sticker"))
        XCTAssertFalse(json.keys.contains("sticker"),
                       "un `sticker` nil ne doit PAS apparaître dans le corps — ni en valeur, ni en null")
    }
}
