import XCTest
@testable import Meeshy
import MeeshySDK

/// Les gestes et les lectures de la vague 2 de bout en bout (#9481) : optimiste puis relu, restauré sur refus,
/// identifiant d'idempotence conservé après un échec réseau, lecture cache-first.
@MainActor
final class GameWave2ModelTests: XCTestCase {

    private actor MemoryCache: GameWave2Caching {
        private var store: [String: Data] = [:]
        func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T? {
            store[name].flatMap { try? JSONDecoder().decode(T.self, from: $0) }
        }
        func save<T: Encodable & Sendable>(_ value: T, name: String) async { store[name] = try? JSONEncoder().encode(value) }
        func remove(name: String) async { store[name] = nil }
        func has(_ name: String) -> Bool { store[name] != nil }
    }

    private struct NoFriends: GameFriendsProviding {
        func friends() async -> [GameFriend] { [] }
    }

    private struct Rig {
        let sut: GameWave2Model
        let service: MockGameWave2Service
        let integration: MockGameIntegrationService
        let cache: MemoryCache
        let prefs: GameDevicePrefsStore
        let userId: String
    }

    private func makeSUT(game: GameBlock = GameWave2Fixture.game()) -> Rig {
        let userId = "me-\(UUID().uuidString)"
        let progression = ProgressionViewModel(
            service: {
                let engagement = MockEngagementProgressService()
                engagement.fetchProgressResult = .success(GameFixture.snapshot(game))
                return engagement
            }(),
            gameService: MockGameService(),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: userId,
            notebook: MockGamePhotoNotebook()
        )
        let service = MockGameWave2Service()
        let integration = MockGameIntegrationService()
        let cache = MemoryCache()
        let prefs = GameDevicePrefsStore(userId: userId, defaults: UserDefaults(suiteName: userId) ?? .standard)
        let sut = GameWave2Model(
            progression: progression, service: service, integration: integration, cache: cache, friends: NoFriends(),
            prefs: prefs, currentUserId: userId
        )
        return Rig(sut: sut, service: service, integration: integration, cache: cache, prefs: prefs, userId: userId)
    }

    private func week(rank: Int = 3) -> LeagueWeekResponse {
        LeagueWeekResponse(
            weekKey: "2026-10-12", snapshotDay: "2026-10-14", closes: .init(dayKey: "2026-10-18", minuteOfDay: 1200), placed: true,
            league: .jade, groupId: "g1",
            entries: [LeagueWeekEntry(rank: rank, displayName: "Colibri-0042", weekPoints: 120, zone: .safe, cup: nil, isMe: true)]
        )
    }

    private func refusal(_ code: GameErrorCode) -> Error {
        MeeshyError.rejected(APIRejection(statusCode: 409, code: code.rawValue, message: "refus"))
    }

    // MARK: - La saison

    func test_claim_sendsTheStepOnce_andLeavesNoErrorBehind() async {
        let rig = makeSUT()
        await rig.sut.progression.load(forceNetwork: true)
        rig.service.claimResult = .success(SeasonClaimResponse(
            status: "claimed", step: 3, reward: .init(kind: .points, amount: 40), seal: nil, completed: false, gloryGained: 0, score: 12_220))

        await rig.sut.claim(step: 3)

        XCTAssertEqual(rig.service.claimCalls.map(\.step), [3])
        XCTAssertNil(rig.sut.errors.claim)
        XCTAssertNil(rig.sut.pending.claimingStep)
    }

    func test_claim_aNetworkFailure_saysWhy_andARetryReplaysTheSameRequestId() async {
        let rig = makeSUT()
        await rig.sut.progression.load(forceNetwork: true)

        await rig.sut.claim(step: 3)
        let first = rig.service.claimCalls.first?.requestId
        XCTAssertNotNil(rig.sut.errors.claim)
        XCTAssertEqual(rig.sut.game?.season?.claimedSteps, [1, 2], "le geste est restauré")

        await rig.sut.claim(step: 3)
        XCTAssertEqual(rig.service.claimCalls.map(\.requestId), [first, first].compactMap { $0 }, "un réessai est la MÊME requête")
    }

