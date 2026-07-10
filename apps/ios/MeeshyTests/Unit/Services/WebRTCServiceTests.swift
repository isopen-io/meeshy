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

    // MARK: - Configure / ICE Server Fallback

    func test_configure_nilIceServers_fallsBackToDefaultServers() {
        let (sut, client) = makeSUT()
        sut.configure(isVideo: false, iceServers: nil)
        XCTAssertEqual(client.lastConfiguredIceServers.count, IceServer.defaultServers.count)
    }

    func test_configure_emptyIceServers_fallsBackToDefaultServers() {
        // A VoIP push whose `iceServers` field decodes to zero usable servers (all
        // entries dropped by the credential-length guard, or an explicit `[]`) must
        // still fall back to STUN — passing `[]` straight through would configure
        // the peer connection with no servers at all, which fails behind any NAT.
        let (sut, client) = makeSUT()
        sut.configure(isVideo: false, iceServers: [])
        XCTAssertEqual(client.lastConfiguredIceServers.count, IceServer.defaultServers.count)
    }

    func test_configure_nonEmptyIceServers_passesThroughUnchanged() {
        let (sut, client) = makeSUT()
        let servers = [IceServer(urls: ["turn:turn.meeshy.me:3478"], username: "u", credential: "c")]
        sut.configure(isVideo: false, iceServers: servers)
        XCTAssertEqual(client.lastConfiguredIceServers.count, 1)
        XCTAssertEqual(client.lastConfiguredIceServers.first?.urls.first, "turn:turn.meeshy.me:3478")
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

    func test_addICECandidate_bufferCap_retainsNewestCandidates() async {
        // The buffer is a FIFO ring capped at 200: when full, the OLDEST entry is
        // evicted so the newest (highest-priority) candidate is always preserved.
        // After inserting 205 candidates the buffer holds the last 200 (#6–#205).
        // On flush the client receives exactly 200 calls.
        let (sut, client) = makeSUT()
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        // Overshoot the cap by 5.
        for _ in 0..<(QualityThresholds.iceCandidateBufferCap + 5) {
            sut.addICECandidate(candidate)
        }
        // Trigger flush by setting remote description.
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(desc)
        // Give the flush task time to drain the buffer.
        try? await Task.sleep(nanoseconds: 200_000_000)
        // Exactly iceCandidateBufferCap candidates forwarded — the 5 oldest were evicted.
        XCTAssertEqual(client.addIceCandidateCallCount, QualityThresholds.iceCandidateBufferCap)
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

    func test_createAnswer_failure_doesNotMarkRemoteDescriptionAsSet() async {
        // Regression guard: a failed createAnswer (e.g. the perfect-negotiation
        // glare guard raising `.offerIgnored` for a collided offer) must NOT flip
        // `hasRemoteDescription`, otherwise a subsequent ICE candidate is forwarded
        // straight to the ICE agent instead of buffered — for a remote description
        // that was never actually applied to the peer connection.
        let (sut, client) = makeSUT()
        client.createAnswerResult = .failure(WebRTCError.offerIgnored)

        let offer = SessionDescription(type: .offer, sdp: "offer-sdp")
        _ = await sut.createAnswer(from: offer)

        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        sut.addICECandidate(candidate)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(client.addIceCandidateCallCount, 0,
            "ICE candidates must still be buffered after a failed createAnswer — " +
            "the remote description was never successfully applied.")
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

    // MARK: - setRemoteDescription return value

    func test_setRemoteDescription_success_returnsTrue() async {
        let (sut, _) = makeSUT()
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        let result = await sut.setRemoteDescription(desc)
        XCTAssertTrue(result)
    }

    func test_setRemoteDescription_whenClientFails_returnsFalse() async {
        let (sut, client) = makeSUT()
        client.setRemoteAnswerResult = .failure(WebRTCError.failedToCreateSDP)
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        let result = await sut.setRemoteDescription(desc)
        XCTAssertFalse(result)
    }

    func test_setRemoteDescription_whenClientFails_doesNotFlushCandidates() async {
        let (sut, client) = makeSUT()
        client.setRemoteAnswerResult = .failure(WebRTCError.failedToCreateSDP)
        let candidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:test")
        sut.addICECandidate(candidate)
        let desc = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(desc)
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(client.addIceCandidateCallCount, 0)
    }

    // MARK: - ICE Restart

    func test_performICERestart_returnsNewOffer() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "restart-offer"))

        let result = await sut.performICERestart()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.sdp, "restart-offer")
    }

    func test_performICERestart_callsRestartIceOnClient() async {
        let (sut, client) = makeSUT()
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "restart-offer"))

        _ = await sut.performICERestart()

        XCTAssertEqual(client.restartIceCallCount, 1,
            "performICERestart must signal the peer connection to embed new ICE credentials " +
            "via restartIce() (IceRestart:true constraint). Omitting this means the ICE " +
            "re-gather uses old credentials that the remote peer will reject.")
    }

    func test_performICERestart_clearsStaleCandidateBufferBeforeRestart() async {
        // Candidates buffered during a failed ICE session belong to the old ufrag/pwd.
        // After an ICE restart, those stale candidates must be discarded so the flush
        // that follows the new answer doesn't forward them to the new ICE agent.
        let (sut, client) = makeSUT()
        let staleCandidate = IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:stale")
        sut.addICECandidate(staleCandidate)
        sut.addICECandidate(staleCandidate)
        client.createOfferResult = .success(SessionDescription(type: .offer, sdp: "restart-offer"))

        _ = await sut.performICERestart()

        // Setting a new remote answer after the restart must flush zero stale candidates.
        let answer = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(answer)
        try? await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(client.addIceCandidateCallCount, 0,
            "performICERestart must clear the candidate buffer. " +
            "Stale candidates from the previous ICE session use old ufrag/pwd that the " +
            "remote peer will reject, causing the new ICE session to silently fail.")
    }

    func test_addICECandidate_bufferCap_oldestCandidateIsEvictedFirst() async {
        // The buffer is a FIFO ring: when full (200), the OLDEST entry is evicted.
        // This test proves the eviction order by using labelled candidates and
        // verifying that after one overflow, candidate:0 (oldest) is gone while
        // candidate:200 (newest) is present.
        let (sut, client) = makeSUT()
        for i in 0..<QualityThresholds.iceCandidateBufferCap {
            sut.addICECandidate(IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:\(i)"))
        }
        // One more triggers FIFO eviction of candidate:0
        sut.addICECandidate(IceCandidate(sdpMid: "0", sdpMLineIndex: 0, candidate: "candidate:200"))

        let answer = SessionDescription(type: .answer, sdp: "v=0\r\n")
        await sut.setRemoteDescription(answer)
        try? await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertEqual(client.addIceCandidateCallCount, QualityThresholds.iceCandidateBufferCap)
        XCTAssertEqual(client.addedCandidates.first?.candidate, "candidate:1",
            "The oldest candidate (candidate:0) must be the evicted one — the buffer " +
            "must preserve relay candidates that arrive after the initial STUN gather.")
        XCTAssertEqual(client.addedCandidates.last?.candidate, "candidate:200",
            "The newest candidate must always be retained by the FIFO ring.")
    }

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

// MARK: - ICE candidate buffer FIFO source guards

/// Verifies that the ICE candidate buffer uses FIFO eviction (removeFirst) rather
/// than silently discarding new arrivals. A regression to "return early when full"
/// means relay candidates gathered after the STUN round-trip are never buffered,
/// silently killing connectivity on symmetric-NAT networks.
@MainActor
final class ICECandidateBufferSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The buffer must evict the OLDEST entry (removeFirst) when full, NOT the
    /// newest. Discarding new arrivals would strand late-arriving relay candidates
    /// that are essential for symmetric-NAT traversal.
    func test_iceCandidateBuffer_usesFirstInFirstOutEviction() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("iceCandidateBuffer.removeFirst()"),
            "ICE candidate buffer must use FIFO eviction (removeFirst) when full — " +
            "silently dropping new candidates discards relay candidates that arrive " +
            "after the initial STUN gather and breaks symmetric-NAT connectivity."
        )
    }

    /// The guard must NOT use an early `return` path that discards new candidates
    /// when the buffer cap is hit.
    func test_iceCandidateBuffer_doesNotDropNewCandidatesWhenFull() throws {
        let src = try webRTCServiceSource()
        guard let addFunc = src.range(of: "func addICECandidate(_ candidate: IceCandidate)") else {
            XCTFail("addICECandidate function not found in WebRTCService.swift"); return
        }
        let body = String(src[addFunc.lowerBound...])
        XCTAssertFalse(
            body.contains("return") && body.contains("dropping candidate"),
            "addICECandidate must not silently drop new candidates — use FIFO eviction instead."
        )
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

    /// BWE merge: the effective level must flow through the gated policy.
    /// 2026-07-03 — the previous unconditional `min(heuristic, bwe)` WAS the
    /// "Connexion instable à 00:06" bug: the BWE ladder is calibrated on
    /// VIDEO tier bitrates, so audio-only calls (~64 kbps forever) and the
    /// GCC ramp-up both read as .poor on a perfectly healthy link. The merge
    /// now goes through CallReliabilityPolicy.effectiveQualityLevel, which
    /// gates the BWE signal on video-sending + warm-up and still takes
    /// min(heuristic, bwe) after warm-up (see QualityLevelMergePolicyTests).
    func test_adjustBitrate_mergesBWEWithHeuristicViaPolicy() throws {
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("stats.availableOutgoingBitrateBps > 0"),
            "BWE gate: TWCC estimate should only be applied when availableOutgoingBitrateBps > 0"
        )
        XCTAssertTrue(
            source.contains("CallReliabilityPolicy.effectiveQualityLevel("),
            "BWE merge: the effective quality level must be computed by " +
            "CallReliabilityPolicy.effectiveQualityLevel (video-sending + " +
            "warm-up gated min) — never an unconditional min(heuristic, bwe)."
        )
        XCTAssertTrue(
            source.contains("isSendingVideo: hasLocalVideoTrack"),
            "BWE merge: the video-sending gate must be driven by hasLocalVideoTrack."
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
            source.contains("qualityLevelDebounceSeconds"),
            "Debounce: the suppression window must gate on QualityThresholds.qualityLevelDebounceSeconds (5s) to avoid thrashing the video encoder — not a hardcoded literal (see test_qualityLevelDebounce_usesQualityThresholdsConstant)"
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

    func test_qualityLevelDebounce_usesQualityThresholdsConstant() throws {
        // Regression guard: the quality-level debounce gate in processStats must not
        // hardcode 5.0 — it must reference QualityThresholds.qualityLevelDebounceSeconds
        // so future tuning is done in one place.
        let source = try webRTCServiceSource()
        XCTAssertTrue(
            source.contains("qualityLevelDebounceSeconds"),
            "processStats debounce gate must use QualityThresholds.qualityLevelDebounceSeconds"
        )
        XCTAssertFalse(
            source.contains("< 5.0"),
            "Hardcoded < 5.0 debounce in processStats — replace with QualityThresholds.qualityLevelDebounceSeconds"
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

// MARK: - Audio encoding + quality monitor source guards

/// `adjustBitrate` must propagate the new bitrate ceiling to the live audio
/// sender via `applyAudioEncoding`. Previously the bitrate was computed and
/// logged but never written to the encoder — adaptation had zero effect.
/// These guards also verify the quality monitor's nil-stats path uses
/// `continue` (loop keeps running) rather than `return` (loop exits silently).
@MainActor
final class AdjustBitrateAudioEncodingSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The bitrate change branch inside `adjustBitrate` must call
    /// `client.applyAudioEncoding(maxBitrateBps:)` so the encoder actually
    /// sheds bandwidth on a degraded link.
    func test_adjustBitrate_callsApplyAudioEncoding_whenBitrateChanges() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("client.applyAudioEncoding(maxBitrateBps: effectiveBitrate)"),
            "adjustBitrate must call client.applyAudioEncoding(maxBitrateBps:) with effectiveBitrate " +
            "(which applies the jitter gate) — omitting this means the audio encoder never actually sheds bandwidth."
        )
    }

    /// Quality monitor must use `continue` for the nil-stats path so the
    /// monitoring loop keeps running after a failed stats read. A `return`
    /// here silently exits the outer Task and all future ticks are lost.
    func test_qualityMonitor_usesConinueForNilStats_notReturn() throws {
        let src = try webRTCServiceSource()
        // The guard immediately before adjustBitrate must use `continue` not `return`.
        XCTAssertTrue(
            src.contains("guard let stats = await self.client.getStats() else { continue }"),
            "The quality monitor nil-stats guard must use `continue` (skip tick) not `return` (exit loop) — " +
            "a `return` here kills all future quality monitoring for the call."
        )
    }
}

// MARK: - Jitter-aware bitrate gate source guards

/// `adjustBitrate` applies a jitter gate after the RTT/loss tier selection:
/// two consecutive ticks with `jitterMs > QualityThresholds.highJitterThresholdMs`
/// (via `JitterBitrateCapTracker`) cap the effective bitrate to `minBitrate`
/// regardless of RTT/loss signal. High jitter degrades Opus PLC even on a
/// low-latency path; shedding encoder complexity gives the jitter buffer
/// headroom to absorb the spikes. The hysteresis (vs. a single-tick gate)
/// prevents a lone jitter blip from yanking bitrate down and back up on the
/// very next 5s tick (audible warble on a link that's otherwise fine).
@MainActor
final class AdjustBitrateJitterGateSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_adjustBitrate_jitterGate_comparesAgainstHighJitterThreshold() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("thresholdMs: QualityThresholds.highJitterThresholdMs"),
            "adjustBitrate must gate on QualityThresholds.highJitterThresholdMs — " +
            "a hardcoded literal here would silently diverge from the tested constant."
        )
    }

    func test_adjustBitrate_jitterGate_usesHysteresisTracker() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("jitterBitrateCapTracker.record("),
            "adjustBitrate must gate the jitter cap through JitterBitrateCapTracker — " +
            "a raw single-tick comparison re-introduces the audible warble a lone jitter blip caused."
        )
    }

    func test_adjustBitrate_jitterGate_capsToMinBitrate() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("let effectiveBitrate = jitterCapped ? QualityThresholds.minBitrate : newBitrate"),
            "When the jitter tracker confirms the cap, the effective bitrate must be minBitrate — " +
            "any other fallback value leaves the Opus encoder at a bitrate too high for the jitter buffer to compensate."
        )
    }

    func test_adjustBitrate_jitterGate_logsJitterTagWhenCapped() throws {
        let src = try webRTCServiceSource()
        XCTAssertTrue(
            src.contains("jitter=%.0fms[capped]"),
            "When jitter caps the bitrate the log message must include a [capped] tag so operators " +
            "can distinguish a jitter-driven reduction from a network-congestion-driven one."
        )
    }

    func test_stopQualityMonitor_resetsJitterTracker() throws {
        let src = try webRTCServiceSource()
        guard let range = src.range(of: "func stopQualityMonitor()") else {
            XCTFail("stopQualityMonitor not found"); return
        }
        let end = src.range(of: "\n    }", range: range.upperBound..<src.endIndex)?.upperBound ?? src.endIndex
        let body = String(src[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("jitterBitrateCapTracker.reset()"),
            "stopQualityMonitor must reset the jitter hysteresis streak — otherwise a streak from the " +
            "end of one call/monitor cycle could carry into the next and cap bitrate prematurely."
        )
    }
}

