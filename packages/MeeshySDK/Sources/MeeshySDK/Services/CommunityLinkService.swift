import Foundation

public final class CommunityLinkService {
    public static let shared = CommunityLinkService()
    private let api = APIClient.shared

    private init() {}

    /// Retourne les communautés créées ou administrées par l'utilisateur,
    /// formatées comme des CommunityLinks (avec leur URL de partage).
    public func listCommunityLinks() async throws -> [CommunityLink] {
        let response: APIResponse<[APICommunityMini]> = try await api.request(
            endpoint: "/communities/mine?role=admin,moderator"
        )
        let baseUrl = MeeshyConfig.shared.serverOrigin
        return response.data.map { community in
            CommunityLink(
                id: community.id,
                name: community.name,
                identifier: community.identifier,
                baseUrl: baseUrl,
                memberCount: community.memberCount ?? 0,
                isActive: community.isActive,
                createdAt: community.createdAt
            )
        }
    }

    public func stats(links: [CommunityLink]) -> CommunityLinkStats {
        CommunityLinkStats(
            totalCommunities: links.count,
            totalMembers: links.reduce(0) { $0 + $1.memberCount },
            activeCommunities: links.filter(\.isActive).count
        )
    }
}

// Minimal Decodable pour la réponse communities/mine
struct APICommunityMini: Decodable {
    let id: String
    let name: String
    let identifier: String
    let isActive: Bool
    let memberCount: Int?
    let createdAt: Date
}
