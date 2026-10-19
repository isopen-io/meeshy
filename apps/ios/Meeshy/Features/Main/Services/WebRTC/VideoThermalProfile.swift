import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Thermal-aware video encoder ceiling (§5.6)

/// §5.6 — thermal-aware video encoder ceiling. The network-driven quality
/// ladder (`WebRTCService.adjustBitrate`) picks an encoder target from RTT +
/// packet loss; this composes a SECOND, independent ceiling from the device's
/// `ProcessInfo.thermalState` so a hot device sheds encode load (the #1 cause
/// of dropped frames + battery drain in long video calls) regardless of how
/// healthy the network looks.
///
/// Pure + deterministic: maps a thermal state to multiplicative/absolute caps,
/// then takes the MORE conservative of the network target and the thermal cap
/// on each axis. `.nominal` is a strict no-op.
enum VideoThermalProfile {
    struct Ceiling: Equatable, Sendable {
        let bitrateFactor: Double   // multiplies the network bitrate target (≤ 1)
        let maxFramerate: Int       // absolute fps cap
        let minScaleDownBy: Double  // floor on resolution downscale (≥ 1)
    }

    static func ceiling(for state: ProcessInfo.ThermalState) -> Ceiling {
        switch state {
        case .nominal:  return Ceiling(bitrateFactor: 1.0, maxFramerate: 60, minScaleDownBy: 1.0)
        case .fair:     return Ceiling(bitrateFactor: 0.8, maxFramerate: 30, minScaleDownBy: 1.0)
        case .serious:  return Ceiling(bitrateFactor: 0.5, maxFramerate: 24, minScaleDownBy: 1.5)
        case .critical: return Ceiling(bitrateFactor: 0.3, maxFramerate: 15, minScaleDownBy: 2.0)
        @unknown default: return Ceiling(bitrateFactor: 1.0, maxFramerate: 60, minScaleDownBy: 1.0)
        }
    }

    /// Compose a network-derived encoder target with the thermal ceiling, taking
    /// the more conservative value on each axis. Bitrate/framerate never go below
    /// 1; scale never below 1.0.
    static func apply(
        bitrateBps: Int,
        framerate: Int,
        scaleDownBy: Double,
        thermalState: ProcessInfo.ThermalState
    ) -> (bitrateBps: Int, framerate: Int, scaleDownBy: Double) {
        let c = ceiling(for: thermalState)
        let cappedBitrate = Int((Double(bitrateBps) * c.bitrateFactor).rounded())
        let cappedFramerate = min(framerate, c.maxFramerate)
        let flooredScale = max(scaleDownBy, c.minScaleDownBy)
        return (max(1, cappedBitrate), max(1, cappedFramerate), max(1.0, flooredScale))
    }
}
