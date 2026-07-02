import XCTest
@testable import Meeshy

// MARK: - Reconnect trigger arbitration

/// Reconnection is requested from several independent sources: NWPathMonitor
/// edges (path lost / restored / interface handoff), the PC-state delegate,
/// the watchdogs, and the ICE-restart failure path. Without arbitration, a
/// single network blip fires several of them back-to-back and each advances
/// `reconnectAttempt` — the 3-attempt budget is spent on redundant trigger
/// *edges* instead of reconnection *cycles*, and a call that would survive a
/// 1-2s hiccup drops with `.connectionLost`.
@MainActor
final class ReconnectTriggerPolicyTests: XCTestCase {

    func test_evaluateReconnectTrigger_notReconnecting_startsCycle() {
        let outcome = CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting: false,
            isEscalation: false
        )
        XCTAssertEqual(outcome, .startCycle)
    }

    func test_evaluateReconnectTrigger_alreadyReconnecting_coalesces() {
        // Redundant edge of the same outage (e.g. path-restored right after
        // path-lost): must NOT burn budget.
        let outcome = CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting: true,
            isEscalation: false
        )
        XCTAssertEqual(outcome, .coalesce)
    }

    func test_evaluateReconnectTrigger_escalationWhileReconnecting_escalates() {
        // The `.reconnecting` watchdog and a failed ICE-restart offer are the
        // only callers allowed to advance the budget mid-cycle.
        let outcome = CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting: true,
            isEscalation: true
        )
        XCTAssertEqual(outcome, .escalate)
    }

    func test_evaluateReconnectTrigger_escalationOutsideReconnecting_escalates() {
        let outcome = CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting: false,
            isEscalation: true
        )
        XCTAssertEqual(outcome, .escalate)
    }
}

// MARK: - TURN refresh delay

/// A degenerate TTL from the gateway must clamp to the minimum refresh cadence,
/// not silently disarm the periodic refresh (which would let mid-call TURN
/// credentials expire and kill relayed calls at the credential horizon).
@MainActor
final class TurnRefreshDelayPolicyTests: XCTestCase {

    func test_turnRefreshDelay_nominalTTL_is80Percent() {
        XCTAssertEqual(
            CallReliabilityPolicy.turnRefreshDelay(ttl: 480, minimumDelay: 30),
            384
        )
    }

    func test_turnRefreshDelay_zeroTTL_clampsToMinimum() {
        XCTAssertEqual(
            CallReliabilityPolicy.turnRefreshDelay(ttl: 0, minimumDelay: 30),
            30
        )
    }

    func test_turnRefreshDelay_negativeTTL_clampsToMinimum() {
        XCTAssertEqual(
            CallReliabilityPolicy.turnRefreshDelay(ttl: -10, minimumDelay: 30),
            30
        )
    }

    func test_turnRefreshDelay_shortTTL_clampsToMinimum() {
        // 30s TTL → 24s at 80%, below the 30s floor.
        XCTAssertEqual(
            CallReliabilityPolicy.turnRefreshDelay(ttl: 30, minimumDelay: 30),
            30
        )
    }

    func test_turnRefreshDelay_defaultMinimum_matchesThreshold() {
        XCTAssertEqual(
            CallReliabilityPolicy.turnRefreshDelay(ttl: 0),
            QualityThresholds.turnMinRefreshDelaySeconds
        )
    }
}

// MARK: - Half-open monitor across connection epochs

