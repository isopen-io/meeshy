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
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        view.setReaderContext(StoryReaderContext())
        // `startAudioPlayback()` est gated sur `contentReadyFired` (anti-flash,
        // ajouté après ces tests) : pour un slide solid-color/vide il fire au
        // PROCHAIN tick runloop (DispatchQueue.main.async). On pompe le runloop
        // jusqu'à ce que le gate s'ouvre, ce qui rejoue le `startAudioPlayback()`
        // différé et flippe `isPlaying` — exactement comme le reader réel démarre
        // l'audio une fois la slide visuellement prête.
        let deadline = Date(timeIntervalSinceNow: 2.0)
        while !view.contentReadyFired && Date() < deadline {
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.01))
        }
        return view
    }

    func test_setReaderContext_play_startsMixerTransport() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying,
                      "Entering the reader context must start the audio engine")
    }

    func test_handleDidEnterBackground_stopsMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)
        NotificationCenter.default.post(
            name: UIApplication.didEnterBackgroundNotification, object: nil)
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "Truly backgrounding the app must stop the reader audio engine")
    }

    /// Directive user 2026-07-14 : un simple peek Notification Center /
    /// Control Center (`willResignActiveNotification`, l'app reste `.inactive`
    /// sans jamais atteindre `.background`) ne doit JAMAIS couper la lecture —
    /// exactement comme une vidéo en PIP ou une app de musique qui continue en
    /// arrière-plan. Avant ce fix, le canvas écoutait `willResignActiveNotification`
    /// (fire aussi pour ce cas) et stoppait le mixer, qui redémarrait ensuite
    /// depuis 0 (pas de seek-resume) — bug rapporté par l'utilisateur.
    func test_willResignActiveNotification_doesNotStopMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)
        NotificationCenter.default.post(
            name: UIApplication.willResignActiveNotification, object: nil)
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying,
                      "A Notification Center / Control Center peek must not interrupt playback")
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

    /// RF3 (off-screen audio-leak fix). Once the host pauses the canvas — slide
    /// scrolled off-screen in PostDetail, or a call active — an async/context
    /// re-entry into the audio start funnel (`startAudioPlayback()`) must NOT
    /// resurrect the engine. Before the `!isPlaybackPaused` guard, a content-
    /// ready / reader-context re-entry restarted audio under an off-screen slide;
    /// the WS4 detail-repost path now runs `mute: false`, so this central gate —
    /// not the former `mute: true` backstop — is the only thing keeping it silent.
    func test_startAudioPlayback_whilePaused_reentryDoesNotRestartMixer() {
        let view = makePlayingCanvas()
        XCTAssertTrue(view._readerAudioMixerForTesting.isPlaying)

        view.setPaused(true)
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "Pausing (off-screen) must stop the reader audio engine")

        // A reader-context swap funnels back into startAudioPlayback() — exactly
        // the async re-entry that lands once the audio resolver resolves. While
        // paused it must stay a no-op: no sound under a frozen, off-screen slide.
        view.setReaderContext(StoryReaderContext())
        XCTAssertFalse(view._readerAudioMixerForTesting.isPlaying,
                       "A funnel re-entry while paused must not resurrect audio (off-screen leak)")
    }
}
