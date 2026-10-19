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
        XCTAssertEqual(model.levelName, GameCopy.tierName(.eclat), "le nom du palier se pose au-dessus du cercle (#10951)")
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

    // MARK: - Les étincelles en grand près du cercle, la Gloire près du blason — en glyphes, sans mot (#10913, #10951)

    private func sparked(points: Int? = nil, sparks: Int? = nil, lifetime: Int? = nil, glory: Int? = nil, level: Int = 3,
                         levelMax: Int? = nil) -> GameBannerBadgeModel? {
        let served = GameStanding(level: level, tier: .etincelle, prestige: 0, flame: nil, rank: .murmure, division: .iii,
                                  division5: .v, ladder: GameStandingLadder(level: level, tier: .etincelle), points: points,
                                  levelMaxLifetime: levelMax, sparks: sparks, sparksLifetime: lifetime, glory: glory)
        return GameBannerBadgeModel.of(GameStandingContent(standing: served, treasuryTier: nil), userId: "u1")
    }

    /// Soi ou un ami : « ✦ 976 » près du cercle, « ♛ 16 000 » près du blason — jamais le record d'étincelles.
    func test_servedGlory_readsAsGlyphs_neverTheLifetimeSparks() throws {
        let model = try XCTUnwrap(sparked(points: 976, sparks: 976, lifetime: 12_000, glory: 16_000))

        XCTAssertEqual(model.pocket, 976)
        XCTAssertEqual(model.gloryText, "\(GameBannerBadgeModel.gloryGlyph)\u{00A0}\(GameCopy.formatCount(16_000))")
        XCTAssertEqual(model.pocketText, "\(GameBannerBadgeModel.sparkGlyph)\u{00A0}\(GameCopy.formatCount(976))")
        XCTAssertFalse(model.levelAccessibilityLabel.contains(GameCopy.formatCount(12_000)))
    }

    /// Deux glyphes, deux monnaies, aucun mot (porteur 2026-10-19).
    func test_theTwoGlyphs_areDistinct_andCarryNoWord() {
        XCTAssertNotEqual(GameBannerBadgeModel.gloryGlyph, GameBannerBadgeModel.sparkGlyph)
        XCTAssertFalse(GameBannerBadgeModel.gloryGlyph.contains { $0.isLetter })
        XCTAssertFalse(GameBannerBadgeModel.sparkGlyph.contains { $0.isLetter })
    }

    /// Un non-ami (ou un serveur antérieur) : la Gloire n'est pas servie, aucune ligne ne s'invente — même devant un
    /// record d'étincelles servi.
    func test_withheldGlory_drawsNoGloryLine() throws {
        let model = try XCTUnwrap(sparked(points: 976, lifetime: 12_000))

        XCTAssertEqual(model.pocket, 976)
        XCTAssertNil(model.gloryText)
    }

    func test_zeroGlory_drawsNoGloryLine() throws {
        XCTAssertNil(try XCTUnwrap(sparked(points: 976, glory: 0)).gloryText)
    }

    func test_noSparksServed_saysNoSparks() throws {
        let model = try XCTUnwrap(sparked())

        XCTAssertNil(model.pocketText)
        XCTAssertNil(model.gloryText)
    }

    /// Le record de niveau ne s'écrit plus sur la bannière — le cercle porte le niveau — mais il se LIT toujours,
    /// jamais sous le niveau montré.
    func test_theLevelRecord_isReadNeverWritten_andNeverBelowTheLevel() throws {
        XCTAssertEqual(try XCTUnwrap(sparked(level: 12, levelMax: 40)).levelMax, 40)
        XCTAssertEqual(try XCTUnwrap(sparked(level: 12)).levelMax, 12, "devant un serveur antérieur, le record ne passe jamais sous le niveau")
        XCTAssertTrue(try XCTUnwrap(sparked(level: 12, levelMax: 40)).levelAccessibilityLabel.contains(GameSparksCopy.levelMaxAccessibility(40)))
    }

    /// La poche est la base du niveau (#10892) : le cercle se remplit de ce qu'elle a passé du seuil du niveau.
    func test_theRing_fillsWithThePocket() throws {
        let progress = try XCTUnwrap(sparked(points: 976, sparks: 976, level: 3)).levelProgress
        XCTAssertEqual(progress, Double(976 - 900) / Double(1_600 - 900), accuracy: 0.0001)
    }

    /// Une poche qui ne porte pas le niveau servi (retenu par une étape, ou un serveur antérieur) : le cercle reste
    /// plein plutôt que de mentir.
    func test_theRing_staysFull_whenThePocketDoesNotCarryTheServedLevel() throws {
        XCTAssertEqual(try XCTUnwrap(sparked(points: 976, sparks: 976, level: 9)).levelProgress, 1)
        XCTAssertEqual(try XCTUnwrap(sparked(level: 3)).levelProgress, 1)
    }

    func test_levelAccessibilityLabel_readsPocketAndLifetimeMax_theRankReadsTheGlory() throws {
        let model = try XCTUnwrap(sparked(points: 976, sparks: 976, lifetime: 12_000, glory: 16_000, level: 3, levelMax: 40))
        let glory = GameCopy.gloryAmount(GameCopy.formatCount(16_000))

        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameSparksCopy.sparks(976)))
        XCTAssertTrue(model.levelAccessibilityLabel.contains(GameSparksCopy.levelMaxAccessibility(40)))
        XCTAssertFalse(model.levelAccessibilityLabel.contains(glory), "la Gloire se lit avec le rang, à côté duquel elle se pose")
        XCTAssertTrue(model.rankAccessibilityLabel.hasSuffix(GameText.bannerSeparator + glory))
        XCTAssertFalse(model.rankAccessibilityLabel.contains(GameBannerBadgeModel.gloryGlyph))
    }

    func test_rankAccessibilityLabel_withheldGlory_readsTheRankAlone() throws {
        let model = try XCTUnwrap(sparked(points: 976))
        XCTAssertEqual(model.rankAccessibilityLabel, ConceptText.factRank + GameText.bannerSeparator + model.rankName)
    }

    // MARK: - Coins LOGIQUES : aucun arrondi au bord de début des étincelles ni au bord de fin des rangs

    func test_corners_followTheReadingDirection() {
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .level, direction: .leftToRight), [.topRight])
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .level, direction: .rightToLeft), [.topLeft],
                       "en RTL la pastille des étincelles est à droite : son bord de début est le droit, carré")
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .rank, direction: .leftToRight), [.topLeft])
        XCTAssertEqual(GameBannerBadgeView.roundedCorners(for: .rank, direction: .rightToLeft), [.topRight])
    }

    /// Les deux cadres ont TOUJOURS la même largeur : chacun la moitié de ce que l'avatar laisse (#10951).
    func test_bothGroups_shareTheSameWidth_whateverTheirContent() {
        XCTAssertEqual(GameBannerBadgeView.groupWidth(bannerWidth: 390), (390 - GameBannerBadgeView.avatarClearance) / 2)
        XCTAssertEqual(GameBannerBadgeView.groupWidth(bannerWidth: 50), 0)
    }

    func test_standingAccessibilityLabel_servedFlame_isNeverRead() {
        let content = GameStandingContent(standing: standing(flame: .brasier), treasuryTier: .coffre)

        XCTAssertFalse(content.accessibilityLabel.contains(GameCopy.flameFormName(.brasier)))
    }
}
