import XCTest
import CoreGraphics
import UIKit
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

    // MARK: - displacement(speed:elapsed:) — le pas suit le temps RÉEL (#9883)

    func test_displacement_isTheSpeedTimesTheElapsedTime() {
        XCTAssertEqual(ChipAutoScroll.displacement(speed: 600, elapsed: 1.0 / 120.0), 5, accuracy: 1e-6)
        XCTAssertEqual(ChipAutoScroll.displacement(speed: -600, elapsed: 1.0 / 60.0), -10, accuracy: 1e-6)
    }

    func test_displacement_atZeroSpeed_isZero() {
        XCTAssertEqual(ChipAutoScroll.displacement(speed: 0, elapsed: 0.016), 0)
    }

    func test_displacement_afterAHitch_isBoundedSoTheListDoesNotJump() {
        let bounded = ChipAutoScroll.displacement(speed: 900, elapsed: 5)
        XCTAssertEqual(bounded, 900 * ChipAutoScroll.maxStep, accuracy: 1e-6)
    }

    func test_displacement_negativeElapsed_isZero() {
        XCTAssertEqual(ChipAutoScroll.displacement(speed: 900, elapsed: -1), 0)
    }

    func test_shouldRun_onlyWhileTheFingerIsInAnEdgeZone() {
        XCTAssertFalse(ChipAutoScroll.shouldRun(speed: 0))
        XCTAssertTrue(ChipAutoScroll.shouldRun(speed: -120))
        XCTAssertTrue(ChipAutoScroll.shouldRun(speed: 120))
    }

    // MARK: - ChipAutoScrollDriver — le drop redevient légitime dès la sortie de zone (#9883)

    private func makeScrollableList() -> UIScrollView {
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 390, height: 900))
        scroll.contentSize = CGSize(width: 390, height: 5000)
        return scroll
    }

    func test_driver_fingerInBottomZone_scrollsTheList() {
        let driver = ChipAutoScrollDriver()
        let scroll = makeScrollableList()
        driver.scrollView = scroll
        driver.update(fingerLocation: CGPoint(x: 100, y: 890))
        driver.advance(elapsed: 1.0 / 60.0)
        XCTAssertTrue(driver.isActivelyScrolling)
        XCTAssertGreaterThan(scroll.contentOffset.y, 0)
        driver.stop()
    }

    func test_driver_fingerLeavesTheEdgeZone_theDropIsNoLongerHeldAsAutoScrolling() {
        let driver = ChipAutoScrollDriver()
        let scroll = makeScrollableList()
        driver.scrollView = scroll
        driver.update(fingerLocation: CGPoint(x: 100, y: 890))
        driver.advance(elapsed: 1.0 / 60.0)
        XCTAssertTrue(driver.isActivelyScrolling)

        // L'horloge s'endort à la sortie de zone : aucun tic ne viendra plus
        // remettre le drapeau à zéro. S'il restait levé, le drop sur la section
        // visée serait rendu inerte (`ChipDropResolver.action(isAutoScrolling:)`).
        driver.update(fingerLocation: CGPoint(x: 100, y: 450))
        XCTAssertFalse(driver.isActivelyScrolling)
        withExtendedLifetime(scroll) { driver.stop() }
    }

    func test_driver_atZeroSpeed_theStepAsksTheClockToSleep() {
        let driver = ChipAutoScrollDriver()
        driver.scrollView = makeScrollableList()
        driver.update(fingerLocation: CGPoint(x: 100, y: 450))
        XCTAssertFalse(driver.advance(elapsed: 1.0 / 60.0))
        driver.stop()
    }
}
