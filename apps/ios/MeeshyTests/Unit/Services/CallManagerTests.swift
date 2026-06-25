import XCTest
@testable import Meeshy

// MARK: - CallState Tests

@MainActor
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

// MARK: - Perfect Negotiation Role (§3.4)

@MainActor
final class PerfectNegotiationRoleTests: XCTestCase {
    // The polite peer is the lexicographically-smaller userId. The rule MUST be
    // symmetric: whichever side we view it from, exactly one peer is polite.
    func test_isPolitePeer_smallerUserId_isPolite() {
        XCTAssertTrue(CallManager.isPolitePeer(localUserId: "aaa", remoteUserId: "bbb"))
    }

    func test_isPolitePeer_largerUserId_isImpolite() {
        XCTAssertFalse(CallManager.isPolitePeer(localUserId: "bbb", remoteUserId: "aaa"))
    }

    func test_isPolitePeer_symmetric_exactlyOnePolite() {
        let a = "507f1f77bcf86cd799439011"
        let b = "507f1f77bcf86cd799439012"
        let aSeesItself = CallManager.isPolitePeer(localUserId: a, remoteUserId: b)
        let bSeesItself = CallManager.isPolitePeer(localUserId: b, remoteUserId: a)
        XCTAssertNotEqual(aSeesItself, bSeesItself, "exactly one peer must be polite")
        XCTAssertTrue(aSeesItself, "smaller id (a) is polite")
    }

    func test_isPolitePeer_missingLocalId_isImpolite() {
        XCTAssertFalse(CallManager.isPolitePeer(localUserId: "", remoteUserId: "bbb"))
    }

    func test_isPolitePeer_missingRemoteId_isImpolite() {
        XCTAssertFalse(CallManager.isPolitePeer(localUserId: "aaa", remoteUserId: ""))
    }

    func test_isPolitePeer_identicalIds_isImpolite() {
        // Degenerate (should not happen in a 1:1 call) — never yield blindly.
        XCTAssertFalse(CallManager.isPolitePeer(localUserId: "same", remoteUserId: "same"))
    }
}

// MARK: - Negotiation Epoch (§3.5)

@MainActor
final class NegotiationEpochTests: XCTestCase {
    func test_isStale_olderGeneration_isStale() {
        XCTAssertTrue(CallManager.isStaleNegotiation(incoming: 1, highWaterMark: 2))
    }

    func test_isStale_sameGeneration_isAccepted() {
        // Offer, its answer, and matching ICE all carry the same generation.
        XCTAssertFalse(CallManager.isStaleNegotiation(incoming: 2, highWaterMark: 2))
    }

    func test_isStale_newerGeneration_isAccepted() {
        XCTAssertFalse(CallManager.isStaleNegotiation(incoming: 3, highWaterMark: 2))
    }

    func test_isStale_firstSignal_isAccepted() {
        // Fresh call: high-water mark 0, first offer is generation 1.
        XCTAssertFalse(CallManager.isStaleNegotiation(incoming: 1, highWaterMark: 0))
    }
}

// MARK: - WebRTC Types Tests

@MainActor
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

