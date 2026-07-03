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

    // MARK: isEnded

    func test_ended_isEnded() {
        XCTAssertTrue(CallState.ended(reason: .local).isEnded)
        XCTAssertTrue(CallState.ended(reason: .remote).isEnded)
        XCTAssertTrue(CallState.ended(reason: .rejected).isEnded)
        XCTAssertTrue(CallState.ended(reason: .missed).isEnded)
        XCTAssertTrue(CallState.ended(reason: .failed("err")).isEnded)
        XCTAssertTrue(CallState.ended(reason: .connectionLost).isEnded)
    }

    func test_nonEnded_isNotEnded() {
        XCTAssertFalse(CallState.idle.isEnded)
        XCTAssertFalse(CallState.connecting.isEnded)
        XCTAssertFalse(CallState.connected.isEnded)
        XCTAssertFalse(CallState.offering.isEnded)
        XCTAssertFalse(CallState.ringing(isOutgoing: true).isEnded)
        XCTAssertFalse(CallState.ringing(isOutgoing: false).isEnded)
    }

    // MARK: isRinging

    func test_ringing_isRinging() {
        XCTAssertTrue(CallState.ringing(isOutgoing: true).isRinging)
        XCTAssertTrue(CallState.ringing(isOutgoing: false).isRinging)
    }

    func test_nonRinging_isNotRinging() {
        XCTAssertFalse(CallState.idle.isRinging)
        XCTAssertFalse(CallState.offering.isRinging)
        XCTAssertFalse(CallState.connecting.isRinging)
        XCTAssertFalse(CallState.connected.isRinging)
        XCTAssertFalse(CallState.ended(reason: .local).isRinging)
    }

    // MARK: shouldPresentFullScreenCover

    func test_shouldPresentFullScreenCover_connected_fullScreen_returnsTrue() {
        XCTAssertTrue(
            CallState.shouldPresentFullScreenCover(callState: .connected, displayMode: .fullScreen)
        )
    }

    func test_shouldPresentFullScreenCover_connected_pip_returnsFalse() {
        XCTAssertFalse(
            CallState.shouldPresentFullScreenCover(callState: .connected, displayMode: .pip)
        )
    }

    func test_shouldPresentFullScreenCover_ended_fullScreen_returnsTrue() {
        // End-of-call dismissal panel must still be visible
        XCTAssertTrue(
            CallState.shouldPresentFullScreenCover(
                callState: .ended(reason: .local), displayMode: .fullScreen)
        )
    }

    func test_shouldPresentFullScreenCover_idle_fullScreen_returnsFalse() {
        XCTAssertFalse(
            CallState.shouldPresentFullScreenCover(callState: .idle, displayMode: .fullScreen)
        )
    }

    func test_shouldPresentFullScreenCover_ringing_fullScreen_returnsTrue() {
        XCTAssertTrue(
            CallState.shouldPresentFullScreenCover(
                callState: .ringing(isOutgoing: false), displayMode: .fullScreen)
        )
    }

    func test_shouldPresentFullScreenCover_offering_pip_returnsFalse() {
        XCTAssertFalse(
            CallState.shouldPresentFullScreenCover(callState: .offering, displayMode: .pip)
        )
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
        XCTAssertEqual(servers.count, 5)
        XCTAssertTrue(servers[0].urls.first?.contains("stun.l.google.com") ?? false)
    }

    func test_defaultIceServers_includesIPv6Stun() {
        let servers = IceServer.defaultServers
        let hasIPv6 = servers.contains { $0.urls.contains { $0.contains("stun6.l.google.com") } }
        XCTAssertTrue(hasIPv6, "defaultServers must include stun6 for IPv6-only cellular networks")
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
        // [Fix 2026-07-02] the join is now dispatched via joinCallRoomReliably
        // (connect-if-needed + ACK + retry) — same ordering contract: it must
        // be kicked off BEFORE the media warmup.
        guard let emitJoinIdx = body.range(of: "joinCallRoomReliably(callId: callId)")?.lowerBound,
              let startMediaIdx = body.range(of: "performLocalMediaStart(isVideo:")?.lowerBound else {
            XCTFail("Expected joinCallRoomReliably and performLocalMediaStart call sites in handleIncomingCallNotification")
            return
        }
        XCTAssertLessThan(
            emitJoinIdx,
            startMediaIdx,
            "Bug 2 guard: joinCallRoomReliably MUST be dispatched before kicking off performLocalMediaStart " +
            "(which awaits startLocalMedia) in handleIncomingCallNotification, otherwise the caller stays in " +
            ".ringing(true) until the callee's camera/mic warmup completes."
        )
    }

    func test_reportIncomingVoIPCall_emitsCallJoinBeforeStartLocalMedia() throws {
        let source = try sourceText()
        guard let body = body(of: "func reportIncomingVoIPCall", in: source) else {
            XCTFail("reportIncomingVoIPCall not found")
            return
        }
        guard let emitJoinIdx = body.range(of: "joinCallRoomReliably(callId: callId)")?.lowerBound,
              let startMediaIdx = body.range(of: "performLocalMediaStart(isVideo:")?.lowerBound else {
            XCTFail("Expected joinCallRoomReliably and performLocalMediaStart call sites in reportIncomingVoIPCall")
            return
        }
        XCTAssertLessThan(
            emitJoinIdx,
            startMediaIdx,
            "Bug 2 guard: joinCallRoomReliably MUST be dispatched before kicking off performLocalMediaStart " +
            "(which awaits startLocalMedia) in reportIncomingVoIPCall — on a VoIP cold start it also forces " +
            "the socket connection that a bare emitCallJoin silently lost."
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

    /// The dedup ring in `VoIPPushManager` already recorded this callId as
    /// "seen" when the push arrived (before CallKit had a chance to report
    /// or refuse it). If `reportNewIncomingCall` genuinely fails, the call is
    /// torn down locally — without evicting the callId, a legitimate APNs
    /// retry within the dedup TTL would be silently phantom-acked as a
    /// duplicate instead of re-ringing the callee.
    func test_reportIncomingVoIPCall_evictsDedupRingEntry_onCallKitReportFailure() throws {
        let source = try sourceText()
        guard let body = body(of: "func reportIncomingVoIPCall", in: source) else {
            XCTFail("reportIncomingVoIPCall not found")
            return
        }
        guard let reportRange = body.range(of: "reportNewIncomingCall(with: uuid, update: update) { [weak self] error in") else {
            XCTFail("Expected the non-busy reportNewIncomingCall failure closure in reportIncomingVoIPCall")
            return
        }
        let closureBody = String(body[reportRange.upperBound...])
        XCTAssertTrue(
            closureBody.contains("VoIPPushManager.shared.clearDedup(callId: callId)"),
            "reportIncomingVoIPCall's CallKit-report-failure closure must evict the callId from the " +
            "dedup ring so a genuine APNs retry is not dropped as a duplicate."
        )
    }

    /// Mirrors `test_reportIncomingVoIPCall_evictsDedupRingEntry_onCallKitReportFailure`
    /// for the `guard callState == .idle else { ... }` busy branch a few lines
    /// above: a second VoIP push arriving mid-call is reported-then-immediately-
    /// ended, but the completion handler used to discard the error entirely
    /// (`{ _ in }`). If CallKit refuses that report (two call groups already
    /// used, restricted mode, a transient error), the dedup ring — already
    /// populated for this callId before this method ran — was never evicted,
    /// so a legitimate APNs retry within the TTL got silently phantom-acked
    /// instead of re-ringing the callee.
    func test_reportIncomingVoIPCall_evictsDedupRingEntry_onCallKitReportFailure_busyPath() throws {
        let source = try sourceText()
        guard let body = body(of: "func reportIncomingVoIPCall", in: source) else {
            XCTFail("reportIncomingVoIPCall not found")
            return
        }
        guard let busyGuardRange = body.range(of: "guard callState == .idle else {") else {
            XCTFail("Expected the busy-path guard in reportIncomingVoIPCall")
            return
        }
        guard let reportRange = body.range(
            of: "reportNewIncomingCall(with: uuid, update: update) { error in",
            range: busyGuardRange.upperBound..<body.endIndex
        ) else {
            XCTFail("Expected the busy-path reportNewIncomingCall closure in reportIncomingVoIPCall")
            return
        }
        guard let endedAtRange = body.range(
            of: "reportCall(with: uuid, endedAt: nil, reason: .unanswered)",
            range: reportRange.upperBound..<body.endIndex
        ) else {
            XCTFail("Expected reportCall(...endedAt: nil...) after the busy-path report closure")
            return
        }
        let closureBody = String(body[reportRange.upperBound..<endedAtRange.lowerBound])
        XCTAssertTrue(
            closureBody.contains("VoIPPushManager.shared.clearDedup(callId: callId)"),
            "reportIncomingVoIPCall's BUSY-path CallKit-report-failure closure must also evict the callId " +
            "from the dedup ring — otherwise a genuine APNs retry while the user is on another call is " +
            "dropped as a duplicate, leaving the callee with zero call UI."
        )
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

// MARK: - Call Reliability Policy — default-threshold behaviour (§5.8)

@MainActor
final class CallReliabilityPolicyDefaultsTests: XCTestCase {
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

// Renamed from `CallPillStatusTests` to avoid an `invalid redeclaration` collision
// with the dedicated suite in `FloatingCallPillViewTests.swift` (both PRs added a
// `CallPillStatus` test class). Same target → class names must be unique.
@MainActor
final class CallPillStatusMinimisedTests: XCTestCase {

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

    // MARK: label property — pre-connection states must surface a text label;
    // .connected must return empty string (the view shows the live duration instead).

    func test_label_connected_isEmpty() {
        XCTAssertEqual(CallPillStatus.connected.label, "",
                       ".connected shows the live duration — label must be empty string")
    }

    func test_label_ringing_isNonEmpty() {
        XCTAssertFalse(CallPillStatus.ringing.label.isEmpty,
                       ".ringing must surface a status label so the user knows no timer has started")
    }

    func test_label_connecting_isNonEmpty() {
        XCTAssertFalse(CallPillStatus.connecting.label.isEmpty,
                       ".connecting must surface a status label — not an empty/zeroed timer")
    }

    func test_label_reconnecting_isNonEmpty() {
        XCTAssertFalse(CallPillStatus.reconnecting.label.isEmpty,
                       ".reconnecting must surface a status label distinct from the connected timer")
    }

    func test_label_distinctPerPreConnectionStatus() {
        // Each pre-connection status must emit a unique string so the user
        // can tell them apart at a glance.
        let ringing = CallPillStatus.ringing.label
        let connecting = CallPillStatus.connecting.label
        let reconnecting = CallPillStatus.reconnecting.label
        XCTAssertNotEqual(ringing, connecting)
        XCTAssertNotEqual(ringing, reconnecting)
        XCTAssertNotEqual(connecting, reconnecting)
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
/// Full 5-level Prisme Linguistique chain:
///   1. systemLanguage > 2. regionalLanguage > 3. customDestinationLanguage > 4. deviceLocale > 5. "fr"
@MainActor
final class CallManagerPreferredCallLanguageTests: XCTestCase {

    private func makeUser(
        systemLanguage: String? = nil,
        regionalLanguage: String? = nil,
        customDestinationLanguage: String? = nil,
        deviceLocale: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(id: "u1", username: "testuser",
                   systemLanguage: systemLanguage,
                   regionalLanguage: regionalLanguage,
                   customDestinationLanguage: customDestinationLanguage,
                   deviceLocale: deviceLocale)
    }

    // MARK: Priority 5 — fallback

    func test_nilUser_returnsFrFallback() {
        XCTAssertEqual(CallManager.preferredCallLanguage(for: nil), "fr")
    }

    func test_allNil_returnsFrFallback() {
        let user = makeUser()
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "fr")
    }

    // MARK: Priority 1 — systemLanguage

    func test_systemLanguagePresent_returnsSystemLanguage() {
        let user = makeUser(systemLanguage: "en", regionalLanguage: "es",
                            customDestinationLanguage: "de", deviceLocale: "fr_FR")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "en")
    }

    func test_systemLanguagePrioritisedOverRegional() {
        let user = makeUser(systemLanguage: "de", regionalLanguage: "fr")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "de")
    }

    func test_systemLanguageUsedEvenWhenRegionalIsFrench() {
        let user = makeUser(systemLanguage: "zh", regionalLanguage: "fr")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "zh")
    }

    func test_onlySystemLanguage_noRegional_returnsSystem() {
        let user = makeUser(systemLanguage: "ar")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "ar")
    }

    // MARK: Priority 2 — regionalLanguage

    func test_systemLanguageNil_regionalPresent_returnsRegionalLanguage() {
        let user = makeUser(systemLanguage: nil, regionalLanguage: "es")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "es")
    }

    func test_regionalLanguagePrioritisedOverCustomDestination() {
        let user = makeUser(systemLanguage: nil, regionalLanguage: "it",
                            customDestinationLanguage: "de", deviceLocale: "fr_FR")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "it")
    }

    // MARK: Priority 3 — customDestinationLanguage

    func test_systemAndRegionalNil_customDestinationPresent_returnsCustom() {
        let user = makeUser(customDestinationLanguage: "pt")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "pt")
    }

    func test_customDestinationPrioritisedOverDeviceLocale() {
        let user = makeUser(customDestinationLanguage: "ko", deviceLocale: "fr_FR")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "ko")
    }

    // MARK: Priority 4 — deviceLocale

    func test_allNilExceptDeviceLocale_returnsNormalisedLocale() {
        // deviceLocale "fr_FR" normalises to "fr"
        let user = makeUser(deviceLocale: "fr_FR")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "fr")
    }

    func test_deviceLocale_hyphenFormat_normalisedToISO639() {
        // "zh-Hant-HK" → normalised to "zh" by MeeshyUser.normalizeLanguageCode
        let user = makeUser(deviceLocale: "zh-Hant-HK")
        let result = CallManager.preferredCallLanguage(for: user)
        XCTAssertFalse(result.isEmpty, "deviceLocale must yield a non-empty language code")
        XCTAssertEqual(result, MeeshyUser.normalizeLanguageCode("zh-Hant-HK") ?? "fr")
    }

    func test_deviceLocale_underscoreFormat_normalisedToISO639() {
        let user = makeUser(deviceLocale: "en_US")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "en")
    }

    func test_deviceLocale_notUsedWhenRegionalPresent() {
        // Prisme rule: priority 2 (regional) beats priority 4 (deviceLocale)
        let user = makeUser(regionalLanguage: "es", deviceLocale: "fr_FR")
        XCTAssertEqual(CallManager.preferredCallLanguage(for: user), "es")
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

    /// Every (re-)arm of the ICE restart must cancel any previous task before
    /// starting a new one. A second reconnection trigger (e.g. the watchdog
    /// fires mid-backoff, or a coalesced NWPath edge re-arms the in-flight
    /// attempt) must kill the sleeping first attempt to prevent two concurrent
    /// offers. Since the trigger-arbitration refactor the single seam is
    /// `scheduleICERestart` — `attemptReconnection` delegates to it for both
    /// new cycles and coalesced re-arms.
    func test_attemptReconnection_cancelsExistingTaskBeforeStartingNew() throws {
        let src = try callManagerSource()
        guard let funcRange = src.range(of: "func scheduleICERestart(") else {
            XCTFail("scheduleICERestart() not found in CallManager.swift"); return
        }
        let bodyEnd = src.range(of: "\n    }", range: funcRange.upperBound..<src.endIndex)?.upperBound
            ?? src.endIndex
        let body = String(src[funcRange.lowerBound..<bodyEnd])
        XCTAssertTrue(
            body.contains("iceRestartTask?.cancel()"),
            "scheduleICERestart must cancel the previous iceRestartTask before creating a " +
            "new one — two concurrent Tasks sending restart offers corrupt perfect negotiation."
        )
        XCTAssertTrue(
            body.contains("iceRestartTask = Task"),
            "scheduleICERestart must assign the new Task to iceRestartTask so subsequent " +
            "calls can cancel it."
        )
        // attemptReconnection must route every arm through that single seam.
        XCTAssertTrue(
            src.contains("scheduleICERestart(attempt: reconnectAttempt"),
            "attemptReconnection must delegate to scheduleICERestart — a second, direct " +
            "iceRestartTask assignment would bypass the cancel-before-arm contract."
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

    /// Audit 2026-07-02: `performICERestart()` can still be awaiting when the
    /// call ends (or a fresher reconnect cycle takes over). Its `nil` branch
    /// must re-check `Task.isCancelled`/`callState` — exactly like the
    /// success branch two lines below it — before calling
    /// `attemptReconnection(escalate:)`. Without that guard, a stale restart
    /// failure resurrects an already-ended call or clobbers a newer cycle's
    /// `.reconnecting` state.
    func test_scheduleICERestart_nilOfferBranch_guardsStaleAttemptBeforeEscalating() throws {
        let src = try callManagerSource()
        guard let funcRange = src.range(of: "func scheduleICERestart(") else {
            XCTFail("scheduleICERestart() not found in CallManager.swift"); return
        }
        let bodyEnd = src.range(of: "\n    }", range: funcRange.upperBound..<src.endIndex)?.upperBound
            ?? src.endIndex
        let body = String(src[funcRange.lowerBound..<bodyEnd])
        guard let nilBranchStart = body.range(of: "performICERestart() else {")?.upperBound,
              let nilBranchEnd = body.range(of: "attemptReconnection(escalate: true)")?.upperBound else {
            XCTFail("Expected the nil-offer branch calling attemptReconnection(escalate:) in scheduleICERestart"); return
        }
        let nilBranch = String(body[nilBranchStart..<nilBranchEnd])
        XCTAssertTrue(
            nilBranch.contains("Task.isCancelled") && nilBranch.contains("case .reconnecting"),
            "The nil-offer branch of scheduleICERestart must guard on Task.isCancelled and the " +
            "current .reconnecting(attempt:) generation before calling attemptReconnection(escalate:) " +
            "— otherwise a superseded/ended reconnect cycle can resurrect a dead call."
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

    /// [Fix 2026-07-02] The answer action is HELD (`holdPendingAnswerAction`)
    /// and settled at `.connected` so the CallKit elapsed timer reflects the
    /// REAL connection, not the tap (user-reported "0:00 before the connection
    /// exists"). The handler must still keep a defensive immediate
    /// `action.fulfill()` on the non-main fallback path, and the settlement
    /// sites must exist: fulfill at connect, fail on pre-connect teardown,
    /// 10 s safety net inside holdPendingAnswerAction.
    func test_cxAnswerCallAction_heldUntilConnected() throws {
        let src = try callManagerSource()
        guard let answerRange = src.range(of: "perform action: CXAnswerCallAction") else {
            XCTFail("CXAnswerCallAction handler not found"); return
        }
        let bodyStart = src[answerRange.upperBound...].firstIndex(of: "{") ?? src.endIndex
        let bodyFragment = String(src[bodyStart...].prefix(1600))

        XCTAssertTrue(bodyFragment.contains("holdPendingAnswerAction(action)"),
            "CXAnswerCallAction: the action must be handed to the manager (holdPendingAnswerAction) " +
            "so the CallKit timer starts at the real connection, not at tap time.")
        XCTAssertTrue(bodyFragment.contains("MainActor.assumeIsolated"),
            "CXAnswerCallAction: the hand-off must be synchronous on the main queue " +
            "(delegate queue is nil = main) — no Sendable capture of the CXAction in a Task.")
        XCTAssertTrue(bodyFragment.contains("action.fulfill()"),
            "CXAnswerCallAction: the defensive fallback (off-main / nil manager) must still " +
            "fulfill immediately so the action can never be lost.")

        XCTAssertTrue(src.contains("settlePendingAnswerAction(fulfilled: true, reason: \"connected\")"),
            "transitionToConnected must fulfill the held answer action at the real connection.")
        XCTAssertTrue(src.contains("settlePendingAnswerAction(fulfilled: false, reason: \"teardown before connect\")"),
            "endCallInternal must fail the held answer action when the call dies before connecting.")
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

    func test_handleHold_chainsOntoPreviousTask_insteadOfRelyingOnCancel() throws {
        // `Task.cancel()` is cooperative and `disableLocalVideo`/`enableLocalVideo`
        // never check `Task.isCancelled` mid-flight (they simply await
        // `stopCapture`/`startCapture`) — cancelling the previous holdVideoTask and
        // immediately firing a new one does NOT stop the in-flight camera/
        // transceiver mutation, so a rapid hold→unhold could run a cancelled
        // downgrade concurrently with a fresh upgrade. handleHold must instead
        // await the previous task's `.value` before starting its own, serializing
        // every hold transition.
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

        let previousTaskCaptures = body.components(separatedBy: "let previousTask = holdVideoTask").count - 1
        XCTAssertEqual(
            previousTaskCaptures, 2,
            "Both the hold and unhold branches must capture the in-flight holdVideoTask before replacing it"
        )

        let awaitedCompletions = body.components(separatedBy: "await previousTask?.value").count - 1
        XCTAssertEqual(
            awaitedCompletions, 2,
            "Both branches must await the previous task's completion before mutating the camera/transceiver"
        )

        guard let assignRange = body.range(of: "holdVideoTask = Task"),
              let awaitRange = body.range(of: "await previousTask?.value", range: assignRange.upperBound..<body.endIndex),
              let downgradeRange = body.range(of: "webRTCService.downgradeFromVideo()", range: assignRange.upperBound..<body.endIndex) else {
            XCTFail("Expected holdVideoTask = Task, await previousTask?.value, then downgradeFromVideo() in that order"); return
        }
        XCTAssertLessThan(
            awaitRange.lowerBound, downgradeRange.lowerBound,
            "The hold branch must await the previous task's completion BEFORE calling downgradeFromVideo()"
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

    func test_freshness_guardsOnRingingState_beforeEndingCall() throws {
        let source = try callManagerSource()
        guard let body = freshnessBody(in: source) else {
            XCTFail("checkVoIPCallFreshness not found"); return
        }
        // Regression: activeCallUUID alone is unchanged across ringing→connecting→
        // connected (only cleared in endCallInternal), so it cannot distinguish "user
        // hasn't answered yet" from "user just answered while this REST check — up to
        // voipFreshnessTimeoutSeconds — was still in flight". A stale/racy terminal
        // response must never tear down a call the user is actively connecting/on.
        let occurrences = body.components(separatedBy: "activeCallUUID == uuid, case .ringing = callState").count - 1
        XCTAssertEqual(
            occurrences, 2,
            "Bug D follow-up: BOTH the 404 branch and the terminal-status branch must guard " +
            "on `case .ringing = callState` in addition to activeCallUUID, or an answered call " +
            "racing a slow freshness check gets killed out from under the user"
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

    /// Audit 2026-07-02 (bug 3 follow-up): the waiting call can be ended,
    /// answered elsewhere, or replaced by a newer incoming call during the
    /// 0.5s settle sleep. The Task must re-validate that `pendingIncomingCall`
    /// still matches the captured `pending.callId` BEFORE routing it to
    /// `handleIncomingCallNotification` — otherwise it answers a torn-down or
    /// wrong call, presenting a phantom ringing/connecting UI.
    func test_endCurrentAndAnswerPending_revalidatesPendingBeforeAnswering() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func endCurrentAndAnswerPending", in: source) else {
            XCTFail("endCurrentAndAnswerPending not found"); return
        }
        guard let taskRange = body.range(of: "Task {"),
              let handleRange = body.range(of: "handleIncomingCallNotification(") else {
            XCTFail("Expected Task { ... handleIncomingCallNotification(...) in endCurrentAndAnswerPending"); return
        }
        let beforeHandle = String(body[taskRange.upperBound..<handleRange.lowerBound])
        XCTAssertTrue(
            beforeHandle.contains("self.pendingIncomingCall?.callId == pending.callId"),
            "endCurrentAndAnswerPending's Task must guard `self.pendingIncomingCall?.callId == " +
            "pending.callId` before calling handleIncomingCallNotification — the waiting call may " +
            "have been ended/answered/replaced during the settle sleep."
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

// MARK: - Multi-Device Already-Answered Dismissal

/// Source-analysis guards ensuring `call:already-answered` is handled by CallManager.
/// When a user answers an incoming call on another device, the gateway broadcasts
/// `call:already-answered` to all other sessions. Without handling this event,
/// the ringing UI stays up indefinitely on non-answering devices.
@MainActor
final class CallManagerAlreadyAnsweredTests: XCTestCase {

    func test_callManager_sourceCode_handlesAlreadyAnsweredEvent() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("already-answered") || source.contains("alreadyAnswered") || source.contains("ALREADY_ANSWERED"),
            "CallManager must handle the call:already-answered event emitted by the gateway " +
            "when this user answers the call on another device. Without it, the ringing UI " +
            "stays up indefinitely on the non-answering device."
        )
    }

    func test_callManager_sourceCode_alreadyAnswered_endsCallOrDismissesRing() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        // Anchor on the SUBSCRIBER (`socket.callAlreadyAnswered`), not on the
        // first textual occurrence of "already-answered" — doc comments
        // elsewhere in the file (e.g. endRingingAnsweredElsewhere's docstring,
        // added 2026-07-03) legitimately mention the event name and would
        // hijack the analysis window (CI-only failure: the local targeted run
        // didn't include this suite).
        guard let range = source.range(of: "socket.callAlreadyAnswered") else {
            XCTFail("call:already-answered subscriber not found in CallManager.swift — required for multi-device dismissal")
            return
        }
        // Grab surrounding context
        let start = source.index(range.lowerBound, offsetBy: -200, limitedBy: source.startIndex) ?? source.startIndex
        let end = source.index(range.upperBound, offsetBy: 800, limitedBy: source.endIndex) ?? source.endIndex
        let context = String(source[start ..< end])

        let endsCall = context.contains("endCallInternal") || context.contains("callState = .ended") || context.contains("endCall")
        let dismissesRing = context.contains(".idle") || context.contains("dismiss") || context.contains("pendingIncomingCall = nil")

        XCTAssertTrue(
            endsCall || dismissesRing,
            "The call:already-answered handler must either end the call via endCallInternal " +
            "or dismiss the ringing state — it must not silently ignore the event."
        )
    }
}

// MARK: - CallState Reconnecting Tests

@MainActor
final class CallStateReconnectingTests: XCTestCase {

    func test_reconnecting_isActive() {
        XCTAssertTrue(CallState.reconnecting(attempt: 1).isActive)
        XCTAssertTrue(CallState.reconnecting(attempt: 2).isActive)
        XCTAssertTrue(CallState.reconnecting(attempt: 3).isActive)
    }

    func test_reconnecting_isNotEnded() {
        XCTAssertFalse(CallState.reconnecting(attempt: 1).isEnded)
    }

    func test_reconnecting_isNotRinging() {
        XCTAssertFalse(CallState.reconnecting(attempt: 1).isRinging)
    }

    func test_reconnecting_equatable_sameAttempt_isEqual() {
        XCTAssertEqual(CallState.reconnecting(attempt: 1), CallState.reconnecting(attempt: 1))
        XCTAssertEqual(CallState.reconnecting(attempt: 3), CallState.reconnecting(attempt: 3))
    }

    func test_reconnecting_equatable_differentAttempt_isNotEqual() {
        XCTAssertNotEqual(CallState.reconnecting(attempt: 1), CallState.reconnecting(attempt: 2))
        XCTAssertNotEqual(CallState.reconnecting(attempt: 2), CallState.reconnecting(attempt: 3))
    }

    func test_reconnecting_notEqualToConnected() {
        XCTAssertNotEqual(CallState.reconnecting(attempt: 1), CallState.connected)
    }

    func test_reconnecting_notEqualToConnecting() {
        XCTAssertNotEqual(CallState.reconnecting(attempt: 1), CallState.connecting)
    }

    func test_shouldPresentFullScreenCover_reconnecting_fullScreen_returnsTrue() {
        XCTAssertTrue(
            CallState.shouldPresentFullScreenCover(callState: .reconnecting(attempt: 1), displayMode: .fullScreen)
        )
    }

    func test_shouldPresentFullScreenCover_reconnecting_pip_returnsFalse() {
        XCTAssertFalse(
            CallState.shouldPresentFullScreenCover(callState: .reconnecting(attempt: 1), displayMode: .pip)
        )
    }

    func test_shouldPresentFullScreenCover_reconnecting_allAttempts_fullScreen_returnsTrue() {
        for attempt in 1...3 {
            XCTAssertTrue(
                CallState.shouldPresentFullScreenCover(callState: .reconnecting(attempt: attempt), displayMode: .fullScreen),
                "reconnecting(attempt: \(attempt)) must present fullscreen"
            )
        }
    }
}

// MARK: - handleRemoteEnd rawReason Mapping

@MainActor
final class CallManagerHandleRemoteEndTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_handleRemoteEnd_answeredElsewhere_handlesBothVariants() throws {
        let source = try callManagerSource()
        guard let switchRange = source.range(of: "switch rawReason?.lowercased()") else {
            XCTFail("handleRemoteEnd switch not found"); return
        }
        let blockEnd = source.range(of: "cxReason = .remoteEnded", range: switchRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let switchBlock = String(source[switchRange.lowerBound..<blockEnd])

        XCTAssertTrue(
            switchBlock.contains("\"answeredelsewhere\""),
            "handleRemoteEnd must handle 'answeredelsewhere' (camelCase lowercased) from legacy gateway payloads"
        )
        XCTAssertTrue(
            switchBlock.contains("\"answered_elsewhere\""),
            "handleRemoteEnd must handle 'answered_elsewhere' (snake_case) — the gateway uses " +
            "snake_case for multi-word event reasons as documented in CLAUDE.md"
        )
    }

    func test_handleRemoteEnd_answeredElsewhere_casesShareSameOutcome() throws {
        let source = try callManagerSource()
        guard let switchRange = source.range(of: "switch rawReason?.lowercased()") else {
            XCTFail("handleRemoteEnd switch not found"); return
        }
        let blockEnd = source.range(of: "cxReason = .remoteEnded", range: switchRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let switchBlock = String(source[switchRange.lowerBound..<blockEnd])

        guard let camelIdx = switchBlock.range(of: "\"answeredelsewhere\"")?.lowerBound,
              let snakeIdx = switchBlock.range(of: "\"answered_elsewhere\"")?.lowerBound else {
            XCTFail("Both 'answeredelsewhere' and 'answered_elsewhere' variants must be present"); return
        }
        // They must appear in the same case pattern (within 60 chars of each other)
        let distance = switchBlock.distance(from: min(camelIdx, snakeIdx), to: max(camelIdx, snakeIdx))
        XCTAssertLessThan(distance, 60, "Both 'answeredelsewhere' variants must be in the same case pattern")
    }

    func test_handleRemoteEnd_missed_handlesAllVariants() throws {
        let source = try callManagerSource()
        guard let switchRange = source.range(of: "switch rawReason?.lowercased()") else {
            XCTFail("handleRemoteEnd switch not found"); return
        }
        let blockEnd = source.range(of: "default:", range: switchRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let switchBlock = String(source[switchRange.lowerBound..<blockEnd])
        XCTAssertTrue(switchBlock.contains("\"missed\""), "handleRemoteEnd must handle 'missed'")
        XCTAssertTrue(switchBlock.contains("\"no_answer\""), "handleRemoteEnd must handle 'no_answer'")
        XCTAssertTrue(switchBlock.contains("\"unanswered\""), "handleRemoteEnd must handle 'unanswered'")
    }

    func test_handleRemoteEnd_rejected_handlesAllVariants() throws {
        let source = try callManagerSource()
        guard let switchRange = source.range(of: "switch rawReason?.lowercased()") else {
            XCTFail("handleRemoteEnd switch not found"); return
        }
        let blockEnd = source.range(of: "default:", range: switchRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let switchBlock = String(source[switchRange.lowerBound..<blockEnd])
        XCTAssertTrue(switchBlock.contains("\"rejected\""), "handleRemoteEnd must handle 'rejected'")
        XCTAssertTrue(switchBlock.contains("\"declined\""), "handleRemoteEnd must handle 'declined'")
    }
}

// MARK: - DTMF Validation

@MainActor
final class CallManagerDTMFTests: XCTestCase {

    func test_sendDTMF_validatesInput_inSourceCode() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        guard let funcRange = source.range(of: "func sendDTMF(digits: String)") else {
            XCTFail("sendDTMF not found in CallManager.swift"); return
        }
        let blockEnd = source.range(of: "}", range: funcRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<blockEnd])

        XCTAssertTrue(
            funcBody.contains("guard") || funcBody.contains("allSatisfy") || funcBody.contains("CharacterSet"),
            "sendDTMF must validate that digits contain only legal DTMF characters before " +
            "forwarding to WebRTC — invalid characters cause RTCDataChannel errors"
        )
    }

    func test_sendDTMF_rejectsEmptyString_inSourceCode() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        guard let funcRange = source.range(of: "func sendDTMF(digits: String)") else {
            XCTFail("sendDTMF not found in CallManager.swift"); return
        }
        let blockEnd = source.range(of: "}", range: funcRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<blockEnd])

        XCTAssertTrue(
            funcBody.contains("isEmpty"),
            "sendDTMF must guard against empty digit strings before forwarding"
        )
    }
}

// MARK: - call:force-leave Server→Client Handler

@MainActor
final class CallManagerForcedLeaveTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_forcedLeave_subscriberPresent_inSetupSocketListeners() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("callForcedLeave"),
            "setupSocketListeners must subscribe to the callForcedLeave Combine subject " +
            "so the gateway can force-remove a participant and the iOS client tears down the call"
        )
    }

    func test_forcedLeave_guardsOnCurrentCallId() throws {
        let source = try callManagerSource()
        guard let subRange = source.range(of: "callForcedLeave") else {
            XCTFail("callForcedLeave subscription not found in CallManager.swift"); return
        }
        let window = String(source[subRange.lowerBound..<min(source.index(subRange.upperBound, offsetBy: 400), source.endIndex)])
        XCTAssertTrue(
            window.contains("currentCallId"),
            "callForcedLeave handler must guard on currentCallId to discard stale events " +
            "from a previous call cycle that arrive after state reset"
        )
    }

    func test_forcedLeave_callsEndCallInternal_withRemoteReason() throws {
        let source = try callManagerSource()
        guard let subRange = source.range(of: "callForcedLeave") else {
            XCTFail("callForcedLeave subscription not found in CallManager.swift"); return
        }
        let sinkEnd = source.range(of: ".store(in: &cancellables)", range: subRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let block = String(source[subRange.lowerBound..<sinkEnd])
        XCTAssertTrue(
            block.contains("endCallInternal"),
            "callForcedLeave handler must call endCallInternal to tear down the WebRTC session"
        )
        XCTAssertTrue(
            block.contains(".remote"),
            "callForcedLeave handler must end with reason .remote (the gateway is the remote actor " +
            "initiating the force-remove, not the local user)"
        )
    }

    func test_forcedLeave_reportsCallKitEndedOnActiveCall() throws {
        let source = try callManagerSource()
        guard let subRange = source.range(of: "callForcedLeave") else {
            XCTFail("callForcedLeave subscription not found in CallManager.swift"); return
        }
        let sinkEnd = source.range(of: ".store(in: &cancellables)", range: subRange.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let block = String(source[subRange.lowerBound..<sinkEnd])
        XCTAssertTrue(
            block.contains("reportCall") && block.contains("activeCallUUID"),
            "callForcedLeave handler must report the call as ended to CallKit via " +
            "callProvider.reportCall(with:endedAt:reason:) so the system call-ended UI appears"
        )
    }
}

// MARK: - CallForcedLeaveData Decodable

final class CallForcedLeaveDataTests: XCTestCase {

    func test_decode_withCallIdAndReason_succeeds() throws {
        let json = """
        {"callId":"abc123","reason":"admin_removed"}
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallForcedLeaveData.self, from: json)
        XCTAssertEqual(event.callId, "abc123")
        XCTAssertEqual(event.reason, "admin_removed")
    }

    func test_decode_withMissingReason_succeeds() throws {
        let json = """
        {"callId":"abc123"}
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallForcedLeaveData.self, from: json)
        XCTAssertEqual(event.callId, "abc123")
        XCTAssertNil(event.reason)
    }
}

// MARK: - CallManager.formatDuration (pure helper)

/// `formatDuration` was extracted as a `nonisolated static` so it is testable
/// without touching `callDuration` (which is `private(set)`). These tests also
/// act as a regression guard against the pre-fix bug where calls ≥ 1 hour were
/// shown as "65:00" instead of "1:05:00".
@MainActor
final class CallManagerFormatDurationTests: XCTestCase {

    func test_formatDuration_zero_showsDoubleZero() {
        XCTAssertEqual(CallManager.formatDuration(0), "00:00")
    }

    func test_formatDuration_oneSecond_showsZeroZeroZeroOne() {
        XCTAssertEqual(CallManager.formatDuration(1), "00:01")
    }

    func test_formatDuration_59seconds_noLeadingMinute() {
        XCTAssertEqual(CallManager.formatDuration(59), "00:59")
    }

    func test_formatDuration_oneMinute_showsZeroOneZeroZero() {
        XCTAssertEqual(CallManager.formatDuration(60), "01:00")
    }

    func test_formatDuration_90seconds_showsOneMinute30Seconds() {
        XCTAssertEqual(CallManager.formatDuration(90), "01:30")
    }

    func test_formatDuration_59Minutes59Seconds_maxSubHour() {
        XCTAssertEqual(CallManager.formatDuration(3599), "59:59")
    }

    func test_formatDuration_exactlyOneHour_showsHHMMSS() {
        // Pre-fix: was "60:00"; post-fix: "1:00:00"
        XCTAssertEqual(CallManager.formatDuration(3600), "1:00:00")
    }

    func test_formatDuration_oneHourFiveMinutes_showsHHMMSS() {
        // Pre-fix: was "65:00"; post-fix: "1:05:00"
        XCTAssertEqual(CallManager.formatDuration(3900), "1:05:00")
    }

    func test_formatDuration_twoHours_showsHHMMSS() {
        XCTAssertEqual(CallManager.formatDuration(7200), "2:00:00")
    }

    func test_formatDuration_twoHours30MinutesAndSomeSeconds() {
        // 2h 30m 45s = 9045s
        XCTAssertEqual(CallManager.formatDuration(9045), "2:30:45")
    }

    func test_formatDuration_oneHour59Minutes59Seconds() {
        // 7199 = 1*3600 + 59*60 + 59
        XCTAssertEqual(CallManager.formatDuration(7199), "1:59:59")
    }

    func test_formatDuration_fractionalSecondsAreTruncated() {
        // 90.9 seconds → 01:30 (truncate, not round)
        XCTAssertEqual(CallManager.formatDuration(90.9), "01:30")
    }

    func test_formatDuration_subHour_doesNotShowHours() {
        // Ensure < 1 h keeps the compact MM:SS format
        let result = CallManager.formatDuration(3599)
        XCTAssertFalse(result.contains(":") && result.split(separator: ":").count == 3,
                       "sub-hour duration must use MM:SS not HH:MM:SS; got \(result)")
    }

    func test_formatDuration_oneHour_usesThreeComponents() {
        let result = CallManager.formatDuration(3600)
        XCTAssertEqual(result.split(separator: ":").count, 3,
                       "≥1 h duration must use H:MM:SS format; got \(result)")
    }

    func test_formatDuration_minutesAndSecondsArePaddedToTwoDigits() {
        // 1h 5m 3s → "1:05:03" (not "1:5:3")
        XCTAssertEqual(CallManager.formatDuration(3600 + 5 * 60 + 3), "1:05:03")
    }
}

// MARK: - Proximity Monitoring Source Audit

/// Verifies that `updateProximityMonitoring` is correctly wired to both
/// `callState` and `isVideoEnabled`, and that the condition is right:
/// monitoring is ON only during audio-only active calls.
@MainActor
final class CallManagerProximityMonitoringTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_updateProximityMonitoring_isCalledFromCallStateDidSet() throws {
        let source = try callManagerSource()
        guard let didSetRange = source.range(of: "var callState: CallState") else {
            XCTFail("callState property not found"); return
        }
        let afterCallState = String(source[didSetRange.upperBound...])
        guard let didSetBlock = afterCallState.range(of: "didSet") else {
            XCTFail("callState didSet not found"); return
        }
        let nextProp = afterCallState.range(of: "\n    @Published", range: didSetBlock.upperBound..<afterCallState.endIndex)?.lowerBound
            ?? afterCallState.endIndex
        let block = String(afterCallState[didSetBlock.lowerBound..<nextProp])
        XCTAssertTrue(
            block.contains("updateProximityMonitoring()"),
            "callState.didSet must call updateProximityMonitoring() so the sensor is " +
            "disabled when a call ends and enabled when a call becomes active"
        )
    }

    func test_updateProximityMonitoring_isCalledFromIsVideoEnabledDidSet() throws {
        let source = try callManagerSource()
        guard let videoDidSetRange = source.range(of: "var isVideoEnabled: Bool") else {
            XCTFail("isVideoEnabled property not found"); return
        }
        let after = String(source[videoDidSetRange.upperBound...])
        guard let didSet = after.range(of: "didSet") else {
            XCTFail("isVideoEnabled didSet not found"); return
        }
        let nextBrace = after.range(of: "}", range: didSet.upperBound..<after.endIndex)?.upperBound ?? after.endIndex
        let block = String(after[didSet.lowerBound..<nextBrace])
        XCTAssertTrue(
            block.contains("updateProximityMonitoring()"),
            "isVideoEnabled.didSet must call updateProximityMonitoring() so the sensor " +
            "transitions correctly between audio-only and video modes"
        )
    }

    func test_updateProximityMonitoring_enablesOnlyForAudioOnlyActiveCall() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func updateProximityMonitoring()") else {
            XCTFail("updateProximityMonitoring not found"); return
        }
        let after = String(source[fnRange.upperBound...])
        guard let bodyEnd = after.range(of: "\n    }") else {
            XCTFail("updateProximityMonitoring body end not found"); return
        }
        let body = String(after[after.startIndex..<bodyEnd.upperBound])
        XCTAssertTrue(
            body.contains("callState.isActive") && body.contains("isVideoEnabled"),
            "updateProximityMonitoring must gate on `callState.isActive && !isVideoEnabled` — " +
            "proximity monitoring must only be active during audio-only active calls"
        )
        XCTAssertTrue(
            body.contains("isProximityMonitoringEnabled"),
            "updateProximityMonitoring must write to UIDevice.current.isProximityMonitoringEnabled"
        )
    }
}

// MARK: - Route Change Default Branch Audit

/// Verifies that the `default:` branch of `handleAudioRouteChange` calls
/// `applySpeakerRoute()`. The default case handles wakeFromSleep, categoryChange,
/// and other OS-driven transitions — all require re-applying the speaker route
/// because iOS may silently reset the output port during these transitions.
@MainActor
final class CallManagerRouteChangeDefaultTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func routeChangeBody(in source: String) -> String? {
        guard let fnRange = source.range(of: "private func handleAudioRouteChange(reasonRaw:") else { return nil }
        let after = source[fnRange.upperBound...]
        guard let endRange = after.range(of: "\n    }") else { return nil }
        return String(after[after.startIndex..<endRange.upperBound])
    }

    func test_handleAudioRouteChange_default_callsApplySpeakerRoute() throws {
        let source = try callManagerSource()
        guard let body = routeChangeBody(in: source) else {
            XCTFail("handleAudioRouteChange not found"); return
        }
        guard let defaultRange = body.range(of: "default:") else {
            XCTFail("default: case not found in handleAudioRouteChange"); return
        }
        let afterDefault = String(body[defaultRange.upperBound...])
        // The closing `}` of the switch ends the default case.
        let endOfDefault = afterDefault.range(of: "\n        }")?.lowerBound ?? afterDefault.endIndex
        let defaultBlock = String(afterDefault[afterDefault.startIndex..<endOfDefault])
        XCTAssertTrue(
            defaultBlock.contains("applySpeakerRoute()"),
            "handleAudioRouteChange default: must call applySpeakerRoute() to handle " +
            "wakeFromSleep, categoryChange, and other OS-driven route transitions that " +
            "reset the output port without a specific case"
        )
    }

    func test_handleAudioRouteChange_hasDefaultCase_coveringWakeFromSleep() throws {
        let source = try callManagerSource()
        guard let body = routeChangeBody(in: source) else {
            XCTFail("handleAudioRouteChange not found"); return
        }
        XCTAssertTrue(
            body.contains("default:"),
            "handleAudioRouteChange must have a default: case to handle wakeFromSleep " +
            "and other non-explicit route change reasons"
        )
    }
}

