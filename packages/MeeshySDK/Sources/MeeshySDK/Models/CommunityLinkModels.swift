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
        // `/chat/<identifier>` — l'URL canonique de partage (même règle que
        // `MyShareLink.joinUrl` ; `/join` n'est plus qu'une 308 legacy).
        self.joinUrl = "\(baseUrl)/chat/\(identifier)"
        self.memberCount = memberCount
        self.isActive = isActive
        self.createdAt = createdAt
        self.memberPreviews = memberPreviews
        self.joinLinkPaused = joinLinkPaused
    }
}

public struct CommunityLinkStats: Sendable {
    public let totalCommunities: Int
    public let totalMembers: Int
    public let activeCommunities: Int
}
