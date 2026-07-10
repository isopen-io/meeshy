import XCTest
@testable import Meeshy

/// Source-analysis guards for the in-app capture -> Photos-library save path.
///
/// Two things this path must get right:
///  1. A photo/video taken via the in-app camera is saved into the user's
///     Photos library on a best-effort basis, so `RecentMediaStripModel`'s own
///     `PHPhotoLibraryChangeObserver` re-fetches and the new item appears at the
///     front via the SAME `creationDate`-sorted query as everything else — no
///     manual array index is ever touched.
///  2. The save runs through `PhotoLibraryManager` (a deliberately NON-@MainActor
///     Sendable service), NOT an inline `PHPhotoLibrary.performChanges` block.
///     CameraModel is `@MainActor`, so a `performChanges` change-block written
///     inline was implicitly MainActor-isolated; Photos invokes that block on its
///     own background queue, which trips the Swift 6 executor-isolation assertion
///     (`swift_task_isCurrentExecutorImpl` -> `dispatch_assert_queue_fail`,
///     EXC_BREAKPOINT) — the "app crashes when I film a video and validate" bug
///     (2026-07-10). Delegating to the non-isolated `PhotoLibraryManager` removes
///     the trap. These guards pin that delegation and forbid reintroducing an
///     inline Photos call in this `@MainActor` type.
final class CameraModelPhotoLibrarySaveTests: XCTestCase {

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

    func test_photoCapture_savesViaPhotoLibraryManager() throws {
        let source = try cameraViewSource()
        let fn = try body(
            from: "func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto",
            to: "// MARK: - Video Delegate",
            in: source
        )
        XCTAssertTrue(
            fn.contains("PhotoLibraryManager.shared.saveImage(data)"),
            "A successfully captured photo must be saved to the photo library via " +
            "the non-@MainActor PhotoLibraryManager (passing the ORIGINAL encoded " +
            "bytes), so it appears in RecentMediaStripModel's grid via the " +
            "library's own change-observer refetch — never an inline @MainActor " +
            "performChanges block (which traps off-main)."
        )
    }

    func test_videoFinalStop_savesMergedResultViaPhotoLibraryManager() throws {
        let source = try cameraViewSource()
        let fn = try body(
            from: "// Final stop.",
            to: "/// Concatenates ordered video segments",
            in: source
        )
        XCTAssertTrue(
            fn.contains("PhotoLibraryManager.shared.saveVideo(at: finalURL)"),
            "The finished recording (merged across any camera switches) must be " +
            "saved to the photo library via PhotoLibraryManager exactly like the " +
            "fail-soft last-segment fallback above it."
        )
        XCTAssertTrue(
            fn.contains("PhotoLibraryManager.shared.saveVideo(at: lastSegment)"),
            "The fail-soft path (merge failed, falls back to the last recorded " +
            "segment) must ALSO save that segment via PhotoLibraryManager — a " +
            "merge failure must not silently skip the recent-media save too."
        )
    }

    /// Regression guard for the film-and-validate crash: CameraModel is
    /// `@MainActor`, so it must NEVER call Photos' `performChanges` (or build a
    /// `PHAssetChangeRequest`) inline — that change-block would be MainActor-
    /// isolated yet invoked off-main by Photos, trapping (EXC_BREAKPOINT). All
    /// library writes go through the non-isolated `PhotoLibraryManager`.
    func test_cameraView_neverCallsPhotosInlineFromMainActor() throws {
        let source = try cameraViewSource()
        XCTAssertFalse(
            source.contains(".performChanges("),
            "CameraView (a @MainActor type) must not invoke PHPhotoLibrary." +
            "performChanges inline — the change-block runs off-main and traps. " +
            "Delegate to the non-@MainActor PhotoLibraryManager instead."
        )
        XCTAssertFalse(
            source.contains("PHAssetChangeRequest"),
            "CameraView must not construct PHAssetChangeRequest inline — Photos " +
            "library writes belong to PhotoLibraryManager."
        )
    }
}
