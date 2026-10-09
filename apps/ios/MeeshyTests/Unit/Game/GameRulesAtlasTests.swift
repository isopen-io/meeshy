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

    func test_twentyTiers_tenLevelsEachUpTo100_thenAHundred_thenSingularityAt1000() {
        XCTAssertEqual(GameRulesAtlas.tiers.count, 20)
        XCTAssertEqual(
            GameRulesAtlas.tiers.map(GameRulesAtlas.firstLevel(of:)),
            [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        )
    }

    /// Le carnet dit la règle ouverte par le rang (#9688) : 499 sous Ambassadeur, 1000 pour Ambassadeur et Orateur,
    /// sans limite à partir d'Oracle — dérivé de la loi, jamais recopié.
    func test_theLevelCapBands_comeFromTheLaw() {
        XCTAssertEqual(GameRulesAtlas.levelCapBands.map(\.cap), [GameLevels.capBase, GameLevels.capAmbassador, nil])
        XCTAssertEqual(GameRulesAtlas.levelCapBands[1].ranks, [.ambassadeur, .orateur])
        XCTAssertEqual(GameRulesAtlas.levelCapBands[2].ranks.first, .oracle)
    }

    func test_theLevelRules_sayEachCap_theOptionalPrestige_andTheFirstPassGlory() {
        let rules = GameAtlasCopy.levelRules
        XCTAssertEqual(rules.count, 5)
        XCTAssertTrue(rules[0].contains(GameCopy.formatCount(499)) && rules[0].contains(GameCopy.rankName(.ambassadeur)), rules[0])
        XCTAssertTrue(rules[1].contains(GameCopy.formatCount(1000)) && rules[1].contains(GameCopy.rankName(.orateur)), rules[1])
        XCTAssertTrue(rules[2].contains(GameCopy.rankName(.oracle)), rules[2])
        XCTAssertTrue(rules[3].contains(GameCopy.formatCount(GameLevels.prestigeLevel)), rules[3])
        XCTAssertTrue(rules[4].contains(GameCopy.formatCount(GameGlory.points.levelDecade)), rules[4])
        for rule in rules { XCTAssertFalse(rule.hasPrefix("game."), "clé brute : \(rule)") }
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
