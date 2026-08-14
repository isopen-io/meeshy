import Foundation

/// Whether a `connect()` attempt left a live transport behind.
///
/// This matters because the socket managers tear the previous socket down
/// *before* trying to build a replacement (`forceReconnect()` →
/// `suspendTransport()` → `connect()`), and `suspendTransport()` also destroys
/// Socket.IO's own infinite retry loop. So a connect attempt that returns
/// without building anything is not a no-op: it leaves the app with no
/// transport AND no retry loop. The caller has to notice and arm the backoff
/// ladder itself — nothing else will.
enum SocketConnectOutcome: Equatable, Sendable {
    /// A socket exists (freshly built, or already connected/connecting).
    /// Socket.IO's retry loop owns recovery from here.
    case armed
    /// No transport was built — missing or expired token, or no base URL.
    /// The caller MUST schedule a retry.
    case notArmed
}

/// Exponential-backoff ladder for socket reconnection, extracted from the
/// socket managers so the schedule is unit-testable without driving a live
/// socket (same idiom as `handleConnectionEstablished`).
///
/// It restores two contracts the previous inline implementation did not hold:
///
/// 1. **The ceiling is a ceiling.** The old code capped the ladder *before*
///    applying jitter — `min(delay, 60) * (0.8...1.2)` — so any jitter draw
///    above 1.0 produced up to 72s, while the comment directly above it claimed
///    the cap made exceeding 60s impossible. Jitter is applied first here and
///    the cap last, so the documented maximum is the real maximum.
///
/// 2. **Backoff counts failed attempts, not outages.** The ladder must climb
///    once per attempt that failed to establish a transport, and reset on any
///    fresh positive signal — a connection landing, or the network coming back.
///    The old ladder grew once per network *restore* and reset only on a
///    successful connection, which is backwards: it charged the user for a
///    flaky link, so after a handful of tunnel transits the next reconnect was
///    already deferred a full minute at the exact moment connectivity returned.
struct SocketReconnectBackoff: Equatable, Sendable {
    /// First rung — a reconnect that follows a fresh positive signal is near-immediate.
    static let floor: TimeInterval = 1
    /// Hard maximum for any delay this ladder returns, jitter included.
    static let ceiling: TimeInterval = 60

    /// Number of rungs consumed since the last `reset()`. Logging/diagnostics only.
    private(set) var attempt: Int = 0
    private var delay: TimeInterval = SocketReconnectBackoff.floor

    /// Consumes one rung: returns how long to wait before the next attempt, and
    /// advances the ladder so the attempt after that waits longer.
    ///
    /// `jitter` is injected rather than drawn inside so the schedule is
    /// deterministic under test; production passes `randomJitter()`.
    ///
    /// The result is always within `0...ceiling`.
    mutating func nextDelay(jitter: Double) -> TimeInterval {
        let jittered = delay * max(jitter, 0)
        let bounded = min(jittered, Self.ceiling)
        attempt += 1
        delay = min(delay * 2, Self.ceiling)
        return bounded
    }

    /// A fresh positive signal — a connection was established, or the network
    /// came back. The next attempt starts from the floor again.
    mutating func reset() {
        attempt = 0
        delay = Self.floor
    }

    /// Spread concurrent clients so a server coming back up is not hit by a
    /// synchronised wave. ±20% around the current rung.
    static func randomJitter() -> Double {
        0.8 + Double.random(in: 0...0.4)
    }
}
