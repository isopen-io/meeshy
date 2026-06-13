import Foundation
@testable import Meeshy
import MeeshySDK

/// Stub for `ReelFeedCacheReading` so `ReelsViewModelTests` can drive the
/// cache-first cold-start / offline paths without a live `CacheCoordinator`.
final class MockReelFeedCache: ReelFeedCacheReading, @unchecked Sendable {
    var cachedFeedResult: [FeedPost] = []
    private(set) var cachedFeedCallCount = 0
    private(set) var lastCachedFeedKey: String?

    func cachedFeed(forKey key: String) async -> [FeedPost] {
        cachedFeedCallCount += 1
        lastCachedFeedKey = key
        return cachedFeedResult
    }
}
