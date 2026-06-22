import XCTest
import AVFoundation
@testable import MeeshyUI

/// Pure-function pins for `StoryPlaybackHealth.isProgressing(...)` — the master
/// signal that maps a player's `timeControlStatus` (plus the slide's pause /
/// failure / watchdog context) to "is the unified story timeline allowed to
/// advance right now?".
///
/// This is the spec's "stubbable player-health source": the mapping is a
/// stateless rule engine, so the full deadlock-guard matrix is exercised here
/// with NO live `AVPlayer`.
final class StoryPlaybackHealthTests: XCTestCase {

    // MARK: - No video on the slide -> never gate

    func test_isProgressing_noPrimaryVideo_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: false),
            "A slide without a primary video must NEVER be gated on playback")
    }

    func test_isProgressing_noPrimaryVideo_stillTrue_evenIfPaused() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: true, isFailed: false, watchdogExpired: false))
    }

    // MARK: - Real playback states

    func test_isProgressing_playing_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: .playing, isUserPaused: false, isFailed: false, watchdogExpired: false))
    }

    func test_isProgressing_waitingToPlay_returnsFalse() {
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: .waitingToPlayAtSpecifiedRate, isUserPaused: false, isFailed: false, watchdogExpired: false),
            "Buffering (.waitingToPlayAtSpecifiedRate) must freeze the timeline")
    }

    func test_isProgressing_unexpectedPause_returnsFalse() {
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: .paused, isUserPaused: false, isFailed: false, watchdogExpired: false),
            "An unexpected .paused (not user-initiated) must freeze the timeline")
    }

    // MARK: - Deadlock guards (each forces progressing=true even while not playing)

    func test_isProgressing_userPaused_returnsTrue_evenWhenWaiting() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: .waitingToPlayAtSpecifiedRate, isUserPaused: true, isFailed: false, watchdogExpired: false),
            "A user/lifecycle pause is handled by setPaused, not the stall gate -> health stays true")
    }

    func test_isProgressing_failed_returnsTrue_evenWhenWaiting() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: .waitingToPlayAtSpecifiedRate, isUserPaused: false, isFailed: true, watchdogExpired: false),
            "A failed player must fall back to wall-clock, never deadlock")
    }

    func test_isProgressing_watchdogExpired_returnsTrue_evenWhenWaiting() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: .waitingToPlayAtSpecifiedRate, isUserPaused: false, isFailed: false, watchdogExpired: true),
            "A stall that outlives the watchdog must fall back to wall-clock, never deadlock")
    }

    func test_isProgressing_watchdogExpired_returnsTrue_evenWhenPaused() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: .paused, isUserPaused: false, isFailed: false, watchdogExpired: true))
    }
}
