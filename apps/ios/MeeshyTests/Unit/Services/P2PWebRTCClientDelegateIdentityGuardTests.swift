//
//  P2PWebRTCClientDelegateIdentityGuardTests.swift
//  MeeshyTests
//
//  Source-level regression guard: RTCPeerConnectionDelegate callbacks fire from
//  WebRTC's internal signaling/network thread and are `nonisolated`. `disconnect()`
//  calls `peerConnection?.close()` then nils the property; `.close()` synchronously
//  queues these callbacks, which land on the main queue AFTER `disconnect()` has
//  already returned. If a new call reuses this client (redial, or a fast
//  VoIP-push-driven incoming call) before the stale block runs, a callback from the
//  torn-down connection would otherwise mutate/forward state that now belongs to the
//  new call (stale ICE candidates relayed under the new call's id, a stale
//  .closed/.failed state driving reconnection on a healthy new call, etc).
//
//  Every RTCPeerConnectionDelegate callback that forwards to `delegate` or mutates
//  `self` state must therefore compare the `peerConnection` instance captured at the
//  delegate call site against `self.peerConnection` inside the main-queue hop, and
//  no-op on mismatch. Not exercised behaviorally (RTCPeerConnection needs real
//  WebRTC internals), so this guards the fix at the source level — same convention
//  as P2PWebRTCClientConcurrencySourceTests for the sessionGeneration race.
//

import XCTest
@testable import Meeshy

@MainActor
final class P2PWebRTCClientDelegateIdentityGuardTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    /// Loud by construction: a missing start OR end marker fails the test via
    /// `XCTFail` (never a silent `XCTSkip`, which reads as green in CI) and the
    /// end marker is mandatory — no falling back to `source.endIndex` on a miss,
    /// which would silently widen the search window into unrelated code and let
    /// an assertion pass for the wrong reason. Mirrors the loud pattern already
    /// used in `CallManagerTests`.
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

    func test_deliverRemoteTrack_guardsOnOriginatingPeerConnectionIdentity() {
        guard let fn = body(
            from: "nonisolated private func deliverRemoteTrack(_ track: RTCMediaStreamTrack?, from peerConnection: RTCPeerConnection)",
            to: "nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream)"
        ) else { return }
        XCTAssertTrue(
            fn.contains("guard let self, self.peerConnection === peerConnection else { return }"),
            "deliverRemoteTrack must no-op when the delivering connection is not the currently active one — " +
            "otherwise a stale track from a torn-down call leaks into the next call's state."
        )
    }

    func test_didStartReceivingOn_and_didAddReceiver_and_didAddStream_passOriginatingConnection() {
        guard let fn = body(
            from: "extension P2PWebRTCClient: RTCPeerConnectionDelegate {",
            to: "nonisolated private func deliverRemoteTrack"
        ) else { return }
        XCTAssertTrue(fn.contains("deliverRemoteTrack(transceiver.receiver.track, from: peerConnection)"))
        XCTAssertTrue(fn.contains("deliverRemoteTrack(rtpReceiver.track, from: peerConnection)"))
        XCTAssertTrue(fn.contains("deliverRemoteTrack(stream.videoTracks.first, from: peerConnection)"))
        XCTAssertTrue(fn.contains("deliverRemoteTrack(stream.audioTracks.first, from: peerConnection)"))
    }

    func test_didChangeConnectionState_guardsOnOriginatingPeerConnectionIdentity() {
        guard let fn = body(
            from: "nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState)",
            to: "nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState)"
        ) else { return }
        XCTAssertTrue(
            fn.contains("guard let self, self.peerConnection === peerConnection else { return }"),
            "a stale .closed/.failed/.connected from a torn-down connection must not drive the FSM " +
            "of a call that has already moved on (e.g. spurious attemptReconnection())."
        )
    }

    func test_didGenerateCandidate_guardsOnOriginatingPeerConnectionIdentity() {
        guard let fn = body(
            from: "nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate)",
            to: "nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate])"
        ) else { return }
        XCTAssertTrue(
            fn.contains("guard let self, self.peerConnection === peerConnection else { return }"),
            "an ICE candidate generated by a torn-down connection must not be tagged with the " +
            "CURRENT call's callId and relayed into the new call's signaling."
        )
    }

    func test_didOpenDataChannel_guardsOnOriginatingPeerConnectionIdentity() {
        guard let fn = body(
            from: "nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel)",
            to: "// MARK: - RTCDataChannelDelegate"
        ) else { return }
        XCTAssertTrue(
            fn.contains("guard let self, self.peerConnection === peerConnection else { return }"),
            "a data channel opened by a torn-down connection must not overwrite the new call's " +
            "transcriptionDataChannel."
        )
    }

    // RTCDataChannelDelegate callbacks fire from the same WebRTC-internal thread as
    // RTCPeerConnectionDelegate and are subject to the identical staleness hazard: a data
    // channel torn down by `disconnect()` can still deliver a queued callback after a new
    // call has opened a fresh `transcriptionDataChannel`. The consequence is more severe
    // here than for the peer-connection callbacks above — `dataChannel(_:didReceiveMessageWith:)`
    // forwards `{"type":"bye"}` in-band hangups all the way to
    // `CallManager.webRTCService(_:didReceiveTranscriptionData:)`, which reads
    // `currentCallId` (the NEW call's id) and ends it. An unguarded stale "bye" from the
    // PREVIOUS call's peer would therefore hang up the wrong, active call.

    func test_dataChannelDidChangeState_guardsOnOriginatingDataChannelIdentity() {
        guard let fn = body(
            from: "nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel)",
            to: "nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer)"
        ) else { return }
        XCTAssertTrue(
            fn.contains("guard let self, dataChannel === self.transcriptionDataChannel else { return }"),
            "a stale state notification from a torn-down call's data channel must not start/stop " +
            "the keep-alive ping owned by the NEW call's transcriptionDataChannel."
        )
    }

    func test_didReceiveMessage_guardsOnOriginatingDataChannelIdentity() {
        guard let fn = body(
            from: "nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer)",
            to: "}\n}\n\n#else"
        ) else { return }
        XCTAssertTrue(
            fn.contains("guard let self, dataChannel === self.transcriptionDataChannel else { return }"),
            "a stale in-band message (notably a \"bye\" hangup) from a torn-down call's data " +
            "channel must not be forwarded as if it belonged to the call now in progress — it " +
            "would otherwise hang up the wrong, active call."
        )
    }
}
