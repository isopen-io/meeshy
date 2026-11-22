import Foundation

// MARK: - CommunityLink Models
// Un CommunityLink est une vue sur les communautés de l'utilisateur
// exposant leur URL de partage. Pas de modèle DB supplémentaire.

public struct CommunityLink: Codable, Identifiable, Sendable, CacheIdentifiable {
    public let id: String
    public let name: String
    public let identifier: String
    public let joinUrl: String
    public let memberCount: Int
    public let isActive: Bool
    public let createdAt: Date
    /// Quelques membres à montrer en pile sur le billet (planche `Moi-Liens`) ; absent d'un serveur qui ne les sert
    /// pas encore, et d'un cache écrit avant eux.
    public let memberPreviews: [LinksFaceMember]?
    /// Le lien d'entrée est en pause (#19661, servi par `GET /communities/mine` depuis #20255) : on n'entre plus par
    /// lui, la communauté et ses membres restent. `nil` : passerelle plus ancienne ou cache écrit avant ce champ.
    public let joinLinkPaused: Bool?

    public init(id: String, name: String, identifier: String, baseUrl: String,
                memberCount: Int, isActive: Bool, createdAt: Date, memberPreviews: [LinksFaceMember]? = nil,
                joinLinkPaused: Bool? = nil) {
        self.id = id
        self.name = name
        self.identifier = identifier
        self.joinUrl = Self.canonicalJoinUrl(baseUrl: baseUrl, identifier: identifier)
        self.memberCount = memberCount
        self.isActive = isActive
        self.createdAt = createdAt
        self.memberPreviews = memberPreviews
        self.joinLinkPaused = joinLinkPaused
    }
}

extension CommunityLink {
    /// Ce que `encodeURIComponent` laisse en clair : la même adresse s'écrit à l'identique sur le web et sur Android.
    private static let componentAllowed = CharacterSet(
        charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.!~*'()")

    /// L'adresse PARTAGÉE d'une communauté (#20330) : sa page, marquée `?via=link` pour que l'entrée par elle se
    /// compte et se refuse quand le lien est en pause (#19661). `/chat/<identifiant>` ne résout qu'un lien de
    /// CONVERSATION (`DeepLinkParser` → `.chatLink`, `GET /anonymous/link/:identifier`) : il n'ouvrait jamais la
    /// communauté. Même adresse que `communityLinkUrl` (web) et `CommunityLink.canonicalJoinUrl` (Android).
    public static func canonicalJoinUrl(baseUrl: String, identifier: String) -> String {
        let origin = baseUrl.hasSuffix("/") ? String(baseUrl.dropLast()) : baseUrl
        let segment = identifier.addingPercentEncoding(withAllowedCharacters: componentAllowed) ?? identifier
        return "\(origin)/communities/\(segment)?via=link"
    }
}

public struct CommunityLinkStats: Sendable {
    public let totalCommunities: Int
    public let totalMembers: Int
    public let activeCommunities: Int
}
