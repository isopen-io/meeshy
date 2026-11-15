import XCTest
@testable import MeeshySDK

final class PostServiceHashtagTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: PostService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = PostService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    private func makePost(id: String = "post123") -> APIPost {
        APIPost(
            id: id, type: "POST", visibility: "PUBLIC", visibilityUserIds: nil, content: "#paris",
            originalLanguage: "en", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "author1", username: "alice", displayName: "Alice", avatar: nil),
            likeCount: 10, commentCount: 2, repostCount: 1, viewCount: 100, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 3, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil,
            originalRepostOfId: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, viaUsername: nil
        )
    }

    func test_getPostsByHashtag_callsExpectedEndpoint() async throws {
        let expected = PaginatedAPIResponse(
            success: true, data: [makePost()],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 20), error: nil
        )
        mock.stub("/posts/hashtag/paris", result: expected)

        let result = try await service.getPostsByHashtag(tag: "paris", cursor: nil, limit: 20)

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/hashtag/paris")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_getTrendingHashtags_decodesArray() async throws {
        mock.stub("/hashtags/trending", result: [APIHashtag(tag: "paris", usageCount: 42)])

        let result = try await service.getTrendingHashtags(limit: 10)

        XCTAssertEqual(result, [APIHashtag(tag: "paris", usageCount: 42)])
        XCTAssertEqual(mock.lastRequest?.endpoint, "/hashtags/trending")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "limit", value: "10")])
    }

    func test_getTrendingHashtags_defaultsLimitTo20() async throws {
        mock.stub("/hashtags/trending", result: [APIHashtag]())

        _ = try await service.getTrendingHashtags()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/hashtags/trending")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "limit", value: "20")])
    }
}
