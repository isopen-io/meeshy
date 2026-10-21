import Foundation
import MeeshySDK

func outgoingMessage(
    content: String,
    conversationId: String,
    relation: MessageRelation = .none,
    attachmentIds: [String]? = nil,
    previews: [MeeshyMessageAttachment]? = nil,
    protection: MessageProtectionIntent? = nil,
    originalLanguage: String? = nil,
    reusedClientMessageId: MessageID? = nil,
    location: SharedPlace? = nil,
    sticker: MessageSticker? = nil
) -> OutgoingMessage {
    OutgoingMessage(
        conversationId: ConversationID(conversationId),
        content: content,
        relation: relation,
        attachments: OutgoingAttachments(ids: attachmentIds, previews: previews),
        protection: protection,
        originalLanguage: originalLanguage,
        reusedClientMessageId: reusedClientMessageId,
        location: location,
        sticker: sticker
    )
}
