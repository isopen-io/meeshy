import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// Pixel-level export tests.
///
/// The pre-existing `StoryExporter_BackgroundVideoTests` only assert on the
/// exported MP4's *duration* and *track presence* — never on the colour of the
/// baked frames. Worse, their fixture generated a fully BLACK source video, so a
/// compositor that drops the video entirely (black output) matched a black
/// source and the bug stayed invisible.
///
/// These tests generate source videos of a KNOWN colour and sample the pixels of
/// the exported MP4, proving the actual video imagery is baked — for both the
/// background video (Bug A) and foreground overlay video (Bug B).
final class StoryExporter_VideoFramePixelTests: XCTestCase {

    // MARK: - Bug A — background video pixels must be baked (not black)

    @MainActor
    func test_export_backgroundVideo_bakesVideoPixels_notBlack() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Source background video is solid RED.
        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("bgvid_red_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        try await BackgroundVideoFixture.makeVideo(
            duration: 2.0,
            size: CGSize(width: 540, height: 960),
            at: bgURL,
            fill: (b: 0, g: 0, r: 255, a: 255)
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_redbg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = BackgroundVideoFixture.videoOnlySlide(
            backgroundURL: bgURL,
            videoDurationSec: 2.0,
            slideDuration: 2.0,
            loop: false
        )

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // Probe the centre of the exported frame. The background video fills the
        // canvas (aspectFill), so the centre must be RED. On the buggy compositor
        // the source frame is never read → the centre is BLACK.
        let c = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(c.r, 170,
                             "Background video RED channel must be baked into the MP4 (bug: black frame). Got r=\(c.r) g=\(c.g) b=\(c.b)")
        XCTAssertLessThan(c.g, 90,
                          "Little green expected for a red background. Got r=\(c.r) g=\(c.g) b=\(c.b)")
        XCTAssertLessThan(c.b, 90,
                          "Little blue expected for a red background. Got r=\(c.r) g=\(c.g) b=\(c.b)")
    }

    // MARK: - Bug B — foreground overlay video pixels must be baked

    @MainActor
    func test_export_foregroundVideoOverlay_bakesOverlayPixels() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Blue image background.
        let bgImageURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("bgimg_blue_\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: bgImageURL) }
        try BackgroundVideoFixture.makeSolidImage(
            color: .blue, size: CGSize(width: 1080, height: 1920), at: bgImageURL)

        // Green foreground video overlay (square, centred).
        let overlayURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("overlay_green_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: overlayURL) }
        try await BackgroundVideoFixture.makeVideo(
            duration: 2.0,
            size: CGSize(width: 480, height: 480),
            at: overlayURL,
            fill: (b: 0, g: 255, r: 0, a: 255)
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_overlay_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = BackgroundVideoFixture.imageBackgroundVideoOverlaySlide(
            imageURL: bgImageURL,
            overlayVideoURL: overlayURL,
            overlayDurationSec: 2.0,
            slideDuration: 2.0
        )

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // Centre falls inside the overlay → must be GREEN. On the buggy path the
        // overlay's AVPlayerLayer is not captured, so the centre shows the blue
        // background instead.
        let centre = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(centre.g, 150,
                             "Foreground overlay video (green) must be baked at the centre. Got r=\(centre.r) g=\(centre.g) b=\(centre.b)")
        XCTAssertLessThan(centre.b, 120,
                          "Centre must not be the blue background — the overlay covers it. Got r=\(centre.r) g=\(centre.g) b=\(centre.b)")

        // A corner falls outside the overlay → must remain the BLUE background.
        let corner = try await ExportPixelProbe.color(ofMP4: outputURL, atSeconds: 0.5, nx: 0.08, ny: 0.08)
        XCTAssertGreaterThan(corner.b, 150,
                             "Background blue must remain outside the overlay. Got r=\(corner.r) g=\(corner.g) b=\(corner.b)")
    }
}

/// Pixel-probing helpers live OUTSIDE the `XCTestCase` subclass on purpose: a
/// `static`/instance method on an `NSObject` subclass that returns a Swift tuple
/// makes SILGen crash while emitting the Objective-C bridging thunk (tuples are
/// not ObjC-representable). Hosting them in a plain `enum` keeps them off the
/// `@objc` surface entirely.
enum ExportPixelProbe {

    /// Extracts the frame at `seconds` from `url` and returns the RGB of the
    /// pixel at normalised `(nx, ny)`. For a solid-colour region the Y-axis
    /// orientation is irrelevant.
    static func color(ofMP4 url: URL,
                      atSeconds seconds: Double,
                      nx: CGFloat,
                      ny: CGFloat) async throws -> (r: UInt8, g: UInt8, b: UInt8) {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let cg = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600)).image
        return sampleRGB(cg, nx: nx, ny: ny)
    }

