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
    /// Nature du message (#7545) — type, effets, chiffrement, transfert,
    /// appel, événement système, résumé des pièces jointes.
    public let nature: LastMessageNature?

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
        location: SharedPlace? = nil,
        nature: LastMessageNature? = nil
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
        self.nature = (nature?.isEmpty ?? true) ? nil : nature
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
    /// - Parameter youLabel: le mot qui désigne le LECTEUR quand le message est
    ///   le sien. « Vous » vaut sur TOUS les chemins (#7548) : REST,
    ///   `conversation:updated`, `message:new`, envoi optimiste et accusé —
    ///   jamais le nom d'affichage du lecteur sur l'un et « Vous » sur l'autre.
    public init(
        message: MeeshyMessage,
        preview: String,
        id: String? = nil,
        at: Date? = nil,
        translations: [String: String]? = nil,
        youLabel: String = ConversationListAuthor.readerLabel
    ) {
        self.init(
            id: id ?? message.id,
            preview: preview.meeshyPreviewTruncated,
            senderName: message.isMe ? youLabel : (message.senderName ?? message.senderUsername),
            at: at ?? message.createdAt,
            attachments: message.attachments,
            attachmentCount: message.attachments.count,
            isBlurred: message.isBlurred,
            isViewOnce: message.isViewOnce,
            expiresAt: message.expiresAt,
            translations: translations,
            originalLanguage: message.originalLanguage,
            location: message.location,
            nature: LastMessageNature(message: message)
        )
    }

    /// Facette de MON envoi, avant tout écho serveur (#7548).
    ///
    /// L'aperçu ne porte que la LÉGENDE : un média sans texte n'y écrit plus
    /// de libellé (« 📷 Photo ») figé dans la langue de l'expéditeur au moment
    /// de l'envoi. La ligne rend ce libellé depuis la NATURE du message — les
    /// pièces jointes et la position voyagent dans la facette —, donc dans la
    /// langue du lecteur, et de la même façon que pour un média reçu.
    public static func sent(
        id: String,
        text: String,
        at date: Date,
        attachments: [MeeshyMessageAttachment] = [],
        isBlurred: Bool = false,
        isViewOnce: Bool = false,
        expiresAt: Date? = nil,
        originalLanguage: String? = nil,
        location: SharedPlace? = nil,
        youLabel: String = ConversationListAuthor.readerLabel
    ) -> LastMessageFacet {
        LastMessageFacet(
            id: id,
            preview: text.meeshyPreviewTruncated,
            senderName: youLabel,
            at: date,
            attachments: attachments,
            attachmentCount: attachments.count,
            isBlurred: isBlurred,
            isViewOnce: isViewOnce,
            expiresAt: expiresAt,
            originalLanguage: originalLanguage,
            location: location,
            nature: LastMessageNature(
                attachmentSummary: LastMessageAttachmentSummary(attachments: attachments)
            )
        )
    }

    /// Le groupe « dernier message » d'une ligne, tel qu'elle le porte — pour
    /// le recopier EN BLOC sur une autre ligne (retour au message précédent
    /// après une suppression, écriture qui ne possède pas ce groupe).
    public init(conversation: MeeshyConversation) {
        self.init(
            id: conversation.lastMessageId,
            preview: conversation.lastMessagePreview,
            senderName: conversation.lastMessageSenderName,
            at: conversation.lastMessageAt,
            attachments: conversation.lastMessageAttachments,
            attachmentCount: conversation.lastMessageAttachmentCount,
            isBlurred: conversation.lastMessageIsBlurred,
            isViewOnce: conversation.lastMessageIsViewOnce,
            expiresAt: conversation.lastMessageExpiresAt,
            translations: conversation.lastMessageTranslations,
            originalLanguage: conversation.lastMessageOriginalLanguage,
            location: conversation.lastMessageLocation,
            nature: conversation.lastMessageNature
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
        lastMessageNature = facet.nature
    }

    /// **La garde d'ordre du groupe « dernier message »** (#7548) — la même
    /// sur `message:new` et sur l'accusé d'envoi.
    ///
    /// Un événement plus ANCIEN que l'aperçu en place ne le remplace jamais.
    /// Mais un événement sur le MÊME message n'est pas plus ancien : il le
    /// complète. C'est la course `conversation:updated` puis `message:new` —
    /// le premier pose l'identité, le texte et l'horodatage et remet à neutre
    /// le reste (`adoptLastMessage`) ; le second, qui porte les pièces
    /// jointes et les drapeaux, tombait sur un `>` strict contre son propre
    /// horodatage et était jeté. La ligne perdait son icône et ses effets
    /// jusqu'à la synchronisation complète suivante.
    ///
    /// - Parameter aliases: les autres noms du message en place — l'identifiant
    ///   `cid_…` d'un envoi optimiste, que l'accusé remplace par l'identifiant
    ///   serveur sous une horloge serveur qui peut précéder celle de l'appareil.
    func admitsLastMessage(id: String?, at date: Date, aliases: [String] = []) -> Bool {
        if let id, id == lastMessageId { return true }
        if let current = lastMessageId, aliases.contains(current) { return true }
        return date > lastMessageAt
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
        lastMessageNature = nil
        return true
    }
}
