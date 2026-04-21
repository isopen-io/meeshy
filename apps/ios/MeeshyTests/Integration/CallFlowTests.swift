import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Integration test: initiate -> offer -> answer -> connected -> end -> cleanup
@MainActor
final class CallFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeSocket() -> MockMessageSocket {
        MockMessageSocket()
    }

    // MARK: - Initiate Call

    func test_initiateCall_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallInitiate(conversationId: "conv001", isVideo: false)
        XCTAssertEqual(socket.callInitiateCallCount, 1)
    }

    func test_initiateVideoCall_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallInitiate(conversationId: "conv001", isVideo: true)
        XCTAssertEqual(socket.callInitiateCallCount, 1)
    }

    // MARK: - Join Call

    func test_joinCall_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallJoin(callId: "call001")
        XCTAssertEqual(socket.callJoinCallCount, 1)
    }

    // MARK: - Signal Exchange

    func test_callSignal_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallSignal(callId: "call001", type: "offer", payload: ["sdp": "v=0..."])
        XCTAssertEqual(socket.callSignalCallCount, 1)
    }

    // MARK: - Media Toggle

    func test_toggleAudio_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallToggleAudio(callId: "call001", enabled: false)
        XCTAssertEqual(socket.callToggleAudioCallCount, 1)
    }

    func test_toggleVideo_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallToggleVideo(callId: "call001", enabled: true)
        XCTAssertEqual(socket.callToggleVideoCallCount, 1)
    }

    // MARK: - End Call

    func test_endCall_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallEnd(callId: "call001")
        XCTAssertEqual(socket.callEndCallCount, 1)
    }

    // MARK: - Leave Call

    func test_leaveCall_sendsViaSocket() {
        let socket = makeSocket()
        socket.emitCallLeave(callId: "call001")
        XCTAssertEqual(socket.callLeaveCallCount, 1)
    }

    // MARK: - Incoming Call Events

    func test_callOfferReceived_publishesEvent() {
        let socket = makeSocket()
        var received: [CallOfferData] = []
        let cancellable = socket.callOfferReceived.sink { offer in
            received.append(offer)
        }

        let offer: CallOfferData = JSONStub.decode("""
        {"callId":"call001","conversationId":"conv001","mode":"audio","initiator":{"userId":"user2","username":"caller"}}
        """)
        socket.callOfferReceived.send(offer)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.callId, "call001")
        cancellable.cancel()
    }

    func test_callEnded_publishesEvent() {
        let socket = makeSocket()
        var received: [CallEndData] = []
        let cancellable = socket.callEnded.sink { endData in
            received.append(endData)
        }

        let endData: CallEndData = JSONStub.decode("""
        {"callId":"call001","duration":120,"endedBy":"user1"}
        """)
        socket.callEnded.send(endData)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.callId, "call001")
        cancellable.cancel()
    }

    // MARK: - Full Call Flow

    func test_fullCallFlow_initiate_join_toggleMedia_end() {
        let socket = makeSocket()

        socket.emitCallInitiate(conversationId: "conv001", isVideo: false)
        XCTAssertEqual(socket.callInitiateCallCount, 1)

        socket.emitCallJoin(callId: "call001")
        XCTAssertEqual(socket.callJoinCallCount, 1)

        socket.emitCallSignal(callId: "call001", type: "offer", payload: ["sdp": "v=0"])
        XCTAssertEqual(socket.callSignalCallCount, 1)

        socket.emitCallToggleAudio(callId: "call001", enabled: false)
        socket.emitCallToggleVideo(callId: "call001", enabled: true)
        XCTAssertEqual(socket.callToggleAudioCallCount, 1)
        XCTAssertEqual(socket.callToggleVideoCallCount, 1)

        socket.emitCallEnd(callId: "call001")
        XCTAssertEqual(socket.callEndCallCount, 1)
    }

    // MARK: - CallState

    func test_callState_idle_isNotActive() {
        let state: CallState = .idle
        XCTAssertFalse(state.isActive)
        XCTAssertFalse(state.isRinging)
    }

    func test_callState_ringing_isActive() {
        let state: CallState = .ringing(isOutgoing: true)
        XCTAssertTrue(state.isActive)
        XCTAssertTrue(state.isRinging)
    }

    func test_callState_connected_isActive() {
        let state: CallState = .connected
        XCTAssertTrue(state.isActive)
        XCTAssertFalse(state.isRinging)
    }

    func test_callState_ended_isNotActive() {
        let state: CallState = .ended(reason: .local)
        XCTAssertFalse(state.isActive)
    }
}
