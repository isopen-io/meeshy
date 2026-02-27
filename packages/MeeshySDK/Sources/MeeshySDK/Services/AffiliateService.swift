import Foundation

public final class AffiliateService {
    public static let shared = AffiliateService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func listTokens(offset: Int = 0, limit: Int = 50) async throws -> [AffiliateToken] {
        let response: OffsetPaginatedAPIResponse<[AffiliateToken]> = try await api.request(
            endpoint: "/affiliate/tokens",
            queryItems: [
                URLQueryItem(name: "offset", value: "\(offset)"),
                URLQueryItem(name: "limit", value: "\(limit)"),
            ]
        )
        return response.data
    }

    public func createToken(name: String, maxUses: Int? = nil, expiresAt: String? = nil) async throws -> AffiliateToken {
        let body = CreateAffiliateTokenRequest(name: name, maxUses: maxUses, expiresAt: expiresAt)
        let response: APIResponse<AffiliateToken> = try await api.post(endpoint: "/affiliate/tokens", body: body)
        return response.data
    }

    public func deleteToken(id: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/affiliate/tokens/\(id)")
    }

    public func fetchStats() async throws -> AffiliateStats {
        let response: APIResponse<AffiliateStats> = try await api.request(endpoint: "/affiliate/stats")
        return response.data
    }
}
