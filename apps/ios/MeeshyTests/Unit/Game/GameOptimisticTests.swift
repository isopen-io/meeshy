import XCTest
@testable import Meeshy
import MeeshySDK

/// Les mises à jour optimistes du jeu (#9383) : ce que l'écran montre AVANT la
/// réponse du serveur, recalculé par la MÊME loi — jamais un nombre inventé.
@MainActor
final class GameOptimisticTests: XCTestCase {

    // MARK: - Frappe

    /// Un score juste au-dessus d'un seuil de niveau (100 × N², #9706) : la frappe le fait redescendre d'un niveau.
    private static let scoreJustAboveLevel34 = GameLevels.threshold(of: 34) + 100

    func test_afterMint_dropsTheLevelByTheLawAndRaisesTheTreasuryByOne() {
        let score = Self.scoreJustAboveLevel34
        let state = GameFixture.state(
            GameFixture.game(score: score, held: 9), meesh: GameFixture.meesh(balance: 9, minted: 12, debitable: score)
        )
        let price = state.game.mint.price

        let next = GameOptimistic.afterMint(state)

        XCTAssertEqual(next.game.level.score, score - price)
        XCTAssertEqual(next.game.level.shown.level, GameLevels.level(forScore: score - price, cap: GameLevels.capBase))
        XCTAssertLessThan(next.game.level.shown.level, state.game.level.shown.level)
        XCTAssertEqual(next.game.treasury.held, 10)
        XCTAssertEqual(next.meesh?.balance, 10)
        XCTAssertEqual(next.meesh?.mintedLifetime, 13)
    }

    /// La poche fait le niveau (#10892) : la frappe retire son prix de la POCHE, et le niveau d'après se lit sur elle —
    /// jamais sur le cycle, qui reste tel quel, indicatif, comme le total à vie.
    func test_afterMint_readsTheLevelOnThePocket_andKeepsTheIndicativeCycleAndLifetime() {
        let pocket = Self.scoreJustAboveLevel34
        let cycle = GameLevels.threshold(of: 60)
        let served = GameFixture.game(score: cycle, held: 9)
        let l = served.level
        let sparked = served.replacing(level: GameBlock.Level(
            level: l.level, tier: l.tier, score: l.score, floorScore: l.floorScore, nextThreshold: l.nextThreshold,
            pointsToNext: l.pointsToNext, progress: l.progress, record: l.record, prestige: l.prestige,
            canPrestige: l.canPrestige, ladder: l.ladder, sparks: pocket, sparksCycle: cycle, sparksLifetime: cycle + 500,
            levelMaxLifetime: 60, sparksDebt: nil
        ))
        let state = GameFixture.state(sparked, meesh: GameFixture.meesh(balance: 9, minted: 12, debitable: pocket))
        let price = state.game.mint.price

        let next = GameOptimistic.afterMint(state)

        XCTAssertEqual(next.game.level.shown.level, GameLevels.level(forScore: pocket - price, cap: GameLevels.capBase))
        XCTAssertEqual(next.game.level.sparkFacts.pocket, pocket - price)
        XCTAssertEqual(next.game.level.sparksCycle, cycle, "le cycle est indicatif : la frappe ne le touche pas")
        XCTAssertEqual(next.game.level.sparksLifetime, cycle + 500)
        XCTAssertEqual(next.game.level.levelMaxLifetime, 60, "le niveau max à vie garde ce qui a été atteint")
    }

