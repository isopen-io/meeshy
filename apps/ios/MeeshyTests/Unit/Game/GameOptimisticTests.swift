import XCTest
@testable import Meeshy
import MeeshySDK

/// Les mises à jour optimistes du jeu (#9383) : ce que l'écran montre AVANT la
/// réponse du serveur, recalculé par la MÊME loi — jamais un nombre inventé.
@MainActor
final class GameOptimisticTests: XCTestCase {

    // MARK: - Frappe

    func test_afterMint_dropsTheLevelByTheLawAndRaisesTheTreasuryByOne() {
        let state = GameFixture.state(GameFixture.game(score: 12_180, held: 9), meesh: GameFixture.meesh(balance: 9, minted: 12))
        let price = state.game.mint.price

        let next = GameOptimistic.afterMint(state)

        XCTAssertEqual(next.game.level.score, 12_180 - price)
        XCTAssertEqual(next.game.level.shown.level, GameLevels.level(forScore: 12_180 - price, cap: GameLevels.capBase))
        XCTAssertLessThan(next.game.level.shown.level, state.game.level.shown.level)
        XCTAssertEqual(next.game.treasury.held, 10)
        XCTAssertEqual(next.meesh?.balance, 10)
        XCTAssertEqual(next.meesh?.mintedLifetime, 13)
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
        let state = GameFixture.state()
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
        let state = GameFixture.state(GameFixture.game(score: 12_180, chestStatus: .ready))
        let reward = DailyChest(points: 90, fragment: true, freeze: false)

        let next = GameOptimistic.withChestReward(state, reward: reward, score: 12_270)

        XCTAssertEqual(next.game.chest.reward, reward)
        XCTAssertEqual(next.game.chest.status, .claimed)
        XCTAssertEqual(next.game.level.score, 12_270)
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
}
