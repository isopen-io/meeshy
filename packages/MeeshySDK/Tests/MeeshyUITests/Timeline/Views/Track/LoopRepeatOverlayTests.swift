import XCTest
@testable import MeeshyUI

/// `LoopRepeatOverlay.repeatStartTimes` computes where the visual "echoes" of
/// a looping background clip land, so a short background (e.g. 1s) tiles
/// across the full slide duration (e.g. 6s) instead of leaving the track
/// looking empty past the clip's native length.
final class LoopRepeatOverlayTests: XCTestCase {

    func test_shortClip_tilesAcrossSlideDuration() {
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 1, clipStartTime: 0, slideDuration: 6
        )
        XCTAssertEqual(starts, [1, 2, 3, 4, 5])
    }

    func test_clipAlreadyFillsSlide_noRepeats() {
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 6, clipStartTime: 0, slideDuration: 6
        )
        XCTAssertEqual(starts, [])
    }

    func test_clipLongerThanSlide_noRepeats() {
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 10, clipStartTime: 0, slideDuration: 6
        )
        XCTAssertEqual(starts, [])
    }

    func test_zeroDuration_noInfiniteLoop() {
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 0, clipStartTime: 0, slideDuration: 6
        )
        XCTAssertEqual(starts, [])
    }

    func test_nonZeroClipStart_repeatsOffsetFromStart() {
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 1, clipStartTime: 1, slideDuration: 6
        )
        XCTAssertEqual(starts, [2, 3, 4, 5])
    }

    func test_fractionalDuration_stopsAtSlideBoundary() {
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 2.5, clipStartTime: 0, slideDuration: 6
        )
        XCTAssertEqual(starts, [2.5, 5.0])
    }

    func test_tinyRemainderPastSlideDuration_omitted() {
        // The native clip [0, 3) already covers all but 0.02s of a 3.02s
        // slide — the next repeat would be a razor-thin sliver and must be
        // omitted rather than rendered.
        let starts = LoopRepeatOverlay.repeatStartTimes(
            nativeDuration: 3, clipStartTime: 0, slideDuration: 3.02
        )
        XCTAssertEqual(starts, [])
    }
}
