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
/// and reopens a new segment. These guards pin the state-machine wiring
/// (and, further down, `mergeSegments`'s own structure) that can't be
/// exercised without camera hardware — see `CameraModelSegmentMergeTests`
/// for why the merge/export pipeline itself is pinned here rather than via
/// synthetic media.
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

    // MARK: - mergeSegments structure (see CameraModelSegmentMergeTests for why
    // this is pinned structurally rather than via synthetic AVFoundation media)

    private func mergeSegmentsBody() throws -> String {
        let source = try cameraViewSource()
        return try body(from: "nonisolated static func mergeSegments(_ urls: [URL]) async -> URL? {", to: "\n}", in: source)
    }

    func test_mergeSegments_skipsUnreadableSegmentsInsteadOfFailingEntirely() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("guard let duration = try? await asset.load(.duration), duration.isValid, duration > .zero else { continue }"),
            "A segment whose duration can't be loaded (e.g. a URL that no " +
            "longer resolves to a real file) must be skipped with `continue`, " +
            "not abort the whole merge — the surviving segments still deserve " +
            "a best-effort stitched result."
        )
    }

    func test_mergeSegments_accumulatesDurationAcrossSegments() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("cursor = cursor + duration"),
            "Each segment must be inserted at the running `cursor` and advance " +
            "it by its own duration — concatenating segments back-to-back, not " +
            "overlapping them at time zero."
        )
        XCTAssertTrue(
            fn.contains("guard cursor > .zero"),
            "If every segment was unreadable (cursor never advanced), the " +
            "export must be skipped rather than exporting an empty composition."
        )
    }

    func test_mergeSegments_exportsToMovViaHighestQualityPreset() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)"),
            "The stitched composition must export via AVAssetExportSession at " +
            "the highest-quality preset — this is a user-facing recording, not " +
            "a thumbnail/preview render."
        )
        XCTAssertTrue(
            fn.contains("exportSession.outputFileType = .mov"),
            "Output must stay .mov, matching every segment's own format " +
            "(startSegment() records to .mov temp files)."
        )
        XCTAssertTrue(
            fn.contains("exportSession.status == .completed ? outputURL : nil"),
            "mergeSegments must only return the output URL when the export " +
            "genuinely reports .completed — a failed/cancelled export must " +
            "surface as nil so callers fail soft to the last segment instead " +
            "of handing off a broken/partial file."
        )
    }
}
