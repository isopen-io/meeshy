import Foundation
import MeeshySDK

/// Le second contrat du jeu (`GameWave2ServiceProviding`) : des résultats posés par le test, des appels comptés.
final class MockGameWave2Service: GameWave2ServiceProviding, @unchecked Sendable {
    private static var down: Error { URLError(.notConnectedToInternet) }

    var consentResult: Result<LeagueConsentResponse, Error> = .failure(down)
    var pseudonymResult: Result<LeaguePseudonymResponse, Error> = .failure(down)
    var weekResult: Result<LeagueWeekResponse, Error> = .failure(down)
    var friendsLeagueResult: Result<LeagueFriendsResponse, Error> = .failure(down)
    var inviteResult: Result<DuoInviteResponse, Error> = .failure(down)
    var acceptResult: Result<DuoStatusResponse, Error> = .failure(down)
    var abandonResult: Result<DuoStatusResponse, Error> = .failure(down)
    var claimResult: Result<SeasonClaimResponse, Error> = .failure(down)
    var sealResult: Result<SeasonSealResponse, Error> = .failure(down)
    var orderResult: Result<ShowcaseOrderResponse, Error> = .failure(down)
    var visibilityResult: Result<ShowcaseVisibilityResponse, Error> = .failure(down)
    var showcaseResult: Result<UserShowcaseResponse, Error> = .failure(down)
    var prestigeResult: Result<PrestigeResponse, Error> = .failure(down)
    var privacyResult: Result<GamePrivacyResponse, Error> = .failure(down)

    private(set) var consentCalls: [(consent: Bool, pseudonym: String?, requestId: String)] = []
    private(set) var claimCalls: [(step: Int, requestId: String)] = []
    private(set) var sealRequestIds: [String] = []
    private(set) var weekCallCount = 0
    private(set) var showcaseUserIds: [String] = []
    private(set) var prestigeRequestIds: [String] = []
    private(set) var privacyCalls: [(gameHidden: Bool?, friendsLeagueOptOut: Bool?)] = []

    func setLeagueConsent(_ consent: Bool, pseudonym: String?, requestId: String) async throws -> LeagueConsentResponse {
        consentCalls.append((consent, pseudonym, requestId))
        return try consentResult.get()
    }

    func setLeaguePseudonym(_ pseudonym: String, requestId: String) async throws -> LeaguePseudonymResponse {
        try pseudonymResult.get()
    }

    func fetchLeagueWeek() async throws -> LeagueWeekResponse {
        weekCallCount += 1
        return try weekResult.get()
    }

    func fetchFriendsLeague() async throws -> LeagueFriendsResponse { try friendsLeagueResult.get() }
    func inviteToDuo(friendId: String, requestId: String) async throws -> DuoInviteResponse { try inviteResult.get() }
    func acceptDuo(duoId: String, requestId: String) async throws -> DuoStatusResponse { try acceptResult.get() }
    func abandonDuo(duoId: String, requestId: String) async throws -> DuoStatusResponse { try abandonResult.get() }

    func claimSeasonStep(_ step: Int, requestId: String) async throws -> SeasonClaimResponse {
        claimCalls.append((step, requestId))
        return try claimResult.get()
    }

    func buySeasonSeal(requestId: String) async throws -> SeasonSealResponse {
        sealRequestIds.append(requestId)
        return try sealResult.get()
    }

    func setShowcaseOrder(_ order: [String], requestId: String) async throws -> ShowcaseOrderResponse { try orderResult.get() }
    func setVisibility(_ request: ShowcaseVisibilityRequest) async throws -> ShowcaseVisibilityResponse { try visibilityResult.get() }

    func fetchUserShowcase(userId: String) async throws -> UserShowcaseResponse {
        showcaseUserIds.append(userId)
        return try showcaseResult.get()
    }

    func passPrestige(requestId: String) async throws -> PrestigeResponse {
        prestigeRequestIds.append(requestId)
        return try prestigeResult.get()
    }

    func setPrivacy(gameHidden: Bool?, friendsLeagueOptOut: Bool?, requestId: String) async throws -> GamePrivacyResponse {
        privacyCalls.append((gameHidden, friendsLeagueOptOut))
        return try privacyResult.get()
    }
}
