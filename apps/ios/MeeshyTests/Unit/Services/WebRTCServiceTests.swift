import XCTest
@testable import Meeshy

@MainActor
final class WebRTCServiceTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> (sut: WebRTCService, client: TestableWebRTCClient) {
        let client = TestableWebRTCClient()
        let sut = WebRTCService(client: client)
        return (sut, client)
    }

    // MARK: - Initial State

    func test_init_connectionStateIsNew() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.connectionState, .new)
    }

    func test_init_defaultBitrateIsSet() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.currentBitrate, QualityThresholds.defaultBitrate)
    }

    func test_init_qualityLevelIsExcellent() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.currentQualityLevel, .excellent)
    }

    // MARK: - ICE Candidate Buffering

    func test_addICECandidate_beforeRemoteDescription_buffersCandidate() {
        let (sut, client) = makeSUT()
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        sut.addICECandidate(candidate)
        XCTAssertEqual(client.addIceCandidateCallCount, 0)
    }

    func test_addICECandidate_afterSetRemoteDescription_forwardsToClient() async {
        let (sut, client) = makeSUT()
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(desc)

        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        sut.addICECandidate(candidate)

        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertGreaterThanOrEqual(client.addIceCandidateCallCount, 1)
    }

    func test_addICECandidate_bufferCap_dropsExcessCandidates() async {
        // The buffer must never exceed 200 entries. Candidates 201–205 are
        // silently dropped; after flush, the client receives exactly 200 calls.
        let (sut, client) = makeSUT()
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        // Overshoot the cap by 5.
        for _ in 0..<205 {
            sut.addICECandidate(candidate)
        }
        // Trigger flush by setting remote description.
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(desc)
        // Give the flush task time to drain the buffer.
        try? await Task.sleep(nanoseconds: 200_000_000)
        // Exactly 200 candidates forwarded — not 205.
        XCTAssertEqual(client.addIceCandidateCallCount, 200)
    }

    // MARK: - Create Offer

    func test_createOffer_success_returnsSessionDescription() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "offer-sdp"))

        let result = await sut.createOffer()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.type, .offer)
        XCTAssertEqual(result?.sdp, "offer-sdp")
    }

    func test_createOffer_failure_returnsNil() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .failure(WebRTCError.noPeerConnection)

        let result = await sut.createOffer()

        XCTAssertNil(result)
    }

    // MARK: - Create Answer

    func test_createAnswer_success_returnsSessionDescription() async {
        let (sut, client) = makeSUT()
        client.createAnswerResult = .success(SessionDescription(type: .answer, sdp: "answer-sdp"))

        let offer = SessionDescription(type: .offer, sdp: "offer-sdp")
        let result = await sut.createAnswer(from: offer)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.type, .answer)
    }

    func test_createAnswer_failure_returnsNil() async {
        let (sut, client) = makeSUT()
        client.createAnswerResult = .failure(WebRTCError.failedToCreateSDP)

        let offer = SessionDescription(type: .offer, sdp: "offer-sdp")
        let result = await sut.createAnswer(from: offer)

        XCTAssertNil(result)
    }

    // MARK: - Media Controls

    func test_muteAudio_true_callsToggleAudioWithFalse() {
        let (sut, client) = makeSUT()
        sut.muteAudio(true)
        XCTAssertEqual(client.lastAudioEnabled, false)
    }

    func test_muteAudio_false_callsToggleAudioWithTrue() {
        let (sut, client) = makeSUT()
        sut.muteAudio(false)
        XCTAssertEqual(client.lastAudioEnabled, true)
    }

    func test_enableVideo_callsToggleVideo() {
        let (sut, client) = makeSUT()
        sut.enableVideo(true)
        XCTAssertEqual(client.lastVideoEnabled, true)
    }

    // MARK: - Close

    func test_close_setsConnectionStateToClosed() {
        let (sut, client) = makeSUT()
        sut.close()
        XCTAssertEqual(sut.connectionState, .closed)
        XCTAssertEqual(client.disconnectCallCount, 1)
    }

    // MARK: - ICE Restart

    func test_performICERestart_returnsNewOffer() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "restart-offer"))

        let result = await sut.performICERestart()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.sdp, "restart-offer")
    }

    // MARK: - Transcription Channel

    // MARK: - TestableWebRTCClient Stats Configuration

    func test_testableClient_statsToReturn_isNilByDefault() async {
        let (_, client) = makeSUT()
        let result = await client.getStats()
        XCTAssertNil(result)
    }

    func test_testableClient_statsToReturn_returnsConfiguredValue() async {
        let (_, client) = makeSUT()
        client.statsToReturn = CallStats(availableOutgoingBitrateBps: 1_500_000)
        let result = await client.getStats()
        XCTAssertEqual(result?.availableOutgoingBitrateBps, 1_500_000)
    }

    func test_createTranscriptionChannel_delegatesToClient() {
        let (sut, client) = makeSUT()
        client.createDataChannelResult = true
        let result = sut.createTranscriptionChannel()
        XCTAssertTrue(result)
        XCTAssertEqual(client.lastDataChannelLabel, "transcription")
    }

    // MARK: - Connection State Delegate

    func test_connectionStateChange_updatesConnectionState() async {
        let (sut, client) = makeSUT()

        client.delegate?.webRTCClient(client, didChangeConnectionState: .connected)

        // webRTCClient(_:didChangeConnectionState:) is nonisolated and applies
        // the new state on a hopped @MainActor Task — yield until it drains.
        var observed = await sut.connectionState
        for _ in 0..<100 where observed != .connected {
            await Task.yield()
            observed = await sut.connectionState
        }
        XCTAssertEqual(observed, .connected)
    }
}

