import Foundation

/// Ce qu'un appel de profil demande EN PLUS du profil (#4161).
///
/// Le serveur ne sert la présence que sur demande, et les statistiques dans le
/// même aller-retour que le profil. Demander une expansion, c'est décider si
/// l'on POSE la question — jamais lever une garde : la présence reste soumise à
/// la loi de visibilité, et les compteurs intimes à celle de leur propriétaire.
public enum ProfileExpansion: String, Sendable, CaseIterable {
    /// Les compteurs — publics pour tous, intimes pour soi et l'administration.
    case stats
    /// `isOnline` / `lastActiveAt`, sous la loi de visibilité de présence.
    case presence
    /// La relation du LECTEUR au sujet : `self`, `friend`, `pending_sent`,
    /// `pending_received`, `none`.
    case relation
}

/// Un profil public tel que `GET /directory/people/:handle` le sert.
///
/// ## Pourquoi un type, et non trois champs de plus sur `MeeshyUser`
///
/// `MeeshyUser` est le modèle de DOMAINE : il décrit une personne, pas une
/// réponse. Ce que la réponse porte en plus — des statistiques calculées, une
/// relation qui n'existe que par rapport au lecteur — n'appartient pas à la
/// personne et changerait selon qui regarde. Les garder ici laisse `MeeshyUser`
/// signifier la même chose partout.
///
/// La charge est PLATE côté fil : le profil et ses expansions sont frères. Le
/// décodage lit donc `MeeshyUser` sur le MÊME décodeur, sans conteneur
/// intermédiaire.
public struct PublicProfile: Decodable, Sendable {
    public let user: MeeshyUser
    /// Présentes seulement sur `?expand=stats`.
    public let stats: UserStats?
    /// Présente seulement sur `?expand=relation`.
    ///
    /// Décodée en CHAÎNE, jamais en `enum` : un modèle client plus STRICT que
    /// le fil fait échouer le décodage du document ENTIER, et une valeur de
    /// relation ajoutée côté serveur ferait alors disparaître le profil.
    /// `relationKind` en donne la lecture typée, avec un repli explicite.
    public let relation: String?
    /// `true` quand le lecteur EST le sujet. Absent ⇒ `false` : ne pas savoir
    /// n'est pas « c'est moi ».
    public let isSelf: Bool

    private enum CodingKeys: String, CodingKey {
        case stats, relation, isSelf
    }

    public init(from decoder: Decoder) throws {
        user = try MeeshyUser(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        stats = try container.decodeIfPresent(UserStats.self, forKey: .stats)
        relation = try container.decodeIfPresent(String.self, forKey: .relation)
        isSelf = try container.decodeIfPresent(Bool.self, forKey: .isSelf) ?? false
    }

    public init(user: MeeshyUser, stats: UserStats? = nil, relation: String? = nil, isSelf: Bool = false) {
        self.user = user
        self.stats = stats
        self.relation = relation
        self.isSelf = isSelf
    }

    /// La relation, lue avec un repli : une valeur inconnue vaut « aucune »,
    /// jamais une erreur de décodage.
    public var relationKind: RelationKind {
        RelationKind(rawValue: relation ?? "") ?? .none
    }

    public enum RelationKind: String, Sendable {
        case none
        case `self`
        case friend
        case pendingSent = "pending_sent"
        case pendingReceived = "pending_received"
    }
}
