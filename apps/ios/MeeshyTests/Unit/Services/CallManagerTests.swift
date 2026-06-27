import XCTest
import MeeshySDK
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
        XCTAssertFalse(CallState.ended(reason: .connectionLost).isActive)
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
    func applyAudioEncoding(maxBitrateBps: Int) {}
    func setMaxAudioBitrate(_ bitrate: Int) {}
    func sendDTMF(digits: String) {}
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
              let startMediaIdx = body.range(of: "performLocalMediaStart(isVideo:")?.lowerBound else {
            XCTFail("Expected emitCallJoin and performLocalMediaStart call sites in handleIncomingCallNotification")
            return
        }
        XCTAssertLessThan(
            emitJoinIdx,
            startMediaIdx,
            "Bug 2 guard: emitCallJoin MUST be called before kicking off performLocalMediaStart (which awaits " +
            "startLocalMedia) in handleIncomingCallNotification, otherwise the caller stays in .ringing(true) " +
            "until the callee's camera/mic warmup completes."
        )
    }

    func test_reportIncomingVoIPCall_emitsCallJoinBeforeStartLocalMedia() throws {
        let source = try sourceText()
        guard let body = body(of: "func reportIncomingVoIPCall", in: source) else {
            XCTFail("reportIncomingVoIPCall not found")
            return
        }
        guard let emitJoinIdx = body.range(of: "emitCallJoin(callId: callId)")?.lowerBound,
              let startMediaIdx = body.range(of: "performLocalMediaStart(isVideo:")?.lowerBound else {
            XCTFail("Expected emitCallJoin and performLocalMediaStart call sites in reportIncomingVoIPCall")
            return
        }
        XCTAssertLessThan(
            emitJoinIdx,
            startMediaIdx,
            "Bug 2 guard: emitCallJoin MUST be called before kicking off performLocalMediaStart (which awaits " +
            "startLocalMedia) in reportIncomingVoIPCall."
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

// MARK: - CallStats Reducer — packet-level (§5.7)

@MainActor
final class CallStatsPacketReducerTests: XCTestCase {
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

    func test_reduce_parsesAvailableOutgoingBitrateFromCandidatePair() {
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "cp", type: "candidate-pair",
                               values: ["currentRoundTripTime": 0.050, "availableOutgoingBitrate": 1_500_000.0])
        ])
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 1_500_000)
    }

    func test_reduce_noAvailableOutgoingBitrate_returnsZero() {
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "cp", type: "candidate-pair",
                               values: ["currentRoundTripTime": 0.050])
        ])
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 0)
    }

    func test_videoQualityLevel_fromBwe_excellent() {
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 2_000_000), .excellent)
    }

    func test_videoQualityLevel_fromBwe_good() {
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 1_200_000), .good)
    }

    func test_videoQualityLevel_fromBwe_fair() {
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 500_000), .fair)
    }

    func test_videoQualityLevel_fromBwe_poor() {
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 200_000), .poor)
    }

    func test_videoQualityLevel_fromBwe_critical() {
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 80_000), .critical)
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

    // --- Reconnecting watchdog (stalled ICE-restart escalation) ---
    //
    // A reconnection attempt whose ICE restart silently stalls (offer sent, peer
    // never answers, no new PC-state callback, no network flap) would otherwise
    // hang in `.reconnecting` forever — nothing re-arms `attemptReconnection`, so
    // the 3-attempt cap is never reached. The watchdog escalates once an attempt
    // overruns its budget; the existing `maxReconnectAttempts` cap then bounds the
    // total reconnection window and fails the call.

    func test_reconnecting_withinBudget_waits() {
        let outcome = Policy.evaluateReconnecting(secondsInAttempt: 5, budgetSeconds: 10)
        XCTAssertEqual(outcome, .waiting)
    }

    func test_reconnecting_atBudget_retries() {
        let outcome = Policy.evaluateReconnecting(secondsInAttempt: 10, budgetSeconds: 10)
        XCTAssertEqual(outcome, .retry)
    }

    func test_reconnecting_pastBudget_retries() {
        let outcome = Policy.evaluateReconnecting(secondsInAttempt: 13, budgetSeconds: 10)
        XCTAssertEqual(outcome, .retry)
    }

    func test_reconnecting_usesDefaultBudgetFromThresholds() {
        let justUnder = QualityThresholds.reconnectAttemptBudgetSeconds - 0.1
        XCTAssertEqual(Policy.evaluateReconnecting(secondsInAttempt: justUnder), .waiting)
        XCTAssertEqual(
            Policy.evaluateReconnecting(secondsInAttempt: QualityThresholds.reconnectAttemptBudgetSeconds),
            .retry
        )
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

// MARK: - VideoSurvivalController integration guards

/// Source-level guards for the `VideoSurvivalController` integration in `CallManager`.
/// The controller is constructed internally (not injectable), so we verify the
/// wiring via source inspection:
///   1. `$isVideoSuspended` binding so the @Published var mirrors the controller.
///   2. `videoSurvivalController.handle(level:userWantsVideo:)` called from the quality monitor.
///   3. `videoSurvivalController.reset()` called on teardown and camera-off to avoid state leakage.
@MainActor
final class VideoSurvivalControllerIntegrationTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `isVideoSuspended` must mirror the controller's `@Published` so SwiftUI
    /// views react to survival-triggered video suspension without coupling directly
    /// to the controller (which is internal to CallManager).
    func test_isVideoSuspended_isPublishedAndBoundToController() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("@Published private(set) var isVideoSuspended"),
            "CallManager must expose @Published private(set) var isVideoSuspended for UI binding"
        )
        XCTAssertTrue(
            source.contains("videoSurvivalController.$isVideoSuspended"),
            "isVideoSuspended must be driven by videoSurvivalController.$isVideoSuspended binding, " +
            "not set directly, to keep single-source-of-truth"
        )
    }

    /// The quality monitor must feed each quality level sample to the controller
    /// so it can decide when to suspend/resume video based on time-hysteresis.
    func test_qualityMonitor_feedsLevelToSurvivalController() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("videoSurvivalController.handle(level: level, userWantsVideo:"),
            "The quality monitor must call videoSurvivalController.handle(level:userWantsVideo:) " +
            "on every quality sample — omitting this breaks video suspension"
        )
    }

    /// On call teardown, the controller must be reset so its hysteresis timers
    /// don't bleed into the next call.
    func test_endCallInternal_resetsVideoSurvivalController() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func endCallInternal") else {
            XCTFail("endCallInternal not found in CallManager source"); return
        }
        let nextMark = source.range(of: "\n    // MARK:", range: funcRange.upperBound..<source.endIndex)?.lowerBound
                    ?? source.endIndex
        let body = String(source[funcRange.lowerBound..<nextMark])
        XCTAssertTrue(
            body.contains("videoSurvivalController.reset()"),
            "endCallInternal must call videoSurvivalController.reset() to clear hysteresis timers " +
            "and isVideoSuspended before the next call can start"
        )
    }

    /// When the user toggles the camera off, the controller must be reset so a
    /// prior degraded-streak timer doesn't immediately trigger suspension when
    /// video is re-enabled.
    func test_toggleVideo_off_resetsVideoSurvivalController() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("videoSurvivalController.reset()"),
            "Disabling the camera must reset videoSurvivalController so stale degradation " +
            "timers don't fire as soon as video is re-enabled"
        )
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

