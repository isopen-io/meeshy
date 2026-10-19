import XCTest

final class WidgetDeepLinkTests: XCTestCase {

    private let objectId = "64b7f3a2c1d4e5f6a7b8c9d0"

    func test_conversation_withObjectId_isByteIdenticalToTheLegacyLink() {
        XCTAssertEqual(
            WidgetDeepLink.conversation(objectId)?.absoluteString,
            "meeshy://conversation/\(objectId)"
        )
    }

    func test_contact_withObjectId_isByteIdenticalToTheLegacyLink() {
        XCTAssertEqual(
            WidgetDeepLink.contact(objectId)?.absoluteString,
            "meeshy://contact/\(objectId)"
        )
    }

    func test_quickReply_encodesTheDraftExactlyAsBefore() {
        let draft = "Ça roule & à bientôt ?"
        let legacy = "meeshy://quickreply/\(objectId)?text="
            + (draft.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")

        XCTAssertEqual(
            WidgetDeepLink.quickReply(conversationId: objectId, draft: draft)?.absoluteString,
            legacy
        )
    }

    func test_unusualIdentifier_neverTraps() {
        for id in ["a b", "a#b", "a/b", "é"] {
            XCTAssertNotNil(WidgetDeepLink.conversation(id), id)
            XCTAssertNotNil(WidgetDeepLink.contact(id), id)
            XCTAssertNotNil(WidgetDeepLink.quickReply(conversationId: id, draft: "x"), id)
        }
    }

    func test_emptyIdentifier_yieldsNoLink() {
        XCTAssertNil(WidgetDeepLink.conversation(""))
        XCTAssertNil(WidgetDeepLink.contact(""))
        XCTAssertNil(WidgetDeepLink.quickReply(conversationId: "", draft: "x"))
    }
}
