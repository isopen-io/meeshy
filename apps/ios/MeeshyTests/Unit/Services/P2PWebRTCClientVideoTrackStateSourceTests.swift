//
//  P2PWebRTCClientVideoTrackStateSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `hasLocalVideoTrack` drives three UI/policy
//  decisions that all assume it means "currently sending video" — not merely
//  "a track object exists":
//    - CallView.swift `effectiveSwapStreams` falls back to the peer's video
//      "while the survival controller has dropped the outbound track"
//    - CallView.swift's `localVideoSuspendedTile` branch only reaches for
//      `isVideoEnabled && !hasLocalVideoTrack` (survival-suspended state)
//    - WebRTCService.swift's bitrate/quality policy gates `isSendingVideo`
//      on the same flag
//  `disableLocalVideo()` intentionally keeps `localVideoTrack_` alive (so a
//  later `enableLocalVideo()` can cheaply re-enable the SAME track instead of
//  rebuilding the capturer) — so `hasLocalVideoTrack` must be derived from the
//  track's `isEnabled` state, not from `localVideoTrack_ != nil`, or every
//  survival-triggered downgrade leaves it permanently (and silently) wrong for
//  the rest of the call. Not exercised behaviorally (RTCPeerConnection needs
//  real hardware/capture session), so this guards the fix at the source level
//  — same pattern as P2PWebRTCClientConcurrencySourceTests.
//

import XCTest
@testable import Meeshy

@MainActor
final class P2PWebRTCClientVideoTrackStateSourceTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    private func body(from startMarker: String, to endMarker: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        guard !Self.source.isEmpty else {
            XCTFail("Could not read P2PWebRTCClient.swift", file: file, line: line)
            return nil
        }
        guard let start = Self.source.range(of: startMarker) else {
            XCTFail("Start marker not found — file structure changed: \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let end = Self.source.range(of: endMarker, range: start.upperBound..<Self.source.endIndex) else {
            XCTFail("End marker not found — file structure changed: \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(Self.source[start.lowerBound..<end.lowerBound])
    }

    func test_hasLocalVideoTrack_reflectsEnabledState_notMereTrackExistence() {
        guard let fn = body(
            from: "var hasLocalVideoTrack: Bool {",
            to: "func enableLocalVideo()"
        ) else { return }
        XCTAssertTrue(
            fn.contains("isEnabled"),
            "hasLocalVideoTrack must check the track's isEnabled state, not just localVideoTrack_ != nil — " +
            "disableLocalVideo() intentionally keeps the track object alive for cheap re-enable, so a raw " +
            "nil-check never goes false after a survival downgrade, permanently breaking effectiveSwapStreams " +
            "and the localVideoSuspendedTile UI (CallView.swift)."
        )
    }

    func test_disableLocalVideo_doesNotDeallocateTheReusableTrack() {
        guard let fn = body(
            from: "func disableLocalVideo() async -> Bool {",
            to: "/// Restarts the existing capturer"
        ) else { return }
        XCTAssertFalse(
            fn.contains("localVideoTrack_ = nil"),
            "disableLocalVideo() must NOT nil out localVideoTrack_ — enableLocalVideo()'s fast path " +
            "(localVideoTrack_ != nil branch) re-enables the SAME track object rather than rebuilding " +
            "the capturer from scratch on every survival downgrade/resume cycle."
        )
    }
}