// MARK: - Thermal Critical: Video Downgrade (§5.4 / §5.6)

/// Source-level guard tests ensuring the thermal-critical video-disable path
/// uses the proper transceiver downgrade + SDP renegotiation rather than a
/// raw `enableVideo(false)` (track.enabled toggle only).
///
/// Root cause prevented: without `downgradeFromVideo()` + `createOffer()`, the
/// peer's SDP transceiver direction stays `sendRecv` while no video RTP flows
/// — the peer's decoder never tears down and the avatar placeholder is the
/// only signal, which is race-prone (media-toggled can arrive before the
/// thermal state is stable). Mirrors the manual `toggleVideo()` path (§5.4).
@MainActor
final class CallManagerThermalVideoDowngradeTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func thermalBody(_ source: String) throws -> String {
        guard let start = source.range(of: "func thermalStateDidChange") else {
            XCTFail("thermalStateDidChange not found in CallManager source"); return ""
        }
        let end = source.range(of: "\n// MARK:", range: start.upperBound..<source.endIndex)?.lowerBound
                ?? source.endIndex
        // Strip whole-line comments so the source-guards match on actual code, not
        // documentation that may legitimately reference a forbidden API (e.g. the
        // comment "rather than enableVideo(false)" explaining why it is NOT used).
        return String(source[start.lowerBound..<end])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func test_thermalCritical_usesDowngradeFromVideo_notEnableVideoFalse() throws {
        let body = try thermalBody(try callManagerSource())
        XCTAssertTrue(
            body.contains("downgradeFromVideo()"),
            "Thermal-critical video disable must call downgradeFromVideo() to set transceiver " +
            "direction (not just track.enabled). enableVideo(false) leaves the SDP sendRecv."
        )
        XCTAssertFalse(
            body.contains("enableVideo(false)"),
            "enableVideo(false) must not be used in the thermal-critical path — it only toggles " +
            "track.enabled without updating the transceiver direction or triggering renegotiation."
        )
    }

    func test_thermalCritical_updatesHasLocalVideoTrack() throws {
        let body = try thermalBody(try callManagerSource())
        XCTAssertTrue(
            body.contains("hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack"),
            "After downgradeFromVideo(), hasLocalVideoTrack must be synced so the UI (PiP, controls) " +
            "reflects the absence of a local video track."
        )
    }

    func test_thermalCritical_resetsVideoSurvivalController() throws {
        let body = try thermalBody(try callManagerSource())
        XCTAssertTrue(
            body.contains("videoSurvivalController.reset()"),
            "After a thermal-critical video downgrade, videoSurvivalController must be reset so " +
            "stale degradation timers don't immediately re-suspend video when it's re-enabled."
        )
    }

    func test_thermalCritical_sendsRenegotiationOffer_whenNeeded() throws {
        let body = try thermalBody(try callManagerSource())
        XCTAssertTrue(
            body.contains("needsRenegotiation") && body.contains("emitCallOffer"),
            "Thermal-critical video downgrade must trigger a renegotiation offer when " +
            "downgradeFromVideo() returns true, so the peer's SDP direction is updated."
        )
    }

    func test_thermalCritical_stillEmitsMediaToggledEvent() throws {
        let body = try thermalBody(try callManagerSource())
        XCTAssertTrue(
            body.contains("emitCallToggleVideo"),
            "Thermal-critical video downgrade must still emit call:media-toggled so the peer " +
            "shows the avatar placeholder immediately (before the renegotiation round-trip)."
        )
    }
}

// MARK: - Post-call diagnostics persistence

/// Covers the `CallManager.CallQualitySummary` type, the `lastCallSummary` static
/// accessor, and `CallStats` Codable conformance. All are pure-value / UserDefaults
/// level tests — no live WebRTC stack required.
@MainActor
final class CallQualitySummaryTests: XCTestCase {

    private let key = CallManager.lastCallSummaryDefaultsKey

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: key)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: key)
        super.tearDown()
    }

    // MARK: - CallStats Codable round-trip

    func test_callStats_codableRoundTrip_preservesAllFields() throws {
        let original = CallStats(
            roundTripTimeMs: 42.5,
            packetsLost: 3,
            bandwidth: 95_000,
            bytesReceived: 120_000,
            codec: "opus",
            inboundPacketsReceived: 150,
            inboundAudioPackets: 100,
            inboundVideoPackets: 50,
            outboundPacketsSent: 200,
            availableOutgoingBitrateBps: 500_000
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallStats.self, from: data)
        XCTAssertEqual(original, decoded)
    }

    func test_callStats_codableRoundTrip_nilCodecPreserved() throws {
        let original = CallStats(codec: nil)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallStats.self, from: data)
        XCTAssertNil(decoded.codec)
    }

    // MARK: - CallQualitySummary Codable round-trip

    func test_callQualitySummary_codableRoundTrip_allFieldsPresent() throws {
        let stats = CallStats(roundTripTimeMs: 75, packetsLost: 1, codec: "H264")
        let summary = CallManager.CallQualitySummary(
            callId: "abc123",
            remoteUser: "alice",
            durationSeconds: 123.4,
            endReason: "local",
            stats: stats
        )
        let data = try JSONEncoder().encode(summary)
        let decoded = try JSONDecoder().decode(CallManager.CallQualitySummary.self, from: data)
        XCTAssertEqual(decoded.callId, "abc123")
        XCTAssertEqual(decoded.remoteUser, "alice")
        XCTAssertEqual(decoded.durationSeconds, 123.4, accuracy: 0.001)
        XCTAssertEqual(decoded.endReason, "local")
        XCTAssertEqual(decoded.stats?.roundTripTimeMs, 75)
        XCTAssertEqual(decoded.stats?.codec, "H264")
    }

    func test_callQualitySummary_codableRoundTrip_nilStatsPreserved() throws {
        let summary = CallManager.CallQualitySummary(
            callId: nil, remoteUser: nil, durationSeconds: 0, endReason: "missed", stats: nil
        )
        let data = try JSONEncoder().encode(summary)
        let decoded = try JSONDecoder().decode(CallManager.CallQualitySummary.self, from: data)
        XCTAssertNil(decoded.stats)
        XCTAssertNil(decoded.callId)
    }

    // MARK: - lastCallSummary UserDefaults accessor

    func test_lastCallSummary_isNil_whenNoDataPersisted() {
        XCTAssertNil(CallManager.lastCallSummary, "No summary stored yet → accessor must return nil")
    }

    func test_lastCallSummary_returnsDecodedSummary_afterManualWrite() throws {
        let summary = CallManager.CallQualitySummary(
            callId: "xyz", remoteUser: "bob", durationSeconds: 60, endReason: "remote", stats: nil
        )
        let data = try JSONEncoder().encode(summary)
        UserDefaults.standard.set(data, forKey: key)

        let read = CallManager.lastCallSummary
        XCTAssertEqual(read?.callId, "xyz")
        XCTAssertEqual(read?.remoteUser, "bob")
        XCTAssertEqual(read?.endReason, "remote")
    }

    func test_lastCallSummary_returnsNil_whenDataIsCorrupt() {
        UserDefaults.standard.set(Data("not-json".utf8), forKey: key)
        XCTAssertNil(CallManager.lastCallSummary, "Corrupt data must not crash — returns nil")
    }

    // MARK: - lastCallSummaryDefaultsKey format

    func test_lastCallSummaryDefaultsKey_isStableReversedomainNotation() {
        XCTAssertEqual(
            CallManager.lastCallSummaryDefaultsKey,
            "me.meeshy.lastCallQualitySummary",
            "Key must remain stable across builds — changing it would orphan persisted summaries")
    }
}

