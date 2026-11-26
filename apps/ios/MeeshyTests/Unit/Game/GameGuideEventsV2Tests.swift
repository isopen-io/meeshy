import XCTest
@testable import Meeshy
import MeeshySDK

/// Les événements du guide de la vague 2 (#9481) : ce qui vient d'ARRIVER entre deux instantanés — et rien quand une
/// extension manque d'un côté.
@MainActor
final class GameGuideEventsV2Tests: XCTestCase {

    private func snapshot(
        prestige: Int = 0,
        league: GuideSnapshotV2.League? = GuideSnapshotV2.League(weekKey: "2026-10-12", current: nil),
        season: GuideSnapshotV2.Season? = nil,
        trophies: [String]? = [],
        atlas: GuideSnapshotV2.Atlas? = GuideSnapshotV2.Atlas(total: 83, languages: [])
    ) -> GuideSnapshotV2 {
        GuideSnapshotV2(prestige: prestige, league: league, season: season, trophies: trophies, atlas: atlas)
    }

    private let promoted = GuideSnapshotV2.League(
        weekKey: "2026-10-19", current: .init(league: .ambre, rank: 3, pointsToPromotion: 40))
    private let jade = GuideSnapshotV2.League(
        weekKey: "2026-10-12", current: .init(league: .jade, rank: 3, pointsToPromotion: 0))

    func test_aLeagueGainedAfterNone_isTheFirstLeague() {
        let events = GameGuideEventsV2.between(before: snapshot(), after: snapshot(league: jade))
        XCTAssertEqual(events, [.leagueFirst(league: .jade, pointsToPromotion: 0)])
    }

    func test_aHigherLeagueOnANewWeek_isAPromotion_toldFromTheWeekThatEnded() {
        let before = snapshot(league: GuideSnapshotV2.League(weekKey: "2026-10-12", current: .init(league: .quartz, rank: 3, pointsToPromotion: 0)))
        let events = GameGuideEventsV2.between(before: before, after: snapshot(league: promoted))
        XCTAssertEqual(events, [.leaguePromoted(from: .quartz, to: .ambre, rank: 3, weekKey: "2026-10-12")])
    }

    func test_aLowerLeagueOnANewWeek_isARelegation() {
        let before = snapshot(league: GuideSnapshotV2.League(weekKey: "2026-10-12", current: .init(league: .saphir, rank: 28, pointsToPromotion: 90)))
        let events = GameGuideEventsV2.between(before: before, after: snapshot(league: promoted))
        XCTAssertEqual(events, [.leagueRelegated(from: .saphir, to: .ambre, pointsToPromotion: 40, weekKey: "2026-10-12")])
    }

    func test_theSameWeek_saysNothingEvenWhenTheRankMoved() {
        let before = snapshot(league: jade)
        let moved = GuideSnapshotV2.League(weekKey: "2026-10-12", current: .init(league: .jade, rank: 1, pointsToPromotion: 0))
        XCTAssertEqual(GameGuideEventsV2.between(before: before, after: snapshot(league: moved)), [])
    }

    func test_anExtensionMissingOnOneSide_producesNoTransition() {
        XCTAssertEqual(GameGuideEventsV2.between(before: snapshot(league: nil, trophies: nil, atlas: nil), after: snapshot(league: jade, trophies: ["trophy.flame.100"], atlas: .init(total: 83, languages: ["ja"]))), [])
    }

    func test_aNewTrophyKey_isATrophy_andAKnownOneIsNot() {
        let events = GameGuideEventsV2.between(before: snapshot(trophies: ["trophy.flame.100"]),
                                               after: snapshot(trophies: ["trophy.flame.100", "trophy.season-cup.1"]))
        XCTAssertEqual(events, [.trophy(trophyKey: "trophy.season-cup.1")])
    }

    func test_aNewStampedLanguage_isAnAtlasStamp_withTheCount() {
        let events = GameGuideEventsV2.between(before: snapshot(atlas: .init(total: 83, languages: ["fr"])),
                                               after: snapshot(atlas: .init(total: 83, languages: ["fr", "ja"])))
        XCTAssertEqual(events, [.atlasStamp(language: "ja", stamped: 2, total: 83)])
    }