// MARK: - JitterBitrateCapTracker (behavioral)

/// Mirrors `DegradedLinkTrackerTests`: two consecutive high-jitter ticks
/// before capping, immediate clear on the first tick back under threshold.
final class JitterBitrateCapTrackerTests: XCTestCase {

    private let threshold = 30.0

    func test_record_singleHighJitterTick_doesNotCap() {
        var tracker = JitterBitrateCapTracker()
        XCTAssertFalse(tracker.record(jitterMs: 45, thresholdMs: threshold))
    }

    func test_record_consecutiveHighJitterTicks_caps() {
        var tracker = JitterBitrateCapTracker()
        _ = tracker.record(jitterMs: 45, thresholdMs: threshold)
        XCTAssertTrue(tracker.record(jitterMs: 50, thresholdMs: threshold))
    }

    func test_record_healthyTick_clearsImmediately() {
        var tracker = JitterBitrateCapTracker()
        _ = tracker.record(jitterMs: 45, thresholdMs: threshold)
        _ = tracker.record(jitterMs: 50, thresholdMs: threshold)
        XCTAssertFalse(tracker.record(jitterMs: 10, thresholdMs: threshold))
    }

    func test_record_interruptedStreak_doesNotCap() {
        var tracker = JitterBitrateCapTracker()
        _ = tracker.record(jitterMs: 45, thresholdMs: threshold)
        _ = tracker.record(jitterMs: 5, thresholdMs: threshold)
        XCTAssertFalse(tracker.record(jitterMs: 45, thresholdMs: threshold))
    }