// MARK: - Stale-callId Guards (Fix 9 & Fix 10)

/// Source-analysis guards verifying the `self.currentCallId == callId` invariant
/// is present in every async path that calls `createOffer()` and then
/// `emitCallOffer()`. These tests prevent regressions where a call that ends
/// *while* `createOffer()` suspends is wrongly told to `endCallInternal(.failed)`
/// or emits a stale SDP offer for a dead session.
@MainActor
final class CallManagerStaleCallIdGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: Fix 9 — thermalStateDidChange renegotiation path

    func test_thermalStateDidChange_renegotiationBlock_hasStaleCallIdGuard() throws {
        // The thermal-critical branch calls `createOffer()` under `await`. Without a
        // post-await `self.currentCallId == callId` guard, the offer is emitted for a
        // call that may have ended during the SDP-creation suspension window.
        let src = try source()

        guard let thermalRange = src.range(of: "thermalStateDidChange") else {
            XCTFail("thermalStateDidChange not found in CallManager.swift")
            return
        }
        // Bound to the thermal handler body — up to the next top-level closing brace
        // that returns to the class scope (heuristic: next `\n    func ` or `\n}`).
        let searchEnd = src.range(
            of: "\n    func ",
            range: thermalRange.upperBound..<src.endIndex
        )?.lowerBound ?? src.endIndex
        let thermalBody = String(src[thermalRange.lowerBound..<searchEnd])

        // Must see `let offer = await self.webRTCService.createOffer()` followed by
        // `, self.currentCallId == callId` (the post-await stale-callId guard).
        let hasCreateOffer = thermalBody.contains("await self.webRTCService.createOffer()")
        XCTAssertTrue(hasCreateOffer,
            "thermalStateDidChange must contain a createOffer() suspension point")

        // The guard must appear as part of the same `if let` chain: the condition
        // `, self.currentCallId == callId` must follow `let offer = await`.
        guard let createOfferIdx = thermalBody.range(of: "let offer = await self.webRTCService.createOffer()")?.lowerBound else {
            XCTFail("createOffer expression not found in thermalStateDidChange body")
            return
        }
        let afterOffer = String(thermalBody[createOfferIdx...])
        XCTAssertTrue(
            afterOffer.contains("self.currentCallId == callId"),
            "Fix 9 regression: thermalStateDidChange renegotiation block must guard " +
            "`self.currentCallId == callId` after `await createOffer()` to prevent " +
            "emitting a stale SDP offer for a call that ended during the suspension window."
        )
    }

    // MARK: Fix 10 — listenForParticipantJoined nil-offer path

    func test_listenForParticipantJoined_nilOffer_doesNotClobberCleanEnd() throws {
        // When `createOffer()` returns nil because the call ended while it was
        // suspended (peerConnection torn down → nil SDP), the old code called
        // `endCallInternal(.failed)` unconditionally, clobbering the clean end reason.
        // Fix 10: guard `self.currentCallId == callId` BEFORE calling endCallInternal
        // on the nil path.
        let src = try source()

        guard let joinRange = src.range(of: "func listenForParticipantJoined") else {
            XCTFail("listenForParticipantJoined not found in CallManager.swift")
            return
        }
        let searchEnd = src.range(
            of: "\n    private func ",
            range: joinRange.upperBound..<src.endIndex
        )?.lowerBound ?? src.endIndex
        let joinBody = String(src[joinRange.lowerBound..<searchEnd])

        // Find the `guard let offer = await …` nil path.
        guard let guardOfferRange = joinBody.range(of: "guard let offer = await self.webRTCService.createOffer()") else {
            XCTFail("nil-offer guard not found in listenForParticipantJoined Task body")
            return
        }
        // The code immediately following the guard's else branch must check the callId
        // before calling endCallInternal — i.e. another `currentCallId == callId` guard.
        let afterGuard = String(joinBody[guardOfferRange.lowerBound...])
        XCTAssertTrue(
            afterGuard.contains("self.currentCallId == callId"),
            "Fix 10 regression (nil-offer path): listenForParticipantJoined must check " +
            "`self.currentCallId == callId` before `endCallInternal(.failed(...))` so a " +
            "call that ended cleanly during createOffer() suspension is not re-ended with .failed."
        )
    }

    func test_listenForParticipantJoined_successOffer_hasStaleCallIdGuard() throws {
        // Even when createOffer() succeeds, the call may have ended during the
        // suspension. The success path must also guard `currentCallId == callId`
        // before emitting the offer (duplicate-callId + epoch pollution otherwise).
        let src = try source()

        guard let joinRange = src.range(of: "func listenForParticipantJoined") else {
            XCTFail("listenForParticipantJoined not found in CallManager.swift")
            return
        }
        let searchEnd = src.range(
            of: "\n    private func ",
            range: joinRange.upperBound..<src.endIndex
        )?.lowerBound ?? src.endIndex
        let joinBody = String(src[joinRange.lowerBound..<searchEnd])

        // The success path calls emitCallOffer. Immediately before it there must be
        // a guard that checks currentCallId == callId.
        guard let emitIdx = joinBody.range(of: "self.emitCallOffer(callId: callId, toUserId: toUserId")?.lowerBound else {
            XCTFail("emitCallOffer call not found in listenForParticipantJoined success path")
            return
        }
        // Look for the stale-callId guard between the end of the nil-offer guard block
        // and emitCallOffer.
        let beforeEmit = String(joinBody[joinBody.startIndex..<emitIdx])
        // There should be at least two occurrences of `currentCallId == callId` in the
        // Task body: one for the nil path, one for the success path.
        let guardOccurrences = beforeEmit.components(separatedBy: "self.currentCallId == callId").count - 1
        XCTAssertGreaterThanOrEqual(
            guardOccurrences, 2,
            "Fix 10 regression (success path): listenForParticipantJoined must guard " +
            "`self.currentCallId == callId` on BOTH the nil-offer path AND the success path, " +
            "before calling emitCallOffer."
        )
    }
}

// MARK: - ICE restart task serialization source guards

