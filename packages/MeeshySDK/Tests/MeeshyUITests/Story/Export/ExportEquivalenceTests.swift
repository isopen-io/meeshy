import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// End-to-end tests for the Phase 4 export pipeline.
///
/// These tests exercise `StoryExporter.export()` against a programmatically
/// generated background video so they don't depend on bundled fixtures. They
/// validate:
///
///   1. The pipeline runs to completion and produces a non-empty MP4.
///   2. The output's render size matches `CanvasGeometry.designSize` (1080×1920).
///   3. The output's duration matches `slide.effectiveSlideDuration()`.
///   4. The exported frame at t=5s is perceptually equivalent to the live
///      StoryRenderer output via SSIM ≥ 0.99 (PixelComparison helper, B2).
///
/// Byte equality between live preview and AVFoundation export remains
/// unreachable — H.264 is lossy, AVAssetImageGenerator applies chroma
/// resampling, Display P3 ↔ sRGB round-trips drift sub-LSB — so the visual
/// resemblance test uses the SSIM tolerance metric introduced in B2.
final class ExportEquivalenceTests: XCTestCase {

    // MARK: - Pipeline smoke test

    @MainActor
    func test_export_produces_nonempty_mp4_with_correct_dimensions_and_duration() async throws {
        // Skip on environments where Metal / AVFoundation export aren't reliable.
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let bgVideoURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_test_bg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgVideoURL) }

        try await ExportFixture.makeBlackBackgroundVideo(
            duration: 2.0,
            size: CGSize(width: 540, height: 960),
            at: bgVideoURL
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_test_out_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = ExportFixture.slide(backgroundURL: bgVideoURL,
                                         videoDurationSec: 2.0,
                                         staticBaseDuration: 4.0)

        // Bridge to a Task off-main: StoryExporter MUST NOT be called from main
        // synchronously (the compositor bridges back to main per frame).
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // Output exists and is non-empty.
        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path))
        let attrs = try FileManager.default.attributesOfItem(atPath: outputURL.path)
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        XCTAssertGreaterThan(size, 1024, "MP4 should be at least 1 KB")

        // Output respects the configured render size and effective duration.
        let asset = AVURLAsset(url: outputURL)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        let track = try XCTUnwrap(tracks.first)
        let naturalSize = try await track.load(.naturalSize)
        XCTAssertEqual(naturalSize.width, CanvasGeometry.designSize.width, accuracy: 1.0,
                       "Export should render at designSize.width")
        XCTAssertEqual(naturalSize.height, CanvasGeometry.designSize.height, accuracy: 1.0,
                       "Export should render at designSize.height")

        let exportDuration = try await asset.load(.duration)
        let effectiveDuration = slide.effectiveSlideDuration()
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), effectiveDuration, accuracy: 0.1,
                       "Export duration should equal effectiveSlideDuration()")
    }

    // MARK: - Visual resemblance — SSIM tolerance metric (B2)

    @MainActor
    func test_export_frame_visually_resembles_live_render_at_t5s() async throws {
        // Activated in B2 with PixelComparison.ssim ≥ 0.99. H.264 is lossy and
        // AVAssetImageGenerator applies chroma resampling, so byte equality
        // between the UIKit live snapshot and the AVFoundation-encoded export
        // is unreachable — SSIM captures the perceptually-relevant difference
        // while tolerating the 1-2 LSB drift on anti-aliased text edges.
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let bgVideoURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_equiv_bg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgVideoURL) }

        // Background video is sized at the design canvas so the compositor's
        // natural render size matches the live snapshot dimensions exactly.
        try await ExportFixture.makeBlackBackgroundVideo(
            duration: 6.0,
            size: CanvasGeometry.designSize,
            at: bgVideoURL
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_equiv_out_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = ExportFixture.slide(
            backgroundURL: bgVideoURL,
            videoDurationSec: 6.0,
            staticBaseDuration: 6.0
        )

        // Live render at t=5s. Use designSize so the live image and the export
        // frame share the same dimensions — SSIM treats size mismatch as worst
        // case, which would mask a real comparison.
        let geometry = CanvasGeometry(renderSize: CanvasGeometry.designSize)
        let liveTime = CMTime(seconds: 5.0, preferredTimescale: 600)
        let liveLayer = StoryRenderer.render(
            slide: slide,
            into: geometry,
            at: liveTime,
            mode: .play
        )
        let liveImage = Self.renderLayerToCGImage(liveLayer, size: geometry.renderSize)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // Extract the t=5s frame from the export.
        let asset = AVURLAsset(url: outputURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)
        let (exportFrame, _) = try await generator.image(at: liveTime)

        let metric = PixelComparison.ssim(liveImage, exportFrame)
        if metric < 0.99 {
            let diff = PixelComparison.diffImage(liveImage, exportFrame)
            let attachment = XCTAttachment(image: UIImage(cgImage: diff))
            attachment.name = "ssim_diff_t5s_\(String(format: "%.4f", metric))"
            attachment.lifetime = .keepAlways
            add(attachment)
            XCTFail("SSIM \(metric) < 0.99 at t=5s — diff attached to test report")
        }
    }

    // MARK: - Helpers

    /// Render a CALayer onto a CGImage of the given size. Mirrors the static-only
    /// test's helper so both equivalence paths share the same live-snapshot
    /// pipeline (UIGraphicsImageRenderer → layer.render(in:)).
    @MainActor
    fileprivate static func renderLayerToCGImage(_ layer: CALayer, size: CGSize) -> CGImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { ctx in
            layer.render(in: ctx.cgContext)
        }
        return image.cgImage!
    }
}

