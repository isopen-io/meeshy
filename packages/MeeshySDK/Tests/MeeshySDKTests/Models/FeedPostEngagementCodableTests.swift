import XCTest
@testable import MeeshySDK

/// P1 (social-feed) — `FeedPost`'s hand-rolled `Codable` used to silently
/// drop 8 server-issued engagement counters and the 2 "by me" flags: they
/// exist as `public var` properties (set by `APIPost.toFeedPost` at network
/// fetch time) but were never listed in `CodingKeys`/`init(from:)`/`encode(to:)`.
/// Every cache-first render (the 5-minute `.fresh` window, or offline) went
/// through a GRDB round-trip that silently reset them to `0`/`false` — stats
/// flashing to zero and the bookmark/repost icon losing its filled state on
/// every cold start. Fixed by adding `decodeIfPresent` + defaults, mirroring
/// the existing `FeedMedia.translatedAudios` backward-compat pattern.
final class FeedPostEngagementCodableTests: XCTestCase {

    private func makeEngagedPost() -> FeedPost {
        var post = FeedPost(
            id: "p1",
            author: "Alice",
            authorId: "author-1",
            content: "Hello world",
            likes: 5
        )
        post.isLiked = true
        post.isBookmarkedByMe = true
        post.isRepostedByMe = true
        post.repostCount = 3
        post.bookmarkCount = 7
        post.shareCount = 2
        post.viewCount = 100
        post.postOpenCount = 42
        post.impressionCount = 250
        post.qualifiedViewCount = 30
        post.playCount = 12
        return post
    }

    // MARK: - Round-trip

    func test_codableRoundTrip_preservesEngagementCountersAndFlags() throws {
        let post = makeEngagedPost()
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()

        let data = try encoder.encode(post)
        let decoded = try decoder.decode(FeedPost.self, from: data)

        XCTAssertEqual(decoded.isBookmarkedByMe, true)
        XCTAssertEqual(decoded.isRepostedByMe, true)
        XCTAssertEqual(decoded.repostCount, 3)
        XCTAssertEqual(decoded.bookmarkCount, 7)
        XCTAssertEqual(decoded.shareCount, 2)
        XCTAssertEqual(decoded.viewCount, 100)
        XCTAssertEqual(decoded.postOpenCount, 42)
        XCTAssertEqual(decoded.impressionCount, 250)
        XCTAssertEqual(decoded.qualifiedViewCount, 30)
        XCTAssertEqual(decoded.playCount, 12)
    }

    // MARK: - Backward compatibility (pre-migration cached page)

    func test_decode_missingEngagementKeys_defaultsToZeroAndFalse() throws {
        let json = """
        {
            "id": "p1",
            "author": "Alice",
            "authorId": "author-1",
            "content": "Hello world",
            "timestamp": 0,
            "likes": 5,
            "isLiked": false,
            "comments": [],
            "commentCount": 0,
            "isQuote": false,
            "media": []
        }
        """
        let decoder = JSONDecoder()
        let decoded = try decoder.decode(FeedPost.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.isBookmarkedByMe, false)
        XCTAssertEqual(decoded.isRepostedByMe, false)
        XCTAssertEqual(decoded.repostCount, 0)
        XCTAssertEqual(decoded.bookmarkCount, 0)
        XCTAssertEqual(decoded.shareCount, 0)
        XCTAssertEqual(decoded.viewCount, 0)
        XCTAssertEqual(decoded.postOpenCount, 0)
        XCTAssertEqual(decoded.impressionCount, 0)
        XCTAssertEqual(decoded.qualifiedViewCount, 0)
        XCTAssertEqual(decoded.playCount, 0)
    }
}
