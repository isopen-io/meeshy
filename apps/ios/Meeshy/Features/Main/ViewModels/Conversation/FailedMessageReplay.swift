import Foundation
import MeeshySDK

/// Ce que le renvoi d'un message en échec rejoue : son contenu, sa langue
/// d'ORIGINE (le Prisme ne se réécrit pas à chaque retry), sa relation —
/// réponse ou transfert — et son lieu.
enum FailedMessageReplay {

    static func outgoing(of failed: Message, conversationId: String) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: failed.content,
            relation: .legacy(
                replyToId: failed.replyToId,
                storyReplyToId: nil,
                storyReference: nil,
                forwardedFromId: failed.forwardedFromId,
                forwardedFromConversationId: failed.forwardedFromConversationId,
                attachmentReplyTo: nil
            ),
            attachments: .none,
            originalLanguage: failed.originalLanguage,
            reusedClientMessageId: MessageID(failed.id),
            location: failed.location
        )
    }
}
