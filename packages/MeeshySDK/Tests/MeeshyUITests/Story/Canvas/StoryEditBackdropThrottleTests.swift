import XCTest
@testable import MeeshyUI

/// WS2.1 — the per-frame glass-backdrop re-feed cadence. The edit display link
/// ticks up to 120 Hz; this gate caps the CARenderer re-capture to ~18 fps.
final class StoryEditBackdropThrottleTests: XCTestCase {

    private let interval = StoryEditBackdropThrottle.defaultMinInterval

    func test_firstTick_neverEmitted_emits() {
        XCTAssertTrue(StoryEditBackdropThrottle.shouldEmit(now: 1234.5, last: 0),
                      "The first edit tick must re-feed immediately (last == 0)")
    }

    func test_withinInterval_skips() {
        let last = 100.0
        XCTAssertFalse(StoryEditBackdropThrottle.shouldEmit(now: last + interval * 0.5, last: last),
                       "A tick before the interval elapses must be skipped")
    }

    func test_exactlyAtInterval_emits() {
        let last = 100.0
        XCTAssertTrue(StoryEditBackdropThrottle.shouldEmit(now: last + interval, last: last),
                      "At exactly the interval boundary the gate emits (>=)")
    }

    func test_afterInterval_emits() {
        let last = 100.0
        XCTAssertTrue(StoryEditBackdropThrottle.shouldEmit(now: last + interval * 2, last: last))
    }

    func test_regressingClock_skips() {
        XCTAssertFalse(StoryEditBackdropThrottle.shouldEmit(now: 99.0, last: 100.0),
                       "A regressing/reset display-link clock must not burst a re-feed")
    }

    func test_defaultInterval_isAround18fps() {
        // ~55.6 ms. Guards against an accidental change to the cap.
        XCTAssertEqual(interval, 1.0 / 18.0, accuracy: 0.0001)
    }
}
