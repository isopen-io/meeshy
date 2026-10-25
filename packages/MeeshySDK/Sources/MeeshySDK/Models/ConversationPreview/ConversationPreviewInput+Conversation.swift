import Foundation

// La projection de la LIGNE telle que le client la tient (`MeeshyConversation`,
// écrite par le seul `LastMessageFacet`) vers l'entrée du composeur (#7548).
//
// Rien n'y est décidé : chaque champ est recopié tel quel, et la protection
// reste au composeur. Le texte d'un message protégé que la ligne aurait gardé
// d'un ancien cache arrive donc bien au composeur — qui le retient, par la
// même règle que pour le fil.

/// Le clair que CET appareil tient du dernier message d'une conversation
/// chiffrée de bout en bout (#12968) : ce qu'il a écrit ou déchiffré, lu dans
/// son coffre local. Il ne vaut que pour le message qu'il nomme, et n'emporte
/// aucune traduction : le serveur ne lit pas ce message, donc ne le traduit pas.
public struct ConversationPreviewDeviceText: Sendable, Hashable {
    public let messageId: String
    public let text: String
    public let language: String?

    public init(messageId: String, text: String, language: String?) {
        self.messageId = messageId
        self.text = text
        self.language = language
    }

    /// Le clair, s'il est celui de CE message et qu'il dit quelque chose.
    func reading(_ messageId: String?) -> ConversationPreviewDeviceText? {
        guard let messageId, !messageId.isEmpty, messageId == self.messageId,
              ConversationPreviewComposer.hasText(text) else { return nil }
        return self
    }
}

public extension ConversationPreviewMessage {
    /// `nil` quand la ligne ne tient AUCUN dernier message. `readOnDevice` :
    /// le clair local du dernier message (#12968) ; il remplace le scellé servi,
    /// jamais une autre protection (vue unique, flou, échéance), que le
    /// composeur continue d'honorer.
    init?(conversation: MeeshyConversation, readOnDevice: ConversationPreviewDeviceText? = nil) {
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
        let device = readOnDevice?.reading(conversation.lastMessageId)
        self.init(
            id: conversation.lastMessageId ?? "",
            senderName: conversation.lastMessageSenderName,
            content: device?.text ?? conversation.lastMessagePreview,
            originalLanguage: device.map { $0.language } ?? conversation.lastMessageOriginalLanguage,
            translations: device == nil ? conversation.lastMessageTranslations : nil,
            createdAt: conversation.lastMessageAt,
            messageType: nature?.messageType ?? (place != nil ? "location" : nil),
            effectFlags: nature?.effectFlags,
            ephemeralDuration: nature?.ephemeralDuration,
            expiresAt: conversation.lastMessageExpiresAt,
            isEncrypted: device == nil ? nature?.isEncrypted : false,
            isViewOnce: conversation.lastMessageIsViewOnce,
            isBlurred: conversation.lastMessageIsBlurred,
            isForwarded: nature?.isForwarded,
            systemEvent: nature?.systemEvent,
            callSummary: nature?.callSummary,
            sticker: nature?.sticker,
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
        draft: String? = nil,
        readOnDevice: ConversationPreviewDeviceText? = nil
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
            lastMessage: ConversationPreviewMessage(conversation: conversation, readOnDevice: readOnDevice),
            isDirect: conversation.type == .direct
        )
    }
}
