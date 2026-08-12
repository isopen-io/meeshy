//
//  P2PWebRTCClientSwitchCameraFailureRevertSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `P2PWebRTCClient.switchCamera()` optimistically
//  toggles the private `usingFrontCamera` flag before attempting the underlying
//  stop→start capture cycle. The two early guard-throws (no camera / no format)
//  already revert the toggle before rethrowing, but `capturer.startCapture` — the
//  call most likely to actually fail on real hardware (camera busy, single-camera
//  device, AVCaptureSession configuration error) — did not: a failure there left
//  `usingFrontCamera` claiming the switch succeeded while the capturer sat stopped,
//  capturing nothing.
//
//  `restartCapturerIfStopped()` reads `usingFrontCamera` to decide which physical
//  camera to resume on the next capture restart (e.g. after the app backgrounds
//  and foregrounds mid-call) — a stale value there would target the camera that
//  just failed to start instead of the one the user was actually seeing before the
//  attempt. `CallManager` already reverts its own optimistic `isUsingFrontCamera`
//  mirroring flag on this same failure (see
//  CallManagerSwitchCameraFailureCorrectionSourceTests); this guard keeps the
//  internal capture-restart target in sync with that correction. Not exercised
//  behaviorally (RTCCameraVideoCapturer needs real hardware/capture session), so
//  this guards the fix at the source level — same pattern as
//  P2PWebRTCClientConcurrencySourceTests.
//

import XCTest
@testable import Meeshy

@MainActor
final class P2PWebRTCClientSwitchCameraFailureRevertSourceTests: XCTestCase {

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
    /// an assertion pass for the wrong reason.
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

    func test_switchCamera_revertsUsingFrontCameraWhenStartCaptureThrows() {
        guard let fn = body(from: "func switchCamera() async throws {", to: "func availableCameras()") else { return }
        XCTAssertTrue(
            fn.contains("try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)"),
            "startCapture call site moved — update the marker"
        )
        // The startCapture call must be wrapped so a throw runs a revert before
        // propagating — a bare `try await capturer.startCapture(...)` at the top
        // level of the function (no enclosing `do`) would exit without reverting.
        XCTAssertTrue(
            fn.contains("do {\n            try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)\n        } catch {"),
            "startCapture must be wrapped in a do/catch so a failure can revert usingFrontCamera before rethrowing."
        )
        XCTAssertTrue(
            fn.contains("usingFrontCamera.toggle()\n            throw error"),
            "switchCamera must revert usingFrontCamera and rethrow when startCapture fails — otherwise " +
            "restartCapturerIfStopped() later resumes the camera that just failed instead of the one " +
            "the user was actually seeing before this attempt."
        )
    }

    func test_switchCamera_guardThrowsStillRevertBeforeStartCapture() {
        // Regression guard for the two pre-existing reverts (no camera / no format),
        // to make sure this fix didn't accidentally get folded into — or replace —
        // them instead of adding a third, independent revert for the startCapture path.
        guard let fn = body(from: "func switchCamera() async throws {", to: "func availableCameras()") else { return }
        let toggleCount = fn.components(separatedBy: "usingFrontCamera.toggle()").count - 1
        XCTAssertEqual(
            toggleCount, 4,
            "expected 4 usingFrontCamera.toggle() call sites in switchCamera: the 1 optimistic " +
            "flip at entry + 3 reverts (no-camera guard, no-format guard, startCapture failure) — " +
            "found \(toggleCount). If this count changed intentionally, update this guard."
        )
    }
}