    /// Le prix de la frappe SUIVANTE que l'optimiste annonce est celui que la passerelle servira (#10898) : prix de rang
    /// × facteur du niveau d'APRÈS. La loi d'avant les étincelles annonçait 1 221 pendant le vol, puis la relecture
    /// remettait le vrai prix — à quelques étincelles de l'ancien : le porteur voyait « l'ancien prix revenir ».
    func test_afterMint_onASparksServer_announcesTheNextPriceTheGatewayServes_withTheLevelFactor() {
        let pocket = 20_000
        let served = GameFixture.game(score: pocket, minted: 4, held: 4)
        let l = served.level
        let sparked = served.replacing(level: GameBlock.Level(
            level: l.level, tier: l.tier, score: l.score, floorScore: l.floorScore, nextThreshold: l.nextThreshold,
            pointsToNext: l.pointsToNext, progress: l.progress, record: l.record, prestige: l.prestige,
            canPrestige: l.canPrestige, ladder: l.ladder, sparks: pocket, sparksCycle: pocket, sparksLifetime: pocket,
            levelMaxLifetime: nil, sparksDebt: 0
        ))
        let state = GameFixture.state(sparked, meesh: GameFixture.meesh(balance: 4, minted: 4, debitable: pocket))
        let paid = state.game.mint.price

        let next = GameOptimistic.afterMint(state)

        let cap = GameGlory.levelCap(forRank: next.game.glory.rank)
        let levelAfter = max(GameLevels.minLevel, GameLevels.level(forScore: pocket - paid, cap: cap))
        let served6 = GameMint.effectivePrice(forNumber: 6, level: levelAfter)
        XCTAssertEqual(next.game.mint.number, 6)
        XCTAssertEqual(next.game.mint.price, served6, "le prix suivant porte le facteur du niveau d'après")
        XCTAssertLessThan(next.game.mint.price, GameMint.price(forNumber: 6), "jamais le prix de rang nu")
        XCTAssertEqual(next.game.mint.basePrice, GameMint.price(forNumber: 6))
        XCTAssertEqual(next.game.mint.costLevel, levelAfter)
        XCTAssertEqual(next.meesh?.mintCost, served6, "le compteur de Meeshes lit le même prix")
    }

    func test_afterMint_addsTheGloryTheMintPromised() {
        let state = GameFixture.state()
        let next = GameOptimistic.afterMint(state)
        XCTAssertEqual(next.game.glory.glory, state.game.glory.glory + state.game.mint.gloryGained)
    }

    func test_afterMint_advancesTheNextCoinNumberAndKeepsTheRecord() {
        let state = GameFixture.state()
        let next = GameOptimistic.afterMint(state)
        XCTAssertEqual(next.game.mint.number, state.game.mint.number + 1)
        XCTAssertEqual(next.game.level.record, state.game.level.record, "le record ne redescend jamais")
    }

    func test_afterMint_turnsTheTailwindOnBecauseTheLevelIsNowBelowTheRecord() {
        let score = Self.scoreJustAboveLevel34
        let state = GameFixture.state(GameFixture.game(score: score), meesh: GameFixture.meesh(debitable: score))
        XCTAssertEqual(state.game.boosts.tailwind, 1)
        XCTAssertGreaterThan(GameOptimistic.afterMint(state).game.boosts.tailwind, 1)
    }

    func test_afterMint_whenTheMintIsImpossible_changesNothing() {
        let poor = GameFixture.game(score: 400, debitable: 400, held: 0)
        XCTAssertFalse(poor.mint.canMint)
        let state = GameFixture.state(poor, meesh: GameFixture.meesh(balance: 0, minted: 0, debitable: 400))
        XCTAssertEqual(GameOptimistic.afterMint(state), state)
    }

    // MARK: - Frappe au-delà du niveau 100 (#9688)

    func test_afterMint_beyondLevel100_servesTheOpenedLevelInTheLadder_andKeepsYesterdaysFieldsAt100() {
        let score = GameLevels.threshold(of: 250) + 40
        let state = GameFixture.state(GameFixture.game(score: score), meesh: GameFixture.meesh(debitable: score))
        let price = state.game.mint.price

        let next = GameOptimistic.afterMint(state)

        XCTAssertEqual(next.game.level.shown.level, GameLevels.level(forScore: score - price, cap: GameLevels.capBase))
        XCTAssertGreaterThan(next.game.level.shown.level, GameLevels.legacyMaxLevel)
        XCTAssertEqual(next.game.level.shown.tier, GameLevels.tier(of: next.game.level.shown.level))
        XCTAssertEqual(next.game.level.shown.cap, GameLevels.capBase)
        XCTAssertEqual(next.game.level.level, GameLevels.legacyMaxLevel, "les champs d'hier restent sous l'ancienne loi")
        XCTAssertEqual(next.game.level.tier, .galaxie, "les champs d'hier ne portent que les dix premiers paliers")
        XCTAssertEqual(next.game.level.shown.record, state.game.level.shown.record, "le record ouvert ne redescend jamais")
        XCTAssertEqual(next.game.mint.shownLevels.levelBefore, next.game.level.shown.level)
        XCTAssertLessThanOrEqual(next.game.mint.levelBefore, GameLevels.legacyMaxLevel)
    }

