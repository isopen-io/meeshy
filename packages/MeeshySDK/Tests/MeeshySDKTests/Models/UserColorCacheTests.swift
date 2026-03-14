import XCTest
@testable import MeeshySDK

final class UserColorCacheTests: XCTestCase {

    func test_blendedColor_returnsSameValueOnSecondCall() async {
        let cache = UserColorCache()
        let first = await cache.blendedColor(for: "FF6B6B")
        let second = await cache.blendedColor(for: "FF6B6B")
        XCTAssertEqual(first, second)
    }

    func test_blendedColor_differentAccents_returnDifferentResults() async {
        let cache = UserColorCache()
        let a = await cache.blendedColor(for: "FF6B6B")
        let b = await cache.blendedColor(for: "4ECDC4")
        XCTAssertNotEqual(a, b)
    }

    func test_blendedColor_isValid6CharHex() async {
        let cache = UserColorCache()
        let result = await cache.blendedColor(for: "2ECC71")
        XCTAssertEqual(result.count, 6)
        XCTAssertTrue(result.allSatisfy { $0.isHexDigit })
    }

    func test_colorForUser_returnsCachedValue() async {
        let cache = UserColorCache()
        let first = await cache.colorForUser(name: "Alice")
        let second = await cache.colorForUser(name: "Alice")
        XCTAssertEqual(first, second)
    }

    func test_invalidateAll_clearsCachedValues() async {
        let cache = UserColorCache()
        _ = await cache.blendedColor(for: "FF6B6B")
        await cache.invalidateAll()
        let stats = await cache.stats()
        XCTAssertEqual(stats.hits, 0)
        XCTAssertEqual(stats.misses, 0)
    }

    func test_cacheHitCount_incrementsOnRepeatAccess() async {
        let cache = UserColorCache()
        _ = await cache.blendedColor(for: "FF6B6B")
        _ = await cache.blendedColor(for: "FF6B6B")
        _ = await cache.blendedColor(for: "FF6B6B")
        let stats = await cache.stats()
        XCTAssertEqual(stats.hits, 2)
        XCTAssertEqual(stats.misses, 1)
    }
}
