import XCTest
@testable import Meeshy

/// Calling-stack audit (2026-08-22) — `reportIncomingVoIPCall` had no
/// "same call already ringing" guard, unlike the socket path.
///
/// The socket path (`MessageSocketManager`'s `call:offer` handling, funneled
/// through `handleIncomingCallNotification`) and the VoIP-push path
/// (`reportIncomingVoIPCall`) can both deliver the SAME callId for the SAME
/// call — e.g. `call:offer` arrives first while the app is foreground
/// (`callState = .ringing`, `currentCallId = X`), and the VoIP push for X
/// lands moments later. `reportIncomingVoIPCall` gated only on
/// `callState == .idle`, so that push fell into the BUSY branch for a call
/// the user is currently being rung for:
///
/// 1. it reports a second, phantom `CXCallUpdate`/UUID and immediately
///    retires it as `.unanswered` — a bogus "Missed call" Recents entry for
///    a call still actively ringing;
/// 2. it sets `pendingIncomingCall` + `showCallWaitingBanner = true` — the
///    call-waiting banner offers "Answer/Reject" for the exact same call
///    the full-screen `IncomingCallView` is already showing, and tapping
///    "End & Answer" emits `call:reject` for the call the user is trying
///    to answer.
///
/// The fix mirrors the guard the socket path already has
/// (`guard self.currentCallId != event.callId else { return }`): when the
/// incoming push's callId matches the call already active, phantom-ack the
/// CallKit report (PushKit still requires one) without touching call state,
/// `pendingIncomingCall`, or the banner.
final class CallManagerDuplicateIncomingCallGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_reportIncomingVoIPCall_guardsAgainstSameCallIdAlreadyActive_beforeBusyPath() throws {
        let source = try callManagerSource()
        guard let body = DeclarationBodyScanner.body(
            containing: "func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil)",
            in: source
        ) else {
            XCTFail("reportIncomingVoIPCall not found"); return
        }

        guard let sameCallGuardRange = body.range(of: "currentCallId == callId") else {
            XCTFail(
                "reportIncomingVoIPCall must guard on `currentCallId == callId` before the busy-path " +
                "branch — a VoIP push for a callId already ringing/active via the socket path must be " +
                "phantom-acked, not treated as a second, distinct call."
            )
            return
        }

        guard let busyGuardRange = body.range(of: "guard callState == .idle else {") else {
            XCTFail("reportIncomingVoIPCall's busy-path guard not found"); return
        }

        XCTAssertTrue(
            sameCallGuardRange.lowerBound < busyGuardRange.lowerBound,
            "The same-callId guard must run BEFORE the busy-path `guard callState == .idle` — otherwise " +
            "a duplicate push for the call already ringing still falls into the busy branch and reports " +
            "a phantom second call / shows the call-waiting banner over the active ring."
        )

        let guardToBusy = String(body[sameCallGuardRange.lowerBound..<busyGuardRange.lowerBound])
        XCTAssertTrue(
            guardToBusy.contains("reportPhantomVoIPCall("),
            "The same-callId guard must phantom-ack the CallKit report via reportPhantomVoIPCall(uuid:update:callId:) " +
            "— PushKit still requires a report for every VoIP push, but no duplicate call UI should surface."
        )
        XCTAssertTrue(
            guardToBusy.contains("return"),
            "The same-callId guard must return immediately after phantom-acking, without falling through " +
            "to the busy-path banner or overwriting call state."
        )
    }

    /// Calling-stack audit (2026-08-25, L5-F2) — NEGATIVE source guard on the
    /// ORDER of the three session flags.
    ///
    /// `lastCallWasOutgoing = false`, `callUsesCallKit = true` and
    /// `ringbackPlayer.shouldSelfActivateSession = false` used to sit ABOVE
    /// `guard callState == .idle`, so a second VoIP push landing while a call
    /// was already up rewrote the flags of THAT call. A foreground in-app call
    /// legitimately runs with `callUsesCallKit == false` (answered while the
    /// app is active, and nothing re-promotes it): flipping it to `true` made
    /// every subsequent audio-session/hold decision of the live call read a
    /// CallKit ownership it never had.
    ///
    /// Each assertion below uses the FIRST occurrence of the flag in the body,
    /// so reintroducing the write above the guard — even while leaving the
    /// correct one in place below — makes this test fail again.
    ///
    /// `resetEndedStateForNewCall()` deliberately stays ABOVE the guard: it is
    /// what turns a residual `.ended` into `.idle` and therefore decides which
    /// branch is taken.
    func test_reportIncomingVoIPCall_busyPath_doesNotMutateActiveCallKitFlags() throws {
        let source = try callManagerSource()
        guard let body = DeclarationBodyScanner.body(
            containing: "func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil)",
            in: source
        ) else {
            XCTFail("reportIncomingVoIPCall not found"); return
        }

        guard let busyGuardRange = body.range(of: "guard callState == .idle else {") else {
            XCTFail("reportIncomingVoIPCall's busy-path guard not found"); return
        }

        for flag in ["lastCallWasOutgoing = false", "callUsesCallKit = true", "ringbackPlayer.shouldSelfActivateSession = false"] {
            guard let flagRange = body.range(of: flag) else {
                XCTFail("`\(flag)` not found in reportIncomingVoIPCall"); continue
            }
            XCTAssertTrue(
                busyGuardRange.lowerBound < flagRange.lowerBound,
                "`\(flag)` must be written BELOW `guard callState == .idle` — above it, a VoIP push " +
                "arriving while another call is in progress rewrites the session flags of THAT call."
            )
        }

        guard let resetRange = body.range(of: "resetEndedStateForNewCall()") else {
            XCTFail("resetEndedStateForNewCall() not found in reportIncomingVoIPCall"); return
        }
        XCTAssertTrue(
            resetRange.lowerBound < busyGuardRange.lowerBound,
            "resetEndedStateForNewCall() must stay ABOVE the busy-path guard — it converts a residual " +
            "`.ended` state into `.idle` and therefore selects the branch."
        )
    }
}
