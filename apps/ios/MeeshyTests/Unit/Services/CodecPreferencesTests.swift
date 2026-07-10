import XCTest
@testable import Meeshy

#if canImport(WebRTC)

// MARK: - SDP Munging

/// Behavioral tests for the pure static SDP-munging helpers in P2PWebRTCClient.
/// These helpers are string→string transforms with no WebRTC runtime dependency —
/// the `#if canImport(WebRTC)` gate is required only because the methods are
/// declared inside the WebRTC-guarded section of P2PWebRTCClient.swift.
///
/// Covers: mungeOpusSDP, addTransportCC, addVideoBitrateHints, sdpDirections.
@MainActor
final class SDPMungingTests: XCTestCase {

    // MARK: - Test Fixtures

    private static let minimalAudioSDP = """
    v=0\r
    o=- 0 0 IN IP4 127.0.0.1\r
    s=-\r
    t=0 0\r
    m=audio 9 UDP/TLS/RTP/SAVPF 111 103\r
    a=rtpmap:111 opus/48000/2\r
    a=rtpmap:103 ISAC/16000\r
    \r

    """

    private static let sdpWithFmtp = """
    v=0\r
    o=- 0 0 IN IP4 127.0.0.1\r
    s=-\r
    t=0 0\r
    m=audio 9 UDP/TLS/RTP/SAVPF 111\r
    a=rtpmap:111 opus/48000/2\r
    a=fmtp:111 minptime=10;useinbandfec=1\r
    \r

    """

    private static let sdpWithVideo = """
    v=0\r
    o=- 0 0 IN IP4 127.0.0.1\r
    s=-\r
    t=0 0\r
    m=audio 9 UDP/TLS/RTP/SAVPF 111\r
    a=rtpmap:111 opus/48000/2\r
    m=video 9 UDP/TLS/RTP/SAVPF 96\r
    a=rtpmap:96 H264/90000\r
    a=fmtp:96 profile-level-id=42e01f\r
    \r

    """

    private static let sdpWithDirections = """
    v=0\r
    o=- 0 0 IN IP4 127.0.0.1\r
    s=-\r
    t=0 0\r
    m=audio 9 UDP/TLS/RTP/SAVPF 111\r
    a=sendrecv\r
    m=video 9 UDP/TLS/RTP/SAVPF 96\r
    a=recvonly\r
    \r

    """

    // MARK: - mungeOpusSDP

    func test_mungeOpusSDP_noOpusLine_returnsUnchanged() {
        let noOpus = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 103\r\na=rtpmap:103 ISAC/16000\r\n"
        let result = P2PWebRTCClient.mungeOpusSDP(noOpus)
        XCTAssertEqual(result, noOpus)
    }

    func test_mungeOpusSDP_injectsFmtpLine_whenMissing() {
        let result = P2PWebRTCClient.mungeOpusSDP(Self.minimalAudioSDP)
        XCTAssertTrue(result.contains("a=fmtp:111 "), "Must inject a=fmtp:111 line")
    }

    func test_mungeOpusSDP_setsDTX() {
        let result = P2PWebRTCClient.mungeOpusSDP(Self.minimalAudioSDP)
        XCTAssertTrue(result.contains("usedtx=1"), "DTX must be enabled via Opus fmtp")
    }

    func test_mungeOpusSDP_setsInbandFEC() {
        let result = P2PWebRTCClient.mungeOpusSDP(Self.minimalAudioSDP)
        XCTAssertTrue(result.contains("useinbandfec=1"), "In-band FEC must be enabled")
    }

    func test_mungeOpusSDP_setsBitrateAndStereo() {
        let result = P2PWebRTCClient.mungeOpusSDP(Self.minimalAudioSDP)
        XCTAssertTrue(result.contains("maxaveragebitrate=64000"))
        XCTAssertTrue(result.contains("stereo=1"))
    }

    func test_mungeOpusSDP_doesNotDuplicateExistingParams() {
        // When fmtp already exists, ensure each key appears only once.
        let result = P2PWebRTCClient.mungeOpusSDP(Self.sdpWithFmtp)
        let components = result.components(separatedBy: "useinbandfec=1")
        XCTAssertEqual(components.count, 2, "useinbandfec=1 must appear exactly once")
    }

    func test_mungeOpusSDP_mergesExistingFmtp() {
        // Existing params (minptime) must survive the merge.
        let result = P2PWebRTCClient.mungeOpusSDP(Self.sdpWithFmtp)
        XCTAssertTrue(result.contains("minptime=10"), "Pre-existing fmtp params must be preserved")
    }