    /// Extracts the frame at `seconds` and returns the max luminance (0–255)
    /// over a normalised `region` of the frame. Used to detect the presence of a
    /// bright element (the white watermark) in a given corner.
    static func maxLuminance(ofMP4 url: URL,
                             atSeconds seconds: Double,
                             region: CGRect) async throws -> Int {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let cg = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600)).image
        return maxLuminanceInRegion(cg, region: region)
    }

    /// Max luminance over a normalised region. The extracted CGImage is drawn
    /// without a Y flip: an AVAssetImageGenerator frame drawn into a bottom-up
    /// bitmap context lands with `region.minY` growing toward the visual bottom,
    /// so a `region` at y≈0.8 maps to the visual BOTTOM of the frame (verified
    /// empirically — flipping put a bottom-right watermark in the top-right).
    static func maxLuminanceInRegion(_ image: CGImage, region: CGRect) -> Int {
        let w = image.width
        let h = image.height
        let bytesPerRow = w * 4
        let count = bytesPerRow * h
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
        buffer.initialize(repeating: 0, count: count)
        defer { buffer.deallocate() }

        let space = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: buffer,
                                  width: w,
                                  height: h,
                                  bitsPerComponent: 8,
                                  bytesPerRow: bytesPerRow,
                                  space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            return 0
        }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h)))

        let x0 = max(0, Int(region.minX * CGFloat(w)))
        let x1 = min(w, Int(region.maxX * CGFloat(w)))
        let y0 = max(0, Int(region.minY * CGFloat(h)))
        let y1 = min(h, Int(region.maxY * CGFloat(h)))
        var maxLum = 0
        var y = y0
        while y < y1 {
            var x = x0
            while x < x1 {
                let o = y * bytesPerRow + x * 4
                let lum = (Int(buffer[o]) * 299 + Int(buffer[o + 1]) * 587 + Int(buffer[o + 2]) * 114) / 1000
                if lum > maxLum { maxLum = lum }
                x += 1
            }
            y += 1
        }
        return maxLum
    }

    /// Draws `image` into an RGBA byte buffer and reads the pixel at normalised
    /// `(nx, ny)`.
    static func sampleRGB(_ image: CGImage,
                          nx: CGFloat,
                          ny: CGFloat) -> (r: UInt8, g: UInt8, b: UInt8) {
        let w = image.width
        let h = image.height
        let bytesPerRow = w * 4
        let count = bytesPerRow * h
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
        buffer.initialize(repeating: 0, count: count)
        defer { buffer.deallocate() }

        let space = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: buffer,
                                  width: w,
                                  height: h,
                                  bitsPerComponent: 8,
                                  bytesPerRow: bytesPerRow,
                                  space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            return (0, 0, 0)
        }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(w), height: CGFloat(h)))

        let px = min(w - 1, max(0, Int(nx * CGFloat(w))))
        let py = min(h - 1, max(0, Int(ny * CGFloat(h))))
        let o = py * bytesPerRow + px * 4
        return (buffer[o], buffer[o + 1], buffer[o + 2])
    }
}