nonisolated final class MockWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool = false
    var localVideoTrack: Any?
    var remoteVideoTrack: Any?
    var audioEffectsService: CallAudioEffectsServiceProviding?
    let videoFilterPipeline = VideoFilterPipeline()

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
    private(set) var lastNegotiationIsPolite: Bool?
    func setNegotiationRole(isPolite: Bool) { lastNegotiationIsPolite = isPolite }
    func createOffer() async throws -> SessionDescription { try createOfferResult.get() }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { try createAnswerResult.get() }
    func setRemoteAnswer(_ answer: SessionDescription) async throws {}
    func addIceCandidate(_ candidate: IceCandidate) async throws {}
    func startLocalMedia(type: CallMediaType) async throws {}
    func toggleAudio(_ enabled: Bool) { toggleAudioCallCount += 1; lastAudioEnabled = enabled }
    func toggleVideo(_ enabled: Bool) { toggleVideoCallCount += 1; lastVideoEnabled = enabled }
    var hasLocalVideoTrack: Bool = false
    var enableLocalVideoResult: Result<Bool, Error> = .success(true)
    var disableLocalVideoResult: Bool = true
    private(set) var enableLocalVideoCallCount = 0
    private(set) var disableLocalVideoCallCount = 0
    func enableLocalVideo() async throws -> Bool {
        enableLocalVideoCallCount += 1
        let needsRenegotiation = try enableLocalVideoResult.get()
        hasLocalVideoTrack = true
        return needsRenegotiation
    }
    func disableLocalVideo() async -> Bool {
        disableLocalVideoCallCount += 1
        hasLocalVideoTrack = false
        return disableLocalVideoResult
    }
    private(set) var applyVideoEncodingCallCount = 0
    private(set) var lastVideoEncoding: (maxBitrateBps: Int, maxFramerate: Int, scaleResolutionDownBy: Double)?
    func applyVideoEncoding(maxBitrateBps: Int, maxFramerate: Int, scaleResolutionDownBy: Double) {
        applyVideoEncodingCallCount += 1
        lastVideoEncoding = (maxBitrateBps, maxFramerate, scaleResolutionDownBy)
    }
    func switchCamera() async throws {}
    var availableCamerasResult: [CameraDeviceOption] = []
    private(set) var lastSwitchToCameraId: String?
    func availableCameras() -> [CameraDeviceOption] { availableCamerasResult }
    func switchToCamera(uniqueID: String) async throws { lastSwitchToCameraId = uniqueID }
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { false }
    func sendDataChannelMessage(_ data: Data) {}
    func disconnect() { disconnectCallCount += 1; isConnected = false }
    private(set) var restartIceCallCount = 0
    func restartIce() { restartIceCallCount += 1 }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws {}
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {}
}

@MainActor
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

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_webRTCServiceDidConnect_transitionsDirectly_perPCStateAuthority() throws {
        // §3.2 — `RTCPeerConnectionState.connected` (ICE + DTLS up) is the reliable
        // gate, so webRTCServiceDidConnect transitions to `.connected` immediately
        // for snappy UX. The OLD RTP-gate-drives-transition behaviour is removed:
        // half-open detection is now an auto-HEAL owned by the reliability monitor
        // (§5.8), not a precondition for `.connected`.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func webRTCServiceDidConnect") else {
            XCTFail("webRTCServiceDidConnect not found")
            return
        }
        let blockEnd = source.range(of: "func webRTCServiceDidDisconnect", range: funcRange.upperBound..<source.endIndex)?.lowerBound
                    ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<blockEnd])

        XCTAssertTrue(
            funcBody.contains("transitionToConnected"),
            "webRTCServiceDidConnect must transition to .connected on RTCPeerConnectionState.connected (§3.2)"
        )
        XCTAssertFalse(
            funcBody.contains("startRTPGatePolling"),
            "Obsolete: the RTP gate no longer gates the .connected transition (§3.2/§5.8)"
        )
    }

    func test_reliabilityMonitor_startedAtSetup_cancelledOnEndCall() throws {
        // §5.8 — the unified reliability monitor (connecting watchdog + half-open
        // self-heal) is started during call setup and torn down on end.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("startReliabilityMonitor()"),
            "Reliability monitor must be started during call setup"
        )
        XCTAssertTrue(
            source.contains("reliabilityMonitorTask?.cancel()"),
            "endCallInternal must cancel the reliability monitor"
        )
    }

    func test_qualityThresholds_watchdog_constants() {
        // §5.8 budgets are ordered: grace < connecting-restart < connecting-fail.
        XCTAssertLessThan(QualityThresholds.halfOpenHealGraceSeconds, QualityThresholds.connectingRestartSeconds)
        XCTAssertLessThan(QualityThresholds.connectingRestartSeconds, QualityThresholds.connectingFailSeconds)
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

    func test_emitCallOffer_usesAtLeastOnceWithAck_notFireAndForget() throws {
        // §6.3 — the offer is the single most critical signal. It must be sent
        // through the ACK'd at-least-once path (emitOfferWithRetry), not the
        // fire-and-forget emitCallSignal that dropped it silently on churn.
        let source = try sourceText()
        guard let offerBody = body(of: "func emitCallOffer", in: source) else {
            XCTFail("emitCallOffer not found")
            return
        }
        XCTAssertTrue(
            offerBody.contains("emitOfferWithRetry"),
            "emitCallOffer must delegate to the at-least-once retry path (§6.3)"
        )
        guard let retryBody = body(of: "func emitOfferWithRetry", in: source) else {
            XCTFail("emitOfferWithRetry not found")
            return
        }
        XCTAssertTrue(
            retryBody.contains("emitCallSignalWithAck"),
            "emitOfferWithRetry must use the ACK'd emit (§6.3)"
        )
        XCTAssertTrue(
            retryBody.contains("generation >= negotiationId"),
            "emitOfferWithRetry must stop when a newer negotiation supersedes the offer (epoch guard, §3.5)"
        )
    }
}

