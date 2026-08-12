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

    func test_previewWindow_move_preservesDuration_andNeverGoesNegative() {
        let left = ClipTimingBar.previewWindow(
            field: .move, start: 1, duration: 2, deltaSeconds: -5)
        XCTAssertEqual(left.start, 0, accuracy: 0.001)
        XCTAssertEqual(left.duration, 2, accuracy: 0.001)
    }

    func test_previewWindow_trimStart_keepsEndFixed() {
        let trimmed = ClipTimingBar.previewWindow(
            field: .trimStart, start: 1, duration: 2, deltaSeconds: 0.5)
        XCTAssertEqual(trimmed.start, 1.5, accuracy: 0.001)
        XCTAssertEqual(trimmed.start + trimmed.duration, 3, accuracy: 0.001)
    }

    func test_previewWindow_trimStart_enforcesMinDuration() {
        let collapsed = ClipTimingBar.previewWindow(
            field: .trimStart, start: 1, duration: 2, deltaSeconds: 10)
        XCTAssertEqual(collapsed.start + collapsed.duration, 3, accuracy: 0.001)
        XCTAssertEqual(collapsed.duration, ClipTimingBar.minimumDuration, accuracy: 0.001)
    }

    func test_previewWindow_trimEnd_keepsStart_andCollapsesNoFurtherThanMinimum() {
        let collapsed = ClipTimingBar.previewWindow(
            field: .trimEnd, start: 1, duration: 2, deltaSeconds: -10)
        XCTAssertEqual(collapsed.start, 1, accuracy: 0.001)
        XCTAssertEqual(collapsed.duration, ClipTimingBar.minimumDuration, accuracy: 0.001)
    }

    /// Ce test assertait l'inverse : la fin était clampée à la durée de slide,
    /// donc un clip finissant en fin de slide ne pouvait plus grandir — et la
    /// slide dérivant du contenu, plus rien ne pouvait l'allonger. C'est le
    /// clip qui étend la slide, jamais elle qui le contraint.
    func test_previewWindow_trimEnd_growsBeyondTheSlide() {
        let extended = ClipTimingBar.previewWindow(
            field: .trimEnd, start: 1, duration: 2, deltaSeconds: 100)
        XCTAssertEqual(extended.start, 1, accuracy: 0.001)
        XCTAssertEqual(extended.duration, 102, accuracy: 0.001)
    }

    /// La barre et les steppers doivent produire le MÊME état : c'est tout
    /// l'objet du résolveur partagé.
    func test_previewWindow_trimEnd_matchesResolver() {
        let preview = ClipTimingBar.previewWindow(field: .trimEnd, start: 2, duration: 3,
                                                  deltaSeconds: 40)
        let resolved = ClipWindowResolver.resolve(
            .setEnd(45), from: ClipWindowResolver.Window(start: 2, duration: 3))
        XCTAssertEqual(preview.start, resolved.start, accuracy: 0.001)
        XCTAssertEqual(preview.duration, resolved.duration, accuracy: 0.001)
    }

    // MARK: - Échelle affichée

    /// Sans réserve à droite, la poignée droite d'un clip occupant toute la
    /// slide est déjà collée au bord de la piste : le geste n'a aucune course,
    /// et retirer le clamp ne changeait rien.
    func test_displayTotal_reservesRoomBeyondTheSlide() {
        let total = ClipTimingBar.displayTotal(slideDuration: 10, start: 0, duration: 10)
        XCTAssertGreaterThan(total, 10)
    }

    func test_displayTotal_marginIsAtLeastOneSecond() {
        let total = ClipTimingBar.displayTotal(slideDuration: 2, start: 0, duration: 2)
        XCTAssertGreaterThanOrEqual(total, 3)
    }

    func test_displayTotal_coversAClipOverflowingTheSlide() {
        let total = ClipTimingBar.displayTotal(slideDuration: 6, start: 4, duration: 20)
        XCTAssertGreaterThan(total, 24, "Un clip qui déborde reste entièrement visible.")
    }
}
