import XCTest
@testable import Meeshy
import MeeshySDK

/// Le carnet des règles, illustré : chaque famille du document de conception y a son dessin (#9538).
@MainActor
final class GameRulesAtlasTests: XCTestCase {

    private func atlasViewSource() throws -> String {
        let here = URL(fileURLWithPath: #filePath)
        let root = here.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Game/GameRulesAtlasView.swift"), encoding: .utf8)
    }

    func test_theNotebookShowsNineFamilies_inTheOrderOfTheDesign() {
        XCTAssertEqual(
            GameRulesAtlas.Family.allCases.map(\.rawValue),
            ["tiers", "coin", "treasury", "ranks", "flames", "leagues", "medals", "trophies", "rarities"]
        )
    }

    func test_meeAndMeoBothSpeak() {
        let speakers = Set(GameRulesAtlas.Family.allCases.map(\.speaker))
        XCTAssertTrue(speakers.contains(.mee))
        XCTAssertTrue(speakers.contains(.meo))
    }

    func test_tenTiers_startAtLevelOne_thenEveryTenLevels() {
        XCTAssertEqual(GameRulesAtlas.tiers.count, 10)
        XCTAssertEqual(GameRulesAtlas.tiers.map(GameRulesAtlas.firstLevel(of:)), [1, 10, 20, 30, 40, 50, 60, 70, 80, 90])
    }

    func test_theMeeshShowsItsObverse_itsReverse_andTheGoldAndPrismEditions() {
        let plates = GameRulesAtlas.CoinPlate.allCases
        XCTAssertEqual(plates.count, 4)
        XCTAssertEqual(plates.filter(\.isReverse).count, 3)
        XCTAssertEqual(GameRulesAtlas.CoinPlate.gold.edition, .gold)
        XCTAssertEqual(GameRulesAtlas.CoinPlate.gold.number, 100)
        XCTAssertEqual(GameRulesAtlas.CoinPlate.prism.edition, .prism)
        XCTAssertEqual(GameRulesAtlas.CoinPlate.prism.number, 1000)
    }

    func test_sixTreasuryTiers_eachPilesOneCoinMore() {
        XCTAssertEqual(GameRulesAtlas.treasury.count, 6)
        XCTAssertEqual(GameRulesAtlas.treasury.map(GameRulesAtlas.pile(of:)), [1, 2, 3, 4, 5, 6])
    }

    func test_elevenBlasons_andMythHasNoDivision() {
        XCTAssertEqual(GameRulesAtlas.ranks.count, 11)
        XCTAssertNil(GameRulesAtlas.division(of: .mythe))
        XCTAssertEqual(GameRulesAtlas.division(of: .voix), .v)
    }

    func test_fiveFlames_eightLeagues() {
        XCTAssertEqual(GameRulesAtlas.flames.count, 5)
        XCTAssertEqual(GameRulesAtlas.leagues.count, 8)
    }

    func test_sevenMedalMaterials_climbFromOneToFiveThousandActions() {
        XCTAssertEqual(GameRulesAtlas.medalMaterials.map(\.threshold), [1, 10, 50, 100, 500, 1000, 5000])
        XCTAssertFalse(GameRulesAtlas.medalMaterials.contains { $0.material == .flame })
        XCTAssertEqual(GameRulesAtlas.MedalShape.allCases.count, 3)
    }

    func test_sixTrophies_andFiveRarities_eachWithItsGlory() {
        XCTAssertEqual(GameRulesAtlas.TrophyPlate.allCases.count, 6)
        XCTAssertEqual(GameRulesAtlas.TrophyPlate.flame.material, .flame)
        XCTAssertEqual(GameRulesAtlas.rarities.count, 5)
        XCTAssertEqual(
            GameRulesAtlas.rarities.map(GameRulesAtlas.glory(of:)),
            GameRulesAtlas.rarities.map(GameGlory.gloryForAchievement)
        )
    }

    func test_everyFamilyIsDrawnByTheBrickThatDrawsItElsewhere_noBitmap() throws {
        let source = try atlasViewSource()
        for brick in [
            "LevelRingView", "MeeshCoinView", "RankBlasonView", "FlameView", "LeagueGemView", "GameBadgeView",
            "TrophyView", "gameRarityRim", "MeeStickerFilmView",
        ] {
            XCTAssertTrue(source.contains(brick), "\(brick) manque au carnet illustré")
        }
        XCTAssertFalse(source.contains("Image(\""), "le carnet ne tire aucun bitmap")
    }

    func test_theNotebookPageMountsTheAtlas() throws {
        let here = URL(fileURLWithPath: #filePath)
        let root = here.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let page = try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Game/GameRulesView.swift"), encoding: .utf8)
        XCTAssertTrue(page.contains("GameRulesAtlasView()"))
    }
}