    func test_afterMint_whenItsGloryReachesAmbassador_theCapRisesTo1000() {
        let score = GameLevels.threshold(of: 600)
        let state = GameFixture.state(
            GameFixture.game(score: score, glory: 129_500), meesh: GameFixture.meesh(debitable: score)
        )
        XCTAssertEqual(state.game.level.shown.level, GameLevels.capBase)
        XCTAssertTrue(state.game.level.shown.isMax)
        let price = state.game.mint.price

        let next = GameOptimistic.afterMint(state)

        XCTAssertEqual(next.game.glory.rank, .ambassadeur)
        XCTAssertEqual(next.game.level.shown.cap, GameLevels.capAmbassador)
        XCTAssertEqual(next.game.level.shown.level, GameLevels.level(forScore: score - price, cap: GameLevels.capAmbassador))
        XCTAssertGreaterThan(next.game.level.shown.level, GameLevels.capBase, "le rang d'APRÈS la frappe ouvre les niveaux")
        XCTAssertFalse(next.game.level.shown.isMax)
    }

    func test_withChestReward_beyondLevel100_recomposesTheLadderUnderTheRankCap() {
        let state = GameFixture.state(GameFixture.game(score: GameLevels.threshold(of: 140), chestStatus: .ready))
        let score = GameLevels.threshold(of: 141) + 7

        let next = GameOptimistic.withChestReward(state, reward: DailyChest(points: 90, fragment: false, freeze: false), score: score)

        XCTAssertEqual(next.game.level.shown.level, 141)
        XCTAssertEqual(next.game.level.shown.tier, .nebuleuse)
        XCTAssertEqual(next.game.level.shown.record, 141)
        XCTAssertEqual(next.game.level.level, GameLevels.legacyMaxLevel)
        XCTAssertEqual(next.game.level.record, GameLevels.legacyMaxLevel)
    }

    // MARK: - Gel

    func test_afterFreeze_addsOneFreezeAndPaysItsPrice() {
        let state = GameFixture.state(GameFixture.game(held: 4, freezes: 0))
        let next = GameOptimistic.afterFreeze(state)
        XCTAssertEqual(next.game.flame.freezes, 1)
        XCTAssertEqual(next.game.treasury.held, 3)
        XCTAssertEqual(next.meesh?.balance, state.meesh.map { $0.balance - 1 })
    }

    func test_afterFreeze_atTheMaximum_changesNothing() {
        let state = GameFixture.state(GameFixture.game(held: 4, freezes: 2))
        XCTAssertEqual(GameOptimistic.afterFreeze(state), state)
    }

    func test_afterFreeze_withoutTheMeeshes_changesNothing() {
        let state = GameFixture.state(GameFixture.game(held: 0, freezes: 0))
        XCTAssertEqual(GameOptimistic.afterFreeze(state), state)
    }

    // MARK: - Changement de mission

    func test_afterReroll_spendsTheDailyRerollAndOneMeesh() {
        let state = GameFixture.state(GameFixture.game(held: 5, rerollAvailable: true))
        let next = GameOptimistic.afterReroll(state)
        XCTAssertFalse(next.game.missions.rerollAvailable)
        XCTAssertEqual(next.game.treasury.held, 4)
    }

    func test_afterReroll_whenUnavailable_changesNothing() {
        let state = GameFixture.state(GameFixture.game(rerollAvailable: false))
        XCTAssertEqual(GameOptimistic.afterReroll(state), state)
    }

    func test_withRerolled_putsTheServedMissionAtTheSameRankAndTheServedBalanceWins() {
        let state = GameFixture.state(GameFixture.game(held: 5))
        let served = GameFixture.mission(id: "m9", templateKey: "send-voice", target: 1, reward: 33)

        let next = GameOptimistic.withRerolled(state, missionId: "m2", mission: served, balance: 4)

        XCTAssertEqual(next.game.missions.items.map(\.id), ["m1", "m9", "m3"])
        XCTAssertEqual(next.game.treasury.held, 4)
        XCTAssertEqual(next.meesh?.balance, 4)
    }

    // MARK: - Coffre

