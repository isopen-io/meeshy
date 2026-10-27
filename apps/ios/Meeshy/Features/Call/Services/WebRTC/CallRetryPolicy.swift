import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Call Retry Policy

/// Pure decision: which end reasons warrant a « Réessayer » (retry) affordance.
/// Only TRANSIENT establishment/drop failures — a retry genuinely recovers those
/// (prod 2026-07-12: ~16% of calls end in failed/connectionLost, commonly
/// transient ICE-gathering / TURN-allocation hiccups). Normal outcomes
/// (local/remote hangup, missed, rejected) are never retried.
///
/// Parité web `isRetryableCallFailure` and Android `CallRetryPolicy` — one rule,
/// three platforms.
nonisolated enum CallRetryPolicy {
    static func isRetryable(_ reason: CallEndReason) -> Bool {
        switch reason {
        case .failed, .connectionLost: return true
        case .local, .remote, .missed, .rejected: return false
        }
    }
}
