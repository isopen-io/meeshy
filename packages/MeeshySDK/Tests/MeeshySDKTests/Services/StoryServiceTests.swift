import XCTest
@testable import MeeshySDK

final class StoryServiceTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: StoryService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = StoryService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private let storyId = "story123"

    private func makePost(id: String = "story123") -> APIPost {
        APIPost(
            id: id, type: "STORY", visibility: "PUBLIC", content: "My story",
            originalLanguage: "en", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "author1", username: "bob", displayName: "Bob", avatar: nil),
            likeCount: 5, commentCount: 0, repostCount: 0, viewCount: 10, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 0, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil,
            originalRepostOfId: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, mentionedUsers: nil, viaUsername: nil
        )
    }

    private func makeComment(id: String = "comment1") -> APIPostComment {
        APIPostComment(
            id: id, content: "Nice!", originalLanguage: "en",
            parentId: nil,
            translations: nil, likeCount: 0, replyCount: 0,
            effectFlags: nil,
            createdAt: Date(),
            author: APIAuthor(id: "author2", username: "alice", displayName: "Alice", avatar: nil),
            currentUserReactions: nil,
            media: nil
        )
    }

    // MARK: - list

    func testListReturnsStories() async throws {
        let post = makePost()
        let expected = PaginatedAPIResponse(
            success: true,
            data: [post],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 50),
            error: nil
        )
        mock.stub("/posts/feed/stories", result: expected)

        let result = try await service.list()

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "story123")
        XCTAssertTrue(result.success)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/feed/stories")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - markViewed

    func testMarkViewedCallsCorrectEndpoint() async throws {
        // `markViewed` décode la forme réelle du gateway `{ viewed: true }`
        // (APIResponse<[String: Bool]>) depuis le fix 2026-06-01 ; le stub doit
        // fournir un `[String: Bool]`, sinon le MockAPIClient ne matche pas le
        // type de retour et lève « no stub … returning APIResponse<…Bool> ».
        let response = APIResponse(success: true, data: ["viewed": true], error: nil)
        mock.stub("/posts/\(storyId)/view", result: response)

        try await service.markViewed(storyId: storyId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(storyId)/view")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - delete

    func testDeleteCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["deleted": true], error: nil)
        mock.stub("/posts/\(storyId)", result: response)

        try await service.delete(storyId: storyId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(storyId)")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - react

    func testReactCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "liked"], error: nil)
        mock.stub("/posts/\(storyId)/like", result: response)

        try await service.react(storyId: storyId, emoji: "heart")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(storyId)/like")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - comment

    func testCommentReturnsNewComment() async throws {
        let comment = makeComment()
        let response = APIResponse(success: true, data: comment, error: nil)
        mock.stub("/posts/\(storyId)/comments", result: response)

        let result = try await service.comment(storyId: storyId, content: "Nice!")

        XCTAssertEqual(result.id, "comment1")
        XCTAssertEqual(result.content, "Nice!")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(storyId)/comments")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - repost

    func testRepostCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "reposted"], error: nil)
        mock.stub("/posts/\(storyId)/repost", result: response)

        try await service.repost(storyId: storyId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(storyId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Error case

    func testListThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.list()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.network(.noConnection), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertEqual(mock.requestCount, 1)
    }

    // MARK: - cachedPost

    func testCachedPostWhenAbsentReturnsNil() {
        XCTAssertNil(service.cachedPost(id: "missing"))
    }

    func testCachedPostAfterListReturnsCachedItem() async throws {
        let post = makePost(id: "p1")
        let response = PaginatedAPIResponse(
            success: true,
            data: [post],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 50),
            error: nil
        )
        mock.stub("/posts/feed/stories", result: response)

        _ = try await service.list()

        XCTAssertEqual(service.cachedPost(id: "p1")?.id, "p1")
    }

    // MARK: - fetchPost

    func testFetchPostReturnsAPIPostFromEndpoint() async throws {
        let post = makePost(id: "p1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/p1", result: response)

        let result = try await service.fetchPost(id: "p1")

        XCTAssertEqual(result.id, "p1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/p1")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testFetchPostThrowsOnError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.fetchPost(id: "missing")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.network(.noConnection), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testFetchPostPopulatesCache() async throws {
        let post = makePost(id: "p1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/p1", result: response)

        XCTAssertNil(service.cachedPost(id: "p1"))
        _ = try await service.fetchPost(id: "p1")

        XCTAssertEqual(service.cachedPost(id: "p1")?.id, "p1")
    }
}