    func test_afterChestOpening_marksItClaimedWithoutInventingTheContent() {
        let state = GameFixture.state(GameFixture.game(chestStatus: .ready))
        let next = GameOptimistic.afterChestOpening(state)
        XCTAssertEqual(next.game.chest.status, .claimed)
        XCTAssertNil(next.game.chest.reward, "le contenu n'existe qu'une fois la passerelle l'a tiré")
    }

    func test_afterChestOpening_whenNotReady_changesNothing() {
        let state = GameFixture.state(GameFixture.game(chestStatus: .locked))
        XCTAssertEqual(GameOptimistic.afterChestOpening(state), state)
    }

    func test_withChestReward_laysTheServedContentAndCreditsTheScore() {
        let state = GameFixture.state(GameFixture.game(score: 121_800, chestStatus: .ready))
        let reward = DailyChest(points: 90, fragment: true, freeze: false)

        let next = GameOptimistic.withChestReward(state, reward: reward, score: 121_890)

        XCTAssertEqual(next.game.chest.reward, reward)
        XCTAssertEqual(next.game.chest.status, .claimed)
        XCTAssertEqual(next.game.level.score, 121_890)
    }

    func test_withChestReward_laysTheServedStarFragmentTotal_andEveryGestureKeepsIt() {
        let base = GameFixture.game(score: 121_800, chestStatus: .ready).replacing(starFragments: .some(StarFragmentsTotal(collected: 4)))
        let state = GameFixture.state(base)

        let served = GameOptimistic.withChestReward(
            state, reward: DailyChest(points: 500, fragment: true, freeze: false), score: 122_300,
            starFragments: StarFragmentsTotal(collected: 5)
        )
        let unserved = GameOptimistic.withChestReward(state, reward: DailyChest(points: 500, fragment: false, freeze: false), score: 122_300)

        XCTAssertEqual(served.game.starFragments, StarFragmentsTotal(collected: 5))
        XCTAssertEqual(unserved.game.starFragments, StarFragmentsTotal(collected: 4))
        XCTAssertEqual(GameOptimistic.afterChestOpening(state).game.starFragments, StarFragmentsTotal(collected: 4))
        XCTAssertEqual(base.replacing(guideSeen: ["x"]).starFragments, StarFragmentsTotal(collected: 4))
    }

    // MARK: - Rallumage

    func test_afterRelight_lightsTheFlameAndPaysItsPrice() {
        let state = GameFixture.state(GameFixture.game(held: 5, flameDays: 0, flameStatus: .out, canRelight: true))
        let next = GameOptimistic.afterRelight(state)
        XCTAssertEqual(next.game.flame.status, .lit)
        XCTAssertFalse(next.game.flame.canRelight)
        XCTAssertEqual(next.game.treasury.held, 2)
    }

    func test_afterRelight_whenNotAllowed_changesNothing() {
        let state = GameFixture.state(GameFixture.game(flameStatus: .out, canRelight: false))
        XCTAssertEqual(GameOptimistic.afterRelight(state), state)
    }

    func test_withRelit_takesTheServedStreakAndDerivesFormAndBonusFromTheLaw() {
        let state = GameFixture.state(GameFixture.game(held: 5, flameDays: 0, flameStatus: .out, canRelight: true))
        let next = GameOptimistic.withRelit(state, streak: 31, balance: 2)
        XCTAssertEqual(next.game.flame.days, 31)
        XCTAssertEqual(next.game.flame.form, .brasier)
        XCTAssertEqual(next.game.flame.bonusPercent, 50, "2 % par jour, plafonné à 50 %")
        XCTAssertEqual(next.game.treasury.held, 2)
    }

    // MARK: - Guide

    func test_withGuideSeen_mergesKeysWithoutDuplicates() {
        let state = GameFixture.state(GameFixture.game(guideSeen: ["onboarding.welcome"]))
        let next = GameOptimistic.withGuideSeen(state, keys: ["onboarding.welcome", "new-rank"])
        XCTAssertEqual(next.game.guideSeen, ["onboarding.welcome", "new-rank"])
    }

    func test_withGuideSeen_whenNothingIsNew_returnsTheSameState() {
        let state = GameFixture.state(GameFixture.game(guideSeen: ["new-rank"]))
        XCTAssertEqual(GameOptimistic.withGuideSeen(state, keys: ["new-rank"]), state)
    }

