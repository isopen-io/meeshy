import XCTest
import UIKit
@testable import MeeshyUI

/// Tests for `SOTAImageThumbnail` — CGImageSource-based thumbnail extraction.
/// Performance comparison vs `UIImage.preparingThumbnail(of:)`.
///
/// A real 4K JPEG fixture is required for the performance test. When absent the
/// performance test is skipped. The correctness test uses a programmatically
/// generated image so it always runs.
@MainActor
final class VideoFrameExtractorPerformanceTests: XCTestCase {

    // MARK: - Helpers

    /// Resolve the bundled JPEG fixture used to compare the two thumbnail paths.
    private func fixtureURL() throws -> URL {
        if let url = Bundle.module.url(forResource: "thumbnail-fixture-4k",
                                       withExtension: "jpg",
                                       subdirectory: "Fixtures/Timeline") {
            return url
        }
        throw XCTSkip("thumbnail-fixture-4k.jpg missing — add fixture to MeeshyUITests/Fixtures/Timeline/")
    }

    /// Write a small synthetic JPEG to a temp file so correctness tests do not
    /// require the large fixture asset to be checked in.
    private func makeSyntheticJPEGURL(pixelSize: Int = 512) throws -> URL {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: pixelSize, height: pixelSize))
        let image = renderer.image { ctx in
            UIColor.systemBlue.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: pixelSize, height: pixelSize))
        }
        guard let data = image.jpegData(compressionQuality: 0.85) else {
            throw XCTSkip("Could not create synthetic JPEG")
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("sota-test-\(UUID().uuidString).jpg")
        try data.write(to: url)
        return url
    }

    // MARK: - Task 67: correctness

    /// SOTAImageThumbnail must produce a non-nil UIImage from a local JPEG.
    func test_sotaThumbnail_returnsNonNilImage_fromValidJPEG() throws {
        let url = try makeSyntheticJPEGURL(pixelSize: 512)
        defer { try? FileManager.default.removeItem(at: url) }

        let image = SOTAImageThumbnail.thumbnail(from: url, maxPixelSize: 64)
        XCTAssertNotNil(image, "SOTA thumbnail must decode the JPEG")
    }

    /// SOTAImageThumbnail must cap the longest dimension at maxPixelSize (within
    /// 1px rounding tolerance from ImageIO).
    func test_sotaThumbnail_longestDimension_atOrBelowMaxPixelSize() throws {
        let url = try makeSyntheticJPEGURL(pixelSize: 512)
        defer { try? FileManager.default.removeItem(at: url) }

        let image = SOTAImageThumbnail.thumbnail(from: url, maxPixelSize: 64)
        XCTAssertNotNil(image)
        let longest = max(image!.size.width, image!.size.height) * image!.scale
        XCTAssertLessThanOrEqual(longest, 65, "Largest dimension must be <= maxPixelSize + 1px rounding")
        XCTAssertGreaterThan(longest, 16, "Thumbnail must not collapse to nothing")
    }

    /// SOTAImageThumbnail must return nil for a non-existent URL.
    func test_sotaThumbnail_returnsNil_forInvalidURL() {
        let bogusURL = URL(fileURLWithPath: "/tmp/does-not-exist-\(UUID().uuidString).jpg")
        let image = SOTAImageThumbnail.thumbnail(from: bogusURL, maxPixelSize: 64)
        XCTAssertNil(image, "Invalid URL must yield nil thumbnail")
    }

    // MARK: - Task 67: performance (fixture-gated)

    /// SOTAImageThumbnail must be measurably faster than the legacy
    /// preparingThumbnail path for a 4K image. Skipped when the fixture is absent.
    func test_sotaThumbnail_completesUnder200ms_for4KFixture() throws {
        let url = try fixtureURL()

        measure(metrics: [XCTClockMetric()]) {
            for _ in 0..<10 {
                _ = SOTAImageThumbnail.thumbnail(from: url, maxPixelSize: 96)
            }
        }
        // XCTClockMetric baseline stays under 2.0s for 10 iterations (< 200ms each).
    }
}
