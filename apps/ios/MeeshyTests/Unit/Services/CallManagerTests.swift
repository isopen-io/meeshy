import XCTest
@testable import Meeshy

// MARK: - CallState Tests

final class CallStateTests: XCTestCase {

    func test_idle_isNotActive() {
        XCTAssertFalse(CallState.idle.isActive)
    }

    func test_ringing_isActive() {
        XCTAssertTrue(CallState.ringing(isOutgoing: true).isActive)
        XCTAssertTrue(CallState.ringing(isOutgoing: false).isActive)
    }

    func test_connecting_isActive() {
        XCTAssertTrue(CallState.connecting.isActive)
    }

    func test_connected_isActive() {
        XCTAssertTrue(CallState.connected.isActive)
    }

    func test_ended_isNotActive() {
        XCTAssertFalse(CallState.ended(reason: .local).isActive)
        XCTAssertFalse(CallState.ended(reason: .remote).isActive)
        XCTAssertFalse(CallState.ended(reason: .rejected).isActive)
        XCTAssertFalse(CallState.ended(reason: .missed).isActive)
        XCTAssertFalse(CallState.ended(reason: .failed("error")).isActive)
    }

    func test_equatable() {
        XCTAssertEqual(CallState.idle, CallState.idle)
        XCTAssertEqual(CallState.connecting, CallState.connecting)
        XCTAssertEqual(CallState.connected, CallState.connected)
        XCTAssertEqual(CallState.ringing(isOutgoing: true), CallState.ringing(isOutgoing: true))
        XCTAssertNotEqual(CallState.ringing(isOutgoing: true), CallState.ringing(isOutgoing: false))
        XCTAssertNotEqual(CallState.idle, CallState.connecting)
    }

    func test_offering_isActive() {
        XCTAssertTrue(CallState.offering.isActive)
    }

    func test_offering_notEqualConnecting() {
        XCTAssertNotEqual(CallState.offering, CallState.connecting)
    }

    func test_offering_notEqualRinging() {
        XCTAssertNotEqual(CallState.offering, CallState.ringing(isOutgoing: true))
    }
}

// MARK: - WebRTC Types Tests

final class WebRTCTypesTests: XCTestCase {

    func test_sessionDescription_codable() throws {
        let desc = SessionDescription(type: .offer, sdp: "v=0\r\n...")
        let data = try JSONEncoder().encode(desc)
        let decoded = try JSONDecoder().decode(SessionDescription.self, from: data)
        XCTAssertEqual(decoded.type, .offer)
        XCTAssertEqual(decoded.sdp, "v=0\r\n...")
    }

    func test_iceCandidate_codable() throws {
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:...")
        let data = try JSONEncoder().encode(candidate)
        let decoded = try JSONDecoder().decode(IceCandidate.self, from: data)
        XCTAssertEqual(decoded.sdpMid, "0")
        XCTAssertEqual(decoded.sdpMLineIndex, 0)
        XCTAssertEqual(decoded.candidate, "candidate:...")
    }

    func test_iceCandidate_nilSdpMid() throws {
        let candidate = IceCandidate(sdpMid: nil, sdpMLineIndex: 1, candidate: "candidate:...")
        let data = try JSONEncoder().encode(candidate)
        let decoded = try JSONDecoder().decode(IceCandidate.self, from: data)
        XCTAssertNil(decoded.sdpMid)
    }

    func test_sdpType_rawValues() {
        XCTAssertEqual(SDPType.offer.rawValue, "offer")
        XCTAssertEqual(SDPType.answer.rawValue, "answer")
        XCTAssertEqual(SDPType.prAnswer.rawValue, "pranswer")
    }

    func test_defaultIceServers_hasGoogleStun() {
        let servers = IceServer.defaultServers
        XCTAssertEqual(servers.count, 3)
        XCTAssertTrue(servers[0].urls.first?.contains("stun.l.google.com") ?? false)
    }

    func test_callMediaType_cases() {
        let audio = CallMediaType.audioOnly
        let video = CallMediaType.audioVideo
        XCTAssertNotNil(audio)
        XCTAssertNotNil(video)
    }

    func test_peerConnectionState_allCases() {
        let states: [PeerConnectionState] = [.new, .connecting, .connected, .disconnected, .failed, .closed]
        XCTAssertEqual(states.count, 6)
        XCTAssertEqual(PeerConnectionState.new.rawValue, "new")
        XCTAssertEqual(PeerConnectionState.connected.rawValue, "connected")
    }

