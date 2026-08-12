import Foundation
import Testing
@testable import MeeshyUI

/// What the audio bubble SHOWS for "how far along am I".
///
/// The widget renders the same quantity three times — waveform tint, percentage
/// chip and elapsed timecode. Before `progressDisplay` existed each one read a
/// different source: the waveform fell back to the persisted at-rest
/// consumption while the chip and the timecode read the live engine only. On a
/// bubble whose engine is not attached (fresh launch, scrolled-away message)
/// the live engine reports zero, so a voice note paused at 0:51 / 73 % came
/// back painted at 73 % yet labelled `0:00` and `0%` — the widget contradicted
/// itself and hid the fact that playback would resume mid-track.
///
/// These tests lock the single resolution: live values win while playing, the
/// persisted resting fraction drives BOTH the fraction and the elapsed
/// timecode otherwise.
struct AudioPlayerProgressDisplayTests {

    // MARK: - Live playback wins

    @Test func liveProgress_drivesFractionAndElapsed() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0.42, liveCurrentTime: 29, restingProgress: 0.73,
            resumePosition: nil, totalDuration: 69)
        #expect(d.isLive)
        #expect(d.fraction == 0.42)
        #expect(d.elapsed == 29)
    }

    /// A stale resume entry must never override the head that is playing.
    @Test func liveProgress_ignoresResumePosition() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0.42, liveCurrentTime: 29, restingProgress: 0.73,
            resumePosition: 8, totalDuration: 69)
        #expect(d.elapsed == 29)
    }

    /// While playing, the monotonic consumption store may sit AHEAD of the live
    /// head (the user scrubbed backwards). The live head still wins — the
    /// timecode must track the audio actually coming out of the speaker.
    @Test func liveProgress_behindRestingProgress_stillWins() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0.10, liveCurrentTime: 7, restingProgress: 0.90,
            resumePosition: nil, totalDuration: 70)
        #expect(d.isLive)
        #expect(d.fraction == 0.10)
        #expect(d.elapsed == 7)
    }

    // MARK: - At rest: the persisted position is shown, not zero

    /// The regression under test: a bubble with no attached engine but a
    /// persisted 73 % must report 73 % AND the matching timecode, not 0 / 0:00.
    @Test func atRest_withPersistedProgress_reportsItAsFractionAndElapsed() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.73,
            resumePosition: nil, totalDuration: 69)
        #expect(!d.isLive)
        #expect(d.fraction == 0.73)
        #expect(abs(d.elapsed - 50.37) < 0.001)
    }

    @Test func atRest_neverListened_reportsZero() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0,
            resumePosition: nil, totalDuration: 69)
        #expect(!d.isLive)
        #expect(d.fraction == 0)
        #expect(d.elapsed == 0)
    }

    @Test func atRest_fullyListened_reportsFullDuration() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 1,
            resumePosition: nil, totalDuration: 69)
        #expect(d.fraction == 1)
        #expect(d.elapsed == 69)
    }

    // MARK: - Degenerate inputs

    /// Duration is unknown until the asset loads (metadata missing AND engine
    /// detached). A resting fraction with no duration must not fabricate a
    /// timecode, but must still tint the waveform.
    @Test func atRest_unknownDuration_keepsFractionButZeroElapsed() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.5,
            resumePosition: nil, totalDuration: 0)
        #expect(d.fraction == 0.5)
        #expect(d.elapsed == 0)
    }

    @Test func atRest_negativeDuration_yieldsZeroElapsed() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.5,
            resumePosition: nil, totalDuration: -12)
        #expect(d.elapsed == 0)
    }

    /// A corrupted / out-of-range store entry must never paint past the strip
    /// nor print a timecode beyond the track.
    @Test func atRest_restingProgressAboveOne_clamps() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 1.8,
            resumePosition: nil, totalDuration: 69)
        #expect(d.fraction == 1)
        #expect(d.elapsed == 69)
    }

    @Test func atRest_negativeRestingProgress_clampsToZero() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: -0.3,
            resumePosition: nil, totalDuration: 69)
        #expect(d.fraction == 0)
        #expect(d.elapsed == 0)
    }

    /// `isLive` is what switches the waveform from the attenuated accent to the
    /// full one; it must follow the engine, never the persisted value.
    @Test func atRest_isLive_isFalse_evenWithFullRestingProgress() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 1,
            resumePosition: nil, totalDuration: 69)
        #expect(!d.isLive)
    }

    // MARK: - The timecode states the play-from point

    /// Consumption is MONOTONIC and sticky-complete; the resume point is not.
    /// Re-listening to an already-finished note and pausing at 0:22 leaves
    /// consumption at 100 % while playback will restart at 0:22. The chip
    /// answers "have I consumed this?" (yes, all of it) but the timecode sits
    /// next to the play button and must answer "where will it start?".
    @Test func atRest_resumePosition_overridesConsumptionDerivedElapsed() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 1,
            resumePosition: 22, totalDuration: 69)
        #expect(d.fraction == 1)
        #expect(d.elapsed == 22)
    }

    /// The ordinary pause case: both stores agree, and passing the exact resume
    /// seconds avoids the rounding drift of `fraction × duration`.
    @Test func atRest_resumePosition_isPreferredOverFractionRounding() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.739,
            resumePosition: 51, totalDuration: 69)
        #expect(d.elapsed == 51)
        #expect(Int(d.fraction * 100) == 73)
    }

    /// No stored resume point (never listened, or listened to the end — the
    /// engine clears the entry on natural finish) → fall back to the fraction.
    @Test func atRest_noResumePosition_fallsBackToConsumptionFraction() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 1,
            resumePosition: nil, totalDuration: 69)
        #expect(d.elapsed == 69)
    }

    /// A resume entry can outlive a shorter re-encode of the same attachment.
    /// Never print a timecode past the track.
    @Test func atRest_resumePositionBeyondDuration_clampsToDuration() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.5,
            resumePosition: 900, totalDuration: 69)
        #expect(d.elapsed == 69)
    }

    @Test func atRest_negativeResumePosition_clampsToZero() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.5,
            resumePosition: -5, totalDuration: 69)
        #expect(d.elapsed == 0)
    }

    // MARK: - Percentage chip rounding

    /// The chip prints `Int(fraction * 100)`. A resumable-but-tiny position must
    /// not round up to a percentage the waveform does not show.
    @Test func atRest_fractionRoundsDownForChip() {
        let d = AudioPlayerView.progressDisplay(
            liveProgress: 0, liveCurrentTime: 0, restingProgress: 0.739,
            resumePosition: nil, totalDuration: 69)
        #expect(Int(d.fraction * 100) == 73)
    }
}
