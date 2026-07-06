import XCTest
import CoreGraphics
@testable import Meeshy

/// Phase 3 du morph drag-n-drop de la liste de conversations : pendant que la
/// chip est verrouillée sous le doigt (`chipModeLatched`), approcher un bord
/// du viewport auto-scrolle la liste pour rendre atteignables les headers de
/// section hors écran. Ces tests couvrent la loi de vitesse (zones de bord,
/// rampe linéaire, plafond) et le clamp de l'offset aux bornes du contenu.
@MainActor
final class ConversationChipAutoScrollTests: XCTestCase {

    // MARK: - speed(fingerY:viewportMinY:viewportMaxY:)

    func test_speed_fingerInMiddle_isZero() {
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: 450, viewportMinY: 0, viewportMaxY: 900),
            0
        )
    }

    func test_speed_fingerJustOutsideZones_isZero() {
        XCTAssertEqual(
            ChipAutoScroll.speed(
                fingerY: ChipAutoScroll.zoneHeight, viewportMinY: 0, viewportMaxY: 900),
            0
        )
        XCTAssertEqual(
            ChipAutoScroll.speed(
                fingerY: 900 - ChipAutoScroll.zoneHeight, viewportMinY: 0, viewportMaxY: 900),
            0
        )
    }

    func test_speed_fingerAtTopEdge_isFullSpeedUpward() {
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: 0, viewportMinY: 0, viewportMaxY: 900),
            -ChipAutoScroll.maxSpeed
        )
    }

    func test_speed_fingerAtBottomEdge_isFullSpeedDownward() {
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: 900, viewportMinY: 0, viewportMaxY: 900),
            ChipAutoScroll.maxSpeed
        )
    }

    func test_speed_halfDepthIntoTopZone_isHalfSpeed() {
        let half = ChipAutoScroll.zoneHeight / 2
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: half, viewportMinY: 0, viewportMaxY: 900),
            -ChipAutoScroll.maxSpeed / 2,
            accuracy: 0.001
        )
    }

    func test_speed_fingerBeyondViewportBounds_clampsToMaxSpeed() {
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: -80, viewportMinY: 0, viewportMaxY: 900),
            -ChipAutoScroll.maxSpeed
        )
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: 980, viewportMinY: 0, viewportMaxY: 900),
            ChipAutoScroll.maxSpeed
        )
    }

    func test_speed_respectsViewportOrigin_iPadColumn() {
        // Viewport décalé (colonne iPad / safe area) : les zones suivent les
        // bords RÉELS du viewport, pas ceux de l'écran.
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: 200, viewportMinY: 200, viewportMaxY: 1100),
            -ChipAutoScroll.maxSpeed
        )
        XCTAssertEqual(
            ChipAutoScroll.speed(fingerY: 650, viewportMinY: 200, viewportMaxY: 1100),
            0
        )
    }

    // MARK: - clampedOffset

    func test_clampedOffset_withinBounds_passesThrough() {
        XCTAssertEqual(
            ChipAutoScroll.clampedOffset(
                300, contentHeight: 2000, viewportHeight: 900, topInset: 0, bottomInset: 0),
            300
        )
    }

    func test_clampedOffset_belowTop_clampsToNegativeTopInset() {
        XCTAssertEqual(
            ChipAutoScroll.clampedOffset(
                -500, contentHeight: 2000, viewportHeight: 900, topInset: 120, bottomInset: 0),
            -120
        )
    }

    func test_clampedOffset_pastBottom_clampsToContentEnd() {
        XCTAssertEqual(
            ChipAutoScroll.clampedOffset(
                5000, contentHeight: 2000, viewportHeight: 900, topInset: 0, bottomInset: 40),
            2000 + 40 - 900
        )
    }

    func test_clampedOffset_contentShorterThanViewport_staysAtTop() {
        XCTAssertEqual(
            ChipAutoScroll.clampedOffset(
                250, contentHeight: 500, viewportHeight: 900, topInset: 60, bottomInset: 0),
            -60
        )
    }
}
