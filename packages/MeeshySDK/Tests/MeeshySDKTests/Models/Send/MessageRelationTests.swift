import Foundation
import Testing
@testable import MeeshySDK

struct MessageRelationTests {

    private func legacy(
        replyToId: String? = nil,
        storyReplyToId: String? = nil,
        storyReference: ReplyReference? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        attachmentReplyTo: QuotedAttachmentSend? = nil
    ) -> MessageRelation {
        MessageRelation.legacy(
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            storyReference: storyReference,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            attachmentReplyTo: attachmentReplyTo
        )
    }

    @Test func legacy_nothing_isNone() {
        #expect(legacy() == .none)
    }

    @Test func legacy_replyOnly_isReply() {
        #expect(legacy(replyToId: "m1") == .reply(to: MessageID("m1"), citing: nil))
    }

    @Test func legacy_storyReply_carriesReference() {
        let reference = ReplyReference(authorName: "Ada", previewText: "story", isStoryReply: true)
        let relation = legacy(storyReplyToId: "s1", storyReference: reference)

        #expect(relation == .storyReply(to: StoryID("s1"), reference: reference))
        #expect(relation.replyToId == nil)
        #expect(relation.storyReplyToId == "s1")
        #expect(relation.storyReference == reference)
    }

    @Test func legacy_replyWithAnchor_keepsCitation() {
        let relation = legacy(replyToId: "m1", attachmentReplyTo: QuotedAttachmentSend(attachmentId: "a3"))

        #expect(relation == .reply(to: MessageID("m1"), citing: QuotedAttachmentSend(attachmentId: "a3")))
        #expect(relation.attachmentReplyTo?.attachmentId == "a3")
    }

    @Test func legacy_forward_mapsBothIds() {
        let relation = legacy(forwardedFromId: "m9", forwardedFromConversationId: "c9")

        #expect(relation.forwardedFromId == "m9")
        #expect(relation.forwardedFromConversationId == "c9")
        #expect(relation.replyToId == nil)
        #expect(relation.storyReplyToId == nil)
    }

    @Test func legacy_conflictingIds_prefersStoryThenReply() {
        let storyOverReply = legacy(replyToId: "m1", storyReplyToId: "s1", forwardedFromId: "m9")
        let replyOverForward = legacy(replyToId: "m1", forwardedFromId: "m9")

        #expect(storyOverReply.storyReplyToId == "s1")
        #expect(storyOverReply.replyToId == nil)
        #expect(replyOverForward.replyToId == "m1")
        #expect(replyOverForward.forwardedFromId == nil)
    }

    @Test func none_hasNoWireIds() {
        let relation = MessageRelation.none

        #expect(relation.replyToId == nil)
        #expect(relation.storyReplyToId == nil)
        #expect(relation.forwardedFromId == nil)
        #expect(relation.attachmentReplyTo == nil)
    }
}
