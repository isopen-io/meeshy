//
//  CallManagerSurvivalFreezeSourceTests.swift
//  MeeshyTests
//
//  Calling-stack audit (2026-08-25) — lot L6-1 / L6-2.
//
//  The network-survival layer used to DROP outbound video: stop the capture,
//  detach the track, flip the transceiver to `recvOnly`, renegotiate — and
//  ANNOUNCE it to the peer with `call:media-toggled(video,false)`, the very
//  event the camera button sends. The event carries no reason, so the peer
//  could not tell a weak link from a deliberate camera-off: it answered by
//  DESTROYING the last frame in favour of our avatar placeholder.
//
//  It now freezes the ENCODER (`WebRTCService.freezeVideoForSurvival()`), and
//  the actuator announces NOTHING. The peer keeps the last frame; the weak link
//  is surfaced — when the gateway's own rtt/loss thresholds fire — by
//  `call:quality-alert`. Written down rather than implied: that is NOT
//  equivalent coverage. A `.poor`/`.critical` tier reached through bandwidth or
//  jitter alone raises no alert, so there are freezes where the peer sees no
//  indicator at all. Accepted trade: a still frame without a pill beats a false
//  "camera off".
//
//  Source-level guards: the actuator drives a real WebRTC/AVCaptureSession
//  stack, so the absence of an emission cannot be observed behaviourally here.
//  Every assertion below is NEGATIVE and must go red again if the emission —
//  or the renegotiation — is reintroduced.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerSurvivalFreezeSourceTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Body of `actuateSurvivalVideoSend(enabled:callId:)` — the actuator
    /// itself, bounded semantically from its signature to the function's
    /// closing brace. It carries no comment, so a negative guard reading it
    /// reads CODE only.
    private func actuatorBody() throws -> String {
        let source = try callManagerSource()
        guard let fnRange = source.range(
            of: "private func actuateSurvivalVideoSend(enabled: Bool, callId: String) async -> Bool {"
        ) else {
            XCTFail("actuateSurvivalVideoSend not found in CallManager.swift"); return ""
        }
        let after = String(source[fnRange.upperBound...])
        guard let end = after.range(of: "\n    }")?.upperBound else {
            XCTFail("Could not bound actuateSurvivalVideoSend"); return ""
        }
        return String(after[..<end])
    }

    // MARK: - L6-1: the actuator floors the encoder, it does not move media

    func test_actuateSurvivalVideoSend_drivesTheEncoderFloor() throws {
        let body = try actuatorBody()
        XCTAssertTrue(
            body.contains("webRTCService.freezeVideoForSurvival()"),
            "The suspend direction must enter the encoder freeze — a STATE on WebRTCService, so the " +
            "ladder's own re-applications (tier change, thermal transition) cannot thaw it."
        )
        XCTAssertTrue(
            body.contains("webRTCService.unfreezeVideoAfterSurvival()"),
            "The resume direction must hand the encoder back to the quality ladder."
        )
    }

    func test_survivalSuspend_doesNotDetachTheTrackOrRenegotiate() throws {
        let body = try actuatorBody()
        for banned in ["downgradeFromVideo()", "upgradeToVideo()", "createOffer()", "emitCallOffer("] {
            XCTAssertFalse(
                body.contains(banned),
                "actuateSurvivalVideoSend must not call `\(banned)`: the freeze keeps the track, the " +
                "transceiver and the capture in place, so there is nothing to renegotiate — and an " +
                "SDP round-trip is exactly what a degraded link cannot carry."
            )
        }
    }

    // MARK: - L6-2: the actuator announces nothing to the peer

    func test_survivalSuspend_doesNotEmitMediaToggle() throws {
        let body = try actuatorBody()
        XCTAssertFalse(
            body.contains("emitCallToggleVideo"),
            "actuateSurvivalVideoSend must NOT emit call:media-toggled. The event carries no reason, " +
            "so the peer reads it as a deliberate camera-off and destroys the last frame — the exact " +
            "outcome the freeze exists to avoid. `call:media-toggled` stays reserved for the three " +
            "cases where capture really stops: camera button, capture interruption, CallKit hold."
        )
    }

    /// The same signal used to leave by a SECOND door: the socket-reconnect
    /// resync folded the freeze into its effective-video expression — and a
    /// socket reconnect is most likely precisely DURING a degraded episode.
    /// Removing the actuator's emission alone would have left the defect
    /// intact, one layer down.
    func test_reconnectResync_ignoresSurvivalFreeze() throws {
        let source = try callManagerSource()
        guard let assignRange = source.range(of: "let effectiveVideoOn =") else {
            XCTFail("effectiveVideoOn assignment not found in CallManager.swift"); return
        }
        guard let end = source.range(
            of: "MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: effectiveVideoOn)",
            range: assignRange.upperBound..<source.endIndex
        )?.lowerBound else {
            XCTFail("Could not bound the effectiveVideoOn expression"); return
        }
        // The bare flag is a PREFIX of both qualified names — strip them first,
        // so this guard falls only on `isVideoSuspended` itself coming back.
        let bare = String(source[assignRange.lowerBound..<end])
            .replacingOccurrences(of: "isVideoSuspendedByCaptureInterruption", with: "")
            .replacingOccurrences(of: "isVideoSuspendedByHold", with: "")
        XCTAssertFalse(
            bare.contains("isVideoSuspended"),
            "The socket-reconnect resync must not read isVideoSuspended: re-emitting " +
            "media-toggled(video,false) on reconnect makes the peer drop the last frame for a camera " +
            "that never went away."
        )
    }

    /// Counterpart to the two negative guards above: the THREE legitimate
    /// emitters must survive the lot. Removing the survival emission is a
    /// narrowing, not a silencing — a peer whose camera really stops must still
    /// be told.
    func test_theThreeLegitimateEmittersAreUntouched() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: target)"),
            "The camera BUTTON must still announce the user's intent to the peer."
        )
        XCTAssertTrue(
            source.contains("MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: !suspended)"),
            "The capture-interruption funnel (applyCameraSuspension) must still announce a real stop."
        )
        XCTAssertTrue(
            source.contains("MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: true)"),
            "CallKit unhold must still restore the peer's view of our camera."
        )
    }
}