// MARK: - CallStats Reducer (§5.7)

@MainActor
final class CallStatsReducerTests: XCTestCase {
    private func codec(_ id: String, _ mime: String) -> CallStats.RawEntry {
        CallStats.RawEntry(id: id, type: "codec", mimeType: mime)
    }
    private func inbound(_ kind: String, packets: Int, codecId: String? = nil, lost: Int = 0, bytes: Int = 0) -> CallStats.RawEntry {
        CallStats.RawEntry(
            id: "in-\(kind)", type: "inbound-rtp", kind: kind, codecId: codecId,
            values: ["packetsReceived": Double(packets), "packetsLost": Double(lost), "bytesReceived": Double(bytes)]
        )
    }
    private func outbound(_ kind: String, packets: Int, bytes: Int = 0) -> CallStats.RawEntry {
        CallStats.RawEntry(
            id: "out-\(kind)", type: "outbound-rtp", kind: kind,
            values: ["packetsSent": Double(packets), "bytesSent": Double(bytes)]
        )
    }

    func test_reduce_splitsInboundByKind() {
        let stats = CallStats.reduce(entries: [
            inbound("audio", packets: 120),
            inbound("video", packets: 300)
        ])
        XCTAssertEqual(stats.inboundAudioPackets, 120)
        XCTAssertEqual(stats.inboundVideoPackets, 300)
        XCTAssertEqual(stats.inboundPacketsReceived, 420)
    }

    func test_reduce_audioOnly_videoPacketsZero() {
        let stats = CallStats.reduce(entries: [inbound("audio", packets: 50)])
        XCTAssertEqual(stats.inboundAudioPackets, 50)
        XCTAssertEqual(stats.inboundVideoPackets, 0)
    }

    func test_reduce_missingKind_countsAsAudio() {
        // inbound-rtp with no `kind` (older libwebrtc) defaults to audio.
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "x", type: "inbound-rtp", values: ["packetsReceived": 10])
        ])
        XCTAssertEqual(stats.inboundAudioPackets, 10)
    }

    func test_reduce_sumsOutboundPackets() {
        let stats = CallStats.reduce(entries: [
            outbound("audio", packets: 200, bytes: 1000),
            outbound("video", packets: 800, bytes: 50000)
        ])
        XCTAssertEqual(stats.outboundPacketsSent, 1000)
        XCTAssertEqual(stats.bandwidth, 51000)
    }

    func test_reduce_sumsInboundBytesReceived() {
        // bytesReceived (cumulative) is summed across all inbound-rtp streams —
        // paired with bandwidth (bytesSent) to report total data spent.
        let stats = CallStats.reduce(entries: [
            inbound("audio", packets: 200, bytes: 2000),
            inbound("video", packets: 800, bytes: 90000)
        ])
        XCTAssertEqual(stats.bytesReceived, 92000)
    }

    func test_connectionQualityLabel_collapsesCriticalIntoPoor() {
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .excellent), "excellent")
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .good), "good")
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .fair), "fair")
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .poor), "poor")
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .critical), "poor")
    }

    func test_reduce_resolvesRealCodecName_notGraphReference() {
        // Bug j: codecId "COT01_111" must resolve to "opus", not the raw id.
        let stats = CallStats.reduce(entries: [
            codec("COT01_111", "audio/opus"),
            inbound("audio", packets: 40, codecId: "COT01_111")
        ])
        XCTAssertEqual(stats.codec, "opus")
    }

    func test_reduce_resolvesVideoCodec() {
        let stats = CallStats.reduce(entries: [
            codec("CIT01_96", "video/H264"),
            inbound("video", packets: 40, codecId: "CIT01_96")
        ])
        XCTAssertEqual(stats.codec, "H264")
    }

    func test_reduce_unknownCodecId_isNil() {
        let stats = CallStats.reduce(entries: [inbound("audio", packets: 40, codecId: "ghost")])
        XCTAssertNil(stats.codec)
    }

    func test_reduce_parsesRttFromCandidatePair() {
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "cp", type: "candidate-pair", values: ["currentRoundTripTime": 0.085])
        ])
        XCTAssertEqual(stats.roundTripTimeMs, 85, accuracy: 0.001)
    }

    func test_reduce_emptyReport_isZeroed() {
        let stats = CallStats.reduce(entries: [])
        XCTAssertEqual(stats.inboundPacketsReceived, 0)
        XCTAssertEqual(stats.outboundPacketsSent, 0)
        XCTAssertNil(stats.codec)
    }
}

