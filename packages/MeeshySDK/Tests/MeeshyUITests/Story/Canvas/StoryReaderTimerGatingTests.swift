import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Behaviour pins for `StoryReaderTimerController` + `StoryCanvasUIView.onContentReady`.
///
/// User contract :
/// - The slide-duration timer NEVER starts before the reader's canvas
///   reports `onContentReady`. If we let the timer run while the
///   background image is still downloading the user sees a 2 s blur
///   placeholder followed by 1 s of real content — they miss the
///   story.
/// - Readiness signals from off-screen prefetched canvases (`N-1`,
///   `N+1`) MUST be ignored — only the slide the user is currently
///   watching may start its countdown.
/// - On slide switch the timer resets back to 0 and re-enters
///   `pending` until the NEW current slide reports ready.
/// - The ThumbHash placeholder MUST already be visible on the
///   background layer while the real bytes are still loading — the
///   user never stares at a black rectangle.
@MainActor
final class StoryReaderTimerGatingTests: XCTestCase {

    // MARK: - Fixtures

    /// Generates a real Wolt-format ThumbHash from a tiny solid-color
    /// UIImage so the placeholder decode path actually returns a
    /// non-nil `UIImage`. Crafting a synthetic base64 string by hand
    /// is fragile — the Wolt decoder validates the byte layout and
    /// returns nil on malformed input, which would silently break
    /// the ThumbHash placeholder assertion.
    private func generateValidThumbHash() -> String {
        let size = CGSize(width: 16, height: 16)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            UIColor.systemPink.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        return image.toThumbHash() ?? ""
    }

    private func makeMediaBackgroundSlide(thumbHash: String) -> StorySlide {
        var effects = StoryEffects()
        effects.thumbHash = thumbHash
        effects.mediaObjects = [
            StoryMediaObject(
                id: "bg",
                postMediaId: "post-bg-123",
                mediaURL: "https://cdn.example.test/bg.jpg",
                kind: .image,
                aspectRatio: 9.0 / 16.0,
                isBackground: true
            )
        ]
        return StorySlide(id: "slide-current",
                          effects: effects,
                          duration: 5)
    }

