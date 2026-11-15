import Foundation

// MARK: - Protocol

/// Le téléphone injoignable côté REST (#18737) : l'état des autres, les réglages des deux côtés, et le signe de vie
/// que MON téléphone rend à une sonde. Le service ne décide de rien : la passerelle sonde et juge.
public protocol PhoneReachabilityServiceProviding: Sendable {
    /// `GET /relations/phone-reachability` — l'état de chaque personne injoignable, déjà filtré pour moi.
    func snapshot() async throws -> [PhoneReachabilityState]
    /// `GET /relations/:userId/phone-reachability` — `nil` quand son téléphone répond ou hors droit.
    func state(userId: String) async throws -> PhoneReachabilityState?
    func personSettings(userId: String) async throws -> PhoneReachabilityPersonSettings
    func updatePersonSettings(userId: String, isShared: Bool) async throws -> PhoneReachabilityPersonSettings
    func emitterSettings() async throws -> PhoneReachabilityEmitterSettings
    func updateEmitterSettings(sharingEnabled: Bool) async throws -> PhoneReachabilityEmitterSettings
    /// `POST /me/device/alive` — la réponse de mon téléphone à un push silencieux `device_probe`.
    func alive() async -> PhoneAliveOutcome
}

public final class PhoneReachabilityService: PhoneReachabilityServiceProviding, Sendable {
    public static let shared = PhoneReachabilityService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func snapshot() async throws -> [PhoneReachabilityState] {
        let response: APIResponse<PhoneReachabilitySnapshot> = try await api.request(
            RelationsEndpoint.phoneReachability, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
    }

    public func state(userId: String) async throws -> PhoneReachabilityState? {
        let response: APIResponse<PhoneReachabilityStateEnvelope> = try await api.request(
            RelationsEndpoint.byUserIdPhoneReachability(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data.state
    }

    public func personSettings(userId: String) async throws -> PhoneReachabilityPersonSettings {
        let response: APIResponse<PhoneReachabilityPersonSettings> = try await api.request(
            RelationsEndpoint.byUserIdPhoneReachabilitySettings(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updatePersonSettings(userId: String, isShared: Bool) async throws -> PhoneReachabilityPersonSettings {
        let response: APIResponse<PhoneReachabilityPersonSettings> = try await api.put(
            RelationsEndpoint.byUserIdPhoneReachabilitySettings(userId: userId),
            body: PhoneReachabilityPersonSettingsUpdate(isShared: isShared)
        )
        return response.data
    }

    public func emitterSettings() async throws -> PhoneReachabilityEmitterSettings {
        let response: APIResponse<PhoneReachabilityEmitterSettings> = try await api.request(
            MeEndpoint.deviceReachabilitySettings, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updateEmitterSettings(sharingEnabled: Bool) async throws -> PhoneReachabilityEmitterSettings {
        let response: APIResponse<PhoneReachabilityEmitterSettings> = try await api.put(
            MeEndpoint.deviceReachabilitySettings, body: PhoneReachabilityEmitterSettings(sharingEnabled: sharingEnabled)
        )
        return response.data
    }

    public func alive() async -> PhoneAliveOutcome {
        do {
            let response: APIResponse<AliveAccepted> = try await api.post(MeEndpoint.deviceAlive, body: EmptyBody())
            return response.data.tracked ? .tracked : .ignored
        } catch {
            return .failed
        }
    }

    private struct EmptyBody: Encodable {}
    private struct AliveAccepted: Decodable { let tracked: Bool }
}
