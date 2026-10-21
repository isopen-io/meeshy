import CoreGraphics
import Foundation
import MeeshySDK

/// Hysteresis gate for the jitter-driven audio bitrate cap in
/// `WebRTCService.adjustBitrate`. A single 5 s stats tick with a transient
/// jitter burst (e.g. one buffered retransmit on a captive-portal Wi-Fi) must
/// not permanently ratchet the Opus encoder down to `minBitrate` and back up
/// on the very next tick — that produces audible warble on a link that didn't
/// need the cap. Mirrors `DegradedLinkTracker`'s consecutive-tick contract:
/// requires two consecutive high-jitter ticks before capping, and clears on
/// the very first tick back under threshold (fast recovery).
nonisolated struct JitterBitrateCapTracker {
    static let consecutiveTicksToActivate = 2

    private var highJitterStreak = 0
    private(set) var isCapped = false

    @discardableResult
    mutating func record(jitterMs: Double, thresholdMs: Double) -> Bool {
        if jitterMs > thresholdMs {
            highJitterStreak += 1
            if highJitterStreak >= Self.consecutiveTicksToActivate { isCapped = true }
        } else {
            highJitterStreak = 0
            isCapped = false
        }
        return isCapped
    }

    mutating func reset() {
        highJitterStreak = 0
        isCapped = false
    }
}