// MARK: - rejectPendingCall guard

@MainActor
final class RejectPendingCallTests: XCTestCase {

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

    func test_rejectPendingCall_guardsPendingCallExists() throws {
        // If no pending call is present, rejectPendingCall() must be a no-op.
        // Without this guard, calling rejectPendingCall() with no pendingIncomingCall
        // would attempt to emit a call:end for a nil callId, sending garbage to the gateway.
        let source = try callManagerSource()
        guard let body = functionBody(of: "func rejectPendingCall()", in: source) else {
            XCTFail("rejectPendingCall() not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("guard let pending = pendingIncomingCall"),
            "rejectPendingCall() must guard `pendingIncomingCall != nil` before emitting — " +
            "calling it when no pending call exists must be a no-op."
        )
    }

    func test_rejectPendingCall_emitsCallEndWithPendingCallId() throws {
        // rejectPendingCall() must emit call:end (emitCallEnd) so the gateway
        // tears down the pending call session and notifies the waiting peer.
        // Missing this emit would leave the peer's call ringing indefinitely.
        let source = try callManagerSource()
        guard let body = functionBody(of: "func rejectPendingCall()", in: source) else {
            XCTFail("rejectPendingCall() not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("emitCallEnd(callId: pending.callId)"),
            "rejectPendingCall() must call emitCallEnd(callId: pending.callId) — " +
            "the gateway needs call:end to tear down the waiting call and notify the peer."
        )
    }

    func test_rejectPendingCall_clearsPendingIncomingCall() throws {
        // After rejection, pendingIncomingCall must be cleared so a subsequent
        // incoming call is not mistakenly treated as a waiting call.
        let source = try callManagerSource()
        guard let body = functionBody(of: "func rejectPendingCall()", in: source) else {
            XCTFail("rejectPendingCall() not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("pendingIncomingCall = nil"),
            "rejectPendingCall() must set pendingIncomingCall = nil after rejection — " +
            "leaving it set would incorrectly show a waiting-call banner for a call that was rejected."
        )
    }

    func test_rejectPendingCall_dismissesCallWaitingBanner() throws {
        // After rejection, the call waiting banner must be hidden so the UI
        // does not continue to show a dismissed call.
        let source = try callManagerSource()
        guard let body = functionBody(of: "func rejectPendingCall()", in: source) else {
            XCTFail("rejectPendingCall() not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("showCallWaitingBanner = false"),
            "rejectPendingCall() must set showCallWaitingBanner = false after rejection — " +
            "the call waiting banner must be hidden once the pending call is dismissed."
        )
    }

    func test_rejectPendingCall_emitCallEnd_beforeClearingPending() throws {
        // emitCallEnd must happen before pendingIncomingCall is cleared so the callId
        // is still available when the socket event fires. Reversing this order would
        // emit call:end with a nil/stale callId.
        let source = try callManagerSource()
        guard let body = functionBody(of: "func rejectPendingCall()", in: source) else {
            XCTFail("rejectPendingCall() not found in CallManager.swift"); return
        }
        guard let emitRange = body.range(of: "emitCallEnd(callId: pending.callId)"),
              let clearRange = body.range(of: "pendingIncomingCall = nil") else {
            XCTFail("Expected emitCallEnd and pendingIncomingCall = nil in rejectPendingCall()"); return
        }
        XCTAssertLessThan(
            emitRange.lowerBound,
            clearRange.lowerBound,
            "rejectPendingCall() must emit call:end BEFORE clearing pendingIncomingCall — " +
            "callId must still be available when the socket emit fires."
        )
    }
}

// MARK: - Quality Label Mapping (§gateway connection quality ladder)

/// `CallManager.connectionQualityLabel(for:)` collapses the client's 5-tier ladder
/// into the 4-tier string expected by the gateway's `call:quality-report` schema.
/// Tests are pure static — no singletons, no network.
@MainActor
final class CallManagerConnectionQualityLabelTests: XCTestCase {

    func test_excellent_mapsToExcellent() {
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .excellent), "excellent")
    }

    func test_good_mapsToGood() {
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .good), "good")
    }

