import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Call Reliability Policy (§5.8)

/// Pure, stateless reliability decisions for the call FSM. Extracted so the
/// half-open self-heal and the `.connecting` watchdog can be unit-tested without
/// a live `RTCPeerConnection` or device. `CallManager` owns the timers and the
/// side effects (ICE restart, end-call); this type owns only the *decision*.
nonisolated enum CallReliabilityPolicy {

    /// EXIGENCE №1 — degraded-signaling indicator. The media path (P2P
    /// DTLS-SRTP) is decoupled from the signaling socket: a socket drop during
    /// an established call never tears it down (no listener has that power —
    /// re-join/resync happens on `didReconnect`). This policy only drives the
    /// discreet in-call hint that signaling operations (media toggles, hangup
    /// relay, ICE relay) are deferred until the socket returns.
    static func signalingDegraded(callEstablished: Bool, socketConnected: Bool) -> Bool {
        callEstablished && !socketConnected
    }

    /// §5.8 — half-open media detection. We keep `.connected` immediately on
    /// `RTCPeerConnectionState.connected` for snappy UX, but a real half-open
    /// path (we send RTP, the peer's RTP never arrives) is silent audio. After a
    /// grace window we self-heal with exactly one ICE restart.
    enum HalfOpenOutcome: Equatable {
        case healthy        // bidirectional RTP confirmed — stop monitoring
        case waiting        // not enough evidence yet — keep polling
        case healHalfOpen   // outbound flowing, inbound stalled → ICE restart
    }

    static func evaluateHalfOpen(
        inboundPackets: Int,
        outboundPackets: Int,
        secondsInConnected: TimeInterval,
        requiredInboundPackets: Int = QualityThresholds.rtpGateRequiredPackets,
        graceSeconds: TimeInterval = QualityThresholds.halfOpenHealGraceSeconds
    ) -> HalfOpenOutcome {
        if inboundPackets >= requiredInboundPackets { return .healthy }
        // Below the inbound threshold. Within the grace window the first second
        // after ICE/DTLS is legitimately packet-free — keep waiting.
        guard secondsInConnected >= graceSeconds else { return .waiting }
        // Past grace, still no inbound. Only a true *half-open* (we ARE sending)
        // warrants an ICE restart; if we're not sending either it's a mute /
        // mic-off business condition, not a transport fault — keep waiting.
        return outboundPackets > 0 ? .healHalfOpen : .waiting
    }

    /// §5.8 / bug h — `.connecting` watchdog. ICE/DTLS can wedge with `.connected`
    /// never arriving. We give it a budget, try ONE ICE restart, then fail rather
    /// than spin forever (the old code only guarded `.ringing`).
    enum ConnectingOutcome: Equatable {
        case waiting
        case restartICE
        case fail
    }

    static func evaluateConnecting(
        secondsInConnecting: TimeInterval,
        didAttemptRestart: Bool,
        restartAfterSeconds: TimeInterval = QualityThresholds.connectingRestartSeconds,
        failAfterSeconds: TimeInterval = QualityThresholds.connectingFailSeconds,
        awaitingRemoteOffer: Bool = false
    ) -> ConnectingOutcome {
        if awaitingRemoteOffer { return .waiting } // le minuteur d'offre tient cette phase
        if secondsInConnecting >= failAfterSeconds { return .fail }
        if secondsInConnecting >= restartAfterSeconds && !didAttemptRestart { return .restartICE }
        return .waiting
    }

    /// `.reconnecting` watchdog. `attemptReconnection` self-limits at
    /// `maxReconnectAttempts`, but it is only re-armed by a *fresh* signal — a new
    /// `RTCPeerConnectionState` callback, a network-path flap, or a nil ICE-restart
    /// offer. When an ICE restart is sent and then silently stalls (peer never
    /// answers, transport wedged with no new state transition), none of those fire,
    /// the attempt counter never advances, and the call hangs in `.reconnecting`
    /// forever. This watchdog gives each attempt a budget; once it overruns we
    /// escalate (`.retry` → `attemptReconnection`), which advances the counter and
    /// eventually trips the cap → `.connectionLost`. Symmetric to the `.connecting`
    /// watchdog, for the post-`.connected` reconnection path.
    enum ReconnectingOutcome: Equatable {
        case waiting
        case retry
    }

    static func evaluateReconnecting(
        secondsInAttempt: TimeInterval,
        budgetSeconds: TimeInterval = QualityThresholds.reconnectAttemptBudgetSeconds
    ) -> ReconnectingOutcome {
        secondsInAttempt >= budgetSeconds ? .retry : .waiting
    }

    /// Exponential backoff before the next ICE-restart reconnect attempt,
    /// jittered around the deterministic base. A shared network event (a cell
    /// tower handoff, a regional TURN outage) puts every affected call through
    /// this same formula on the same schedule — without jitter they'd all
    /// re-hit the TURN allocation endpoint in lockstep, the exact thundering
    /// herd jitter exists to prevent. `unitRandom` must be in `[0, 1)`; callers
    /// pass `Double.random(in: 0..<1)` in production and a fixed value in
    /// tests so the result stays deterministic and testable.
    static func reconnectBackoffSeconds(
        attempt: Int,
        unitRandom: Double,
        cap: TimeInterval = 4.0,
        jitterFraction: Double = 0.15
    ) -> TimeInterval {
        guard attempt > 1 else { return 0.0 }
        let base = min(pow(2.0, Double(attempt - 1)), cap)
        let jitter = base * jitterFraction * (unitRandom * 2 - 1)
        return max(0.0, base + jitter)
    }

    /// Reconnection-trigger arbitration. Reconnection is requested from several
    /// independent sources: NWPathMonitor edges (path lost / restored / interface
    /// handoff), the PC-state delegate, the watchdogs, and the ICE-restart
    /// failure path. Without arbitration a single network blip fires several of
    /// them back-to-back and each advances `reconnectAttempt` — the
    /// `maxReconnectAttempts` budget is spent on redundant trigger *edges*
    /// instead of reconnection *cycles*, and a call that would survive a 1-2s
    /// hiccup drops with `.connectionLost`.
    enum ReconnectTriggerOutcome: Equatable {
        case startCycle   // not reconnecting yet — begin a cycle (advance budget)
        case coalesce     // cycle in flight — re-arm its ICE restart, do NOT advance
        case escalate     // watchdog overrun / failed restart — advance budget
    }

    static func evaluateReconnectTrigger(
        isAlreadyReconnecting: Bool,
        isEscalation: Bool
    ) -> ReconnectTriggerOutcome {
        if isEscalation { return .escalate }
        return isAlreadyReconnecting ? .coalesce : .startCycle
    }

    /// FSM §3.2 invariant — `.reconnecting` is reserved for calls whose media
    /// negotiation has begun (remote description applied): `.connected`,
    /// `.reconnecting`, and `.connecting` (answer received, ICE in flight).
    /// Before the answer (.ringing/.offering) an ICE restart is semantically
    /// impossible — no remote description exists — and flipping the state made
    /// CallView render the connected layout (frozen 00:00 timer) while the
    /// callee was still ringing. Same for a callee answered before the offer (`awaitingRemoteOffer`).
    static func reconnectingAllowed(from state: CallState, awaitingRemoteOffer: Bool = false) -> Bool {
        if awaitingRemoteOffer, case .connecting = state { return false }
        switch state {
        case .connected, .reconnecting, .connecting: return true
        case .idle, .ringing, .offering, .ended: return false
        }
    }

    /// Duration-clock decision at the `.connected` transition. Reset on a fresh
    /// connect AND on a first-ever connect that transited through
    /// `.reconnecting` (pre-establishment ICE restart) — `durationTask` dies on
    /// a nil `callStartDate`, so skipping the reset froze the timer at 00:00.
    /// Preserve only on a genuine mid-call reconnect (running clock exists).
    static func shouldResetCallClock(wasReconnecting: Bool, hasExistingStartDate: Bool) -> Bool {
        !wasReconnecting || !hasExistingStartDate
    }

    /// Seconds after quality-monitor start during which the BWE signal is
    /// ignored: GCC ramps from its conservative kick-off estimate (~300 kbps)
    /// and, on a high-RTT intercontinental path (Africa↔Asia, 250-450 ms), needs
    /// ~20-30 s to converge toward true capacity — its additive-increase step is
    /// per-RTT, so a longer round-trip means a slower ramp. Reading the still-
    /// climbing estimate as .fair/.poor flagged a perfectly good call mid-call;
    /// 30 s outlasts a realistic convergence window before min(heuristic, bwe)
    /// is allowed to constrain the level.
    static let bweWarmupSeconds: TimeInterval = 30

    /// Merge policy for the two quality signals (RTT/loss heuristic vs TWCC
    /// GCC bandwidth estimate). The BWE ladder is calibrated against VIDEO
    /// tier bitrates (poor < 400 kbps): on an audio-only call GCC never
    /// probes above the ~64 kbps the Opus encoder asks for, so every audio
    /// call read as .poor/.critical for its whole duration (prod analytics
    /// 2026-07-03: RTT 7 ms, 0 % loss, still "poor"). The BWE signal only
    /// constrains the level when video is actually being sent AND the
    /// estimator has had time to converge; the RTT/loss heuristic is never
    /// gated.
    static func effectiveQualityLevel(
        heuristic: VideoQualityLevel,
        bwe: VideoQualityLevel?,
        isSendingVideo: Bool,
        secondsSinceMonitorStart: TimeInterval
    ) -> VideoQualityLevel {
        guard isSendingVideo,
              secondsSinceMonitorStart >= bweWarmupSeconds,
              let bwe else { return heuristic }
        return min(heuristic, bwe)
    }

    /// Quality distribution for the analytics payload — PURE: the currently
    /// open level window (since the last level change) is folded in
    /// virtually, the accumulator is never mutated. This lets the same code
    /// serve the periodic in-call snapshots AND the final teardown emit.
    /// `critical` merges into `poor` (the payload contract has 4 buckets);
    /// an empty call (never connected / no samples) reads as fully excellent;
    /// clock skew (window start in the future) contributes zero, never
    /// negative time.
    static func qualityDistribution(
        accumulatedSeconds: [VideoQualityLevel: Double],
        openWindowLevel: VideoQualityLevel?,
        openWindowSince: Date?,
        now: Date
    ) -> [String: Double] {
        var seconds = accumulatedSeconds
        if let level = openWindowLevel, let since = openWindowSince {
            seconds[level, default: 0] += max(0, now.timeIntervalSince(since))
        }
        let total = seconds.values.reduce(0, +)
        guard total > 0 else {
            return ["excellent": 1.0, "good": 0.0, "fair": 0.0, "poor": 0.0]
        }
        return [
            "excellent": (seconds[.excellent] ?? 0) / total,
            "good": (seconds[.good] ?? 0) / total,
            "fair": (seconds[.fair] ?? 0) / total,
            "poor": ((seconds[.poor] ?? 0) + (seconds[.critical] ?? 0)) / total
        ]
    }

    /// Ring/negotiation split for the end-of-call analytics. `setupTimeMs`
    /// (initiated → connected) includes the HUMAN ringing time — 23 s observed
    /// in prod, useless for spotting a WebRTC setup regression.
    /// `negotiationTimeMs` (answer/join → connected) isolates the technical
    /// part. Pure: -1 whenever an anchor is missing — never a lying 0.
    static func callSetupMetrics(
        initiatedAt: Date?,
        negotiationStartAt: Date?,
        connectedAt: Date?
    ) -> (setupTimeMs: Int, negotiationTimeMs: Int) {
        guard let connectedAt else { return (-1, -1) }
        let setup = initiatedAt.map { Int(connectedAt.timeIntervalSince($0) * 1000) } ?? -1
        let negotiation = negotiationStartAt.map { Int(connectedAt.timeIntervalSince($0) * 1000) } ?? -1
        return (setup, negotiation)
    }

    /// Gate for the `call_cancel` silent push (phantom-ring hardening): the
    /// gateway sends it when a call ends WITHOUT ever being answered, aimed
    /// at devices whose socket never came up (VoIP push delivered, WebSocket
    /// blocked). It may ONLY kill a still-ringing INCOMING call whose callId
    /// matches — a late/replayed cancel must never end a connected call, an
    /// outgoing ring, or an unrelated call.
    static func shouldEndRingingOnCancellation(
        pushCallId: String,
        currentCallId: String?,
        callState: CallState
    ) -> Bool {
        guard pushCallId == currentCallId else { return false }
        guard case .ringing(isOutgoing: false) = callState else { return false }
        return true
    }

    /// Idempotence guard for `handleRemoteEnd` (a `call:ended` fanout). The
    /// gateway can emit `call:ended` more than once for the same call — the
    /// native hangup/reject path AND (2026-07-12) the REST DELETE end/leave
    /// broadcast both reach the handler through the single `callEnded`
    /// publisher. Process the first, drop the rest: a duplicate while already
    /// `.ended` is a no-op, and an event for a DIFFERENT call must never tear
    /// down the current one. A `call:ended` during the ring (remote cancel)
    /// still processes — only a terminal `.ended` state is deduplicated.
    static func shouldProcessRemoteEnd(
        currentCallId: String?,
        incomingCallId: String,
        callState: CallState
    ) -> Bool {
        guard incomingCallId == currentCallId else { return false }
        if case .ended = callState { return false }
        return true
    }

    /// Delay before the periodic TURN credential refresh, at 80% of the TTL.
    /// A degenerate TTL (zero, negative, or shorter than the floor) clamps to
    /// `minimumDelay` instead of disarming the refresh — silently skipping it
    /// would let mid-call TURN credentials expire and kill relayed calls at the
    /// credential horizon (coturn rejects allocation refreshes past the expiry
    /// embedded in the username).
    static func turnRefreshDelay(
        ttl: TimeInterval,
        minimumDelay: TimeInterval = QualityThresholds.turnMinRefreshDelaySeconds
    ) -> TimeInterval {
        max(minimumDelay, ttl * 0.8)
    }

    /// Whether a TURN refresh watchdog should retry the `call:request-ice-servers`
    /// emit after `attempt` retries with no `call:ice-servers-refreshed` response.
    /// `emitRequestIceServers` carries no ACK, so a single dropped emit or reply
    /// must not silently disarm the refresh for the rest of the call — but the
    /// retries are bounded so a persistently unreachable gateway doesn't spin
    /// forever inside one cycle (the periodic scheduler re-arms the next cycle
    /// once retries are exhausted).
    static func turnRefreshShouldRetry(
        attempt: Int,
        maxRetries: Int = QualityThresholds.turnRefreshMaxRetries
    ) -> Bool {
        attempt < maxRetries
    }

    /// Stuck-muted CallKit fallback gate. On iPhone/iPad,
    /// `RTCAudioSession.isAudioEnabled` is flipped ONLY by `provider:didActivate:`.
    /// If CallKit never delivers it, the call sits `.connected` with dead mic and
    /// speaker and no safety net (the half-open detector keys off RTP counters,
    /// which comfort-noise/DTX packets keep non-zero). Force activation only in
    /// that exact stuck state — never when CallKit did its job, never on Mac
    /// (which self-activates in `transitionToConnected`), never after the call
    /// ended.
    static func shouldForceAudioSessionActivation(
        usesCallKit: Bool,
        didActivateFired: Bool,
        isAudioEnabled: Bool,
        callIsActive: Bool
    ) -> Bool {
        usesCallKit && callIsActive && !didActivateFired && !isAudioEnabled
    }

    /// Whether the platform's CallKit stack can actually drive a call.
    /// Three cases must run calls entirely in-app instead:
    /// - iOS-app-on-Mac: `reportNewIncomingCall` fails (error 3) and
    ///   `provider:didActivate:` never fires — CallKit half-succeeds then
    ///   leaves a stuck "call in progress".
    /// - Simulator: `provider:didActivate:` never fires either, and
    ///   callservicesd autonomously sends `CXEndCallAction` ~3s after an
    ///   outgoing start, killing the call while still `.ringing`.
    /// - China region (Guideline 5 / MIIT): Apple requires CallKit inactive
    ///   in China. VoIPPushManager never registers for PushKit VoIP there
    ///   (the OS-enforced source of forced CallKit activation), so this gate
    ///   only needs to cover the foreground socket-delivered path — see
    ///   VoIPPushManager.shouldRegisterVoIPPush for the background half.
    /// All three take the `[AUDIO_FALLBACK]` self-activation path in
    /// `transitionToConnected`.
    static func platformUsesCallKit(isiOSAppOnMac: Bool, isSimulator: Bool, isChinaRegion: Bool) -> Bool {
        !isiOSAppOnMac && !isSimulator && !isChinaRegion
    }

    /// Whether the call UI must render the video layout. True as soon as ANY
    /// stream is visible: the local camera, or the peer's camera during a
    /// unilateral escalation of an audio call (renegotiation delivers the
    /// remote track while `localVideoEnabled` stays false). Gating the layout
    /// on the local camera alone leaves the incoming H264 stream decoded but
    /// never rendered.
    static func videoLayoutActive(
        localVideoEnabled: Bool,
        hasRemoteVideoTrack: Bool,
        remoteVideoEnabled: Bool
    ) -> Bool {
        localVideoEnabled || (hasRemoteVideoTrack && remoteVideoEnabled)
    }
}
