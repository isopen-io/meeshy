import Foundation

/// Tri-état du Prisme Linguistique de la ligne de liste, porté par
/// `conversation:updated`.
///
/// `Optional` ne suffit pas : il confond « la clé était ABSENTE du payload »
/// (une mise à jour de métadonnées — renommage, avatar — qui ne parle pas du
/// dernier message) et « la clé valait `null` » (le serveur DIT que la carte
/// est périmée). Les deux demandent des actions opposées.
///
/// C'est exactement ce qu'une ÉDITION produit : le gateway remet
/// `Message.translations` à null dans la même écriture que le nouveau contenu,
/// tout en gardant le MÊME `lastMessageId`. Aucune heuristique client ne peut
/// trancher ce cas — « vider quand l'id change » le laisse passer, et vider
/// inconditionnellement effacerait la carte que `message:new` vient
/// d'installer sur le chemin d'envoi. Seul ce `null` REÇU le peut.
public enum LastMessagePreviewTranslations: Sendable, Hashable {
    /// Clé absente : la carte du cache n'est pas concernée par cet événement.
    case unchanged
    /// Clé présente : la carte du cache est REMPLACÉE par celle-ci — vide
    /// comprise, et c'est tout l'intérêt.
    case replaced([String: String])
}

/// Tri-état de l'IDENTITÉ du dernier message de la ligne de liste, portée par
/// `conversation:updated`.
///
/// Même raison d'être que `LastMessagePreviewTranslations`, appliquée au champ
/// qui NOMME le message : `Optional` confond « la clé était ABSENTE » (un
/// renommage, un changement d'avatar — cet événement ne parle pas du dernier
/// message) et « la clé valait `null` » (le serveur DIT que ce lecteur n'a plus
/// AUCUN message visible ici).
///
/// Le second cas n'est pas théorique : un lecteur qui masque pour lui-même —
/// suppression pour soi, purge d'historique — le dernier message qui lui restait
/// vide sa propre vue sans rien changer pour les autres.
/// `emitConversationPreviewUpdate` lui sert alors un payload dont TOUT le groupe
/// d'aperçu vaut `null`. Lu à travers des `Optional`, ce payload ne dit rien du
/// tout : chaque `if let` le jette, et la ligne de liste continue d'afficher
/// l'aperçu de ce que le lecteur vient de masquer — définitivement, puisque plus
/// rien ne bougera dans cette conversation.
public enum LastMessageIdentity: Sendable, Hashable {
    /// Clé absente : cet événement ne parle pas du dernier message.
    case unchanged
    /// Clé présente. `nil` = plus AUCUN message visible pour ce lecteur.
    case replaced(String?)
}

/// L'AUTEUR du dernier message, tel que la ligne de liste le préfixe
/// (« `<Auteur>` : `<message>` »).
///
/// Même distinction à trois états que `LastMessageIdentity`, et pour la même
/// raison — mais elle vaut ici davantage, parce que la fusion EFFACE l'auteur
/// par défaut : un `Optional` nu ne saurait pas séparer « cet événement ne
/// parle pas de l'auteur » (ne touche à rien) de « il n'y a pas d'auteur à
/// afficher » (efface), et les deux se produisent.
///
/// La passerelle sert ce champ depuis toujours (`lastMessageSenderName`,
/// `socketio-events/conversation.ts`, calculé par `lastMessagePreviewPrism`) ;
/// ce décodeur ne le déclarait pas, donc le client JETAIT une donnée qu'il
/// recevait déjà, puis reposait l'aperçu sans son auteur. D'où le symptôme :
/// le texte est là, l'auteur a disparu.
public enum LastMessageSenderName: Sendable, Hashable {
    /// Clé absente : cet événement ne dit rien de l'auteur.
    case unchanged
    /// Clé présente. `nil` = aucun auteur à afficher.
    case replaced(String?)
}