    func test_fair_mapsToFair() {
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .fair), "fair")
    }

    func test_poor_mapsToPoor() {
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .poor), "poor")
    }

    func test_critical_collapsesToPoor() {
        // Gateway has no "critical" tier; critical collapses to "poor" so
        // the report schema never rejects the call:quality-report event.
        XCTAssertEqual(CallManager.connectionQualityLabel(for: .critical), "poor")
    }

    func test_poorAndCritical_bothMapToPoor() {
        XCTAssertEqual(
            CallManager.connectionQualityLabel(for: .poor),
            CallManager.connectionQualityLabel(for: .critical),
            "poor and critical must both map to 'poor' — gateway's 4-tier ladder has no critical tier"
        )
    }
}

// MARK: - TURN Refresh TTL Guard (§scheduleTURNCredentialRefresh)

/// Source-level guards verifying `scheduleTURNCredentialRefresh` protects
/// against a malformed or zero TTL from the gateway that would cause an
/// immediate tight-loop of TURN credential requests.
@MainActor
final class CallManagerTURNRefreshGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func refreshBody(_ source: String) -> String? {
        guard let start = source.range(of: "func scheduleTURNCredentialRefresh") else { return nil }
        let end = source.range(of: "\n    private func ", range: start.upperBound..<source.endIndex)?.lowerBound
                ?? source.range(of: "\n    func ", range: start.upperBound..<source.endIndex)?.lowerBound
                ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_turnRefreshScheduler_existsInSource() throws {
        let source = try callManagerSource()
        XCTAssertNotNil(
            source.range(of: "func scheduleTURNCredentialRefresh"),
            "scheduleTURNCredentialRefresh must exist in CallManager.swift — " +
            "without it, TURN credentials are never proactively refreshed during a call."
        )
    }

