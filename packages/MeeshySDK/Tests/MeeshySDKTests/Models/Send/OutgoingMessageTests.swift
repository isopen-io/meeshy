import Foundation
import Testing
@testable import MeeshySDK

struct OutgoingMessageTests {

    private func makeMessage(
        content: String = "Salut",
        attachments: OutgoingAttachments = OutgoingAttachments(ids: nil, previews: nil)
    ) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID("c1"),
            content: content,
            relation: .none,
            attachments: attachments
        )
    }

    private func preview(id: String, mimeType: String = "image/png") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: mimeType)
    }

    @Test func text_trimsWhitespace_contentStaysRaw() {
        let message = makeMessage(content: "  Salut \n")

        #expect(message.text == "Salut")
        #expect(message.content == "  Salut \n")
    }

    @Test func equality_comparesAttachmentIdsNotPayload() {
        let a = OutgoingAttachments(ids: ["a1"], previews: [preview(id: "p1")])
        let sameIdAndKind = OutgoingAttachments(ids: ["a1"], previews: [preview(id: "p1")])
        let otherId = OutgoingAttachments(ids: ["a1"], previews: [preview(id: "p2")])
        let otherKind = OutgoingAttachments(ids: ["a1"], previews: [preview(id: "p1", mimeType: "video/mp4")])

        #expect(a == sameIdAndKind)
        #expect(a != otherId)
        #expect(a != otherKind)
    }

    @Test func attachmentIds_nilAndEmpty_areDistinct() {
        #expect(OutgoingAttachments(ids: nil, previews: nil) != OutgoingAttachments(ids: [], previews: nil))
    }

    @Test func messages_withDifferentRelations_areDistinct() {
        let plain = makeMessage()
        let reply = OutgoingMessage(
            conversationId: ConversationID("c1"),
            content: "Salut",
            relation: .reply(to: MessageID("m1"), citing: nil),
            attachments: OutgoingAttachments(ids: nil, previews: nil)
        )

        #expect(plain != reply)
        #expect(plain == makeMessage())
    }
}
