//
//  CallManagerToggleVideoSurvivalResetSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard (Vague 169): `toggleVideo()` has three
//  distinct branches that disable video (`isVideoEnabled = false`) — the
//  camera pre-flight check (permission already refused before any WebRTC
//  work starts), the `catch WebRTCError.cameraPermissionDenied` branch, and
//  the generic `catch {}` branch (any other `upgradeToVideo()` /
//  `downgradeFromVideo()` failure). `toggleVideo()`'s own SUCCESS path resets
//  `videoSurvivalController` right after flipping the media state, with the
//  documented reason: "User intent is authoritative: forget any survival
//  state so the controller never fights a manual toggle." That reasoning
//  applies identically when the toggle FAILS and disables video — yet none
//  of the three failure branches called the reset, while the analogous
//  failure branch in `handleHold`'s unhold path (Vague 167/168) does.
//  (`actuateSurvivalVideoSend` was a third such site until L6-1 turned it
//  into a pure encoder-floor call, which has no failure branch left to
//  reset from.) Left unset, `isVideoEnabled = false`
//  alone only clears survival state on the controller's NEXT quality-sample
//  tick, and `VideoSurvivalController.handle()` no-ops entirely while a
//  suspend/resume transition is already in flight (`guard !isTransitioning
//  else { return }`) — exactly the stale-state window the twin branches
//  already guard against. Not exercised behaviorally (needs a real
//  WebRTC/RTCAudioSession stack), so this guards the fix at the source
//  level — same convention as
//  CallManagerHandleHoldSurvivalResetSourceTests /
//  CallManagerAudioRouteChangeFailureCorrectionSourceTests.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerToggleVideoSurvivalResetSourceTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Bounded from the `ensureCamera` pre-flight check up to the `do {` that
    /// starts the WebRTC upgrade/downgrade attempt right after it — semantically,
    /// not by a character count (Vague 167's lesson).
    func test_toggleVideo_permissionPreflightFailure_resetsVideoSurvivalController() throws {
        let source = try callManagerSource()
        let startMarker = "await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false) == false {"
        guard let startRange = source.range(of: startMarker) else {
            XCTFail("Camera permission pre-flight check not found in toggleVideo — file structure changed"); return
        }
        guard let endRange = source.range(
            of: "let needsRenegotiation: Bool",
            range: startRange.upperBound..<source.endIndex
        ) else {
            XCTFail("Could not bound the permission pre-flight block"); return
        }
        let block = String(source[startRange.lowerBound..<endRange.lowerBound])

        XCTAssertTrue(
            block.contains("self.isVideoEnabled = false"),
            "Sanity check: this must be toggleVideo's permission pre-flight branch, which disables video."
        )
        XCTAssertTrue(
            block.contains("self.videoSurvivalController.reset()"),
            "toggleVideo's permission pre-flight failure (camera already refused) must reset the survival " +
            "controller, exactly like the success path just below it and the sibling failure branches — " +
            "skipping it can leave a stale isVideoSuspended/isTransitioning behind if a suspend/resume " +
            "transition happened to be in flight when the user's toggle was refused."
        )
    }

    /// Bounded by the unique log message of this branch, up to the next `catch {`.
    func test_toggleVideo_cameraPermissionDeniedCatch_resetsVideoSurvivalController() throws {
        let source = try callManagerSource()
        let logMarker = "Logger.calls.error(\"toggleVideo failed: camera permission denied — prompting settings redirect\")"
        guard let logRange = source.range(of: logMarker) else {
            XCTFail("cameraPermissionDenied-catch log message not found in toggleVideo — file structure changed"); return
        }
        guard let endRange = source.range(of: "} catch {", range: logRange.upperBound..<source.endIndex) else {
            XCTFail("Could not bound the cameraPermissionDenied catch block"); return
        }
        let block = String(source[logRange.lowerBound..<endRange.lowerBound])

        XCTAssertTrue(
            block.contains("self.isVideoEnabled = false"),
            "Sanity check: this must be toggleVideo's cameraPermissionDenied catch branch, which disables video."
        )
        XCTAssertTrue(
            block.contains("self.videoSurvivalController.reset()"),
            "toggleVideo's cameraPermissionDenied catch must reset the survival controller, exactly like " +
            "its handleHold twin (Vague 167) and this same function's success path — both disable video " +
            "for the rest of the call."
        )
    }

    /// Bounded by the unique log message of this branch, up to `switchCamera()`,
    /// the next function declared in the file after toggleVideo() closes.
    func test_toggleVideo_genericCatch_resetsVideoSurvivalController() throws {
        let source = try callManagerSource()
        let logMarker = "Logger.calls.error(\"toggleVideo failed: \\(error.localizedDescription)\")"
        guard let logRange = source.range(of: logMarker) else {
            XCTFail("Generic-catch log message not found in toggleVideo — file structure changed"); return
        }
        guard let endRange = source.range(of: "func switchCamera()", range: logRange.upperBound..<source.endIndex) else {
            XCTFail("Could not bound the generic catch block"); return
        }
        let block = String(source[logRange.lowerBound..<endRange.lowerBound])

        XCTAssertTrue(
            block.contains("self.isVideoEnabled = false"),
            "Sanity check: this must be toggleVideo's generic catch branch, which disables video."
        )
        XCTAssertTrue(
            block.contains("self.videoSurvivalController.reset()"),
            "toggleVideo's generic catch (any upgradeToVideo()/downgradeFromVideo() failure besides " +
            "camera-permission-denied) must reset the survival controller, exactly like its " +
            "cameraPermissionDenied sibling just above it — both disable video for the rest of the call."
        )
    }
}