    func test_aSeasonThatEnds_andAnotherThatStarts_areBothTold() {
        let first = GuideSnapshotV2.Season(number: 1, themeKey: "language:fr", steps: 40, completed: true)
        let second = GuideSnapshotV2.Season(number: 2, themeKey: "language:es", steps: 0, completed: false)
        let events = GameGuideEventsV2.between(before: snapshot(season: first), after: snapshot(season: second))
        XCTAssertEqual(events, [
            .seasonEnd(season: 1, stepsReached: 40, completed: true, gloryGained: GameGlory.points.season),
            .seasonStart(season: 2, themeKey: "language:es", steps: GameSeason.steps),
        ])
    }

    func test_anUnfinishedSeason_endsWithoutGlory() {
        let first = GuideSnapshotV2.Season(number: 1, themeKey: "language:fr", steps: 12, completed: false)
        let events = GameGuideEventsV2.between(before: snapshot(season: first), after: snapshot(season: nil))
        XCTAssertEqual(events, [.seasonEnd(season: 1, stepsReached: 12, completed: false, gloryGained: 0)])
    }

    // MARK: - À l'ouverture

    func test_standing_tellsTheFirstLeagueAndTheSeasonStartOnce() {
        let game = GameWave2Fixture.game()
        XCTAssertEqual(GameGuideEventsV2.standing(game: game, seen: []).map(\.key), [.leagueFirst, .seasonStart])
        XCTAssertEqual(GameGuideEventsV2.standing(game: game, seen: ["league-first", "season-start"]), [])
    }

    func test_aMomentOfTheWave2_hasItsPage_itsCopy_andItsPhotoWhenTheLawSaysSo() {
        let promoted = GuideMomentV2(key: .leaguePromoted, speaker: .mee, mood: .cheer,
                                     event: .leaguePromoted(from: .quartz, to: .ambre, rank: 3, weekKey: "2026-10-12"),
                                     action: .seeLeague, presentation: .full)
        let card = GameGuideCard.ofMomentV2(promoted)
        XCTAssertEqual(card.wave2Page, .league)
        XCTAssertTrue(card.photo)
        XCTAssertEqual(card.photoMoment?.id, "league-up:2026-10-12:ambre")
        XCTAssertFalse(card.copy.what.isEmpty)

        let first = GuideMomentV2(key: .leagueFirst, speaker: .mee, mood: .guide,
                                  event: .leagueFirst(league: .quartz, pointsToPromotion: 12), action: .seeLeague, presentation: .full)
        XCTAssertFalse(GameGuideCard.ofMomentV2(first).photo, "une première ligue ne se photographie pas")
    }

    // MARK: - La première Veilleuse offerte (#20252)

    private func game(freezeGifted: Bool?, seen: [String] = []) -> GameBlock {
        let base = GameFixture.game(flameDays: 3, freezes: 1, guideSeen: seen)
        let flame = base.flame
        return base.replacing(flame: GameBlock.Flame(
            days: flame.days, form: flame.form, bonusPercent: flame.bonusPercent, freezes: flame.freezes,
            maxFreezes: flame.maxFreezes, freezePrice: flame.freezePrice, relightPrice: flame.relightPrice,
            status: flame.status, canRelight: flame.canRelight, freezeGifted: freezeGifted))
    }

    func test_standing_tellsTheFreezeGiftOnItsDay_once() {
        XCTAssertEqual(GameGuideEventsV2.standing(game: game(freezeGifted: true), seen: []), [.flameFreezeGift(freezes: 1)])
        XCTAssertEqual(GameGuideEventsV2.standing(game: game(freezeGifted: true, seen: ["flame-freeze-gift"]), seen: []), [])
        XCTAssertEqual(GameGuideEventsV2.standing(game: game(freezeGifted: true), seen: ["flame-freeze-gift"]), [])
        XCTAssertEqual(GameGuideEventsV2.standing(game: game(freezeGifted: nil), seen: []), [])
        XCTAssertEqual(GameGuideEventsV2.standing(game: game(freezeGifted: false), seen: []), [])
    }