    func test_mungeOpusSDP_isIdempotent() {
        let once = P2PWebRTCClient.mungeOpusSDP(Self.minimalAudioSDP)
        let twice = P2PWebRTCClient.mungeOpusSDP(once)
        // A second pass must not duplicate any Opus param key.
        let usedtxCount = once.components(separatedBy: "usedtx=1").count - 1
        let usedtxCountTwice = twice.components(separatedBy: "usedtx=1").count - 1
        XCTAssertEqual(usedtxCount, usedtxCountTwice, "mungeOpusSDP must be idempotent")
    }

    // MARK: - addTransportCC

    func test_addTransportCC_injectsExtmapLine() {
        let result = P2PWebRTCClient.addTransportCC(Self.sdpWithVideo)
        XCTAssertTrue(
            result.contains("ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"),
            "Transport-CC extmap URI must be injected"
        )
    }

    func test_addTransportCC_isIdempotent() {
        let once = P2PWebRTCClient.addTransportCC(Self.sdpWithVideo)
        let twice = P2PWebRTCClient.addTransportCC(once)
        let count = once.components(separatedBy: "transport-wide-cc").count
        let countTwice = twice.components(separatedBy: "transport-wide-cc").count
        XCTAssertEqual(count, countTwice, "addTransportCC must not inject Transport-CC twice")
    }

    func test_addTransportCC_picksUnusedExtmapId() {
        // Fabricate an SDP that already uses IDs 1–5.
        var sdp = Self.sdpWithVideo
        for id in 1...5 {
            sdp = sdp.replacingOccurrences(
                of: "a=rtpmap:96 H264/90000",
                with: "a=extmap:\(id) urn:ietf:params:rtp-hdrext:sdes:mid\r\na=rtpmap:96 H264/90000"
            )
        }
        let result = P2PWebRTCClient.addTransportCC(sdp)
        // The injected extmap line must not reuse IDs 1–5.
        for id in 1...5 {
            XCTAssertFalse(
                result.contains("a=extmap:\(id) http://www.ietf.org"),
                "Transport-CC must use an extmap ID that is not already in use"
            )
        }
    }

    // MARK: - addVideoBitrateHints

    func test_addVideoBitrateHints_appends_bitrateHints_toVideoFmtp() {
        let result = P2PWebRTCClient.addVideoBitrateHints(Self.sdpWithVideo)
        XCTAssertTrue(result.contains("x-google-max-bitrate=2500"))
        XCTAssertTrue(result.contains("x-google-min-bitrate=100"))
    }

    func test_addVideoBitrateHints_doesNotTouchAudio() {
        let result = P2PWebRTCClient.addVideoBitrateHints(Self.sdpWithVideo)
        // audio fmtp line, if any, must NOT contain video-specific hints.
        let lines = result.components(separatedBy: "\r\n")
        var inVideo = false
        for line in lines {
            if line.hasPrefix("m=video") { inVideo = true; continue }
            if line.hasPrefix("m=") { inVideo = false; continue }
            if !inVideo && line.hasPrefix("a=fmtp:") {
                XCTAssertFalse(line.contains("x-google-max-bitrate"), "Bitrate hints must only appear in the video section")
            }
        }
    }

    func test_addVideoBitrateHints_isIdempotent() {
        let once = P2PWebRTCClient.addVideoBitrateHints(Self.sdpWithVideo)
        let twice = P2PWebRTCClient.addVideoBitrateHints(once)
        let count = once.components(separatedBy: "x-google-max-bitrate").count
        let countTwice = twice.components(separatedBy: "x-google-max-bitrate").count
        XCTAssertEqual(count, countTwice, "addVideoBitrateHints must not append hints twice")
    }

    func test_addVideoBitrateHints_noVideoSection_returnsUnchanged() {
        let audioOnly = Self.minimalAudioSDP
        let result = P2PWebRTCClient.addVideoBitrateHints(audioOnly)
        XCTAssertEqual(result, audioOnly, "audio-only SDP must pass through unchanged")
    }

    // MARK: - sdpDirections

    func test_sdpDirections_sendrecvAudio_recvonlyVideo() {
        let result = P2PWebRTCClient.sdpDirections(Self.sdpWithDirections)
        XCTAssertTrue(result.contains("audio=sendrecv"))
        XCTAssertTrue(result.contains("video=recvonly"))
    }

    func test_sdpDirections_noDirectionLines_returnsNone() {
        let result = P2PWebRTCClient.sdpDirections(Self.minimalAudioSDP)
        XCTAssertEqual(result, "(none)")
    }
}

