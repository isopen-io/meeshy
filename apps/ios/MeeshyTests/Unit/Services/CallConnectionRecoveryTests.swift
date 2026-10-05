import XCTest
@testable import Meeshy

// MARK: - Level catch-up of `.connected` (#8270)

/// Incident 2026-09-27 (call 6ab8dd91…): the callee's FSM sat in
/// `.reconnecting` for 45 s while the caller showed "connected". An ICE restart
/// on a pair that still carries media never makes `RTCPeerConnectionState`
/// leave `.connected`, so no `.connected` EDGE comes back and the FSM — which
/// only listened for edges — escalated every 12 s until the peer hung up.
/// The fix reads the LEVEL: an FSM still negotiating while the peer connection
/// already reports `.connected` catches up.
@MainActor
final class ConnectedCatchUpPolicyTests: XCTestCase {

    func test_shouldCatchUpConnected_reconnectingWhilePeerConnected_isTrue() {
        XCTAssertTrue(CallReliabilityPolicy.shouldCatchUpConnected(
            callState: .reconnecting(attempt: 2), peerState: .connected
        ))
    }

    func test_shouldCatchUpConnected_connectingWhilePeerConnected_isTrue() {
        XCTAssertTrue(CallReliabilityPolicy.shouldCatchUpConnected(
            callState: .connecting, peerState: .connected
        ))
    }

    func test_shouldCatchUpConnected_reconnectingWhilePeerDisconnected_isFalse() {
        XCTAssertFalse(CallReliabilityPolicy.shouldCatchUpConnected(
            callState: .reconnecting(attempt: 1), peerState: .disconnected
        ))
    }

    func test_shouldCatchUpConnected_offering_isFalse() {
        XCTAssertFalse(CallReliabilityPolicy.shouldCatchUpConnected(
            callState: .offering, peerState: .connected
        ))
    }

    func test_shouldCatchUpConnected_ringingAlreadyConnectedOrEnded_isFalse() {
        let states: [CallState] = [.idle, .ringing(isOutgoing: false), .connected, .ended(reason: .local)]
        for state in states {
            XCTAssertFalse(
                CallReliabilityPolicy.shouldCatchUpConnected(callState: state, peerState: .connected),
                "\(state) must not catch up"
            )
        }
    }
}

// MARK: - Half-open self-heal budget (#8270)

/// The self-heal is documented "one-shot per call", but the monitor re-armed
/// it on every connection epoch. Once `.connected` is caught up by level, a
/// peer that never sends RTP would loop heal → reconnect → catch-up every 6 s.
@MainActor
final class HalfOpenHealBudgetTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    func test_evaluate_afterAHealInAPreviousEpoch_neverHealsAgain() {
        var state = HalfOpenMonitorState()
        _ = state.evaluate(
            epoch: 1, inboundPackets: 0, outboundPackets: 0,
            now: t0, requiredInboundPackets: 5, graceSeconds: 4
        )
        let heal = state.evaluate(
            epoch: 1, inboundPackets: 0, outboundPackets: 300,
            now: t0.addingTimeInterval(6), requiredInboundPackets: 5, graceSeconds: 4
        )
        XCTAssertEqual(heal, .healHalfOpen)

        _ = state.evaluate(
            epoch: 2, inboundPackets: 0, outboundPackets: 300,
            now: t0.addingTimeInterval(20), requiredInboundPackets: 5, graceSeconds: 4
        )
        let second = state.evaluate(
            epoch: 2, inboundPackets: 0, outboundPackets: 900,
            now: t0.addingTimeInterval(26), requiredInboundPackets: 5, graceSeconds: 4
        )
        XCTAssertEqual(second, .waiting, "the call's single self-heal is already spent")
    }

    func test_evaluate_afterASpentHeal_stillReportsHealthyWhenMediaArrives() {
        var state = HalfOpenMonitorState()
        _ = state.evaluate(epoch: 1, inboundPackets: 0, outboundPackets: 0,
                           now: t0, requiredInboundPackets: 5, graceSeconds: 4)
        _ = state.evaluate(epoch: 1, inboundPackets: 0, outboundPackets: 300,
                           now: t0.addingTimeInterval(6), requiredInboundPackets: 5, graceSeconds: 4)
        _ = state.evaluate(epoch: 2, inboundPackets: 0, outboundPackets: 300,
                           now: t0.addingTimeInterval(20), requiredInboundPackets: 5, graceSeconds: 4)
        let outcome = state.evaluate(
            epoch: 2, inboundPackets: 40, outboundPackets: 900,
            now: t0.addingTimeInterval(22), requiredInboundPackets: 5, graceSeconds: 4
        )
        XCTAssertEqual(outcome, .healthy)
    }
}

// MARK: - CallKit audio session activation (#8269)

/// Incident 2026-09-27: on an OUTGOING CallKit call, `provider:didActivate`
/// lands before the setup task reaches `configureAudioSession()`, which called
/// `setConfiguration(_, active: false)` — i.e. `setActive(false)` on the
/// session CallKit had just activated. The caller's audio unit stopped: no
/// audio in either direction while video (screen share) kept flowing.
@MainActor
final class CallAudioSessionActivationPolicyTests: XCTestCase {

    func test_activation_callKitPath_neverTouchesActivation() {
        XCTAssertNil(CallAudioSessionPolicy.activation(usesCallKit: true))
    }

    func test_activation_withoutCallKit_activatesNow() {
        XCTAssertEqual(CallAudioSessionPolicy.activation(usesCallKit: false), true)
    }
}
