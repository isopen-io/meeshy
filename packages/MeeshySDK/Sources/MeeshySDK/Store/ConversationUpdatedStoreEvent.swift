import Foundation

/// Store-owned input for `applyConversationUpdated`. Carries the fields
/// the store cares about from the `conversation:updated` socket event.
/// Both the message-driven path (bump-to-top: `lastMessageAt`,
/// `lastMessageId`, `lastMessagePreview`) and the metadata-driven path
/// (rename, avatar, etc.) share this type — unset fields are `nil` and
/// skipped during application.
public struct ConversationUpdatedStoreEvent: Sendable, Hashable {
    public let conversationId: String
    public let lastMessageAt: Date?
    /// Identité du dernier message. Tri-état — voir `LastMessageIdentity` :
    /// `.unchanged` (clé absente) et `.replaced(nil)` (« plus aucun message
    /// visible pour ce lecteur ») ne sont pas le même ordre.
    public let lastMessage: LastMessageIdentity
    public let lastMessagePreview: String?
    /// L'AUTEUR du dernier message, et de quoi décider comment le nommer
    /// (#6921). Tri-état pour la même raison que les deux voisins : `.unchanged`
    /// (clé absente) ne doit pas effacer, `.replaced(nil)` le doit.
    public let lastMessageSenderName: LastMessageSenderName
    /// L'émetteur, pour le repli « nom du pair » d'un direct quand l'événement
    /// ne porte pas de nom.
    public let senderId: String?
    /// **Qui LIT.** Ce store est, par construction, le cache des conversations
    /// d'UN utilisateur : le préfixe d'auteur dépend de lui (« Toi » plutôt que
    /// mon propre nom d'affichage), et le lui cacher obligerait à trancher
    /// ailleurs, donc à tenir deux règles. Vide tant que l'authentification
    /// n'est pas résolue — le résolveur l'écarte alors.
    public let readerId: String?
    /// Le mot qui désigne le lecteur, déjà localisé — le SDK ne lit pas le
    /// catalogue de l'app.
    public let youLabel: String
    /// Prisme de la ligne de liste. Tri-état — voir
    /// `LastMessagePreviewTranslations` : `.unchanged` (clé absente) et
    /// `.replaced([:])` (carte périmée par le serveur) ne sont PAS le même
    /// ordre, et c'est la seule façon de rendre une édition applicable.
    public let lastMessageTranslations: LastMessagePreviewTranslations
    public let lastMessageOriginalLanguage: String?
    /// Épingle du dernier message, quand il en porte une. Membre du groupe
    /// d'aperçu au même titre que le texte et le Prisme : un message
    /// position-seule a un `lastMessagePreview` VIDE, donc c'est le seul champ
    /// dont la ligne dispose pour composer son libellé.
    ///
    /// Les trois émetteurs du payload la hissent depuis `metadata.location` du
    /// message NOMMÉ par `lastMessage` — jamais du message précédent. Elle
    /// s'applique donc avec l'identité, et jamais seule.
    public let location: SharedPlace?
    /// Le serveur a RECALCULÉ cet aperçu depuis sa base, au lieu de pousser le
    /// message qu'on vient d'écrire. Seul cas où le groupe d'aperçu a le droit
    /// de RECULER dans le temps — voir `merging(_:with:)`.
    public let previewRecalculated: Bool
    public let title: String?
    public let avatar: String?
    public let description: String?
    public let banner: String?
    public let isAnnouncementChannel: Bool?
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    /// Sous-groupe média du message NOMMÉ (#7548) — `nil` : clé absente.
    public let media: LastMessageMediaGroup?
    /// Sous-groupe nature (#7545) du message nommé — `nil` : rien sur le fil.
    public let nature: LastMessageNature?
    public let lastReaction: PreviewFieldUpdate<ConversationLastReaction>
    public let activeCall: PreviewFieldUpdate<ConversationActiveCall>

