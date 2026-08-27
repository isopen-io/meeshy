import Foundation

/// Ce qu'un visiteur entré par lien a le droit de faire — premier cercle de la
/// fiche, servi à tout membre.
///
/// C'est la résolution EFFECTIVE côté gateway (`rights ?? permissions`), et non
/// la configuration courante du lien : celle-ci a pu changer depuis l'arrivée,
/// et ne régit plus qui est déjà entré.
public struct ParticipantEntryCapabilities: Decodable, Sendable, Equatable {
    public let canSendMessages: Bool
    public let canSendFiles: Bool
    public let canSendImages: Bool
    public let canSendVideos: Bool
    public let canSendAudios: Bool
    public let canSendLocations: Bool
    public let canSendLinks: Bool
    /// Voit les messages écrits AVANT son arrivée.
    ///
    /// **Optionnel, et pas par confort : `nil` veut dire « on ne te le dit
    /// pas ».** #4009 retire ce droit de la charge diffusée à la ROOM de
    /// conversation — « qui a le droit de voir l'historique » est un fait de
    /// MODÉRATION, comme `historyVisibleFrom` que #3898 avait déjà retiré du
    /// même payload. Seuls les autres HÔTES et l'INTÉRESSÉ le reçoivent.
    ///
    /// Le laisser `Bool` non optionnel ne l'aurait pas protégé : le décodage
    /// aurait LEVÉ sur la charge réduite, et un simple membre aurait cessé de
    /// recevoir TOUT changement de droits — pas seulement celui qu'on lui
    /// cache. Un champ qu'un client lit autoritativement n'est plus optionnel
    /// pour l'émetteur ; la réciproque vaut aussi.
    public let canViewHistory: Bool?

    public init(
        canSendMessages: Bool,
        canSendFiles: Bool,
        canSendImages: Bool,
        canSendVideos: Bool,
        canSendAudios: Bool,
        canSendLocations: Bool,
        canSendLinks: Bool,
        canViewHistory: Bool?
    ) {
        self.canSendMessages = canSendMessages
        self.canSendFiles = canSendFiles
        self.canSendImages = canSendImages
        self.canSendVideos = canSendVideos
        self.canSendAudios = canSendAudios
        self.canSendLocations = canSendLocations
        self.canSendLinks = canSendLinks
        self.canViewHistory = canViewHistory
    }

    /// Une capacité, nommée — de quoi ranger les refus dans un ordre stable et
    /// leur associer un libellé sans manipuler des chaînes.
    public enum Capability: String, Sendable, CaseIterable {
        /// En tête : c'est la restriction qui explique le plus de comportements
        /// observables — quelqu'un qui ne réagit jamais à ce qui précède son
        /// arrivée ne l'ignore pas, il ne l'a jamais vu.
        case canViewHistory
        case canSendMessages
        case canSendImages
        case canSendFiles
        case canSendVideos
        case canSendAudios
        case canSendLinks
        case canSendLocations
    }

    /// `nil` — la charge ne DIT rien de cette capacité. Distinct de `false`,
    /// qui la refuse : non dit n'est pas refusé (#4009).
    public func isAllowed(_ capability: Capability) -> Bool? {
        switch capability {
        case .canViewHistory: return canViewHistory
        case .canSendMessages: return canSendMessages
        case .canSendImages: return canSendImages
        case .canSendFiles: return canSendFiles
        case .canSendVideos: return canSendVideos
        case .canSendAudios: return canSendAudios
        case .canSendLinks: return canSendLinks
        case .canSendLocations: return canSendLocations
        }
    }

    /// Ce qui est REFUSÉ, dans l'ordre d'affichage.
    ///
    /// La règle vit ici plutôt que dans chaque vue : énoncer les huit
    /// permissions, dont sept accordées, noierait l'unique information utile, et
    /// une fiche qui récite des autorisations se lit comme un formulaire. Web et
    /// iOS doivent dire la même chose sans réécrire la règle chacun de son côté.
    public var denied: [Capability] {
        // `== false`, jamais `!` : une capacité NON DITE ne se range pas
        // parmi les refus (#4009). L'y mettre ferait afficher « Ne voit pas
        // les messages antérieurs » à toute la salle — exactement le fait
        // que la charge réduite vient de taire.
        Capability.allCases.filter { isAllowed($0) == false }
    }

