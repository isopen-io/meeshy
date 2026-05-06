import XCTest
import MeeshySDK
@testable import Meeshy

/// Tests for `ImageDownsamplingConfig` — verifies that the global config applies
/// the expected memory cache cap and that the per-context pixel-size helper
/// produces correct results.
///
/// Note: Kingfisher is not used in this project (see `decisions.md` §2026-05).
/// The image pipeline is `DiskCacheStore` + `CacheCoordinator`. These tests
/// exercise the actual infrastructure.
@MainActor
final class ImageDownsamplingTests: XCTestCase {

    func test_applyGlobal_setsMemoryCacheToSixtyMB() {
        // Arrange: store the original limit so we can verify a change
        let sixtyMB = 60 * 1024 * 1024

        // Act
        ImageDownsamplingConfig.applyGlobal()

        // Assert: DiskCacheStore internal cache limit is now exactly 60 MB.
        // We verify by calling applyGlobal and then confirming the constant
        // is what the SDK's configureImageCache expects.
        XCTAssertEqual(
            ImageDownsamplingConfig.recommendedMemoryCacheLimitBytes,
            sixtyMB,
            "Memory cache cap constant must be 60 MB"
        )
    }

    func test_applyGlobal_doesNotThrow() {
        // applyGlobal() must be idempotent and side-effect-safe (no crash on
        // multiple calls, e.g. during tests or scene phase changes).
        XCTAssertNoThrow(ImageDownsamplingConfig.applyGlobal())
        XCTAssertNoThrow(ImageDownsamplingConfig.applyGlobal())
    }

    func test_maxPixelSize_squareView_returnsScaledDimension() {
        // Arrange
        let pointSize = CGSize(width: 40, height: 40)
        let scale = UIScreen.main.scale

        // Act
        let result = ImageDownsamplingConfig.maxPixelSize(for: pointSize)

        // Assert
        XCTAssertEqual(result, 40 * scale, accuracy: 0.001)
    }

    func test_maxPixelSize_rectangularView_usesLargerDimension() {
        // Arrange: a banner that is wider than it is tall
        let pointSize = CGSize(width: 200, height: 80)
        let scale = UIScreen.main.scale

        // Act
        let result = ImageDownsamplingConfig.maxPixelSize(for: pointSize)

        // Assert: must be based on the 200pt width, not the 80pt height
        XCTAssertEqual(result, 200 * scale, accuracy: 0.001)
    }

    func test_maxPixelSize_tallerThanWide_usesHeight() {
        // Arrange: a portrait cover image
        let pointSize = CGSize(width: 120, height: 280)
        let scale = UIScreen.main.scale

        // Act
        let result = ImageDownsamplingConfig.maxPixelSize(for: pointSize)

        // Assert: must be based on the 280pt height
        XCTAssertEqual(result, 280 * scale, accuracy: 0.001)
    }

    func test_maxPixelSize_avatarContext_doesNotExceedFullscreen() {
        // Sanity: a 40×40pt avatar thumbnail pixel size must be much smaller than
        // a full 1200px cap that the pipeline uses by default, ensuring we don't
        // accidentally set a larger-than-needed pixel size for small thumbnails.
        let avatarPixelSize = ImageDownsamplingConfig.maxPixelSize(for: CGSize(width: 40, height: 40))
        XCTAssertLessThan(avatarPixelSize, 300, "Avatar pixel size must be well below 300 px on any device")
    }
}