    private func makeSolidColorSlide(id: String = "slide-current") -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StorySlide(id: id, effects: effects, duration: 5)
    }

    private func makeCanvasView(slide: StorySlide) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }

    // MARK: - test_timer_doesNotStartBeforeContentReady

    /// Pending state contract : after `setCurrentSlide(...)` the timer
    /// must stay at `progress == 0` regardless of how much wall time
    /// passes. Without this gate the user would see the slide blow
    /// past before the real content has rendered.
    func test_timer_doesNotStartBeforeContentReady() {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.setCurrentSlide(id: "slide-current", duration: 5)

        // Simulate two seconds of wall time elapsing in pending state.
        timer._advanceClockForTesting(by: 1.0)
        timer._advanceClockForTesting(by: 1.0)

        XCTAssertFalse(timer.isActive,
                       "Timer must remain pending until markContentReady is called")
        XCTAssertEqual(timer.progress, 0,
                       "Progress must stay at 0 while pending — saw \(timer.progress)")
    }

    // MARK: - test_timer_startsImmediately_afterContentReady

    /// Active-state contract : `markContentReady` flips the gate and
    /// `_advanceClockForTesting(by:)` starts moving progress forward.
    /// The very first delta after readiness must be reflected in
    /// `progress` (no initial drop-frame).
    func test_timer_startsImmediately_afterContentReady() {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.setCurrentSlide(id: "slide-current", duration: 5)
        timer.markContentReady(slideId: "slide-current")

        XCTAssertTrue(timer.isActive)
        XCTAssertEqual(timer.progress, 0, accuracy: 1e-9,
                       "Progress starts at 0 even after markContentReady")

        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(timer.progress, 0.2, accuracy: 1e-6,
                       "1 s / 5 s slide duration must yield progress = 0.2")

        timer._advanceClockForTesting(by: 1.5)
        XCTAssertEqual(timer.progress, 0.5, accuracy: 1e-6,
                       "Cumulative 2.5 s / 5 s slide must yield progress = 0.5")
    }

    // MARK: - test_timer_resetsToZero_onSlideSwitch

    /// Slide-switch contract : when the user advances to the next
    /// slide the timer must reset to 0 and re-enter `pending`. Any
    /// progress accumulated for the previous slide must be discarded
    /// so the new slide gets its full duration starting from the
    /// moment ITS canvas reports ready.
    func test_timer_resetsToZero_onSlideSwitch() {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.setCurrentSlide(id: "slide-A", duration: 5)
        timer.markContentReady(slideId: "slide-A")
        timer._advanceClockForTesting(by: 2.0)
        XCTAssertGreaterThan(timer.progress, 0,
                             "Sanity : timer is running before the switch")

        // User swipes to next slide.
        timer.setCurrentSlide(id: "slide-B", duration: 5)

        XCTAssertEqual(timer.currentSlideId, "slide-B")
        XCTAssertEqual(timer.progress, 0,
                       "Slide switch must reset progress to 0")
        XCTAssertFalse(timer.isActive,
                       "Slide switch must put the timer back in pending")

        // Advancing the clock while pending for B must not move progress.
        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(timer.progress, 0,
                       "Timer must stay pending for B until B is ready")
    }

    // MARK: - test_timer_doesNotStartOnPreviousSlideContentReady

    /// Cross-slide isolation contract : the prefetcher pre-bootstraps
    /// `[N-1, N, N+1]` canvases off-screen. Each one can fire its
    /// `onContentReady` callback when its background finishes loading
    /// — independently of which slide the user is currently watching.
    /// The timer MUST ignore readiness signals for any slide id
    /// other than `currentSlideId`, otherwise the user could see the
    /// countdown spike to 1.0 the moment a neighbour finishes
    /// pre-loading.
    func test_timer_doesNotStartOnPreviousSlideContentReady() {
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.setCurrentSlide(id: "slide-current", duration: 5)

        // The prefetcher's N-1 canvas finishes loading first — its
        // onContentReady fires with id="slide-previous". Timer should
        // ignore it entirely.
        timer.markContentReady(slideId: "slide-previous")

        XCTAssertFalse(timer.isActive,
                       "Readiness for a NON-current slide must not start the timer")
        XCTAssertEqual(timer.progress, 0)

        // The N+1 neighbour also fires while the user is still on
        // `slide-current` — still ignored.
        timer.markContentReady(slideId: "slide-next")
        XCTAssertFalse(timer.isActive)

        // Now the current slide's canvas catches up.
        timer.markContentReady(slideId: "slide-current")
        XCTAssertTrue(timer.isActive,
                      "Readiness for the CURRENT slide finally starts the timer")

        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(timer.progress, 0.2, accuracy: 1e-6)
    }

    // MARK: - test_thumbHash_displayedDuringLoad

    /// Placeholder contract : while the background image is still
    /// downloading, `backgroundLayer.contentLayer.contents` MUST
    /// already be populated with the decoded ThumbHash bitmap so
    /// the user never sees a black rectangle. This is the P1-#11
    /// invariant; the gating test pins it so a regression in
    /// `StoryBackgroundLayer.configure` cannot ship.
    ///
    /// We construct the slide with a real Wolt-format ThumbHash
    /// (encoded from a tiny solid-color UIImage at runtime) and do
    /// NOT attach an `imageCache` / `resolver` to the
    /// `StoryReaderContext` — so `StoryBackgroundLayer.configure`'s
    /// async fetch branch is skipped entirely and the ThumbHash
    /// placeholder remains the only thing on screen.
    func test_thumbHash_displayedDuringLoad() throws {
        let thumbHash = generateValidThumbHash()
        try XCTSkipIf(thumbHash.isEmpty,
                      "ThumbHash encoder unavailable in this sim — skip placeholder pin")
        let slide = makeMediaBackgroundSlide(thumbHash: thumbHash)
        let view = makeCanvasView(slide: slide)

        // `view.layer.sublayers.first` is `rootLayer`. The background
        // layer is inserted at z=0 inside it. We walk the public
        // CALayer hierarchy because `StoryBackgroundLayer` is read-only
        // for this fix.
        XCTAssertNotNil(view.layer.sublayers,
                        "rootLayer must be attached to the view")
        let rootLayer = view.layer.sublayers?.first
        let backgroundLayer = rootLayer?.sublayers?.first(where: { $0 is StoryBackgroundLayer }) as? StoryBackgroundLayer
        XCTAssertNotNil(backgroundLayer,
                        "StoryBackgroundLayer must be inserted in rootLayer at z=0")

        // Synchronous ThumbHash placeholder is set in
        // StoryBackgroundLayer.configure() before any async fetch.
        XCTAssertNotNil(backgroundLayer?.contentLayer?.contents,
                        "ThumbHash placeholder MUST be assigned to contentLayer.contents synchronously while the real bytes are still loading")
    }

    // MARK: - test_timer_completionFires_atProgressOne

    /// Belt-and-braces completion check : reaching `progress == 1`
    /// must fire `onCompletion` exactly once and the timer must
    /// pin to `1.0` instead of overshooting.
    func test_timer_completionFires_atProgressOne() {
        var completionCount = 0
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.onCompletion = { completionCount += 1 }
        timer.setCurrentSlide(id: "slide-current", duration: 2)
        timer.markContentReady(slideId: "slide-current")

        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(completionCount, 0)
        timer._advanceClockForTesting(by: 2.0)
        XCTAssertEqual(timer.progress, 1.0, accuracy: 1e-9,
                       "Progress must clamp to 1.0 (no overshoot)")
        XCTAssertEqual(completionCount, 1,
                       "onCompletion fires exactly once when progress reaches 1")

        // Further ticks must not fire completion again.
        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(completionCount, 1)
    }

    // MARK: - test_canvasOnContentReady_solidColor_firesOnce

    /// Bridges the canvas-side signal to the timer-side gate :
    /// for a solid-color slide (no async media load) the canvas
    /// MUST still post `onContentReady` exactly once, on the next
    /// runloop tick after `rebuildLayers()`. This is what lets the
    /// prefetcher wire `canvas.onContentReady = { timer.markContentReady(...) }`
    /// without a per-kind fork.
    func test_canvasOnContentReady_solidColor_firesOnce() {
        let slide = makeSolidColorSlide(id: "solid-A")
        let view = makeCanvasView(slide: slide)

        let firstFire = expectation(description: "onContentReady fired")
        var fireCount = 0
        view.onContentReady = {
            fireCount += 1
            if fireCount == 1 { firstFire.fulfill() }
        }

        // Force the readiness signal (synchronous test seam) — the
        // production path lands on the same callback via
        // `scheduleContentReadyEvaluation(for: .solidColor)`'s async
        // hop, but we don't need to spin the runloop here because
        // the seam already guards against double-firing.
        view._forceContentReadyForTesting()
        wait(for: [firstFire], timeout: 1.0)
        XCTAssertEqual(fireCount, 1,
                       "onContentReady must fire exactly once for a solid-color slide")

        // A second forced call within the same rebuild cycle MUST
        // be a no-op — the contract is "fire once per slide".
        view._forceContentReadyForTesting()
        XCTAssertEqual(fireCount, 1,
                       "Subsequent ready signals in the same cycle must not re-fire")
    }

    // MARK: - test_canvas_to_timer_integration_solidColor

    /// End-to-end gating contract : wire the canvas's
    /// `onContentReady` into the timer's `markContentReady` exactly
    /// the way the reader's prefetcher will do it. Until the canvas
    /// signals ready, the timer must NOT advance — even if the
    /// reader's render loop is ticking the clock.
    func test_canvas_to_timer_integration_solidColor() {
        let slide = makeSolidColorSlide(id: "slide-current")
        let view = makeCanvasView(slide: slide)
        let timer = StoryReaderTimerController(useDisplayLink: false)
        timer.setCurrentSlide(id: "slide-current", duration: 5)
        view.onContentReady = { [weak timer] in
            timer?.markContentReady(slideId: "slide-current")
        }

        // Before ready : timer is pending.
        XCTAssertFalse(timer.isActive)
        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(timer.progress, 0)

        // Canvas signals ready (using the test seam to avoid the
        // runloop hop). The wiring above flips the timer active.
        view._forceContentReadyForTesting()

        XCTAssertTrue(timer.isActive,
                      "Canvas onContentReady must drive the timer into active state")
        timer._advanceClockForTesting(by: 1.0)
        XCTAssertEqual(timer.progress, 0.2, accuracy: 1e-6)
    }
}
