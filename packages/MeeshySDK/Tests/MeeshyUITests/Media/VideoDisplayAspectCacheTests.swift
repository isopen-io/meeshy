import XCTest
@testable import MeeshyUI

// Pas @MainActor : actor's own isolation. Voir feedback_meeshyui_default_isolation.
final class VideoDisplayAspectCacheTests: XCTestCase {

    func test_ratio_missingKey_returnsNil() async {
        let cache = VideoDisplayAspectCache()
        let result = await cache.ratio(for: "https://example.com/video.mp4")
        XCTAssertNil(result)
    }

    func test_store_thenRatio_returnsValue() async {
        let cache = VideoDisplayAspectCache()
        await cache.store(0.5625, for: "https://example.com/video.mp4")
        let result = await cache.ratio(for: "https://example.com/video.mp4")
        XCTAssertEqual(result, 0.5625)
    }

    func test_store_overwritesPreviousValue() async {
        let cache = VideoDisplayAspectCache()
        await cache.store(1.78, for: "url")
        await cache.store(0.56, for: "url")
        let result = await cache.ratio(for: "url")
        XCTAssertEqual(result, 0.56)
    }

    func test_shared_returnsSameInstance() async {
        let a = VideoDisplayAspectCache.shared
        let b = VideoDisplayAspectCache.shared
        XCTAssertTrue(a === b)
    }
}