    func test_claim_aRefusal_restoresTheScreen_andRereadsIt() async {
        let rig = makeSUT()
        await rig.sut.progression.load(forceNetwork: true)
        rig.service.claimResult = .failure(refusal(.seasonStepLocked))

        await rig.sut.claim(step: 3)

        XCTAssertNotNil(rig.sut.errors.claim)
        XCTAssertEqual(rig.sut.game?.season?.claimedSteps, [1, 2])
    }

    func test_claim_twoTapsAtOnce_areOneGesture() async {
        let rig = makeSUT()
        await rig.sut.progression.load(forceNetwork: true)
        rig.sut.pending.claimingStep = 3

        await rig.sut.claim(step: 3)

        XCTAssertTrue(rig.service.claimCalls.isEmpty)
    }

    // MARK: - La ligue

    func test_loadWeek_servesTheDiskFirst_andAFailureNeverReplacesIt() async {
        let rig = makeSUT()
        await rig.cache.save(week(rank: 5), name: GameWave2CacheName.leagueWeek)

        await rig.sut.loadWeek()

        XCTAssertEqual(rig.sut.week.value?.entries.first?.rank, 5)
        XCTAssertNotNil(rig.sut.week.errorMessage)
        XCTAssertFalse(rig.sut.week.failedWithoutValue, "le cache a quelque chose : jamais d'erreur plein écran")
        XCTAssertFalse(rig.sut.week.showsSkeleton)
    }

    func test_loadWeek_theServedWeekReplacesTheCache_andIsKept() async {
        let rig = makeSUT()
        rig.service.weekResult = .success(week(rank: 2))

        await rig.sut.loadWeek()

        XCTAssertEqual(rig.sut.week.value?.entries.first?.rank, 2)
        let kept = await rig.cache.load(LeagueWeekResponse.self, name: GameWave2CacheName.leagueWeek)
        XCTAssertEqual(kept?.entries.first?.rank, 2)
    }

    func test_loadWeek_noCacheAndNoNetwork_isAnErrorBlock_notASkeleton() async {
        let rig = makeSUT()

        await rig.sut.loadWeek()

        XCTAssertNil(rig.sut.week.value)
        XCTAssertTrue(rig.sut.week.failedWithoutValue)
        XCTAssertFalse(rig.sut.week.showsSkeleton)
    }

    func test_leavingTheLeague_removesTheStandingsFromTheDisk() async {
        let rig = makeSUT()
        rig.service.weekResult = .success(week())
        await rig.sut.progression.load(forceNetwork: true)
        await rig.sut.loadWeek()
        let before = await rig.cache.has(GameWave2CacheName.leagueWeek)
        XCTAssertTrue(before)
        rig.service.consentResult = .success(LeagueConsentResponse(consent: false, pseudonym: nil))

        await rig.sut.setConsent(false)

        XCTAssertNil(rig.sut.week.value, "les pseudonymes des autres ne restent pas à l'écran")
        var after = true
        for _ in 0..<50 where after {
            after = await rig.cache.has(GameWave2CacheName.leagueWeek)
            if after { await Task.yield() }
        }
        XCTAssertFalse(after, "ni sur le disque d'une personne qui n'y joue plus")
        XCTAssertEqual(rig.service.consentCalls.first?.consent, false)
    }

    // MARK: - La ligue s'ouvre : le classement se lit

    func test_leagueLoadKey_changesWhenTheLeagueOpens_soTheStandingsAreRead() {
        let before = GameLeagueScreen.loadKey(tab: .mine, access: .consentRequired)
        let after = GameLeagueScreen.loadKey(tab: .mine, access: .open)

        XCTAssertNotEqual(before, after, "consentir ouvre la ligue : le classement doit se lire sans quitter la page")
        XCTAssertEqual(
            GameLeagueScreen.loadKey(tab: .friends, access: .consentRequired),
            GameLeagueScreen.loadKey(tab: .friends, access: .open),
            "la ligue Amis ne dépend pas du consentement : elle ne se relit pas pour lui"
        )
    }

    // MARK: - L'opposition à la ligue Amis (conformité B-2)

