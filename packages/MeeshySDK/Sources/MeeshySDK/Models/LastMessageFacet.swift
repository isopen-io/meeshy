import Foundation

/// Facette « dernier message » d'une ligne de liste de conversations.
///
/// Les onze champs `lastMessage*` de `MeeshyConversation` décrivent UN seul
/// message. Les écrire séparément est la source d'une classe de bugs entière :
/// un chemin temps réel qui pose le texte et l'horodatage sans toucher au reste
/// laisse la ligne décrire un MÉLANGE de deux messages — l'auteur de l'ancien,
/// l'icône de pièce jointe de l'ancien, et « Vue unique » collé sur un texte
/// tout neuf parce que le message précédent l'était.
///
/// Cette facette rend l'écriture atomique : `applyLastMessage` remplace les onze
/// champs d'un coup. Un chemin qui ignore un champ ne peut plus exister — au
/// pire il passe `nil`/`false`, ce qui décrit une ligne INCOMPLÈTE (corrigée à
/// la prochaine synchro) plutôt qu'une ligne FAUSSE (jamais corrigée, parce que
/// rien ne signale l'incohérence).
/// Pas d'`Equatable` : `MeeshyMessageAttachment` ne l'est pas, et le synthétiser
/// en comparant les pièces jointes par leur seul identifiant serait un `==`
/// menteur — deux facettes « égales » alors qu'une transcription ou une
/// vignette diffère.
public struct LastMessageFacet: Sendable {
    public let id: String?
    public let preview: String?
    public let senderName: String?
    public let at: Date
    public let attachments: [MeeshyMessageAttachment]
    public let attachmentCount: Int
    public let isBlurred: Bool
    public let isViewOnce: Bool
    public let expiresAt: Date?
    public let translations: [String: String]?
    public let originalLanguage: String?
    /// Position du message (message géolocalisé). Membre de la facette pour la
    /// même raison que les autres : écrite à part, une pastille du message
    /// PRÉCÉDENT survivrait au texte tout neuf qui la remplace.
    public let location: SharedPlace?

    public init(
        id: String?,
        preview: String?,
        senderName: String?,
        at: Date,
        attachments: [MeeshyMessageAttachment] = [],
        attachmentCount: Int = 0,
        isBlurred: Bool = false,
        isViewOnce: Bool = false,
        expiresAt: Date? = nil,
        translations: [String: String]? = nil,
        originalLanguage: String? = nil,
        location: SharedPlace? = nil
    ) {
        self.id = id
        self.preview = preview
        self.senderName = senderName
        self.at = at
        self.attachments = attachments
        self.attachmentCount = max(attachmentCount, attachments.count)
        self.isBlurred = isBlurred
        self.isViewOnce = isViewOnce
        self.expiresAt = expiresAt
        self.translations = (translations?.isEmpty ?? true) ? nil : translations
        self.originalLanguage = originalLanguage
        self.location = location
    }

    /// Facette complète dérivée d'un message reçu ou envoyé — le chemin normal.
    ///
    /// - Parameter preview: texte à afficher. Distinct de `message.content` pour
    ///   les messages sans texte (photo, vocal), où l'appelant fournit le libellé
    ///   média localisé plutôt qu'une ligne vide.
    /// - Parameter translations: `[langue: contenu]` déjà résolues, pour que le
    ///   Prisme s'applique à la ligne sans attendre la synchro suivante. Le
    ///   chemin REST n'en dépend plus : `GET /conversations` expédie désormais
    ///   `lastMessageTranslations`, déjà restreint aux langues du prisme du
    ///   lecteur, que `APIConversation.toConversation` pose directement sur la
    ///   ligne. Ce paramètre reste la source du chemin SOCKET, où les
    ///   traductions arrivent avec (ou après) le `message:new`.
    /// - Parameters id, at: identité SERVEUR, quand elle diffère de celle de la
    ///   ligne locale — à l'accusé d'envoi, le message optimiste porte encore son
    ///   `cid_…` et l'horodatage de l'appareil.
    public init(
        message: MeeshyMessage,
        preview: String,
        id: String? = nil,
        at: Date? = nil,
        translations: [String: String]? = nil
    ) {
        self.init(
            id: id ?? message.id,
            preview: preview.meeshyPreviewTruncated,
            senderName: message.senderName ?? message.senderUsername,
            at: at ?? message.createdAt,
            attachments: message.attachments,
            attachmentCount: message.attachments.count,
            isBlurred: message.isBlurred,
            isViewOnce: message.isViewOnce,
            expiresAt: message.expiresAt,
            translations: translations,
            originalLanguage: message.originalLanguage,
            location: message.location
        )
    }

