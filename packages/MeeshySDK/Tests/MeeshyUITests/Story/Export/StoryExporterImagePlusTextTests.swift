import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for Phase A1 of the story export fix: a slide whose background is
/// surfaced via `slide.mediaURL` (and NOT via an `isBackground` mediaObject)
/// must export with the image painted as the substrate, not a black frame.
///
/// This pins the published-story export path:
/// `StoryItem.toRenderableSlide` sets `slide.mediaURL` but does NOT inject
/// a synthetic `StoryMediaObject`. Prior to A1, `StoryAVCompositor` ignored
/// `slide.mediaURL` and returned `nil`, producing a black exported video.
///
/// All export-pipeline tests honour `MEESHY_SKIP_EXPORT_TESTS` so CI can skip
/// the slow paths when Metal / AVFoundation aren't reliable.
final class StoryExporterImagePlusTextTests: XCTestCase {

    @MainActor
    func test_export_slideWithMediaURLBackground_paintsImage() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // 1. Generate a solid-red 1080x1920 image and persist it to disk so
        //    `slide.mediaURL` can reference a real file URL.
        let backgroundImage = Self.makeSolidColorImage(
            color: .red,
            size: CGSize(width: 1080, height: 1920)
        )
        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_red_bg_\(UUID().uuidString).jpg")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        let bgData = try XCTUnwrap(backgroundImage.jpegData(compressionQuality: 0.95))
        try bgData.write(to: bgURL)

        // 2. Build the slide: mediaURL points at the red JPG, plus one text
        //    object. No mediaObjects — that's the whole point: prior to A1
        //    the exporter ignored `slide.mediaURL` and rendered black.
        let text = StoryTextObject(
            id: UUID().uuidString,
            text: "Hello",
            x: 0.5, y: 0.5,
            fontSize: 96.0,
            startTime: 0.0,
            duration: 2.0
        )
        var effects = StoryEffects()
        effects.textObjects = [text]
        let slide = StorySlide(
            id: UUID().uuidString,
            mediaURL: bgURL.absoluteString,
            effects: effects,
            duration: 2.0,
            order: 0
        )

        // 3. Export to a temp MP4.
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_imageplustext_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path),
                      "Export should produce an MP4 at the output URL")

        // 4. Extract the midpoint frame.
        let asset = AVURLAsset(url: outputURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let midpoint = CMTime(seconds: 1.0, preferredTimescale: 600)
        let (cgImage, _) = try await generator.image(at: midpoint)

        // 5. Sample ~10 points across the frame (avoiding the center where the
        //    text is rendered). At least 50% must be visibly red:
        //      R > G + 50 && R > B + 50
        //    A black frame (the pre-A1 bug) would fail this on every sample.
        let samplePoints: [(CGFloat, CGFloat)] = [
            (0.10, 0.10), (0.50, 0.10), (0.90, 0.10),
            (0.10, 0.50), (0.90, 0.50),
            (0.10, 0.90), (0.50, 0.90), (0.90, 0.90),
            (0.25, 0.75), (0.75, 0.25)
        ]

        var redSamples = 0
        for (nx, ny) in samplePoints {
            let px = Int(nx * CGFloat(cgImage.width))
            let py = Int(ny * CGFloat(cgImage.height))
            guard let (r, g, b) = Self.pixelRGB(in: cgImage, x: px, y: py) else { continue }
            if r > g + 50 && r > b + 50 { redSamples += 1 }
        }

        let ratio = Double(redSamples) / Double(samplePoints.count)
        XCTAssertGreaterThanOrEqual(
            ratio, 0.5,
            "Expected at least 50% of off-center samples to be red — got \(redSamples)/\(samplePoints.count). " +
            "A black frame (pre-A1 bug) would yield 0; ensure resolveBackgroundImage's mediaURL fallback fires."
        )
    }

    // MARK: - Helpers

    @MainActor
    private static func makeSolidColorImage(color: UIColor, size: CGSize) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    /// Reads a single pixel as RGBA8 by rendering the CGImage into a 1x1
    /// bitmap context anchored at (x, y). Returns nil if the read fails.
    private static func pixelRGB(in cgImage: CGImage, x: Int, y: Int) -> (UInt8, UInt8, UInt8)? {
        guard x >= 0, y >= 0, x < cgImage.width, y < cgImage.height else { return nil }
        var pixel: [UInt8] = [0, 0, 0, 0]
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue
            | CGImageAlphaInfo.premultipliedLast.rawValue
        guard let context = CGContext(
            data: &pixel,
            width: 1,
            height: 1,
            bitsPerComponent: 8,
            bytesPerRow: 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return nil }
        // Draw the source CGImage shifted so that (x, y) lands at (0, 0).
        context.draw(cgImage, in: CGRect(
            x: -CGFloat(x),
            y: -CGFloat(cgImage.height - 1 - y),
            width: CGFloat(cgImage.width),
            height: CGFloat(cgImage.height)
        ))
        return (pixel[0], pixel[1], pixel[2])
    }
}
