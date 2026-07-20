import XCTest
import SwiftUI
@testable import MeeshyUI

/// Barre de trim tactile de l'inspecteur clip (capture user 2026-07-20 :
/// steppers « 0:0… » tronqués et minuscules — « définir début/durée du bout du
/// doigt »). Géométrie pure, testée sans monter la vue.
final class ClipTimingBarTests: XCTestCase {

    // MARK: - Conversion translation ↔ secondes

    func test_secondsForTranslation_isProportional() {
        let s = ClipTimingBar.seconds(forTranslation: 50, trackWidth: 100, slideDuration: 10)
        XCTAssertEqual(s, 5, accuracy: 0.001)
    }

    func test_secondsForTranslation_zeroWidth_returnsZero() {
        XCTAssertEqual(ClipTimingBar.seconds(forTranslation: 50, trackWidth: 0, slideDuration: 10), 0)
    }

    func test_xForTime_roundTripsWithSeconds() {
        let x = ClipTimingBar.x(forTime: 2.5, trackWidth: 200, slideDuration: 10)
        XCTAssertEqual(x, 50, accuracy: 0.001)
        let s = ClipTimingBar.seconds(forTranslation: x, trackWidth: 200, slideDuration: 10)
        XCTAssertEqual(s, 2.5, accuracy: 0.001)
    }

    func test_xForTime_zeroSlideDuration_returnsZero() {
        XCTAssertEqual(ClipTimingBar.x(forTime: 3, trackWidth: 200, slideDuration: 0), 0)
    }

    // MARK: - Fenêtre prévisualisée pendant le drag (clamps)

    func test_previewWindow_move_preservesDurationAndClampsToTrack() {
        let left = ClipTimingBar.previewWindow(
            field: .move, start: 1, duration: 2, deltaSeconds: -5, slideDuration: 10)
        XCTAssertEqual(left.start, 0, accuracy: 0.001)
        XCTAssertEqual(left.duration, 2, accuracy: 0.001)

        let right = ClipTimingBar.previewWindow(
            field: .move, start: 1, duration: 2, deltaSeconds: 100, slideDuration: 10)
        XCTAssertEqual(right.start, 8, accuracy: 0.001)
        XCTAssertEqual(right.duration, 2, accuracy: 0.001)
    }

    func test_previewWindow_trimStart_keepsEndFixed() {
        let trimmed = ClipTimingBar.previewWindow(
            field: .trimStart, start: 1, duration: 2, deltaSeconds: 0.5, slideDuration: 10)
        XCTAssertEqual(trimmed.start, 1.5, accuracy: 0.001)
        XCTAssertEqual(trimmed.start + trimmed.duration, 3, accuracy: 0.001)
    }

    func test_previewWindow_trimStart_enforcesMinDuration() {
        let collapsed = ClipTimingBar.previewWindow(
            field: .trimStart, start: 1, duration: 2, deltaSeconds: 10, slideDuration: 10)
        XCTAssertEqual(collapsed.start + collapsed.duration, 3, accuracy: 0.001)
        XCTAssertEqual(collapsed.duration, ClipTimingBar.minimumDuration, accuracy: 0.001)
    }

    func test_previewWindow_trimEnd_keepsStartAndClampsToSlide() {
        let extended = ClipTimingBar.previewWindow(
            field: .trimEnd, start: 1, duration: 2, deltaSeconds: 100, slideDuration: 10)
        XCTAssertEqual(extended.start, 1, accuracy: 0.001)
        XCTAssertEqual(extended.duration, 9, accuracy: 0.001)

        let collapsed = ClipTimingBar.previewWindow(
            field: .trimEnd, start: 1, duration: 2, deltaSeconds: -10, slideDuration: 10)
        XCTAssertEqual(collapsed.start, 1, accuracy: 0.001)
        XCTAssertEqual(collapsed.duration, ClipTimingBar.minimumDuration, accuracy: 0.001)
    }

    func test_previewWindow_move_clipLongerThanSlide_pinsToZero() {
        let window = ClipTimingBar.previewWindow(
            field: .move, start: 0, duration: 12, deltaSeconds: 3, slideDuration: 10)
        XCTAssertEqual(window.start, 0, accuracy: 0.001)
        XCTAssertEqual(window.duration, 12, accuracy: 0.001)
    }
}
