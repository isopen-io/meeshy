import XCTest
import UIKit
import AVFoundation
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Behaviour pins for `StoryCanvasUIView`'s playback-health emitter — the SDK
/// building block that turns the primary media player's `timeControlStatus`
/// into the `onPlaybackProgressing(Bool)` signal the viewer wires into the
/// slide timer. Driven through the test seam `_refreshPlaybackHealthForTesting`
/// so the watchdog + emit-on-change + freeze contract is exercised WITHOUT a
/// live `AVPlayer` or a real `CADisplayLink`.
@MainActor
final class StoryCanvasPlaybackHealthTests: XCTestCase {

    private func makeSolidColorSlide(id: String = "slide-current", duration: TimeInterval = 5) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StorySlide(id: id, effects: effects, duration: duration)
    }

    private func makeCanvasView(slide: StorySlide) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }

    // MARK: - Emit-on-change : stall -> resume

    func test_emits_false_onStall_then_true_onResume() {
        let view = makeCanvasView(slide: makeSolidColorSlide())
        var events: [Bool] = []
        view.onPlaybackProgressing = { events.append($0) }

        view._refreshPlaybackHealthForTesting(status: .playing, failed: false, now: 100)
        XCTAssertEqual(events, [], "Healthy start must not emit (default is progressing)")
        XCTAssertFalse(view.isPlaybackStalled)

        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 101)
        XCTAssertEqual(events, [false], "A stall must emit progressing=false exactly once")
        XCTAssertTrue(view.isPlaybackStalled)

        // A second waiting tick must NOT re-emit (emit-on-change only).
        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 101.5)
        XCTAssertEqual(events, [false])

        view._refreshPlaybackHealthForTesting(status: .playing, failed: false, now: 102)
        XCTAssertEqual(events, [false, true], "Resuming playback must emit progressing=true")
        XCTAssertFalse(view.isPlaybackStalled)
    }

    // MARK: - Deadlock guard : no primary video -> never gate

    func test_noPrimaryVideo_neverEmitsAndNeverStalls() {
        let view = makeCanvasView(slide: makeSolidColorSlide())
        var events: [Bool] = []
        view.onPlaybackProgressing = { events.append($0) }

        view._refreshPlaybackHealthForTesting(status: nil, failed: false, now: 100)
        view._refreshPlaybackHealthForTesting(status: nil, failed: false, now: 101)
        view._refreshPlaybackHealthForTesting(status: nil, failed: false, now: 200)

        XCTAssertEqual(events, [], "An image/colour/audio-only slide must never gate the timeline")
        XCTAssertFalse(view.isPlaybackStalled)
    }

    // MARK: - Deadlock guard : watchdog fallback on a permanent stall

    func test_watchdog_fallsBackToProgressing_afterContinuousStall() {
        let view = makeCanvasView(slide: makeSolidColorSlide())
        var events: [Bool] = []
        view.onPlaybackProgressing = { events.append($0) }
        let watchdog = StoryCanvasUIView.playbackStallWatchdogSeconds

        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 100)
        XCTAssertEqual(events, [false])
        XCTAssertTrue(view.isPlaybackStalled)

        // Still within the watchdog window -> stays frozen, no new emit.
        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 100 + watchdog - 0.1)
        XCTAssertEqual(events, [false])
        XCTAssertTrue(view.isPlaybackStalled)

        // Watchdog elapsed -> fall back to wall-clock (progressing=true) so the
        // story can never hard-stall on a permanently-stuck stream.
        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 100 + watchdog)
        XCTAssertEqual(events, [false, true])
        XCTAssertFalse(view.isPlaybackStalled)
    }

    // MARK: - Deadlock guard : failed player never freezes

    func test_failed_keepsProgressing_evenWhileWaiting() {
        let view = makeCanvasView(slide: makeSolidColorSlide())
        var events: [Bool] = []
        view.onPlaybackProgressing = { events.append($0) }

        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 100)
        XCTAssertEqual(events, [false])

        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: true, now: 101)
        XCTAssertEqual(events, [false, true], "A failed player must fall back to wall-clock immediately")
        XCTAssertFalse(view.isPlaybackStalled)
    }

    // MARK: - User pause suppresses the stall gate

    func test_userPause_suppressesStall() {
        let view = makeCanvasView(slide: makeSolidColorSlide())
        var events: [Bool] = []
        view.onPlaybackProgressing = { events.append($0) }

        view.setPaused(true)   // user long-press
        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 100)

        XCTAssertEqual(events, [], "A user pause is handled by setPaused, not the stall gate")
        XCTAssertFalse(view.isPlaybackStalled)
    }

    // MARK: - In-canvas parity : playhead advance is frozen while stalled

    func test_playheadAdvance_frozenWhileStalled_resumesAfter() {
        let view = makeCanvasView(slide: makeSolidColorSlide(duration: 10))
        // `advancePlayheadIfActive` calls `rebuildLayers()`, which transiently
        // resets `contentReadyFired` and schedules an ASYNC re-fire. Production
        // ticks spin the runloop between frames so it self-restores; this
        // synchronous test never does, so we re-arm content-ready before each
        // discrete advance to isolate the playback-stall gate specifically.

        view._forceContentReadyForTesting()
        view._advancePlayheadForTesting(by: 1.0)
        XCTAssertEqual(view.currentTime.seconds, 1.0, accuracy: 1e-3,
                       "Healthy playback advances the canvas playhead")

        view._forceContentReadyForTesting()
        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate, failed: false, now: 100)
        view._advancePlayheadForTesting(by: 1.0)
        XCTAssertEqual(view.currentTime.seconds, 1.0, accuracy: 1e-3,
                       "A stall must freeze the canvas playhead in phase (content IS ready)")

        view._forceContentReadyForTesting()
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false, now: 101)
        view._advancePlayheadForTesting(by: 1.0)
        XCTAssertEqual(view.currentTime.seconds, 2.0, accuracy: 1e-3,
                       "Resuming advances again from the frozen position (no jump)")
    }
}
