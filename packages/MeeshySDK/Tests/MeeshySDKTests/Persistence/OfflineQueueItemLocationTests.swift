import XCTest
@testable import MeeshySDK

/// Lot 2 — chaîne d'écriture du lieu. Invariant de compatibilité de
/// `OfflineQueueItem.location` : des lignes outbox sérialisées AVANT ce champ
/// existent sur le disque des utilisateurs (`meeshy_messages.sqlite`) et
/// doivent continuer à décoder sans migration — même convention que
/// `attachmentKinds` / `localAudioPaths`.
final class OfflineQueueItemLocationTests: XCTestCase {

    private var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    private var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }

    func test_ligneLegacy_sansCleLocation_decodeToujours() throws {
        // JSON figé au format des versions antérieures : aucune clé `location`.
        let legacyJSON = """
        {"id":"x","clientMessageId":"cid_legacy","conversationId":"c1",
         "content":"hi","createdAt":"2026-05-30T00:00:00Z"}
        """

        let item = try decoder.decode(OfflineQueueItem.self, from: Data(legacyJSON.utf8))

        XCTAssertNil(item.location, "clé absente → nil, jamais un échec de décodage")
        XCTAssertEqual(item.content, "hi")
        XCTAssertEqual(item.clientMessageId, "cid_legacy")
    }

    func test_allerRetour_preserveLeLieu() throws {
        let place = SharedPlace(
            latitude: 45.7578,
            longitude: 4.832,
            name: "Place Bellecour",
            address: "69002 Lyon",
            category: "square"
        )
        let item = OfflineQueueItem(conversationId: "c1", content: "ici", location: place)

        let decoded = try decoder.decode(OfflineQueueItem.self, from: encoder.encode(item))

        XCTAssertEqual(decoded.location, place)
        XCTAssertEqual(decoded.clientMessageId, item.clientMessageId)
    }

    func test_encode_ometLocationQuandNil() throws {
        let item = OfflineQueueItem(conversationId: "c1", content: "sans lieu")

        let data = try encoder.encode(item)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertFalse(json.keys.contains("location"),
                       "un lieu nil ne doit pas être écrit — les lignes restent au format legacy")
    }
}
