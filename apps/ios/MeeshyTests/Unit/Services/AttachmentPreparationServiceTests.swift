import XCTest
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// Contract tests for the unified attachment preparation pipeline.
/// The service is the single source of truth for converting raw user media
/// (camera capture, PhotosPicker, recorded audio) into a `PreparedAttachment`
/// across messages, posts and stories. These tests pin the value semantics
/// of the published state machine so the composer loading tile and the
/// downstream upload pipeline keep agreeing on what "ready" means.
@MainActor
final class AttachmentPreparationServiceTests: XCTestCase {

    // MARK: - Audio (synchronous path)

    func test_prepareAudio_returnsReadyImmediately_withDurationFloor() async {
        let service = AttachmentPreparationService()
        let url = URL(fileURLWithPath: "/tmp/clip.m4a")

        let prep = service.prepareAudio(url: url, durationMs: 200, accentColor: "9B59B6")

        XCTAssertEqual(prep.stage, .ready)
        XCTAssertNotNil(prep.prepared)
        XCTAssertEqual(prep.prepared?.attachment.duration, 500)  // clamped to floor
        XCTAssertEqual(prep.prepared?.attachment.mimeType, "audio/mp4")
        XCTAssertEqual(prep.prepared?.fileURL, url)
        XCTAssertNil(prep.prepared?.thumbHash)
    }

    func test_prepareAudio_awaitCompletion_returnsImmediately() async {
        let service = AttachmentPreparationService()
        let prep = service.prepareAudio(
            url: URL(fileURLWithPath: "/tmp/clip.m4a"),
            durationMs: 3000,
            accentColor: "9B59B6"
        )

        let result = await prep.awaitCompletion()

        guard case .success(let prepared) = result else {
            return XCTFail("Expected ready preparation")
        }
        XCTAssertEqual(prepared.attachment.duration, 3000)
    }

    // MARK: - Image (in-process pipeline)

    func test_prepareImage_endToEnd_producesThumbHashAndAttachment() async {
        let service = AttachmentPreparationService()
        let image = Self.makeTestImage(size: CGSize(width: 64, height: 64))

        let prep = service.prepareImage(image, context: .message, accentColor: "4ECDC4")
        let result = await prep.awaitCompletion()

        guard case .success(let prepared) = result else {
            return XCTFail("Expected successful preparation")
        }
        XCTAssertEqual(prep.stage, .ready)
        XCTAssertEqual(prepared.attachment.id, prep.id)
        XCTAssertEqual(prepared.attachment.thumbnailColor, "4ECDC4")
        XCTAssertTrue(prepared.attachment.mimeType.hasPrefix("image/"))
        XCTAssertNotNil(prepared.thumbHash)
        XCTAssertEqual(prep.thumbnail?.size.width, image.size.width)
        // Cleanup the temp file the service wrote to disk.
        try? FileManager.default.removeItem(at: prepared.fileURL)
    }

    // MARK: - Fast preview (instant tray display)

    func test_downsampledPreview_returnsBoundedPreview_fromEncodedBytes() {
        // Force scale 1 so the source is exactly 1200×900 pixels (not multiplied
        // by the host screen scale) — keeps the allocation small and the bound
        // assertion deterministic.
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 900), format: format)
        let image = renderer.image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 1200, height: 900))
        }
        guard let data = image.jpegData(compressionQuality: 0.9) else {
            return XCTFail("Expected encodable test image")
        }

        let preview = AttachmentPreparationService.downsampledPreview(from: data, maxPixelSize: 512)

        let scale = preview?.scale ?? 1
        let longestSidePx = max((preview?.size.width ?? 0), (preview?.size.height ?? 0)) * scale
        XCTAssertNotNil(preview)
        XCTAssertLessThanOrEqual(longestSidePx, 512)
        XCTAssertGreaterThan(longestSidePx, 0)
    }

    func test_downsampledPreview_returnsNil_forNonImageBytes() {
        let garbage = Data([0x00, 0x01, 0x02, 0x03])
        XCTAssertNil(AttachmentPreparationService.downsampledPreview(from: garbage))
    }

    // MARK: - PreparingAttachment contract

    func test_awaitCompletion_resumesAfterFailure() async {
        let prep = PreparingAttachment(kind: .video, accentColor: "FF6B6B")

        // Drive the state machine through a failure on a background task to
        // exercise the multi-waiter resumption path.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 50_000_000)
            prep.fail_internal("boom")
        }

        let result = await prep.awaitCompletion()
        guard case .failure(.preparationFailed(let message)) = result else {
            return XCTFail("Expected failure")
        }
        XCTAssertEqual(message, "boom")
    }

    // MARK: - Helpers

    private static func makeTestImage(size: CGSize) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }
}

