import Foundation
import Testing
@testable import MeeshyUI

/// Which stored positions playback will actually honor.
///
/// `AudioPlaybackManager` applies a dead-zone at both ends of a track and skips
/// very short tracks entirely: a position glued to 0 adds nothing, one glued to
/// the end would replay the last instant then immediately finish, and a 1s
/// voice note is always replayed whole.
///
/// The rule now has THREE readers — `applyResumePositionIfAvailable` (seek
/// before play), `saveResumePosition` (store vs clear) and the bubble's elapsed
/// timecode (which must never advertise a position playback would ignore).
/// These tests are what keeps the three from drifting apart.
struct AudioPlaybackResumeEligibilityTests {

    @Test func midTrackPosition_isResumable() {
        #expect(AudioPlaybackManager.isResumable(30, totalDuration: 69))
    }

    // MARK: - Short tracks are never resumed

    @Test func trackShorterThanMinimum_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(1.5, totalDuration: 1.9))
    }

    @Test func trackAtExactlyMinimumDuration_isEvaluatedNormally() {
        // 2.0s track: the two 1.0s guards leave no admissible interval.
        #expect(!AudioPlaybackManager.isResumable(1.0, totalDuration: 2.0))
    }

    @Test func zeroDuration_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(10, totalDuration: 0))
    }

    // MARK: - Dead-zone at both ends

    @Test func positionInsideLeadingGuard_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(0.4, totalDuration: 69))
    }

    @Test func positionExactlyAtLeadingGuard_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(1.0, totalDuration: 69))
    }

    @Test func positionJustPastLeadingGuard_isResumable() {
        #expect(AudioPlaybackManager.isResumable(1.01, totalDuration: 69))
    }

    @Test func positionInsideTrailingGuard_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(68.5, totalDuration: 69))
    }

    @Test func positionExactlyAtTrailingGuard_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(68.0, totalDuration: 69))
    }

    @Test func positionJustInsideTrailingGuard_isResumable() {
        #expect(AudioPlaybackManager.isResumable(67.9, totalDuration: 69))
    }

    @Test func positionBeyondDuration_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(900, totalDuration: 69))
    }

    @Test func negativePosition_isNotResumable() {
        #expect(!AudioPlaybackManager.isResumable(-3, totalDuration: 69))
    }
}
