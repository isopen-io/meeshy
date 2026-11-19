import Foundation

// MARK: - Protocol

/// La vérification d'inactivité côté REST (#18738) : les alertes de mes Sangs, mon délai, ce que je partage à une
/// personne, et ma réponse « Je vais bien ». Le service ne décide de rien : la passerelle juge.
public protocol InactivityCheckServiceProviding: Sendable {
    /// `GET /relations/inactivity` — les alertes en cours, déjà filtrées pour moi.
    func snapshot() async throws -> [InactivityAlertState]
    /// `GET /me/wellness/settings`.
    func settings() async throws -> InactivityCheckSettings
    /// `PUT /me/wellness/settings` — 6, 12 ou 24 h, ou la coupure pour tous.
    func updateSettings(delay: InactivityCheckDelay) async throws -> InactivityCheckSettings
    func personSettings(userId: String) async throws -> InactivityPersonSettings
    func updatePersonSettings(userId: String, isShared: Bool) async throws -> InactivityPersonSettings
    /// `POST /me/wellness/ok` — « Je vais bien », de n'importe lequel de mes appareils.
    func answerWellness() async -> WellnessAnswerOutcome
}

public final class InactivityCheckService: InactivityCheckServiceProviding, Sendable {
    public static let shared = InactivityCheckService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func snapshot() async throws -> [InactivityAlertState] {
        let response: APIResponse<InactivitySnapshot> = try await api.request(
            RelationsEndpoint.inactivity, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
    }

    public func settings() async throws -> InactivityCheckSettings {
        let response: APIResponse<InactivityCheckSettings> = try await api.request(
            MeEndpoint.wellnessSettings, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updateSettings(delay: InactivityCheckDelay) async throws -> InactivityCheckSettings {
        let response: APIResponse<InactivityCheckSettings> = try await api.put(
            MeEndpoint.wellnessSettings, body: InactivityCheckSettings(delay: delay)
        )
        return response.data
    }

    public func personSettings(userId: String) async throws -> InactivityPersonSettings {
        let response: APIResponse<InactivityPersonSettings> = try await api.request(
            RelationsEndpoint.byUserIdInactivitySettings(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updatePersonSettings(userId: String, isShared: Bool) async throws -> InactivityPersonSettings {
        let response: APIResponse<InactivityPersonSettings> = try await api.put(
            RelationsEndpoint.byUserIdInactivitySettings(userId: userId),
            body: InactivityPersonSettingsUpdate(isShared: isShared)
        )
        return response.data
    }

    public func answerWellness() async -> WellnessAnswerOutcome {
        do {
            let response: APIResponse<WellnessAccepted> = try await api.post(MeEndpoint.wellnessOk, body: EmptyBody())
            return response.data.tracked ? .tracked : .ignored
        } catch {
            return .failed
        }
    }

    private struct EmptyBody: Encodable {}
    private struct WellnessAccepted: Decodable { let tracked: Bool }
}
