import Foundation

public protocol ConsentServiceProviding: Sendable {
    func consents() async throws -> [ConsentEntry]
    func setConsent(_ purpose: ConsentPurpose, granted: Bool) async throws -> ConsentEntry
}

public enum ConsentServiceError: Error, Equatable {
    /// La passerelle a répondu sans accorder ce qui était demandé.
    case notGranted(ConsentPurpose)
}

/// `GET /me/consents` et `PUT /me/consents/{purpose}` — l'adresse CANONIQUE
/// d'un consentement (#4348), celle que nomme le refus de
/// `PATCH /me/preferences/application` depuis #4180. Le serveur horodate :
/// aucune date ne part du client.
public final class ConsentService: ConsentServiceProviding, @unchecked Sendable {
    public static let shared = ConsentService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func consents() async throws -> [ConsentEntry] {
        let response: APIResponse<ConsentsSnapshot> = try await api.request(MeEndpoint.consents)
        return response.data.consents
    }

    public func setConsent(_ purpose: ConsentPurpose, granted: Bool) async throws -> ConsentEntry {
        let body = ConsentUpdateRequest(granted: granted, policyVersion: ConsentPolicy.defaultVersion)
        let response: APIResponse<ConsentEntry> = try await api.put(
            MeEndpoint.consentsByPurpose(purpose: purpose.rawValue),
            body: body
        )
        return response.data
    }
}
