import XCTest
import MeeshySDK
@testable import Meeshy

/// « Ma Légende » sur ma fiche (#19630, planches `Main` et `Moi-Actions`) : mon niveau, mon rang et les étincelles qui
/// manquent pour le niveau suivant, lus dans le bloc du jeu DÉJÀ en cache. Sans donnée de jeu, la rangée garde sa
/// phrase d'avant et ne porte aucune jauge.
@MainActor
final class ProfileLegendSummaryTests: XCTestCase {

    private final class FakeSource: PlayerBannerSourcing, @unchecked Sendable {
        var cachedBlock: GameBlock?
        private(set) var cachedCalls = 0
        private(set) var fetchCalls = 0

        func cached() async -> GameBlock? {
            cachedCalls += 1
            return cachedBlock
        }

        func fetch() async -> GameBlock? {
            fetchCalls += 1
            return nil
        }
    }

    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private func banner(level: Int = 24, prestige: Int = 0, progress: Double = 0.68, nextLevel: Int? = 25,
                        pointsToNext: Int? = 640, levelCap: Int? = nil,
                        rank: GamePlayerBanner.Rank? = GamePlayerBanner.Rank(rank: .voix, division: .iii)) -> GamePlayerBanner {
        GamePlayerBanner(level: level, tier: .lueur, progress: progress, prestige: prestige, score: 12_000,
                         nextLevel: nextLevel, pointsToNext: pointsToNext, levelCap: levelCap, rank: rank)
    }

    private var rankText: String { GameCopy.rankLabel(.voix, division5: .iii) }

    // MARK: - Le résumé

    func test_summary_withLevelAndRank_saysBoth_andTheSparksMissingForTheNextLevel() throws {
        let summary = try XCTUnwrap(ProfileLegendSummary.of(banner()))

        XCTAssertEqual(summary.subtitle, String(format: served("profile.legend.level_rank"), "24", rankText))
        XCTAssertEqual(summary.progress, 0.68)
        XCTAssertEqual(summary.progressLine, GameCopy.levelToNext(remaining: 640, nextLevel: 25))
    }

    func test_summary_atTheLevelCap_fillsTheGauge_andSaysTheCapSentence() throws {
        let summary = try XCTUnwrap(ProfileLegendSummary.of(banner(progress: 1, nextLevel: nil, pointsToNext: nil, levelCap: 499)))

        XCTAssertEqual(summary.progress, 1)
        XCTAssertEqual(summary.progressLine, GameCopy.levelTop(cap: 499))
    }

    func test_summary_atLevelOne_saysTheRankAlone_withoutGauge() throws {
        let summary = try XCTUnwrap(ProfileLegendSummary.of(banner(level: 1, progress: 0.1, nextLevel: 2, pointsToNext: 30)))

        XCTAssertEqual(summary.subtitle, String(format: served("profile.legend.rank"), rankText))
        XCTAssertNil(summary.progress, "le détail du niveau n'a de sens qu'au-delà du niveau 1")
        XCTAssertNil(summary.progressLine)
    }

    func test_summary_withoutGlory_saysTheLevelAlone_andKeepsTheGauge() throws {
        let summary = try XCTUnwrap(ProfileLegendSummary.of(banner(rank: nil)))

        XCTAssertEqual(summary.subtitle, String(format: served("profile.legend.level"), "24"))
        XCTAssertEqual(summary.progress, 0.68)
    }

    func test_summary_withoutGameData_isAbsent_andTheRowKeepsItsFormerSentence() {
        XCTAssertNil(ProfileLegendSummary.of(nil))
        XCTAssertNil(ProfileLegendSummary.of(banner(level: 1, rank: nil)), "rien à dire : aucun sous-titre inventé")
        XCTAssertEqual(ProfileLegendSummary.subtitle(for: nil), served("profile.progression.subtitle"))
    }

    func test_subtitle_withASummary_isTheLevelAndRank() throws {
        let summary = try XCTUnwrap(ProfileLegendSummary.of(banner()))

        XCTAssertEqual(ProfileLegendSummary.subtitle(for: summary), summary.subtitle)
    }

    func test_spokenValue_saysTheSubtitleThenTheSparksMissing() throws {
        let summary = try XCTUnwrap(ProfileLegendSummary.of(banner()))

        XCTAssertEqual(ProfileLegendSummary.spokenValue(for: summary),
                       summary.subtitle + ", " + GameCopy.levelToNext(remaining: 640, nextLevel: 25))
        XCTAssertEqual(ProfileLegendSummary.spokenValue(for: nil), served("profile.progression.subtitle"))
    }

    // MARK: - Le magasin

    func test_activate_readsTheCachedGame_withoutAnyRequest() async {
        let source = FakeSource()
        let game = GameFixture.game()
        source.cachedBlock = game
        let sut = ProfileLegendStore(source: source)

        await sut.activate(hidden: false)

        XCTAssertNotNil(sut.summary)
        XCTAssertEqual(sut.summary, ProfileLegendSummary.of(GamePlayerBanner.make(game: game)))
        XCTAssertEqual(source.fetchCalls, 0, "la rangée lit le cache, elle ne lance jamais de requête")
    }

    func test_activate_withAnEmptyCache_showsNoSummary() async {
        let sut = ProfileLegendStore(source: FakeSource())

        await sut.activate(hidden: false)

        XCTAssertNil(sut.summary)
    }

    func test_activate_whenTheGameIsHidden_readsNothing_andShowsNoSummary() async {
        let source = FakeSource()
        source.cachedBlock = GameFixture.game()
        let sut = ProfileLegendStore(source: source)
        await sut.activate(hidden: false)

        await sut.activate(hidden: true)

        XCTAssertNil(sut.summary, "« Jeu masqué » : ni niveau, ni rang, ni jauge")
        XCTAssertEqual(source.cachedCalls, 1)
    }

    // MARK: - Fait du kit (loi 12)

    func test_profileEntry_isMadeOfTheKitRowAndGauge_notRedrawnInPlace() throws {
        let source = try code("Meeshy/Features/Profile/Views/ProfileProgressionEntry.swift")

        XCTAssertTrue(source.contains("MeeshyToggleRowFace("), "la rangée est K06")
        XCTAssertTrue(source.contains("MeeshyMeter("), "la jauge est K42")
        XCTAssertFalse(source.contains("HStack("), "aucune rangée redessinée sur place")
        XCTAssertFalse(source.contains(".fill("), "aucune surface peinte sur place : le verre du design system")
    }

    func test_actionsFace_legendRow_carriesTheLevelAndRankSubtitle() throws {
        let source = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")

        XCTAssertTrue(source.contains("subtitle: ProfileLegendSummary.subtitle(for: legend)"))
    }
}
