import XCTest
@testable import Meeshy
@testable import MeeshySDK

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

    /// Une session que l'APP a activée (sonnerie in-app promue en CallKit,
    /// filet « micro muet ») n'est jamais rendue par `didDeactivate` : elle
    /// restait active en `.playAndRecord` + `.duckOthers`, la musique des
    /// autres apps atténuée après l'appel.
    func test_shouldDeactivateOnEnd_selfActivatedSessionUnderCallKit_isReleased() {
        XCTAssertTrue(CallAudioSessionPolicy.shouldDeactivateOnEnd(usesCallKit: true, sessionSelfActivated: true))
        XCTAssertFalse(CallAudioSessionPolicy.shouldDeactivateOnEnd(usesCallKit: true, sessionSelfActivated: false))
        XCTAssertTrue(CallAudioSessionPolicy.shouldDeactivateOnEnd(usesCallKit: false, sessionSelfActivated: false))
    }

    func test_deactivateAudioSession_followsTheSelfActivationRule() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+AudioSession.swift")
        XCTAssertTrue(source.contains("CallAudioSessionPolicy.shouldDeactivateOnEnd("))
        XCTAssertTrue(source.contains("self.audioSessionSelfActivated = true"), "le filet « micro muet » note son activation")
        XCTAssertTrue(source.contains("if activation == true { audioSessionSelfActivated = true }"))
    }
}

// MARK: - D2 (#11468) — le raccroché arrive au serveur avant le démontage

private final class RecordingAckEmitter: SocketAckEmitting, @unchecked Sendable {
    private(set) var sentEvents: [String] = []
    private(set) var pendingAck: (([Any]) -> Void)?

    func sendAck(_ event: String, _ payload: SocketAckPayload, timeout: Double, onAck: @escaping ([Any]) -> Void) {
        sentEvents.append(event)
        pendingAck = onAck
    }
}

private final class AckBox: @unchecked Sendable {
    var values: [Bool] = []
}

final class CallEndEmissionTests: XCTestCase {

    func test_callEnd_isOnTheWire_beforeTheEmitterReturns() {
        let emitter = RecordingAckEmitter()
        let box = AckBox()
        CallEndEmission.emit(on: emitter, callId: "call-1", reason: nil) { box.values.append($0) }
        XCTAssertEqual(emitter.sentEvents, ["call:end"], "l'émission ne doit attendre ni une Task ni le fil principal")
        XCTAssertTrue(box.values.isEmpty, "seul l'accusé reste à venir")
        emitter.pendingAck?([["success": true]])
        XCTAssertEqual(box.values, [true])
    }

    func test_refusedOrTimedOutAck_reportsFalse() {
        let emitter = RecordingAckEmitter()
        let box = AckBox()
        CallEndEmission.emit(on: emitter, callId: "call-1", reason: nil) { box.values.append($0) }
        emitter.pendingAck?(["NO ACK"])
        XCTAssertEqual(box.values, [false])
    }

    func test_hangup_emitsCallEndSynchronously_beforeTheLocalTeardown() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+Hangup.swift")
        guard let reliably = source.range(of: "func emitCallEndReliably("),
              let endCall = source.range(of: "func endCall() {") else { return XCTFail("hangup functions not found") }
        let reliableBody = source[reliably.upperBound..<endCall.lowerBound]
        guard let emit = reliableBody.range(of: "MessageSocketManager.shared.emitCallEndWithAck(callId: callId) {") else {
            return XCTFail("call:end must be emitted through the synchronous ack variant")
        }
        XCTAssertNil(reliableBody[..<emit.lowerBound].range(of: "Task {"), "no Task may defer the call:end emission")
        let endBody = source[endCall.upperBound...]
        guard let announce = endBody.range(of: "emitCallEndReliably(callId: callId)"),
              let teardown = endBody.range(of: "endCallInternal(") else { return XCTFail("endCall shape changed") }
        XCTAssertLessThan(announce.lowerBound, teardown.lowerBound, "call:end leaves before the teardown starts")
    }

    func test_audioDeactivation_leavesTheMainThread() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+AudioSession.swift")
        guard let start = source.range(of: "func deactivateAudioSession() {") else { return XCTFail("missing") }
        let body = source[start.upperBound...]
        let end = body.range(of: "\n    }\n")?.lowerBound ?? body.endIndex
        let fn = body[..<end]
        guard let queue = fn.range(of: "audioSessionQueue.async {"),
              let setActive = fn.range(of: "setActive(false") else { return XCTFail("setActive(false) must run on the audio session queue") }
        XCTAssertLessThan(queue.lowerBound, setActive.lowerBound)
        XCTAssertNil(fn.range(of: "audioSessionQueue.sync"), "the main thread never waits on the audio session queue at hangup")
    }
}

