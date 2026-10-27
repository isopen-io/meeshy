import Foundation

/// The clocks of `CallManager.startReliabilityMonitor` (#11522): one value per
/// monitor run, advanced once per poll tick for the state the call is in.
///
/// - `.connecting`: the ICE/DTLS clock starts once the remote offer is in hand
///   (an awaited offer restarts it — the offer timeout owns that phase), gets
///   ONE ICE restart, then fails.
/// - `.reconnecting(attempt)`: each attempt has its own budget; a new attempt
///   restarts the clock.
/// - `.connected`: the half-open detection keyed off `connectionEpoch`.
/// - `.offering` / `.connected` reset everything; any other state only drops
///   the clocks (the spent connecting restart stays spent, as it always did).
///
/// Pure: the monitor feeds it `now` and applies the verdicts (catch-up, ICE
/// restart, failure) itself, in the same order as before the extraction.
nonisolated struct CallReliabilityWatchdog {
    private(set) var connectingSince: Date?
    private(set) var didAttemptConnectingRestart = false
    private(set) var reconnectingSince: Date?
    private(set) var reconnectingWatchedAttempt: Int?
    var halfOpenMonitor = HalfOpenMonitorState()

    enum ConnectingStep: Equatable {
        case waiting
        case restartICE(elapsed: TimeInterval)
        case fail(elapsed: TimeInterval)
    }

    enum ReconnectingStep: Equatable {
        case waiting
        case stalled(elapsed: TimeInterval)
    }

    mutating func offering() {
        connectingCaughtUp()
        reconnectingResolved()
    }

    mutating func connected() {
        connectingCaughtUp()
        reconnectingResolved()
    }

    mutating func otherState() {
        connectingSince = nil
        reconnectingResolved()
    }

    mutating func connectingCaughtUp() {
        connectingSince = nil
        didAttemptConnectingRestart = false
    }

    mutating func reconnectingResolved() {
        reconnectingSince = nil
        reconnectingWatchedAttempt = nil
    }

    /// One `.connecting` tick, after the caller's level catch-up did not fire.
    mutating func connecting(
        now: Date,
        failAfterSeconds: TimeInterval,
        awaitingRemoteOffer: Bool
    ) -> ConnectingStep {
        reconnectingResolved()
        if awaitingRemoteOffer {
            connectingCaughtUp()
            return .waiting
        }
        let since = connectingSince ?? now
        connectingSince = since
        let elapsed = now.timeIntervalSince(since)
        switch CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: elapsed,
            didAttemptRestart: didAttemptConnectingRestart,
            failAfterSeconds: failAfterSeconds,
            awaitingRemoteOffer: awaitingRemoteOffer
        ) {
        case .waiting:
            return .waiting
        case .restartICE:
            didAttemptConnectingRestart = true
            return .restartICE(elapsed: elapsed)
        case .fail:
            return .fail(elapsed: elapsed)
        }
    }

    /// One `.reconnecting(attempt)` tick.
    mutating func reconnecting(attempt: Int, now: Date) -> ReconnectingStep {
        connectingCaughtUp()
        if attempt != reconnectingWatchedAttempt {
            reconnectingWatchedAttempt = attempt
            reconnectingSince = now
        }
        let since = reconnectingSince ?? now
        reconnectingSince = since
        let elapsed = now.timeIntervalSince(since)
        switch CallReliabilityPolicy.evaluateReconnecting(secondsInAttempt: elapsed) {
        case .waiting: return .waiting
        case .retry: return .stalled(elapsed: elapsed)
        }
    }
}