    func test_turnRefreshScheduler_hasMinimumTTLGuard() throws {
        let source = try callManagerSource()
        guard let body = refreshBody(source) else {
            XCTFail("scheduleTURNCredentialRefresh body not found"); return
        }
        // The floor-clamp lives in CallReliabilityPolicy.turnRefreshDelay
        // (unit-tested in TurnRefreshDelayPolicyTests): a degenerate TTL clamps
        // to turnMinRefreshDelaySeconds instead of disarming the refresh — the
        // old `guard ttl >= 60 else return` skipped scheduling entirely and let
        // mid-call credentials expire with no refresh armed.
        XCTAssertTrue(
            body.contains("CallReliabilityPolicy.turnRefreshDelay"),
            "scheduleTURNCredentialRefresh must compute its delay via " +
            "CallReliabilityPolicy.turnRefreshDelay — the policy owns the minimum-TTL " +
            "clamp that prevents a tight request loop on a malformed or zero TTL."
        )
    }

    func test_turnRefreshScheduler_cancelsExistingTask_beforeRescheduling() throws {
        let source = try callManagerSource()
        guard let body = refreshBody(source) else {
            XCTFail("scheduleTURNCredentialRefresh body not found"); return
        }
        XCTAssertTrue(
            body.contains("turnRefreshTask?.cancel()"),
            "scheduleTURNCredentialRefresh must cancel the existing task before creating a " +
            "new one — otherwise duplicate refresh requests accumulate over a long call."
        )
    }