// MARK: - Call Reliability Policy (§5.8)

@MainActor
final class CallReliabilityPolicyTests: XCTestCase {
    typealias Policy = CallReliabilityPolicy

    // --- Half-open self-heal ---

    func test_halfOpen_bidirectional_isHealthy() {
        let outcome = Policy.evaluateHalfOpen(inboundPackets: 50, outboundPackets: 50, secondsInConnected: 10)
        XCTAssertEqual(outcome, .healthy)
    }

    func test_halfOpen_withinGrace_waitsEvenWithZeroInbound() {
        // First second after handshake is legitimately packet-free.
        let outcome = Policy.evaluateHalfOpen(inboundPackets: 0, outboundPackets: 30, secondsInConnected: 1)
        XCTAssertEqual(outcome, .waiting)
    }

    func test_halfOpen_pastGrace_inboundZeroOutboundFlowing_heals() {
        let outcome = Policy.evaluateHalfOpen(inboundPackets: 0, outboundPackets: 30, secondsInConnected: 5)
        XCTAssertEqual(outcome, .healHalfOpen)
    }

    func test_halfOpen_pastGrace_noOutbound_waits() {
        // Both directions silent = mute / mic-off business condition, not a
        // transport fault. Do NOT trigger an ICE restart.
        let outcome = Policy.evaluateHalfOpen(inboundPackets: 0, outboundPackets: 0, secondsInConnected: 10)
        XCTAssertEqual(outcome, .waiting)
    }

    func test_halfOpen_inboundAboveThreshold_healthyRegardlessOfTime() {
        let outcome = Policy.evaluateHalfOpen(inboundPackets: 5, outboundPackets: 0, secondsInConnected: 0)
        XCTAssertEqual(outcome, .healthy)
    }

    // --- Connecting watchdog ---

    func test_connecting_early_waits() {
        let outcome = Policy.evaluateConnecting(secondsInConnecting: 3, didAttemptRestart: false)
        XCTAssertEqual(outcome, .waiting)
    }

    func test_connecting_pastRestartBudget_restartsOnce() {
        let outcome = Policy.evaluateConnecting(secondsInConnecting: 13, didAttemptRestart: false)
        XCTAssertEqual(outcome, .restartICE)
    }

    func test_connecting_afterRestartAttempted_waitsUntilFail() {
        let outcome = Policy.evaluateConnecting(secondsInConnecting: 13, didAttemptRestart: true)
        XCTAssertEqual(outcome, .waiting)
    }

    func test_connecting_pastFailBudget_fails() {
        let outcome = Policy.evaluateConnecting(secondsInConnecting: 26, didAttemptRestart: true)
        XCTAssertEqual(outcome, .fail)
    }

    func test_connecting_failBudgetWins_evenIfRestartNotAttempted() {
        let outcome = Policy.evaluateConnecting(secondsInConnecting: 30, didAttemptRestart: false)
        XCTAssertEqual(outcome, .fail)
    }
}

// MARK: - CallPillStatus (minimised call pill never shows a running timer pre-connection)

@MainActor
final class CallPillStatusTests: XCTestCase {

    func test_connected_isConnected_showsDuration() {
        XCTAssertEqual(CallPillStatus.from(.connected), .connected)
        XCTAssertTrue(CallPillStatus.from(.connected).isConnected,
                      "only an established call shows the live duration (green)")
    }

    func test_ringing_isNotConnected() {
        XCTAssertEqual(CallPillStatus.from(.ringing(isOutgoing: true)), .ringing)
        XCTAssertEqual(CallPillStatus.from(.ringing(isOutgoing: false)), .ringing)
        XCTAssertFalse(CallPillStatus.from(.ringing(isOutgoing: true)).isConnected,
                       "a ringing call must NOT show a running 00:00 timer")
    }

    func test_offeringAndConnecting_mapToConnecting_notConnected() {
        XCTAssertEqual(CallPillStatus.from(.offering), .connecting)
        XCTAssertEqual(CallPillStatus.from(.connecting), .connecting)
        XCTAssertFalse(CallPillStatus.from(.connecting).isConnected)
    }

