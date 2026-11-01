import Foundation

// MARK: - Protocol

/// La lecture des cercles et le rituel du Sang (`/api/v1/relations`, #13933, #13938).
///
/// Le service ne décide d'aucun niveau : la passerelle sert le lien, sa progression et son
/// éligibilité ; il porte les phases du rituel et laisse les refus typés remonter
/// (`RelationRefusal.from`).
public protocol RelationsProviding: Sendable {
    func links() async throws -> [RelationLink]
    func config() async throws -> RelationsConfig
    func ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?
    ) async throws -> RelationRitualStep
}

public final class RelationsService: RelationsProviding, Sendable {
    public static let shared = RelationsService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// `GET /relations` — chaque lien d'au moins Connaissance.
    public func links() async throws -> [RelationLink] {
        let response: APIResponse<[RelationLink]> = try await api.request(
            RelationsEndpoint.root, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    /// `GET /relations/config` — niveaux, libellés des sept langues, seuils servis.
    public func config() async throws -> RelationsConfig {
        let response: APIResponse<RelationsConfig> = try await api.request(
            RelationsEndpoint.config, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    /// `POST /relations/:userId/ritual` — `start` ouvre ou rejoint, `hold` se rejoue tant
    /// qu'on tient l'écran, `confirm` exige les quatre consentements explicites.
    public func ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?
    ) async throws -> RelationRitualStep {
        let body = RitualBody(phase: phase.rawValue, token: token, consents: consents)
        let response: APIResponse<RelationRitualStep> = try await api.post(
            RelationsEndpoint.byUserIdRitual(userId: userId), body: body
        )
        return response.data
    }

    private struct RitualBody: Encodable {
        let phase: String
        let token: String?
        let consents: RelationRitualConsents?
    }
}
