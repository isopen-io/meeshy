import XCTest
import UIKit
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Regression pins for the "background video must keep looping even with
/// foreground videos" contract (user 2026-06-23).
///
/// A **background** video/image fills the whole canvas, so the unified
/// timeline must NOT wait on a foreground video clip before activating the
/// looping background and starting the playhead. Before the fix,
/// `fireContentReadyIfNeeded()` gated `onContentReady` (and therefore the
/// background's `isPlaybackActive`) on `foregroundVideosReady()` for EVERY
/// slide — so a foreground clip whose `AVPlayerItem.status` was still
/// `.unknown` (slow / stalled network) held the background video frozen: it
/// never started and never looped.
@MainActor
final class StoryCanvasBackgroundLoopGatingTests: XCTestCase {

    private func videoMediaObject(id: String, isBackground: Bool) -> StoryMediaObject {
        StoryMediaObject(
            id: id,
            postMediaId: "",
            mediaURL: "https://cdn.example.test/\(id).mp4",
            kind: .video,
            aspectRatio: 9.0 / 16.0,
            isBackground: isBackground
        )
    }

    private func makeCanvasView(slide: StorySlide) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }

    /// Background VIDEO + foreground VIDEO that never resolves. Because the
    /// background is itself visual media (fills the canvas), the foreground
    /// gate is skipped and `onContentReady` fires as soon as the background is
    /// settled — the looping background is never held hostage by the foreground
    /// clip.
    func test_backgroundVideo_firesContentReady_evenWhenForegroundVideoNotReady() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            videoMediaObject(id: "bgvid", isBackground: true),
            videoMediaObject(id: "fgvid", isBackground: false)
        ]
        let slide = StorySlide(id: "slide-current", effects: effects, duration: 5)
        let view = makeCanvasView(slide: slide)

        var contentReadyFireCount = 0
        view.onContentReady = { contentReadyFireCount += 1 }

        // The background has not reported its first frame yet → no premature fire.
        XCTAssertEqual(contentReadyFireCount, 0,
                       "Content ready must not fire before the background is settled")

        // Drive the real gate with the background settled. The foreground video
        // item is still `.unknown` (no network in the unit host).
        let fired = view._markBackgroundReadyForTesting()

        XCTAssertTrue(fired,
                      "A background video must reach content-ready (and activate its loop) without waiting on a foreground video")
        XCTAssertEqual(contentReadyFireCount, 1,
                       "onContentReady must fire exactly once for the visual-media background")
    }

    /// Negative control : with a SOLID-COLOUR background the canvas IS empty
    /// until the foreground video lands, so the T6 gate still applies — the
    /// foreground video must still hold content-ready (until its own failsafe).
    func test_solidColorBackground_stillGatesOnForegroundVideo() {
        var effects = StoryEffects()
        effects.background = "#112233"
        effects.mediaObjects = [videoMediaObject(id: "fgvid", isBackground: false)]
        let slide = StorySlide(id: "slide-current", effects: effects, duration: 5)
        let view = makeCanvasView(slide: slide)

        var contentReadyFireCount = 0
        view.onContentReady = { contentReadyFireCount += 1 }

        let fired = view._markBackgroundReadyForTesting()

        XCTAssertFalse(fired,
                       "A colour background must still wait on the foreground video (no canvas content otherwise)")
        XCTAssertEqual(contentReadyFireCount, 0,
                       "onContentReady must stay held while the colour-bg foreground video is not ready")
    }

    /// Failsafe : even the gated colour-background case must NOT hang forever.
    /// A foreground clip stuck on `.unknown` is released by the readiness
    /// failsafe so the slide can never freeze indefinitely.
    func test_solidColorBackground_foregroundFailsafe_releasesEventually() {
        var effects = StoryEffects()
        effects.background = "#112233"
        effects.mediaObjects = [videoMediaObject(id: "fgvid", isBackground: false)]
        let slide = StorySlide(id: "slide-current", effects: effects, duration: 5)
        let view = makeCanvasView(slide: slide)

        let ready = expectation(description: "content ready via foreground failsafe")
        view.onContentReady = { ready.fulfill() }

        // Held now (foreground not ready) — the 2 s failsafe must release it.
        XCTAssertFalse(view._markBackgroundReadyForTesting())
        wait(for: [ready], timeout: 4.0)
    }
}
