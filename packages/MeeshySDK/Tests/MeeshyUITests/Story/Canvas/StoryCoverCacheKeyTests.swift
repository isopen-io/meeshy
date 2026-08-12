import XCTest
@testable import MeeshyUI

final class StoryCoverCacheKeyTests: XCTestCase {
    func test_key_isSyntheticAndIdScoped() {
        XCTAssertEqual(StoryCoverCacheKey.key(for: "abc123"), "story-cover:abc123")
    }

    func test_key_differsForDifferentIds() {
        XCTAssertNotEqual(StoryCoverCacheKey.key(for: "a"), StoryCoverCacheKey.key(for: "b"))
    }

    func test_renderSize_is9by16CoverResolution() {
        XCTAssertEqual(StoryCoverCacheKey.renderSize, CGSize(width: 270, height: 480))
    }
}
