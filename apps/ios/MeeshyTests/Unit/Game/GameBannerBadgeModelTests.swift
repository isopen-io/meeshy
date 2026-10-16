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

    // MARK: - Les étincelles (#10846) : la poche en grand, le total à vie dessous ; le niveau, le max à vie dessous

    private func sparked(points: Int? = nil, sparks: Int? = nil, lifetime: Int? = nil, level: Int = 3,
                         levelMax: Int? = nil) -> GameBannerBadgeModel? {
        let served = GameStanding(level: level, tier: .etincelle, prestige: 0, flame: nil, rank: .murmure, division: .iii,
                                  division5: .v, ladder: GameStandingLadder(level: level, tier: .etincelle), points: points,
                                  levelMaxLifetime: levelMax, sparks: sparks, sparksLifetime: lifetime)
        return GameBannerBadgeModel.of(GameStandingContent(standing: served, treasuryTier: nil), userId: "u1")
    }

    func test_servedSparks_showThePocket_andTheLifetimeTotalBelow() throws {
        let model = try XCTUnwrap(sparked(points: 976, sparks: 976, lifetime: 12_000))

        XCTAssertEqual(model.pocket, 976)
        XCTAssertEqual(model.pocketText, GameSparksCopy.bannerPocket(976))
        XCTAssertEqual(model.lifetimeText, GameSparksCopy.bannerLifetime(12_000))
    }

    /// Un serveur d'avant les étincelles : la poche se lit sur `points`, et aucun total à vie ne s'invente.
    func test_olderServer_readsThePocketOnPoints_withoutInventingALifetime() throws {
        let model = try XCTUnwrap(sparked(points: 976))

        XCTAssertEqual(model.pocket, 976)
        XCTAssertNil(model.lifetimeText)
    }

    func test_noSparksServed_saysNoSparks() throws {
        let model = try XCTUnwrap(sparked())

        XCTAssertNil(model.pocketText)
        XCTAssertNil(model.lifetimeText)
    }

    /// Le niveau max à vie se montre TOUJOURS sous le niveau, même égal à lui.
    func test_theLifetimeMaxLevel_isAlwaysShown_evenWhenEqualToTheLevel() throws {
        XCTAssertEqual(try XCTUnwrap(sparked(level: 12, levelMax: 40)).levelMaxText, GameSparksCopy.bannerLevelMax(40))
        XCTAssertEqual(try XCTUnwrap(sparked(level: 12, levelMax: 12)).levelMaxText, GameSparksCopy.bannerLevelMax(12))
        XCTAssertEqual(try XCTUnwrap(sparked(level: 12)).levelMaxText, GameSparksCopy.bannerLevelMax(12),
                       "devant un serveur antérieur, le max à vie ne passe jamais sous le niveau")
    }

    /// La poche n'est pas la base du niveau (c'est le CYCLE, que la fiche ne reçoit pas) : le cercle ne prétend
    /// plus mesurer une progression qu'il ne connaît pas.
    func test_theRing_staysFull_theCycleIsNotServed() throws {
        XCTAssertEqual(try XCTUnwrap(sparked(points: 976, sparks: 976)).levelProgress, 1)
    }

    func test_levelAccessibilityLabel_readsPocketLifetimeAndLifetimeMax() throws {
        let model = try XCTUnwrap(sparked(points: 976, sparks: 976, lifetime: 12_000, level: 3, levelMax: 40))

        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameSparksCopy.sparks(976)))
        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameSparksCopy.lifetimeAccessibility(12_000)))
        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameSparksCopy.levelMaxAccessibility(40)))
    }

    // MARK: - Coins LOGIQUES : aucun arrondi au bord de début des étincelles ni au bord de fin des rangs

    func test_corners_followTheReadingDirection() {
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .level, direction: .leftToRight), [.topRight])
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .level, direction: .rightToLeft), [.topLeft],
                       "en RTL la pastille des étincelles est à droite : son bord de début est le droit, carré")
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .rank, direction: .leftToRight), [.topLeft])
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .rank, direction: .rightToLeft), [.topRight])
    }

    func test_standingAccessibilityLabel_servedFlame_isNeverRead() {
        let content = GameStandingContent(standing: standing(flame: .brasier), treasuryTier: .coffre)

        XCTAssertFalse(content.accessibilityLabel.contains(GameCopy.flameFormName(.brasier)))
    }
}
