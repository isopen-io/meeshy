import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #8725 — un appel gèle le canvas d'une story ; sa fin le relance, sauf si
/// l'utilisateur l'avait lui-même mis en pause. Les deux causes sont distinctes :
/// la fin de l'une ne lève jamais l'autre.
@MainActor
final class StoryCanvasInterruptionTests: XCTestCase {

    private func makePlayingCanvas() -> StoryCanvasUIView {
        let slide = StorySlide(id: "slide-\(UUID().uuidString)", effects: StoryEffects())
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }

    func test_interruption_pausesThePlayback() {
        let canvas = makePlayingCanvas()

        canvas.setPlaybackInterrupted(true)

        XCTAssertTrue(canvas.isPlaybackPaused)
    }

    func test_interruptionEnd_resumesThePlayback() {
        let canvas = makePlayingCanvas()
        canvas.setPlaybackInterrupted(true)

        canvas.setPlaybackInterrupted(false)

        XCTAssertFalse(canvas.isPlaybackPaused)
    }

    func test_interruptionEnd_keepsAUserPause() {
        let canvas = makePlayingCanvas()
        canvas.setPaused(true)
        canvas.setPlaybackInterrupted(true)

        canvas.setPlaybackInterrupted(false)

        XCTAssertTrue(canvas.isPlaybackPaused, "La fin de l'appel ne relance pas une story mise en pause par l'utilisateur.")
    }

    func test_userResumeDuringInterruption_staysFrozenUntilTheCallEnds() {
        let canvas = makePlayingCanvas()
        canvas.setPaused(true)
        canvas.setPlaybackInterrupted(true)

        canvas.setPaused(false)

        XCTAssertTrue(canvas.isPlaybackPaused, "Le viewer ne relance pas le canvas sous la vue d'appel.")
    }
}
