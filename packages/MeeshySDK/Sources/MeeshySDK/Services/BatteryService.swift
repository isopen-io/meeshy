import Foundation

// MARK: - Protocol

/// La batterie des proches côté REST (#14147) : l'état des autres, le relevé à la demande, les réglages des deux
/// côtés, et le relevé quand la socket n'est pas là. Le service ne décide d'aucun palier : la passerelle les tient.
public protocol BatteryServiceProviding: Sendable {
    /// `GET /relations/battery` — l'état de chaque personne en épisode, déjà filtré pour moi.
    func snapshot() async throws -> [BatteryReaderState]
    /// `GET /relations/:userId/battery` — `nil` hors épisode ou hors droit.
    func state(userId: String) async throws -> BatteryReaderState?
    /// `POST /relations/:userId/battery/pull` — demander un relevé (Sang seulement, limité par la passerelle).
    func pull(userId: String) async -> BatteryPullOutcome
    func personSettings(userId: String) async throws -> BatteryPersonSettings
    func updatePersonSettings(userId: String, _ update: BatteryPersonSettingsUpdate) async throws -> BatteryPersonSettings
    func emitterSettings() async throws -> BatteryEmitterSettings
    func updateEmitterSettings(sharingEnabled: Bool) async throws -> BatteryEmitterSettings
    /// `POST /me/device/battery` — le relevé par REST, quand la socket est absente.
    func report(_ report: BatteryReport) async -> BatteryReportOutcome
}

public final class BatteryService: BatteryServiceProviding, Sendable {
    public static let shared = BatteryService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func snapshot() async throws -> [BatteryReaderState] {
        let response: APIResponse<BatterySnapshot> = try await api.request(
            RelationsEndpoint.battery, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
    }

    public func state(userId: String) async throws -> BatteryReaderState? {
        let response: APIResponse<BatteryStateEnvelope> = try await api.request(
            RelationsEndpoint.byUserIdBattery(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data.state
    }

    public func pull(userId: String) async -> BatteryPullOutcome {
        do {
            let response: APIResponse<PullAccepted> = try await api.post(
                RelationsEndpoint.byUserIdBatteryPull(userId: userId), body: EmptyBody()
            )
            return .requested(at: WireDate.date(from: response.data.requestedAt) ?? Date())
        } catch MeeshyError.rejected(let rejection) {
            return Self.pullOutcome(code: rejection.code, statusCode: rejection.statusCode)
        } catch {
            return .failed
        }
    }

    public func personSettings(userId: String) async throws -> BatteryPersonSettings {
        let response: APIResponse<BatteryPersonSettings> = try await api.request(
            RelationsEndpoint.byUserIdBatterySettings(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updatePersonSettings(
        userId: String, _ update: BatteryPersonSettingsUpdate
    ) async throws -> BatteryPersonSettings {
        let response: APIResponse<BatteryPersonSettings> = try await api.put(
            RelationsEndpoint.byUserIdBatterySettings(userId: userId), body: update
        )
        return response.data
    }

    public func emitterSettings() async throws -> BatteryEmitterSettings {
        let response: APIResponse<BatteryEmitterSettings> = try await api.request(
            MeEndpoint.deviceBatterySettings, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updateEmitterSettings(sharingEnabled: Bool) async throws -> BatteryEmitterSettings {
        let response: APIResponse<BatteryEmitterSettings> = try await api.put(
            MeEndpoint.deviceBatterySettings, body: BatteryEmitterSettings(sharingEnabled: sharingEnabled)
        )
        return response.data
    }

    public func report(_ report: BatteryReport) async -> BatteryReportOutcome {
        do {
            let response: APIResponse<ReportAccepted> = try await api.post(MeEndpoint.deviceBattery, body: report)
            return response.data.tracked ? .tracked : .ignored
        } catch MeeshyError.rejected(let rejection) {
            return Self.reportOutcome(code: rejection.code)
        } catch {
            return .offline
        }
    }

    /// Le refus du relevé à la demande, lu par son code ; un 403 sans code reste un refus de droit.
    static func pullOutcome(code: String?, statusCode: Int) -> BatteryPullOutcome {
        switch code {
        case BatteryErrorCode.pullTooSoon: return .tooSoon
        case BatteryErrorCode.pullForbidden: return .forbidden
        case BatteryErrorCode.rateLimited: return .rateLimited
        default: return statusCode == 403 ? .forbidden : .failed
        }
    }

    static func reportOutcome(code: String?) -> BatteryReportOutcome {
        code == BatteryErrorCode.rateLimited ? .rateLimited : .refused
    }

    private struct EmptyBody: Encodable {}
    private struct PullAccepted: Decodable { let requestedAt: String }
    private struct ReportAccepted: Decodable { let tracked: Bool }
}