    func test_turnRefreshScheduler_uses80PercentOfTTL() throws {
        let source = try callManagerSource()
        guard let body = refreshBody(source) else {
            XCTFail("scheduleTURNCredentialRefresh body not found"); return
        }
        // The 80%-of-TTL computation moved into CallReliabilityPolicy.turnRefreshDelay,
        // where it is behaviour-tested (TurnRefreshDelayPolicyTests
        // .test_turnRefreshDelay_nominalTTL_is80Percent). Here we guard the wiring:
        // the scheduler must delegate to the policy with the gateway TTL.
        XCTAssertTrue(
            body.contains("CallReliabilityPolicy.turnRefreshDelay(ttl: ttl)"),
            "scheduleTURNCredentialRefresh must delegate its delay to " +
            "CallReliabilityPolicy.turnRefreshDelay(ttl:) so credentials are renewed at " +
            "80% of TTL (20% safety window) with the minimum-delay clamp applied."
        )
    }

    func test_turnRefreshScheduler_guardCallIsActiveBeforeEmitting() throws {
        let source = try callManagerSource()
        guard let body = refreshBody(source) else {
            XCTFail("scheduleTURNCredentialRefresh body not found"); return
        }
        XCTAssertTrue(
            body.contains("callState.isActive"),
            "The deferred TURN refresh Task must guard `callState.isActive` before emitting — " +
            "a refresh emitted after call end would waste a TURN credential request."
        )
    }
}

// MARK: - TURN Refresh Retry Watchdog (§requestFreshTurnCredentials)

