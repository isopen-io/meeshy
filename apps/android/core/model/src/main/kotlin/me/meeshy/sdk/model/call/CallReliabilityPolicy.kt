package me.meeshy.sdk.model.call

/**
 * The self-heal decision a half-open media check yields. Port of iOS
 * `CallReliabilityPolicy.HalfOpenOutcome` (`WebRTCTypes.swift`).
 */
enum class HalfOpenOutcome {
    /** Bidirectional RTP confirmed — stop monitoring. */
    Healthy,

    /** Not enough evidence yet — keep polling. */
    Waiting,

    /** Outbound flowing but inbound stalled → trigger exactly one ICE restart. */
    HealHalfOpen,
}

/**
 * The `.connecting` watchdog verdict. Port of iOS
 * `CallReliabilityPolicy.ConnectingOutcome`.
 */
enum class ConnectingOutcome {
    /** Still inside the budget — keep waiting for `.connected`. */
    Waiting,

    /** Budget for a first attempt elapsed — try one ICE restart. */
    RestartIce,

    /** Total budget elapsed — fail the call rather than spin forever. */
    Fail,
}

/**
 * The `.reconnecting` watchdog verdict. Port of iOS
 * `CallReliabilityPolicy.ReconnectingOutcome`.
 */
enum class ReconnectingOutcome {
    /** Attempt still inside its budget. */
    Waiting,

    /** Attempt overran — escalate (advances the reconnect counter). */
    Retry,
}

/**
 * Reconnection-trigger arbitration verdict. Port of iOS
 * `CallReliabilityPolicy.ReconnectTriggerOutcome`.
 */
enum class ReconnectTriggerOutcome {
    /** Not reconnecting yet — begin a cycle (advance the attempt budget). */
    StartCycle,

    /** A cycle is already in flight — re-arm its ICE restart, do NOT advance. */
    Coalesce,

    /** Watchdog overrun / failed restart — advance the attempt budget. */
    Escalate,
}

/**
 * Pure, total, side-effect-free reliability decisions for a 1:1 call — the
 * Android SSOT ported from iOS `CallReliabilityPolicy`
 * (`Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`).
 *
 * Every function is a deterministic pure function of its arguments, so the
 * ICE-restart reconnection story (network-change recovery, half-open self-heal,
 * connect/reconnect watchdogs, trigger coalescing) is fully JVM-testable without
 * a live `PeerConnection`. The app-side actuator (`WebRtcEngine` state callbacks,
 * `NetworkCallback` path edges, the watchdog timers) reads these verdicts and
 * performs the side effects; the *decisions* live here.
 *
 * All time budgets are enforced with `>=` (a value exactly on the budget has
 * elapsed), matching iOS; the RTP inbound gate uses `>=` and the half-open
 * "still sending" gate uses a strict `> 0`, both faithful to iOS.
 */
object CallReliabilityPolicy {

    /**
     * Degraded-signaling indicator. The media path (P2P DTLS-SRTP) is decoupled
     * from the signaling socket: a socket drop during an established call never
     * tears it down. This only drives the discreet in-call hint that signaling
     * operations (media toggles, hangup relay, ICE relay) are deferred until the
     * socket returns. Parity with iOS `signalingDegraded`.
     */
    fun signalingDegraded(callEstablished: Boolean, socketConnected: Boolean): Boolean =
        callEstablished && !socketConnected

    /**
     * Half-open media detection. We keep `.connected` immediately for snappy UX,
     * but a true half-open path (we send RTP, the peer's RTP never arrives) is
     * silent audio; after a grace window we self-heal with exactly one ICE
     * restart. If we are not sending either it is a mute / mic-off business
     * condition, not a transport fault — keep waiting. Parity with iOS
     * `evaluateHalfOpen`.
     */
    fun evaluateHalfOpen(
        inboundPackets: Int,
        outboundPackets: Int,
        secondsInConnected: Double,
        requiredInboundPackets: Int = CallQualityThresholds.RTP_GATE_REQUIRED_PACKETS,
        graceSeconds: Double = CallQualityThresholds.HALF_OPEN_HEAL_GRACE_SECONDS,
    ): HalfOpenOutcome {
        if (inboundPackets >= requiredInboundPackets) return HalfOpenOutcome.Healthy
        if (secondsInConnected < graceSeconds) return HalfOpenOutcome.Waiting
        return if (outboundPackets > 0) HalfOpenOutcome.HealHalfOpen else HalfOpenOutcome.Waiting
    }

