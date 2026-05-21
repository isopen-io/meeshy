import XCTest
@testable import MeeshySDK

/// A5 — pin `StoryItem.isExpired(at:)` semantics.
///
/// Stories live 24h by product rule but the cache TTL is intentionally
/// longer (avoids redownloading avatars/text on cold start). The viewer
/// must therefore detect expiration locally before rendering.
final class StoryItemExpirationTests: XCTestCase {

    // MARK: - Factory

    private func makeStory(
        createdAt: Date,
        expiresAt: Date? = nil
    ) -> StoryItem {
        StoryItem(
            id: "test-story",
            content: nil,
            createdAt: createdAt,
            expiresAt: expiresAt
        )
    }

    // MARK: - Explicit expiresAt

    func test_isExpired_withExplicitExpiresAtInFuture_returnsFalse() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let story = makeStory(createdAt: now.addingTimeInterval(-60), expiresAt: now.addingTimeInterval(60))
        XCTAssertFalse(story.isExpired(at: now))
    }

    func test_isExpired_withExplicitExpiresAtInPast_returnsTrue() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let story = makeStory(createdAt: now.addingTimeInterval(-3600), expiresAt: now.addingTimeInterval(-1))
        XCTAssertTrue(story.isExpired(at: now))
    }

    func test_isExpired_withExpiresAtExactlyNow_returnsTrue() {
        // Edge case: expiration is inclusive (boundary == expired).
        let now = Date(timeIntervalSince1970: 1_000_000)
        let story = makeStory(createdAt: now.addingTimeInterval(-60), expiresAt: now)
        XCTAssertTrue(story.isExpired(at: now))
    }

    // MARK: - 24h fallback (no explicit expiresAt)

    func test_isExpired_withoutExpiresAt_under24h_returnsFalse() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let story = makeStory(createdAt: now.addingTimeInterval(-23 * 3600))
        XCTAssertFalse(story.isExpired(at: now))
    }

    func test_isExpired_withoutExpiresAt_exactly24h_returnsTrue() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let story = makeStory(createdAt: now.addingTimeInterval(-24 * 3600))
        XCTAssertTrue(story.isExpired(at: now))
    }

    func test_isExpired_withoutExpiresAt_over24h_returnsTrue() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let story = makeStory(createdAt: now.addingTimeInterval(-25 * 3600))
        XCTAssertTrue(story.isExpired(at: now))
    }

    // MARK: - Default `now` argument

    func test_isExpired_defaultArgument_usesCurrentDate() {
        let story = makeStory(createdAt: Date().addingTimeInterval(-25 * 3600))
        XCTAssertTrue(story.isExpired())
    }

    func test_isExpired_freshStory_defaultArgument_returnsFalse() {
        let story = makeStory(createdAt: Date().addingTimeInterval(-60))
        XCTAssertFalse(story.isExpired())
    }
}
