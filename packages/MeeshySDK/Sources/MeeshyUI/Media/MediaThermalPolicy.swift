import Foundation

/// Stateless rule-engine that maps the device's `ProcessInfo.ThermalState` to
/// media-playback tuning knobs. Pure functions only — the playback surfaces read
/// `ProcessInfo.processInfo.thermalState` and pass it here so the policy stays
/// trivially testable and SOTA-aligned (WWDC19 #422 "Designing for Adverse
/// Network and Temperature Conditions": back off work as the device heats up).
///
/// SDK-appropriate per the placement rule: a stateless rule engine over an
/// opaque system value — no Meeshy singletons, no UX cascade. `nonisolated`
/// because `MeeshyUI` builds under `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
/// and the policy must be callable from any isolation.
public enum MediaThermalPolicy {

    /// Cadence (seconds) of the playback `addPeriodicTimeObserver`. Slower under
    /// thermal pressure: each tick republishes `currentTime` and nudges the
    /// observing chrome, so fewer ticks = less main-thread + render work.
    nonisolated public static func timeObserverInterval(thermalState: ProcessInfo.ThermalState) -> Double {
        switch thermalState {
        case .serious, .critical: return 0.5
        default: return 0.2
        }
    }

    /// Seconds of video decoded ahead of the playhead per prerolled item. SOTA
    /// short-video feeds keep this small (~1s); it shrinks further once the
    /// device is hot so prerolled players hold fewer decoded frames.
    nonisolated public static func forwardBufferDuration(thermalState: ProcessInfo.ThermalState) -> Double {
        switch thermalState {
        case .serious, .critical: return 0.5
        default: return 1.0
        }
    }

    /// Peak bitrate cap in bits/s. Heat-first: ALWAYS capped, never `0` (uncapped) —
    /// the user's problem is thermal, and an uncapped HLS rendition would let decode
    /// load spike. The watched player gets a phone-adequate 1.5 Mbps; offscreen
    /// preroll is cheaper (it may never be seen); thermal pressure tightens both.
    nonisolated public static func preferredPeakBitRate(isVisible: Bool,
                                                         thermalState: ProcessInfo.ThermalState) -> Double {
        switch thermalState {
        case .critical: return 600_000
        case .serious: return 900_000
        default: return isVisible ? 1_500_000 : 1_000_000
        }
    }

    /// Whether to preroll the next reel's video at all. Prefetch is suspended
    /// once the device is critically hot so scrolling stops spawning new decode
    /// sessions while it cools down.
    nonisolated public static func shouldPrefetchVideo(thermalState: ProcessInfo.ThermalState) -> Bool {
        thermalState != .critical
    }
}
