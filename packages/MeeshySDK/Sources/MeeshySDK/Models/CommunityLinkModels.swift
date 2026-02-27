import Foundation

// MARK: - CommunityLink Models
// Un CommunityLink est une vue sur les communautés de l'utilisateur
// exposant leur URL de partage. Pas de modèle DB supplémentaire.

public struct CommunityLink: Identifiable {
    public let id: String
    public let name: String
    public let identifier: String
    public let joinUrl: String
    public let memberCount: Int
    public let isActive: Bool
    public let createdAt: Date

    public init(id: String, name: String, identifier: String, baseUrl: String,
                memberCount: Int, isActive: Bool, createdAt: Date) {
        self.id = id
        self.name = name
        self.identifier = identifier
        self.joinUrl = "\(baseUrl)/join/\(identifier)"
        self.memberCount = memberCount
        self.isActive = isActive
        self.createdAt = createdAt
    }
}

public struct CommunityLinkStats {
    public let totalCommunities: Int
    public let totalMembers: Int
    public let activeCommunities: Int
}