/// Source-level guards verifying every `call:request-ice-servers` requester
/// routes through the shared watchdog helper, so a single dropped emit/reply
/// (the emit carries no ACK) can't silently kill TURN renewal for the rest of
/// a long call. Behavior of the retry bound itself is unit-tested in
/// `TurnRefreshRetryPolicyTests` (CallReconnectPolicyTests.swift).
@MainActor
final class CallManagerTURNRefreshWatchdogTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func functionBody(_ source: String, signature: String) -> String? {
        guard let start = source.range(of: signature) else { return nil }
        let end = source.range(of: "\n    private func ", range: start.upperBound..<source.endIndex)?.lowerBound
                ?? source.range(of: "\n    func ", range: start.upperBound..<source.endIndex)?.lowerBound
                ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_requestFreshTurnCredentials_existsAndArmsWatchdog() throws {
        let source = try callManagerSource()
        guard let body = functionBody(source, signature: "func requestFreshTurnCredentials(callId: String)") else {
            XCTFail("requestFreshTurnCredentials not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("MessageSocketManager.shared.emitRequestIceServers(callId: callId)"),
            "requestFreshTurnCredentials must emit call:request-ice-servers"
        )
        XCTAssertTrue(
            body.contains("armTurnRefreshWatchdog(callId: callId)"),
            "requestFreshTurnCredentials must arm the retry watchdog after every emit — " +
            "otherwise a dropped reply is never retried."
        )
    }

    func test_armTurnRefreshWatchdog_retriesViaPolicy() throws {
        let source = try callManagerSource()
        guard let body = functionBody(source, signature: "func armTurnRefreshWatchdog(callId: String)") else {
            XCTFail("armTurnRefreshWatchdog not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("CallReliabilityPolicy.turnRefreshShouldRetry"),
            "armTurnRefreshWatchdog must delegate the retry-bound decision to " +
            "CallReliabilityPolicy.turnRefreshShouldRetry (unit-tested in isolation)."
        )
        XCTAssertTrue(
            body.contains("self.requestFreshTurnCredentials(callId: callId)"),
            "armTurnRefreshWatchdog must retry by re-emitting via requestFreshTurnCredentials, " +
            "not a bare emitRequestIceServers call, so the retry itself is also watchdog-armed."
        )
        XCTAssertTrue(
            body.contains("self.scheduleTURNCredentialRefresh(ttl:"),
            "Once retries are exhausted, armTurnRefreshWatchdog must still re-arm the next " +
            "periodic refresh cycle instead of leaving the call with no refresh armed at all."
        )
    }

    func test_allRequestIceServersCallSites_routeThroughWatchdogHelper() throws {
        let source = try callManagerSource()
        // Every direct `emitRequestIceServers` call must live inside
        // `requestFreshTurnCredentials` itself — every other call site (the
        // periodic scheduler, socket-reconnect resync, reconnection-cycle
        // refresh) must call the wrapping helper instead of emitting directly,
        // so none of them can bypass the retry watchdog.
        let directEmitOccurrences = source.components(separatedBy: "MessageSocketManager.shared.emitRequestIceServers(callId:").count - 1
        XCTAssertEqual(
            directEmitOccurrences, 1,
            "MessageSocketManager.shared.emitRequestIceServers must be called from exactly one " +
            "place (requestFreshTurnCredentials) — every other TURN-refresh trigger must route " +
            "through requestFreshTurnCredentials(callId:) so it's covered by the retry watchdog."
        )
    }

    func test_scheduleTURNCredentialRefresh_resetsWatchdogState() throws {
        let source = try callManagerSource()
        guard let body = functionBody(source, signature: "func scheduleTURNCredentialRefresh(ttl: TimeInterval)") else {
            XCTFail("scheduleTURNCredentialRefresh body not found"); return
        }
        XCTAssertTrue(
            body.contains("turnRefreshWatchdogTask?.cancel()"),
            "scheduleTURNCredentialRefresh must cancel any in-flight watchdog before starting " +
            "a fresh cycle — otherwise a stale watchdog from the previous cycle can fire " +
            "against the new one's callId."
        )
        XCTAssertTrue(
            body.contains("turnRefreshRetryAttempt = 0"),
            "scheduleTURNCredentialRefresh must reset the retry counter for the new cycle."
        )
    }
}

// MARK: - Busy-Call Feedback (§startCall rejection)

/// Source-level guards verifying `startCall` tells the user when it rejects a
/// dial because another call is already active. Every entry point (conversation
/// header, call-summary "call back", conversation-list context menu,
/// CallStarter) previously called this in a fire-and-forget way — a tap that
/// visibly did nothing, indistinguishable from a dead button.
@MainActor
final class CallManagerBusyFeedbackTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func startCallBody(_ source: String) -> String? {
        guard let start = source.range(of: "func startCall(conversationId: String") else { return nil }
        let end = source.range(of: "\n    // MARK: - VoIP Push Incoming Call", range: start.upperBound..<source.endIndex)?.lowerBound
                ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_startCall_isDiscardableResultReturningBool() throws {
        let source = try callManagerSource()
        guard let declRange = source.range(of: "func startCall(conversationId: String") else {
            XCTFail("startCall not found in CallManager.swift"); return
        }
        let precedingDistance = min(80, source.distance(from: source.startIndex, to: declRange.lowerBound))
        let precedingStart = source.index(declRange.lowerBound, offsetBy: -precedingDistance)
        let precedingLines = source[precedingStart..<declRange.lowerBound]
        XCTAssertTrue(
            precedingLines.contains("@discardableResult"),
            "startCall must be @discardableResult — most call sites intentionally ignore " +
            "the return value and must not be forced to handle it."
        )
        let declLine = source[declRange.lowerBound...].prefix(while: { $0 != "\n" })
        XCTAssertTrue(
            declLine.contains("-> Bool"),
            "startCall must return Bool so CallStarter (and any future caller) can detect " +
            "a rejected dial instead of only ever seeing a fire-and-forget no-op."
        )
    }

    func test_startCall_busyGuard_surfacesToastAndReturnsFalse() throws {
        let source = try callManagerSource()
        guard let body = startCallBody(source) else {
            XCTFail("startCall body not found"); return
        }
        guard let guardRange = body.range(of: "guard callState == .idle else {") else {
            XCTFail("startCall busy guard not found"); return
        }
        let guardBlockEnd = body.range(of: "\n        }", range: guardRange.upperBound..<body.endIndex)?.upperBound ?? body.endIndex
        let guardBlock = String(body[guardRange.lowerBound..<guardBlockEnd])
        XCTAssertTrue(
            guardBlock.contains("FeedbackToastManager.shared.showError"),
            "The busy guard must surface a FeedbackToastManager error toast — per the " +
            "two-tier toast rule (apps/ios/CLAUDE.md), a local-action failure like this " +
            "goes through FeedbackToastManager, never NotificationToastManager."
        )
        XCTAssertTrue(
            guardBlock.contains("return false"),
            "The busy guard must return false so callers can detect the rejection."
        )
    }
}

// MARK: - Socket Reconnect Media Re-Sync (§P1-30 / audit P1-30)

/// Source-level guards verifying that after a Socket.IO reconnect, the
/// socket reconnect handler re-syncs both video and audio state to the peer.
/// Without this, the peer's displayed media state diverges from reality for
/// the remainder of the call.
@MainActor
final class CallManagerSocketReconnectMediaResyncTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func reconnectHandlerBody(_ source: String) -> String? {
        guard let range = source.range(of: "socket.didReconnect") else { return nil }
        // Bound to the sink closure body
        let sliceStart = range.lowerBound
        let sliceEnd = source.range(of: ".store(in: &cancellables)", range: range.upperBound..<source.endIndex)?
            .upperBound ?? source.endIndex
        return String(source[sliceStart..<sliceEnd])
    }

    func test_socketReconnect_reEmitsCallJoin() throws {
        let source = try callManagerSource()
        guard let body = reconnectHandlerBody(source) else {
            XCTFail("socket.didReconnect handler not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("emitCallJoinWithAck(callId:"),
            "Socket reconnect handler must re-emit call:join so the gateway re-admits us " +
            "to the call room — without this, ICE candidates and call:ended are silently dropped."
        )
    }

    func test_socketReconnect_resyncsVideoState() throws {
        let source = try callManagerSource()
        guard let body = reconnectHandlerBody(source) else {
            XCTFail("socket.didReconnect handler not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("emitCallToggleVideo"),
            "Socket reconnect handler must re-sync video state via emitCallToggleVideo — " +
            "the gateway resets per-participant media when a socket disconnects."
        )
    }

    func test_socketReconnect_resyncsAudioState() throws {
        let source = try callManagerSource()
        guard let body = reconnectHandlerBody(source) else {
            XCTFail("socket.didReconnect handler not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("emitCallToggleAudio"),
            "Socket reconnect handler must re-sync audio mute state via emitCallToggleAudio — " +
            "the gateway defaults to mic-live after reconnect, so explicit re-sync is required."
        )
    }

    func test_socketReconnect_requestsFreshTURNCredentials() throws {
        let source = try callManagerSource()
        guard let body = reconnectHandlerBody(source) else {
            XCTFail("socket.didReconnect handler not found in CallManager.swift"); return
        }
        // Routed through requestFreshTurnCredentials (not a bare emitRequestIceServers)
        // so this refresh is also covered by the retry watchdog — see
        // CallManagerTURNRefreshWatchdogTests.test_allRequestIceServersCallSites_routeThroughWatchdogHelper.
        XCTAssertTrue(
            body.contains("requestFreshTurnCredentials"),
            "Socket reconnect handler must request fresh TURN credentials — " +
            "the socket may have been down long enough for credentials to near expiry."
        )
    }

    func test_socketReconnect_cancelsOldTURNRefreshTask_beforeRequesting() throws {
        let source = try callManagerSource()
        guard let body = reconnectHandlerBody(source) else {
            XCTFail("socket.didReconnect handler not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("turnRefreshTask?.cancel()"),
            "Socket reconnect must cancel the periodic TURN refresh task before requesting " +
            "fresh credentials — otherwise the old deadline fires in parallel causing duplicate requests."
        )
    }
}

// MARK: - CallAnalytics emission guards

/// Guards that call analytics telemetry is correctly tracked and emitted at call end.
/// The `emitCallAnalyticsIfNeeded` method must be called before any state teardown
/// in `endCallInternal` so it can read live state (callDuration, codec, effects, etc.).
@MainActor
final class CallManagerAnalyticsTests: XCTestCase {

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

    private func emitAnalyticsBody(in source: String) -> String? {
        guard let funcRange = source.range(of: "func emitCallAnalyticsIfNeeded") else { return nil }
        let bodyEnd = source.range(of: "\n    private func ", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[funcRange.lowerBound..<bodyEnd])
    }

    /// `analyticsCallInitiatedDate` must be set in `startCall` so that setup time
    /// correctly measures the interval from call initiation to first connected state.
    func test_startCall_setsAnalyticsCallInitiatedDate() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func startCall(conversationId:") else {
            XCTFail("startCall not found in CallManager.swift"); return
        }
        let bodyEnd = source.range(of: "\n    func ", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[funcRange.lowerBound..<bodyEnd])
        XCTAssertTrue(
            body.contains("analyticsCallInitiatedDate = Date()"),
            "startCall must stamp analyticsCallInitiatedDate so setupTimeMs measures " +
            "the interval from initiation to first connected state."
        )
    }

    /// `analyticsCallInitiatedDate` must be set in `handleIncomingCallNotification`
    /// so that incoming call setup time is measured from ring to connected.
    func test_handleIncomingCallNotification_setsAnalyticsCallInitiatedDate() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleIncomingCallNotification(callId:") else {
            XCTFail("handleIncomingCallNotification not found in CallManager.swift"); return
        }
        let bodyEnd = source.range(of: "\n    func ", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[funcRange.lowerBound..<bodyEnd])
        XCTAssertTrue(
            body.contains("analyticsCallInitiatedDate = Date()"),
            "handleIncomingCallNotification must stamp analyticsCallInitiatedDate so setupTimeMs " +
            "measures the interval from incoming ring to first connected state."
        )
    }

    /// `emitCallAnalyticsIfNeeded` must be called in `endCallInternal` BEFORE
    /// `activeAudioEffect = nil` and `callStartDate = nil` — it reads these live values.
    func test_endCallInternal_emitsAnalyticsBeforeStateReset() throws {
        let source = try callManagerSource()
        guard let body = endCallInternalBody(in: source) else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        guard let analyticsIdx = body.range(of: "emitCallAnalyticsIfNeeded(reason:")?.lowerBound else {
            XCTFail("emitCallAnalyticsIfNeeded not found in endCallInternal"); return
        }
        guard let effectIdx = body.range(of: "activeAudioEffect = nil")?.lowerBound else {
            XCTFail("activeAudioEffect = nil not found in endCallInternal"); return
        }
        XCTAssertTrue(
            analyticsIdx < effectIdx,
            "emitCallAnalyticsIfNeeded must fire before activeAudioEffect = nil — " +
            "analytics reads the active effect state to include in the payload."
        )
    }

    /// The analytics payload must include `setupTimeMs` computed from
    /// `analyticsCallInitiatedDate`, not from `callStartDate` (which is set at
    /// connect time, not initiation time — same instant as `analyticsConnectedDate`).
    func test_emitCallAnalyticsIfNeeded_usesInitiatedDateForSetupTime() throws {
        let source = try callManagerSource()
        guard let body = emitAnalyticsBody(in: source) else {
            XCTFail("emitCallAnalyticsIfNeeded not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("analyticsCallInitiatedDate"),
            "setupTimeMs must use analyticsCallInitiatedDate (set at call initiation) — " +
            "using callStartDate would always produce 0 because it is set at the same " +
            "instant as analyticsConnectedDate (both in transitionToConnected)."
        )
        XCTAssertFalse(
            body.contains("timeIntervalSince(callStartDate"),
            "setupTimeMs must not reference callStartDate — it is set simultaneously with " +
            "analyticsConnectedDate and would always yield 0 ms setup time."
        )
    }

    /// The `emitCallAnalytics` socket call must pass `callId` in the payload so the
    /// gateway can associate the analytics with the correct call document.
    func test_emitCallAnalyticsIfNeeded_passesCallIdToSocket() throws {
        let source = try callManagerSource()
        guard let body = emitAnalyticsBody(in: source) else {
            XCTFail("emitCallAnalyticsIfNeeded not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("emitCallAnalytics(callId: callId"),
            "Analytics must be emitted via emitCallAnalytics(callId:payload:) with the " +
            "current callId so the gateway can correlate them with the call record."
        )
    }

    /// Analytics accumulators must all be reset inside `emitCallAnalyticsIfNeeded`
    /// after emission, so a subsequent call starts with a clean slate.
    func test_emitCallAnalyticsIfNeeded_resetsAllAccumulators() throws {
        let source = try callManagerSource()
        guard let body = emitAnalyticsBody(in: source) else {
            XCTFail("emitCallAnalyticsIfNeeded not found in CallManager.swift"); return
        }
        let accumulators = [
            "analyticsCallInitiatedDate = nil",
            "analyticsConnectedDate = nil",
            "analyticsNetworkTransitions = 0",
            "analyticsQualitySeconds = [:]",
            "analyticsLastQualityDate = nil",
            "analyticsCurrentLevel = nil",
            "analyticsRttSum = 0",
            "analyticsSampleCount = 0",
            "analyticsMaxPacketLoss = 0",
            "analyticsPacketLossSum = 0",
            "analyticsEffectsUsed = []",
        ]
        for accumulator in accumulators {
            XCTAssertTrue(
                body.contains(accumulator),
                "emitCallAnalyticsIfNeeded must reset \(accumulator) — " +
                "otherwise the next call inherits stale telemetry from the previous one."
            )
        }
    }

    /// The analytics `ANALYTICS` event key must be defined in `CALL_EVENTS` in the
    /// shared TypeScript types so gateway can route the telemetry correctly.
    func test_sharedTypes_definesAnalyticsCallEvent() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/shared/types/video-call.ts")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("ANALYTICS: 'call:analytics'"),
            "packages/shared/types/video-call.ts CALL_EVENTS must define ANALYTICS: 'call:analytics' " +
            "so the gateway can recognize and route iOS analytics payloads."
        )
    }
}

// MARK: - CXCallUpdate hasVideo on A/V toggle (audit Phase 3)

/// Verifies that `toggleVideo` reports an updated `CXCallUpdate` to CallKit after a
/// successful audio↔video transition.  Without this, the system call screen, Recents
/// list, and CarPlay continue to show the wrong media type for the remainder of the call.
@MainActor
final class CallManagerToggleVideoCXUpdateTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// toggleVideo must call `callProvider.reportCall(with:updated:)` with `hasVideo`
    /// set to the new value so CallKit's Recents and lock screen reflect the switch.
    func test_toggleVideo_reportsUpdatedCXCallUpdateToCallKit() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "videoToggleTask = Task") else {
            XCTFail("videoToggleTask block not found in CallManager.swift"); return
        }
        let searchEnd = source.range(
            of: "func switchCamera()",
            range: funcRange.upperBound..<source.endIndex
        )?.lowerBound ?? source.endIndex
        let toggleBody = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            toggleBody.contains("update.hasVideo = target"),
            "toggleVideo must set update.hasVideo = target on CXCallUpdate so CallKit " +
            "shows the correct call type (audio vs video) in Recents and the lock screen."
        )
        XCTAssertTrue(
            toggleBody.contains("callProvider.reportCall(with: uuid, updated: update)"),
            "toggleVideo must call callProvider.reportCall(with:updated:) after the A/V " +
            "switch succeeds to inform CallKit of the new media type."
        )
        XCTAssertTrue(
            toggleBody.contains("callUsesCallKit"),
            "toggleVideo must guard CXCallUpdate reporting behind callUsesCallKit to avoid " +
            "calling CXProvider methods when CallKit is not active (Mac / foreground in-app calls)."
        )
    }

    /// `cancel()` on `videoToggleTask` is cooperative — `upgradeToVideo`/
    /// `downgradeFromVideo` never check `Task.isCancelled` mid-flight, so a rapid
    /// double-tap could otherwise run two camera/transceiver actuations
    /// concurrently and corrupt state. `toggleVideo` must serialize on the
    /// previous task's completion before starting its own actuation — the same
    /// fix already shipped in `handleHold` (CallKit hold path).
    func test_toggleVideo_serializesOnPreviousTask_beforeActuating() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func toggleVideo()") else {
            XCTFail("toggleVideo() not found in CallManager.swift"); return
        }
        let searchEnd = source.range(
            of: "func switchCamera()",
            range: funcRange.upperBound..<source.endIndex
        )?.lowerBound ?? source.endIndex
        let toggleFunc = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            toggleFunc.contains("let previousTask = videoToggleTask"),
            "toggleVideo must capture the previous videoToggleTask before overwriting it, " +
            "so the new Task can await its completion."
        )
        XCTAssertTrue(
            toggleFunc.contains("await previousTask?.value"),
            "toggleVideo must await the previous task's completion before invoking " +
            "upgradeToVideo/downgradeFromVideo, otherwise two toggles can actuate the " +
            "camera/transceiver concurrently (cancel() alone does not stop in-flight work)."
        )
    }
}