    func test_webRTCError_descriptions() {
        let errors: [WebRTCError] = [
            .noPeerConnection,
            .failedToCreatePeerConnection,
            .failedToCreateSDP,
            .noCameraAvailable,
            .noCameraFormatAvailable,
            .notSupported
        ]
        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription!.isEmpty)
        }
    }
}

// MARK: - Mock WebRTC Client

final class MockWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool = false
    var localVideoTrack: Any?
    var remoteVideoTrack: Any?
    var audioEffectsService: CallAudioEffectsServiceProviding?

    var configureCallCount = 0
    var createOfferResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .offer, sdp: "mock"))
    var createAnswerResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .answer, sdp: "mock"))
    var disconnectCallCount = 0
    var toggleAudioCallCount = 0
    var toggleVideoCallCount = 0
    var lastAudioEnabled: Bool?
    var lastVideoEnabled: Bool?

    func configure(iceServers: [IceServer]) throws { configureCallCount += 1 }
    func updateIceServers(_ iceServers: [IceServer]) {}
    func createOffer() async throws -> SessionDescription { try createOfferResult.get() }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { try createAnswerResult.get() }
    func setRemoteAnswer(_ answer: SessionDescription) async throws {}
    func addIceCandidate(_ candidate: IceCandidate) async throws {}
    func startLocalMedia(type: CallMediaType) async throws {}
    func toggleAudio(_ enabled: Bool) { toggleAudioCallCount += 1; lastAudioEnabled = enabled }
    func toggleVideo(_ enabled: Bool) { toggleVideoCallCount += 1; lastVideoEnabled = enabled }
    func switchCamera() async throws {}
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { false }
    func sendDataChannelMessage(_ data: Data) {}
    func disconnect() { disconnectCallCount += 1; isConnected = false }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws {}
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {}
}

final class MockWebRTCClientTests: XCTestCase {

    func test_mockCreateOffer_returnsConfiguredResult() async throws {
        let mock = MockWebRTCClient()
        mock.createOfferResult = .success(SessionDescription(type: .offer, sdp: "test-sdp"))
        let result = try await mock.createOffer()
        XCTAssertEqual(result.sdp, "test-sdp")
    }

    func test_mockToggleAudio_tracksCallCount() {
        let mock = MockWebRTCClient()
        mock.toggleAudio(false)
        XCTAssertEqual(mock.toggleAudioCallCount, 1)
        XCTAssertEqual(mock.lastAudioEnabled, false)
    }

    func test_mockDisconnect_updatesState() {
        let mock = MockWebRTCClient()
        mock.isConnected = true
        mock.disconnect()
        XCTAssertFalse(mock.isConnected)
        XCTAssertEqual(mock.disconnectCallCount, 1)
    }
}

@MainActor
final class CallManagerOfferingTransitionTests: XCTestCase {

    func test_listenForParticipantJoined_setsCallStateToOffering_inSourceCode() throws {
        // This is a source-level guard against regression. The actual transition
        // is hard to test without mocking the entire WebRTC stack. We verify
        // that listenForParticipantJoined function body sets self.callState = .offering
        // (NOT .connecting) when participant-joined is received.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        guard let funcRange = source.range(of: "func listenForParticipantJoined") else {
            XCTFail("listenForParticipantJoined function not found")
            return
        }
        // Bound the search to the function body — find the next private func declaration after it
        let searchEnd = source.range(of: "private func ", range: funcRange.upperBound..<source.endIndex)?.lowerBound
                     ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            funcBody.contains("self.callState = .offering"),
            "listenForParticipantJoined must transition state to .offering after participant-joined. " +
            "Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2"
        )
    }

    func test_handleRemoteAnswer_transitions_offering_to_connecting() throws {
        // Source-level guard: after setRemoteDescription(answer) returns, the FSM
        // must transition .offering → .connecting (NOT remain in .offering or jump elsewhere).
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        // Look for the answer subscription block OR a handleRemoteAnswer function
        let hasInSubscription = source.contains("setRemoteDescription") &&
            source.range(of: "if case .offering = self.callState") != nil

        let hasInFunction = source.range(of: "func handleRemoteAnswer") != nil &&
            source.contains("if case .offering")

        XCTAssertTrue(
            hasInSubscription || hasInFunction,
            "After setRemoteDescription(answer), CallManager must transition .offering → .connecting. " +
            "Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2"
        )
    }
}

@MainActor
final class CallManagerRTPGateTests: XCTestCase {