/// Guards that `attemptReconnection()` tracks its in-flight Task via
/// `iceRestartTask`, cancels any prior one before starting a new one, and
/// clears the property on teardown. Without this serialisation, two concurrent
/// calls (e.g. a watchdog firing during exponential-backoff sleep) would both
/// eventually send ICE restart SDP offers and corrupt the perfect-negotiation
/// state machine — both peers enter `makingOffer=true` simultaneously with no
/// polite-peer resolution path.
@MainActor
final class ICERestartTaskSerializationTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// CallManager must own an `iceRestartTask` property to track the in-flight
    /// ICE restart. Without a named property there is no way to cancel a prior
    /// restart before starting the next one.
    func test_callManager_declaresIceRestartTaskProperty() throws {
        let src = try callManagerSource()
        XCTAssertTrue(
            src.contains("private var iceRestartTask: Task<Void, Never>?"),
            "CallManager must declare `private var iceRestartTask: Task<Void, Never>?` to " +
            "track the in-flight ICE restart task. Without a named property, overlapping " +
            "calls to attemptReconnection() create two concurrent Tasks that both eventually " +
            "send restart offers and corrupt the perfect-negotiation state machine."
        )
    }

    /// `attemptReconnection` must cancel any previous task before starting a new
    /// one. A second reconnection attempt (e.g. the watchdog fires mid-backoff)
    /// must kill the sleeping first attempt to prevent two concurrent offers.
    func test_attemptReconnection_cancelsExistingTaskBeforeStartingNew() throws {
        let src = try callManagerSource()
        guard let funcRange = src.range(of: "func attemptReconnection()") else {
            XCTFail("attemptReconnection() not found in CallManager.swift"); return
        }
        let bodyEnd = src.range(of: "\n    }", range: funcRange.upperBound..<src.endIndex)?.upperBound
            ?? src.endIndex
        let body = String(src[funcRange.lowerBound..<bodyEnd])
        XCTAssertTrue(
            body.contains("iceRestartTask?.cancel()"),
            "attemptReconnection must cancel the previous iceRestartTask before creating a " +
            "new one — two concurrent Tasks sending restart offers corrupt perfect negotiation."
        )
        XCTAssertTrue(
            body.contains("iceRestartTask = Task"),
            "attemptReconnection must assign the new Task to iceRestartTask so subsequent " +
            "calls can cancel it."
        )
    }

    /// `endCallInternal` must cancel and nil the ICE restart task as part of
    /// teardown so a mid-restart offer is not sent after the call has ended.
    func test_endCallInternal_cancelsAndNilsIceRestartTask() throws {
        let src = try callManagerSource()
        guard let funcRange = src.range(of: "func endCallInternal") else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        let bodyEnd = src.range(of: "\n    // MARK:", range: funcRange.upperBound..<src.endIndex)?.lowerBound
            ?? src.endIndex
        let body = String(src[funcRange.lowerBound..<bodyEnd])
        XCTAssertTrue(
            body.contains("iceRestartTask?.cancel()"),
            "endCallInternal must cancel iceRestartTask to prevent a mid-restart offer from " +
            "being sent after the call has ended."
        )
        XCTAssertTrue(
            body.contains("iceRestartTask = nil"),
            "endCallInternal must nil iceRestartTask after cancelling to release the Task object."
        )
    }
}

// MARK: - isCallActiveFlag thread-safety source guard

@MainActor
final class CallManagerIsCallActiveFlagSourceGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_isCallActiveFlag_isNotUnsafeNonisolated() throws {
        let src = try callManagerSource()
        XCTAssertFalse(
            src.contains("nonisolated(unsafe) static var isCallActiveFlag"),
            "isCallActiveFlag must NOT use nonisolated(unsafe) — it is read from non-MainActor threads " +
            "and requires a lock guard (OSAllocatedUnfairLock) to prevent a Swift 6 data race."
        )
    }

    func test_isCallActiveFlag_usesOSAllocatedUnfairLock() throws {
        let src = try callManagerSource()
        XCTAssertTrue(
            src.contains("OSAllocatedUnfairLock"),
            "isCallActiveFlag backing store must use OSAllocatedUnfairLock so concurrent " +
            "socket-thread reads are serialised against @MainActor writes."
        )
    }
}

// MARK: - CallKit delegate action-fulfillment timing source guards

@MainActor
final class CallKitActionFulfillmentSourceGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `CXAnswerCallAction.fulfill()` must appear BEFORE the `Task {` that calls
    /// `answerCallReady()` — not inside it. The Task is for async media setup;
    /// the action settlement tells CallKit the call is answered at the UI layer.
    func test_cxAnswerCallAction_fulfilledBeforeTask() throws {
        let src = try callManagerSource()
        guard let answerRange = src.range(of: "perform action: CXAnswerCallAction") else {
            XCTFail("CXAnswerCallAction handler not found"); return
        }
        // Find the end of this function body (next top-level `}` after the function
        // header). We look for the pattern after the function opening brace.
        let bodyStart = src[answerRange.upperBound...].firstIndex(of: "{") ?? src.endIndex
        let bodyFragment = String(src[bodyStart...].prefix(400))

        let fulfillOffset = bodyFragment.range(of: "action.fulfill()")?.lowerBound
        let taskOffset = bodyFragment.range(of: "Task {")?.lowerBound
        XCTAssertNotNil(fulfillOffset, "action.fulfill() must exist in CXAnswerCallAction handler")
        XCTAssertNotNil(taskOffset, "Task { must exist in CXAnswerCallAction handler for async setup")
        if let f = fulfillOffset, let t = taskOffset {
            XCTAssertTrue(f < t,
                "CXAnswerCallAction: action.fulfill() must appear BEFORE Task { — " +
                "settling inside the Task is async and may never fire if manager is nil or Task is cancelled.")
        }
    }

    /// `CXEndCallAction.fulfill()` must appear BEFORE the `Task {` that calls
    /// `endCall()`. Moving it inside the Task means CallKit may time out the
    /// action before `endCall()` completes.
    func test_cxEndCallAction_fulfilledBeforeTask() throws {
        let src = try callManagerSource()
        guard let endRange = src.range(of: "perform action: CXEndCallAction") else {
            XCTFail("CXEndCallAction handler not found"); return
        }
        let bodyStart = src[endRange.upperBound...].firstIndex(of: "{") ?? src.endIndex
        let bodyFragment = String(src[bodyStart...].prefix(2500))

        let fulfillOffset = bodyFragment.range(of: "action.fulfill()")?.lowerBound
        let taskOffset = bodyFragment.range(of: "Task {")?.lowerBound
        XCTAssertNotNil(fulfillOffset, "action.fulfill() must exist in CXEndCallAction handler")
        XCTAssertNotNil(taskOffset, "Task { must exist in CXEndCallAction handler for async teardown")
        if let f = fulfillOffset, let t = taskOffset {
            XCTAssertTrue(f < t,
                "CXEndCallAction: action.fulfill() must appear BEFORE Task { — " +
                "settling inside the Task creates a CallKit timeout window if manager deallocs mid-flight.")
        }
    }
}

// MARK: - handleHold tracked task guard

@MainActor
final class HandleHoldTaskTrackingTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_holdVideoTask_propertyExists() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("private var holdVideoTask: Task<Void, Never>?"),
            "handleHold must store its video tasks in holdVideoTask to allow cancellation on rapid hold→unhold"
        )
    }

    func test_handleHold_cancelsPreviousTask_beforeCreatingNew() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleHold") else {
            XCTFail("handleHold not found"); return
        }
        let nextFunc = [
            source.range(of: "\n    func ", range: funcRange.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    private func ", range: funcRange.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: funcRange.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        let body = String(source[funcRange.lowerBound..<nextFunc])

        guard let cancelRange = body.range(of: "holdVideoTask?.cancel()"),
              let assignRange = body.range(of: "holdVideoTask = Task") else {
            XCTFail("handleHold must cancel then assign holdVideoTask"); return
        }
        XCTAssertLessThan(
            cancelRange.lowerBound,
            assignRange.lowerBound,
            "holdVideoTask?.cancel() must appear before holdVideoTask = Task to prevent concurrent hold/unhold video operations"
        )
    }

    func test_endCallInternal_cancelsHoldVideoTask() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func endCallInternal") else {
            XCTFail("endCallInternal not found"); return
        }
        let nextMark = source.range(of: "\n    // MARK:", range: funcRange.upperBound..<source.endIndex)?.lowerBound
                    ?? source.endIndex
        let body = String(source[funcRange.lowerBound..<nextMark])
        XCTAssertTrue(
            body.contains("holdVideoTask?.cancel()"),
            "endCallInternal must cancel holdVideoTask to avoid dangling video ops after call teardown"
        )
    }
}