// MARK: - Audio Session Opus alignment (audit Phase 3)

/// Verifies that `configureAudioSession` sets the preferred sample rate (48 kHz) and
/// I/O buffer duration (20 ms) that align with Opus's native codec parameters.
/// These are best-effort hints that eliminate a sample-rate conversion stage inside
/// AVFoundation and reduce packetization jitter for Opus frames.
@MainActor
final class CallManagerAudioSessionOpusAlignmentTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func configureAudioSessionBody(in source: String) -> String? {
        guard let funcRange = source.range(of: "private func configureAudioSession()") else {
            return nil
        }
        let end = source.range(
            of: "\n    fileprivate func applySpeakerRoute()",
            range: funcRange.upperBound..<source.endIndex
        )?.lowerBound ?? source.endIndex
        return String(source[funcRange.lowerBound..<end])
    }

    func test_configureAudioSession_setsPreferredSampleRate48kHz() throws {
        let source = try callManagerSource()
        guard let body = configureAudioSessionBody(in: source) else {
            XCTFail("configureAudioSession not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("setPreferredSampleRate(48_000)"),
            "configureAudioSession must request 48 kHz from AVAudioSession to avoid a " +
            "resampling stage between AVFoundation and Opus's native 48 kHz sample rate."
        )
    }

    func test_configureAudioSession_setsPreferredIOBufferDuration20ms() throws {
        let source = try callManagerSource()
        guard let body = configureAudioSessionBody(in: source) else {
            XCTFail("configureAudioSession not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("setPreferredIOBufferDuration(0.02)"),
            "configureAudioSession must request a 20 ms I/O buffer duration to match " +
            "Opus's default frame size and reduce packetization jitter."
        )
    }

    func test_didActivate_reappliesOpusAlignedAudioHints() throws {
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession)") else {
            XCTFail("CXProvider didActivate not found in CallManager.swift"); return
        }
        let end = source.range(
            of: "func provider(_ provider: CXProvider, didDeactivate",
            range: funcRange.upperBound..<source.endIndex
        )?.lowerBound ?? source.endIndex
        let body = String(source[funcRange.lowerBound..<end])
        XCTAssertTrue(
            body.contains("setPreferredSampleRate(48_000)"),
            "CXProvider.didActivate must re-apply the 48 kHz preferred sample rate after " +
            "CallKit activates the audio session (CallKit's own activation may reset it)."
        )
        XCTAssertTrue(
            body.contains("setPreferredIOBufferDuration(0.02)"),
            "CXProvider.didActivate must re-apply the 20 ms preferred I/O buffer duration " +
            "after CallKit activates the audio session."
        )
    }
}

// MARK: - Local SDP Failure Notifies Peer (audit fix)

/// A local SDP generation failure (createOffer/createAnswer returning nil, or the
/// remote offer never arriving before the timeout) is invisible to the peer unless
/// we explicitly emit `call:end`. Without it, the peer sits in .ringing/.connecting
/// until the gateway's CallCleanupService cron reaps the zombie call (~60s later).
/// These tests guard against regressing that notification on each local-failure path.
final class LocalSDPFailureNotifiesPeerTests: XCTestCase {

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

    func test_handleSignalOffer_createAnswerFailure_emitsCallEnd() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func handleSignalOffer(callId: String, sdp: SessionDescription, generation: Int = 0) {", in: source) else {
            XCTFail("handleSignalOffer(callId:sdp:generation:) not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("MessageSocketManager.shared.emitCallEnd(callId: callId)"),
            "handleSignalOffer's late-offer createAnswer failure must emit call:end — " +
            "otherwise the caller is left waiting for an answer that will never arrive."
        )
    }

    func test_answerCall_createAnswerFailure_emitsCallEnd() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func answerCall() {", in: source) else {
            XCTFail("answerCall() not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("MessageSocketManager.shared.emitCallEnd(callId: callId)"),
            "answerCall()'s createAnswer failure and SDP-offer-timeout paths must emit " +
            "call:end — otherwise the caller is left ringing/connecting indefinitely."
        )
    }

    func test_answerCallReady_createAnswerFailure_emitsCallEnd() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func answerCallReady() async {", in: source) else {
            XCTFail("answerCallReady() not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("MessageSocketManager.shared.emitCallEnd(callId: callId)"),
            "answerCallReady()'s createAnswer failure and SDP-offer-timeout paths must " +
            "emit call:end — otherwise the caller is left ringing/connecting indefinitely."
        )
    }

    func test_listenForParticipantJoined_createOfferFailure_emitsCallEnd() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "private func listenForParticipantJoined(callId: String, toUserId: String, isVideo: Bool) {", in: source) else {
            XCTFail("listenForParticipantJoined(callId:toUserId:isVideo:) not found in CallManager.swift"); return
        }
        XCTAssertTrue(
            body.contains("MessageSocketManager.shared.emitCallEnd(callId: callId)"),
            "listenForParticipantJoined()'s createOffer failure must emit call:end — " +
            "the callee already joined the room and is waiting for an offer that will never arrive."
        )
    }
}

// MARK: - Call-waiting hygiene + CallKit failure teardown (audit 2026-07-02, bugs 1-3)

@MainActor
final class CallWaitingAndFailureTeardownTests: XCTestCase {

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

    // MARK: Bug 3 — remote hangup of the WAITING call must dismiss the banner

    func test_clearPendingIncomingCall_helperExists_andClearsBothFields() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "private func clearPendingIncomingCall(ifMatching", in: source) else {
            XCTFail(
                "clearPendingIncomingCall(ifMatching:) missing — when the caller of the WAITING " +
                "call hangs up (call:ended/missed/force-leave for pendingIncomingCall.callId), the " +
                "banner must be dismissed instead of lingering 15s and offering End & Answer on a dead call"
            )
            return
        }
        XCTAssertTrue(body.contains("pendingIncomingCall = nil"), "helper must clear pendingIncomingCall")
        XCTAssertTrue(body.contains("showCallWaitingBanner = false"), "helper must hide the banner")
    }

    func test_terminalSocketListeners_routeEventsThroughPendingCallCheck() throws {
        let source = try callManagerSource()
        // Definition + at least callEnded, callMissed, callForcedLeave and
        // callAlreadyAnswered call sites. Each of those listeners guards on
        // currentCallId (the ACTIVE call) and early-returns for the waiting
        // call's callId — the pending-call check must run before/independently
        // of that guard.
        let occurrences = source.components(separatedBy: "clearPendingIncomingCall(ifMatching").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences, 5,
            "expected the 4 terminal socket listeners (callEnded, callMissed, callForcedLeave, " +
            "callAlreadyAnswered) to route their event through clearPendingIncomingCall(ifMatching:) " +
            "— found \(occurrences - 1 >= 0 ? occurrences : 0) occurrence(s) total (incl. definition)"
        )
    }

    // MARK: Bug 2 — TURN credentials must survive the call-waiting hand-off

    func test_pendingIncomingCall_carriesIceServers() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("iceServers: [IceServer]?)?"),
            "pendingIncomingCall must store the iceServers that arrived with the waiting call — " +
            "otherwise End & Answer configures the PeerConnection STUN-only and CGNAT/symmetric-NAT " +
            "callers get no media after the hand-off"
        )
    }

    func test_busyPaths_storeIceServersInPendingCall() throws {
        let source = try callManagerSource()
        let occurrences = source.components(separatedBy: "iceServers: iceServers)").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences, 2,
            "both busy paths (reportIncomingVoIPCall + handleIncomingCallNotification) must persist " +
            "the received iceServers into pendingIncomingCall"
        )
    }

    func test_endCurrentAndAnswerPending_forwardsIceServers() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func endCurrentAndAnswerPending", in: source) else {
            XCTFail("endCurrentAndAnswerPending not found"); return
        }
        XCTAssertTrue(
            body.contains("iceServers: pending.iceServers"),
            "endCurrentAndAnswerPending must forward the stored iceServers to " +
            "handleIncomingCallNotification — the 2nd call's TURN credentials are otherwise lost"
        )
    }

    // MARK: Bug 1 — failure teardowns must inform CallKit

    func test_failCall_reportsFailureToCallKitBeforeTeardown() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "private func failCall(", in: source) else {
            XCTFail(
                "failCall(_:) missing — failure teardowns (initiate-ACK failure, local-media failure, " +
                "setRemoteDescription failure, connecting watchdog, call:error, createOffer failure) " +
                "must report the end to CallKit or the system call UI stays stranded"
            )
            return
        }
        guard let reportRange = body.range(of: "reportCall(with:"),
              let teardownRange = body.range(of: "endCallInternal(reason: .failed(") else {
            XCTFail("failCall must reportCall(ended) to CallKit then run endCallInternal(.failed)"); return
        }
        XCTAssertLessThan(
            reportRange.lowerBound, teardownRange.lowerBound,
            "failCall must report to CallKit BEFORE endCallInternal nils activeCallUUID"
        )
    }

    func test_noDirectFailedTeardown_outsideFailCallAndCallKitErrorCallbacks() throws {
        let source = try callManagerSource()
        let offenders = source
            .components(separatedBy: "\n")
            .filter { $0.contains("endCallInternal(reason: .failed") }
            .filter { !$0.contains("CallKit error") && !$0.contains(".failed(reasonMessage)") }
        XCTAssertTrue(
            offenders.isEmpty,
            "every failure teardown must go through failCall(_:) so CallKit is informed. " +
            "Direct endCallInternal(.failed) is only allowed inside failCall itself and in the " +
            "reportNewIncomingCall/CXStartCallAction error callbacks (\"CallKit error\" — CallKit " +
            "never accepted the call). Offending lines: \(offenders)"
        )
    }
}

// MARK: - Degraded-signaling indicator wiring (EXIGENCE №1)

@MainActor
final class SignalingDegradedIndicatorTests: XCTestCase {

    private func sourceFile(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callManager_declaresIsSignalingDegraded() throws {
        let source = try sourceFile("Meeshy/Features/Main/Services/CallManager.swift")
        XCTAssertTrue(
            source.contains("@Published private(set) var isSignalingDegraded"),
            "CallManager must expose the degraded-signaling flag for CallView — a socket drop " +
            "during an established call is invisible otherwise (media is P2P and keeps flowing)"
        )
    }

    func test_callManager_observesConnectionState_readOnly() throws {
        let source = try sourceFile("Meeshy/Features/Main/Services/CallManager.swift")
        XCTAssertTrue(
            source.contains("socket.$connectionState"),
            "setupSocketListeners must observe the socket connectionState publisher to drive the indicator"
        )
        XCTAssertTrue(
            source.contains("CallReliabilityPolicy.signalingDegraded("),
            "the indicator must be computed by the pure policy (testable, no lifecycle side effects)"
        )
    }

    func test_endCallInternal_resetsIsSignalingDegraded() throws {
        let source = try sourceFile("Meeshy/Features/Main/Services/CallManager.swift")
        XCTAssertTrue(
            source.contains("isSignalingDegraded = false"),
            "endCallInternal must reset the indicator so it never leaks into the next call"
        )
    }

    func test_callView_rendersSignalingDegradedBanner() throws {
        let source = try sourceFile("Meeshy/Features/Main/Views/CallView.swift")
        XCTAssertTrue(
            source.contains("callManager.isSignalingDegraded"),
            "CallView must render a discreet banner while signaling is degraded"
        )
        XCTAssertTrue(
            source.contains("signalingDegradedBanner"),
            "the banner must follow the reconnecting/quality banner pattern (stacked capsules)"
        )
    }
}

// MARK: - call:error non-fatal whitelist (chaos-test prod 2026-07-02)

@MainActor
final class CallErrorNonFatalWhitelistTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_targetNotFound_isNonFatal() throws {
        // Chaos-test prod (callId 6a466e05a081f94fac47159e): after a gateway
        // restart, the peer's socket churned and a relayed signal drew
        // call:error TARGET_NOT_FOUND — the callee tore down a call whose P2P
        // media was perfectly healthy, then the peer's ICE-restart offers hit
        // "Signal offer for unknown call" and the caller died on its watchdog.
        // A transient relay failure must NEVER end an established call.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("event.code == \"TARGET_NOT_FOUND\""),
            "call:error TARGET_NOT_FOUND (peer momentarily has no socket in the room — churn or " +
            "reconnect in flight) must be whitelisted as non-fatal like INVALID_SIGNAL and " +
            "RATE_LIMIT_EXCEEDED; ICE is redundant by design and the answer path retries"
        )
        guard let checkRange = source.range(of: "event.code == \"TARGET_NOT_FOUND\""),
              let teardownRange = source.range(of: "self.failCall(message)") else {
            XCTFail("expected the whitelist check and the call:error teardown to coexist"); return
        }
        XCTAssertLessThan(
            checkRange.lowerBound, teardownRange.lowerBound,
            "the TARGET_NOT_FOUND early-return must guard BEFORE the call:error teardown"
        )
    }
}

