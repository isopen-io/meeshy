import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Issue #3906 — MeeshyComposer kept its `editDisplayLink` (and the ambient
/// edit-mode video/audio preview loop it drives) running at full rate for
/// the entire editing session, even with zero interaction, heating the
/// device after a few minutes. These tests wire `EditClockThrottle`'s pure
/// decision into `StoryCanvasUIView` and verify every interaction entry
/// point wakes it back up immediately.
///
/// The canvas is never attached to a real `UIWindow` here (matching the
/// established pattern in `CanvasEditMuteLivePropagationTests`), so
/// `editDisplayLink` is armed explicitly via `startEditDisplayLinkIfNeeded()`
/// and driven with `_driveEditClockForTesting(now:)` instead of a live
/// `CADisplayLink` tick.
@MainActor
final class StoryCanvasEditClockThrottleTests: XCTestCase {

    private static func makeSlide(id: String = "s1") -> StorySlide {
        StorySlide(id: id, content: "")
    }

    private static func makeCanvas() -> StoryCanvasUIView {
        let canvas = StoryCanvasUIView(slide: makeSlide(), mode: .edit)
        canvas.frame = CGRect(origin: .zero, size: CGSize(width: 390, height: 844))
        canvas.startEditDisplayLinkIfNeeded()
        return canvas
    }

    // MARK: - Arming

    func test_armingTheLink_startsUnthrottledAndUnpaused() {
        let canvas = Self.makeCanvas()
        XCTAssertFalse(canvas.isEditClockThrottled)
        XCTAssertEqual(canvas.editDisplayLink?.isPaused, false)
    }

    // MARK: - Idling down

    func test_idleWellPastTheDelay_throttlesAndPausesTheLink() {
        let canvas = Self.makeCanvas()
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)
        XCTAssertTrue(canvas.isEditClockThrottled)
        XCTAssertEqual(canvas.editDisplayLink?.isPaused, true,
                       "an idled-down clock must actually stop ticking — that's the power saving")
    }

    func test_stillWithinTheGraceWindow_staysFullAndUnpaused() {
        let canvas = Self.makeCanvas()
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay - 1)
        XCTAssertFalse(canvas.isEditClockThrottled)
        XCTAssertEqual(canvas.editDisplayLink?.isPaused, false)
    }

    /// Contre-épreuve : a timeline preview genuinely playing must never idle
    /// down no matter how long it has run — active playback counts as
    /// activity (`EditClockThrottle`'s override), even though no gesture or
    /// keystroke intervened in between.
    func test_activelyPlayingTimelinePreview_neverIdlesDownEvenPastTheDelay() {
        let canvas = Self.makeCanvas()
        canvas.timelinePreviewSeconds = 1.0
        canvas.timelinePreviewPlaying = true

        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 60)

        XCTAssertFalse(canvas.isEditClockThrottled, "a playing preview transport must never freeze mid-frame")
        XCTAssertEqual(canvas.editDisplayLink?.isPaused, false)
    }

    // MARK: - Waking up — every interaction entry point

    func test_gestureAttempt_wakesTheIdledClockImmediately() {
        let canvas = Self.makeCanvas()
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)
        XCTAssertTrue(canvas.isEditClockThrottled)

        // `setupGesturesAll()` sets `canvas` as the delegate of every
        // recognizer it attaches — this is the single choke point they all
        // funnel through before beginning.
        _ = canvas.gestureRecognizerShouldBegin(UIPanGestureRecognizer())

        XCTAssertFalse(canvas.isEditClockThrottled, "a gesture must wake the clock with no delay")
        XCTAssertEqual(canvas.editDisplayLink?.isPaused, false)
    }

    func test_typingAKeystroke_wakesTheIdledClockImmediately() {
        let canvas = Self.makeCanvas()
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)
        XCTAssertTrue(canvas.isEditClockThrottled)

        canvas.textViewDidChange(UITextView())

        XCTAssertFalse(canvas.isEditClockThrottled)
        XCTAssertEqual(canvas.editDisplayLink?.isPaused, false)
    }

    func test_scrubbingTheTimeline_wakesTheIdledClockImmediately() {
        let canvas = Self.makeCanvas()
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)
        XCTAssertTrue(canvas.isEditClockThrottled)

        canvas.setTimelinePreview(seconds: 0.5)

        XCTAssertFalse(canvas.isEditClockThrottled)
    }

    func test_pressingTimelinePlay_wakesTheIdledClockImmediately() {
        let canvas = Self.makeCanvas()
        canvas.setTimelinePreview(seconds: 0.5) // enters preview, resets the clock
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)
        XCTAssertTrue(canvas.isEditClockThrottled, "scrub-paused preview left untouched must still idle down")

        canvas.setTimelinePreviewPlaying(true)

        XCTAssertFalse(canvas.isEditClockThrottled)
    }

    /// A real content mutation — the same choke point every composer control
    /// (color/font/filter panels, sticker add/remove, background transform
    /// chips) and every inline text edit eventually go through — must also
    /// count as activity, without any dedicated per-control wiring.
    func test_slideMutationWhileEditing_wakesTheIdledClockImmediately() {
        let canvas = Self.makeCanvas()
        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)
        XCTAssertTrue(canvas.isEditClockThrottled)

        canvas.slide = Self.makeSlide(id: "s1") // same id, still a real re-assignment

        XCTAssertFalse(canvas.isEditClockThrottled)
    }

    // MARK: - Suspending / resuming the ambient preview loop (no feature removed)

    func test_idlingDown_suspendsTheBackgroundVideoLoop_andResumingRestoresIt() {
        let canvas = Self.makeCanvas()
        canvas.playsVideoInEditMode = true
        XCTAssertTrue(canvas.backgroundLayer.isPlaybackActive,
                     "sanity: enabling the composer preview loop starts it")

        canvas._driveEditClockForTesting(now: CACurrentMediaTime() + EditClockThrottle.defaultIdleDelay + 5)

        XCTAssertFalse(canvas.backgroundLayer.isPlaybackActive,
                       "idling down must SUSPEND the loop, not just the clock — issue #3906 item 2")

        _ = canvas.gestureRecognizerShouldBegin(UIPanGestureRecognizer())

        XCTAssertTrue(canvas.backgroundLayer.isPlaybackActive,
                     "an interaction must resume the preview loop — nothing is permanently removed")
    }
}
