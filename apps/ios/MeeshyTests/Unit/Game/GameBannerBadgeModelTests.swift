import XCTest
@testable import Meeshy
import MeeshySDK

/// #10093 — sur la bannière d'une fiche : le cercle de niveau surmonté du NOM du niveau, et le blason du rang avec
/// le NOM du rang. Rien d'autre du jeu — et jamais la Flamme : aucun réglage du jeu ne permet à son propriétaire de
/// la montrer, donc elle reste masquée partout sur une fiche.
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

    func test_accessibilityLabel_saysLevelAndRank_neverTheFlame() throws {
        let model = try XCTUnwrap(GameBannerBadgeModel.of(GameStandingContent(standing: standing(flame: .brasier), treasuryTier: nil), userId: "u1"))

        XCTAssertTrue(model.accessibilityLabel.contains(GameCopy.rankLabel(standing())))
        XCTAssertTrue(model.accessibilityLabel.contains(GameCopy.levelRingAccessibility(level: 42, tier: .eclat)))
        XCTAssertFalse(model.accessibilityLabel.contains(GameCopy.flameFormName(.brasier)))
    }

    func test_standingAccessibilityLabel_servedFlame_isNeverRead() {
        let content = GameStandingContent(standing: standing(flame: .brasier), treasuryTier: .coffre)

        XCTAssertFalse(content.accessibilityLabel.contains(GameCopy.flameFormName(.brasier)))
    }
}
