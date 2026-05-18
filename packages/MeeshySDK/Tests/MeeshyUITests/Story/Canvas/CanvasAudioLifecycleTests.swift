import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// RC4.5 — the reader audio engine must stop deterministically when the app
/// resigns active or the canvas leaves the window, without waiting for the
/// non-deterministic ARC `deinit`. RC4.6 — the mixer registers with
/// `PlaybackCoordinator` so `stopAll()` reaches it.
@MainActor
final class CanvasAudioLifecycleTests: XCTestCase {

    /// Builds a `.play` canvas and drives `setReaderContext`, which funnels
    /// into `startAudioPlayback()`. With no resolvable audio the mixer is
    /// empty, but `play(...)` still flips `isPlaying` — enough to observe the
    /// transport lifecycle.
    private func makePlayingCanvas() -> StoryCanvasUIView {
        let slide = StorySlide(id: "slide-\(UUID().uuidString)", effects: StoryEffects())
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.setReaderContext(StoryReaderContext())
        return view
    }

    func test_setReaderContext_play_startsMixerTransport() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying,
                      "Entering the reader context must start the audio engine")
    }

    func test_handleWillResignActive_stopsMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)
        NotificationCenter.default.post(
            name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "Resigning active must stop the reader audio engine")
    }

    func test_willMoveToWindowNil_stopsMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)
        view.willMove(toWindow: nil)
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "Detaching the canvas from its window must stop the engine")
    }

    func test_setModeEdit_pausesMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)
        view.setMode(.edit)
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "Switching to .edit must pause the reader audio engine")
    }

    func test_playbackCoordinatorStopAll_reachesRegisteredMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)
        // The mixer is registered as an external player on init — stopAll()
        // can only reach it through that registration (RC4.6).
        PlaybackCoordinator.shared.stopAll()
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "stopAll() must reach the registered reader mixer")
    }
}