    func test_transition_tellsTheFreezeGiftWhenItArrives_notWhenItWasAlreadyThere() {
        XCTAssertEqual(GameGuideEventsV2.transition(from: game(freezeGifted: nil), to: game(freezeGifted: true)),
                       [.flameFreezeGift(freezes: 1)])
        XCTAssertEqual(GameGuideEventsV2.transition(from: game(freezeGifted: true), to: game(freezeGifted: true)), [])
    }

    func test_theFreezeGiftMoment_isSaidByMeo_andOpensTheFlameFiche() throws {
        let chosen = GameGuideV2.chooseMoment(events: [.wave2(.flameFreezeGift(freezes: 1))], seen: [String]())
        guard case .wave2(let moment) = try XCTUnwrap(chosen) else { return XCTFail("un moment de la vague 2") }
        XCTAssertEqual(moment.speaker, .meo)
        XCTAssertEqual(moment.action, .seeFlame)
        let card = GameGuideCard.ofMomentV2(moment)
        XCTAssertNil(card.wave2Page)
        XCTAssertEqual(card.action, .seeFlame)
        XCTAssertFalse(card.photo, "une Veilleuse offerte ne se photographie pas")
        XCTAssertEqual(card.copy.what, GameText.guideMomentFlameFreezeGiftWhat)
        XCTAssertEqual(card.copy.next, GameText.guideMomentFlameFreezeGiftNext(count: GameCopy.formatCount(1)))
        XCTAssertEqual(card.copy.action, GameGuideCopy.actionLabel(.seeFlame))
    }

    func test_theFreezeGiftMoment_passesAfterTheFlameAtRisk_andBeforeAnAtlasStamp() {
        let chosen = GameGuideV2.chooseMoment(
            events: [.wave2(.atlasStamp(language: "ja", stamped: 4, total: 89)), .wave2(.flameFreezeGift(freezes: 1))],
            seen: [String]())
        XCTAssertEqual(chosen?.keyValue, "flame-freeze-gift")
        let rank = { (key: String) in GameGuideV2.momentPriorityAll.firstIndex(of: key) ?? -1 }
        XCTAssertEqual(rank("flame-freeze-gift"), rank("flame-at-risk") + 1)
    }

    // MARK: - L'Offrande gardée par les aïeux (#20403)

    private func keptGame(status: GameBlock.Chest.Status, kept: Bool?, seen: [String] = []) -> GameBlock {
        let base = GameFixture.game(chestStatus: status, guideSeen: seen)
        let chest = base.chest
        return base.replacing(chest: GameBlock.Chest(status: chest.status, odds: chest.odds, reward: chest.reward,
                                                     today: chest.today, kept: kept))
    }

    func test_standing_tellsTheKeptOffering_whileItIsReady_evenOnceSeen() {
        let said: [GuideEventV2] = [.offeringKept(easedDays: GameWelcomeBack.easedDays)]
        XCTAssertEqual(GameGuideEventsV2.standing(game: keptGame(status: .ready, kept: true), seen: []), said)
        XCTAssertEqual(GameGuideEventsV2.standing(game: keptGame(status: .ready, kept: true, seen: ["offering-kept"]),
                                                  seen: ["offering-kept"]), said, "une urgence douce se redit tant qu'elle est prête")
        XCTAssertEqual(GameGuideEventsV2.standing(game: keptGame(status: .claimed, kept: true), seen: []), [], "ouverte, elle ne se redit plus")
        XCTAssertEqual(GameGuideEventsV2.standing(game: keptGame(status: .ready, kept: false), seen: []), [])
        XCTAssertEqual(GameGuideEventsV2.standing(game: keptGame(status: .ready, kept: nil), seen: []), [], "un serveur antérieur ne la sert pas")
    }