    func test_friendsLeagueOptOut_theConfirmedChoiceOutlivesTheScreen() async {
        let rig = makeSUT()
        XCTAssertFalse(rig.sut.friendsLeagueOptedOut)
        rig.service.privacyResult = .success(GamePrivacyResponse(gameHidden: false, friendsLeagueOptOut: true))

        await rig.sut.setFriendsLeagueOptOut(true)

        XCTAssertTrue(rig.sut.friendsLeagueOptedOut)
        let reopened = GameWave2Model(
            progression: rig.sut.progression, service: rig.service, cache: rig.cache, friends: NoFriends(),
            prefs: rig.prefs, currentUserId: rig.userId
        )
        XCTAssertTrue(reopened.friendsLeagueOptedOut, "l'interrupteur dit ce que le serveur a confirmé, même après être sorti de la page")
    }

    func test_friendsLeagueOptOut_aFailure_leavesTheSwitchWhereItWas() async {
        let rig = makeSUT()

        await rig.sut.setFriendsLeagueOptOut(true)

        XCTAssertFalse(rig.sut.friendsLeagueOptedOut)
        XCTAssertNotNil(rig.sut.errors.friendsOptOut)
    }

    // MARK: - La vitrine d'un autre (#9387, conformité D-1, D-5)

    private func visitorShowcase() -> UserShowcaseResponse {
        UserShowcaseResponse(visible: true, items: [GameVisitorTrophyItem(key: "season-cup:1", awardedMonth: "2026-12")], order: [])
    }

    func test_showcaseLoader_aServerRefusal_forgetsTheCachedShowcase_andShowsNothing() async {
        for answer: Error in [
            MeeshyError.forbidden(reason: nil, body: nil),
            MeeshyError.server(statusCode: 404, message: "absent"),
            refusal(.leagueLocked),
        ] {
            let service = MockGameWave2Service()
            let cache = MemoryCache()
            let name = GameWave2CacheName.showcase("u1")
            await cache.save(visitorShowcase(), name: name)
            service.showcaseResult = .failure(answer)

            let served = await GameShowcaseLoader(service: service, cache: cache, currentUserId: "me").load(userId: "u1")

            XCTAssertNil(served, "le serveur a répondu : une vitrine fermée (blocage, réglage) ne se rouvre pas depuis le disque — \(answer)")
            let kept = await cache.has(name)
            XCTAssertFalse(kept, "ni ne reste sur l'appareil — \(answer)")
        }
    }

    func test_showcaseLoader_withoutNetwork_servesWhatTheDiskKept() async {
        let service = MockGameWave2Service()
        let cache = MemoryCache()
        await cache.save(visitorShowcase(), name: GameWave2CacheName.showcase("u1"))

        let served = await GameShowcaseLoader(service: service, cache: cache, currentUserId: "me").load(userId: "u1")

        XCTAssertEqual(served, visitorShowcase())
    }

    func test_showcaseLoader_cached_paintsFromTheDiskWithoutTheNetwork() async {
        let service = MockGameWave2Service()
        let cache = MemoryCache()
        await cache.save(visitorShowcase(), name: GameWave2CacheName.showcase("u1"))

        let cached = await GameShowcaseLoader(service: service, cache: cache, currentUserId: "me").cached(userId: "u1")

        XCTAssertEqual(cached, visitorShowcase())
        XCTAssertTrue(service.showcaseUserIds.isEmpty, "le cache se peint avant toute requête")
    }

    // MARK: - Les réglages relus au serveur (#9481)

    private func served(hidden: Bool, friendsOptOut: Bool) -> GameSettingsResponse {
        GameSettingsResponse(
            gameHidden: hidden, friendsLeagueOptOut: friendsOptOut,
            visibility: GameVisibility(showcase: .friends, rank: .friends, treasury: .friends, atlas: .me))
    }

    func test_loadSettings_theServedStateReplacesTheDeviceCopy() async {
        let rig = makeSUT()
        rig.integration.settingsResult = .success(served(hidden: true, friendsOptOut: true))

        await rig.sut.loadSettings()

        XCTAssertTrue(rig.prefs.prefs.hidden, "« Jeu masqué » posé depuis un autre appareil se lit ici")
        XCTAssertTrue(rig.sut.friendsLeagueOptedOut)
        XCTAssertEqual(rig.sut.privacy, GamePrivacyResponse(gameHidden: true, friendsLeagueOptOut: true))
    }