/// Two defects in the old Task-local `halfOpenSettled` bool:
/// 1. It was only reset when the poll loop *observed* `.reconnecting`; a cycle
///    completing between two 2s ticks left it `true` for the rest of the call
///    (self-heal frozen).
/// 2. Re-arming compared *cumulative* RTP counters against the threshold, so a
///    post-restart half-open was instantly declared `.healthy` from pre-restart
///    traffic.
/// `HalfOpenMonitorState` keys off an explicit connection epoch and evaluates
/// per-epoch packet *deltas*.
@MainActor
final class HalfOpenMonitorStateTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    func test_evaluate_firstTick_capturesBaseline_returnsWaiting() {
        var state = HalfOpenMonitorState()
        let outcome = state.evaluate(
            epoch: 1, inboundPackets: 5_000, outboundPackets: 8_000,
            now: t0, requiredInboundPackets: 5, graceSeconds: 10
        )
        // Cumulative counters are high but the epoch just started: delta is 0,
        // clock is 0 — must wait, not declare healthy.
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluate_inboundDeltaReachesThreshold_returnsHealthy_thenSettles() {
        var state = HalfOpenMonitorState()
        _ = state.evaluate(
            epoch: 1, inboundPackets: 100, outboundPackets: 100,
            now: t0, requiredInboundPackets: 5, graceSeconds: 10
        )
        let second = state.evaluate(
            epoch: 1, inboundPackets: 105, outboundPackets: 120,
            now: t0.addingTimeInterval(2), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertEqual(second, .healthy)
        let third = state.evaluate(
            epoch: 1, inboundPackets: 0, outboundPackets: 0,
            now: t0.addingTimeInterval(4), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertNil(third, "settled epoch must not re-evaluate")
    }

    func test_evaluate_pastGrace_outboundOnly_returnsHealHalfOpen_thenSettles() {
        var state = HalfOpenMonitorState()
        _ = state.evaluate(
            epoch: 1, inboundPackets: 100, outboundPackets: 100,
            now: t0, requiredInboundPackets: 5, graceSeconds: 10
        )
        let outcome = state.evaluate(
            epoch: 1, inboundPackets: 100, outboundPackets: 500,
            now: t0.addingTimeInterval(12), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertEqual(outcome, .healHalfOpen)
        let after = state.evaluate(
            epoch: 1, inboundPackets: 100, outboundPackets: 900,
            now: t0.addingTimeInterval(14), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertNil(after, "one self-heal per epoch — settled after healing")
    }

    func test_evaluate_epochChange_reArmsWithFreshBaselineAndClock() {
        var state = HalfOpenMonitorState()
        // Epoch 1 settles healthy with high cumulative counters.
        _ = state.evaluate(
            epoch: 1, inboundPackets: 0, outboundPackets: 0,
            now: t0, requiredInboundPackets: 5, graceSeconds: 10
        )
        _ = state.evaluate(
            epoch: 1, inboundPackets: 10_000, outboundPackets: 10_000,
            now: t0.addingTimeInterval(2), requiredInboundPackets: 5, graceSeconds: 10
        )
        // Reconnection completed (epoch 2). Cumulative counters unchanged from
        // pre-restart traffic — the old code would instantly report .healthy.
        let firstTick = state.evaluate(
            epoch: 2, inboundPackets: 10_000, outboundPackets: 10_000,
            now: t0.addingTimeInterval(60), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertEqual(firstTick, .waiting, "epoch change must reset baseline and clock")
        // Past grace within epoch 2: outbound flowing, inbound stalled → heal.
        let healOutcome = state.evaluate(
            epoch: 2, inboundPackets: 10_000, outboundPackets: 10_400,
            now: t0.addingTimeInterval(72), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertEqual(healOutcome, .healHalfOpen,
                       "post-restart half-open must be detected from per-epoch deltas")
    }

    func test_needsEvaluation_freshState_returnsTrue() {
        let state = HalfOpenMonitorState()
        XCTAssertTrue(state.needsEvaluation(epoch: 1))
    }

    func test_needsEvaluation_settledEpoch_returnsFalse_newEpoch_returnsTrue() {
        var state = HalfOpenMonitorState()
        _ = state.evaluate(
            epoch: 1, inboundPackets: 0, outboundPackets: 0,
            now: t0, requiredInboundPackets: 5, graceSeconds: 10
        )
        _ = state.evaluate(
            epoch: 1, inboundPackets: 50, outboundPackets: 50,
            now: t0.addingTimeInterval(2), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertFalse(state.needsEvaluation(epoch: 1),
                       "settled epoch must allow the poll loop to skip getStats")
        XCTAssertTrue(state.needsEvaluation(epoch: 2))
    }

    func test_evaluate_settledEpoch_staysSettledUntilEpochChanges() {
        var state = HalfOpenMonitorState()
        _ = state.evaluate(
            epoch: 1, inboundPackets: 0, outboundPackets: 0,
            now: t0, requiredInboundPackets: 5, graceSeconds: 10
        )
        _ = state.evaluate(
            epoch: 1, inboundPackets: 50, outboundPackets: 50,
            now: t0.addingTimeInterval(2), requiredInboundPackets: 5, graceSeconds: 10
        )
        XCTAssertNil(state.evaluate(
            epoch: 1, inboundPackets: 60, outboundPackets: 60,
            now: t0.addingTimeInterval(30), requiredInboundPackets: 5, graceSeconds: 10
        ))
        XCTAssertNotNil(state.evaluate(
            epoch: 3, inboundPackets: 60, outboundPackets: 60,
            now: t0.addingTimeInterval(32), requiredInboundPackets: 5, graceSeconds: 10
        ), "a new epoch re-arms monitoring")
    }
}

// MARK: - Stuck-muted CallKit fallback

/// On iPhone/iPad, `RTCAudioSession.isAudioEnabled` is flipped ONLY by
/// `provider:didActivate:`. If CallKit never delivers it (rare, observed on
/// some hardware/OS states), the call sits `.connected` with dead mic and
/// speaker and no safety net. The fallback must fire only in that exact
/// stuck state — never when CallKit did its job, never on Mac (which has its
/// own `[AUDIO_FALLBACK]` path), never after the call ended.
@MainActor
final class StuckMutedFallbackPolicyTests: XCTestCase {

    func test_shouldForceAudioSessionActivation_stuckState_returnsTrue() {
        XCTAssertTrue(CallReliabilityPolicy.shouldForceAudioSessionActivation(
            usesCallKit: true, didActivateFired: false,
            isAudioEnabled: false, callIsActive: true
        ))
    }

    func test_shouldForceAudioSessionActivation_didActivateFired_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.shouldForceAudioSessionActivation(
            usesCallKit: true, didActivateFired: true,
            isAudioEnabled: false, callIsActive: true
        ))
    }

    func test_shouldForceAudioSessionActivation_audioAlreadyEnabled_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.shouldForceAudioSessionActivation(
            usesCallKit: true, didActivateFired: false,
            isAudioEnabled: true, callIsActive: true
        ))
    }

    func test_shouldForceAudioSessionActivation_noCallKit_returnsFalse() {
        // Mac path activates manually in transitionToConnected already.
        XCTAssertFalse(CallReliabilityPolicy.shouldForceAudioSessionActivation(
            usesCallKit: false, didActivateFired: false,
            isAudioEnabled: false, callIsActive: true
        ))
    }

    func test_shouldForceAudioSessionActivation_callEnded_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.shouldForceAudioSessionActivation(
            usesCallKit: true, didActivateFired: false,
            isAudioEnabled: false, callIsActive: false
        ))
    }

    func test_stuckMutedFallbackDelaySeconds_is2() {
        // CallKit normally delivers didActivate within ~500ms of connect;
        // 2s is comfortably past that without leaving the user muted for long.
        XCTAssertEqual(QualityThresholds.stuckMutedFallbackDelaySeconds, 2.0)
    }
}

// MARK: - Platform CallKit gate

/// CallKit is only functional where the system call UI exists. iOS-app-on-Mac
/// (reportNewIncomingCall error 3, didActivate never fires) and the simulator
/// (callservicesd sends an autonomous CXEndCallAction ~3s after an outgoing
/// start) must both drive calls entirely in-app via [AUDIO_FALLBACK].
final class PlatformCallKitPolicyTests: XCTestCase {
    func test_platformUsesCallKit_physicalDevice_returnsTrue() {
        XCTAssertTrue(CallReliabilityPolicy.platformUsesCallKit(
            isiOSAppOnMac: false, isSimulator: false
        ))
    }

