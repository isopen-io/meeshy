import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Watermark rendering tests.
///
/// The Meeshy watermark must alternate corners every 5 s (bottom-right for the
/// first 5 s, top-left for the next, and so on). These tests export a dark slide
/// long enough to cross the first switch and assert, at the pixel level, that the
/// bright (white logo + wordmark) watermark is present in the expected corner and
/// absent from the other.
final class StoryExporter_WatermarkTests: XCTestCase {

    @MainActor
    func test_export_watermark_alternatesCorners_every5s() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        guard let watermark = MeeshyExportWatermark.make() else {
            return XCTFail("watermark image could not be built")
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_wm_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = WatermarkFixture.darkSlide(duration: 8.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL, watermark: watermark)
        }.value

        // Regions (normalised) covering each corner where the watermark sits.
        let bottomRight = CGRect(x: 0.60, y: 0.80, width: 0.40, height: 0.20)
        let topLeft = CGRect(x: 0.00, y: 0.00, width: 0.40, height: 0.20)

        // t = 2 s → first 5 s window → watermark BOTTOM-RIGHT, top-left empty.
        let brAt2 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 2.0, region: bottomRight)
        let tlAt2 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 2.0, region: topLeft)
        XCTAssertGreaterThan(brAt2, 180, "Watermark must be bottom-right at t=2s (got maxLum \(brAt2))")
        XCTAssertLessThan(tlAt2, 90, "Top-left must be empty at t=2s (got maxLum \(tlAt2))")

        // t = 7 s → second window → watermark TOP-LEFT, bottom-right empty.
        let brAt7 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 7.0, region: bottomRight)
        let tlAt7 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 7.0, region: topLeft)
        XCTAssertLessThan(brAt7, 90, "Bottom-right must be empty at t=7s (got maxLum \(brAt7))")
        XCTAssertGreaterThan(tlAt7, 180, "Watermark must be top-left at t=7s (got maxLum \(tlAt7))")
    }
}

// MARK: - Fixture

internal enum WatermarkFixture {
    /// A static slide with a dark solid background and no media — the export
    /// paints the background then the watermark on top, giving high contrast for
    /// the luminance probes.
    static func darkSlide(duration: Double) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#111111"
        effects.timelineDuration = duration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: duration,
                          order: 0)
    }
}