    func test_loadSettings_theServerCanReopenWhatTheDeviceHad() async {
        let rig = makeSUT()
        rig.prefs.set(hidden: true, friendsLeagueOptOut: true)
        rig.integration.settingsResult = .success(served(hidden: false, friendsOptOut: false))

        await rig.sut.loadSettings()

        XCTAssertFalse(rig.prefs.prefs.hidden)
        XCTAssertFalse(rig.sut.friendsLeagueOptedOut)
    }

    func test_loadSettings_withoutNetwork_theDeviceCopyStaysTheLastKnownState() async {
        let rig = makeSUT()
        rig.prefs.set(hidden: true, friendsLeagueOptOut: true)

        await rig.sut.loadSettings()

        XCTAssertEqual(rig.integration.settingsCallCount, 1)
        XCTAssertTrue(rig.prefs.prefs.hidden)
        XCTAssertTrue(rig.sut.friendsLeagueOptedOut, "hors ligne : la dernière copie répond")
        XCTAssertNil(rig.sut.privacy, "rien n'a été confirmé")
    }

    func test_settingsSync_putsTheServedStateOnTheDevice_andRendersIt() async {
        let rig = makeSUT()
        rig.integration.settingsResult = .success(served(hidden: true, friendsOptOut: false))

        let result = await GameSettingsSync(service: rig.integration, prefs: rig.prefs).refresh()

        XCTAssertEqual(result?.gameHidden, true)
        XCTAssertTrue(rig.prefs.prefs.hidden)
        XCTAssertFalse(rig.prefs.prefs.friendsLeagueOptOut)
    }

    func test_settingsSync_withoutNetwork_changesNothing() async {
        let rig = makeSUT()
        rig.prefs.set(hidden: true)

        let result = await GameSettingsSync(service: rig.integration, prefs: rig.prefs).refresh()

        XCTAssertNil(result)
        XCTAssertTrue(rig.prefs.prefs.hidden)
    }

    // MARK: - Le jeu d'un autre (#9481)

    private func otherGame() -> UserGameProfileResponse {
        UserGameProfileResponse(
            visible: true,
            standing: GameStanding(level: 42, tier: .eclat, prestige: 1, flame: .brasier, rank: .voix, division: .ii),
            treasury: GameShownTreasury(tier: .coffre))
    }

    func test_userGameLoader_servedGame_isShownAndKeptOnDisk() async {
        let integration = MockGameIntegrationService()
        let cache = MemoryCache()
        integration.userGameResult = .success(otherGame())

        let content = await GameUserGameLoader(service: integration, cache: cache, currentUserId: "me").load(userId: "u1")

        XCTAssertEqual(content?.standing?.level, 42)
        XCTAssertEqual(content?.treasuryTier, .coffre)
        let kept = await cache.has(GameWave2CacheName.userGame("u1"))
        XCTAssertTrue(kept)
    }

    func test_userGameLoader_cached_paintsFromTheDiskWithoutTheNetwork() async {
        let integration = MockGameIntegrationService()
        let cache = MemoryCache()
        await cache.save(otherGame(), name: GameWave2CacheName.userGame("u1"))

        let cached = await GameUserGameLoader(service: integration, cache: cache, currentUserId: "me").cached(userId: "u1")

        XCTAssertEqual(cached?.standing?.rank, .voix)
        XCTAssertTrue(integration.userGameIds.isEmpty, "le cache se peint avant toute requête")
    }

    func test_userGameLoader_aRefusal_showsNothing_andForgetsTheCachedCopy() async {
        let integration = MockGameIntegrationService()
        let cache = MemoryCache()
        let name = GameWave2CacheName.userGame("u1")
        await cache.save(otherGame(), name: name)
        integration.userGameResult = .success(.hidden)

        let content = await GameUserGameLoader(service: integration, cache: cache, currentUserId: "me").load(userId: "u1")

        XCTAssertNil(content, "visible:false : rien à montrer, comme pour un compte inconnu")
        let cached = await GameUserGameLoader(service: integration, cache: cache, currentUserId: "me").cached(userId: "u1")
        XCTAssertNil(cached, "la copie gardée est remplacée par le refus : jamais rouverte depuis le disque")
    }