    // MARK: - Vent arrière des étincelles (#10896)

    /// Un état servi par une passerelle des étincelles : la poche porte le niveau, le record de niveau est `levelRecord`.
    private func tailwindState(levelRecord: Int?) -> GameState {
        let pocket = Self.scoreJustAboveLevel34
        let served = GameFixture.game(score: pocket, levelRecord: levelRecord)
        let l = served.level
        let sparked = served.replacing(level: GameBlock.Level(
            level: l.level, tier: l.tier, score: l.score, floorScore: l.floorScore, nextThreshold: l.nextThreshold,
            pointsToNext: l.pointsToNext, progress: l.progress, record: l.record, prestige: l.prestige,
            canPrestige: l.canPrestige, ladder: l.ladder, sparks: pocket, sparksCycle: pocket, sparksLifetime: pocket,
            levelMaxLifetime: nil, sparksDebt: 0
        ))
        return GameFixture.state(sparked, meesh: GameFixture.meesh(debitable: pocket))
    }

    /// Le niveau que la frappe laisse — celui dont le Vent arrière mesure l'écart au record.
    private var levelAfterMint: Int { GameOptimistic.afterMint(tailwindState(levelRecord: nil)).game.level.shown.level }

    func test_afterMint_onASparksServer_keepsTheTailwindOff_sixLevelsBelowTheRecord() {
        let next = GameOptimistic.afterMint(tailwindState(levelRecord: levelAfterMint + 6))
        XCTAssertEqual(next.game.level.shown.record - next.game.level.shown.level, 6)
        XCTAssertEqual(next.game.boosts.tailwind, 1, "à 6 niveaux du record, le Vent arrière ne souffle pas")
    }

    func test_afterMint_onASparksServer_turnsTheTailwindOn_sevenLevelsBelowTheRecord() {
        let next = GameOptimistic.afterMint(tailwindState(levelRecord: levelAfterMint + 7))
        XCTAssertEqual(next.game.level.shown.record - next.game.level.shown.level, 7)
        XCTAssertEqual(next.game.boosts.tailwind, GameBoosts.tailwindFactor, "à 7 niveaux du record, il souffle")
    }

    // MARK: - Ce que la passerelle servirait après le geste (#10902)

    private static func minGlory(_ rank: GloryRank, _ division5: GloryDivision5) -> Int {
        GameGlory.steps.first { $0.rank == rank && $0.division5 == division5 }?.minGlory ?? 0
    }

    func test_afterFreeze_keepsTheReservesOfTheTreasury() {
        let game = GameFixture.sparked(GameFixture.game(score: 121_800, freezes: 0), pocket: 121_800)
        let state = GameFixture.state(game)
        XCTAssertNotNil(state.game.treasury.access)

        let next = GameOptimistic.afterFreeze(state)

        XCTAssertEqual(next.game.treasury.held, state.game.treasury.held - 1)
        XCTAssertEqual(next.game.treasury.access, state.game.treasury.access, "un geste qui ne touche pas la Gloire garde les réserves")
    }

    func test_afterMint_rereadsTheReservesOnTheGloryOfTheMint() {
        let glory = Self.minGlory(.voix, .i) - GameGlory.points.mint
        let pocket = GameLevels.threshold(of: 30)
        let game = GameFixture.sparked(GameFixture.game(score: pocket, glory: glory, minted: 40, held: 40), pocket: pocket)
        let state = GameFixture.state(game, meesh: GameFixture.meesh(balance: 40, minted: 40, debitable: pocket))
        XCTAssertEqual(state.game.treasury.access?.first { $0.key == .coffre }?.locked, true)

        let next = GameOptimistic.afterMint(state)

        XCTAssertEqual(next.game.treasury.access, GameTreasury.reserveAccess(glory: next.game.glory.glory))
        XCTAssertEqual(next.game.treasury.access?.first { $0.key == .coffre }?.locked, false, "Voix I ouvre le Coffre")
    }

