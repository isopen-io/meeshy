//
//  CallManagerSwitchCameraFailureCorrectionSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `CallManager.switchCamera()` optimistically
//  flips `isUsingFrontCamera` (drives self-preview mirroring) before the
//  underlying async camera switch resolves. A failed switch (hardware busy,
//  a single-camera device, an AVCaptureSession configuration error) must not
//  leave that flag permanently desynced from the camera actually in use —
//  the self-preview would mirror the wrong way for the rest of the call with
//  no correction path. `WebRTCService.switchCamera(completion:)` reports the
//  outcome; `CallManager` must revert on failure. Not exercised behaviorally
//  (RTCCameraVideoCapturer needs real hardware), so this guards the fix at
//  the source level — same pattern as P2PWebRTCClientConcurrencySourceTests.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerSwitchCameraFailureCorrectionSourceTests: XCTestCase {

    private func source(for filename: String, file: StaticString = #filePath, line: UInt = #line) -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/\(filename)")
        guard let contents = try? String(contentsOf: url, encoding: .utf8) else {
            XCTFail("Could not read \(filename)", file: file, line: line)
            return ""
        }
        return contents
    }

    private func body(_ source: String, from startMarker: String, to endMarker: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Start marker not found — file structure changed: \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex) else {
            XCTFail("End marker not found — file structure changed: \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_callManager_switchCamera_revertsMirroringFlagOnFailure() {
        guard let fn = body(
            source(for: "CallManager.swift"),
            from: "func switchCamera() {",
            to: "func refreshAvailableCameras()"
        ) else { return }
        XCTAssertTrue(
            fn.contains("let previousFrontCamera = isUsingFrontCamera"),
            "switchCamera must capture the pre-toggle mirroring state before flipping it optimistically."
        )
        XCTAssertTrue(
            fn.contains("self.isUsingFrontCamera = previousFrontCamera"),
            "switchCamera must revert isUsingFrontCamera when the underlying camera switch fails — " +
            "otherwise the self-preview mirrors the wrong way for the rest of the call with no correction path."
        )
    }

    func test_webRTCService_switchCamera_reportsOutcomeToCaller() {
        guard let fn = body(
            source(for: "WebRTCService.swift"),
            from: "func switchCamera(completion: ((Bool) -> Void)? = nil) {",
            to: "func availableCameras()"
        ) else { return }
        XCTAssertTrue(
            fn.contains("completion?(true)"),
            "switchCamera must report success to its completion so callers can trust the mirroring flag."
        )
        XCTAssertTrue(
            fn.contains("completion?(false)"),
            "switchCamera must report failure to its completion so callers can revert optimistic UI state."
        )
    }
}