    func test_transition_tellsTheKeptOfferingWhenItArrives_notWhenItWasAlreadyThere() {
        XCTAssertEqual(GameGuideEventsV2.transition(from: keptGame(status: .locked, kept: nil), to: keptGame(status: .ready, kept: true)),
                       [.offeringKept(easedDays: 3)])
        XCTAssertEqual(GameGuideEventsV2.transition(from: keptGame(status: .ready, kept: true), to: keptGame(status: .ready, kept: true)), [])
        XCTAssertEqual(GameGuideEventsV2.transition(from: keptGame(status: .ready, kept: true), to: keptGame(status: .claimed, kept: true)), [])
    }

    func test_theKeptOfferingMoment_isSaidByMee_andOpensTheDreamFiche() throws {
        let chosen = GameGuideV2.chooseMoment(events: [.wave2(.offeringKept(easedDays: 3))], seen: [String]())
        guard case .wave2(let moment) = try XCTUnwrap(chosen) else { return XCTFail("un moment de la vague 2") }
        XCTAssertEqual(moment.speaker, .mee)
        XCTAssertEqual(moment.mood, .cheer)
        XCTAssertEqual(moment.action, .seeMissions)
        let card = GameGuideCard.ofMomentV2(moment)
        XCTAssertNil(card.wave2Page)
        XCTAssertEqual(card.action, .seeMissions)
        XCTAssertEqual(GameGuideTarget.target(for: card.action), .scroll(.missions))
        XCTAssertFalse(card.photo, "une Offrande gardée ne se photographie pas")
        XCTAssertEqual(card.copy.what, GameText.guideMomentOfferingKeptWhat)
        XCTAssertEqual(card.copy.next, GameText.guideMomentOfferingKeptNext(days: GameCopy.days(3)))
        XCTAssertEqual(card.copy.action, GameGuideCopy.actionLabel(.seeMissions))
    }

    func test_theKeptOfferingMoment_passesJustBeforeTheFlameOut() {
        let chosen = GameGuideV2.chooseMoment(
            events: [.original(.flameAtRisk(days: 3)), .wave2(.offeringKept(easedDays: 3))], seen: [String]())
        XCTAssertEqual(chosen?.keyValue, "offering-kept")
        let rank = { (key: String) in GameGuideV2.momentPriorityAll.firstIndex(of: key) ?? -1 }
        XCTAssertEqual(rank("offering-kept"), rank("flame-out") - 1)
        XCTAssertEqual(rank("offering-kept"), rank("season-end") + 1)
    }

    func test_anOptimisticOpening_keepsTheKeptMark() {
        let opened = keptGame(status: .ready, kept: true).chest.replacing(status: .claimed, reward: .some(nil))
        XCTAssertEqual(opened.kept, true)
    }

    // MARK: - L'objectif de Flamme atteint (#20602)

    private func goalGame(target: Int?, reached: Bool, next: Int? = nil, seen: [String] = []) -> GameBlock {
        let base = GameFixture.game(flameDays: 7, guideSeen: seen)
        let current = target.map { GameServedFlameGoal.Current(target: $0, remaining: reached ? 0 : 2, reached: reached, next: next) }
        let goal = GameServedFlameGoal(offer: next.map { [$0] } ?? [], current: current)
        return base.replacing(flame: base.flame.replacing(goal: .some(goal)))
    }

