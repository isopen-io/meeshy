import XCTest
@testable import MeeshyUI

/// #10093 — la bannière ou la photo ouverte en plein écran se referme d'un
/// glissement vers le bas : l'image suit le doigt, le fond s'éclaircit avec
/// elle, et le geste reste annulable tant qu'on ne l'a pas mené assez loin.
@MainActor
final class FullscreenDismissDragTests: XCTestCase {

    func test_backdropOpacity_atRest_isOpaque() {
        XCTAssertEqual(FullscreenDismissDrag.backdropOpacity(translation: 0), 1, accuracy: 0.001)
    }

    func test_backdropOpacity_followsTheFingerDownward() {
        let near = FullscreenDismissDrag.backdropOpacity(translation: 40)
        let far = FullscreenDismissDrag.backdropOpacity(translation: 160)

        XCTAssertLessThan(near, 1)
        XCTAssertLessThan(far, near)
        XCTAssertGreaterThanOrEqual(far, FullscreenDismissDrag.minimumBackdropOpacity)
    }

    func test_backdropOpacity_upwardDrag_staysOpaque() {
        XCTAssertEqual(FullscreenDismissDrag.backdropOpacity(translation: -120), 1, accuracy: 0.001)
    }

    func test_shouldDismiss_shortDragReleased_cancels() {
        XCTAssertFalse(FullscreenDismissDrag.shouldDismiss(translation: 40, predictedEnd: 60))
    }

    func test_shouldDismiss_dragBroughtBackBeforeRelease_cancels() {
        XCTAssertFalse(FullscreenDismissDrag.shouldDismiss(translation: 10, predictedEnd: 12))
    }

    func test_shouldDismiss_longDrag_closes() {
        XCTAssertTrue(FullscreenDismissDrag.shouldDismiss(translation: FullscreenDismissDrag.dismissDistance, predictedEnd: FullscreenDismissDrag.dismissDistance))
    }

    func test_shouldDismiss_quickFlickDownward_closes() {
        XCTAssertTrue(FullscreenDismissDrag.shouldDismiss(translation: 50, predictedEnd: 400))
    }

    func test_shouldDismiss_upwardFlick_neverCloses() {
        XCTAssertFalse(FullscreenDismissDrag.shouldDismiss(translation: -200, predictedEnd: -600))
    }
}
