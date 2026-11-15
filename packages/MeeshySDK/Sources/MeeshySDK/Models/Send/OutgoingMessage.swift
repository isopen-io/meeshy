import Foundation

/// Les pièces jointes d'un envoi. `ids` garde son optionnalité : `nil` et `[]`
/// ne s'encodent pas pareil sur le fil. `previews` sert la bulle optimiste.
///
/// `MeeshyMessageAttachment` n'est pas `Equatable` : l'égalité porte sur les
/// identifiants et les genres, jamais sur la charge.
public struct OutgoingAttachments: Equatable, Sendable {
    public let ids: [String]?
    public let previews: [MeeshyMessageAttachment]?

    public init(ids: [String]?, previews: [MeeshyMessageAttachment]?) {
        self.ids = ids
        self.previews = previews
    }

    public static func == (lhs: OutgoingAttachments, rhs: OutgoingAttachments) -> Bool {
        lhs.ids == rhs.ids && lhs.signature == rhs.signature
    }

    private var signature: [String]? {
        previews?.map { "\($0.id)|\($0.kind.rawValue)" }
    }
}

/// Un message prêt à partir, avant tout transport : une VALEUR, donc testable
/// sans modèle de vue.
public struct OutgoingMessage: Equatable, Sendable {
    public let conversationId: ConversationID
    /// Le texte brut : la langue de composition se détecte sur lui, non rogné.
    public let content: String
    public let relation: MessageRelation
    public let attachments: OutgoingAttachments
    public let protection: MessageProtectionIntent?
    public let originalLanguage: String?
    public let reusedClientMessageId: MessageID?
    public let location: SharedPlace?
    public let sticker: MessageSticker?

    public init(
        conversationId: ConversationID,
        content: String,
        relation: MessageRelation,
        attachments: OutgoingAttachments,
        protection: MessageProtectionIntent? = nil,
        originalLanguage: String? = nil,
        reusedClientMessageId: MessageID? = nil,
        location: SharedPlace? = nil,
        sticker: MessageSticker? = nil
    ) {
        self.conversationId = conversationId
        self.content = content
        self.relation = relation
        self.attachments = attachments
        self.protection = protection
        self.originalLanguage = originalLanguage
        self.reusedClientMessageId = reusedClientMessageId
        self.location = location
        self.sticker = sticker
    }

    public var text: String {
        content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