// MARK: - adjustBitrate invariants (source-level guards)

/// Source-level guards for the `adjustBitrate` logic that is private and runs
/// inside a 5-second stats monitor — not exercisable via timing in unit tests.
/// These guards protect three non-obvious invariants:
///  1. P1-4: packet-loss MUST use Δlost/Δtotal (not raw cumulative counts).
///  2. BWE merge: TWCC bandwidth estimate is taken via `min()` with RTT heuristic.
///  3. Debounce: quality-level flips are suppressed within a 5-second window.
@MainActor
final class AdjustBitrateSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// P1-4 fix: loss ratio must be computed from snapshot deltas, not cumulative counters.
    func test_adjustBitrate_usesIncrementalPacketLossRatio() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("stats.packetsLost - (previous?.packetsLost ?? 0)"),
            "P1-4: adjustBitrate must subtract previous.packetsLost from current to compute Δlost. " +
            "Using raw cumulative counts causes a single lost packet to read as >100% loss."
        )
        XCTAssertTrue(
            source.contains("stats.inboundPacketsReceived - (previous?.inboundPacketsReceived ?? 0)"),
            "P1-4: adjustBitrate must subtract previous.inboundPacketsReceived to compute Δreceived."
        )
        XCTAssertTrue(
            source.contains("let lossRatio = denom > 0 ? Double(deltaLost) / Double(denom) : 0"),
            "P1-4: lossRatio must be Δlost/(Δlost+Δrecv), guarded against division-by-zero (denom > 0)."
        )
    }

    /// BWE merge: when TWCC is active, quality level must be min(heuristic, bweLevel).
    func test_adjustBitrate_mergesBWEWithHeuristicViaMin() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("stats.availableOutgoingBitrateBps > 0"),
            "BWE gate: TWCC estimate should only be applied when availableOutgoingBitrateBps > 0"
        )
        XCTAssertTrue(
            source.contains("min(heuristicLevel, $0)") || source.contains("min(heuristicLevel,"),
            "BWE merge: effective quality level must be min(heuristicLevel, bweLevel) — never exceed what either signal permits."
        )
    }

    /// Debounce: rapid quality-level oscillations (e.g. network hiccup) must be suppressed.
    func test_adjustBitrate_debounces5SecondsBetweenLevelChanges() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("qualityLevelDebounceDate"),
            "Debounce: a qualityLevelDebounceDate timestamp must gate rapid quality-level flips"
        )
        XCTAssertTrue(
            source.contains("< 5.0"),
            "Debounce: the suppression window must be 5 seconds to avoid thrashing the video encoder"
        )
    }
}

// MARK: - applyVideoQuality source guards

