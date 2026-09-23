import Foundation

// La projection de la LIGNE telle que le client la tient (`MeeshyConversation`,
// écrite par le seul `LastMessageFacet`) vers l'entrée du composeur (#7548).
//
// Rien n'y est décidé : chaque champ est recopié tel quel, et la protection
// reste au composeur. Le texte d'un message protégé que la ligne aurait gardé
// d'un ancien cache arrive donc bien au composeur — qui le retient, par la
// même règle que pour le fil.

public extension ConversationPreviewMessage {
    /// `nil` quand la ligne ne tient AUCUN dernier message.
    init?(conversation: MeeshyConversation) {
        let nature = conversation.lastMessageNature
        let preview = conversation.lastMessagePreview ?? ""
        let attachments = conversation.lastMessageAttachments
        let holdsMessage = conversation.lastMessageId != nil
            || !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !attachments.isEmpty
            || conversation.lastMessageLocation != nil
            || nature.map { !$0.isEmpty } ?? false
        guard holdsMessage else { return nil }

        let place = conversation.lastMessageLocation
        self.init(
            id: conversation.lastMessageId ?? "",
            senderName: conversation.lastMessageSenderName,
            content: conversation.lastMessagePreview,
            originalLanguage: conversation.lastMessageOriginalLanguage,
            translations: conversation.lastMessageTranslations,
            createdAt: conversation.lastMessageAt,
            messageType: nature?.messageType ?? (place != nil ? "location" : nil),
            effectFlags: nature?.effectFlags,
            ephemeralDuration: nature?.ephemeralDuration,
            expiresAt: conversation.lastMessageExpiresAt,
            isEncrypted: nature?.isEncrypted,
            isViewOnce: conversation.lastMessageIsViewOnce,
            isBlurred: conversation.lastMessageIsBlurred,
            isForwarded: nature?.isForwarded,
            systemEvent: nature?.systemEvent,
            callSummary: nature?.callSummary,
            location: place.map { ConversationPreviewPlace(name: $0.name, address: $0.address) },
            attachment: attachments.first.map(ConversationPreviewAttachment.init(attachment:)),
            attachmentSummary: nature?.attachmentSummary
                ?? Self.summary(of: attachments, count: conversation.lastMessageAttachmentCount)
        )
    }

    /// Un résumé n'a de sens qu'au-delà d'une pièce : la première, seule, se
    /// décrit elle-même. La ligne peut en compter plus qu'elle n'en tient.
    private static func summary(of attachments: [MeeshyMessageAttachment], count: Int) -> LastMessageAttachmentSummary? {
        let total = max(count, attachments.count)
        guard total > 1, let known = LastMessageAttachmentSummary(attachments: attachments) else { return nil }
        return LastMessageAttachmentSummary(count: total, kinds: known.kinds, totalSize: known.totalSize)
    }
}

public extension ConversationPreviewAttachment {
    init(attachment: MeeshyMessageAttachment) {
        let positive = { (value: Int?) -> Double? in value.flatMap { $0 > 0 ? Double($0) : nil } }
        self.init(
            mimeType: attachment.mimeType,
            originalName: attachment.originalName,
            fileSize: positive(attachment.fileSize),
            duration: positive(attachment.duration),
            width: positive(attachment.width),
            height: positive(attachment.height),
            pageCount: positive(attachment.pageCount),
            isViewOnce: attachment.isViewOnce,
            isBlurred: attachment.isBlurred,
            effectFlags: attachment.effectFlags.map { Int($0) }
        )
    }
}

public extension ConversationPreviewInput {
    /// L'entrée d'une ligne de liste. `typing` et `draft` viennent de l'app,
    /// qui seule sait qui écrit et ce qui attend dans le composeur.
    init(
        conversation: MeeshyConversation,
        viewerId: String,
        language: String,
        preferredLanguages: [String],
        now: Date,
        receivedAt: Date? = nil,
        typing: [String]? = nil,
        draft: String? = nil
    ) {
        self.init(
            viewerId: viewerId,
            language: language,
            preferredLanguages: preferredLanguages,
            now: now,
            receivedAt: receivedAt,
            activeCall: conversation.activeCall,
            typing: typing,
            draft: draft,
            lastReaction: conversation.lastReaction,
            lastMessage: ConversationPreviewMessage(conversation: conversation)
        )
    }
}
