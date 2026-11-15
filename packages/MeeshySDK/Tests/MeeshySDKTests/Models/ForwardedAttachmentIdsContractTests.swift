import XCTest
@testable import MeeshySDK

/// #9914, #10947 — la pièce CHOISIE d'un transfert voyage sous la clé
/// `forwardedAttachmentIds` (`services/gateway/src/validation/forwarded-attachments.ts`) ;
/// absente, la passerelle recopie tout le lot, comme avant. Hors ligne, la file
/// la garde jusqu'au rejeu — une ligne écrite avant ce champ décode sans lui.
final class ForwardedAttachmentIdsContractTests: XCTestCase {

    private func json(_ request: SendMessageRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_encode_carriesTheChosenPiecesInOrder() throws {
        let request = SendMessageRequest(content: nil, forwardedFromId: "m1", forwardedAttachmentIds: ["a3", "a1"])
        XCTAssertEqual(try json(request)["forwardedAttachmentIds"] as? [String], ["a3", "a1"])
    }

    func test_encode_omitsTheKeyWhenTheWholeMessageIsForwarded() throws {
        let request = SendMessageRequest(content: nil, forwardedFromId: "m1")
        XCTAssertFalse(try json(request).keys.contains("forwardedAttachmentIds"))
    }

    func test_queueItem_keepsTheChosenPiecesAcrossPersistence() throws {
        let item = OfflineQueueItem(conversationId: "c1", content: "", forwardedFromId: "m1", forwardedAttachmentIds: ["a2"])
        let decoded = try JSONDecoder().decode(OfflineQueueItem.self, from: JSONEncoder().encode(item))
        XCTAssertEqual(decoded.forwardedAttachmentIds, ["a2"])
    }

    func test_queueItem_writtenBeforeTheFieldDecodesWithoutIt() throws {
        let legacy = #"{"id":"x","clientMessageId":"cid_1","conversationId":"c1","content":"hi","createdAt":0}"#
        let decoded = try JSONDecoder().decode(OfflineQueueItem.self, from: Data(legacy.utf8))
        XCTAssertNil(decoded.forwardedAttachmentIds)
    }
}
