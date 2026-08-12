import Foundation

// MARK: - Protocol

public protocol ContactMatchServiceProviding: Sendable {
    /// Envoie les identifiants du carnet d'adresses et renvoie les
    /// utilisateurs Meeshy correspondants. Les contacts ne sont jamais
    /// persistés côté serveur — matching pur.
    func match(_ request: ContactMatchRequest) async throws -> ContactMatchResponse
}

public final class ContactMatchService: ContactMatchServiceProviding, @unchecked Sendable {
    public static let shared = ContactMatchService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func match(_ request: ContactMatchRequest) async throws -> ContactMatchResponse {
        let response: APIResponse<ContactMatchResponse> = try await api.post(
            endpoint: "/users/me/contacts/match", body: request
        )
        return response.data
    }
}