    func test_record_jitterAtExactThreshold_doesNotCap() {
        var tracker = JitterBitrateCapTracker()
        _ = tracker.record(jitterMs: threshold, thresholdMs: threshold)
        XCTAssertFalse(tracker.record(jitterMs: threshold, thresholdMs: threshold))
    }

    func test_reset_clearsStreakAndCap() {
        var tracker = JitterBitrateCapTracker()
        _ = tracker.record(jitterMs: 45, thresholdMs: threshold)
        _ = tracker.record(jitterMs: 50, thresholdMs: threshold)
        tracker.reset()
        XCTAssertFalse(tracker.isCapped)
        XCTAssertFalse(tracker.record(jitterMs: 45, thresholdMs: threshold))
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

// MARK: - ICE candidate + remote SDP input validation source guards

/// These guards verify that `P2PWebRTCClient` rejects malicious or malformed
/// inputs before passing them to libwebrtc. libwebrtc processes ICE candidate
/// strings and SDP blobs in C++ without Swift-level bounds checks; a hostile
/// signaling peer could otherwise trigger parsing errors or OOM inside the
/// library.
@MainActor
final class WebRTCInputValidationSourceGuardTests: XCTestCase {

    private func p2pClientSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// ICE candidate sdpMLineIndex must be validated in the range 0-255 before
    /// being passed to RTCIceCandidate. A value of -1 is invalid; INT32_MAX would
    /// cause an assertion failure inside libwebrtc.
    func test_addIceCandidate_validatesSDPMLineIndexRange() throws {
        let src = try p2pClientSource()
        XCTAssertTrue(
            src.contains("candidate.sdpMLineIndex >= 0") && src.contains("candidate.sdpMLineIndex <= 255"),
            "addIceCandidate must validate sdpMLineIndex is in 0-255 before creating RTCIceCandidate — " +
            "an out-of-range value causes an assertion failure inside libwebrtc."
        )
    }

    /// sdpMid is a free-form string from a remote peer; a multi-KB sdpMid would
    /// cause excessive memory allocation inside RTCIceCandidate parsing.
    func test_addIceCandidate_validatesSdpMidLength() throws {
        let src = try p2pClientSource()
        XCTAssertTrue(
            src.contains("mid.count <= QualityThresholds.iceCandidateSdpMidMaxLength"),
            "addIceCandidate must check sdpMid length <= QualityThresholds.iceCandidateSdpMidMaxLength " +
            "(256) to prevent oversized strings from a hostile peer reaching libwebrtc."
        )
    }

    /// The candidate SDP line (e.g. 'candidate:...') is parsed by libwebrtc in C++.
    /// A 100 MB candidate line could cause OOM inside the library.
    func test_addIceCandidate_validatesCandidateLineLength() throws {
        let src = try p2pClientSource()
        XCTAssertTrue(
            src.contains("candidate.candidate.count <= QualityThresholds.iceCandidateLineMaxBytes"),
            "addIceCandidate must enforce a 10 KB ceiling on the candidate line via " +
            "QualityThresholds.iceCandidateLineMaxBytes — libwebrtc has no app-level length " +
            "guard and processes the string in C++."
        )
    }

    /// Remote SDP must be bounded before being passed to RTCSessionDescription.
    /// A 1 MB+ SDP payload is never legitimate; an unbounded string could cause OOM.
    func test_setRemoteAnswer_validatesSDPLength() throws {
        let src = try p2pClientSource()
        XCTAssertTrue(
            src.contains("sdp.count <= 1_000_000"),
            "validateRemoteSDP must reject SDP blobs over 1 MB — passing arbitrarily " +
            "large strings to RTCSessionDescription risks OOM inside libwebrtc."
        )
    }

    /// The mandatory v=0 line is the first indicator that an SDP is well-formed.
    /// Rejecting SDPs without it provides early defense against garbage payloads.
    func test_setRemoteAnswer_rejectsSDPMissingVersionLine() throws {
        let src = try p2pClientSource()
        XCTAssertTrue(
            src.contains("sdp.hasPrefix(\"v=0\")"),
            "validateRemoteSDP must check that the SDP starts with 'v=0' — the mandatory " +
            "first line. Any SDP that doesn't start with v=0 is malformed."
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
    private(set) var lastConfiguredIceServers: [IceServer] = []
    var createOfferResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .offer, sdp: "mock"))
    var createAnswerResult: Result<SessionDescription, Error> = .success(SessionDescription(type: .answer, sdp: "mock"))
    var addIceCandidateCallCount = 0
    private(set) var addedCandidates: [IceCandidate] = []
    var disconnectCallCount = 0
    var lastAudioEnabled: Bool?
    var lastVideoEnabled: Bool?
    var createDataChannelResult = false
    var lastDataChannelLabel: String?
    var lastSentData: Data?

    let videoFilterPipeline = VideoFilterPipeline()

    func configure(iceServers: [IceServer]) throws {
        configureCallCount += 1
        lastConfiguredIceServers = iceServers
    }
    func updateIceServers(_ iceServers: [IceServer]) {}
    private(set) var lastNegotiationIsPolite: Bool?
    func setNegotiationRole(isPolite: Bool) { lastNegotiationIsPolite = isPolite }
    func createOffer() async throws -> SessionDescription { try createOfferResult.get() }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { try createAnswerResult.get() }
    var setRemoteAnswerResult: Result<Void, Error> = .success(())
    func setRemoteAnswer(_ answer: SessionDescription) async throws { try setRemoteAnswerResult.get() }
    func addIceCandidate(_ candidate: IceCandidate) async throws {
        addIceCandidateCallCount += 1
        addedCandidates.append(candidate)
    }
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
    private(set) var applyAudioEncodingCallCount = 0
    private(set) var lastAudioEncodingMaxBitrateBps: Int?
    func applyAudioEncoding(maxBitrateBps: Int) {
        applyAudioEncodingCallCount += 1
        lastAudioEncodingMaxBitrateBps = maxBitrateBps
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
    private(set) var disconnectAfterFlushingPendingSendCallCount = 0
    func disconnectAfterFlushingPendingSend() {
        disconnectAfterFlushingPendingSendCallCount += 1
        disconnect()
    }
    private(set) var restartIceCallCount = 0
    func restartIce() { restartIceCallCount += 1 }
    func sendDTMF(digits: String) {}
}

// MARK: - Camera switch serialization source guard

/// A rapid double-tap on flip-camera used to fire two untracked `Task`s, each
/// running `stopCapture()`/`startCapture()` on the same `RTCCameraVideoCapturer`
/// concurrently — can leave the capturer in an indeterminate state or desync
/// `isUsingFrontCamera` from the actually active camera. `switchCamera()` and
/// `switchToCamera(uniqueID:)` must chain onto the previous in-flight task
/// (mirroring `CallManager.holdVideoTask`'s pattern) instead of firing a bare
/// `Task { }` per call.
@MainActor
final class SwitchCameraSourceGuardTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of funcSignature: String, in source: String) -> String? {
        guard let range = source.range(of: funcSignature) else { return nil }
        let end = source.range(of: "\n    }", range: range.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        return String(source[range.lowerBound..<end])
    }

    func test_switchCamera_chainsOntoPreviousTask() throws {
        let src = try webRTCServiceSource()
        guard let body = body(of: "func switchCamera()", in: src) else {
            XCTFail("switchCamera() not found"); return
        }
        XCTAssertTrue(
            body.contains("switchCameraTask"),
            "switchCamera() must track its Task in switchCameraTask so a rapid double-tap serializes " +
            "instead of racing two concurrent capturer restarts"
        )
        XCTAssertTrue(
            body.contains("await previousTask?.value"),
            "switchCamera() must await the previous in-flight switch before starting a new one"
        )
    }

    func test_switchToCamera_chainsOntoPreviousTask() throws {
        let src = try webRTCServiceSource()
        guard let body = body(of: "func switchToCamera(uniqueID: String)", in: src) else {
            XCTFail("switchToCamera(uniqueID:) not found"); return
        }
        XCTAssertTrue(
            body.contains("switchCameraTask"),
            "switchToCamera(uniqueID:) must track its Task in switchCameraTask so it serializes " +
            "against a concurrent switchCamera()/switchToCamera(uniqueID:) call"
        )
        XCTAssertTrue(
            body.contains("await previousTask?.value"),
            "switchToCamera(uniqueID:) must await the previous in-flight switch before starting a new one"
        )
    }

    func test_close_cancelsSwitchCameraTask() throws {
        let src = try webRTCServiceSource()
        guard let body = body(of: "func close()", in: src) else {
            XCTFail("close() not found"); return
        }
        XCTAssertTrue(
            body.contains("switchCameraTask?.cancel()"),
            "close() must cancel switchCameraTask like its other tracked tasks so a pending camera " +
            "switch cannot outlive teardown"
        )
    }
}

// MARK: - No-WebRTC fallback conformance (`#else` branch, CI without the WebRTC package resolved)

/// `P2PWebRTCClient`'s `#else` fallback (compiled only when `canImport(WebRTC)` is
/// false) must implement every `WebRTCClientProviding` requirement like the real
/// implementation does — a gap here only breaks a build that never resolves the
/// WebRTC SPM package, so it is easy to introduce silently while editing the real
/// implementation's protocol conformance.
@MainActor
final class P2PWebRTCClientFallbackConformanceSourceGuardTests: XCTestCase {

    private func p2pClientSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func fallbackClassBody() throws -> String {
        let source = try p2pClientSource()
        guard let elseRange = source.range(of: "\n#else\n") else {
            XCTFail("`#else` fallback branch not found in P2PWebRTCClient.swift"); throw XCTSkip()
        }
        guard let endRange = source.range(of: "\n#endif", range: elseRange.upperBound..<source.endIndex) else {
            XCTFail("`#endif` closing the fallback branch not found"); throw XCTSkip()
        }
        return String(source[elseRange.upperBound..<endRange.lowerBound])
    }

    func test_fallback_implementsApplyAudioEncoding() throws {
        let body = try fallbackClassBody()
        XCTAssertTrue(
            body.contains("func applyAudioEncoding(maxBitrateBps: Int)"),
            "The no-WebRTC fallback class must implement applyAudioEncoding(maxBitrateBps:) " +
            "(a WebRTCClientProviding requirement) — without it, a build with the WebRTC " +
            "package unresolved fails to compile."
        )
    }

    func test_fallback_declaresVideoFilterPipeline() throws {
        let body = try fallbackClassBody()
        XCTAssertTrue(
            body.contains("videoFilterPipeline"),
            "The no-WebRTC fallback class must declare videoFilterPipeline " +
            "(a WebRTCClientProviding requirement) — without it, a build with the WebRTC " +
            "package unresolved fails to compile."
        )
    }

    func test_fallback_doesNotDeclareRemovedSetMaxAudioBitrate() throws {
        let body = try fallbackClassBody()
        XCTAssertFalse(
            body.contains("setMaxAudioBitrate"),
            "setMaxAudioBitrate was removed from WebRTCClientProviding (dead API, superseded " +
            "by applyAudioEncoding, zero prod callers) — it must not reappear in the fallback."
        )
    }
}
