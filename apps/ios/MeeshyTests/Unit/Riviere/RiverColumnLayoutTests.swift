import XCTest
@testable import Meeshy

/// `RiverColumnLayout` — arithmétique pure, éprouvable sans monter aucune
/// vue (§ « ce que tu peux éprouver sans runtime UIKit complet »).
final class RiverColumnLayoutTests: XCTestCase {

    func test_totalWidth_isLaneCountTimesLaneWidth() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 4)
        XCTAssertEqual(layout.totalWidth, 1200)
    }

    func test_totalWidth_zeroLanes_isZero() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 0)
        XCTAssertEqual(layout.totalWidth, 0)
    }

    func test_railX_isCenterOfLane() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 3)
        XCTAssertEqual(layout.railX(0), 150)
        XCTAssertEqual(layout.railX(1), 450)
        XCTAssertEqual(layout.railX(2), 750)
    }

    func test_laneLeadingX_isLaneIndexTimesLaneWidth() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 3)
        XCTAssertEqual(layout.laneLeadingX(0), 0)
        XCTAssertEqual(layout.laneLeadingX(2), 600)
    }

    func test_bubbleContentWidth_subtractsGutterTwice() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 1)
        XCTAssertEqual(layout.bubbleContentWidth, 244)
    }

    /// Une peau étroite peut réduire `laneWidth` sans jamais faire passer
    /// `bubbleContentWidth` sous zéro (aurait tronqué le texte — §7ter,
    /// « aucune peau ne doit tronquer le texte pour gagner une colonne »).
    func test_bubbleContentWidth_neverNegative_evenIfGutterExceedsLaneWidth() {
        let layout = RiverColumnLayout(laneWidth: 40, gutter: 28, laneCount: 1)
        XCTAssertGreaterThanOrEqual(layout.bubbleContentWidth, 0)
    }

    /// Miroir arithmétique de la maquette normative
    /// (`docs/design/2026-08-17-riviere-navigation.html`, `railX = laneIndex
    /// * LANE_W + LANE_W / 2`) aux valeurs par défaut du token
    /// (`RiverMetrics.Lane.widthReference` = 300, `gutter` = 28).
    func test_defaultTokenValues_matchNormativeMockup() {
        let layout = RiverColumnLayout(
            laneWidth: RiverMetrics.Lane.widthReference,
            gutter: RiverMetrics.Lane.gutter,
            laneCount: 2
        )
        XCTAssertEqual(layout.railX(0), 150)
        XCTAssertEqual(layout.railX(1), 450)
        XCTAssertEqual(layout.totalWidth, 600)
    }

    // MARK: - Cadrage d'un couloir : l'offset horizontal qui le centre (2026-08-22)

    /// Le pane défile sur deux axes, mais `scrollTo` n'en bouge qu'un (mesuré
    /// au simulateur : quelle que soit l'ancre, l'offset X restait la moitié
    /// du débordement — le contenu centré d'origine). L'axe des voix se pose
    /// donc par un OFFSET explicite : le rail du couloir au centre du pane,
    /// borné entre la rive et le bord.
    func test_horizontalOffset_putsTheLanesRail_atTheCenterOfThePane() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 6)
        XCTAssertEqual(layout.horizontalOffset(centeringLane: 3, paneWidth: 402), 1050 - 201)
        XCTAssertEqual(layout.horizontalOffset(centeringLane: 0, paneWidth: 402), 0, "le premier couloir ne va pas plus à gauche que la rive")
        XCTAssertEqual(layout.horizontalOffset(centeringLane: 5, paneWidth: 402), 1800 - 402, "le dernier couloir ne va pas plus à droite que le bord")
    }

    func test_horizontalOffset_isZero_whenEverythingFitsInThePane() {
        let layout = RiverColumnLayout(laneWidth: 300, gutter: 28, laneCount: 1)
        XCTAssertEqual(layout.horizontalOffset(centeringLane: 0, paneWidth: 402), 0)
    }
}
