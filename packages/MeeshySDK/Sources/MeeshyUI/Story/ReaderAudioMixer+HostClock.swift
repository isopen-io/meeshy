import Foundation
import AVFoundation
import Darwin

/// **L'horloge hôte du mixer de lecture, extraite de `ReaderAudioMixer.swift`.**
///
/// Conversions secondes ↔ ticks `mach_absolute_time()` : le seul référentiel
/// que partagent les `AVAudioTime` planifiés et le playhead du canevas. Sorties
/// du fichier du type pour lui rendre la place qu'exige le moteur partagé
/// (#9878) — elles n'en dépendent d'aucun état.
extension ReaderAudioMixer {
    private static let hostTimebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Forward to `AudioMixer.hostTime(forDelaySeconds:)` so a single, hardened
    /// implementation (Double-based, clamped to `UInt64.max`, validates timebase
    /// and finiteness — see P3-#5 in commit `841a528a`) is the source of truth
    /// for the entire MeeshyUI audio pipeline. The previous local implementation
    /// silently overflowed on non-Apple-Silicon timebases (numer=1, denom=3 on
    /// Intel) for delays > 9.22s, which is well within the realistic envelope
    /// of a 30s slide. Production callers keep the same call shape; the dedicated
    /// `timebase:` overload below exists for tests that need to exercise the
    /// overflow path explicitly.
    static func hostTime(forDelaySeconds seconds: Double) -> UInt64 {
        return AudioMixer.hostTime(forDelaySeconds: seconds)
    }

    /// Testable overload that injects an explicit timebase. Delegates to the
    /// hardened `AudioMixer` helper so the two mixers stay bit-identical.
    static func hostTime(
        forDelaySeconds seconds: Double,
        timebase: mach_timebase_info_data_t
    ) -> UInt64 {
        return AudioMixer.hostTime(forDelaySeconds: seconds, timebase: timebase)
    }

    static func delaySeconds(forHostTime target: UInt64, relativeTo now: UInt64) -> TimeInterval {
        guard target > now else { return 0 }
        let deltaTicks = target - now
        let nanos = deltaTicks * UInt64(hostTimebase.numer) / UInt64(hostTimebase.denom)
        return TimeInterval(nanos) / 1_000_000_000
    }
}
