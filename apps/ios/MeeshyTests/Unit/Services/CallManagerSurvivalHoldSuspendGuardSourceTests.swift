//
//  CallManagerSurvivalHoldSuspendGuardSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `applySurvivalVideoSend(enabled:)` — the
//  actuator `VideoSurvivalController` drives on every quality-degradation
//  suspend/resume — guarded its `resume` direction against firing while an
//  OS-level suspension (`isVideoSuspendedByHold` /
//  `isVideoSuspendedByCaptureInterruption`) is active, but NOT its `suspend`
//  direction (`if enabled && (...)`). `handleHold(true)` already downgrades
//  video directly on hold entry — it never touches `videoSurvivalController`.
//  The quality-monitor Task keeps ticking during a hold (nothing pauses it),
//  so if the link reads poor/critical for `suspendAfter` (6s) WHILE held, the
//  survival controller independently calls `suspendOutboundVideo()` →
//  `applySurvivalVideoSend(enabled: false)` — which the old guard let through
//  — setting `isVideoSuspended = true` for a reason that has nothing to do
//  with the hold. `handleHold(false)`'s restore branch is gated on
//  `isVideoEnabled && !isVideoSuspended && !isVideoSuspendedByCaptureInterruption`:
//  with that flag now (wrongly) true, unhold skips re-acquiring the camera
//  entirely, and video only comes back once the survival controller's own
//  independent recovery timer fires — up to `resumeAfter` (10s) of SUSTAINED
//  good quality measured AFTER unhold, even though nothing was actually wrong
//  with the camera or the (already-recovered) link. Not exercised
//  behaviorally (needs a real WebRTC/RTCAudioSession stack + quality-monitor
//  ticks), so this guards the fix at the source level — same convention as
//  CallManagerHandleHoldSurvivalResetSourceTests /
//  CallManagerToggleVideoSurvivalResetSourceTests.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerSurvivalHoldSuspendGuardSourceTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Bounds the pre-flight guard in `applySurvivalVideoSend(enabled:)`,
    /// between the `.reconnecting` guard right above it (unique anchor — the
    /// only other early-return in the function) and the `let previousToggle`
    /// that starts building the serialized Task right after — semantically,
    /// not by a character count (Vague 167's lesson).
    func test_applySurvivalVideoSend_preflightGuard_blocksSuspendAndResumeDuringHoldOrInterruption() throws {
        let source = try callManagerSource()
        guard let reconnectingRange = source.range(
            of: "if case .reconnecting = callState { return false }"
        ) else {
            XCTFail("Expected the .reconnecting pre-flight guard in applySurvivalVideoSend — file structure changed"); return
        }
        guard let endRange = source.range(
            of: "let previousToggle = videoToggleTask",
            range: reconnectingRange.upperBound..<source.endIndex
        ) else {
            XCTFail("Could not bound the pre-flight guard block"); return
        }
        let block = String(source[reconnectingRange.lowerBound..<endRange.lowerBound])

        XCTAssertTrue(
            block.contains("isVideoSuspendedByHold"),
            "Sanity check: this must be applySurvivalVideoSend's OS-suspension guard."
        )
        XCTAssertFalse(
            block.contains("if enabled && (isVideoSuspendedByHold || isVideoSuspendedByCaptureInterruption)"),
            "The pre-flight guard must not restrict the OS-suspension check to the resume direction " +
            "(`enabled &&`) — a network-quality SUSPEND firing while on a CallKit hold or capture " +
            "interruption is just as unsafe as a resume: it sets `isVideoSuspended = true` for a reason " +
            "unrelated to the hold/interruption, and handleHold(false)'s restore guard then wrongly " +
            "trusts that flag as \"the link is still genuinely degraded\", skipping camera re-acquisition " +
            "on unhold."
        )
        XCTAssertTrue(
            block.contains("if isVideoSuspendedByHold || isVideoSuspendedByCaptureInterruption { return false }"),
            "The pre-flight guard must block BOTH suspend and resume — no `enabled &&` prefix — whenever " +
            "an OS-level suspension (CallKit hold or capture interruption) is active."
        )
    }

    /// Bounds the in-Task re-validation guard — same check, re-applied after
    /// awaiting every other in-flight video-transition Task, because state
    /// may have changed (e.g. a hold started) while this transition was
    /// queued. Anchored on the unique `self.currentCallId == callId` guard
    /// right above it, through the `actuateSurvivalVideoSend` call that ends
    /// the Task body.
    func test_applySurvivalVideoSend_taskRevalidationGuard_blocksSuspendAndResumeDuringHoldOrInterruption() throws {
        let source = try callManagerSource()
        guard let revalidateRange = source.range(
            of: "guard self.isVideoEnabled, self.currentCallId == callId else { return false }"
        ) else {
            XCTFail("Expected the in-Task re-validation guard in applySurvivalVideoSend — file structure changed"); return
        }
        guard let endRange = source.range(
            of: "return await self.actuateSurvivalVideoSend(enabled: enabled, callId: callId)",
            range: revalidateRange.upperBound..<source.endIndex
        ) else {
            XCTFail("Could not bound the in-Task re-validation guard block"); return
        }
        let block = String(source[revalidateRange.lowerBound..<endRange.lowerBound])

        XCTAssertFalse(
            block.contains("if enabled && (self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption)"),
            "The in-Task re-validation guard must not restrict the OS-suspension check to the resume " +
            "direction either — it re-applies the exact same pre-flight guard after the serialization " +
            "await, and must stay symmetric with it."
        )
        XCTAssertTrue(
            block.contains("if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption { return false }"),
            "The in-Task re-validation guard must block BOTH suspend and resume — no `enabled &&` prefix."
        )
    }
}