/// `applyVideoQuality` applies critical-tier floors and composes VideoThermalProfile
/// before calling `applyVideoEncoding`. A regression here silently sends 0-bitrate
/// to the encoder instead of the safety floor, or drops the thermal composition.
@MainActor
final class ApplyVideoQualitySourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Critical tier returns 0 from targetVideoBitrate; applyVideoQuality must
    /// substitute minVideoBitrate so the encoder isn't told to send 0 bps.
    func test_applyVideoQuality_usesMinVideoBitrateFloorForCriticalTier() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("level.targetVideoBitrate > 0 ? level.targetVideoBitrate : QualityThresholds.minVideoBitrate"),
            "applyVideoQuality must floor zero targetVideoBitrate with minVideoBitrate — " +
            "passing 0 to the encoder is undefined behavior and can stall the video track."
        )
    }

    /// Zero targetFPS (critical) must fall back to `QualityThresholds.criticalVideoFloorFPS`, not 0.
    func test_applyVideoQuality_usesMinFpsFloorForCriticalTier() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("level.targetFPS > 0 ? level.targetFPS : QualityThresholds.criticalVideoFloorFPS"),
            "applyVideoQuality must floor zero targetFPS with QualityThresholds.criticalVideoFloorFPS — " +
            "0 fps stalls encoding; hardcoding 15 creates drift when the constant is tuned."
        )
        XCTAssertFalse(
            source.contains("level.targetFPS > 0 ? level.targetFPS : 15"),
            "applyVideoQuality must not hardcode 15 fps — use QualityThresholds.criticalVideoFloorFPS"
        )
    }

    /// Zero targetResolutionHeight (critical) must fall back to `QualityThresholds.criticalVideoFloorHeight`.
    func test_applyVideoQuality_usesFloorHeightForCriticalTier() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("level.targetResolutionHeight > 0 ? level.targetResolutionHeight : QualityThresholds.criticalVideoFloorHeight"),
            "applyVideoQuality must floor zero targetResolutionHeight with QualityThresholds.criticalVideoFloorHeight"
        )
        XCTAssertFalse(
            source.contains("level.targetResolutionHeight > 0 ? level.targetResolutionHeight : 360"),
            "applyVideoQuality must not hardcode 360 — use QualityThresholds.criticalVideoFloorHeight"
        )
    }

    /// VideoThermalProfile.apply must be called inside applyVideoQuality
    /// so thermal state is composited even on a healthy network.
    func test_applyVideoQuality_compositesThermalProfile() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("VideoThermalProfile.apply("),
            "applyVideoQuality must compose the network quality with VideoThermalProfile — " +
            "a hot device should shed load even when the network is excellent."
        )
        XCTAssertTrue(
            source.contains("ProcessInfo.processInfo.thermalState"),
            "applyVideoQuality must read the live thermalState from ProcessInfo."
        )
    }

    /// The final encoding call must use the thermal-adjusted values, not the raw level values.
    func test_applyVideoQuality_usesTourminalAdjustedValuesForEncoding() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("thermal.bitrateBps") && source.contains("thermal.framerate") && source.contains("thermal.scaleDownBy"),
            "applyVideoQuality must pass thermal.bitrateBps / .framerate / .scaleDownBy to " +
            "applyVideoEncoding — using raw level values bypasses the thermal ceiling."
        )
    }
}

// MARK: - Disconnect debounce source guards

/// `scheduleDisconnectEscalation` fires `webRTCServiceDidDisconnect` only after
/// `disconnectDebounceSeconds` of continuous ICE disconnection — allowing transient
/// network blips to recover before triggering a full reconnect cycle.
/// These guards catch a regression that would cost the user their whole call for
/// a <3.5s packet burst.
@MainActor
final class DisconnectDebounceSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_scheduleDisconnectEscalation_cancelsExistingTaskBeforeCreating() throws {
        let src = try webRTCServiceSource()
        guard let range = src.range(of: "func scheduleDisconnectEscalation()") else {
            XCTFail("scheduleDisconnectEscalation not found"); return
        }
        let end = src.range(of: "\n    }", range: range.upperBound..<src.endIndex)?.upperBound ?? src.endIndex
        let body = String(src[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("disconnectDebounceTask?.cancel()"),
            "scheduleDisconnectEscalation must cancel any prior debounce task before arming a new one"
        )
    }