    func test_standing_salutesTheReachedGoalOnce_byItsGoalKey() {
        let said: [GuideEventV2] = [.flameGoalReached(target: 7, next: 14)]
        XCTAssertEqual(GameGuideEventsV2.standing(game: goalGame(target: 7, reached: true, next: 14), seen: []), said)
        XCTAssertEqual(GameGuideEventsV2.standing(game: goalGame(target: 7, reached: true, next: 14, seen: ["flame-goal-next-7"]), seen: []), [],
                       "la carte de la Flamme l'a déjà dit, ou « Plus tard » l'a fermé")
        XCTAssertEqual(GameGuideEventsV2.standing(game: goalGame(target: 7, reached: true, next: 14), seen: ["flame-goal-next-7"]), [],
                       "ce que l'écran vient de marquer compte aussi")
        XCTAssertEqual(GameGuideEventsV2.standing(game: goalGame(target: 7, reached: true, next: 14), seen: ["flame-goal-reached"]), said,
                       "le genre vu ne fait pas taire un nouvel objectif")
        XCTAssertEqual(GameGuideEventsV2.standing(game: goalGame(target: 7, reached: false), seen: []), [], "tant qu'il court, rien")
        XCTAssertEqual(GameGuideEventsV2.standing(game: goalGame(target: nil, reached: false, next: 7), seen: []), [])
        XCTAssertEqual(GameGuideEventsV2.standing(game: GameFixture.game(flameDays: 7), seen: []), [], "un serveur antérieur ne sert pas d'objectif")
    }

    func test_transition_salutesTheGoalReachedWhileTheScreenIsOpen_onlyWhenItArrives() {
        let running = goalGame(target: 7, reached: false)
        let reached = goalGame(target: 7, reached: true, next: 14)
        XCTAssertEqual(GameGuideEventsV2.transition(from: running, to: reached), [.flameGoalReached(target: 7, next: 14)])
        XCTAssertEqual(GameGuideEventsV2.transition(from: reached, to: reached), [], "déjà atteint à la lecture d'avant")
        XCTAssertEqual(GameGuideEventsV2.transition(from: running, to: goalGame(target: 7, reached: true, next: 14, seen: ["flame-goal-next-7"])), [])
        XCTAssertEqual(GameGuideEventsV2.transition(from: reached, to: goalGame(target: 14, reached: true, next: 30)),
                       [.flameGoalReached(target: 14, next: 30)], "une nouvelle marche tenue est un moment nouveau")
    }

    func test_theReachedGoalMoment_isSaidByMeeAndMeo_marksTheGoalKey_andOpensTheFlame() throws {
        let chosen = GameGuideV2.chooseMoment(events: [.wave2(.flameGoalReached(target: 7, next: 14))], seen: [String]())
        guard case .wave2(let moment) = try XCTUnwrap(chosen) else { return XCTFail("un moment de la vague 2") }
        let card = GameGuideCard.ofMomentV2(moment)
        XCTAssertEqual(card.key, "flame-goal-next-7", "la carte se marque vue par la clé que la carte de la Flamme lit")
        XCTAssertEqual(card.speaker, .duo)
        XCTAssertEqual(card.mood, .proud)
        XCTAssertNil(card.wave2Page)
        XCTAssertEqual(GameGuideTarget.target(for: card.action), .scroll(.flame))
        XCTAssertFalse(card.photo)
        XCTAssertEqual(card.copy.what, GameText.guideMomentFlameGoalReachedWhat(days: GameCopy.days(7)))
        XCTAssertEqual(card.copy.next, GameText.guideMomentFlameGoalReachedNext(days: GameCopy.days(14)))
        XCTAssertEqual(card.copy.short, GameText.guideMomentFlameGoalReachedShort(days: GameCopy.days(7)))
        XCTAssertEqual(card.copy.action, GameGuideCopy.actionLabel(.seeFlame))
    }

    func test_theTopGoalMoment_saysEveryStepIsClimbed() throws {
        let chosen = GameGuideV2.chooseMoment(events: [.wave2(.flameGoalReached(target: 365, next: nil))], seen: [String]())
        guard case .wave2(let moment) = try XCTUnwrap(chosen) else { return XCTFail("un moment de la vague 2") }
        XCTAssertEqual(GameGuideCard.ofMomentV2(moment).copy.next, GameText.guideMomentFlameGoalReachedNextTop)
    }

    func test_thePrestigeMoment_opensThePrestigePage() {
        let prestige = GuideMomentV2(key: .prestige, speaker: .duo, mood: .proud, event: .prestige(prestige: 1, gloryGained: 1000),
                                     action: .seeLevel, presentation: .full)
        XCTAssertEqual(GameGuideCard.ofMomentV2(prestige).wave2Page, .prestige)
    }
}