// MARK: - VoIP Push Freshness (Bug D) source guards

@MainActor
final class VoIPFreshnessSourceGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func freshnessBody(in source: String) -> String? {
        guard let range = source.range(of: "func checkVoIPCallFreshness") else { return nil }
        let nextFunc = source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound
                    ?? source.range(of: "\n    func ", range: range.upperBound..<source.endIndex)?.lowerBound
                    ?? source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound
                    ?? source.endIndex
        return String(source[range.lowerBound..<nextFunc])
    }

    func test_freshness_404_endsCallWithMissed() throws {
        let source = try callManagerSource()
        guard let body = freshnessBody(in: source) else {
            XCTFail("checkVoIPCallFreshness not found"); return
        }
        XCTAssertTrue(
            body.contains("statusCode == 404"),
            "Bug D: freshness check must handle 404 (call not found on server)"
        )
        guard let notFoundRange = body.range(of: "statusCode == 404") else { return }
        // 500-char window: the long [VOIP_FRESHNESS] warning log between the 404
        // branch and `endCallInternal(reason: .missed)` pushes `.missed` past the
        // original 300-char window. 500 still stops well before the terminal-status
        // block's own `.missed` (~600+ chars away), so the first 404 branch is matched.
        let segment = String(body[notFoundRange.lowerBound...].prefix(500))
        XCTAssertTrue(
            segment.contains("reason: .unanswered"),
            "Bug D: 404 path must report the phantom call as .unanswered to CX (not .failed)"
        )
        XCTAssertTrue(
            segment.contains("reason: .missed"),
            "Bug D: 404 path must end the call internally with .missed (not .failed)"
        )
    }

    func test_freshness_terminalStatuses_areComplete() throws {
        let source = try callManagerSource()
        guard let body = freshnessBody(in: source) else {
            XCTFail("checkVoIPCallFreshness not found"); return
        }
        XCTAssertTrue(body.contains("\"ended\""), "Bug D: 'ended' must be in the terminal status set")
        XCTAssertTrue(body.contains("\"missed\""), "Bug D: 'missed' must be in the terminal status set")
        XCTAssertTrue(body.contains("\"rejected\""), "Bug D: 'rejected' must be in the terminal status set")
        XCTAssertTrue(body.contains("\"failed\""), "Bug D: 'failed' must be in the terminal status set")
    }

    func test_freshness_opaque_response_assumesFresh() throws {
        let source = try callManagerSource()
        guard let body = freshnessBody(in: source) else {
            XCTFail("checkVoIPCallFreshness not found"); return
        }
        XCTAssertTrue(
            body.contains("assuming fresh"),
            "Bug D: opaque / non-200 response must be treated as fresh (fail-open) to avoid false phantom-call teardowns"
        )
    }

    func test_freshness_liveness_guard_before_endCall() throws {
        let source = try callManagerSource()
        guard let body = freshnessBody(in: source) else {
            XCTFail("checkVoIPCallFreshness not found"); return
        }
        XCTAssertTrue(
            body.contains("activeCallUUID == uuid"),
            "Bug D: freshness check must guard on activeCallUUID == uuid before ending call to avoid tearing down a new call"
        )
        guard let guardRange = body.range(of: "activeCallUUID == uuid"),
              let endRange = body.range(of: "endCallInternal(reason: .missed)") else { return }
        XCTAssertLessThan(
            guardRange.lowerBound,
            endRange.lowerBound,
            "Bug D: liveness guard must appear before endCallInternal(.missed)"
        )
    }

    func test_freshness_uses_configuredTimeout() throws {
        let source = try callManagerSource()
        guard let body = freshnessBody(in: source) else {
            XCTFail("checkVoIPCallFreshness not found"); return
        }
        XCTAssertTrue(
            body.contains("voipFreshnessTimeoutSeconds"),
            "Bug D: freshness check must use QualityThresholds.voipFreshnessTimeoutSeconds (not a magic number)"
        )
    }

    func test_freshness_voipFreshnessTimeout_isReasonable() {
        XCTAssertGreaterThan(
            QualityThresholds.voipFreshnessTimeoutSeconds, 0,
            "voipFreshnessTimeoutSeconds must be positive"
        )
        XCTAssertLessThanOrEqual(
            QualityThresholds.voipFreshnessTimeoutSeconds, 10,
            "voipFreshnessTimeoutSeconds must be ≤10s — a slow freshness check delays the CallKit UI"
        )
    }
}

// MARK: - endCurrentAndAnswerPending race condition guard

@MainActor
final class EndCurrentAndAnswerPendingTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func functionBody(of signature: String, in source: String) -> String? {
        guard let range = source.range(of: signature) else { return nil }
        let nextFunc = [
            source.range(of: "\n    func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        return String(source[range.lowerBound..<nextFunc])
    }

    func test_endCurrentAndAnswerPending_hasSettleDelay() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func endCurrentAndAnswerPending", in: source) else {
            XCTFail("endCurrentAndAnswerPending not found"); return
        }
        XCTAssertTrue(
            body.contains("Task.sleep"),
            "endCurrentAndAnswerPending must sleep before routing the pending call to allow the previous call's " +
            "socket/WebRTC teardown to complete (avoids endCallInternal racing with handleIncomingCallNotification)"
        )
    }

    func test_endCurrentAndAnswerPending_clearsPendingInsideTask() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func endCurrentAndAnswerPending", in: source) else {
            XCTFail("endCurrentAndAnswerPending not found"); return
        }
        guard let taskRange = body.range(of: "Task {") else {
            XCTFail("Task { not found in endCurrentAndAnswerPending"); return
        }
        let insideTask = String(body[taskRange.lowerBound...])
        XCTAssertTrue(
            insideTask.contains("pendingIncomingCall = nil"),
            "pendingIncomingCall must be cleared INSIDE the Task, after handleIncomingCallNotification, " +
            "to avoid a second endCurrentAndAnswerPending() racing with the first"
        )
    }

    func test_endCurrentAndAnswerPending_guardsPendingBeforeEndCall() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func endCurrentAndAnswerPending", in: source) else {
            XCTFail("endCurrentAndAnswerPending not found"); return
        }
        guard let guardRange = body.range(of: "guard let pending = pendingIncomingCall"),
              let endCallRange = body.range(of: "endCall()") else {
            XCTFail("Expected guard + endCall in endCurrentAndAnswerPending"); return
        }
        XCTAssertLessThan(
            guardRange.lowerBound,
            endCallRange.lowerBound,
            "endCurrentAndAnswerPending must guard that a pending call exists before ending the current call"
        )
    }
}

// MARK: - performLocalMediaStart deduplication guard

