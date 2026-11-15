import XCTest
@testable import Meeshy
import MeeshySDK

/// **Le sticker survit à la file durable — et les files déjà sur disque
/// survivent au sticker** (#4823).
///
/// `OfflineQueueItem` est encodé dans `OutboxRecord.payload` et relu au boot ou
/// au flush : une clé qui ne fait pas l'aller-retour perd le sticker en
/// silence ; une clé exigée au décodage casserait chaque ligne écrite avant
/// elle. Même convention `decodeIfPresent` que `location`.
@MainActor
final class OutboxStickerPayloadTests: XCTestCase {

    private func makeItem(sticker: MessageSticker?) -> OfflineQueueItem {
        OfflineQueueItem(
            conversationId: "conv-1",
            content: "",
            clientMessageId: "cid_00000000-0000-4000-8000-000000000001",
            originalLanguage: "fr",
            attachmentIds: ["att-1"],
            attachmentKinds: ["image"],
            sticker: sticker
        )
    }

    func test_offlineQueueItem_encodeDecode_roundTripsSticker() throws {
        let sticker = MessageSticker.template(StickerTemplateCatalog.love[0], slots: ["caption": "Toi"])
        let item = makeItem(sticker: sticker)

        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(OfflineQueueItem.self, from: data)

        XCTAssertEqual(decoded.sticker, sticker)
        XCTAssertEqual(decoded.clientMessageId, item.clientMessageId)
        XCTAssertEqual(decoded.attachmentIds, ["att-1"])
    }

    func test_offlineQueueItem_withoutSticker_omitsTheKey() throws {
        let data = try JSONEncoder().encode(makeItem(sticker: nil))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["sticker"], "un message sans sticker n'écrit pas de `null` : la clé est absente")
    }

    func test_offlineQueueItem_legacyPayloadWithoutStickerKey_decodesNil() throws {
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(makeItem(sticker: .emoji("🔥")))) as? [String: Any]
        )
        json.removeValue(forKey: "sticker")
        let legacy = try JSONSerialization.data(withJSONObject: json)

        let decoded = try JSONDecoder().decode(OfflineQueueItem.self, from: legacy)

        XCTAssertNil(decoded.sticker, "une ligne écrite avant ce champ décode sans migration")
        XCTAssertEqual(decoded.attachmentIds, ["att-1"])
    }

    func test_offlineQueueItem_nonRenderableSticker_decodesNil() throws {
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(makeItem(sticker: nil))) as? [String: Any]
        )
        json["sticker"] = ["templateId": ""]
        let data = try JSONSerialization.data(withJSONObject: json)

        let decoded = try JSONDecoder().decode(OfflineQueueItem.self, from: data)

        XCTAssertNil(decoded.sticker, "un sticker vide sur le fil vaut absence — règle de `MessageSticker.ifRenderable`")
    }
}
