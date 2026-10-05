import Foundation

/// **LA CITATION SUIT LE PAIR RENOMMÉ** (#9371) — la loi `repainted(_:)`
/// portée aux deux copies d'auteur qu'un message EMPORTE : la citation
/// (`ReplyReference`) et la référence de transfert (`ForwardReference`).
///
/// - Elles s'apparient par l'id GRAVÉ à la réception (`authorUserId`,
///   `senderUserId`), jamais par le nom : une copie gravée avant #9371 n'en a
///   pas et garde son nom — un homonyme porterait le même.
/// - Ce sont des copies d'EXPÉDITEUR : nom COMPOSÉ, couleur recalculée depuis
///   lui (comme la bulle), portrait tri-état.
/// - `isMe` ne bouge jamais : renommer quelqu'un ne change pas qui il est.
extension UserUpdatedEvent {

    public func repainted(_ quote: ReplyReference) -> ReplyReference? {
        guard quote.authorUserId == userId else { return nil }
        var repainted = quote
        if let name = composedName {
            repainted.authorName = name
            repainted.authorColor = DynamicColorGenerator.colorForName(name)
        }
        repainted.authorAvatarUrl = avatar.applied(to: quote.authorAvatarUrl)
        return repainted == quote ? nil : repainted
    }

    public func repainted(_ forward: ForwardReference) -> ForwardReference? {
        guard forward.senderUserId == userId else { return nil }
        let name = composedName ?? forward.senderName
        let photo = avatar.applied(to: forward.senderAvatar)
        guard name != forward.senderName || photo != forward.senderAvatar else { return nil }
        return ForwardReference(
            originalMessageId: forward.originalMessageId, senderName: name, senderAvatar: photo,
            previewText: forward.previewText, conversationId: forward.conversationId,
            conversationName: forward.conversationName, attachmentType: forward.attachmentType,
            attachmentThumbnailUrl: forward.attachmentThumbnailUrl,
            conversationType: forward.conversationType, senderUserId: forward.senderUserId
        )
    }

    /// Le message ENTIER : son expéditeur, sa citation et sa référence de
    /// transfert, chacun par sa loi. `nil` quand aucun ne désigne le pair.
    public func repaintedWithQuotes(_ message: MeeshyMessage) -> MeeshyMessage? {
        let sender = repainted(message)
        var next = sender ?? message
        let quote = message.replyTo.flatMap(repainted)
        let forward = message.forwardedFrom.flatMap(repainted)
        next.replyTo = quote ?? next.replyTo
        next.forwardedFrom = forward ?? next.forwardedFrom
        return sender == nil && quote == nil && forward == nil ? nil : next
    }
}