    func test_scheduleDisconnectEscalation_usesThresholdConstant() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("QualityThresholds.disconnectDebounceSeconds"),
            "The debounce duration must reference QualityThresholds.disconnectDebounceSeconds — " +
            "a hardcoded literal makes the window invisible to tests and impossible to tune"
        )
    }

    func test_scheduleDisconnectEscalation_guardsConnectionStateBeforeFiring() throws {
        let src = try webRTCServiceSource()
        guard let range = src.range(of: "func scheduleDisconnectEscalation()") else {
            XCTFail("scheduleDisconnectEscalation not found"); return
        }
        let end = src.range(of: "\n    }", range: range.upperBound..<src.endIndex)?.upperBound ?? src.endIndex
        let body = String(src[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("connectionState == .disconnected"),
            "Before firing the delegate, the escalation must re-check connectionState == .disconnected — " +
            "the connection may have recovered during the debounce window"
        )
    }

    func test_scheduleDisconnectEscalation_checksCancellationBeforeFiring() throws {
        let src = try webRTCServiceSource()
        guard let range = src.range(of: "func scheduleDisconnectEscalation()") else {
            XCTFail("scheduleDisconnectEscalation not found"); return
        }
        let end = src.range(of: "\n    }", range: range.upperBound..<src.endIndex)?.upperBound ?? src.endIndex
        let body = String(src[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("Task.isCancelled"),
            "The debounce task must guard Task.isCancelled so a re-arm after ICE reconnection " +
            "suppresses a stale escalation that was already mid-sleep"
        )
    }
}

// MARK: - Quality delegate source guards

/// `didCollectStats` and `didChangeQualityLevel` are the two delegate callbacks
/// that carry quality data back to CallManager. They must be called in the right
/// places and with the right parameters.
@MainActor
final class WebRTCQualityDelegateSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `didCollectStats` must be called from the quality monitor with the
    /// delta-based `packetLossPercent` (not the cumulative ratio) so the gateway
    /// quality-alert and call-summary message see accurate loss data.
    func test_qualityMonitor_callsDidCollectStats_withDeltaPacketLoss() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("didCollectStats: stats, level: self.currentQualityLevel, packetLossPercent: packetLossPercent"),
            "The quality monitor must call delegate?.webRTCService(_:didCollectStats:level:packetLossPercent:) " +
            "with the delta-computed packetLossPercent"
        )
    }

    /// `didChangeQualityLevel` must fire when the quality level transitions so
    /// CallManager can emit `call:quality-report` to the gateway.
    func test_adjustBitrate_callsDidChangeQualityLevel_onTransition() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("delegate?.webRTCService(self, didChangeQualityLevel: newLevel, from: previousLevel)"),
            "When the quality level changes, adjustBitrate must call the didChangeQualityLevel delegate " +
            "so CallManager can report it to the gateway"
        )
    }
}

// MARK: - Testable WebRTC Client

private nonisolated final class TestableWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool = false
    var localVideoTrack: Any? = nil
    var remoteVideoTrack: Any? = nil

    var configureCallCount = 0
    var createOfferResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .offer, sdp: "mock"))
    var createAnswerResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .answer, sdp: "mock"))
    var addIceCandidateCallCount = 0
    var disconnectCallCount = 0
    var lastAudioEnabled: Bool?
    var lastVideoEnabled: Bool?
    var createDataChannelResult = false
    var lastDataChannelLabel: String?
    var lastSentData: Data?

    var audioEffectsService: CallAudioEffectsServiceProviding? = nil
    let videoFilterPipeline = VideoFilterPipeline()

    func configure(iceServers: [IceServer]) throws { configureCallCount += 1 }
    func updateIceServers(_ iceServers: [IceServer]) {}
    private(set) var lastNegotiationIsPolite: Bool?
    func setNegotiationRole(isPolite: Bool) { lastNegotiationIsPolite = isPolite }
    func createOffer() async throws -> SessionDescription { try createOfferResult.get() }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { try createAnswerResult.get() }
    func setRemoteAnswer(_ answer: SessionDescription) async throws {}
    func addIceCandidate(_ candidate: IceCandidate) async throws { addIceCandidateCallCount += 1 }
    func startLocalMedia(type: CallMediaType) async throws {}
    func toggleAudio(_ enabled: Bool) { lastAudioEnabled = enabled }
    func toggleVideo(_ enabled: Bool) { lastVideoEnabled = enabled }
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
    func availableCameras() -> [CameraDeviceOption] { [] }
    func switchToCamera(uniqueID: String) async throws {}
    var statsToReturn: CallStats? = nil
    func getStats() async -> CallStats? { statsToReturn }
    func createDataChannel(label: String) -> Bool {
        lastDataChannelLabel = label
        return createDataChannelResult
    }
    func sendDataChannelMessage(_ data: Data) { lastSentData = data }
    func disconnect() { disconnectCallCount += 1; isConnected = false }
    private(set) var restartIceCallCount = 0
    func restartIce() { restartIceCallCount += 1 }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws {}
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {}
}