    func test_webRTCServiceDidConnect_invokesRTPGate_notDirectTransition() throws {
        // Source-level guard: webRTCServiceDidConnect must NOT call transitionToConnected
        // directly. It must call startRTPGatePolling instead, which internally polls
        // stats and only transitions if inboundPacketsReceived >= rtpGateRequiredPackets.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.3
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        guard let funcRange = source.range(of: "func webRTCServiceDidConnect") else {
            XCTFail("webRTCServiceDidConnect not found")
            return
        }
        // Bound to next func declaration
        let blockEnd = source.range(of: "func webRTCServiceDidDisconnect", range: funcRange.upperBound..<source.endIndex)?.lowerBound
                    ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<blockEnd])

        XCTAssertTrue(
            funcBody.contains("startRTPGatePolling"),
            "webRTCServiceDidConnect must invoke startRTPGatePolling instead of direct transitionToConnected"
        )
    }

    func test_qualityThresholds_rtpGate_constants() {
        XCTAssertEqual(QualityThresholds.rtpGatePollIntervalSeconds, 2.0)
        XCTAssertEqual(QualityThresholds.rtpGateMaxAttempts, 5)
        XCTAssertEqual(QualityThresholds.rtpGateRequiredPackets, 5)
    }

    func test_callStats_inboundPacketsReceived_defaultsToZero() {
        let stats = CallStats()
        XCTAssertEqual(stats.inboundPacketsReceived, 0)
    }

    func test_callStats_inboundPacketsReceived_canBeSet() {
        let stats = CallStats(inboundPacketsReceived: 42)
        XCTAssertEqual(stats.inboundPacketsReceived, 42)
    }
}

@MainActor
final class CallManagerEarlyJoinTests: XCTestCase {
    /// Bug 2 — Caller stays ringing while callee shows "Connecting".
    ///
    /// Root cause: `emitCallJoin` used to be gated behind `await startLocalMedia(...)`,
    /// which on real devices can take 0.5-3s for video (camera startup). During
    /// that window, the gateway has no participant-joined event to broadcast, so
    /// the caller stays in `.ringing(true)` while the callee already shows
    /// `.connecting`. If `startLocalMedia` hangs or throws, the caller never
    /// progresses.
    ///
    /// Fix: emit `call:join` IMMEDIATELY after `configureAudioSession`, before
    /// the media-startup Task. Subsequent answer-creation paths await the
    /// `localMediaTask` to guarantee the audio/video transceivers exist before
    /// `createAnswer`.

