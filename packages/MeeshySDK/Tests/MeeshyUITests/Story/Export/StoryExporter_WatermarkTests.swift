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
    func test_export_watermark_alternatesCorners_every12s() async throws {
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

        // 16 s covers the first two 12 s windows (0–12 bottom-right, 12–24 top-left).
        let slide = WatermarkFixture.darkSlide(duration: 16.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL, watermark: watermark)
        }.value

        // Regions (normalised) covering each corner where the watermark sits.
        let bottomRight = CGRect(x: 0.60, y: 0.80, width: 0.40, height: 0.20)
        let topLeft = CGRect(x: 0.00, y: 0.00, width: 0.40, height: 0.20)

        // t = 6 s → first 12 s window → watermark BOTTOM-RIGHT, top-left empty.
        let brAt6 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 6.0, region: bottomRight)
        let tlAt6 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 6.0, region: topLeft)
        XCTAssertGreaterThan(brAt6, 180, "Watermark must be bottom-right at t=6s (got maxLum \(brAt6))")
        XCTAssertLessThan(tlAt6, 90, "Top-left must be empty at t=6s (got maxLum \(tlAt6))")

        // t = 15 s → second window (12–24 s) → watermark TOP-LEFT, bottom-right empty.
        let brAt15 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 15.0, region: bottomRight)
        let tlAt15 = try await ExportPixelProbe.maxLuminance(ofMP4: outputURL, atSeconds: 15.0, region: topLeft)
        XCTAssertLessThan(brAt15, 90, "Bottom-right must be empty at t=15s (got maxLum \(brAt15))")
        XCTAssertGreaterThan(tlAt15, 180, "Watermark must be top-left at t=15s (got maxLum \(tlAt15))")
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