    /// Facette NEUTRE : « un message est arrivé à cet instant, je ne sais rien
    /// d'autre de lui ». Utilisée par les chemins qui ne transportent pas le
    /// message (notification push, `conversation:updated` sans corps).
    ///
    /// Volontairement vide plutôt que partielle : conserver les champs du
    /// message PRÉCÉDENT afficherait un auteur faux, une pièce jointe fantôme ou
    /// « Vue unique » sur un texte neuf. Une ligne momentanément dépouillée est
    /// corrigée au prochain sync ; une ligne fausse ne l'est pas.
    public static func bumped(at date: Date, id: String? = nil, preview: String? = nil,
                              location: SharedPlace? = nil) -> LastMessageFacet {
        LastMessageFacet(
            id: id,
            preview: preview?.meeshyPreviewTruncated,
            senderName: nil,
            at: date,
            location: location
        )
    }
}

public extension MeeshyConversation {
    /// Remplace EN BLOC les champs `lastMessage*`. Voir `LastMessageFacet` pour
    /// la raison pour laquelle aucun appelant ne doit écrire ces champs un à un.
    mutating func applyLastMessage(_ facet: LastMessageFacet) {
        lastMessageId = facet.id
        lastMessagePreview = facet.preview
        lastMessageSenderName = facet.senderName
        lastMessageAt = facet.at
        lastMessageAttachments = facet.attachments
        lastMessageAttachmentCount = facet.attachmentCount
        lastMessageIsBlurred = facet.isBlurred
        lastMessageIsViewOnce = facet.isViewOnce
        lastMessageExpiresAt = facet.expiresAt
        lastMessageTranslations = facet.translations
        lastMessageOriginalLanguage = facet.originalLanguage
        lastMessageLocation = facet.location
    }

    /// Fait décrire à la ligne un AUTRE message que celui qu'elle décrivait.
    ///
    /// Les chemins qui TRANSPORTENT le message écrivent la facette entière
    /// (`applyLastMessage`). Restent ceux qui n'en portent qu'une part :
    /// `conversation:updated` recalculé par le serveur (suppression pour tous du
    /// dernier message, masquage personnel d'un lecteur) nomme un AUTRE message
    /// et n'en donne que l'identité, le texte et le Prisme —
    /// `emitConversationPreviewUpdate` ne lit ni les pièces jointes, ni
    /// l'expéditeur, ni les drapeaux éphémères. Appliqués champ par champ, ces
    /// payloads laissent la ligne mélanger DEUX messages : le texte du nouveau,
    /// l'auteur, la pièce jointe, « Vue unique » et l'expiration de l'ancien —
    /// exactement la classe de défauts que `LastMessageFacet` existe pour
    /// rendre impossible, revenue par la seule porte qui ne passait pas par
    /// elle.
    ///
    /// Ce geste remet donc à neutre TOUT ce qui décrit le message, à charge
    /// pour l'appelant de reposer aussitôt ce que le payload porte vraiment.
    /// Une ligne momentanément dépouillée est corrigée à la synchro suivante ;
    /// une ligne FAUSSE ne l'est jamais, puisque rien ne signale l'incohérence
    /// — même arbitrage que `LastMessageFacet.bumped`.
    ///
    /// `lastMessageAt` ne bouge délibérément pas : il porte le RANG de la ligne,
    /// tenu par les règles de monotonie de l'appelant, jamais par l'identité.
    ///
    /// Rend `false` quand la ligne décrivait DÉJÀ ce message — c'est le cas de
    /// l'édition et de la traduction, où l'auteur, les pièces jointes et les
    /// drapeaux restent vrais et doivent survivre au payload qui les tait.
    @discardableResult
    mutating func adoptLastMessage(id: String) -> Bool {
        guard lastMessageId != id else { return false }
        lastMessageId = id
        lastMessagePreview = nil
        lastMessageTranslations = nil
        lastMessageOriginalLanguage = nil
        lastMessageAttachments = []
        lastMessageAttachmentCount = 0
        lastMessageSenderName = nil
        lastMessageIsBlurred = false
        lastMessageIsViewOnce = false
        lastMessageExpiresAt = nil
        lastMessageLocation = nil
        return true
    }
}