    /// Ce que la charge DIT, dans l'ordre d'affichage.
    ///
    /// L'édition a besoin des huit — on n'accorde pas un droit qu'on ne montre
    /// pas — mais elle ne peut dessiner un interrupteur pour un droit NON DIT
    /// (#4009) : il mentirait dans les deux positions. En pratique l'édition est
    /// réservée aux hôtes, qui reçoivent toujours la charge complète ; cette
    /// règle tient le cas où cela cesserait d'être vrai.
    ///
    /// Jumelle web : `editableCapabilities` (`ParticipantProfileCard.tsx`).
    public var disclosed: [Capability] {
        Capability.allCases.filter { isAllowed($0) != nil }
    }
}

/// Ce que rend `PATCH …/participants/:participantId/rights` : l'état résolu
/// après écriture, jamais le delta envoyé.
public struct ParticipantRightsUpdateResult: Decodable, Sendable, Equatable {
    public let participantId: String
    public let conversationId: String
    public let rights: ParticipantEntryCapabilities
}

/// Ce que rend la MÊME route `PATCH …/rights` quand l'écriture porte
/// `historyVisibleFrom` — un appel séparé de `updateParticipantRights` :
/// l'octroi par date vaut pour TOUT participant (inscrit compris), pas
/// seulement les visiteurs sans compte, et sa permission d'écriture est plus
/// étroite côté gateway (admin/creator, pas modérateur).
public struct ParticipantHistoryGrantUpdateResult: Decodable, Sendable, Equatable {
    public let participantId: String
    public let conversationId: String
    /// `nil` = octroi retiré.
    public let historyVisibleFrom: Date?
}

/// Un hôte a modifié les droits d'un visiteur — charge utile de
/// `participant:rights-updated`.
///
/// Le sujet est nommé par `participantId` et non par `userId` : il n'a
/// précisément pas de compte, SAUF pour l'octroi d'historique par DATE
/// (`historyVisibleFrom`), qui vaut pour tout participant, inscrit compris.
/// `rights` porte l'état RÉSOLU.
public struct ParticipantRightsUpdatedEvent: Decodable, Sendable, Equatable {
    public let conversationId: String
    public let participantId: String
    public let updatedBy: String
    public let rights: ParticipantEntryCapabilities
    /// Instant depuis lequel ce participant lit l'historique ; `nil` = aucun
    /// octroi. Le gateway le pose TOUJOURS dans cette charge, que ce
    /// changement l'ait touché ou non — optionnel ici pour tolérer un
    /// producteur plus ancien qui ne le portait pas encore.
    ///
    /// **Ne se lit JAMAIS seul** : voir `carriesHistoryGrant`.
    public let historyVisibleFrom: Date?

    /// La charge PORTAIT-elle la clé ?
    ///
    /// `Date?` seul ne distingue pas les deux phrases que le fil sait dire :
    /// `null` — « j'ai calculé, il n'y a pas d'octroi », qui EFFACE — et clé
    /// ABSENTE — « ce producteur ne connaît pas encore ce champ », qui n'affirme
    /// rien et doit laisser en place ce que le lecteur a déjà. Sans ce
    /// discriminant, la tolérance annoncée ci-dessus n'existe pas : un
    /// consommateur qui recopie `historyVisibleFrom` inconditionnellement
    /// EFFACE l'octroi affiché au premier basculement de capacité servi par un
    /// gateway antérieur au champ.
    ///
    /// Même règle et même discriminant — la PRÉSENCE de la clé, jamais sa
    /// valeur — que le pont ✦ de `conversation:unread-updated`, et que le
    /// `data.historyVisibleFrom !== undefined` du web
    /// (`apps/web/hooks/queries/use-participant-rights-sync.ts`).
    public let carriesHistoryGrant: Bool

    private enum CodingKeys: String, CodingKey {
        case conversationId, participantId, updatedBy, rights, historyVisibleFrom
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        participantId = try container.decode(String.self, forKey: .participantId)
        updatedBy = try container.decode(String.self, forKey: .updatedBy)
        rights = try container.decode(ParticipantEntryCapabilities.self, forKey: .rights)
        historyVisibleFrom = try container.decodeIfPresent(Date.self, forKey: .historyVisibleFrom)
        carriesHistoryGrant = container.contains(.historyVisibleFrom)
    }
}

/// Les réglages du lien emprunté — second cercle, réservé aux administrateurs
/// et modérateurs de la conversation.
///
/// Même raison que pour l'email : la salle contient d'autres visiteurs venus par
/// ce même lien, et sa configuration est celle de l'hôte, pas un renseignement
/// sur la personne. Les plages IP n'y figurent volontairement pas — une règle de
/// pare-feu n'a aucune surface d'affichage.
public struct ParticipantEntryLink: Decodable, Sendable, Equatable {
    public let name: String?
    public let isActive: Bool
    public let expiresAt: Date?
    public let maxUses: Int?
    public let currentUses: Int
    public let requireNickname: Bool
    public let requireEmail: Bool
    public let requireBirthday: Bool
    public let allowedCountries: [String]
    public let allowedLanguages: [String]
}

