import XCTest
@testable import Meeshy
import MeeshySDK

/// #10093 — sur la bannière d'une fiche : le cercle de niveau surmonté du NOM du niveau, et le blason du rang avec
/// le NOM du rang. Rien d'autre du jeu — et jamais la Flamme : aucun réglage du jeu ne permet à son propriétaire de
/// la montrer, donc elle reste masquée partout sur une fiche.
@MainActor
final class GameBannerBadgeModelTests: XCTestCase {

    private func standing(flame: FlameFormKey? = .brasier, rank: GloryRank = .voix) -> GameStanding {
        GameStanding(level: 42, tier: .eclat, prestige: 1, flame: flame, rank: rank, division: .ii)
    }

    func test_of_servedStanding_namesTheLevelAndTheRank() throws {
        let model = try XCTUnwrap(GameBannerBadgeModel.of(GameStandingContent(standing: standing(), treasuryTier: nil), userId: "u1"))

        XCTAssertEqual(model.userId, "u1")
        XCTAssertEqual(model.level, 42)
        XCTAssertEqual(model.levelName, GameCopy.tierName(.eclat))
        XCTAssertEqual(model.rankName, GameCopy.rankLabel(standing()))
    }

    func test_of_treasuryOnly_drawsNothing() {
        XCTAssertNil(GameBannerBadgeModel.of(GameStandingContent(standing: nil, treasuryTier: .coffre), userId: "u1"))
    }

    func test_of_nothingServed_drawsNothing() {
        XCTAssertNil(GameBannerBadgeModel.of(nil, userId: "u1"))
    }

    func test_accessibilityLabels_oneForTheLevelOneForTheRank_neverTheFlame() throws {
        let model = try XCTUnwrap(GameBannerBadgeModel.of(GameStandingContent(standing: standing(flame: .brasier), treasuryTier: nil), userId: "u1"))

        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameCopy.levelRingAccessibility(level: 42, tier: .eclat)))
        XCTAssertFalse(model.levelAccessibilityLabel.contains(GameCopy.rankLabel(standing())))
        XCTAssertTrue(model.rankAccessibilityLabel.contains(GameCopy.rankLabel(standing())))
        XCTAssertFalse((model.levelAccessibilityLabel + model.rankAccessibilityLabel).contains(GameCopy.flameFormName(.brasier)))
    }

    // MARK: - #10231 — les points à gauche : acquis, et ce qu'il reste vers le niveau suivant

    /// Niveau 3 (seuil 900), 976 points : le niveau 4 s'ouvre à 1 600 — encore 624.
    private func pointed(points: Int?, level: Int = 3) -> GameBannerBadgeModel? {
        let served = GameStanding(level: level, tier: .etincelle, prestige: 0, flame: nil, rank: .murmure, division: .iii,
                                  division5: .v, ladder: GameStandingLadder(level: level, tier: .etincelle), points: points)
        return GameBannerBadgeModel.of(GameStandingContent(standing: served, treasuryTier: nil), userId: "u1")
    }

    func test_of_servedPoints_saysThePointsAndWhatRemainsToTheNextLevel() throws {
        let model = try XCTUnwrap(pointed(points: 976))

        XCTAssertEqual(model.points, 976)
        XCTAssertEqual(model.pointsToNext, 624)
        XCTAssertEqual(model.pointsText, GameText.bannerPoints(points: GameCopy.formatCount(976)))
        XCTAssertEqual(model.missingText, GameText.bannerMissing(points: GameCopy.formatCount(624)))
        XCTAssertEqual(model.levelProgress, Double(976 - 900) / Double(1600 - 900), accuracy: 0.0001)
    }

    func test_of_noPointsServed_saysNoPoints_andTheRingStaysFull() throws {
        let model = try XCTUnwrap(pointed(points: nil))

        XCTAssertNil(model.pointsText)
        XCTAssertNil(model.missingText)
        XCTAssertEqual(model.levelProgress, 1)
    }

    func test_of_levelHeldByRankOrStep_saysThePointsWithoutAMissingCount() throws {
        let model = try XCTUnwrap(pointed(points: 2_000))

        XCTAssertNotNil(model.pointsText)
        XCTAssertNil(model.pointsToNext, "un niveau retenu ne dit pas « encore 0 »")
        XCTAssertNil(model.missingText)
        XCTAssertEqual(model.levelProgress, 1)
    }

    func test_levelAccessibilityLabel_readsThePointsAndTheNextLevel() throws {
        let model = try XCTUnwrap(pointed(points: 976))

        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameCopy.points(976)))
        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameCopy.levelToNext(remaining: 624, nextLevel: 4)))
    }

    func test_standingAccessibilityLabel_servedFlame_isNeverRead() {
        let content = GameStandingContent(standing: standing(flame: .brasier), treasuryTier: .coffre)

        XCTAssertFalse(content.accessibilityLabel.contains(GameCopy.flameFormName(.brasier)))
    }
}