// MARK: - Local teardown must materialise server-side (chaos-test prod 2026-07-02)

@MainActor
final class LocalTeardownServerReconciliationTests: XCTestCase {

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

    // Proof from prod gateway logs (window 13:56-13:59Z): the callee tore down
    // locally on an error and NO call:end/leave ever reached the gateway — the
    // caller stayed in a zombie call for ~48s until its own watchdogs fired.

    func test_emitCallEndReliably_defersWhenSocketDown_andReconcilesOnReconnect() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "private func emitCallEndReliably(", in: source) else {
            XCTFail(
                "emitCallEndReliably(callId:) missing — every local teardown must materialise " +
                "server-side (ACK + fallback), and a hang-up during a signaling outage must be " +
                "remembered and re-emitted on the next socket connect (mission: reconciliation)"
            )
            return
        }
        XCTAssertTrue(
            body.contains("pendingEndReconciliationCallId = callId"),
            "when the socket is down, the callId must be remembered for reconciliation"
        )
        XCTAssertTrue(
            body.contains("emitCallEndWithAck"),
            "when the socket is up, the ACK-first path must be used"
        )
        XCTAssertTrue(
            source.contains("let pending = self.pendingEndReconciliationCallId"),
            "the socket connectionState observer must replay the deferred call:end on reconnect"
        )
    }

    func test_failCall_emitsCallEndToServer_beforeLocalTeardown() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "private func failCall(", in: source) else {
            XCTFail("failCall not found"); return
        }
        XCTAssertTrue(
            body.contains("emitCallEndReliably("),
            "failCall must inform the gateway — a silent local teardown leaves the peer in a " +
            "zombie call the gateway keeps relaying re-joins for"
        )
        guard let emitRange = body.range(of: "emitCallEndReliably("),
              let teardownRange = body.range(of: "endCallInternal(reason: .failed(") else {
            XCTFail("expected both the server emit and the local teardown in failCall"); return
        }
        XCTAssertLessThan(
            emitRange.lowerBound, teardownRange.lowerBound,
            "the emit must capture currentCallId BEFORE endCallInternal nils it"
        )
    }

    func test_endCall_usesSharedReliableEmit() throws {
        let source = try callManagerSource()
        guard let body = functionBody(of: "func endCall()", in: source) else {
            XCTFail("endCall not found"); return
        }
        XCTAssertTrue(
            body.contains("emitCallEndReliably("),
            "endCall must route through the shared reliable emit so a hang-up during a " +
            "signaling outage is reconciled on reconnect instead of silently lost"
        )
    }
}

// MARK: - ACK-failure must also reconcile (chaos-test 2, callId 6a4690a2…)

@MainActor
final class AckFailureReconciliationTests: XCTestCase {

    func test_emitCallEndReliably_remembersCallId_whenAckFails() throws {
        // Chaos-test 2: the caller's ring-timeout call:end had its ACK fail
        // during the post-restart churn — the socket LOOKED connected so the
        // deferred-reconciliation path never armed, the fire-and-forget
        // fallback was lost, and the CallSession decayed to failed/91s via the
        // GC instead of resolving missed. An unacked end must be remembered
        // and replayed on the next connect exactly like a socket-down end
        // (the gateway end handler is idempotent).
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let fnRange = source.range(of: "private func emitCallEndReliably(") else {
            XCTFail("emitCallEndReliably not found"); return
        }
        let body = String(source[fnRange.lowerBound...].prefix(1600))
        let occurrences = body.components(separatedBy: "pendingEndReconciliationCallId = callId").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences, 2,
            "emitCallEndReliably must arm the reconciliation in BOTH branches: socket known down " +
            "AND ACK failure (socket believed up but the emit never materialised server-side)"
        )
    }
}

// MARK: - call_cancel background push → end ringing policy (phantom-ring hardening)

/// Pure decision for the `call_cancel` silent push: it may ONLY kill a
/// still-ringing INCOMING call whose callId matches the push. A late or
/// replayed cancel must never touch a connected call, an outgoing ring, or
/// an unrelated call.
@MainActor
final class CallCancellationPolicyTests: XCTestCase {

    func test_matchingIncomingRing_ends() {
        XCTAssertTrue(CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: "c1", currentCallId: "c1", callState: .ringing(isOutgoing: false)
        ))
    }

    func test_callIdMismatch_ignored() {
        XCTAssertFalse(CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: "c1", currentCallId: "c2", callState: .ringing(isOutgoing: false)
        ))
    }

    func test_noCurrentCall_ignored() {
        XCTAssertFalse(CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: "c1", currentCallId: nil, callState: .idle
        ))
    }

    func test_connectedCall_neverEndedByLateCancel() {
        XCTAssertFalse(CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: "c1", currentCallId: "c1", callState: .connected
        ))
    }

    func test_outgoingRing_ignored() {
        XCTAssertFalse(CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: "c1", currentCallId: "c1", callState: .ringing(isOutgoing: true)
        ))
    }

    /// Source-guards: the wiring exists end-to-end — AppDelegate routes the
    /// silent push, CallManager gates on the policy and reports CallKit end.
    func test_wiring_appDelegateRoutesCancel_andManagerReportsCallKitEnd() throws {
        let base = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let appDelegate = try String(
            contentsOf: base.appendingPathComponent("Meeshy/AppDelegate.swift"), encoding: .utf8)
        XCTAssertTrue(
            appDelegate.contains("call_cancel") && appDelegate.contains("endRingingFromCancellation"),
            "AppDelegate.didReceiveRemoteNotification must route type=call_cancel to CallManager.endRingingFromCancellation"
        )
        let manager = try String(
            contentsOf: base.appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift"), encoding: .utf8)
        guard let fnRange = manager.range(of: "func endRingingFromCancellation(") else {
            XCTFail("CallManager.endRingingFromCancellation not found"); return
        }
        let body = String(manager[fnRange.lowerBound...].prefix(1200))
        XCTAssertTrue(
            body.contains("shouldEndRingingOnCancellation"),
            "endRingingFromCancellation must gate on CallReliabilityPolicy.shouldEndRingingOnCancellation"
        )
        XCTAssertTrue(
            body.contains(".remoteEnded"),
            "endRingingFromCancellation must report the CallKit end with reason .remoteEnded"
        )
    }
}

// MARK: - call_answered_elsewhere silent push (multi-device socketless)

/// Miroir du call_cancel pour le multi-device : quand un autre device du même
/// compte décroche, le device secondaire SOCKETLESS (réveillé par push VoIP,
/// WebSocket jamais monté) ne reçoit pas `call:already-answered` — la push
/// background `call_answered_elsewhere` doit couper sa sonnerie avec la raison
/// CallKit `.answeredElsewhere` (Recents : « répondu sur un autre appareil »).
@MainActor
final class CallAnsweredElsewherePushTests: XCTestCase {

    func test_wiring_appDelegateRoutesAnsweredElsewhere_andManagerReportsAnsweredElsewhere() throws {
        let base = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let appDelegate = try String(
            contentsOf: base.appendingPathComponent("Meeshy/AppDelegate.swift"), encoding: .utf8)
        XCTAssertTrue(
            appDelegate.contains("call_answered_elsewhere") && appDelegate.contains("endRingingAnsweredElsewhere"),
            "AppDelegate.didReceiveRemoteNotification must route type=call_answered_elsewhere to CallManager.endRingingAnsweredElsewhere"
        )
        let manager = try String(
            contentsOf: base.appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift"), encoding: .utf8)
        guard let fnRange = manager.range(of: "func endRingingAnsweredElsewhere(") else {
            XCTFail("CallManager.endRingingAnsweredElsewhere not found"); return
        }
        let body = String(manager[fnRange.lowerBound...].prefix(1200))
        XCTAssertTrue(
            body.contains("shouldEndRingingOnCancellation"),
            "endRingingAnsweredElsewhere must gate on the same pure policy as call_cancel (exact callId + incoming ring only)"
        )
        XCTAssertTrue(
            body.contains(".answeredElsewhere"),
            "endRingingAnsweredElsewhere must report the CallKit end with reason .answeredElsewhere (Recents parity with the socket path)"
        )
    }
}

// MARK: - Call setup metrics (ring vs negotiation split)

/// `setupTimeMs` (initiated→connected) inclut le temps de sonnerie HUMAIN —
/// 23 s observés en prod, inutilisable pour détecter une régression du setup
/// WebRTC. `negotiationTimeMs` (answer/join→connected) isole la partie
/// technique. Fonction pure : -1 dès qu'un ancrage manque, jamais de 0 menteur.
@MainActor
final class CallSetupMetricsTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    func test_bothAnchors_present_splitsRingFromNegotiation() {
        let metrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: t0,
            negotiationStartAt: t0.addingTimeInterval(20),   // 20 s de sonnerie
            connectedAt: t0.addingTimeInterval(21.5)          // 1.5 s de négo
        )
        XCTAssertEqual(metrics.setupTimeMs, 21_500)
        XCTAssertEqual(metrics.negotiationTimeMs, 1_500)
    }

    func test_neverConnected_bothMinusOne() {
        let metrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: t0, negotiationStartAt: t0.addingTimeInterval(5), connectedAt: nil
        )
        XCTAssertEqual(metrics.setupTimeMs, -1)
        XCTAssertEqual(metrics.negotiationTimeMs, -1)
    }

    func test_missingNegotiationAnchor_negotiationMinusOne_setupStillComputed() {
        let metrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: t0, negotiationStartAt: nil, connectedAt: t0.addingTimeInterval(3)
        )
        XCTAssertEqual(metrics.setupTimeMs, 3_000)
        XCTAssertEqual(metrics.negotiationTimeMs, -1)
    }

    func test_missingInitiatedAnchor_setupMinusOne_negotiationStillComputed() {
        let metrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: nil, negotiationStartAt: t0, connectedAt: t0.addingTimeInterval(2)
        )
        XCTAssertEqual(metrics.setupTimeMs, -1)
        XCTAssertEqual(metrics.negotiationTimeMs, 2_000)
    }

    /// Câblage : le payload analytics porte negotiationTimeMs et les DEUX
    /// ancrages existent (answerCall côté appelé, participant-joined côté
    /// appelant), avec reset per-call.
    func test_wiring_payloadCarriesNegotiationTime_andAnchorsAreSet() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("\"negotiationTimeMs\""),
            "call:analytics payload must carry negotiationTimeMs"
        )
        XCTAssertTrue(
            source.contains("callSetupMetrics"),
            "emitCallAnalyticsIfNeeded must compute metrics via the pure CallReliabilityPolicy.callSetupMetrics"
        )
        let anchorCount = source.components(separatedBy: "analyticsNegotiationStartDate = Date()").count - 1
        XCTAssertGreaterThanOrEqual(
            anchorCount, 2,
            "The negotiation anchor must be stamped on BOTH sides: answerCall (callee) and participant-joined (caller)"
        )
        XCTAssertTrue(
            source.contains("analyticsNegotiationStartDate = nil"),
            "The negotiation anchor must be reset per call"
        )
    }
}
