import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class FailedMessageReplayTests: XCTestCase {

    private let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")

    private func makeFailed(attachments: [MessageAttachment] = []) -> Message {
        Message(
            id: "temp_42",
            conversationId: "000000000000000000000097",
            senderId: "u1",
            content: "Salut",
            originalLanguage: "es",
            replyToId: "r1",
            storyReplyToId: "s1",
            forwardedFromId: "f1",
            forwardedFromConversationId: "fc1",
            attachments: attachments,
            deliveryStatus: .failed,
            isMe: true,
            location: place
        )
    }

    func test_outgoing_reusesClientMessageIdKeepsOriginalLanguageReplyForwardAndLocation_dropsStoryAndAttachments() {
        let photo = MessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "https://cdn/a1.jpg")

        let outgoing = FailedMessageReplay.outgoing(of: makeFailed(attachments: [photo]), conversationId: "conv-1")

        XCTAssertEqual(outgoing.conversationId.rawValue, "conv-1")
        XCTAssertEqual(outgoing.content, "Salut")
        XCTAssertEqual(outgoing.originalLanguage, "es")
        XCTAssertEqual(outgoing.reusedClientMessageId?.rawValue, "temp_42")
        XCTAssertEqual(outgoing.location, place)
        XCTAssertEqual(outgoing.relation.replyToId, "r1")
        XCTAssertNil(outgoing.relation.storyReplyToId)
        XCTAssertNil(outgoing.relation.attachmentReplyTo)
        XCTAssertNil(outgoing.attachments.ids)
        XCTAssertNil(outgoing.attachments.previews)
    }
}
