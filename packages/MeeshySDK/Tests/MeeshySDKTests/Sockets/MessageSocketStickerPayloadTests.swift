import XCTest
@testable import MeeshySDK

/// #4823 — le sticker voyage aussi par le socket (`message:send-with-attachments`),
/// sous la MÊME clé et la même forme que le corps REST (`SendMessageRequest.sticker`),
/// pour que les deux transports produisent un message indiscernable côté gateway.
///
/// La charge mesurée est celle que `buildAttachmentPayload` ÉMET réellement —
/// pas une reconstruction du test — et aucun socket n'est ouvert : la
/// composition de la charge ne touche pas la connexion.
final class MessageSocketStickerPayloadTests: XCTestCase {

    func test_stickerSocketPayload_carriesTheFourWireKeys() {
        let sticker = MessageSticker(templateId: "love.heartFrame",
                                     slots: ["caption": "Toi"],
                                     animation: .heartbeat,
                                     emoji: "❤️")

        let dict = MessageSocketManager.stickerSocketPayload(sticker)

        XCTAssertEqual(dict["templateId"] as? String, "love.heartFrame")
        XCTAssertEqual(dict["slots"] as? [String: String], ["caption": "Toi"])
        XCTAssertEqual(dict["animation"] as? String, "heartbeat")
        XCTAssertEqual(dict["emoji"] as? String, "❤️")
    }

    /// Les nil et les `slots` vides sont OMIS — pas de `NSNull`, pas d'objet
    /// vide à interpréter par le schéma du gateway.
    func test_stickerSocketPayload_omitsNilsAndEmptySlots() {
        let dict = MessageSocketManager.stickerSocketPayload(.emoji("🎉"))

        XCTAssertEqual(dict.keys.sorted(), ["emoji"])
    }

    func test_buildAttachmentPayload_carriesTheStickerUnderItsKey() {
        let payload = MessageSocketManager.shared.buildAttachmentPayload(
            conversationId: "c1", content: nil, attachmentIds: ["att_png"],
            replyToId: nil, originalLanguage: nil, isEncrypted: false,
            clientMessageId: "cid_1", sticker: .emoji("❤️")
        )

        let sticker = payload["sticker"] as? [String: Any]
        XCTAssertEqual(sticker?["emoji"] as? String, "❤️")
        XCTAssertEqual(payload["attachmentIds"] as? [String], ["att_png"],
                       "le PNG rendu voyage à part, en pièce jointe image ordinaire")
    }

    func test_buildAttachmentPayload_omitsStickerWhenNil() {
        let payload = MessageSocketManager.shared.buildAttachmentPayload(
            conversationId: "c1", content: "texte", attachmentIds: ["att_1"],
            replyToId: nil, originalLanguage: nil, isEncrypted: false,
            clientMessageId: "cid_2"
        )

        XCTAssertNil(payload["sticker"],
                     "un message sans sticker ne doit pas porter la clé — ni en valeur, ni en null")
    }
}
