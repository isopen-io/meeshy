import XCTest
@testable import MeeshySDK

final class ConversationMediaKindTests: XCTestCase {

    func test_rawValues_matchTheGatewayGenres() {
        XCTAssertEqual(
            ConversationMediaKind.allCases.map(\.rawValue),
            ["visual", "audio", "document", "link", "contact", "conversation", "location"]
        )
    }

    func test_ofAttachment_partitionsLikeTheServerClause() {
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "image/jpeg"), .visual)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "Video/MP4"), .visual)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "audio/m4a"), .audio)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "text/vcard"), .contact)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "text/x-vcard; charset=utf-8"), .contact)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "application/pdf"), .document)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: "text/plain"), .document)
        XCTAssertEqual(ConversationMediaKind.ofAttachment(mimeType: ""), .document)
    }

    func test_indexKey_visual_keepsTheBareConversationIdOf8100() {
        XCTAssertEqual(ConversationMediaKind.visual.indexKey(conversationId: "c1"), "c1")
    }

    func test_indexKey_otherKinds_areDistinctPerKind() {
        let keys = ConversationMediaKind.allIndexKeys(conversationId: "c1")
        XCTAssertEqual(Set(keys).count, ConversationMediaKind.allCases.count)
        XCTAssertEqual(ConversationMediaKind.document.indexKey(conversationId: "c1"), "c1|document")
    }

    func test_isAttachmentKind_onlyForPieceGenres() {
        XCTAssertEqual(
            ConversationMediaKind.allCases.filter(\.isAttachmentKind),
            [.visual, .audio, .document, .contact]
        )
    }
}