    private func sourceText() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of funcSignature: String, in source: String) -> String? {
        guard let funcRange = source.range(of: funcSignature) else { return nil }
        // Heuristic: bound the function body to the next `func ` (private or
        // not), or to the next MARK section. Good enough for guard-style tests.
        let upper = source.index(funcRange.upperBound, offsetBy: 0)
        let nextFunc = source.range(of: "\n    func ", range: upper..<source.endIndex)?.lowerBound
        let nextPrivate = source.range(of: "\n    private func ", range: upper..<source.endIndex)?.lowerBound
        let nextMark = source.range(of: "\n    // MARK:", range: upper..<source.endIndex)?.lowerBound
        let candidates = [nextFunc, nextPrivate, nextMark].compactMap { $0 }
        let blockEnd = candidates.min() ?? source.endIndex
        return String(source[funcRange.lowerBound..<blockEnd])
    }

    func test_handleIncomingCallNotification_emitsCallJoinBeforeStartLocalMedia() throws {
        let source = try sourceText()
        guard let body = body(of: "func handleIncomingCallNotification", in: source) else {
            XCTFail("handleIncomingCallNotification not found")
            return
        }
        guard let emitJoinIdx = body.range(of: "emitCallJoin(callId: callId)")?.lowerBound,
              let startMediaIdx = body.range(of: "startLocalMedia(isVideo:")?.lowerBound else {
            XCTFail("Expected emitCallJoin and startLocalMedia call sites in handleIncomingCallNotification")
            return
        }
        XCTAssertLessThan(
            emitJoinIdx,
            startMediaIdx,
            "Bug 2 guard: emitCallJoin MUST be called before awaiting startLocalMedia in handleIncomingCallNotification, " +
            "otherwise the caller stays in .ringing(true) until the callee's camera/mic warmup completes."
        )
    }

    func test_reportIncomingVoIPCall_emitsCallJoinBeforeStartLocalMedia() throws {
        let source = try sourceText()
        guard let body = body(of: "func reportIncomingVoIPCall", in: source) else {
            XCTFail("reportIncomingVoIPCall not found")
            return
        }
        guard let emitJoinIdx = body.range(of: "emitCallJoin(callId: callId)")?.lowerBound,
              let startMediaIdx = body.range(of: "startLocalMedia(isVideo:")?.lowerBound else {
            XCTFail("Expected emitCallJoin and startLocalMedia call sites in reportIncomingVoIPCall")
            return
        }
        XCTAssertLessThan(
            emitJoinIdx,
            startMediaIdx,
            "Bug 2 guard: emitCallJoin MUST be called before awaiting startLocalMedia in reportIncomingVoIPCall."
        )
    }

    func test_localMediaTask_isStored_inIncomingPaths() throws {
        let source = try sourceText()
        XCTAssertTrue(
            source.contains("private var localMediaTask: Task<Void, Never>?"),
            "Bug 2 guard: CallManager must hold a `localMediaTask` reference so answer-creation paths can await it."
        )
        // Both incoming paths must assign to localMediaTask
        let incomingBody = body(of: "func handleIncomingCallNotification", in: source) ?? ""
        let voipBody = body(of: "func reportIncomingVoIPCall", in: source) ?? ""
        XCTAssertTrue(incomingBody.contains("localMediaTask = Task"), "handleIncomingCallNotification must store the local media Task in localMediaTask.")
        XCTAssertTrue(voipBody.contains("localMediaTask = Task"), "reportIncomingVoIPCall must store the local media Task in localMediaTask.")
    }

    func test_answerCall_awaitsLocalMediaBeforeCreateAnswer() throws {
        let source = try sourceText()
        guard let body = body(of: "func answerCall()", in: source) else {
            XCTFail("answerCall() not found")
            return
        }
        guard let awaitIdx = body.range(of: "await self.localMediaTask?.value")?.lowerBound,
              let createAnswerIdx = body.range(of: "webRTCService.createAnswer(from: remoteOffer)")?.lowerBound else {
            XCTFail("Expected `await self.localMediaTask?.value` and `createAnswer` in answerCall")
            return
        }
        XCTAssertLessThan(
            awaitIdx,
            createAnswerIdx,
            "Bug 2 guard: answerCall must await localMediaTask before createAnswer to guarantee audio/video transceivers exist."
        )
    }

    func test_answerCallReady_awaitsLocalMediaBeforeCreateAnswer() throws {
        let source = try sourceText()
        guard let body = body(of: "func answerCallReady()", in: source) else {
            XCTFail("answerCallReady() not found")
            return
        }
        guard let awaitIdx = body.range(of: "await self.localMediaTask?.value")?.lowerBound,
              let createAnswerIdx = body.range(of: "webRTCService.createAnswer(from: remoteOffer)")?.lowerBound else {
            XCTFail("Expected `await self.localMediaTask?.value` and `createAnswer` in answerCallReady")
            return
        }
        XCTAssertLessThan(
            awaitIdx,
            createAnswerIdx,
            "Bug 2 guard: answerCallReady must await localMediaTask before createAnswer."
        )
    }

    func test_handleSignalOffer_connecting_awaitsLocalMediaBeforeCreateAnswer() throws {
        let source = try sourceText()
        guard let body = body(of: "func handleSignalOffer", in: source) else {
            XCTFail("handleSignalOffer not found")
            return
        }
        // The .connecting branch contains both the await and createAnswer(from: sdp)
        guard let connectingIdx = body.range(of: "case .connecting:")?.lowerBound,
              let awaitIdx = body.range(of: "await self.localMediaTask?.value", range: connectingIdx..<body.endIndex)?.lowerBound,
              let createAnswerIdx = body.range(of: "webRTCService.createAnswer(from: sdp)", range: connectingIdx..<body.endIndex)?.lowerBound else {
            XCTFail("Expected await + createAnswer inside `.connecting` branch of handleSignalOffer")
            return
        }
        XCTAssertLessThan(
            awaitIdx,
            createAnswerIdx,
            "Bug 2 guard: handleSignalOffer `.connecting` branch must await localMediaTask before createAnswer."
        )
    }

    func test_endCallInternal_cancelsLocalMediaTask() throws {
        let source = try sourceText()
        guard let body = body(of: "func endCallInternal", in: source) else {
            XCTFail("endCallInternal not found")
            return
        }
        XCTAssertTrue(
            body.contains("localMediaTask?.cancel()"),
            "Cleanup guard: endCallInternal must cancel localMediaTask to avoid leaking the in-flight startLocalMedia coroutine."
        )
    }
}
