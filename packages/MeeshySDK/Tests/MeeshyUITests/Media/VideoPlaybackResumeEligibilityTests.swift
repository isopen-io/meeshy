import Foundation
import Testing
@testable import MeeshyUI

/// Which stored positions video playback will actually honor. Strict mirror
/// of `AudioPlaybackResumeEligibilityTests` — `SharedAVPlayerManager` applies
/// the same dead-zone-at-both-ends / short-track rule as `AudioPlaybackManager`
/// so a video's resume behavior reads consistently with a voice note's.
///
/// Readers: `applyResumePositionIfAvailable` (seek before play) and the
/// pause/end position-persist path (store vs clear). These tests are what
/// keeps the two from drifting apart.
struct VideoPlaybackResumeEligibilityTests {

    @Test func midTrackPosition_isResumable() {
        #expect(SharedAVPlayerManager.isResumable(30, totalDuration: 69))
    }

    // MARK: - Short tracks are never resumed

    @Test func trackShorterThanMinimum_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(1.5, totalDuration: 1.9))
    }

    @Test func trackAtExactlyMinimumDuration_isEvaluatedNormally() {
        // 2.0s track: the two 1.0s guards leave no admissible interval.
        #expect(!SharedAVPlayerManager.isResumable(1.0, totalDuration: 2.0))
    }

    @Test func zeroDuration_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(10, totalDuration: 0))
    }

    // MARK: - Dead-zone at both ends

    @Test func positionInsideLeadingGuard_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(0.4, totalDuration: 69))
    }

    @Test func positionExactlyAtLeadingGuard_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(1.0, totalDuration: 69))
    }

    @Test func positionJustPastLeadingGuard_isResumable() {
        #expect(SharedAVPlayerManager.isResumable(1.01, totalDuration: 69))
    }

    @Test func positionInsideTrailingGuard_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(68.5, totalDuration: 69))
    }

    @Test func positionExactlyAtTrailingGuard_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(68.0, totalDuration: 69))
    }

    @Test func positionJustInsideTrailingGuard_isResumable() {
        #expect(SharedAVPlayerManager.isResumable(67.9, totalDuration: 69))
    }

    @Test func positionBeyondDuration_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(900, totalDuration: 69))
    }

    @Test func negativePosition_isNotResumable() {
        #expect(!SharedAVPlayerManager.isResumable(-3, totalDuration: 69))
    }
}
