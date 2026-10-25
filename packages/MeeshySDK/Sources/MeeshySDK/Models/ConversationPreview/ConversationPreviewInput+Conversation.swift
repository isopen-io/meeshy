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
/// son coffre local, avec ce que libsignal a AUTHENTIFIÉ de lui — la
/// conversation pour laquelle il a été écrit, son auteur, l'instant de sa
/// composition. Il n'emporte aucune traduction : le serveur ne lit pas ce
/// message, donc ne le traduit pas.
public struct ConversationPreviewDeviceText: Sendable, Hashable {
    /// L'auteur authentifié, dit comme la ligne le dit : le lecteur (« Vous »,
    /// que la ligne porte sans identifiant) ou un pair nommé.
    public enum Author: Sendable, Hashable {
        case reader
        case peer(userId: String)
    }

    /// L'écart toléré entre la composition authentifiée et l'heure servie du
    /// dernier message : l'E2EE n'a pas de file hors ligne, un message part à
    /// sa composition. Au-delà, la ligne pointe un AUTRE message (rejeu).
    public static let compositionTolerance: TimeInterval = 15 * 60

    public let messageId: String
    public let conversationId: String
    public let author: Author
    public let composedAt: Date
    public let text: String
    public let language: String?

    public init(
        messageId: String, conversationId: String, author: Author, composedAt: Date, text: String, language: String?
    ) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.author = author
        self.composedAt = composedAt
        self.text = text
        self.language = language
    }

    /// Le clair, s'il est à SA place sur cette ligne, telle qu'elle est
    /// MAINTENANT : relu à chaque rendu, jamais acquis une fois pour toutes.
    /// Même message, même conversation, même auteur, parole d'un membre (ni
    /// avis système, ni appel), un dernier message que le serveur scelle, une
    /// composition contemporaine de l'heure servie, et un texte qui dit
    /// quelque chose. Sinon `nil` : la ligne garde « Message chiffré ».
    public func reading(_ conversation: MeeshyConversation) -> ConversationPreviewDeviceText? {
        guard let lastId = conversation.lastMessageId, !lastId.isEmpty, lastId == messageId,
              conversation.id == conversationId,
              let nature = conversation.lastMessageNature, nature.isEncrypted,
              nature.messageType != "system", nature.systemEvent == nil, nature.callSummary == nil,
              speaks(for: conversation),
              abs(conversation.lastMessageAt.timeIntervalSince(composedAt)) <= Self.compositionTolerance,
              ConversationPreviewComposer.hasText(text)
        else { return nil }
        return self
    }

    private func speaks(for conversation: MeeshyConversation) -> Bool {
        switch author {
        case .reader:
            return conversation.lastMessageSenderUserId == nil
                && conversation.lastMessageSenderName == ConversationListAuthor.readerLabel
        case .peer(let userId):
            return conversation.lastMessageSenderUserId == userId
        }
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
        let device = readOnDevice?.reading(conversation)
        self.init(
            id: conversation.lastMessageId ?? "",
            senderName: conversation.lastMessageSenderName,
            content: device?.text.meeshyPreviewTruncated ?? conversation.lastMessagePreview,
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
