import XCTest
@testable import Meeshy

/// Source-analysis guards for the "in-app capture appears in Recent Media"
/// fix (2026-07-09). Before this fix, a photo/video taken via the in-app
/// camera never reached `RecentMediaStripModel.assets` at all — it only ever
/// existed as a local temp file staged into the composer's attachment tray.
/// The fix saves the capture into the user's Photos library on a best-effort
/// basis; `RecentMediaStripModel`'s own `PHPhotoLibraryChangeObserver` then
/// re-fetches and the new item appears at the front via the SAME
/// `creationDate`-sorted query as everything else — no manual array index is
/// ever touched by this code path, which is what actually prevents the
/// index-mismatch bug class the fix was asked to guard against (a hand-rolled
/// `assets.insert(at: 0)` racing a concurrent PHFetchResult refresh).
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

    func test_photoCapture_savesToPhotoLibrary() throws {
        let source = try cameraViewSource()
        let fn = try body(
            from: "func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto",
            to: "// MARK: - Video Delegate",
            in: source
        )
        XCTAssertTrue(
            fn.contains("Self.saveToPhotoLibrary { PHAssetChangeRequest.creationRequestForAsset(from: image) }"),
            "A successfully captured photo must be saved to the photo library " +
            "so it appears in RecentMediaStripModel's grid via the library's " +
            "own change-observer refetch — not via any hand-rolled array insert."
        )
    }

    func test_videoFinalStop_savesMergedResultToPhotoLibrary() throws {
        let source = try cameraViewSource()
        let fn = try body(
            from: "// Final stop.",
            to: "/// Best-effort save of an in-app capture",
            in: source
        )
        XCTAssertTrue(
            fn.contains("Self.saveToPhotoLibrary { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: finalURL) }"),
            "The finished recording (merged across any camera switches) must be " +
            "saved to the photo library exactly like the fail-soft last-segment " +
            "fallback above it."
        )
        XCTAssertTrue(
            fn.contains("Self.saveToPhotoLibrary { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: lastSegment) }"),
            "The fail-soft path (merge failed, falls back to the last recorded " +
            "segment) must ALSO save that segment — a merge failure must not " +
            "silently skip the recent-media save too."
        )
    }

    func test_saveToPhotoLibrary_neverBlocksOnDeniedOrRestrictedPermission() throws {
        let source = try cameraViewSource()
        let fn = try body(
            from: "private static func saveToPhotoLibrary(",
            to: "/// Concatenates ordered video segments",
            in: source
        )
        XCTAssertTrue(
            fn.contains("case .denied, .restricted:") && fn.contains("break"),
            "saveToPhotoLibrary must silently no-op when the app lacks add " +
            "permission — this is a best-effort side effect of capturing " +
            "media, never a gate on the capture flow itself (capturedPhotoId/ " +
            "capturedVideoId must always fire regardless of Photos permission)."
        )
    }
}
