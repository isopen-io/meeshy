import Foundation

/// Ma progression — badges, série, niveau — se lit à UNE adresse,
/// `GET /me/engagement` (#5670), et cette lecture est le SEUL point de contact
/// de l'écran « Progression » (#5698) avec la passerelle. Rien n'y est écrit :
/// `EngagementService.recordActivity` (gateway) reste l'unique producteur, la
/// notification reste le canal de livraison des paliers, cet appel ne fait que
/// RELIRE l'état courant (modèle § 9).
public protocol EngagementProgressProviding: Sendable {
    func fetchProgress() async throws -> APIEngagementProgress
}

public final class EngagementProgressService: EngagementProgressProviding, @unchecked Sendable {
    public static let shared = EngagementProgressService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func fetchProgress() async throws -> APIEngagementProgress {
        let response: APIResponse<APIEngagementProgress> = try await api.request(MeEndpoint.engagement)
        return response.data
    }
}
