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
    func ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?
    ) async throws -> RelationRitualStep
}

/// `GET /relations/now-playing` (#13934, #16686) — les écoutes en cours de mes liens, déjà
/// tronquées par la passerelle : un Proche ne reçoit que la catégorie, un Sang le titre et la
/// source qui lui ont été partagés. Le client ne recalcule rien.
public protocol RelationNowPlayingProviding: Sendable {
    func nowPlaying() async throws -> [RelationNowPlaying]
}

public struct RelationNowPlaying: Codable, Sendable, Equatable {
    public let userId: String
    /// Brute (`music`, `video`, `browsing`) : une catégorie ajoutée au serveur n'est pas fatale.
    public let category: String
    public let title: String?
    public let source: String?
    public let updatedAt: String
    public let expiresAt: String

    public init(userId: String, category: String, title: String? = nil, source: String? = nil, updatedAt: String, expiresAt: String) {
        self.userId = userId
        self.category = category
        self.title = title
        self.source = source
        self.updatedAt = updatedAt
        self.expiresAt = expiresAt
    }
}

public struct RelationNowPlayingSnapshot: Codable, Sendable, Equatable {
    public let items: [RelationNowPlaying]

    public init(items: [RelationNowPlaying]) {
        self.items = items
    }
}

public final class RelationsService: RelationsProviding, RelationNowPlayingProviding, Sendable {
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

    public func nowPlaying() async throws -> [RelationNowPlaying] {
        let response: APIResponse<RelationNowPlayingSnapshot> = try await api.request(
            RelationsEndpoint.nowPlaying, method: "GET", body: nil, queryItems: nil
        )
        return response.data.items
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