@MainActor
final class LocalMediaStartHelperTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func functionBody(of signature: String, in source: String) -> String? {
        guard let range = source.range(of: signature) else { return nil }
        let nextFunc = [
            source.range(of: "\n    func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        return String(source[range.lowerBound..<nextFunc])
    }

    func test_performLocalMediaStart_helperExists() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("func performLocalMediaStart(isVideo: Bool, callId: String)"),
            "CallManager must have a private performLocalMediaStart(isVideo:callId:) helper to avoid triplication"
        )
    }

    func test_performLocalMediaStart_handlesCancellationError() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func performLocalMediaStart", in: source) else {
            XCTFail("performLocalMediaStart not found"); return
        }
        XCTAssertTrue(
            body.contains("CancellationError"),
            "performLocalMediaStart must catch CancellationError — media warmup can be cancelled when a call ends mid-flight"
        )
    }

    func test_performLocalMediaStart_degradesOnSimulatorVideoUnsupported() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func performLocalMediaStart", in: source) else {
            XCTFail("performLocalMediaStart not found"); return
        }
        XCTAssertTrue(
            body.contains("simulatorVideoUnsupported"),
            "performLocalMediaStart must handle simulatorVideoUnsupported and fall back to audio-only"
        )
        XCTAssertTrue(
            body.contains("isVideoEnabled = false"),
            "performLocalMediaStart must set isVideoEnabled = false on video degradation"
        )
    }

    func test_callers_useHelper_notInlineDoCatch() throws {
        let source = try callManagerSource()

        let methods = [
            "func startCall(",
            "func reportIncomingVoIPCall(",
            "func handleIncomingCallNotification(",
        ]
        for method in methods {
            guard let body = functionBody(of: method, in: source) else {
                XCTFail("\(method) not found"); continue
            }
            XCTAssertFalse(
                body.contains("catch WebRTCError.simulatorVideoUnsupported"),
                "\(method) must not inline the simulatorVideoUnsupported catch — use performLocalMediaStart"
            )
            XCTAssertTrue(
                body.contains("performLocalMediaStart"),
                "\(method) must delegate to performLocalMediaStart"
            )
        }
    }

    func test_performLocalMediaStart_hasLivenessGuardBeforeEndCall() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func performLocalMediaStart", in: source) else {
            XCTFail("performLocalMediaStart not found"); return
        }
        XCTAssertTrue(
            body.contains("currentCallId == callId"),
            "performLocalMediaStart must guard on currentCallId == callId before mutating state or ending the call"
        )
        guard let guardRange = body.range(of: "currentCallId == callId"),
              let endCallRange = body.range(of: "endCallInternal(") else { return }
        XCTAssertLessThan(
            guardRange.lowerBound,
            endCallRange.lowerBound,
            "Liveness guard must appear before endCallInternal in performLocalMediaStart"
        )
    }
}

// MARK: - Audio interruption always-reactivate guard