    func test_userGameLoader_aServerAnswerThatIsNotAGame_forgetsTheCachedCopy() async {
        for answer: Error in [MeeshyError.forbidden(reason: nil, body: nil), MeeshyError.server(statusCode: 404, message: "absent")] {
            let integration = MockGameIntegrationService()
            let cache = MemoryCache()
            let name = GameWave2CacheName.userGame("u1")
            await cache.save(otherGame(), name: name)
            integration.userGameResult = .failure(answer)

            let content = await GameUserGameLoader(service: integration, cache: cache, currentUserId: "me").load(userId: "u1")

            XCTAssertNil(content, "\(answer)")
            let kept = await cache.has(name)
            XCTAssertFalse(kept, "\(answer)")
        }
    }

    func test_userGameLoader_withoutNetwork_servesWhatTheDiskKept() async {
        let integration = MockGameIntegrationService()
        let cache = MemoryCache()
        await cache.save(otherGame(), name: GameWave2CacheName.userGame("u1"))

        let content = await GameUserGameLoader(service: integration, cache: cache, currentUserId: "me").load(userId: "u1")

        XCTAssertEqual(content?.standing?.level, 42)
    }

    func test_standingContent_isNilWhenThereIsNothingToShow() {
        XCTAssertNil(GameStandingContent.of(nil))
        XCTAssertNil(GameStandingContent.of(.hidden))
        XCTAssertNil(GameStandingContent.of(UserGameProfileResponse(visible: true, standing: nil, treasury: GameShownTreasury(tier: nil))))
        XCTAssertNotNil(GameStandingContent.of(UserGameProfileResponse(visible: true, standing: nil, treasury: GameShownTreasury(tier: .bourse))))
    }

    func test_standingContent_isReadAsOneSentence_levelRankFlameAndTreasury() throws {
        let content = try XCTUnwrap(GameStandingContent.of(otherGame()))

        let label = content.accessibilityLabel
        XCTAssertTrue(label.contains(GameCopy.tierName(.eclat)), label)
        XCTAssertTrue(label.contains(GameCopy.rankLabel(.voix, division: .ii)), label)
        XCTAssertTrue(label.contains(GameCopy.flameFormName(.brasier)), label)
        XCTAssertTrue(label.contains(GameCopy.treasuryName(.coffre)), label)
    }

    /// La carte d'un visiteur est montée par une injection `AnyView` à une place FIXE de la feuille de profil :
    /// passer d'un membre à un autre garde la vue et son état. Sans l'identifiant de la lecture, le niveau et les
    /// trophées de A se peignaient sous le nom de B jusqu'à la réponse du réseau — et pour toujours hors ligne.
    func test_aVisitorRead_isPaintedOnlyForTheMemberItWasReadFor_andNeverUnderAHiddenGame() throws {
        let standing = try XCTUnwrap(GameStandingContent.of(otherGame()))
        let read = GameVisitorRead(userId: "a", entries: [], standing: standing)

        XCTAssertEqual(GameVisitorRead.shown(read, for: "a", hidden: false), read)
        XCTAssertNil(GameVisitorRead.shown(read, for: "b", hidden: false), "le niveau de A ne se peint jamais sous le nom de B")
        XCTAssertNil(GameVisitorRead.shown(read, for: "a", hidden: true), "« Jeu masqué » : rien, même déjà lu")
        XCTAssertNil(GameVisitorRead.shown(GameVisitorRead(userId: "a", entries: [], standing: nil), for: "a", hidden: false),
                     "rien à montrer : aucune carte")
        XCTAssertNil(GameVisitorRead.shown(nil, for: "a", hidden: false))
    }

    // MARK: - Les propositions de photo suivent les réglages de l'appareil

    func test_photoOffers_followTheHiddenGameAndTheCelebrationsSwitch() {
        XCTAssertTrue(GameDevicePrefs().offersPhotos)
        XCTAssertFalse(GameDevicePrefs(hidden: true).offersPhotos, "jeu masqué : aucune carte proposée")
        XCTAssertFalse(GameDevicePrefs(celebrations: false).offersPhotos, "célébrations coupées : aucune carte proposée")
    }
}
