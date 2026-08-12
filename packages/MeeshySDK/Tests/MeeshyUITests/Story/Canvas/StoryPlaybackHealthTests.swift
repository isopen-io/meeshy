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

    // MARK: - Audio pending (R1) : the slide's audio is not scheduled yet

    func test_isProgressing_audioPending_noVideo_returnsFalse() {
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: false,
            isAudioPending: true),
            "An audio-driven slide whose clips are still downloading must freeze the timeline")
    }

    func test_isProgressing_audioPending_playingVideo_returnsFalse() {
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: .playing, isUserPaused: false, isFailed: false, watchdogExpired: false,
            isAudioPending: true),
            "A playing video must not unfreeze a slide whose audio is still pending")
    }

    func test_isProgressing_audioPending_userPaused_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: true, isFailed: false, watchdogExpired: false,
            isAudioPending: true),
            "A user/lifecycle pause is handled by setPaused, not the audio gate")
    }

    func test_isProgressing_audioPending_failed_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: .waitingToPlayAtSpecifiedRate, isUserPaused: false, isFailed: true, watchdogExpired: false,
            isAudioPending: true),
            "A failed primary player falls back to wall-clock even with audio pending")
    }

    func test_isProgressing_audioPending_watchdogExpired_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: true,
            isAudioPending: true),
            "Audio that never schedules must fall back to wall-clock, never deadlock")
    }

    // MARK: - Primary media pending (R2) : bg image bitmap not stamped yet

    func test_isProgressing_mediaPending_noVideo_returnsFalse() {
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: false,
            isPrimaryMediaPending: true),
            "A bg-image slide whose final bitmap has not landed must freeze the timeline")
    }

    func test_isProgressing_mediaPending_userPaused_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: true, isFailed: false, watchdogExpired: false,
            isPrimaryMediaPending: true))
    }

    func test_isProgressing_mediaPending_watchdogExpired_returnsTrue() {
        XCTAssertTrue(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: true,
            isPrimaryMediaPending: true),
            "An image that never lands must fall back to wall-clock, never deadlock")
    }

    func test_isProgressing_mediaAndAudioPending_bothClear_beforeProgressing() {
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: false,
            isAudioPending: true, isPrimaryMediaPending: false),
            "Audio pending alone still freezes")
        XCTAssertFalse(StoryPlaybackHealth.isProgressing(
            status: nil, isUserPaused: false, isFailed: false, watchdogExpired: false,
            isAudioPending: false, isPrimaryMediaPending: true),
            "Media pending alone still freezes")
    }

    // MARK: - shouldKickPlayback (C-DIR3 — self-heal du playback device)

    func test_shouldKickPlayback_pausedPastGrace_kicks() {
        XCTAssertTrue(StoryPlaybackHealth.shouldKickPlayback(
            status: .paused, isUserPaused: false, isFailed: false,
            pausedSinceSeconds: 1.0, kicksDelivered: 0),
            "A player stuck .paused while every gate says play must be re-kicked")
    }

    func test_shouldKickPlayback_withinGrace_waits() {
        XCTAssertFalse(StoryPlaybackHealth.shouldKickPlayback(
            status: .paused, isUserPaused: false, isFailed: false,
            pausedSinceSeconds: 0.3, kicksDelivered: 0),
            "The grace window absorbs the normal attach→play latency")
    }

    func test_shouldKickPlayback_userPaused_neverKicks() {
        XCTAssertFalse(StoryPlaybackHealth.shouldKickPlayback(
            status: .paused, isUserPaused: true, isFailed: false,
            pausedSinceSeconds: 10, kicksDelivered: 0),
            "A legitimate long-press pause must never be fought by the self-heal")
    }

    func test_shouldKickPlayback_buffering_isStallGateTerritory() {
        XCTAssertFalse(StoryPlaybackHealth.shouldKickPlayback(
            status: .waitingToPlayAtSpecifiedRate, isUserPaused: false, isFailed: false,
            pausedSinceSeconds: 10, kicksDelivered: 0),
            ".waiting is buffering — the stall gate owns it, a kick would not help")
    }

    func test_shouldKickPlayback_noVideo_neverKicks() {
        XCTAssertFalse(StoryPlaybackHealth.shouldKickPlayback(
            status: nil, isUserPaused: false, isFailed: false,
            pausedSinceSeconds: 10, kicksDelivered: 0))
    }

    func test_shouldKickPlayback_failed_neverKicks() {
        XCTAssertFalse(StoryPlaybackHealth.shouldKickPlayback(
            status: .paused, isUserPaused: false, isFailed: true,
            pausedSinceSeconds: 10, kicksDelivered: 0),
            "A dead asset cannot be revived by play() — wall clock owns it")
    }

    func test_shouldKickPlayback_kickBudgetExhausted_stops() {
        XCTAssertFalse(StoryPlaybackHealth.shouldKickPlayback(
            status: .paused, isUserPaused: false, isFailed: false,
            pausedSinceSeconds: 10, kicksDelivered: StoryPlaybackHealth.maxPlaybackKicks),
            "Bounded retries — an external force pausing us repeatedly must win")
    }
}
