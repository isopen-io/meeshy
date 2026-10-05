import Foundation

/// Les cinq écritures du Jeu Meeshy (#9378). La LECTURE du bloc `game` n'a pas
/// d'adresse propre : elle voyage dans `APIEngagementProgress.game`, servi par
/// `EngagementProgressProviding.fetchProgress()` — un seul aller-retour pour
/// l'écran Progression, jamais deux.
///
/// Chaque `requestId` est généré UNE fois par INTENTION (le tap de l'utilisateur),
/// jamais par requête : un réessai réseau le rejoue tel quel et la passerelle
/// rend le résultat de la première écriture, jamais une seconde.
///
/// Un refus d'état (409) lève `MeeshyError.rejected` ; `GameService.refusal(of:)`
/// en lit le `GameErrorCode`.
public protocol GameServiceProviding: Sendable {
    /// Changer une mission du jour — 1 Meesh, une fois par jour, même difficulté.
    func rerollMission(missionId: String, requestId: String) async throws -> MissionRerollResponse
    /// Ouvrir le coffre du jour, une fois toutes les missions finies.
    func claimChest(requestId: String) async throws -> ChestClaimResponse
    /// Acheter UN gel de Flamme (1 Meesh, 2 en réserve au plus).
    func buyFlameFreeze(requestId: String) async throws -> FlameFreezeResponse
    /// Rallumer une Flamme éteinte (3 Meeshes, 48 h, une fois par mois).
    func relightFlame(requestId: String) async throws -> FlameRelightResponse
    /// Marquer des moments du guide (ou des étapes d'intégration) comme vus.
    func markGuideSeen(keys: [String], requestId: String) async throws -> GuideSeenResponse
}

public final class GameService: GameServiceProviding, @unchecked Sendable {
    public static let shared = GameService()
    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func rerollMission(missionId: String, requestId: String) async throws -> MissionRerollResponse {
        let response: APIResponse<MissionRerollResponse> = try await api.post(
            GameEndpoint.missionReroll(missionId: missionId), body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func claimChest(requestId: String) async throws -> ChestClaimResponse {
        let response: APIResponse<ChestClaimResponse> = try await api.post(
            GameEndpoint.chestClaim, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func buyFlameFreeze(requestId: String) async throws -> FlameFreezeResponse {
        let response: APIResponse<FlameFreezeResponse> = try await api.post(
            GameEndpoint.flameFreezes, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func relightFlame(requestId: String) async throws -> FlameRelightResponse {
        let response: APIResponse<FlameRelightResponse> = try await api.post(
            GameEndpoint.flameRelight, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func markGuideSeen(keys: [String], requestId: String) async throws -> GuideSeenResponse {
        let response: APIResponse<GuideSeenResponse> = try await api.post(
            GameEndpoint.guideSeen, body: GuideSeenRequest(requestId: requestId, keys: keys))
        return response.data
    }

    /// Le code de refus qu'une erreur transporte — `nil` pour tout ce qui n'est
    /// pas un refus d'état du jeu (réseau, 5xx, code inconnu d'une version plus
    /// récente du serveur).
    public static func refusal(of error: Error) -> GameErrorCode? {
        guard case MeeshyError.rejected(let rejection) = error, let code = rejection.code else { return nil }
        return GameErrorCode(rawValue: code)
    }
}