    public init(
        conversationId: String,
        lastMessageAt: Date? = nil,
        lastMessage: LastMessageIdentity = .unchanged,
        lastMessagePreview: String? = nil,
        lastMessageSenderName: LastMessageSenderName = .unchanged,
        senderId: String? = nil,
        readerId: String? = nil,
        youLabel: String = "",
        lastMessageTranslations: LastMessagePreviewTranslations = .unchanged,
        lastMessageOriginalLanguage: String? = nil,
        location: SharedPlace? = nil,
        previewRecalculated: Bool = false,
        title: String? = nil,
        avatar: String? = nil,
        description: String? = nil,
        banner: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        defaultWriteRole: String? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil,
        media: LastMessageMediaGroup? = nil,
        nature: LastMessageNature? = nil,
        lastReaction: PreviewFieldUpdate<ConversationLastReaction> = .unchanged,
        activeCall: PreviewFieldUpdate<ConversationActiveCall> = .unchanged
    ) {
        self.conversationId = conversationId
        self.lastMessageAt = lastMessageAt
        self.lastMessage = lastMessage
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageSenderName = lastMessageSenderName
        self.senderId = senderId
        self.readerId = readerId
        self.youLabel = youLabel
        self.lastMessageTranslations = lastMessageTranslations
        self.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        self.location = location
        self.previewRecalculated = previewRecalculated
        self.title = title
        self.avatar = avatar
        self.description = description
        self.banner = banner
        self.isAnnouncementChannel = isAnnouncementChannel
        self.defaultWriteRole = defaultWriteRole
        self.slowModeSeconds = slowModeSeconds
        self.autoTranslateEnabled = autoTranslateEnabled
        self.media = media
        self.nature = nature
        self.lastReaction = lastReaction
        self.activeCall = activeCall
    }
}

/// Le sous-groupe MÉDIA d'un `conversation:updated` : les pièces jointes et les
/// drapeaux du message nommé.
///
/// Son égalité compare les champs que le FIL porte pour chaque pièce jointe
/// (identité, type, taille, durée, dimensions, pages, vignette, nom) — tout ce
/// qu'il sait d'elles, donc une égalité honnête, pas une comparaison par le
/// seul identifiant qui dirait « égales » deux pièces à la vignette différente.
public struct LastMessageMediaGroup: Sendable, Hashable {
    public let attachments: [MeeshyMessageAttachment]
    public let attachmentCount: Int
    public let isBlurred: Bool
    public let isViewOnce: Bool
    public let expiresAt: Date?

    public init(attachments: [MeeshyMessageAttachment], attachmentCount: Int? = nil,
                isBlurred: Bool = false, isViewOnce: Bool = false, expiresAt: Date? = nil) {
        self.attachments = attachments
        self.attachmentCount = max(attachmentCount ?? 0, attachments.count)
        self.isBlurred = isBlurred
        self.isViewOnce = isViewOnce
        self.expiresAt = expiresAt
    }

    private struct WireAttachment: Hashable {
        let id: String
        let mimeType: String
        let fileSize: Int
        let duration: Int?
        let width: Int?
        let height: Int?
        let pageCount: Int?
        let thumbnailUrl: String?
        let originalName: String

        init(_ attachment: MeeshyMessageAttachment) {
            id = attachment.id
            mimeType = attachment.mimeType
            fileSize = attachment.fileSize
            duration = attachment.duration
            width = attachment.width
            height = attachment.height
            pageCount = attachment.pageCount
            thumbnailUrl = attachment.thumbnailUrl
            originalName = attachment.originalName
        }
    }

    public static func == (lhs: LastMessageMediaGroup, rhs: LastMessageMediaGroup) -> Bool {
        lhs.attachmentCount == rhs.attachmentCount
            && lhs.isBlurred == rhs.isBlurred
            && lhs.isViewOnce == rhs.isViewOnce
            && lhs.expiresAt == rhs.expiresAt
            && lhs.attachments.map(WireAttachment.init) == rhs.attachments.map(WireAttachment.init)
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(attachmentCount)
        hasher.combine(isBlurred)
        hasher.combine(isViewOnce)
        hasher.combine(expiresAt)
        hasher.combine(attachments.map(WireAttachment.init))
    }
}
