import Foundation

/// Avis d'arrivée — « X a rejoint la conversation ».
///
/// Quatre portes font entrer quelqu'un dans une conversation (lien anonyme,
/// lien inscrit, ajout par un membre, invitation) et aucune ne le disait au
/// fil : les présents découvraient l'arrivant à son premier message, et rien
/// n'indiquait qu'un visiteur venu par lien public n'a PAS de compte.
///
/// Le message porte son sens ICI, jamais dans son texte — même contrat que
/// `CallSummaryMetadata`. Le `content` stocké n'est qu'un repli français pour
/// les surfaces sans rendu dédié (aperçu de liste, notification) ; un texte
/// figé en base ne peut pas suivre le Prisme Linguistique, une métadonnée si.
///
/// Jumeau TypeScript : `packages/shared/utils/join-notice.ts` — toute évolution
/// touche les deux.
public struct JoinNoticeMetadata: Codable, Sendable, Equatable {
    /// Ce que le lien d'entrée autorise à l'arrivant — présent seulement quand
    /// la porte est un lien de partage.
    public struct LinkRules: Codable, Sendable, Equatable {
        public let canSendMessages: Bool
        public let canSendFiles: Bool
        public let canSendImages: Bool

        public init(canSendMessages: Bool, canSendFiles: Bool, canSendImages: Bool) {
            self.canSendMessages = canSendMessages
            self.canSendFiles = canSendFiles
            self.canSendImages = canSendImages
        }
    }

    /// `Participant.id` de l'arrivant — il est l'auteur de son propre avis.
    public let participantId: String
    public let displayName: String
    /// L'arrivant a-t-il un compte ? Décisif quand la porte est un lien public.
    public let isAnonymous: Bool
    /// Entré par un lien de partage, ou ajouté/invité par un membre.
    public let viaShareLink: Bool
    /// Pseudo stable (`ano_…` pour un visiteur sans compte).
    public let username: String?
    /// Nom humain donné au formulaire d'entrée (prénom/nom), s'il existe.
    public let givenName: String?
    public let linkRules: LinkRules?

    public init(
        participantId: String,
        displayName: String,
        isAnonymous: Bool,
        viaShareLink: Bool,
        username: String? = nil,
        givenName: String? = nil,
        linkRules: LinkRules? = nil
    ) {
        self.participantId = participantId
        self.displayName = displayName
        self.isAnonymous = isAnonymous
        self.viaShareLink = viaShareLink
        self.username = username
        self.givenName = givenName
        self.linkRules = linkRules
    }

    private enum CodingKeys: String, CodingKey {
        case kind, participantId, displayName, isAnonymous, viaShareLink
        case username, givenName, linkRules
    }

    /// `kind` est un GARDE, pas une décoration.
    ///
    /// `metadata` est partagé par toutes les familles de messages système. Un
    /// décodage permissif rendrait une carte d'arrivée pour un résumé d'appel —
    /// et comme le rendu dédié COURT-CIRCUITE le rendu ordinaire, la mauvaise
    /// reconnaissance ne dégraderait pas, elle remplacerait. Même discipline
    /// que `CallSummaryMetadata.init(from:)`.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decodeIfPresent(String.self, forKey: .kind)
        guard kind == "member-joined" else {
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: c,
                debugDescription: "metadata.kind is not 'member-joined' (\(kind ?? "nil"))"
            )
        }
        participantId = try c.decode(String.self, forKey: .participantId)
        displayName = try c.decode(String.self, forKey: .displayName)
        // Ces deux drapeaux décident d'un AFFICHAGE — « sans compte », « par
        // lien ». Une valeur absente ne doit jamais devenir une affirmation.
        isAnonymous = try c.decodeIfPresent(Bool.self, forKey: .isAnonymous) ?? false
        viaShareLink = try c.decodeIfPresent(Bool.self, forKey: .viaShareLink) ?? false
        // Enrichissements optionnels — un avis antérieur reste reconnu, et des
        // règles malformées valent absence (jamais un droit affirmé).
        username = try c.decodeIfPresent(String.self, forKey: .username)
        givenName = try c.decodeIfPresent(String.self, forKey: .givenName)
        linkRules = try? c.decodeIfPresent(LinkRules.self, forKey: .linkRules)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode("member-joined", forKey: .kind)
        try c.encode(participantId, forKey: .participantId)
        try c.encode(displayName, forKey: .displayName)
        try c.encode(isAnonymous, forKey: .isAnonymous)
        try c.encode(viaShareLink, forKey: .viaShareLink)
        try c.encodeIfPresent(username, forKey: .username)
        try c.encodeIfPresent(givenName, forKey: .givenName)
        try c.encodeIfPresent(linkRules, forKey: .linkRules)
    }
}
