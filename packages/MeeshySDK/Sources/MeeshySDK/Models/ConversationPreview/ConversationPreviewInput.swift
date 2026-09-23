import Foundation

// L'ENTRÉE du composeur de la ligne d'aperçu — miroir de
// `ConversationPreviewInput` (`packages/shared/utils/conversation-preview.ts`).
// Les noms de champs sont ceux du TS, clé pour clé : c'est ce qui permet au
// fichier de cas commun (`packages/shared/fixtures/conversation-preview-cases.json`)
// d'être décodé tel quel par le test du SDK.

/// La première pièce jointe, avec ses détails TELS QU'ILS EXISTENT — chacun
/// n'apparaît dans la ligne que s'il est renseigné. `duration` est en
/// MILLISECONDES, comme `MessageAttachment.duration`.
public struct ConversationPreviewAttachment: Sendable, Hashable, Decodable {
    public let mimeType: String?
    public let originalName: String?
    public let fileSize: Double?
    public let duration: Double?
    public let width: Double?
    public let height: Double?
    public let pageCount: Double?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
    public let effectFlags: Int?
    /// Texte alternatif (`MessageAttachment.alt`). Pour un sticker de texte,
    /// c'est la phrase tapée, dessinée dans l'image (décision porteur 2026-09-23).
    public let alt: String?

    public init(mimeType: String? = nil, originalName: String? = nil, fileSize: Double? = nil,
                duration: Double? = nil, width: Double? = nil, height: Double? = nil,
                pageCount: Double? = nil, isViewOnce: Bool? = nil, isBlurred: Bool? = nil,
                effectFlags: Int? = nil, alt: String? = nil) {
        self.mimeType = mimeType
        self.originalName = originalName
        self.fileSize = fileSize
        self.duration = duration
        self.width = width
        self.height = height
        self.pageCount = pageCount
        self.isViewOnce = isViewOnce
        self.isBlurred = isBlurred
        self.effectFlags = effectFlags
        self.alt = alt
    }
}

/// Le sticker hissé de `metadata.sticker` : sa PRÉSENCE fait du message un
/// sticker, quel que soit son `messageType`.
public struct ConversationPreviewSticker: Sendable, Hashable, Decodable {
    public let templateId: String?
    public let emoji: String?

    public init(templateId: String? = nil, emoji: String? = nil) {
        self.templateId = templateId
        self.emoji = emoji
    }
}

/// Un lieu partagé, tel que la ligne le nomme.
public struct ConversationPreviewPlace: Sendable, Hashable, Decodable {
    public let name: String?
    public let address: String?

    public init(name: String? = nil, address: String? = nil) {
        self.name = name
        self.address = address
    }
}

/// Le dernier message tel que le client le tient — projection de
/// `lastMessage` (REST) ou des clés plates de `conversation:updated`.
public struct ConversationPreviewMessage: Sendable, Hashable, Decodable {
    public let id: String
    /// `Participant.id` ou `User.id` de l'expéditeur — l'un des deux suffit à
    /// reconnaître « Vous ».
    public let senderId: String?
    public let senderUserId: String?
    public let senderName: String?
    public let content: String?
    public let originalLanguage: String?
    public let translations: [String: String]?
    public let createdAt: Date
    public let messageType: String?
    public let effectFlags: Int?
    public let ephemeralDuration: Int?
    /// L'échéance SERVIE à ce lecteur (#7451).
    public let expiresAt: Date?
    public let isEncrypted: Bool?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
    /// Le lecteur a déjà ouvert ce message à vue unique.
    public let viewOnceConsumed: Bool?
    public let isForwarded: Bool?
    public let systemEvent: LastMessageSystemEvent?
    public let callSummary: LastMessageCallSummary?
    public let sticker: ConversationPreviewSticker?
    public let location: ConversationPreviewPlace?
    public let attachment: ConversationPreviewAttachment?
    public let attachmentSummary: LastMessageAttachmentSummary?

    public init(
        id: String,
        senderId: String? = nil,
        senderUserId: String? = nil,
        senderName: String? = nil,
        content: String? = nil,
        originalLanguage: String? = nil,
        translations: [String: String]? = nil,
        createdAt: Date,
        messageType: String? = nil,
        effectFlags: Int? = nil,
        ephemeralDuration: Int? = nil,
        expiresAt: Date? = nil,
        isEncrypted: Bool? = nil,
        isViewOnce: Bool? = nil,
        isBlurred: Bool? = nil,
        viewOnceConsumed: Bool? = nil,
        isForwarded: Bool? = nil,
        systemEvent: LastMessageSystemEvent? = nil,
        callSummary: LastMessageCallSummary? = nil,
        sticker: ConversationPreviewSticker? = nil,
        location: ConversationPreviewPlace? = nil,
        attachment: ConversationPreviewAttachment? = nil,
        attachmentSummary: LastMessageAttachmentSummary? = nil
    ) {
        self.id = id
        self.senderId = senderId
        self.senderUserId = senderUserId
        self.senderName = senderName
        self.content = content
        self.originalLanguage = originalLanguage
        self.translations = translations
        self.createdAt = createdAt
        self.messageType = messageType
        self.effectFlags = effectFlags
        self.ephemeralDuration = ephemeralDuration
        self.expiresAt = expiresAt
        self.isEncrypted = isEncrypted
        self.isViewOnce = isViewOnce
        self.isBlurred = isBlurred
        self.viewOnceConsumed = viewOnceConsumed
        self.isForwarded = isForwarded
        self.systemEvent = systemEvent
        self.callSummary = callSummary
        self.sticker = sticker
        self.location = location
        self.attachment = attachment
        self.attachmentSummary = attachmentSummary
    }
}

public struct ConversationPreviewInput: Sendable, Hashable, Decodable {
    /// `User.id` du lecteur.
    public let viewerId: String
    /// Langue de CADRAGE : celle des libellés.
    public let language: String
    /// Le prisme du lecteur, dans l'ordre (`ReaderPrism`).
    public let preferredLanguages: [String]
    public let now: Date
    /// Première réception locale du dernier message — le départ du décompte
    /// d'un éphémère (#7451).
    public let receivedAt: Date?
    public let activeCall: ConversationActiveCall?
    /// Noms des personnes qui écrivent, lecteur exclu.
    public let typing: [String]?
    public let draft: String?
    public let lastReaction: ConversationLastReaction?
    public let lastMessage: ConversationPreviewMessage?

    public init(
        viewerId: String,
        language: String,
        preferredLanguages: [String],
        now: Date,
        receivedAt: Date? = nil,
        activeCall: ConversationActiveCall? = nil,
        typing: [String]? = nil,
        draft: String? = nil,
        lastReaction: ConversationLastReaction? = nil,
        lastMessage: ConversationPreviewMessage? = nil
    ) {
        self.viewerId = viewerId
        self.language = language
        self.preferredLanguages = preferredLanguages
        self.now = now
        self.receivedAt = receivedAt
        self.activeCall = activeCall
        self.typing = typing
        self.draft = draft
        self.lastReaction = lastReaction
        self.lastMessage = lastMessage
    }
}
