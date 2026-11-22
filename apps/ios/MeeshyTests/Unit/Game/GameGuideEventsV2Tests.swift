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

    func test_thePrestigeMoment_opensThePrestigePage() {
        let prestige = GuideMomentV2(key: .prestige, speaker: .duo, mood: .proud, event: .prestige(prestige: 1, gloryGained: 1000),
                                     action: .seeLevel, presentation: .full)
        XCTAssertEqual(GameGuideCard.ofMomentV2(prestige).wave2Page, .prestige)
    }
}