    func test_platformUsesCallKit_iosAppOnMac_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.platformUsesCallKit(
            isiOSAppOnMac: true, isSimulator: false
        ))
    }

    func test_platformUsesCallKit_simulator_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.platformUsesCallKit(
            isiOSAppOnMac: false, isSimulator: true
        ))
    }
}

// MARK: - Video layout activation

/// The call UI must switch to the video layout whenever ANY video stream is
/// visible — the local camera, or the peer's camera during a unilateral video
/// escalation of an audio call. Gating the layout on the local camera alone
/// left the remote H264 stream flowing but never rendered (E2E 2026-07-02).
final class VideoLayoutPolicyTests: XCTestCase {
    func test_videoLayoutActive_audioOnly_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.videoLayoutActive(
            localVideoEnabled: false, hasRemoteVideoTrack: false, remoteVideoEnabled: true
        ))
    }

    func test_videoLayoutActive_localCameraOn_returnsTrue() {
        XCTAssertTrue(CallReliabilityPolicy.videoLayoutActive(
            localVideoEnabled: true, hasRemoteVideoTrack: false, remoteVideoEnabled: true
        ))
    }

    func test_videoLayoutActive_remoteEscalationDuringAudioCall_returnsTrue() {
        XCTAssertTrue(CallReliabilityPolicy.videoLayoutActive(
            localVideoEnabled: false, hasRemoteVideoTrack: true, remoteVideoEnabled: true
        ))
    }

    func test_videoLayoutActive_remoteTrackButCameraOff_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.videoLayoutActive(
            localVideoEnabled: false, hasRemoteVideoTrack: true, remoteVideoEnabled: false
        ))
    }

    func test_videoLayoutActive_remoteEnabledWithoutTrack_returnsFalse() {
        XCTAssertFalse(CallReliabilityPolicy.videoLayoutActive(
            localVideoEnabled: false, hasRemoteVideoTrack: false, remoteVideoEnabled: true
        ))
    }
}

