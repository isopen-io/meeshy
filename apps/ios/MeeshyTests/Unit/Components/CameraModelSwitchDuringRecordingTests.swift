import XCTest
@testable import Meeshy

/// Source-analysis guards for the camera-switch-mid-recording fix (2026-07-09).
///
/// Bug: `switchCamera()` used to unconditionally remove/re-add the video input
/// inside a single `beginConfiguration()/commitConfiguration()` transaction,
/// with no check on `isRecordingVideo`. `AVCaptureMovieFileOutput`'s active
/// recording connection breaks when its video input is removed — even
/// transiently — which silently ended the recording early
/// (`didFinishRecordingTo` fires, `CameraView.onReceive($capturedVideoId)`
/// immediately dismisses the whole camera screen with a truncated clip). The
/// fix closes the current segment cleanly, swaps cameras once truly stopped,
/// and reopens a new segment — verified end-to-end for the merge itself in
/// `CameraModelSegmentMergeTests` (real AVFoundation, no camera needed); these
/// guards pin the state-machine wiring that can't be exercised without camera
/// hardware.
final class CameraModelSwitchDuringRecordingTests: XCTestCase {

    private func cameraViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/CameraView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(from startMarker: String, to endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marker not found: \(startMarker)"); throw XCTSkip()
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_switchCamera_whileRecording_doesNotReconfigureInputInPlace() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func switchCamera() {", to: "private func performCameraSwitch", in: source)

        XCTAssertTrue(
            fn.contains("if isRecordingVideo"),
            "switchCamera() must branch on isRecordingVideo — reconfiguring the " +
            "video input in place while AVCaptureMovieFileOutput is recording " +
            "breaks its active connection and silently ends the recording."
        )
        XCTAssertTrue(
            fn.contains("videoOutput.stopRecording()"),
            "The recording branch must cleanly stop the current segment before " +
            "any input swap, instead of removing the input while still recording."
        )
        XCTAssertFalse(
            fn.contains("session.beginConfiguration()"),
            "switchCamera() must not touch the session directly while recording — " +
            "the swap only happens after the segment finishes, in performCameraSwitch."
        )
    }

    func test_switchCamera_guardsReentrancyWhileAlreadySwitching() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func switchCamera() {", to: "private func performCameraSwitch", in: source)
        XCTAssertTrue(
            fn.contains("guard !isSwitchingCameraDuringRecording else { return }"),
            "switchCamera() must no-op while a previous switch is still settling — " +
            "otherwise a rapid double-tap could start a second stopRecording() " +
            "before the first segment has finished closing."
        )
    }

    func test_stopRecording_queuesRequestWhenCalledMidSwitch() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func stopRecording() {", to: "func stop() {", in: source)
        XCTAssertTrue(
            fn.contains("pendingStopRequested = true"),
            "stopRecording() called while a camera switch is mid-flight must " +
            "queue the stop instead of calling videoOutput.stopRecording() " +
            "directly — the movie output has no active recording at that instant " +
            "(the segment just closed), so an immediate second stop is a no-op " +
            "that silently drops the user's tap."
        )
    }

    func test_startRecording_resetsSwitchStateForANewSession() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func startRecording() {", to: "private func startSegment()", in: source)
        for expected in ["recordedSegmentURLs = []", "isSwitchingCameraDuringRecording = false", "pendingStopRequested = false"] {
            XCTAssertTrue(
                fn.contains(expected),
                "startRecording() must reset \(expected) — stale state from a " +
                "previous recording session must never leak into a new one."
            )
        }
    }

    func test_handleSegmentFinished_onlyMergesWhenMoreThanOneSegment() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "private func handleSegmentFinished", to: "nonisolated static func mergeSegments", in: source)
        XCTAssertTrue(
            fn.contains("segments.count > 1 ? await Self.mergeSegments(segments) : segments.first"),
            "The fast path (no camera switch occurred, exactly one segment) must " +
            "skip the composition/export round-trip entirely and use the raw " +
            "recording file directly — re-encoding a single untouched segment " +
            "would be a pointless quality/CPU cost."
        )
    }

    func test_handleSegmentFinished_midSwitch_neverTogglesIsRecordingVideoFalse() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "private func handleSegmentFinished", to: "nonisolated static func mergeSegments", in: source)
        guard let switchBranchStart = fn.range(of: "if isSwitchingCameraDuringRecording {") else {
            XCTFail("Could not locate the mid-switch branch in handleSegmentFinished"); return
        }
        let switchBranchEnd = fn.range(of: "\n        }\n\n        // Final stop.", range: switchBranchStart.upperBound..<fn.endIndex)?.lowerBound ?? fn.endIndex
        let switchBranch = String(fn[switchBranchStart.lowerBound..<switchBranchEnd])
        XCTAssertFalse(
            switchBranch.contains("isRecordingVideo = false"),
            "The mid-switch branch must never set isRecordingVideo = false — " +
            "doing so would flash the 'not recording' UI state during a segment " +
            "restart the user never asked to pause."
        )
    }
}
