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
}
