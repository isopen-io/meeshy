import Foundation

// MARK: - Protocol

/// La chute détectée côté REST (#18748) : le rapport de l'iPhone, « Je vais bien », mon accord explicite, les épisodes
/// de mes Sangs et ce que je partage à une personne. Le service ne décide de rien — QUAND rapporter est l'affaire de
/// l'app, qui seule lit HealthKit, et la passerelle juge l'accord, l'âge et les cercles.
public protocol FallDetectionServiceProviding: Sendable {
    /// `POST /me/health/fall { detectedAt }` — un instant, rien d'autre.
    func report(detectedAt: Date) async -> FallReportOutcome
    /// `POST /me/health/fall/ok` — « Je vais bien » ; `true` quand un épisode a été clos.
    func answerOk() async -> Bool
    /// `GET /me/health/fall/settings`.
    func consentSettings() async throws -> FallConsentSettings
    /// `PUT /me/health/fall/settings` — l'accord sur la version lue, ou son retrait.
    func updateConsent(_ update: FallConsentUpdate) async -> FallConsentOutcome
    /// `GET /relations/falls` — les épisodes en cours, déjà filtrés pour moi.
    func snapshot() async throws -> [FallState]
    func personSettings(userId: String) async throws -> FallPersonSettings
    func updatePersonSettings(userId: String, isShared: Bool) async throws -> FallPersonSettings
}

public final class FallDetectionService: FallDetectionServiceProviding, Sendable {
    public static let shared = FallDetectionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func report(detectedAt: Date) async -> FallReportOutcome {
        do {
            let response: APIResponse<FallReportAck> = try await api.post(MeEndpoint.healthFall, body: FallReport(detectedAt: detectedAt))
            return response.data.recorded ? .recorded : .deduplicated
        } catch MeeshyError.forbidden {
            return .consentRequired
        } catch MeeshyError.server(let status, _) where status == 400 {
            return .rejected
        } catch {
            return .failed
        }
    }

    public func answerOk() async -> Bool {
        do {
            let response: APIResponse<FallOkAck> = try await api.post(MeEndpoint.healthFallOk, body: EmptyBody())
            return response.data.cleared
        } catch {
            return false
        }
    }

    public func consentSettings() async throws -> FallConsentSettings {
        let response: APIResponse<FallConsentSettings> = try await api.request(
            MeEndpoint.healthFallSettings, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updateConsent(_ update: FallConsentUpdate) async -> FallConsentOutcome {
        do {
            let response: APIResponse<FallConsentSettings> = try await api.put(MeEndpoint.healthFallSettings, body: update)
            return .saved(response.data)
        } catch MeeshyError.forbidden {
            return .minor
        } catch MeeshyError.server(let status, _) where status == 400 {
            return .staleVersion
        } catch {
            return .failed
        }
    }

    public func snapshot() async throws -> [FallState] {
        let response: APIResponse<FallSnapshot> = try await api.request(
            RelationsEndpoint.falls, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
    }

    public func personSettings(userId: String) async throws -> FallPersonSettings {
        let response: APIResponse<FallPersonSettings> = try await api.request(
            RelationsEndpoint.byUserIdFallSettings(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func updatePersonSettings(userId: String, isShared: Bool) async throws -> FallPersonSettings {
        let response: APIResponse<FallPersonSettings> = try await api.put(
            RelationsEndpoint.byUserIdFallSettings(userId: userId), body: FallPersonSettingsUpdate(isShared: isShared)
        )
        return response.data
    }

    private struct EmptyBody: Encodable {}
    private struct FallReportAck: Decodable { let recorded: Bool }
    private struct FallOkAck: Decodable { let cleared: Bool }
}
