import Testing
import CoreGraphics
@testable import MeeshyUI

/// Drag-to-scrub geometry for the audio bubble waveform (conversation + post).
///
/// `scrubFraction(locationX:width:)` is the single pure mapping from a touch /
/// drag x-position to a normalized seek fraction (0...1), shared by BOTH the
/// tap-to-seek and the swipe-to-scrub gestures on `waveformProgress`. Locking it
/// here keeps the seek math identical across the two paths and guards the clamp
/// + zero-width divide that a live drag exercises continuously.
struct AudioPlayerScrubTests {

    @Test func scrubFraction_midpoint_isHalf() {
        #expect(AudioPlayerView.scrubFraction(locationX: 100, width: 200) == 0.5)
    }

    @Test func scrubFraction_start_isZero() {
        #expect(AudioPlayerView.scrubFraction(locationX: 0, width: 200) == 0)
    }

    @Test func scrubFraction_end_isOne() {
        #expect(AudioPlayerView.scrubFraction(locationX: 200, width: 200) == 1)
    }

    /// A live drag routinely overshoots both edges of the strip (the finger
    /// leaves the 24pt band). The fraction must clamp, never produce a seek
    /// past 0...1.
    @Test func scrubFraction_pastStart_clampsToZero() {
        #expect(AudioPlayerView.scrubFraction(locationX: -50, width: 200) == 0)
    }

    @Test func scrubFraction_pastEnd_clampsToOne() {
        #expect(AudioPlayerView.scrubFraction(locationX: 320, width: 200) == 1)
    }

    /// Zero / negative width (pre-layout GeometryReader tick) must not divide by
    /// zero — return 0 rather than NaN.
    @Test func scrubFraction_zeroWidth_isZero() {
        #expect(AudioPlayerView.scrubFraction(locationX: 100, width: 0) == 0)
    }
}
