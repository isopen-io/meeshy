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

    /// Deux gestes en vol qui échouent dans le désordre. Chacun restaurait
    /// l'instantané pris à son départ : le premier effaçait l'optimiste du
    /// second, puis le second ressuscitait le premier échec. Aucun défait local
    /// tant que l'autre vole ; la vérité revient du serveur une fois tout posé.
    func test_twoGesturesInFlight_failingOutOfOrder_neverResurrectsAFailedChange() async throws {
        let (sut, engagement, _) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(held: 9, freezes: 0), meesh: GameFixture.meesh(balance: 9)))
        await sut.load(forceNetwork: true)
        let loadsBefore = engagement.fetchProgressCallCount

        let first = sut.beginGesture(GameOptimistic.afterFreeze)
        let second = sut.beginGesture(GameOptimistic.afterFreeze)
        sut.restore(first); sut.endGesture()
        sut.restore(second); sut.endGesture()

        try await waitForCondition(timeout: 3) { engagement.fetchProgressCallCount > loadsBefore }
        try await waitForCondition(timeout: 3) { sut.game?.flame.freezes == 0 }
        XCTAssertEqual(sut.game?.flame.freezes, 0, "les deux achats ont échoué : aucun gel ne reste")
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

    // MARK: - La machine d'état reste monotone (#10898)

    private actor Latch {
        private var opened = false
        private var waiters: [CheckedContinuation<Void, Never>] = []
        func wait() async {
            if opened { return }
            await withCheckedContinuation { waiters.append($0) }
        }
        func open() {
            opened = true
            waiters.forEach { $0.resume() }
            waiters = []
        }
    }

    private struct Race: Sendable {
        let sut: ProgressionViewModel
        let engagement: MockEngagementProgressService
        let latch: Latch
        let late: Task<Void, Never>
        let after: APIEngagementProgress
    }

    /// Une relecture partie AVANT la frappe — revalidation d'un cache, tirage — lit la poche et la pièce d'avant, et
    /// reste en vol pendant le geste.
    private func raceAReadLeftBeforeTheMint() async -> Race {
        let before = GameFixture.snapshot(GameFixture.game(minted: 12), meesh: GameFixture.meesh(minted: 12))
        let after = GameFixture.snapshot(
            GameFixture.game(score: 121_800 - 1_221, minted: 13, held: 10),
            meesh: GameFixture.meesh(balance: 10, minted: 13, debitable: 121_800 - 1_221)
        )
        let (sut, engagement, _) = makeSUT(snapshot: before)
        await sut.load(forceNetwork: true)
        let latch = Latch()
        engagement.fetchProgressSequence = [.success(before), .success(after)]
        engagement.fetchSuspension = { call in if call == 2 { await latch.wait() } }
        let late = Task { await sut.load(forceNetwork: true) }
        while engagement.fetchProgressCallCount < 2 { await Task.yield() }
        engagement.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 10, mintedLifetime: 13, number: 13, edition: .silver))
        return Race(sut: sut, engagement: engagement, latch: latch, late: late, after: after)
    }

    func test_mint_aReadThatLeftBeforeTheMintAndLandsAfterIt_neverRepaintsTheOldPrice() async {
        let race = await raceAReadLeftBeforeTheMint()

        await race.sut.mint()
        await race.latch.open()
        await race.late.value

        XCTAssertEqual(race.sut.game?.mint, race.after.game?.mint, "le prix servi APRÈS la frappe reste affiché")
        XCTAssertEqual(race.sut.game?.mint.number, 14)
        XCTAssertEqual(race.sut.snapshot?.meesh?.mintedLifetime, 13)
    }

    func test_mint_aReadThatLeftBeforeTheMintAndLandsDuringIt_keepsTheOptimisticNextCoin() async {
        let race = await raceAReadLeftBeforeTheMint()
        let probe = Probe<Int>()
        let sut = race.sut
        race.engagement.duringMint = {
            await race.latch.open()
            await race.late.value
            probe.value = sut.game?.mint.number
        }

        await sut.mint()

        XCTAssertEqual(probe.value, 14, "la lecture d'avant le geste ne défait pas l'optimiste pendant le vol")
        XCTAssertEqual(sut.game?.mint, race.after.game?.mint)
    }

    func test_load_aServedReadBehindAConfirmedMint_isIgnored() async {
        let race = await raceAReadLeftBeforeTheMint()
        await race.sut.mint()
        await race.latch.open()
        await race.late.value
        let stale = GameFixture.snapshot(GameFixture.game(minted: 12), meesh: GameFixture.meesh(minted: 12))
        race.engagement.fetchProgressSequence = [.success(stale)]
        race.engagement.fetchSuspension = nil

        await race.sut.load(forceNetwork: true)

        XCTAssertEqual(race.sut.game?.mint, race.after.game?.mint, "une charge en retard sur une frappe confirmée est périmée")
    }

    /// Le marqueur d'ordre de la passerelle (#10900) prime : une lecture dont la révision est plus ancienne que celle de
    /// la frappe confirmée est périmée, même si elle compte déjà la pièce.
    func test_mint_aRereadOlderThanTheMintRevision_isIgnored() async {
        let (sut, engagement, _) = makeSUT(snapshot: GameFixture.snapshot(GameFixture.game(minted: 12), meesh: GameFixture.meesh(minted: 12)))
        await sut.load(forceNetwork: true)
        let served = GameFixture.snapshot(GameFixture.game(minted: 13, held: 10), meesh: GameFixture.meesh(balance: 10, minted: 13))
        let older = APIEngagementProgress(counters: served.counters, milestones: served.milestones, streak: served.streak,
                                          level: served.level, meesh: served.meesh, game: served.game, gameRevision: 150)
        engagement.fetchProgressSequence = [.success(older)]
        engagement.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 10, mintedLifetime: 13, number: 13,
                                                            edition: .silver, gameRevision: 200))

        await sut.mint()

        XCTAssertNotEqual(sut.snapshot?.gameRevision, 150, "une révision antérieure à la frappe ne se pose pas")
        XCTAssertEqual(sut.game?.mint.number, 14, "l'optimiste reste, en attendant une lecture à jour")
    }

    func test_theOrderMarker_isReadOnTheEngagementReadAndOnTheMintAnswer() throws {
        let read = Data(#"{"counters":[],"milestones":[],"streak":{"currentStreakDays":0,"longestStreakDays":0},"level":{"engagementScore":0},"gameRevision":1792000000123}"#.utf8)
        let mint = Data(#"{"status":"minted","balance":1,"mintedLifetime":1,"gameRevision":1792000000456}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(APIEngagementProgress.self, from: read).gameRevision, 1_792_000_000_123)
        XCTAssertEqual(try JSONDecoder().decode(APIMeeshMintResult.self, from: mint).gameRevision, 1_792_000_000_456)
    }

    // MARK: - La garde de prix (#10903) et l'état venu d'ailleurs (#10900)

    func test_mint_sendsThePriceTheScreenShowed() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        let shown = sut.game?.mint.price

        await sut.mint()

        XCTAssertEqual(engagement.mintMaxPrices, [shown])
    }

    func test_mint_priceChanged_restoresSaysItAndRereadsTheNewPrice() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        let before = sut.game
        let reads = engagement.fetchProgressCallCount
        engagement.mintResult = .failure(refusal(.priceChanged))

        await sut.mint()

        XCTAssertEqual(sut.game?.mint, before?.mint, "rien n'a été débité")
        XCTAssertEqual(sut.game?.treasury, before?.treasury)
        XCTAssertEqual(sut.mintError, GameCopy.errorMessage(for: .priceChanged))
        XCTAssertEqual(engagement.fetchProgressCallCount, reads + 1, "le nouveau prix se relit")
    }

    func test_gameUpdated_fromElsewhere_posesTheServedBlock_andRereads() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        let elsewhere = GameFixture.game(minted: 13, held: 10)
        engagement.fetchProgressResult = .success(GameFixture.snapshot(elsewhere, meesh: GameFixture.meesh(balance: 10, minted: 13)))

        sut.receive(GameUpdatedEvent(gameRevision: 500, reason: "mint", game: elsewhere))

        XCTAssertEqual(sut.game?.mint, elsewhere.mint, "le bloc servi se pose sans attendre")
    }

    func test_gameUpdated_olderThanTheConfirmedState_isIgnored() async {
        let (sut, engagement, _) = makeSUT()
        await sut.load(forceNetwork: true)
        engagement.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 10, mintedLifetime: 13, gameRevision: 900))
        await sut.mint()
        let shown = sut.game
        let reads = engagement.fetchProgressCallCount

        sut.receive(GameUpdatedEvent(gameRevision: 800, reason: "credit", game: GameFixture.game(minted: 12)))

        XCTAssertEqual(sut.game, shown)
        XCTAssertEqual(engagement.fetchProgressCallCount, reads, "un état périmé ne déclenche rien")
    }

    /// Recette staging du 2026-10-18 : la passerelle prend la révision de `game:updated` AVANT de relire le bloc, celle
    /// de la frappe APRÈS — l'événement de la frappe arrive donc plus ancien que ce qu'elle a confirmé. La page
    /// Progression restée DESSOUS (même compte, autre modèle) l'ignorait, et gardait l'état d'avant la frappe.
    func test_gameUpdated_olderThanAMintConfirmedByAnotherPage_stillRereadsAPageLeftBehind() async {
        let userId = "me-\(UUID().uuidString)"
        let (below, belowService) = makeSibling(userId: userId, served: (minted: 12, revision: 100))
        await below.load(forceNetwork: true)
        let (minting, mintingService) = makeSibling(userId: userId, served: (minted: 12, revision: 100))
        await minting.load(forceNetwork: true)
        let after = GameFixture.snapshot(GameFixture.game(minted: 13), meesh: GameFixture.meesh(minted: 13))
        let served = APIEngagementProgress(counters: after.counters, milestones: after.milestones, streak: after.streak,
                                           level: after.level, meesh: after.meesh, game: after.game, gameRevision: 950)
        mintingService.fetchProgressResult = .success(served)
        mintingService.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 10, mintedLifetime: 13, gameRevision: 900))
        await minting.mint()
        belowService.fetchProgressResult = .success(served)
        let expected = served.game?.mint.number

        below.receive(GameUpdatedEvent(gameRevision: 899, reason: "mint", game: GameFixture.game(minted: 13)))

        for _ in 0..<40 where below.game?.mint.number != expected {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(below.game?.mint.number, expected, "la page d'en dessous montre la Meesh SUIVANTE, jamais celle déjà frappée")
        XCTAssertEqual(below.snapshot?.meesh?.mintedLifetime, 13)
    }

    private func makeSibling(userId: String, served: (minted: Int, revision: Int)) -> (ProgressionViewModel, MockEngagementProgressService) {
        let engagement = MockEngagementProgressService()
        let base = GameFixture.snapshot(GameFixture.game(minted: served.minted), meesh: GameFixture.meesh(minted: served.minted))
        engagement.fetchProgressResult = .success(APIEngagementProgress(
            counters: base.counters, milestones: base.milestones, streak: base.streak, level: base.level,
            meesh: base.meesh, game: base.game, gameRevision: served.revision
        ))
        let sut = ProgressionViewModel(
            service: engagement, gameService: MockGameService(), networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: userId, notebook: MockGamePhotoNotebook()
        )
        return (sut, engagement)
    }

    func test_gameUpdated_isDecodedFromTheSocketPayload_toleratingAnUnreadableBlock() throws {
        let data = Data(#"{"gameRevision":1792000000789,"reason":"credit","game":{"unexpected":true}}"#.utf8)
        let event = try JSONDecoder().decode(GameUpdatedEvent.self, from: data)
        XCTAssertEqual(event.gameRevision, 1_792_000_000_789)
        XCTAssertNil(event.game, "un bloc illisible se lit nil : la progression se relit")
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
