import Foundation

/// Half-open detection state across connection epochs.
///
/// Replaces the poll-loop-local `halfOpenSettled` bool, which had two defects:
/// 1. It was only reset when the loop *observed* `.reconnecting`; a reconnection
///    cycle completing between two poll ticks left it `true` for the rest of the
///    call (self-heal frozen).
/// 2. Re-arming compared *cumulative* RTP counters against the threshold, so a
///    post-restart half-open was instantly declared `.healthy` on the strength
///    of pre-restart traffic.
///
/// The owner bumps `connectionEpoch` on every `transitionToConnected`; this
/// state re-arms itself whenever the epoch changes, snapshots the counters as
/// the epoch baseline, and evaluates per-epoch *deltas*. Returns `nil` once the
/// epoch has settled (healthy confirmed or the self-heal fired).
///
/// #8270 — the self-heal is ONE per call, not one per epoch. Once `.connected`
/// is caught up by level after an ICE restart, a peer that never sends RTP
/// (its audio unit stopped) would otherwise loop heal → reconnect → catch-up
/// every few seconds. After the heal is spent, a stalled epoch keeps
/// `.waiting` (and still reports `.healthy` if media shows up).
nonisolated struct HalfOpenMonitorState {
    private var observedEpoch = Int.min
    private var settled = false
    private var epochStart = Date.distantPast
    private var baselineInbound = 0
    private var baselineOutbound = 0
    private var healSpent = false

    /// Cheap pre-check so the poll loop can skip the (relatively expensive)
    /// WebRTC stats fetch once the current epoch has settled.
    func needsEvaluation(epoch: Int) -> Bool {
        epoch != observedEpoch || !settled
    }

    mutating func evaluate(
        epoch: Int,
        inboundPackets: Int,
        outboundPackets: Int,
        now: Date = Date(),
        requiredInboundPackets: Int = QualityThresholds.rtpGateRequiredPackets,
        graceSeconds: TimeInterval = QualityThresholds.halfOpenHealGraceSeconds
    ) -> CallReliabilityPolicy.HalfOpenOutcome? {
        if epoch != observedEpoch {
            observedEpoch = epoch
            settled = false
            epochStart = now
            baselineInbound = inboundPackets
            baselineOutbound = outboundPackets
        }
        guard !settled else { return nil }
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: inboundPackets - baselineInbound,
            outboundPackets: outboundPackets - baselineOutbound,
            secondsInConnected: now.timeIntervalSince(epochStart),
            requiredInboundPackets: requiredInboundPackets,
            graceSeconds: graceSeconds
        )
        switch outcome {
        case .healthy:
            settled = true
            return .healthy
        case .healHalfOpen where healSpent:
            return .waiting
        case .healHalfOpen:
            settled = true
            healSpent = true
            return .healHalfOpen
        case .waiting:
            return .waiting
        }
    }
}
