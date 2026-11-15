import XCTest
@testable import MeeshySDK

/// #10820 — une réponse à une story ou à une humeur mise en file garde sa
/// citation au rejeu. Les lignes écrites avant ce champ décodent toujours.
final class OfflineQueueItemStoryReplyTests: XCTestCase {

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

    func test_legacyRow_withoutStoryReplyToId_stillDecodes() throws {
        let legacyJSON = """
        {"id":"x","clientMessageId":"cid_legacy","conversationId":"c1",
         "content":"hi","createdAt":"2026-05-30T00:00:00Z"}
        """

        let item = try decoder.decode(OfflineQueueItem.self, from: Data(legacyJSON.utf8))

        XCTAssertNil(item.storyReplyToId)
        XCTAssertEqual(item.content, "hi")
    }

    func test_roundTrip_keepsTheCitedStory() throws {
        let item = OfflineQueueItem(conversationId: "c1", content: "Trop bien", storyReplyToId: "mood-1")

        let decoded = try decoder.decode(OfflineQueueItem.self, from: encoder.encode(item))

        XCTAssertEqual(decoded.storyReplyToId, "mood-1")
        XCTAssertEqual(decoded.clientMessageId, item.clientMessageId)
    }
}