// MARK: - Fixture helpers

private enum ExportFixture {

    /// Generates a deterministic black H.264 MP4 of the given duration & size at
    /// `url`. Used as a background loop video for export tests so they don't
    /// depend on any bundled assets.
    static func makeBlackBackgroundVideo(duration: TimeInterval,
                                         size: CGSize,
                                         at url: URL) async throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }

        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height)
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        input.expectsMediaDataInRealTime = false

        let bufferAttributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height)
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: bufferAttributes
        )

        guard writer.canAdd(input) else {
            throw NSError(domain: "ExportFixture", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Cannot add writer input"])
        }
        writer.add(input)

        guard writer.startWriting() else {
            throw writer.error ?? NSError(domain: "ExportFixture", code: 2,
                                            userInfo: [NSLocalizedDescriptionKey: "startWriting failed"])
        }
        writer.startSession(atSourceTime: .zero)

        let fps: Int32 = 30
        let total = Int(duration * Double(fps))

        for i in 0..<total {
            // Spin until the input is ready (deterministic in test env).
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            guard let pool = adaptor.pixelBufferPool else {
                throw NSError(domain: "ExportFixture", code: 3,
                              userInfo: [NSLocalizedDescriptionKey: "No pixel buffer pool"])
            }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
            guard let pixelBuffer = pb else {
                throw NSError(domain: "ExportFixture", code: 4,
                              userInfo: [NSLocalizedDescriptionKey: "Pixel buffer alloc failed"])
            }
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            if let base = CVPixelBufferGetBaseAddress(pixelBuffer) {
                let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
                let height = CVPixelBufferGetHeight(pixelBuffer)
                memset(base, 0, bytesPerRow * height)
            }
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

            let time = CMTime(value: CMTimeValue(i), timescale: fps)
            adaptor.append(pixelBuffer, withPresentationTime: time)
        }

        input.markAsFinished()
        await writer.finishWriting()

        if writer.status != .completed {
            throw writer.error ?? NSError(domain: "ExportFixture", code: 5,
                                            userInfo: [NSLocalizedDescriptionKey: "Writer did not complete"])
        }
    }

    /// Builds a `StorySlide` whose background loops the provided video URL.
    static func slide(backgroundURL: URL,
                      videoDurationSec: Double,
                      staticBaseDuration: Double) -> StorySlide {
        let video = StoryMediaObject(
            id: UUID().uuidString,
            postMediaId: UUID().uuidString,
            mediaURL: backgroundURL.absoluteString,
            mediaType: "video",
            placement: "media",
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            loop: true,
            startTime: 0.0,
            duration: videoDurationSec
        )

        let text = StoryTextObject(
            id: UUID().uuidString,
            text: "Hello",
            x: 0.5, y: 0.5,
            fontSize: 64.0,
            startTime: 0.0,
            duration: staticBaseDuration
        )

        var effects = StoryEffects()
        effects.mediaObjects = [video]
        effects.textObjects = [text]

        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: staticBaseDuration,
                          order: 0)
    }
}
