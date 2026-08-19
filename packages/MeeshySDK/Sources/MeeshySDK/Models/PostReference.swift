import Foundation

/// Comment une référence se montre dans un contenu.
///
/// Miroir de l'enum Prisma `PostMentionDisplay`. INLINE est DÉRIVÉ par le
/// serveur, qui relit les `@handle` du texte — le client ne le déclare jamais.
/// Les trois autres sont déclarés : le texte ne peut pas les porter.
public enum PostReferenceDisplay: String, Codable, Sendable, CaseIterable {
    /// `@handle` écrit dans le texte.
    case inline = "INLINE"
    /// Badge posé sur le canevas.
    case pinned = "PINNED"
    /// Rangée « Avec … » sous le contenu.
    case note = "NOTE"
    /// Notifiée, invisible pour les tiers.
    case silent = "SILENT"

    /// Un mode inconnu se lit INLINE plutôt que de faire échouer le décodage du
    /// post entier : une valeur ajoutée côté serveur ne doit pas rendre un
    /// contenu illisible sur une app qu'on n'a pas encore mise à jour.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PostReferenceDisplay(rawValue: raw) ?? .inline
    }

    /// Ce qui se montre à un tiers. SILENT n'est rendu que pour la personne
    /// concernée et pour l'auteur — jamais dans la rangée « Avec … ».
    public var isPubliclyVisible: Bool { self != .silent }
}

/// Une personne référencée dans un contenu, telle que le serveur la sert.
///
/// Le profil arrive RÉSOLU AU CHARGEMENT : quelqu'un qui change de nom
/// d'affichage apparaît sous son nom actuel, pas sous celui qu'il portait à la
/// publication.
public struct PostReference: Codable, Sendable, Equatable, Identifiable {
    public let userId: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let display: PostReferenceDisplay

    public var id: String { userId }

    public init(userId: String, username: String, displayName: String? = nil,
                avatar: String? = nil, display: PostReferenceDisplay = .inline) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.display = display
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        username = try c.decode(String.self, forKey: .username)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
        avatar = try c.decodeIfPresent(String.self, forKey: .avatar)
        display = try c.decodeIfPresent(PostReferenceDisplay.self, forKey: .display) ?? .inline
    }

    /// Ce qu'on affiche d'elle : son nom d'affichage s'il existe, son pseudo sinon.
    public var label: String { displayName ?? username }
}

/// Le droit d'ouvrir un contenu parce qu'on y est référencé — DÉCLARÉ par le
/// serveur, jamais recalculé ici.
///
/// Le client ne voit que `expiresAt` et ignore tout de la référence : déduire
/// l'accès localement ferait refuser un contenu que le serveur autorise.
public enum ReferenceAccess: String, Codable, Sendable {
    /// Pas de référence pour ce lecteur — l'expiration s'applique normalement.
    case none
    /// Droit intact, ou fenêtre encore ouverte : afficher malgré l'expiration.
    case granted
    /// Droit éteint : écran « ce contenu n'est plus disponible ».
    case consumed

    /// Un verdict inconnu se lit `none` plutôt que de faire échouer le décodage
    /// du post entier : la liste de stories est décodée en tableau STRICT, donc
    /// un seul post qui lève emporte le lot — c'est déjà la raison pour laquelle
    /// `APIPost` tolère un `storyEffects` malformé.
    ///
    /// `none` et non `granted` : un verdict qu'on ne comprend pas ne doit rien
    /// OUVRIR, il doit rendre la main à la règle d'audience ordinaire.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ReferenceAccess(rawValue: raw) ?? .none
    }
}