    /**
     * `.connecting` watchdog. ICE/DTLS can wedge with `.connected` never
     * arriving; give it a budget, try ONE ICE restart, then fail rather than
     * spin forever. The fail budget takes priority over the restart budget.
     * Parity with iOS `evaluateConnecting`.
     */
    fun evaluateConnecting(
        secondsInConnecting: Double,
        didAttemptRestart: Boolean,
        restartAfterSeconds: Double = CallQualityThresholds.CONNECTING_RESTART_SECONDS,
        failAfterSeconds: Double = CallQualityThresholds.CONNECTING_FAIL_SECONDS,
    ): ConnectingOutcome {
        if (secondsInConnecting >= failAfterSeconds) return ConnectingOutcome.Fail
        if (secondsInConnecting >= restartAfterSeconds && !didAttemptRestart) return ConnectingOutcome.RestartIce
        return ConnectingOutcome.Waiting
    }

    /**
     * `.reconnecting` watchdog. When an ICE restart is sent and silently stalls,
     * no fresh signal re-arms the attempt, so the call would hang in
     * `.reconnecting` forever; once the attempt overruns its budget we escalate,
     * which advances the counter and eventually trips the cap → connection lost.
     * Parity with iOS `evaluateReconnecting`.
     */
    fun evaluateReconnecting(
        secondsInAttempt: Double,
        budgetSeconds: Double = CallQualityThresholds.RECONNECT_ATTEMPT_BUDGET_SECONDS,
    ): ReconnectingOutcome =
        if (secondsInAttempt >= budgetSeconds) ReconnectingOutcome.Retry else ReconnectingOutcome.Waiting

    /**
     * Reconnection-trigger arbitration. Reconnection is requested from several
     * independent sources (network-path edges, PC-state callbacks, watchdogs, the
     * ICE-restart failure path). Without arbitration a single blip fires several
     * of them back-to-back and each advances the attempt counter — the budget is
     * spent on redundant trigger *edges* instead of reconnection *cycles*, and a
     * call that would survive a 1–2 s hiccup drops. Parity with iOS
     * `evaluateReconnectTrigger`.
     */
    fun evaluateReconnectTrigger(
        isAlreadyReconnecting: Boolean,
        isEscalation: Boolean,
    ): ReconnectTriggerOutcome {
        if (isEscalation) return ReconnectTriggerOutcome.Escalate
        return if (isAlreadyReconnecting) ReconnectTriggerOutcome.Coalesce else ReconnectTriggerOutcome.StartCycle
    }

    /**
     * FSM invariant — `.reconnecting` is reserved for calls whose media
     * negotiation has begun: [CallState.Connected], [CallState.Reconnecting], and
     * [CallState.Connecting] (answer received, ICE in flight). Before the answer
     * ([CallState.Ringing]/[CallState.Offering]) an ICE restart is semantically
     * impossible — no remote description exists. Parity with iOS
     * `reconnectingAllowed`.
     */
    fun reconnectingAllowed(state: CallState): Boolean =
        when (state) {
            is CallState.Connected, is CallState.Reconnecting, is CallState.Connecting -> true
            is CallState.Idle, is CallState.Ringing, is CallState.Offering, is CallState.Ended -> false
        }

    /**
     * A mid-reconnect TURN-credential refresh should re-arm the in-flight
     * attempt's ICE restart the moment the fresh credentials land, removing the
     * dead window before the `.reconnecting` watchdog would otherwise escalate.
     * On every other phase the refresh stays inert by design. Parity with iOS
     * `shouldRearmRestartOnCredentialRefresh`.
     */
    fun shouldRearmRestartOnCredentialRefresh(state: CallState): Boolean =
        when (state) {
            is CallState.Reconnecting -> true
            is CallState.Idle,
            is CallState.Ringing,
            is CallState.Offering,
            is CallState.Connecting,
            is CallState.Connected,
            is CallState.Ended,
            -> false
        }

    /**
     * Duration-clock decision at the `.connected` transition. Reset on a fresh
     * connect AND on a first-ever connect that transited through `.reconnecting`
     * (a pre-establishment ICE restart) — the duration clock dies on a missing
     * start date, so skipping the reset would freeze the timer at 00:00. Preserve
     * only on a genuine mid-call reconnect (a running clock already exists).
     * Parity with iOS `shouldResetCallClock`.
     */
    fun shouldResetCallClock(wasReconnecting: Boolean, hasExistingStartDate: Boolean): Boolean =
        !wasReconnecting || !hasExistingStartDate
}
