import XCTest
@testable import Meeshy
import MeeshySDK

/// L'écran « Progression » joue le jeu (#9383) : le bloc `game` voyage avec la
/// charge, chaque geste est optimiste et se restaure sur échec, l'identifiant
/// d'idempotence survit à l'échec, un ancien serveur laisse l'écran d'avant intact.
@MainActor
final class ProgressionViewModelGameTests: XCTestCase {

    private func makeSUT(
        snapshot: APIEngagementProgress? = GameFixture.snapshot(),
        isOnline: Bool = true
    ) -> (sut: ProgressionViewModel, engagement: MockEngagementProgressService, game: MockGameService) {
        let engagement = MockEngagementProgressService()
        if let snapshot { engagement.fetchProgressResult = .success(snapshot) }
        let game = MockGameService()
        let sut = ProgressionViewModel(
            service: engagement,
            gameService: game,
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            currentUserId: "me-\(UUID().uuidString)",
            notebook: MockGamePhotoNotebook()
        )
        return (sut, engagement, game)
    }

    private struct MidFlight: Sendable {
        let rerollAvailable: Bool
        let held: Int
        let pendingId: String?
    }

    private func refusal(_ code: GameErrorCode) -> Error {
        MeeshyError.rejected(APIRejection(statusCode: 409, code: code.rawValue, message: "refus"))
    }

    // MARK: - La lecture

