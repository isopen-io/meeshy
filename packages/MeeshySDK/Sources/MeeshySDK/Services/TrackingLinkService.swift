import Foundation

// MARK: - TrackingLink Service

public final class TrackingLinkService: @unchecked Sendable {
    public static let shared = TrackingLinkService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    struct TrackingLinksData: Decodable {
        let trackingLinks: [TrackingLink]
    }

    /// Liste les liens de tracking de l'utilisateur connecté
    public func listLinks(offset: Int = 0, limit: Int = 50) async throws -> [TrackingLink] {
        let response: APIResponse<TrackingLinksData> = try await api.request(
            TrackingLinksEndpoint.userMe,
            queryItems: [URLQueryItem(name: "offset", value: String(offset)),
                         URLQueryItem(name: "limit", value: String(limit))]
        )
        return response.data.trackingLinks
    }

    /// Stats globales des liens de l'utilisateur
    public func fetchStats() async throws -> TrackingLinkStats {
        let response: APIResponse<TrackingLinkStats> = try await api.request(
            TrackingLinksEndpoint.stats
        )
        return response.data
    }

    /// Crée un nouveau lien de tracking
    public func createLink(_ request: CreateTrackingLinkRequest) async throws -> TrackingLink {
        let response: APIResponse<TrackingLink> = try await api.post(
            TrackingLinksEndpoint.root,
            body: request
        )
        return response.data
    }

    /// Détails + liste des clics pour un lien
    public func fetchClicks(token: String, offset: Int = 0, limit: Int = 50) async throws -> TrackingLinkDetail {
        let response: APIResponse<TrackingLinkDetail> = try await api.request(
            TrackingLinksEndpoint.byTokenClicks(token: token),
            queryItems: [URLQueryItem(name: "offset", value: String(offset)),
                         URLQueryItem(name: "limit", value: String(limit))]
        )
        return response.data
    }

    /// Active ou désactive un lien
    public func setActive(token: String, isActive: Bool) async throws {
        struct SetActiveBody: Encodable { let isActive: Bool }
        let _: APIResponse<TrackingLink> = try await api.patch(
            TrackingLinksEndpoint.byToken(token: token),
            body: SetActiveBody(isActive: isActive)
        )
    }

    /// Supprime un lien
    public func deleteLink(token: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            TrackingLinksEndpoint.byToken(token: token)
        )
    }
}