#endif

@MainActor
final class CodecPreferencesTests: XCTestCase {

    func test_p2pClient_uses_addTransceiver_audio() throws {
        // Source-level guard: P2PWebRTCClient.startLocalMedia must use
        // addTransceiver(of: .audio, init:) instead of add(track:streamIds:).
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + §7 E9/E12
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("peerConnection?.add(audioTrack, streamIds:"),
            "audio track must be added via addTransceiver(of: .audio), not add(track:streamIds:). " +
            "Reference §3.8 + §7 E9/E12"
        )
        XCTAssertTrue(
            source.contains("addTransceiver(of: .audio"),
            "P2PWebRTCClient must call addTransceiver(of: .audio, init:) for audio track"
        )
    }

    func test_p2pClient_appliesAudioCodecPreferences() throws {
        // Source-level guard: must call applyAudioCodecPreferences after
        // creating the audio transceiver, with Opus + RED codec order.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("applyAudioCodecPreferences"),
            "P2PWebRTCClient must define applyAudioCodecPreferences method"
        )
        XCTAssertTrue(
            source.contains("setCodecPreferences"),
            "Must call setCodecPreferences (libwebrtc 141 API)"
        )
    }

    func test_p2pClient_uses_addTransceiver_video() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("peerConnection?.add(videoTrack, streamIds:"),
            "video track must be added via addTransceiver(of: .video)"
        )
        XCTAssertTrue(
            source.contains("addTransceiver(of: .video"),
            "P2PWebRTCClient must call addTransceiver(of: .video, init:) for video track"
        )
    }

    func test_p2pClient_appliesVideoCodecPreferences() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("applyVideoCodecPreferences"),
            "P2PWebRTCClient must define applyVideoCodecPreferences method"
        )
        // Verify priority order: H264 > VP8 > VP9
        let priorityRange = source.range(of: "[\"H264\", \"VP8\", \"VP9\"]")
            ?? source.range(of: "[ \"H264\", \"VP8\", \"VP9\" ]")
        XCTAssertNotNil(priorityRange, "video codec priority must list H264, VP8, VP9 in that order")
    }

    func test_p2pClient_setsDtxViaEncodingParameters() throws {
        // Phase 2 reality check (API deviation from plan):
        // libwebrtc 141 iOS ObjC binding (WebRTC.xcframework) does NOT expose a
        // `dtx` property on RTCRtpEncodingParameters — verified against
        // RTCRtpEncodingParameters.h (only rid/isActive/maxBitrateBps/
        // minBitrateBps/maxFramerate/numTemporalLayers/scaleResolutionDownBy/
        // ssrc/bitratePriority/networkPriority/adaptiveAudioPacketTime).
        // DTX therefore remains driven by `usedtx=1` injected into Opus fmtp
        // via mungeOpusSDP (the only path available in this xcframework).
        // Bitrate range, however, IS set via RTCRtpEncodingParameters in
        // applyAudioCodecPreferences. This test pins both halves of that
        // pragmatic split.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("encoding.maxBitrateBps = NSNumber(value: QualityThresholds.defaultBitrate)"),
            "audio bitrate cap must be set via RTCRtpEncodingParameters.maxBitrateBps (QualityThresholds.defaultBitrate = 64 kbps)"
        )
        XCTAssertTrue(
            source.contains("encoding.minBitrateBps = NSNumber(value: QualityThresholds.audioCodecFloorBitrateBps)"),
            "audio bitrate floor must be set via RTCRtpEncodingParameters.minBitrateBps (QualityThresholds.audioCodecFloorBitrateBps = 16 kbps)"
        )
        XCTAssertTrue(
            source.contains("\"usedtx=1\""),
            "DTX must remain enabled via Opus fmtp `usedtx=1` (no native ObjC API in libwebrtc 141)"
        )
    }

    func test_p2pClient_removesAudioRedundancyMunging() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        // The static func addAudioRedundancy may exist or be removed — but it
        // MUST NOT be called (commented out in 9e663039 due to PT/PT bug;
        // RED is now negotiated via setCodecPreferences).
        let activeCalls = source.components(separatedBy: "\n").filter { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return trimmed.hasPrefix("mungedSDP = Self.addAudioRedundancy(")
        }
        XCTAssertEqual(
            activeCalls.count, 0,
            "addAudioRedundancy must NOT be called (replaced by setCodecPreferences). " +
            "Reference §3.8 + ADR-4."
        )
    }
}