/// Verifies that `handleAudioInterruption` ALWAYS re-enables the RTCAudioSession
/// when an interruption ends, regardless of whether iOS includes the
/// `.shouldResume` option hint. iOS frequently omits this hint after alarms,
/// Siri, and GSM calls — relying on it as a gate leaves calls permanently silent.
@MainActor
final class AudioInterruptionReactivationTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func interruptionHandlerBody(in source: String) -> String? {
        guard let range = source.range(of: "func handleAudioInterruption(") else { return nil }
        let bodyEnd = [
            source.range(of: "\n    @MainActor\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        return String(source[range.lowerBound..<bodyEnd])
    }

    /// `isAudioEnabled = true` must appear OUTSIDE the `shouldResume` branch so
    /// it runs unconditionally when the interruption ends.
    func test_handleAudioInterruption_ended_alwaysEnablesRTC_notGatedOnShouldResume() throws {
        let source = try callManagerSource()
        guard let body = interruptionHandlerBody(in: source) else {
            XCTFail("handleAudioInterruption not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("rtc.isAudioEnabled = true"),
            "handleAudioInterruption must re-enable RTCAudioSession when interruption ends — " +
            "iOS omits shouldResume after alarms/Siri/GSM calls, so reactivation cannot be gated on the hint"
        )
        // Verify reactivation is UNCONDITIONAL (not inside the `.shouldResume` conditional block).
        // The `.shouldResume` branch only affects logging; the `audioSessionQueue.async` block
        // with `isAudioEnabled = true` must fall outside it.
        guard let shouldResumeRange = body.range(of: "shouldResume") else {
            XCTFail("shouldResume check not found — expected conditional log for diagnostic purposes"); return
        }
        guard let enableRange = body.range(of: "rtc.isAudioEnabled = true") else {
            XCTFail("rtc.isAudioEnabled = true not found"); return
        }
        // `audioSessionQueue.async` (the reactivation block) must start AFTER the
        // shouldResume conditional log, not inside it.
        guard let asyncRange = body.range(of: "audioSessionQueue.async") else {
            XCTFail("audioSessionQueue.async not found — interruption handler must use the audio session queue"); return
        }
        XCTAssertGreaterThan(
            asyncRange.lowerBound,
            shouldResumeRange.lowerBound,
            "The audioSessionQueue.async reactivation block must follow (not nest inside) the shouldResume log"
        )
        XCTAssertGreaterThan(
            enableRange.lowerBound,
            shouldResumeRange.lowerBound,
            "rtc.isAudioEnabled = true must appear after the shouldResume check, confirming it is unconditional"
        )
    }

    /// The handler must call `rtc.audioSessionDidActivate` before enabling audio,
    /// because RTCAudioSession requires the system AVAudioSession to be active first.
    func test_handleAudioInterruption_ended_bridgesSystemSessionBeforeEnabling() throws {
        let source = try callManagerSource()
        guard let body = interruptionHandlerBody(in: source) else {
            XCTFail("handleAudioInterruption not found"); return
        }
        XCTAssertTrue(
            body.contains("audioSessionDidActivate"),
            "handleAudioInterruption must call rtc.audioSessionDidActivate(AVAudioSession.sharedInstance()) " +
            "to bridge the system session back into WebRTC before setting isAudioEnabled = true"
        )
        guard let bridgeRange = body.range(of: "audioSessionDidActivate"),
              let enableRange = body.range(of: "isAudioEnabled = true") else { return }
        XCTAssertLessThan(
            bridgeRange.lowerBound,
            enableRange.lowerBound,
            "audioSessionDidActivate must be called before isAudioEnabled = true — " +
            "enabling audio before the bridge causes WebRTC to try to use a deactivated session"
        )
    }

    /// The handler must guard `callState.isActive` to avoid reactivating the audio
    /// session for a notification that arrives after the call has ended.
    func test_handleAudioInterruption_guardsCallStateIsActive() throws {
        let source = try callManagerSource()
        guard let body = interruptionHandlerBody(in: source) else {
            XCTFail("handleAudioInterruption not found"); return
        }
        XCTAssertTrue(
            body.contains("callState.isActive"),
            "handleAudioInterruption must guard callState.isActive — " +
            "the notification can arrive after the call has ended"
        )
    }
}

// MARK: - Audio route change state reconciliation guard

/// Verifies that `handleAudioRouteChange` correctly reconciles the `isSpeaker`
/// flag when the audio route changes externally (Bluetooth connect/disconnect).
@MainActor
final class AudioRouteChangeStateReconciliationTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func routeChangeHandlerBody(in source: String) -> String? {
        guard let range = source.range(of: "func handleAudioRouteChange(") else { return nil }
        let bodyEnd = [
            source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    @MainActor\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        return String(source[range.lowerBound..<bodyEnd])
    }

    /// When a new device (Bluetooth, headset) becomes available, `isSpeaker` must
    /// be set to false — iOS automatically routes audio to the new device, and the
    /// UI must reflect that the built-in speaker is no longer active.
    func test_handleAudioRouteChange_newDeviceAvailable_setsSpeakerFalse() throws {
        let source = try callManagerSource()
        guard let body = routeChangeHandlerBody(in: source) else {
            XCTFail("handleAudioRouteChange not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("newDeviceAvailable"),
            "handleAudioRouteChange must handle the .newDeviceAvailable case"
        )
        XCTAssertTrue(
            body.contains("isSpeaker = false"),
            "handleAudioRouteChange must set isSpeaker = false when a new audio device connects — " +
            "iOS routes to the new device automatically and the UI speaker button must reflect this"
        )
    }

    /// When a device is removed (Bluetooth disconnect, headset unplug), iOS routes
    /// back to the built-in receiver. We must re-apply the current `isSpeaker`
    /// preference so `applySpeakerRoute` ensures the correct output port is set.
    func test_handleAudioRouteChange_oldDeviceUnavailable_reappliesSpeakerRoute() throws {
        let source = try callManagerSource()
        guard let body = routeChangeHandlerBody(in: source) else {
            XCTFail("handleAudioRouteChange not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("oldDeviceUnavailable"),
            "handleAudioRouteChange must handle the .oldDeviceUnavailable case"
        )
        guard let oldDeviceRange = body.range(of: "oldDeviceUnavailable") else { return }
        let afterOldDevice = String(body[oldDeviceRange.upperBound...])
        XCTAssertTrue(
            afterOldDevice.contains("applySpeakerRoute()"),
            "handleAudioRouteChange must call applySpeakerRoute() after a device becomes unavailable — " +
            "this re-applies the user's speaker preference to the newly-selected built-in route"
        )
    }

    /// The `.override` case (our own `overrideOutputAudioPort` call) must NOT
    /// call `applySpeakerRoute()` again — doing so would create an infinite loop
    /// (applySpeakerRoute → override → routeChange → applySpeakerRoute → …).
    func test_handleAudioRouteChange_override_doesNotCallApplySpeakerRoute() throws {
        let source = try callManagerSource()
        guard let body = routeChangeHandlerBody(in: source) else {
            XCTFail("handleAudioRouteChange not found"); return
        }
        XCTAssertTrue(
            body.contains("override"),
            "handleAudioRouteChange must handle the .override case"
        )
        guard let overrideRange = body.range(of: "case .override") else {
            XCTFail(".override case not found"); return
        }
        // Find the end of the .override case block (the `default:` label or next case).
        let afterOverride = String(body[overrideRange.upperBound...])
        let boundaries = [
            afterOverride.range(of: "\n        case ")?.lowerBound,
            afterOverride.range(of: "\n        default:")?.lowerBound,
        ].compactMap { $0 }.min()
        guard let endIdx = boundaries else { return }
        let overrideBlock = String(afterOverride[afterOverride.startIndex..<endIdx])
        XCTAssertFalse(
            overrideBlock.contains("applySpeakerRoute()"),
            ".override case must not call applySpeakerRoute() — doing so creates a " +
            "recursive route-change loop (override fires a routeChange notification)"
        )
    }
}

// MARK: - applyNegotiationRole epoch reset guard

/// Verifies that `applyNegotiationRole` resets the negotiation epoch (negotiationId)
/// to zero at the start of each call. Without this reset, a lingering high-water
/// mark from the previous call would cause the first offer of the new call to be
/// rejected as "stale" — silently breaking call setup.
@MainActor
final class NegotiationEpochResetTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func functionBody(of signature: String, in source: String) -> String? {
        guard let range = source.range(of: signature) else { return nil }
        let nextBoundary = [
            source.range(of: "\n    func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    @MainActor\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        return String(source[range.lowerBound..<nextBoundary])
    }

    /// `applyNegotiationRole` must reset `negotiationId` to 0 so the new call
    /// starts from a clean epoch. If it did not reset, a negotiationId of (say) 5
    /// from the last call would reject any offer with generation < 5 as stale.
    func test_applyNegotiationRole_resetsNegotiationIdToZero() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func applyNegotiationRole()", in: source) else {
            XCTFail("applyNegotiationRole not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("negotiationId = 0"),
            "applyNegotiationRole must reset negotiationId to 0 — without this reset, a " +
            "high-water mark from the previous call rejects the first offer of the new call"
        )
    }

    /// `applyNegotiationRole` must be called from the call setup paths so the
    /// epoch is always clean at the start of any call.
    func test_applyNegotiationRole_isCalledFromStartCall() throws {
        let source = try callManagerSource()
        guard let startCallRange = source.range(of: "func startCall(") else {
            XCTFail("startCall not found"); return
        }
        let bodyEnd = [
            source.range(of: "\n    func ", range: startCallRange.upperBound..<source.endIndex)?.lowerBound,
            source.range(of: "\n    // MARK:", range: startCallRange.upperBound..<source.endIndex)?.lowerBound,
        ].compactMap { $0 }.min() ?? source.endIndex
        let startCallBody = String(source[startCallRange.lowerBound..<bodyEnd])
        XCTAssertTrue(
            startCallBody.contains("applyNegotiationRole()"),
            "startCall must call applyNegotiationRole() to reset the epoch for the new outgoing call"
        )
    }

    /// The `acceptIncomingNegotiation` function must advance the high-water mark
    /// when accepting a signal, so stale duplicates from a churned socket are
    /// rejected by `isStaleNegotiation`.
    func test_acceptIncomingNegotiation_advancesHighWaterMark() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func acceptIncomingNegotiation(", in: source) else {
            XCTFail("acceptIncomingNegotiation not found"); return
        }
        XCTAssertTrue(
            body.contains("negotiationId = max(negotiationId, generation)"),
            "acceptIncomingNegotiation must advance negotiationId to max(current, incoming) so " +
            "stale signals from a churned socket buffer are rejected as generations < highWaterMark"
        )
    }
}

// MARK: - endCallInternal teardown ordering guards

/// Guards the ordering of critical teardown steps in `endCallInternal`. Out-of-order
/// teardown has caused audio ghosts (audio session deactivated before WebRTC closed
/// → WebRTC tries to use an inactive session), state mismatches (UI transitions to
/// `.ended` while WebRTC is still running → reconnection watchdog fires on a closed
/// call), and TURN credential leaks (refresh task not cancelled → timer fires and
/// re-arms credentials on a dead call).
@MainActor
final class EndCallInternalTeardownOrderTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func endCallInternalBody(in source: String) -> String? {
        guard let funcRange = source.range(of: "func endCallInternal") else { return nil }
        let bodyEnd = source.range(of: "\n    // MARK:", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[funcRange.lowerBound..<bodyEnd])
    }

    /// The TURN credential refresh task must be cancelled in `endCallInternal`.
    /// Without this, the scheduled refresh fires after teardown, re-registers
    /// stale ICE credentials, and logs confusing "TURN refreshed for call X"
    /// messages when no call is active.
    func test_endCallInternal_cancelsTurnRefreshTask() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("turnRefreshTask?.cancel()"),
            "endCallInternal must cancel turnRefreshTask to stop TURN credential refreshes " +
            "on a dead call."
        )
        XCTAssertTrue(
            body.contains("turnRefreshTask = nil"),
            "endCallInternal must nil turnRefreshTask after cancelling to release the Task object."
        )
    }

