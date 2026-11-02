import Foundation
import MeeshySDK

/// Stateless rule-engine that maps the device's `ProcessInfo.ThermalState` to
/// media-playback tuning knobs (WWDC19 #422 "Designing for Adverse Network and
/// Temperature Conditions": back off work as the device heats up).
///
/// The heat threshold is NOT decided here: `DeviceMediaInputs.Thermal` holds it
/// (`isUnderPressure`, `stopsVideoPrefetch`), and the reel window
/// (`ReelPreloadWindow`) and the device tier read the same predicate (#9880).
/// `MediaPolicy` composes this law with Low Power Mode and the tier; live
/// players read it through `MediaPolicyMonitor`.
///
/// No bitrate knob: the server serves progressive MP4 only, on which
/// `preferredPeakBitRate` has no effect (it selects HLS variants). The real
/// levers are the number of prepared players (`PlayerPoolCapacity`) and the
/// buffers below.
///
/// `nonisolated` because `MeeshyUI` builds under
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` and the policy must be callable
/// from any isolation.
public enum MediaThermalPolicy {

    /// Cadence (seconds) of the playback `addPeriodicTimeObserver`. Slower under
    /// thermal pressure: each tick republishes `currentTime` and nudges the
    /// observing chrome, so fewer ticks = less main-thread + render work.
    nonisolated public static func timeObserverInterval(thermalState: ProcessInfo.ThermalState) -> Double {
        DeviceMediaInputs.Thermal(thermalState).isUnderPressure ? 0.5 : 0.2
    }

    /// Seconds of video decoded ahead of the playhead per prerolled item. SOTA
    /// short-video feeds keep this small (~1s); it shrinks further once the
    /// device is hot so prerolled players hold fewer decoded frames.
    nonisolated public static func forwardBufferDuration(thermalState: ProcessInfo.ThermalState) -> Double {
        DeviceMediaInputs.Thermal(thermalState).isUnderPressure ? 0.5 : 1.0
    }

    /// Seconds buffered ahead for the item ON SCREEN — a story layer may stream
    /// its remote URL, so it keeps the historical 2 s while the device is cool
    /// and halves it under pressure.
    nonisolated public static func watchedForwardBufferDuration(thermalState: ProcessInfo.ThermalState) -> Double {
        DeviceMediaInputs.Thermal(thermalState).isUnderPressure ? 1.0 : 2.0
    }

    /// Whether to preroll the next reel's video at all. Prefetch is suspended
    /// once the device is critically hot so scrolling stops spawning new decode
    /// sessions while it cools down.
    nonisolated public static func shouldPrefetchVideo(thermalState: ProcessInfo.ThermalState) -> Bool {
        !DeviceMediaInputs.Thermal(thermalState).stopsVideoPrefetch
    }
}
