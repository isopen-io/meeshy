import XCTest
@testable import MeeshyUI

/// Issue #3906 — the composer's edit `CADisplayLink` used to run at a fixed
/// 60–120 Hz for the entire editing session, with no idea whether anyone was
/// still touching the screen. This pure gate decides when the clock (and the
/// ambient edit-mode preview loop it drives) should idle down.
final class EditClockThrottleTests: XCTestCase {

    private let idleDelay = EditClockThrottle.defaultIdleDelay

    func test_justAfterInteraction_isFull() {
        let regime = EditClockThrottle.regime(now: 100.0,
                                              lastInteractionAt: 100.0,
                                              isMediaActivelyPlaying: false)
        XCTAssertEqual(regime, .full)
    }

    func test_shortlyBeforeTheIdleDelay_isStillFull() {
        let regime = EditClockThrottle.regime(now: 100.0 + idleDelay - 0.5,
                                              lastInteractionAt: 100.0,
                                              isMediaActivelyPlaying: false)
        XCTAssertEqual(regime, .full, "a few seconds of silence between two edits must not idle the clock")
    }

    func test_exactlyAtTheIdleDelay_isIdle() {
        let regime = EditClockThrottle.regime(now: 100.0 + idleDelay,
                                              lastInteractionAt: 100.0,
                                              isMediaActivelyPlaying: false)
        XCTAssertEqual(regime, .idle, "at exactly the delay boundary the gate idles down (>=)")
    }

    func test_wellPastTheIdleDelay_withoutActiveMedia_isIdle() {
        let regime = EditClockThrottle.regime(now: 100.0 + idleDelay + 30,
                                              lastInteractionAt: 100.0,
                                              isMediaActivelyPlaying: false)
        XCTAssertEqual(regime, .idle, "a composer left open and untouched must stop heating the device")
    }

    func test_wellPastTheIdleDelay_withActiveMedia_staysFull() {
        let regime = EditClockThrottle.regime(now: 100.0 + idleDelay + 30,
                                              lastInteractionAt: 100.0,
                                              isMediaActivelyPlaying: true)
        XCTAssertEqual(regime, .full, "genuine ongoing playback counts as activity — it must never freeze mid-frame")
    }

    func test_interactionReturnsAfterIdle_isFullImmediately() {
        // Simulates `noteEditInteraction()` resetting `lastInteractionAt` to
        // `now` the instant a new interaction is detected — the very next
        // evaluation must read as full-rate, not wait out any grace window.
        let regime = EditClockThrottle.regime(now: 500.0,
                                              lastInteractionAt: 500.0,
                                              isMediaActivelyPlaying: false)
        XCTAssertEqual(regime, .full)
    }

    func test_regressingClock_isTreatedAsStillFresh() {
        // A reset/regressing display-link clock (`now < lastInteractionAt`)
        // must never be misread as "ages ago" — mirrors
        // `StoryEditBackdropThrottle.shouldEmit`'s defensive posture.
        let regime = EditClockThrottle.regime(now: 99.0,
                                              lastInteractionAt: 100.0,
                                              isMediaActivelyPlaying: false)
        XCTAssertEqual(regime, .full)
    }

    func test_defaultIdleDelay_isAFewSeconds() {
        // Guards against an accidental change to the grace window: long
        // enough to survive a thinking pause, short enough to actually save
        // power on a genuinely abandoned screen.
        XCTAssertGreaterThanOrEqual(idleDelay, 2.0)
        XCTAssertLessThanOrEqual(idleDelay, 10.0)
    }

    func test_customIdleDelay_isRespected() {
        XCTAssertEqual(EditClockThrottle.regime(now: 10.0, lastInteractionAt: 0.0,
                                                isMediaActivelyPlaying: false, idleDelay: 5.0),
                       .idle)
        XCTAssertEqual(EditClockThrottle.regime(now: 4.0, lastInteractionAt: 0.0,
                                                isMediaActivelyPlaying: false, idleDelay: 5.0),
                       .full)
    }
}
