import Foundation

/// Ce qu'un message envoyé RELIE à un autre contenu — exclusivement : une
/// réponse, une réponse à une story, un transfert, ou rien.
///
/// Les anciens paramètres de `sendMessage` (`replyToId`, `storyReplyToId`,
/// `forwardedFromId`…) laissaient représenter des combinaisons que le serveur
/// ne comprend pas ; l'énumération les rend irreprésentables. Les accesseurs
/// `wire` rendent les chaînes que les transports attendent.
public enum MessageRelation: Equatable, Sendable {
    case none
    case reply(to: MessageID, citing: QuotedAttachmentSend?)
    case storyReply(to: StoryID, reference: ReplyReference?)
    case forward(of: MessageID, from: ConversationID?)

    public var replyToId: String? {
        guard case .reply(let id, _) = self else { return nil }
        return id.rawValue
    }

    public var storyReplyToId: String? {
        guard case .storyReply(let id, _) = self else { return nil }
        return id.rawValue
    }

    public var storyReference: ReplyReference? {
        guard case .storyReply(_, let reference) = self else { return nil }
        return reference
    }

    public var forwardedFromId: String? {
        guard case .forward(let id, _) = self else { return nil }
        return id.rawValue
    }

    public var forwardedFromConversationId: String? {
        guard case .forward(_, let conversationId) = self else { return nil }
        return conversationId?.rawValue
    }

    public var attachmentReplyTo: QuotedAttachmentSend? {
        guard case .reply(_, let citing) = self else { return nil }
        return citing
    }

    /// La relation déduite des anciens paramètres. Préséance en cas de
    /// combinaison (qu'aucun appelant ne produit) : story, puis réponse, puis
    /// transfert.
    public static func legacy(
        replyToId: String?,
        storyReplyToId: String?,
        storyReference: ReplyReference?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        attachmentReplyTo: QuotedAttachmentSend?
    ) -> MessageRelation {
        if let storyReplyToId {
            return .storyReply(to: StoryID(storyReplyToId), reference: storyReference)
        }
        if let replyToId {
            return .reply(to: MessageID(replyToId), citing: attachmentReplyTo)
        }
        if let forwardedFromId {
            return .forward(of: MessageID(forwardedFromId), from: forwardedFromConversationId.map { ConversationID($0) })
        }
        return .none
    }
}
