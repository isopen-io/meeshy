import CoreGraphics
import Foundation
import MeeshySDK

/// Sustained-degradation gate for the "Connexion instable" pill. One 5 s
/// stats tick is not a bad call — a transient RTT spike or a single loss
/// burst self-heals without the user ever needing a warning. Alert only
/// after two consecutive degraded ticks (~10 s); a single healthy tick
/// clears immediately (fast recovery feedback). `.fair` is a working link —
/// it never alerts.
nonisolated struct DegradedLinkTracker {
    static let consecutiveTicksToAlert = 2

    private var degradedStreak = 0
    private(set) var isDegraded = false

    @discardableResult
    mutating func record(level: VideoQualityLevel) -> Bool {
        switch level {
        case .poor, .critical:
            degradedStreak += 1
            if degradedStreak >= Self.consecutiveTicksToAlert { isDegraded = true }
        case .excellent, .good, .fair:
            degradedStreak = 0
            isDegraded = false
        }
        return isDegraded
    }

    mutating func reset() {
        degradedStreak = 0
        isDegraded = false
    }
}
