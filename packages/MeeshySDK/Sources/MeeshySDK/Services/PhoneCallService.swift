import Foundation

// MARK: - Protocol

/// « En appel » côté REST (#18753) : le rapport de mon téléphone, les appels de mes Sangs, et les deux réglages. Le
/// service ne décide de rien — QUAND rapporter est l'affaire de l'app, qui seule voit les appels (`CXCallObserver`).
public protocol PhoneCallServiceProviding: Sendable {
    /// `POST /me/device/call { active }` — un booléen, et rien d'autre.
    func report(active: Bool) async -> PhoneCallReportOutcome
    /// `GET /relations/phone-calls` — les appels en cours, déjà filtrés pour moi.
    func snapshot() async throws -> [PhoneCallState]
    /// `GET /me/device/call/settings`.
    func emitterSettings() async throws -> PhoneCallEmitterSettings
    /// `PUT /me/device/call/settings` — couper, c'est couper pour tous (collecte comprise).
    func updateEmitterSettings(sharingEnabled: Bool) async throws -> PhoneCallEmitterSettings
    func personSettings(userId: String) async throws -> PhoneCallPersonSettings
    func updatePersonSettings(userId: String, isShared: Bool) async throws -> PhoneCallPersonSettings
}

public final class PhoneCallService: PhoneCallServiceProviding, Sendable {
    public static let shared = PhoneCallService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func report(active: Bool) async -> PhoneCallReportOutcome {
        do {
            let response: APIResponse<PhoneCallAck> = try await api.post(MeEndpoint.deviceCall, body: PhoneCallReport(active: active))
            return response.data.tracked ? .tracked : .ignored
        } catch {
            return .failed
        }
    }

    public func snapshot() async throws -> [PhoneCallState] {
        let response: APIResponse<PhoneCallSnapshot> = try await api.request(
            RelationsEndpoint.phoneCalls, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
    }

    public func emitterSettings() async throws -> PhoneCallEmitterSettings {
        let response: APIResponse<PhoneCallEmitterSettings> = try await api.request(
            MeEndpoint.deviceCallSettings, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updateEmitterSettings(sharingEnabled: Bool) async throws -> PhoneCallEmitterSettings {
        let response: APIResponse<PhoneCallEmitterSettings> = try await api.put(
            MeEndpoint.deviceCallSettings, body: PhoneCallEmitterSettings(sharingEnabled: sharingEnabled)
        )
        return response.data
    }

    public func personSettings(userId: String) async throws -> PhoneCallPersonSettings {
        let response: APIResponse<PhoneCallPersonSettings> = try await api.request(
            RelationsEndpoint.byUserIdPhoneCallSettings(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updatePersonSettings(userId: String, isShared: Bool) async throws -> PhoneCallPersonSettings {
        let response: APIResponse<PhoneCallPersonSettings> = try await api.put(
            RelationsEndpoint.byUserIdPhoneCallSettings(userId: userId),
            body: PhoneCallPersonSettingsUpdate(isShared: isShared)
        )
        return response.data
    }

    private struct PhoneCallAck: Decodable { let tracked: Bool }
}
