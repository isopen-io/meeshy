import Foundation

public final class CommunityLinkService: Sendable {
    public static let shared = CommunityLinkService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// Retourne les communautés créées ou administrées par l'utilisateur,
    /// formatées comme des CommunityLinks (avec leur URL de partage).
    public func listCommunityLinks() async throws -> [CommunityLink] {
        let response: APIResponse<[APICommunityMini]> = try await api.request(
            CommunitiesEndpoint.mine,
            queryItems: [URLQueryItem(name: "role", value: "admin,moderator")]
        )
        let baseUrl = MeeshyConfig.shared.webOrigin
        return response.data.map { community in
            CommunityLink(
                id: community.id,
                name: community.name,
                identifier: community.identifier,
                baseUrl: baseUrl,
                memberCount: community.memberCount ?? 0,
                isActive: community.isActive,
                createdAt: community.createdAt,
                memberPreviews: community.memberPreviews,
                joinLinkPaused: community.joinLinkPaused
            )
        }
    }

    /// Met le lien d'entrée en pause ou le relance (#19661), réservé aux intendants ; rend l'état que la passerelle
    /// a écrit, qui fait foi.
    public func setJoinLinkPaused(communityId: String, paused: Bool) async throws -> Bool {
        let response: APIResponse<APICommunityJoinLinkState> = try await api.put(
            CommunitiesEndpoint.byIdJoinLink(id: communityId),
            body: JoinLinkStateRequest(paused: paused)
        )
        return response.data.joinLinkPausedAt != nil
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
    let memberPreviews: [LinksFaceMember]?
    var joinLinkPaused: Bool? = nil
}

struct JoinLinkStateRequest: Encodable {
    let paused: Bool
}

/// La réponse de `PUT /communities/:id/join-link` : l'instant de la pause, `null` pour un lien actif.
struct APICommunityJoinLinkState: Decodable {
    let joinLinkPausedAt: Date?
}