    /// ICE candidates buffered while the socket was down must be cleared in
    /// `endCallInternal`. Leftover candidates would be flushed on the NEXT call's
    /// socket reconnect — adding stale candidates to a different peer connection.
    func test_endCallInternal_clearsPendingIceCandidates() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("pendingIceCandidates = []"),
            "endCallInternal must clear pendingIceCandidates to prevent stale candidates " +
            "from being flushed to the next call's peer connection."
        )
    }

    /// A buffered SDP offer that arrived while the user was deciding to answer
    /// must be cleared in `endCallInternal`. Without this reset, starting a new
    /// incoming call immediately reuses the old offer for a different peer.
    func test_endCallInternal_clearsPendingRemoteOffer() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("pendingRemoteOffer = nil"),
            "endCallInternal must clear pendingRemoteOffer to prevent a stale SDP offer " +
            "from being applied to the next incoming call."
        )
    }

    /// `webRTCService.close()` must be called BEFORE `callState = .ended(reason:)`.
    /// If the state transitions first, a reactive observer (e.g. the reliability
    /// monitor's reconnecting watchdog) may fire its final `endCallInternal` while
    /// WebRTC is still active, sending ICE restart offers on a terminating session.
    func test_endCallInternal_closesWebRTCBeforeTransitioningToEnded() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        guard let closeIdx = body.range(of: "webRTCService.close()")?.lowerBound else {
            XCTFail("webRTCService.close() not found in endCallInternal body"); return
        }
        guard let endedIdx = body.range(of: "callState = .ended(reason: reason)")?.lowerBound else {
            XCTFail("callState = .ended(reason: reason) not found in endCallInternal body"); return
        }
        XCTAssertTrue(
            closeIdx < endedIdx,
            "webRTCService.close() must precede `callState = .ended` — transitioning state " +
            "first allows observers to fire while WebRTC is still active."
        )
    }

    /// `deactivateAudioSession()` must be called BEFORE `callState = .ended(reason:)`.
    /// The audio deactivation triggers a CallKit `provider:didDeactivate:` callback
    /// which in turn resets the RTCAudioSession — this must complete while the call
    /// is still in an active-teardown state, not after the UI has fully transitioned.
    func test_endCallInternal_deactivatesAudioBeforeTransitioningToEnded() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        guard let deactivateIdx = body.range(of: "deactivateAudioSession()")?.lowerBound else {
            XCTFail("deactivateAudioSession() not found in endCallInternal body"); return
        }
        guard let endedIdx = body.range(of: "callState = .ended(reason: reason)")?.lowerBound else {
            XCTFail("callState = .ended(reason: reason) not found in endCallInternal body"); return
        }
        XCTAssertTrue(
            deactivateIdx < endedIdx,
            "deactivateAudioSession() must precede `callState = .ended` — the audio deactivation " +
            "path must complete before the UI observes the terminal state."
        )
    }
}

// MARK: - DTLS-SRTP enforcement guards

/// Guards that the WebRTC peer connection is always created with DTLS-SRTP
/// mandatory. Without `DtlsSrtpKeyAgreement: true`, WebRTC falls back to
/// SDES (key negotiation in the SDP plaintext), sending media encryption keys
/// over the signaling channel — any server that routes the SDP can decrypt
/// the call audio and video.
@MainActor
final class DTLSSRTPEnforcementTests: XCTestCase {

    private func p2pClientSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The peer connection must require DTLS-SRTP key agreement.
    /// A missing or `false` value silently falls back to SDES in some WebRTC
    /// builds, transmitting media keys in the SDP offer/answer.
    func test_peerConnection_requiresDTLSSRTP() throws {
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("\"DtlsSrtpKeyAgreement\": \"true\""),
            "P2PWebRTCClient must pass `DtlsSrtpKeyAgreement: true` in RTCMediaConstraints. " +
            "Without it, some WebRTC builds fall back to SDES key exchange — media keys are " +
            "sent in the SDP plaintext over the signaling channel."
        )
    }

    /// The bundle policy must be `.maxBundle` to minimize the number of transport
    /// sockets and DTLS handshakes. With fewer transports, there is less surface
    /// for downgrade attacks and the DTLS connection is established faster.
    func test_peerConnection_useMaxBundlePolicy() throws {
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("bundlePolicy = .maxBundle"),
            "P2PWebRTCClient must set bundlePolicy = .maxBundle to multiplex all tracks " +
            "onto a single DTLS transport — fewer handshakes, smaller attack surface."
        )
    }

    /// RTCP must be multiplexed onto the RTP port (rtcpMuxPolicy = .require).
    /// Without mux, a separate DTLS transport is opened for RTCP — doubling the
    /// number of ports that need to be traversed and firewalled.
    func test_peerConnection_requiresRTCPMux() throws {
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("rtcpMuxPolicy = .require"),
            "P2PWebRTCClient must set rtcpMuxPolicy = .require to avoid opening a separate " +
            "RTCP transport — extra ports increase NAT traversal complexity and attack surface."
        )
    }
}

// MARK: - Settle-token race guard

/// Guards the settle-token pattern in `endCallInternal` that prevents a new
/// call from being reset to `.idle` by the deferred cleanup Task of the
/// preceding call. Without the token check, the following race is possible:
///   T+0ms  call A ends → endCallInternal schedules 1.5 s idle Task
///   T+50ms new call B starts → callState = .ringing
///   T+1500ms Task fires → sees .idle candidate → resets state to .idle
///   T+1500ms BUG: call B's .ringing is clobbered → UI drops the incoming ring
@MainActor
final class SettleTokenRaceGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func endCallInternalBody(in source: String) -> String? {
        guard let funcRange = source.range(of: "func endCallInternal") else { return nil }
        let bodyEnd = source.range(of: "\n    // MARK:", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[funcRange.lowerBound..<bodyEnd])
    }

    /// `endCallInternal` must mint a fresh UUID token and assign it to `settleToken`
    /// before scheduling the deferred idle transition. The token is how the deferred
    /// Task knows whether its identity is still current when it fires.
    func test_endCallInternal_mintsAndStoresSettleToken() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("let token = UUID()"),
            "endCallInternal must mint a UUID settle token — the deferred idle Task uses it " +
            "to detect whether a new call has taken over before the 1.5 s window expires."
        )
        XCTAssertTrue(
            body.contains("settleToken = token"),
            "endCallInternal must assign the minted token to `settleToken` so that " +
            "`resetEndedStateForNewCall` can nil it to cancel the pending idle transition."
        )
    }

    /// The deferred idle-transition Task must check that `settleToken == token`
    /// before resetting state. Without this guard, a new call that started during
    /// the 1.5 s settle window gets its state clobbered by the old Task.
    func test_settleTask_guardsOnTokenBeforeResettingToIdle() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        // The guard must appear inside the deferred Task body, so we look for
        // the token comparison AND the subsequent .idle assignment together.
        XCTAssertTrue(
            body.contains("self.settleToken == token"),
            "The deferred idle Task in endCallInternal must guard on `settleToken == token` " +
            "before transitioning to .idle — without this, a new call started within 1.5 s " +
            "has its state reset by the previous call's cleanup Task."
        )
        XCTAssertTrue(
            body.contains("self.callState = .idle"),
            "The deferred Task must set callState = .idle when the settle token still matches — " +
            "this is the terminal cleanup that releases the last call's identity fields."
        )
    }
}