/// Fiche d'un participant — pensée d'abord pour ceux qui n'ont PAS de compte.
///
/// Un visiteur entré par lien a rempli un formulaire pour passer la porte, et
/// rien de ce qu'il y a écrit n'était lisible ensuite : les autres membres ne
/// voyaient qu'un pseudo. Un participant sans fiche est un participant qu'on ne
/// peut ni reconnaître, ni accueillir, ni modérer.
///
/// DEUX CERCLES, tranchés par le gateway et non par le client :
///   - l'IDENTITÉ (nom, pseudo, langue, arrivée, lien emprunté) est servie à
///     tout membre — c'est ce que la personne montre en entrant ;
///   - les COORDONNÉES (`email`, `birthday`) arrivent à `nil` pour un membre
///     ordinaire, même quand la personne les a fournies. Elles n'ont été
///     demandées que parce que l'HÔTE a coché `requireEmail` / `requireBirthday`
///     sur son lien : elles lui reviennent, à lui et à ses modérateurs, pas à
///     une salle qui contient d'autres visiteurs venus par ce même lien public.
///
/// `hasEmail` / `hasBirthday` disent qu'une coordonnée EXISTE sans la livrer.
/// Sans eux, un visiteur qui a tout rempli et un visiteur qui n'a rien donné
/// s'afficheraient à l'identique, et l'hôte ne saurait pas si sa condition
/// d'entrée a été honorée.
///
/// Source : `GET /conversations/:id/participants/:participantId/profile`.
/// Nommé `Conversation…` parce que `ParticipantProfile` est DÉJÀ pris par
/// l'analyse agent (`AgentAnalysisModels.swift`) — un profil de style
/// rédactionnel, sans rapport. Deux types homonymes dans le même module se
/// seraient masqués l'un l'autre.
public struct ConversationParticipantProfile: Decodable, Sendable, Equatable {
    public let participantId: String
    public let conversationId: String
    /// Le participant n'a pas de compte.
    public let isAnonymous: Bool
    public let userId: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let language: String?
    public let country: String?
    public let conversationRole: String?
    public let joinedAt: Date?
    public let isOnline: Bool
    public let lastActiveAt: Date?
    /// Nom du lien de partage emprunté pour entrer.
    public let shareLinkName: String?
    public let hasEmail: Bool
    public let hasBirthday: Bool
    /// `nil` quand le lecteur n'est pas administrateur/modérateur de la
    /// conversation — voir le second cercle ci-dessus.
    public let email: String?
    public let birthday: Date?

    /// Ce que la personne peut faire dans la salle. `nil` quand elle A un
    /// compte : elle n'est entrée par aucun lien, donc aucune condition
    /// d'entrée ne la régit.
    ///
    /// `var` : après une écriture de l'hôte, ou à réception de
    /// `participant:rights-updated`, le serveur rend l'état résolu et il n'y a
    /// rien d'autre à rafraîchir. `historyVisibleFrom` ci-dessous suit la même
    /// règle, pour la même raison.
    public var entryCapabilities: ParticipantEntryCapabilities?

    /// Les réglages du lien emprunté. `nil` hors du cercle des hôtes — c'est le
    /// gateway qui tranche, jamais la vue.
    public let entryLink: ParticipantEntryLink?

    /// Octroi d'historique par DATE posé par un administrateur — vaut pour
    /// TOUT participant, inscrit compris, pas seulement les visiteurs sans
    /// compte. `nil` pour un membre ordinaire, que l'octroi existe ou non :
    /// c'est un fait de modération, pas un attribut de la personne. Servi aux
    /// hôtes (admin/modérateur/creator). `var` : voir `entryCapabilities`.
    public var historyVisibleFrom: Date?

    /// Ce lecteur peut-il POSER ou RETIRER l'octroi ci-dessus ? Question
    /// distincte de `historyVisibleFrom` : un modérateur LIT l'octroi mais ne
    /// peut pas l'écrire (réservé admin/creator côté gateway) — sans ce
    /// signal, `historyVisibleFrom == nil` ne distingue pas « pas hôte » de
    /// « hôte, aucun octroi posé ». Optionnel pour tolérer un gateway plus
    /// ancien qui ne le portait pas encore ; `nil` se lit comme `false`.
    public let canGrantHistory: Bool?

    /// Nom lisible : ce que la personne a écrit en entrant, à défaut son pseudo.
    public var resolvedFullName: String {
        let full = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        if !full.isEmpty { return full }
        return displayName ?? username ?? ""
    }
}
