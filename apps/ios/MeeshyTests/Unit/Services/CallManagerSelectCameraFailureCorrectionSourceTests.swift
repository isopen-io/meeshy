//
//  CallManagerSelectCameraFailureCorrectionSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `CallManager.selectCamera(id:)` (§7.1 — the
//  Continuity/external-camera picker) optimistically sets `selectedCameraId`
//  and `isUsingFrontCamera` before the underlying async camera switch
//  resolves. A failed switch (camera busy, no matching capture format) must
//  not leave that state permanently desynced from the camera actually in
//  use — the picker UI and self-preview mirroring would point at a camera
//  that never activated for the rest of the call, with no correction path.
//  `WebRTCService.switchToCamera(uniqueID:completion:)` already reports the
//  outcome; `CallManager` must revert on failure — same pattern already
//  fixed for `switchCamera()` (see CallManagerSwitchCameraFailureCorrectionSourceTests).
//  Not exercised behaviorally (RTCCameraVideoCapturer needs real hardware),
//  so this guards the fix at the source level.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerSelectCameraFailureCorrectionSourceTests: XCTestCase {

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

    func test_callManager_selectCamera_revertsOptimisticStateOnFailure() {
        guard let fn = body(
            source(for: "CallManager.swift"),
            from: "func selectCamera(id: String) {",
            to: "func toggleTranscription()"
        ) else { return }
        XCTAssertTrue(
            fn.contains("let previousSelectedCameraId = selectedCameraId"),
            "selectCamera must capture the pre-switch selectedCameraId before mutating it optimistically."
        )
        XCTAssertTrue(
            fn.contains("let previousFrontCamera = isUsingFrontCamera"),
            "selectCamera must capture the pre-switch mirroring state before mutating it optimistically."
        )
        XCTAssertTrue(
            fn.contains("self.selectedCameraId = previousSelectedCameraId"),
            "selectCamera must revert selectedCameraId when the underlying camera switch fails — " +
            "otherwise the camera picker points at a camera that never activated for the rest of the call."
        )
        XCTAssertTrue(
            fn.contains("self.isUsingFrontCamera = previousFrontCamera"),
            "selectCamera must revert isUsingFrontCamera when the underlying camera switch fails — " +
            "otherwise the self-preview mirrors the wrong way for the rest of the call with no correction path."
        )
        XCTAssertFalse(
            fn.contains("switchToCamera(uniqueID: id) { _ in"),
            "selectCamera must not discard switchToCamera's success/failure outcome."
        )
    }
}