public struct ConversationUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let defaultWriteRole: String?
    public let isAnnouncementChannel: Bool?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    /// New as of the conversation-list bump-to-top work: the gateway emits
    /// this on every message broadcast (handlers/MessageHandler.ts) so the
    /// client can re-sort the conversation list in real time without a
    /// delta sync round-trip. Optional for retro-compatibility with
    /// pre-existing CONVERSATION_UPDATED payloads (rename, avatar change,
    /// etc.) that don't advance lastMessageAt.
    public let lastMessageAt: Date?
    /// Le message que cette ligne de liste doit désormais désigner. Tri-état —
    /// voir `LastMessageIdentity` : `.unchanged` (clé absente) et
    /// `.replaced(nil)` (« plus aucun message visible ici ») demandent des
    /// actions opposées, et `String?` les confondait.
    ///
    /// Renseigné par le chemin message-driven (`MessageHandler.ts`) pour que le
    /// client mette à jour l'aperçu sans requête séparée, et par
    /// `emitConversationPreviewUpdate` sur les recalculs.
    public let lastMessage: LastMessageIdentity
    public let lastMessagePreview: String?
    /// L'auteur du dernier message, pour le préfixe de la ligne de liste.
    public let lastMessageSenderName: LastMessageSenderName
    /// Prisme de la ligne de liste, résolu par le gateway POUR CE destinataire.
    /// Sans lui, une édition laissait la ligne afficher le texte D'AVANT : le
    /// résolveur PRÉFÈRE la traduction hydratée par `GET /conversations` à
    /// `lastMessagePreview`, et rien sur le fil ne disait qu'elle était périmée.
    public let lastMessageTranslations: LastMessagePreviewTranslations
    public let lastMessageOriginalLanguage: String?
    /// Position du dernier message, hissée par le chemin message-driven
    /// (`MessageHandler.ts`) et par `emitConversationPreviewUpdate`. Un message
    /// position-seule a un `lastMessagePreview` vide — c'est ce champ qui
    /// permet à la ligne d'aperçu de composer son libellé.
    public let location: SharedPlace?
    public let senderId: String?
    /// Optional because the gateway's message-driven CONVERSATION_UPDATED
    /// payload (handlers/MessageHandler.ts on every new message) only
    /// carries `{ conversationId, lastMessageAt, lastMessageId,
    /// lastMessagePreview, senderId, updatedAt }` — no `updatedBy`. Decoding
    /// it as required would silently fail with `keyNotFound` on every
    /// inbound message, which is the entire signal that drives bumpToTop.
    /// Metadata-driven updates (rename, avatar change, etc.) keep emitting
    /// `updatedBy` and continue to populate this field.
    public let updatedBy: SocketEventUser?
    public let updatedAt: String
    /// `true` quand le serveur a RECALCULÉ l'aperçu depuis l'état courant de sa
    /// base, par opposition à une poussée du message qu'on vient d'écrire.
    ///
    /// C'est la seule chose qui autorise le groupe d'aperçu à RECULER dans le
    /// temps. `ConversationStore.merging` tient ce groupe pour monotone — un
    /// `lastMessageAt` plus ancien y désigne un message périmé — parce que du
    /// seul contenu, une diffusion arrivée dans le désordre et un recalcul
    /// autoritatif sont indiscernables : les deux reculent, les deux nomment un
    /// autre message. Supprimer le dernier message pour tous, ou masquer son
    /// propre dernier message visible, produit pourtant un aperçu légitimement
    /// PLUS ANCIEN.
    ///
    /// Absent des payloads message-driven, et absent de tout gateway antérieur
    /// à ce champ : `false` par défaut conserve alors exactement l'ancienne
    /// règle.
    public let previewRecalculated: Bool
    /// Sous-groupe MÉDIA et drapeaux du message nommé (#7548) : le serveur les
    /// sert depuis longtemps, ce décodeur les jetait — la ligne perdait icône
    /// et effets dès qu'un `conversation:updated` la touchait. `nil` = clé
    /// absente ; ils ne valent que pour le message que `lastMessage` nomme.
    public let lastMessageAttachments: [MeeshyMessageAttachment]?
    public let lastMessageAttachmentCount: Int?
    public let lastMessageIsBlurred: Bool?
    public let lastMessageIsViewOnce: Bool?
    public let lastMessageExpiresAt: Date?
    /// Sous-groupe NATURE du contrat #7545. `nil` quand aucune de ses clés
    /// n'est sur le fil (métadonnées seules, serveur antérieur).
    public let lastMessageNature: LastMessageNature?
    /// Dernière réaction (#7545) — clé absente : `.unchanged`.
    public let lastReaction: PreviewFieldUpdate<ConversationLastReaction>
    /// Appel en cours (#7545) — clé absente : `.unchanged` ; `null` : terminé.
    public let activeCall: PreviewFieldUpdate<ConversationActiveCall>

    private enum CodingKeys: String, CodingKey {
        case conversationId, title, description, avatar, banner
        case defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled
        case lastMessageAt, lastMessageId, lastMessagePreview, senderId, updatedBy, updatedAt
        case lastMessageSenderName
        case location
        case lastMessageTranslations, lastMessageOriginalLanguage
        case previewRecalculated
        case lastMessageAttachments, lastMessageAttachmentCount
        case lastMessageIsBlurred, lastMessageIsViewOnce, lastMessageExpiresAt
        case lastMessageType, lastMessageEffectFlags, lastMessageEphemeralDuration
        case lastMessageIsEncrypted, lastMessageIsForwarded
        case lastMessageSystemEvent, lastMessageCallSummary, lastMessageAttachmentSummary
        case lastReaction, activeCall
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        banner = try container.decodeIfPresent(String.self, forKey: .banner)
        defaultWriteRole = try container.decodeIfPresent(String.self, forKey: .defaultWriteRole)
        isAnnouncementChannel = try container.decodeIfPresent(Bool.self, forKey: .isAnnouncementChannel)
        slowModeSeconds = try container.decodeIfPresent(Int.self, forKey: .slowModeSeconds)
        autoTranslateEnabled = try container.decodeIfPresent(Bool.self, forKey: .autoTranslateEnabled)
        lastMessageAt = try container.decodeIfPresent(Date.self, forKey: .lastMessageAt)
        // `contains`, comme pour la carte du Prisme juste en dessous et pour la
        // même raison : c'est la PRÉSENCE de la clé qui sépare « cet événement
        // ne parle pas du dernier message » de « il n'y en a plus aucun ».
        if container.contains(.lastMessageId) {
            lastMessage = .replaced(try container.decodeIfPresent(String.self, forKey: .lastMessageId))
        } else {
            lastMessage = .unchanged
        }
        lastMessagePreview = try container.decodeIfPresent(String.self, forKey: .lastMessagePreview)
        // `contains`, comme l'identité du dernier message ci-dessus : la
        // PRÉSENCE de la clé sépare « cet événement ne dit rien de l'auteur »
        // de « il n'y a pas d'auteur à afficher ».
        if container.contains(.lastMessageSenderName) {
            lastMessageSenderName = .replaced(try container.decodeIfPresent(String.self, forKey: .lastMessageSenderName))
        } else {
            lastMessageSenderName = .unchanged
        }
        // `contains` et non `decodeIfPresent` : c'est la PRÉSENCE de la clé qui
        // distingue « cet événement ne parle pas d'aperçu » de « la carte est
        // périmée ». `decodeIfPresent` rend `nil` dans les deux cas et perdrait
        // précisément le signal que le serveur envoie.
        if container.contains(.lastMessageTranslations) {
            let map = try container.decodeIfPresent([String: String].self, forKey: .lastMessageTranslations)
            lastMessageTranslations = .replaced(map ?? [:])
        } else {
            lastMessageTranslations = .unchanged
        }
        lastMessageOriginalLanguage = try container.decodeIfPresent(String.self, forKey: .lastMessageOriginalLanguage)
        location = try container.decodeIfPresent(SharedPlace.self, forKey: .location)
        senderId = try container.decodeIfPresent(String.self, forKey: .senderId)
        updatedBy = try container.decodeIfPresent(SocketEventUser.self, forKey: .updatedBy)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        previewRecalculated = try container.decodeIfPresent(Bool.self, forKey: .previewRecalculated) ?? false
        lastMessageAttachments = (try? container.decodeIfPresent([LastMessagePreviewAttachment].self, forKey: .lastMessageAttachments))?
            .map(\.attachment)
        lastMessageAttachmentCount = try? container.decodeIfPresent(Int.self, forKey: .lastMessageAttachmentCount)
        lastMessageIsBlurred = try? container.decodeIfPresent(Bool.self, forKey: .lastMessageIsBlurred)
        lastMessageIsViewOnce = try? container.decodeIfPresent(Bool.self, forKey: .lastMessageIsViewOnce)
        lastMessageExpiresAt = try? container.decodeIfPresent(Date.self, forKey: .lastMessageExpiresAt)
        // `try?` sur chaque sous-champ du contrat : une forme inattendue d'UN
        // champ neuf ne doit jamais jeter l'événement entier, qui porte aussi
        // l'identité et le rang de la ligne.
        let nature = LastMessageNature(
            messageType: try? container.decodeIfPresent(String.self, forKey: .lastMessageType),
            effectFlags: try? container.decodeIfPresent(Int.self, forKey: .lastMessageEffectFlags),
            ephemeralDuration: try? container.decodeIfPresent(Int.self, forKey: .lastMessageEphemeralDuration),
            isEncrypted: (try? container.decodeIfPresent(Bool.self, forKey: .lastMessageIsEncrypted)) ?? false,
            isForwarded: (try? container.decodeIfPresent(Bool.self, forKey: .lastMessageIsForwarded)) ?? false,
            systemEvent: try? container.decodeIfPresent(LastMessageSystemEvent.self, forKey: .lastMessageSystemEvent),
            callSummary: try? container.decodeIfPresent(LastMessageCallSummary.self, forKey: .lastMessageCallSummary),
            attachmentSummary: try? container.decodeIfPresent(LastMessageAttachmentSummary.self, forKey: .lastMessageAttachmentSummary)
        )
        lastMessageNature = nature.isEmpty ? nil : nature
        lastReaction = container.contains(.lastReaction)
            ? .replaced(try? container.decodeIfPresent(ConversationLastReaction.self, forKey: .lastReaction))
            : .unchanged
        activeCall = container.contains(.activeCall)
            ? .replaced(try? container.decodeIfPresent(ConversationActiveCall.self, forKey: .activeCall))
            : .unchanged
    }

    public init(
        conversationId: String,
        title: String? = nil,
        description: String? = nil,
        avatar: String? = nil,
        banner: String? = nil,
        defaultWriteRole: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil,
        lastMessageAt: Date? = nil,
        lastMessage: LastMessageIdentity = .unchanged,
        lastMessagePreview: String? = nil,
        lastMessageSenderName: LastMessageSenderName = .unchanged,
        lastMessageTranslations: LastMessagePreviewTranslations = .unchanged,
        lastMessageOriginalLanguage: String? = nil,
        location: SharedPlace? = nil,
        senderId: String? = nil,
        updatedBy: SocketEventUser? = nil,
        updatedAt: String,
        previewRecalculated: Bool = false,
        lastMessageAttachments: [MeeshyMessageAttachment]? = nil,
        lastMessageAttachmentCount: Int? = nil,
        lastMessageIsBlurred: Bool? = nil,
        lastMessageIsViewOnce: Bool? = nil,
        lastMessageExpiresAt: Date? = nil,
        lastMessageNature: LastMessageNature? = nil,
        lastReaction: PreviewFieldUpdate<ConversationLastReaction> = .unchanged,
        activeCall: PreviewFieldUpdate<ConversationActiveCall> = .unchanged
    ) {
        self.conversationId = conversationId
        self.title = title
        self.description = description
        self.avatar = avatar
        self.banner = banner
        self.defaultWriteRole = defaultWriteRole
        self.isAnnouncementChannel = isAnnouncementChannel
        self.slowModeSeconds = slowModeSeconds
        self.autoTranslateEnabled = autoTranslateEnabled
        self.lastMessageAt = lastMessageAt
        self.lastMessage = lastMessage
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageSenderName = lastMessageSenderName
        self.lastMessageTranslations = lastMessageTranslations
        self.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        self.location = location
        self.senderId = senderId
        self.updatedBy = updatedBy
        self.updatedAt = updatedAt
        self.previewRecalculated = previewRecalculated
        self.lastMessageAttachments = lastMessageAttachments
        self.lastMessageAttachmentCount = lastMessageAttachmentCount
        self.lastMessageIsBlurred = lastMessageIsBlurred
        self.lastMessageIsViewOnce = lastMessageIsViewOnce
        self.lastMessageExpiresAt = lastMessageExpiresAt
        self.lastMessageNature = lastMessageNature
        self.lastReaction = lastReaction
        self.activeCall = activeCall
    }

    /// L'id porté, `nil` quand la clé était absente OU nulle.
    ///
    /// Réservé aux appelants pour qui les deux se valent — typiquement la
    /// construction d'une facette décrivant un message NEUF, chemin qu'un
    /// vidage n'atteint jamais (il n'avance aucun horodatage). Partout où le
    /// vidage compte, c'est `lastMessage` qu'il faut lire.
    public var lastMessageIdValue: String? {
        guard case .replaced(let id) = lastMessage else { return nil }
        return id
    }

    /// Le `User.id` de l'auteur du message NOMMÉ, quand l'événement le dit
    /// (#7612).
    ///
    /// `senderId` est un `Participant.id` ; comparé à l'id UTILISATEUR du
    /// lecteur, il ne reconnaît jamais « moi ». Les deux émetteurs
    /// message-driven posent `updatedBy.id` = l'auteur du message. Un recalcul
    /// (`previewRecalculated`) y met l'ACTEUR — qui a supprimé ou masqué —, et
    /// une mise à jour de métadonnées ou d'activité ne nomme aucun message :
    /// dans ces deux cas, rien n'est affirmé.
    public var messageSenderUserId: String? {
        guard !previewRecalculated, case .replaced(.some) = lastMessage else { return nil }
        return updatedBy?.id
    }
}
