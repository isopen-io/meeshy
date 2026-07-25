import XCTest
@testable import Meeshy

final class StoryPlaybackClockTests: XCTestCase {

    func test_resolve_whenPlayheadAvailable_usesCanvasSource() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 3.0, wallClockElapsed: 9.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.source, .canvas)
        XCTAssertEqual(out.progress, 0.5, accuracy: 0.0001)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenPlayheadNil_fallsBackToWallClock() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: nil, wallClockElapsed: 3.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.source, .fallback)
        XCTAssertEqual(out.progress, 0.5, accuracy: 0.0001)
    }

    func test_resolve_whenPaused_freezesProgressAtPlayhead() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 1.5, wallClockElapsed: 5.0, duration: 6.0, isPaused: true)
        XCTAssertEqual(out.progress, 0.25, accuracy: 0.0001)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenPausedAtEnd_doesNotComplete() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 6.0, wallClockElapsed: 6.0, duration: 6.0, isPaused: true)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenPlayheadReachesDuration_isComplete() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 6.0, wallClockElapsed: 0.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.progress, 1.0, accuracy: 0.0001)
        XCTAssertTrue(out.isComplete)
    }

    func test_resolve_clampsProgressToUnitInterval() {
        let over = StoryPlaybackClock.resolve(
            playheadSeconds: 99.0, wallClockElapsed: 0, duration: 6.0, isPaused: false)
        XCTAssertEqual(over.progress, 1.0, accuracy: 0.0001)

        let under = StoryPlaybackClock.resolve(
            playheadSeconds: -5.0, wallClockElapsed: 0, duration: 6.0, isPaused: false)
        XCTAssertEqual(under.progress, 0.0, accuracy: 0.0001)
    }

    func test_resolve_whenDurationZero_returnsZeroWithoutDividing() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 3.0, wallClockElapsed: 3.0, duration: 0, isPaused: false)
        XCTAssertEqual(out.progress, 0.0, accuracy: 0.0001)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenDurationNegative_returnsZeroWithoutDividing() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 3.0, wallClockElapsed: 3.0, duration: -4, isPaused: false)
        XCTAssertEqual(out.progress, 0.0, accuracy: 0.0001)
    }
}
