import Foundation

/// Contrat d'accès à l'affiliation, pour que les ViewModels s'injectent un
/// double en test plutôt que le singleton réseau.
public protocol AffiliateServiceProviding: Sendable {
    func listTokens(offset: Int, limit: Int) async throws -> [AffiliateToken]
    func fetchStats() async throws -> AffiliateStats
}

/// Mes invitations envoyées par e-mail et leur relance (#19207). Une passerelle qui ne connaît pas ces routes
/// répond par une erreur : l'écran se passe alors du bloc, rien n'est inventé.
public protocol SentInvitationsProviding: Sendable {
    func listSentInvitations(offset: Int, limit: Int) async throws -> [SentEmailInvitation]
    func resendInvitation(id: String) async throws -> SentEmailInvitation
}

public final class AffiliateService: AffiliateServiceProviding, SentInvitationsProviding, Sendable {
    public static let shared = AffiliateService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func listTokens(offset: Int = 0, limit: Int = 50) async throws -> [AffiliateToken] {
        let response: OffsetPaginatedAPIResponse<[AffiliateToken]> = try await api.request(
            AffiliateEndpoint.tokens,
            queryItems: [
                URLQueryItem(name: "offset", value: "\(offset)"),
                URLQueryItem(name: "limit", value: "\(limit)"),
            ]
        )
        return response.data
    }

    public func createToken(name: String, maxUses: Int? = nil, expiresAt: String? = nil) async throws -> AffiliateToken {
        let body = CreateAffiliateTokenRequest(name: name, maxUses: maxUses, expiresAt: expiresAt)
        let response: APIResponse<AffiliateToken> = try await api.post(AffiliateEndpoint.tokens, body: body)
        return response.data
    }

    public func deleteToken(id: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(AffiliateEndpoint.tokensById(id: id))
    }

    public func fetchStats() async throws -> AffiliateStats {
        let response: APIResponse<AffiliateStats> = try await api.request(AffiliateEndpoint.stats)
        return response.data
    }

    public func listSentInvitations(offset: Int = 0, limit: Int = 20) async throws -> [SentEmailInvitation] {
        let response: OffsetPaginatedAPIResponse<[SentEmailInvitation]> = try await api.request(
            InvitationsEndpoint.email,
            queryItems: [
                URLQueryItem(name: "offset", value: "\(offset)"),
                URLQueryItem(name: "limit", value: "\(limit)"),
            ]
        )
        return response.data
    }

    public func resendInvitation(id: String) async throws -> SentEmailInvitation {
        let response: APIResponse<SentEmailInvitation> = try await api.post(
            InvitationsEndpoint.emailByIdResend(id: id), body: ResendInvitationBody()
        )
        return response.data
    }

    private struct ResendInvitationBody: Encodable {}
}
