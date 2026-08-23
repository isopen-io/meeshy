//
//  CallManagerHandleHoldSurvivalResetSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `handleHold(_:)`'s unhold path retries video
//  recovery (`webRTCService.upgradeToVideo()`) and, on failure, disables video
//  (`isVideoEnabled = false`). Its `catch WebRTCError.cameraPermissionDenied`
//  branch also calls `videoSurvivalController.reset()` — documented ("Audit
//  finding") as required because `isVideoEnabled = false` alone only clears
//  survival state on the controller's NEXT quality-sample tick, and `handle()`
//  no-ops entirely while a suspend/resume transition is already in flight
//  (`guard !isTransitioning else { return }`, VideoSurvivalController.swift) —
//  leaving a stale `isVideoSuspended`/`isTransitioning` behind a hold-time
//  failure that just fully disabled video. The sibling generic `catch {}`
//  right below it (any OTHER `upgradeToVideo()` failure — not just permission
//  denial) discarded the same class of error without the same reset, an
//  inconsistency the two branches have no reason to disagree on: both set
//  `isVideoEnabled = false` for the rest of the call. Not exercised
//  behaviorally (needs a real WebRTC/RTCAudioSession stack), so this guards
//  the fix at the source level — same convention as
//  CallManagerAudioRouteChangeFailureCorrectionSourceTests /
//  CallManagerToggleSpeakerFailureCorrectionSourceTests.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerHandleHoldSurvivalResetSourceTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Bounded by the unique log message this branch emits, up to the next
    /// statement OUTSIDE the do/catch (the trailing `emitCallToggleVideo(...,
    /// enabled: true)` that follows the whole hold-video Task) — semantically,
    /// not by a character count (Vague 167's lesson: a fixed-width window rots
    /// on any unrelated comment/line added above it).
    func test_handleHold_unhold_genericCatch_resetsVideoSurvivalController() throws {
        let source = try callManagerSource()
        let logMarker = "Logger.calls.error(\"unhold video recovery failed: \\(error.localizedDescription)\")"
        guard let logRange = source.range(of: logMarker) else {
            XCTFail("Generic-catch log message not found in handleHold — file structure changed"); return
        }
        guard let endRange = source.range(
            of: "MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: true)",
            range: logRange.upperBound..<source.endIndex
        ) else {
            XCTFail("Could not bound the generic-catch block"); return
        }
        let block = String(source[logRange.lowerBound..<endRange.lowerBound])

        XCTAssertTrue(
            block.contains("self.isVideoEnabled = false"),
            "Sanity check: this must be handleHold's generic catch branch, which disables video."
        )
        XCTAssertTrue(
            block.contains("self.videoSurvivalController.reset()"),
            "handleHold's generic catch (any upgradeToVideo() failure besides camera-permission-denied) " +
            "must reset the survival controller, exactly like its cameraPermissionDenied sibling above " +
            "it — both disable video for the rest of the call, and skipping the reset can leave a stale " +
            "isVideoSuspended/isTransitioning behind if a suspend/resume transition happened to be in " +
            "flight when this failure occurred."
        )
    }
}
