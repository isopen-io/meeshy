import XCTest
@testable import Meeshy
import MeeshySDK

/// Ce que la vague 2 DIT (#9481) : les noms, les dates et les trophées — habillés depuis la loi, dans la locale lue.
final class GameWave2NamesTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")

    // MARK: - Les trophées : une clé rend sa coupe, son titre et sa plaque

    func test_aLeagueCupKey_isAGoldCupOfItsLeague_withItsPlate() throws {
        let view = try XCTUnwrap(GameTrophyPresentation.of(key: "trophy.league-cup.2026-10-26.jade.gold", locale: french))
        XCTAssertEqual(view.kind, .league(.gold))
        XCTAssertEqual(view.material, .gold)
        XCTAssertTrue(view.plate.contains("JADE"))
        XCTAssertTrue(view.plate.contains("44"), "la semaine ISO du 26 octobre 2026 est la 44")
        XCTAssertTrue(view.title.contains("Jade"))
    }

    func test_aVisitorCupKey_carriesTheMonth_neverTheWeek() throws {
        let view = try XCTUnwrap(GameTrophyPresentation.of(key: "trophy.league-cup.2026-10.jade.silver", locale: french))
        XCTAssertEqual(view.material, .silver)
        XCTAssertTrue(view.title.contains("2026"))
        XCTAssertFalse(view.title.contains("26 octobre"), "un visiteur ne lit jamais le jour")
    }

    func test_eachKindOfTrophy_hasItsMaterial() throws {
        XCTAssertEqual(GameTrophyPresentation.of(key: "trophy.season-cup.3")?.material, .platinum)
        XCTAssertEqual(GameTrophyPresentation.of(key: "trophy.prestige.2")?.material, .prism)
        XCTAssertEqual(GameTrophyPresentation.of(key: "trophy.flame.365")?.material, .flame)
        XCTAssertEqual(GameTrophyPresentation.of(key: "trophy.league-cup.2026-10-05.ambre.bronze")?.material, .bronze)
    }

    func test_aKeyThisClientDoesNotKnow_isNotNamed() {
        XCTAssertNil(GameTrophyPresentation.of(key: "trophy.future.9"))
        XCTAssertNil(GameTrophyPresentation.of(key: ""))
        XCTAssertNil(GameTrophyPresentation.of(key: "trophy.prestige.6"))
    }

    // MARK: - Les dates

    func test_aDay_isReadInUTC_neverSlidingByADay() {
        XCTAssertEqual(GameWave2Format.day("2026-10-13", locale: french), "13 octobre 2026")
        XCTAssertEqual(GameWave2Format.month("2026-10", locale: french), "octobre 2026")
    }

    func test_anUnreadableDay_isLeftAsIs() {
        XCTAssertEqual(GameWave2Format.day("pas-une-date", locale: french), "pas-une-date")
    }

    func test_theISOWeekOfAMonday() {
        XCTAssertEqual(GameWave2Format.isoWeekNumber("2026-10-26"), 44)
        XCTAssertEqual(GameWave2Format.isoWeekNumber("2027-01-04"), 1)
    }

    func test_aLanguageIsNamedInTheLocaleOfTheDevice() {
        XCTAssertEqual(GameWave2Format.languageName("ja", locale: french), "Japonais")
        XCTAssertEqual(GameWave2Format.languageName("sw", locale: french), "Swahili")
        XCTAssertEqual(GameWave2Format.languageName("zzz", locale: french), "ZZZ")
    }

    func test_aSeasonTheme_namesItsLanguage_andSilencesWhatItDoesNotKnow() {
        XCTAssertEqual(GameWave2Format.seasonTheme("language:es", locale: french), "Espagnol")
        XCTAssertNil(GameWave2Format.seasonTheme("region:afrique", locale: french))
        XCTAssertNil(GameWave2Format.seasonTheme("language:", locale: french))
    }

    func test_theTimeBeforeTheClose_isCalm_daysAndHours_thenHours_thenMinutes() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
        let closes = GameLeagueBlock.Closes(dayKey: "2026-10-18", minuteOfDay: 1200)
        let close = calendar.date(from: DateComponents(year: 2026, month: 10, day: 18, hour: 20)) ?? Date()
        let twoDaysThree = close.addingTimeInterval(-(2 * 24 + 3) * 3600)
        let fiveHours = close.addingTimeInterval(-5 * 3600)
        let ninetyMinutes = close.addingTimeInterval(-90 * 60)
        XCTAssertEqual(GameWave2Format.remaining(closes: closes, now: twoDaysThree, calendar: calendar), GameText.durationDaysHours(days: "2", hours: "3"))
        XCTAssertEqual(GameWave2Format.remaining(closes: closes, now: fiveHours, calendar: calendar), GameText.durationHours(hours: "5"))
        XCTAssertEqual(GameWave2Format.remaining(closes: closes, now: ninetyMinutes, calendar: calendar), GameText.durationHours(hours: "1"))
        XCTAssertEqual(GameWave2Format.remaining(closes: closes, now: close.addingTimeInterval(-600), calendar: calendar), GameText.durationMinutes(minutes: "10"))
    }

    func test_theRarityShare_isWholeFromOnePercent_oneDecimalBelow_neverUnderATenth() {
        XCTAssertEqual(GameWave2Format.rarityPercent(40, locale: french), "40 %")
        XCTAssertEqual(GameWave2Format.rarityPercent(4.2, locale: french), "4 %")
        XCTAssertEqual(GameWave2Format.rarityPercent(0.6, locale: french), "0,6 %")
        XCTAssertEqual(GameWave2Format.rarityPercent(0.01, locale: french), "< 0,1 %")
    }

    // MARK: - Les noms de la loi

    func test_everyLeagueZoneCupAndVisibility_isNamed_distinctly() {
        XCTAssertEqual(Set(LeagueKey.allCases.map(GameText.leagueName)).count, LeagueKey.allCases.count)
        XCTAssertEqual(Set([LeagueZone.promotion, .safe, .relegation].map(GameText.zoneLabel)).count, 3)
        XCTAssertEqual(Set(LeagueCup.allCases.map(GameText.cupName)).count, 3)
        XCTAssertEqual(Set(ShowcaseVisibility.allCases.map(GameText.visibilityLabel)).count, 3)
        XCTAssertEqual(Set(GameGlory.AchievementRarity.allCases.map(GameText.rarityName)).count, 5)
    }

    func test_theStateOfASeasonStep_isReadFromTheBlock() {
        let season = GameWave2Fixture.season(steps: 4, claimed: [1, 2])
        XCTAssertEqual(GameSeasonStepState.of(step: 2, in: season), .claimed)
        XCTAssertEqual(GameSeasonStepState.of(step: 3, in: season), .ready)
        XCTAssertEqual(GameSeasonStepState.of(step: 5, in: season), .locked)
    }
}