    func test_load_exposesTheGameBlockServedWithThePayload() async {
        let served = GameFixture.game(score: 121_800)
        let (sut, _, _) = makeSUT(snapshot: GameFixture.snapshot(served))

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.game?.level.level, 34)
        XCTAssertEqual(sut.game?.level, served.level)
        XCTAssertEqual(sut.game?.glory, served.glory)
        XCTAssertEqual(sut.game?.mint, served.mint)
        XCTAssertEqual(sut.game?.missions, served.missions)
    }

    func test_load_anOldServerWithoutTheGameBlock_leavesTheScreenAsItWas() async {
        let (sut, _, _) = makeSUT(snapshot: APIEngagementProgress(
            counters: [], milestones: [], streak: .init(currentStreakDays: 0, longestStreakDays: 0), level: .init(engagementScore: 36)
        ))

        await sut.load(forceNetwork: true)

        XCTAssertNil(sut.game)
        XCTAssertNotNil(sut.progress, "la charge d'avant reste lisible sans le bloc")
    }

    func test_load_opensWithTheGuide_firstOnboardingStep() async {
        let (sut, _, _) = makeSUT()
        await sut.load(forceNetwork: true)
        XCTAssertEqual(sut.guide.card?.key, "onboarding.welcome")
    }

    // MARK: - Changer une mission

    func test_reroll_showsTheOptimisticStateBeforeTheServerAnswers() async {
        let (sut, _, service) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(held: 5, rerollAvailable: true), meesh: GameFixture.meesh(balance: 5)))
        await sut.load(forceNetwork: true)
        service.rerollResult = .success(MissionRerollResponse(mission: GameFixture.mission(id: "m9"), balance: 4))
        let probe = Probe<MidFlight>()
        service.duringReroll = { probe.value = MidFlight(rerollAvailable: sut.game?.missions.rerollAvailable ?? true, held: sut.game?.treasury.held ?? -1, pendingId: sut.pending.rerollMissionId) }

        await sut.reroll(missionId: "m2")

        XCTAssertEqual(probe.value?.rerollAvailable, false)
        XCTAssertEqual(probe.value?.held, 4)
        XCTAssertEqual(probe.value?.pendingId, "m2")
        XCTAssertNil(sut.pending.rerollMissionId)
    }

    func test_reroll_success_putsTheServedMissionAtTheSameRank_andRereadsTheTruth() async {
        let (sut, engagement, service) = makeSUT()
        await sut.load(forceNetwork: true)
        let served = GameFixture.mission(id: "m9", templateKey: "send-voice", target: 1)
        service.rerollResult = .success(MissionRerollResponse(mission: served, balance: 8))
        let fetchesBefore = engagement.fetchProgressCallCount
        // La relecture rendrait l'état d'AVANT : le test regarde donc ce que le geste a posé, pas la relecture.
        engagement.fetchProgressResult = .success(GameFixture.snapshot(GameFixture.game(missions: [GameFixture.mission(id: "m1"), served, GameFixture.mission(id: "m3")])))

        await sut.reroll(missionId: "m2")

        XCTAssertEqual(sut.game?.missions.items.map(\.id), ["m1", "m9", "m3"])
        XCTAssertEqual(engagement.fetchProgressCallCount, fetchesBefore + 1)
    }

    func test_reroll_failure_restoresTheSnapshotAndSaysWhy() async {
        let (sut, _, service) = makeSUT()
        await sut.load(forceNetwork: true)
        let before = sut.game
        service.rerollResult = .failure(URLError(.networkConnectionLost))

        await sut.reroll(missionId: "m2")

        XCTAssertEqual(sut.game, before)
        XCTAssertEqual(sut.gameErrors.reroll, GameCopy.errorMessage(for: nil as GameErrorCode?))
        XCTAssertNil(sut.pending.rerollMissionId)
    }

    func test_reroll_aRefusalOfTheServer_isToldInItsOwnWordsAndTheScreenIsReread() async {
        let (sut, engagement, service) = makeSUT()
        await sut.load(forceNetwork: true)
        service.rerollResult = .failure(refusal(.missionRerollExhausted))
        let fetchesBefore = engagement.fetchProgressCallCount

        await sut.reroll(missionId: "m2")

        XCTAssertEqual(sut.gameErrors.reroll, GameCopy.errorMessage(for: .missionRerollExhausted))
        XCTAssertEqual(engagement.fetchProgressCallCount, fetchesBefore + 1)
    }

    func test_reroll_aRetryAfterAFailureReplaysTheSameRequestId() async {
        let (sut, _, service) = makeSUT()
        await sut.load(forceNetwork: true)
        service.rerollResult = .failure(URLError(.timedOut))

        await sut.reroll(missionId: "m2")
        await sut.reroll(missionId: "m2")

        XCTAssertEqual(service.rerollRequestIds.count, 2)
        XCTAssertEqual(service.rerollRequestIds[0], service.rerollRequestIds[1], "un réessai rejoue la même requête : jamais un second geste")
    }

    func test_reroll_anIdAlreadyServedToAnotherWrite_isReplacedByAFreshOneOnTheNextTry() async {
        let (sut, _, service) = makeSUT()
        await sut.load(forceNetwork: true)
        service.rerollResult = .failure(refusal(.requestIdConflict))

        await sut.reroll(missionId: "m2")
        await sut.reroll(missionId: "m2")

        XCTAssertEqual(service.rerollRequestIds.count, 2)
        XCTAssertNotEqual(service.rerollRequestIds[0], service.rerollRequestIds[1], "rejouer l'identifiant refusé se heurterait au même refus")
    }

    func test_reroll_aNewIntentionAfterASuccessGetsAFreshRequestId() async {
        let (sut, _, service) = makeSUT()
        await sut.load(forceNetwork: true)
        service.rerollResult = .success(MissionRerollResponse(mission: GameFixture.mission(id: "m9"), balance: 8))

        await sut.reroll(missionId: "m2")
        await sut.reroll(missionId: "m2")

        XCTAssertNotEqual(service.rerollRequestIds[0], service.rerollRequestIds[1])
    }

    // MARK: - Le coffre

    func test_claimChest_opensItAtOnceAndLaysTheServedContent() async {
        let (sut, engagement, service) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(chestStatus: .ready)))
        await sut.load(forceNetwork: true)
        let reward = DailyChest(points: 120, fragment: false, freeze: true)
        service.chestResult = .success(ChestClaimResponse(status: "claimed", reward: reward, score: 12_300))
        engagement.fetchProgressResult = .success(GameFixture.snapshot(GameFixture.game(score: 12_300, chestStatus: .claimed, chestReward: reward)))
        let probe = Probe<GameBlock.Chest>()
        service.duringChest = { probe.value = sut.game?.chest }

        await sut.claimChest()

        XCTAssertEqual(probe.value?.status, .claimed)
        XCTAssertNil(probe.value?.reward, "rien n'est deviné avant la réponse")
        XCTAssertEqual(sut.game?.chest.reward, reward)
        XCTAssertFalse(sut.pending.chest)
    }

    func test_claimChest_failure_closesItAgain() async {
        let (sut, _, service) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(chestStatus: .ready)))
        await sut.load(forceNetwork: true)
        service.chestResult = .failure(URLError(.notConnectedToInternet))

        await sut.claimChest()

        XCTAssertEqual(sut.game?.chest.status, .ready)
        XCTAssertNotNil(sut.gameErrors.chest)
    }

    // MARK: - Un gel, le rallumage

    func test_buyFreeze_failure_restoresTheFreezesAndTheBalance() async {
        let (sut, _, service) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(held: 4, freezes: 0), meesh: GameFixture.meesh(balance: 4)))
        await sut.load(forceNetwork: true)
        service.freezeResult = .failure(URLError(.timedOut))

        await sut.buyFreeze()

        XCTAssertEqual(sut.game?.flame.freezes, 0)
        XCTAssertEqual(sut.game?.treasury.held, 4)
        XCTAssertEqual(sut.snapshot?.meesh?.balance, 4)
        XCTAssertNotNil(sut.gameErrors.freeze)
    }

    func test_relight_success_takesTheServedStreak() async {
        let out = GameFixture.game(held: 5, flameDays: 0, flameStatus: .out, canRelight: true)
        let (sut, engagement, service) = makeSUT(snapshot: GameFixture.snapshot(out, meesh: GameFixture.meesh(balance: 5)))
        await sut.load(forceNetwork: true)
        service.relightResult = .success(FlameRelightResponse(status: "relit", streak: 23, balance: 2))
        engagement.fetchProgressResult = .success(GameFixture.snapshot(GameFixture.game(held: 2, flameDays: 23, flameStatus: .lit)))

        await sut.relight()

        XCTAssertEqual(sut.game?.flame.days, 23)
        XCTAssertEqual(sut.game?.flame.status, .lit)
        XCTAssertFalse(sut.pending.relight)
    }

    // MARK: - La frappe

    func test_mint_failure_restoresTheGameBlock() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        let before = sut.game
        engagement.mintResult = .failure(URLError(.networkConnectionLost))

        await sut.mint()

        XCTAssertEqual(sut.game, before)
        XCTAssertNotNil(sut.mintError)
        XCTAssertNil(sut.celebration)
        XCTAssertTrue(sut.isSettled)
    }

    func test_mint_success_celebratesTheCoinTheServerNumbered() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        engagement.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 10, mintedLifetime: 13, number: 13, edition: .silver))

        await sut.mint()

        XCTAssertEqual(sut.celebration?.number, 13)
        XCTAssertEqual(sut.celebration?.edition, .silver)
    }

    func test_mint_success_withAnOldServerAnswer_fallsBackOnThePreviewShownBeforeTheGesture() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        let preview = sut.game?.mint
        engagement.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 10, mintedLifetime: 13))

        await sut.mint()

        XCTAssertEqual(sut.celebration?.number, preview?.number)
        XCTAssertEqual(sut.celebration?.edition, preview?.edition)
    }

    func test_mint_alreadyMinted_isNotACelebration() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        engagement.mintResult = .success(APIMeeshMintResult(status: "already-minted", balance: 10, mintedLifetime: 13))

        await sut.mint()

        XCTAssertNil(sut.celebration)
    }

    func test_aGestureWithoutTheGameBlock_stillSendsAndRestoresNothing() async {
        let (sut, _, service) = makeSUT(snapshot: APIEngagementProgress(
            counters: [], milestones: [], streak: .init(currentStreakDays: 0, longestStreakDays: 0), level: .init(engagementScore: 36)
        ))
        await sut.load(forceNetwork: true)
        service.freezeResult = .success(FlameFreezeResponse(status: "bought", freezes: 1, balance: 0))

        await sut.buyFreeze()

        XCTAssertEqual(service.freezeRequestIds.count, 1)
        XCTAssertNil(sut.game)
    }

    // MARK: - Ce que la frappe éteindrait

    func test_mintBadgeImpact_isUnknownWhenTheServedCountersCarryNoPoints() async {
        let (sut, _, _) = makeSUT()
        await sut.load(forceNetwork: true)
        XCTAssertNil(sut.mintBadgeImpact, "la charge de test ne sert pas les points par axe")
    }

    func test_mintBadgeImpact_isComputedFromTheServedCountersAndThePriceOfThisMint() async {
        let served = APIEngagementProgress(
            counters: [.init(axisKey: "content.text_message", count: 60, points: 1_500)],
            milestones: [], streak: .init(currentStreakDays: 1, longestStreakDays: 1),
            level: .init(engagementScore: 121_800), meesh: GameFixture.meesh(), game: GameFixture.game()
        )
        let (sut, _, _) = makeSUT(snapshot: served)
        await sut.load(forceNetwork: true)
        XCTAssertNotNil(sut.mintBadgeImpact)
        XCTAssertEqual(sut.mintBadgeImpact?.lost, 2)
    }

    // MARK: - Le retour arrière ne défait que ce que le geste a changé (#9383)

    func test_reroll_failure_keepsAServedReadingThatLandedWhileTheGestureWasInFlight() async {
        let (sut, _, service) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(held: 5, rerollAvailable: true), meesh: GameFixture.meesh(balance: 5)))
        await sut.load(forceNetwork: true)
        let newer = GameFixture.snapshot(GameFixture.game(held: 7, rerollAvailable: true), meesh: GameFixture.meesh(balance: 7))
        service.rerollResult = .failure(URLError(.networkConnectionLost))
        service.duringReroll = { sut.adopt(newer) }

        await sut.reroll(missionId: "m2")

        XCTAssertEqual(sut.game, newer.game, "la lecture servie arrivée pendant le vol est la vérité : elle reste")
    }

    func test_reroll_failure_keepsTheGuideKeysSeenWhileTheGestureWasInFlight() async {
        let (sut, _, service) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(held: 5, rerollAvailable: true), meesh: GameFixture.meesh(balance: 5)))
        await sut.load(forceNetwork: true)
        service.rerollResult = .failure(URLError(.networkConnectionLost))
        service.duringReroll = { sut.guide.skipAll() }

        await sut.reroll(missionId: "m2")

        XCTAssertEqual(sut.game?.missions.rerollAvailable, true, "le changement refusé est défait")
        XCTAssertEqual(sut.game?.treasury.held, 5)
        let lastStep = GameGuide.onboardingSteps.last.map { GameGuide.onboardingSeenKey($0.key) }
        XCTAssertNotNil(lastStep)
        XCTAssertTrue(sut.game?.guideSeen.contains(lastStep ?? "") ?? false, "ce que le guide a marqué ne dépend pas du geste")
    }

    func test_guideSeenDuringAGesture_neverWritesTheOptimisticStateIntoTheCache() async throws {
        let userId = "me-\(UUID().uuidString)"
        let engagement = MockEngagementProgressService()
        engagement.fetchProgressResult = .success(GameFixture.snapshot(GameFixture.game(held: 5, rerollAvailable: true), meesh: GameFixture.meesh(balance: 5)))
        let service = MockGameService()
        let sut = ProgressionViewModel(
            service: engagement, gameService: service, networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: userId, notebook: MockGamePhotoNotebook()
        )
        await sut.load(forceNetwork: true)
        service.rerollResult = .failure(URLError(.networkConnectionLost))
        service.duringReroll = { sut.guide.skipAll() }

        await sut.reroll(missionId: "m2")

        let store = await CacheCoordinator.shared.engagementProgress
        var cached: APIEngagementProgress?
        for _ in 0..<40 where cached?.game?.guideSeen.isEmpty != false {
            try await Task.sleep(nanoseconds: 50_000_000)
            if case .fresh(let items, _) = await store.load(for: "engagement:\(userId)") { cached = items.first }
        }
        XCTAssertEqual(cached?.game?.missions.rerollAvailable, true, "le cache ne garde pas le changement refusé")
        XCTAssertEqual(cached?.meesh?.balance, 5)
    }
}
