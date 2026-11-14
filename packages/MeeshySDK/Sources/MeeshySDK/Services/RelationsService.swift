import Foundation

// MARK: - Protocol

/// La lecture des cercles et le rituel du Sang (`/api/v1/relations`, #13933, #13938).
///
/// Le service ne décide d'aucun niveau : la passerelle sert le lien, sa progression et son
/// éligibilité ; il porte les phases du rituel et laisse les refus typés remonter
/// (`RelationRefusal.from`).
public protocol RelationsProviding: Sendable {
    func links() async throws -> [RelationLink]
    /// `GET /relations/:userId` — le lien avec UNE personne, blocage de montée compris quand il est servi.
    func link(userId: String) async throws -> RelationLink
    /// `POST /relations/:userId/level` — baisse MON accord vers `level` (`public` annule le lien). Silencieux.
    func lower(userId: String, to level: RelationLevel) async throws -> RelationLink
    func config() async throws -> RelationsConfig
    /// `GET /relations/now-playing` — les écoutes de mes Proches et de mes Sangs, déjà tronquées pour moi (#16755).
    func nowPlaying() async throws -> [NowPlayingChanged]
    /// `GET /relations/locations?bbox=` — les positions qu'on me partage, à la précision qu'on m'a donnée (#16983).
    /// `nil` couvre toute la carte.
    func sharedLocations(within bounds: SharedLocationBounds?) async throws -> [SharedLocationChanged]
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

    public func link(userId: String) async throws -> RelationLink {
        let response: APIResponse<RelationLink> = try await api.request(
            RelationsEndpoint.byUserId(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func lower(userId: String, to level: RelationLevel) async throws -> RelationLink {
        let response: APIResponse<RelationLink> = try await api.post(
            RelationsEndpoint.byUserIdLevel(userId: userId), body: LevelBody(level: level.rawValue)
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

    public func nowPlaying() async throws -> [NowPlayingChanged] {
        let response: APIResponse<NowPlayingSnapshot> = try await api.request(
            RelationsEndpoint.nowPlaying, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
    }

    public func sharedLocations(within bounds: SharedLocationBounds?) async throws -> [SharedLocationChanged] {
        let query = bounds.map { [URLQueryItem(name: "bbox", value: $0.queryValue)] }
        let response: APIResponse<SharedLocationSnapshot> = try await api.request(
            RelationsEndpoint.locations, method: "GET", body: nil, queryItems: query
        )
        return response.data.items
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

    private struct LevelBody: Encodable {
        let level: String
    }

    private struct RitualBody: Encodable {
        let phase: String
        let token: String?
        let consents: RelationRitualConsents?
    }
}
