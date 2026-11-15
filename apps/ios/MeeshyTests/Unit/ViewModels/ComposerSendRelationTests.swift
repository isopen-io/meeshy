import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ComposerSendRelationTests: XCTestCase {

    private func messageRoute() -> OutgoingReplyRoute {
        OutgoingReplyRoute(
            pending: ReplyReference(messageId: "msg_1", authorName: "Bob", previewText: "Salut"),
            conversationIsDirect: false,
            participantUserId: nil
        )
    }

    private func storyRoute() -> OutgoingReplyRoute {
        OutgoingReplyRoute(
            pending: ReplyReference(messageId: "story_1", authorName: "Alice", previewText: "Coucher", isStoryReply: true, storyAuthorId: "alice"),
            conversationIsDirect: true,
            participantUserId: "alice"
        )
    }

    private func noRoute() -> OutgoingReplyRoute {
        OutgoingReplyRoute(pending: nil, conversationIsDirect: true, participantUserId: "alice")
    }

    func test_of_messageReply_isReplyCarryingTheCitedAttachment() {
        let anchor = QuotedAttachmentSend(attachmentId: "att_1")
        let route = messageRoute()

        let relation = ComposerSendRelation.of(route, citing: anchor)

        XCTAssertEqual(relation, .reply(to: MessageID("msg_1"), citing: anchor))
        XCTAssertEqual(relation.replyToId, route.replyToId)
        XCTAssertNil(relation.storyReplyToId)
    }

    func test_of_storyReply_isStoryReplyWithReference_andDropsTheAnchor() {
        let route = storyRoute()

        let relation = ComposerSendRelation.of(route, citing: QuotedAttachmentSend(attachmentId: "att_1"))

        XCTAssertEqual(relation, .storyReply(to: StoryID("story_1"), reference: route.storyReference))
        XCTAssertNil(relation.attachmentReplyTo)
        XCTAssertNil(relation.replyToId)
    }

    func test_of_noPendingReply_isNone() {
        XCTAssertEqual(ComposerSendRelation.of(noRoute(), citing: nil), .none)
    }

    func test_of_inadmissibleStoryReply_isNone() {
        let route = OutgoingReplyRoute(
            pending: ReplyReference(messageId: "story_1", authorName: "Alice", previewText: "", isStoryReply: true, storyAuthorId: "alice"),
            conversationIsDirect: false,
            participantUserId: "alice"
        )

        XCTAssertEqual(ComposerSendRelation.of(route, citing: nil), .none)
    }

    func test_of_isEquivalentToTheLegacyDerivation() {
        for route in [messageRoute(), storyRoute(), noRoute()] {
            let anchor = QuotedAttachmentSend(attachmentId: "att_9")
            let legacy = MessageRelation.legacy(
                replyToId: route.replyToId, storyReplyToId: route.storyReplyToId, storyReference: route.storyReference,
                forwardedFromId: nil, forwardedFromConversationId: nil, attachmentReplyTo: anchor
            )
            XCTAssertEqual(ComposerSendRelation.of(route, citing: anchor), legacy)
        }
    }
}
