import Foundation

/// Ma progression — badges, série, niveau — se lit à UNE adresse,
/// `GET /me/engagement` (#5670), et cette lecture est le SEUL point de contact
/// de l'écran « Progression » (#5698) avec la passerelle. Rien n'y est écrit :
/// `EngagementService.recordActivity` (gateway) reste l'unique producteur, la
/// notification reste le canal de livraison des paliers, cet appel ne fait que
/// RELIRE l'état courant (modèle § 9).
/// La réponse de `POST /me/meesh/mint` (#5743).
public struct APIMeeshMintResult: Codable, Sendable, Equatable {
    /// « minted » | « already-minted » | « insufficient ».
    public let status: String
    public let balance: Int?
    public let mintedLifetime: Int?

    public init(status: String, balance: Int? = nil, mintedLifetime: Int? = nil) {
        self.status = status
        self.balance = balance
        self.mintedLifetime = mintedLifetime
    }
}

public protocol EngagementProgressProviding: Sendable {
    func fetchProgress() async throws -> APIEngagementProgress

    /// Frappe une Meesh. `requestId` porte l'IDEMPOTENCE : il est généré une
    /// fois par INTENTION de frappe, jamais par requête — sinon un retry
    /// deviendrait une seconde frappe, ce que cet identifiant empêche.
    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult
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

    public func mintMeesh(requestId: String) async throws -> APIMeeshMintResult {
        let response: APIResponse<APIMeeshMintResult> = try await api.request(
            MeEndpoint.meeshMint,
            body: ["requestId": requestId]
        )
        return response.data
    }
}
