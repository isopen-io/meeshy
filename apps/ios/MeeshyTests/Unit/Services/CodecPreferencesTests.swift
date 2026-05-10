import XCTest
@testable import Meeshy

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
            source.contains("encoding.maxBitrateBps = NSNumber(value: 64_000)"),
            "audio bitrate cap must be set via RTCRtpEncodingParameters.maxBitrateBps"
        )
        XCTAssertTrue(
            source.contains("encoding.minBitrateBps = NSNumber(value: 16_000)"),
            "audio bitrate floor must be set via RTCRtpEncodingParameters.minBitrateBps"
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
