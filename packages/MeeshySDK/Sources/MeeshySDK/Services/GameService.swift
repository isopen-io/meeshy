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
            MeEndpoint.gameMissionReroll(missionId: missionId), body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func claimChest(requestId: String) async throws -> ChestClaimResponse {
        let response: APIResponse<ChestClaimResponse> = try await api.post(
            MeEndpoint.gameChestClaim, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func buyFlameFreeze(requestId: String) async throws -> FlameFreezeResponse {
        let response: APIResponse<FlameFreezeResponse> = try await api.post(
            MeEndpoint.gameFlameFreezes, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func relightFlame(requestId: String) async throws -> FlameRelightResponse {
        let response: APIResponse<FlameRelightResponse> = try await api.post(
            MeEndpoint.gameFlameRelight, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func markGuideSeen(keys: [String], requestId: String) async throws -> GuideSeenResponse {
        let response: APIResponse<GuideSeenResponse> = try await api.post(
            MeEndpoint.gameGuideSeen, body: GuideSeenRequest(requestId: requestId, keys: keys))
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

// MARK: - Les écritures et lectures de la vague 2 (#9384 à #9392)
//
// Un SECOND protocole, jamais une extension du premier : ajouter une méthode à
// `GameServiceProviding` ferait rougir chaque double de test qui s'y conforme, et
// la vague 2 est opt-in (un serveur antérieur ne sert pas ces routes).
//
// Mêmes règles que le premier lot : chaque `requestId` est généré UNE fois par
// INTENTION ; un refus d'état (409) lève `MeeshyError.rejected`, que
// `GameService.refusal(of:)` lit en `GameErrorCode`.
public protocol GameWave2ServiceProviding: Sendable {
    func setLeagueConsent(_ consent: Bool, pseudonym: String?, requestId: String) async throws -> LeagueConsentResponse
    func setLeaguePseudonym(_ pseudonym: String, requestId: String) async throws -> LeaguePseudonymResponse
    func fetchLeagueWeek() async throws -> LeagueWeekResponse
    func fetchFriendsLeague() async throws -> LeagueFriendsResponse
    func inviteToDuo(friendId: String, requestId: String) async throws -> DuoInviteResponse
    func acceptDuo(duoId: String, requestId: String) async throws -> DuoStatusResponse
    func abandonDuo(duoId: String, requestId: String) async throws -> DuoStatusResponse
    func claimSeasonStep(_ step: Int, requestId: String) async throws -> SeasonClaimResponse
    func buySeasonSeal(requestId: String) async throws -> SeasonSealResponse
    func setShowcaseOrder(_ order: [String], requestId: String) async throws -> ShowcaseOrderResponse
    func setVisibility(_ request: ShowcaseVisibilityRequest) async throws -> ShowcaseVisibilityResponse
    func fetchUserShowcase(userId: String) async throws -> UserShowcaseResponse
    func passPrestige(requestId: String) async throws -> PrestigeResponse
    func setPrivacy(gameHidden: Bool?, friendsLeagueOptOut: Bool?, requestId: String) async throws -> GamePrivacyResponse
}

extension GameService: GameWave2ServiceProviding {
    public func setLeagueConsent(_ consent: Bool, pseudonym: String?, requestId: String) async throws -> LeagueConsentResponse {
        let response: APIResponse<LeagueConsentResponse> = try await api.post(
            MeEndpoint.gameLeagueConsent, body: LeagueConsentRequest(requestId: requestId, consent: consent, pseudonym: pseudonym))
        return response.data
    }

    public func setLeaguePseudonym(_ pseudonym: String, requestId: String) async throws -> LeaguePseudonymResponse {
        let response: APIResponse<LeaguePseudonymResponse> = try await api.put(
            MeEndpoint.gameLeaguePseudonym, body: LeaguePseudonymRequest(requestId: requestId, pseudonym: pseudonym))
        return response.data
    }

    public func fetchLeagueWeek() async throws -> LeagueWeekResponse {
        let response: APIResponse<LeagueWeekResponse> = try await api.request(MeEndpoint.gameLeagueWeek)
        return response.data
    }

    public func fetchFriendsLeague() async throws -> LeagueFriendsResponse {
        let response: APIResponse<LeagueFriendsResponse> = try await api.request(MeEndpoint.gameLeagueFriends)
        return response.data
    }

    public func inviteToDuo(friendId: String, requestId: String) async throws -> DuoInviteResponse {
        let response: APIResponse<DuoInviteResponse> = try await api.post(
            MeEndpoint.gameDuoInvite, body: DuoInviteRequest(requestId: requestId, friendId: friendId))
        return response.data
    }

    public func acceptDuo(duoId: String, requestId: String) async throws -> DuoStatusResponse {
        let response: APIResponse<DuoStatusResponse> = try await api.post(
            MeEndpoint.gameDuoAccept(duoId: duoId), body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func abandonDuo(duoId: String, requestId: String) async throws -> DuoStatusResponse {
        let response: APIResponse<DuoStatusResponse> = try await api.post(
            MeEndpoint.gameDuoAbandon(duoId: duoId), body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func claimSeasonStep(_ step: Int, requestId: String) async throws -> SeasonClaimResponse {
        let response: APIResponse<SeasonClaimResponse> = try await api.post(
            MeEndpoint.gameSeasonClaim(step: step), body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func buySeasonSeal(requestId: String) async throws -> SeasonSealResponse {
        let response: APIResponse<SeasonSealResponse> = try await api.post(
            MeEndpoint.gameSeasonSeal, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func setShowcaseOrder(_ order: [String], requestId: String) async throws -> ShowcaseOrderResponse {
        let response: APIResponse<ShowcaseOrderResponse> = try await api.put(
            MeEndpoint.gameShowcaseOrder, body: ShowcaseOrderRequest(requestId: requestId, order: order))
        return response.data
    }

    public func setVisibility(_ request: ShowcaseVisibilityRequest) async throws -> ShowcaseVisibilityResponse {
        let response: APIResponse<ShowcaseVisibilityResponse> = try await api.put(MeEndpoint.gameVisibility, body: request)
        return response.data
    }

    public func fetchUserShowcase(userId: String) async throws -> UserShowcaseResponse {
        let response: APIResponse<UserShowcaseResponse> = try await api.request(UsersEndpoint.gameShowcaseOf(userId: userId))
        return response.data
    }

    public func passPrestige(requestId: String) async throws -> PrestigeResponse {
        let response: APIResponse<PrestigeResponse> = try await api.post(
            MeEndpoint.gamePrestige, body: GameWriteRequest(requestId: requestId))
        return response.data
    }

    public func setPrivacy(gameHidden: Bool?, friendsLeagueOptOut: Bool?, requestId: String) async throws -> GamePrivacyResponse {
        let response: APIResponse<GamePrivacyResponse> = try await api.put(
            MeEndpoint.gamePrivacy,
            body: GamePrivacyRequest(requestId: requestId, gameHidden: gameHidden, friendsLeagueOptOut: friendsLeagueOptOut))
        return response.data
    }
}

// MARK: - Les lectures d'intégration (#9481)
//
// Un TROISIÈME protocole, pour la même raison que le second : ajouter une méthode à
// `GameWave2ServiceProviding` ferait rougir chaque double de test qui s'y conforme.
public protocol GameIntegrationServiceProviding: Sendable {
    /// L'état des réglages du jeu (`GET /me/game/privacy`) : les interrupteurs et les quatre visibilités.
    func fetchSettings() async throws -> GameSettingsResponse
    /// Ce que le jeu d'un AUTRE membre montre à ce lecteur (`GET /users/:userId/game`).
    func fetchUserGame(userId: String) async throws -> UserGameProfileResponse
}

extension GameService: GameIntegrationServiceProviding {
    public func fetchSettings() async throws -> GameSettingsResponse {
        let response: APIResponse<GameSettingsResponse> = try await api.request(MeEndpoint.gamePrivacy)
        return response.data
    }

    public func fetchUserGame(userId: String) async throws -> UserGameProfileResponse {
        let response: APIResponse<UserGameProfileResponse> = try await api.request(UsersEndpoint.gameOf(userId: userId))
        return response.data
    }
}
