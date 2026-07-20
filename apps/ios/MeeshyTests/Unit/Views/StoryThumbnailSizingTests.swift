import XCTest
@testable import Meeshy

@MainActor
final class StoryThumbnailSizingTests: XCTestCase {

    func test_width_portraitNineBySixteen_returnsProportionalWidth() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 0.5625, height: 64)
        XCTAssertEqual(result, 36, accuracy: 0.01)
    }

    func test_width_square_returnsFullHeight() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 1.0, height: 64)
        XCTAssertEqual(result, 64, accuracy: 0.01, "square content clamps at maxWidth (64), not 64*1.0 verbatim coincidentally equal here")
    }

    func test_width_extremeLandscape_clampsToMaxWidth() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 2.5, height: 64)
        XCTAssertEqual(result, 64, accuracy: 0.01, "landscape ratios must clamp at 64pt, never exceed the row's usable width")
    }

    func test_width_extremePortrait_clampsToMinWidth() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 0.2, height: 64)
        XCTAssertEqual(result, 36, accuracy: 0.01, "very narrow portrait content clamps at minWidth (36), stays legible")
    }

    func test_width_nilAspectRatio_fallsBackToNineBySixteen() {
        let result = StoryThumbnailSizing.width(forAspectRatio: nil, height: 64)
        XCTAssertEqual(result, 36, accuracy: 0.01, "text-only stories (no media) fall back to the 9:16 default")
    }

    func test_width_defaultHeightParameter_is64() {
        let result = StoryThumbnailSizing.width(forAspectRatio: 1.0)
        XCTAssertEqual(result, 64, accuracy: 0.01)
    }
}