// MARK: - Signaling-degraded indicator policy (EXIGENCE №1)

final class SignalingDegradedPolicyTests: XCTestCase {

    func test_signalingDegraded_connectedCallSocketDown_isTrue() {
        XCTAssertTrue(CallReliabilityPolicy.signalingDegraded(callEstablished: true, socketConnected: false))
    }

    func test_signalingDegraded_connectedCallSocketUp_isFalse() {
        XCTAssertFalse(CallReliabilityPolicy.signalingDegraded(callEstablished: true, socketConnected: true))
    }

    func test_signalingDegraded_noEstablishedCall_isFalse_regardlessOfSocket() {
        XCTAssertFalse(CallReliabilityPolicy.signalingDegraded(callEstablished: false, socketConnected: false))
        XCTAssertFalse(CallReliabilityPolicy.signalingDegraded(callEstablished: false, socketConnected: true))
    }
}

// MARK: - Reconnecting entry guard (FSM §3.2)

/// `.reconnecting` is reserved for calls whose media negotiation has begun
/// (remote description applied). Before the answer (.ringing/.offering) an ICE
/// restart is semantically impossible — no remote description exists — and
/// flipping the state made CallView render the connected layout (frozen 00:00
/// timer) while the callee was still ringing.
final class ReconnectingEntryPolicyTests: XCTestCase {

    func test_reconnectingAllowed_fromConnected_isTrue() {
        XCTAssertTrue(CallReliabilityPolicy.reconnectingAllowed(from: .connected))
    }

    func test_reconnectingAllowed_fromReconnecting_isTrue() {
        XCTAssertTrue(CallReliabilityPolicy.reconnectingAllowed(from: .reconnecting(attempt: 2)))
    }

    func test_reconnectingAllowed_fromConnecting_isTrue() {
        // Answer received, real ICE in flight: the .connecting watchdog's
        // one-shot ICE restart is a legitimate recovery.
        XCTAssertTrue(CallReliabilityPolicy.reconnectingAllowed(from: .connecting))
    }

    func test_reconnectingAllowed_fromOffering_isFalse() {
        // The callee has not answered yet — a >12s human ring delay is not an
        // ICE failure.
        XCTAssertFalse(CallReliabilityPolicy.reconnectingAllowed(from: .offering))
    }

    func test_reconnectingAllowed_fromRinging_isFalse() {
        XCTAssertFalse(CallReliabilityPolicy.reconnectingAllowed(from: .ringing(isOutgoing: true)))
        XCTAssertFalse(CallReliabilityPolicy.reconnectingAllowed(from: .ringing(isOutgoing: false)))
    }

    func test_reconnectingAllowed_fromIdleOrEnded_isFalse() {
        XCTAssertFalse(CallReliabilityPolicy.reconnectingAllowed(from: .idle))
        XCTAssertFalse(CallReliabilityPolicy.reconnectingAllowed(from: .ended(reason: .missed)))
    }
}

// MARK: - Call clock reset on connect

/// The duration clock must reset on the FIRST real media connection of a call
/// — even when the FSM transited through `.reconnecting` without the media
/// ever having been established (pre-establishment ICE restart). Without the
/// nil-clock clause, `durationTask` died on a nil `callStartDate` and the UI
/// stayed frozen at 00:00 forever.
final class CallClockPolicyTests: XCTestCase {

    func test_shouldResetCallClock_freshConnect_resets() {
        XCTAssertTrue(CallReliabilityPolicy.shouldResetCallClock(
            wasReconnecting: false, hasExistingStartDate: false
        ))
    }

    func test_shouldResetCallClock_freshConnectWithStaleClock_resets() {
        XCTAssertTrue(CallReliabilityPolicy.shouldResetCallClock(
            wasReconnecting: false, hasExistingStartDate: true
        ))
    }

    func test_shouldResetCallClock_midCallReconnect_preservesRunningClock() {
        XCTAssertFalse(CallReliabilityPolicy.shouldResetCallClock(
            wasReconnecting: true, hasExistingStartDate: true
        ))
    }

    func test_shouldResetCallClock_reconnectWithoutClock_resets() {
        // The frozen-00:00 bug path: .connected reached via .reconnecting on a
        // call that was never connected before.
        XCTAssertTrue(CallReliabilityPolicy.shouldResetCallClock(
            wasReconnecting: true, hasExistingStartDate: false
        ))
    }
}