    func test_afterMint_servesTheLevelMaxLifetimeInTheLadder_likeTheGateway() {
        let pocket = Self.scoreJustAboveLevel34
        let game = GameFixture.sparked(GameFixture.game(score: pocket), pocket: pocket, levelRecord: 34, levelMaxLifetime: 60)
        let next = GameOptimistic.afterMint(GameFixture.state(game, meesh: GameFixture.meesh(debitable: pocket)))
        XCTAssertEqual(next.game.level.levelMaxLifetime, 60)
        XCTAssertEqual(next.game.level.ladder?.levelMaxLifetime, 60)
    }

    func test_withChestReward_creditsTheSparksByTheGainLaw() {
        let pocket = GameLevels.threshold(of: 12) + 10
        let game = GameFixture.sparked(GameFixture.game(score: pocket, chestStatus: .ready), pocket: pocket, cycle: 600_000,
                                       lifetime: 900_000, levelRecord: 19)
        let reward = DailyChest(points: 4_000, fragment: false, freeze: false)

        let next = GameOptimistic.withChestReward(GameFixture.state(game), reward: reward, score: pocket + 4_000)

        XCTAssertEqual(next.game.level.sparks, pocket + 4_000)
        XCTAssertEqual(next.game.level.sparksCycle, 604_000, "le cycle monte du gain entier")
        XCTAssertEqual(next.game.level.sparksLifetime, 904_000, "le total à vie aussi")
        XCTAssertEqual(next.game.level.sparksDebt, 0)
    }

    func test_withChestReward_underADebt_repaysItBeforeThePocket() {
        let pocket = GameLevels.threshold(of: 12) + 10
        let game = GameFixture.sparked(GameFixture.game(score: pocket, chestStatus: .ready), pocket: pocket, cycle: 600_000,
                                       lifetime: 900_000, debt: 1_500)
        let reward = DailyChest(points: 4_000, fragment: false, freeze: false)

        let next = GameOptimistic.withChestReward(GameFixture.state(game), reward: reward, score: pocket + 2_500)

        XCTAssertEqual(next.game.level.sparks, pocket + 2_500)
        XCTAssertEqual(next.game.level.sparksCycle, 604_000)
        XCTAssertEqual(next.game.level.sparksDebt, 0, "la dette est soldée par le gain")
        XCTAssertNil(next.game.mint.blockedBy, "plus de dette, plus de blocage")
    }

    func test_withChestReward_rereadsTheTailwind_whenTheLevelRisesBackNearTheRecord() {
        let pocket = GameLevels.threshold(of: 12) + 10
        let game = GameFixture.sparked(GameFixture.game(score: pocket, chestStatus: .ready), pocket: pocket, levelRecord: 19)
        let before = game.replacing(boosts: game.boosts.replacing(tailwind: GameBoosts.sparksTailwind(level: 12, levelRecord: 19)))
        XCTAssertEqual(before.boosts.tailwind, GameBoosts.tailwindFactor)
        let score = GameLevels.threshold(of: 14)

        let next = GameOptimistic.withChestReward(GameFixture.state(before), reward: DailyChest(points: score - pocket, fragment: false, freeze: false), score: score)

        XCTAssertEqual(next.game.level.shown.level, 14)
        XCTAssertEqual(next.game.boosts.tailwind, 1, "à 5 niveaux du record, le Vent arrière ne souffle plus — comme la passerelle le sert")
    }

    func test_withChestReward_rereadsTheNextPriceOnThePocketAfterTheChest() {
        let pocket = GameLevels.threshold(of: 12) + 10
        let game = GameFixture.sparked(GameFixture.game(score: pocket, minted: 4, held: 4, chestStatus: .ready), pocket: pocket)
        let score = pocket + 40_000
        let state = GameFixture.state(game, meesh: GameFixture.meesh(balance: 4, minted: 4, debitable: pocket))

        let next = GameOptimistic.withChestReward(state, reward: DailyChest(points: 40_000, fragment: false, freeze: false), score: score)

        let expected = GameMint.sparksPreview(sparks: score, mintedLifetime: 4, held: 4, glory: game.glory.glory,
                                              levelCap: GameGlory.levelCap(forRank: game.glory.rank), steps: game.levelStepFacts)
        XCTAssertEqual(next.game.mint.price, expected.price)
        XCTAssertEqual(next.game.mint.number, 5)
        XCTAssertEqual(next.meesh?.mintCost, expected.price, "le compteur de Meeshes lit le même prix")
        XCTAssertEqual(next.meesh?.debitablePoints, score)
    }
}