    func test_reconnecting_isNotConnected() {
        XCTAssertEqual(CallPillStatus.from(.reconnecting(attempt: 2)), .reconnecting)
        XCTAssertFalse(CallPillStatus.from(.reconnecting(attempt: 2)).isConnected)
    }
}

// MARK: - Full-screen cover gate keeps the end-of-call panel reachable

/// `CallManager.endCallInternal` holds `.ended(reason:)` for ~1.5 s so the user
/// can read why the call ended (and the final duration) before the state resets
/// to `.idle`. The cover gate must therefore stay presented across `.ended`,
/// otherwise `CallView.endedView` is dead code that flashes away instantly.
@MainActor
final class CallCoverPresentationTests: XCTestCase {

    func test_isEnded_trueOnlyForEnded() {
        XCTAssertTrue(CallState.ended(reason: .local).isEnded)
        XCTAssertFalse(CallState.idle.isEnded)
        XCTAssertFalse(CallState.connected.isEnded)
        XCTAssertFalse(CallState.ringing(isOutgoing: true).isEnded)
    }

    func test_cover_activeCall_fullScreen_isPresented() {
        XCTAssertTrue(CallState.shouldPresentFullScreenCover(
            callState: .connected, displayMode: .fullScreen))
    }

    /// The bug: the call ends, state becomes `.ended`, and the cover used to
    /// dismiss instantly because `isActive` is `false` for `.ended`. The panel
    /// must remain reachable during the settle window.
    func test_cover_endedCall_fullScreen_staysPresented() {
        XCTAssertTrue(CallState.shouldPresentFullScreenCover(
            callState: .ended(reason: .local), displayMode: .fullScreen),
            "the end-of-call panel must stay up during the 1.5s settle window")
    }

    func test_cover_idle_isNotPresented() {
        XCTAssertFalse(CallState.shouldPresentFullScreenCover(
            callState: .idle, displayMode: .fullScreen),
            "no call → no cover, even though the user never minimised")
    }

    func test_cover_activeCall_pip_isNotPresented() {
        XCTAssertFalse(CallState.shouldPresentFullScreenCover(
            callState: .connected, displayMode: .pip),
            "in PiP the floating pill carries the call, not the full-screen cover")
    }

    func test_cover_endedCall_pip_isNotPresented() {
        XCTAssertFalse(CallState.shouldPresentFullScreenCover(
            callState: .ended(reason: .local), displayMode: .pip),
            "an ended call that was in PiP must not pop a full-screen cover")
    }
}

// MARK: - Prisme Linguistique: preferredCallLanguage (§Transcription Language Resolution)

/// Behavioural tests for `CallManager.preferredCallLanguage(for:)`.
/// Pure static function: no network, no singletons, no async.
/// Priority order: systemLanguage > regionalLanguage > "fr" fallback.
@MainActor
final class CallManagerPreferredCallLanguageTests: XCTestCase {

    private func makeUser(
        systemLanguage: String? = nil,
        regionalLanguage: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(id: "u1", username: "testuser",
                   systemLanguage: systemLanguage,
                   regionalLanguage: regionalLanguage)
    }

    func test_nilUser_returnsFrFallback() {
        XCTAssertEqual(CallManager.preferredCallLanguage(for: nil), "fr")
    }

    func test_systemLanguagePresent_returnsSystemLanguage() {
        let user = makeUser(systemLanguage: "en", regionalLanguage: "es")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "en")
    }

    func test_systemLanguageNil_regionalPresent_returnsRegionalLanguage() {
        let user = makeUser(systemLanguage: nil, regionalLanguage: "es")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "es")
    }

    func test_bothLanguagesNil_returnsFrFallback() {
        let user = makeUser(systemLanguage: nil, regionalLanguage: nil)
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "fr")
    }

    func test_systemLanguagePrioritisedOverRegional() {
        // Prisme Linguistique: priority 1 (systemLanguage) beats priority 2 (regionalLanguage)
        let user = makeUser(systemLanguage: "de", regionalLanguage: "fr")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "de")
    }

    func test_systemLanguageUsedEvenWhenRegionalIsFrench() {
        // When both are set, the explicit systemLanguage wins — "fr" regional must not shadow it
        let user = makeUser(systemLanguage: "zh", regionalLanguage: "fr")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "zh")
    }

    func test_onlySystemLanguage_noRegional_returnsSystem() {
        let user = makeUser(systemLanguage: "ar", regionalLanguage: nil)
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "ar")
    }
}
