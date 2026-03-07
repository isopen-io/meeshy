import XCTest
@testable import MeeshySDK

final class PostServiceTests: XCTestCase {
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

    // MARK: - Helpers

    private let postId = "post123"

    private func makePost(id: String = "post123") -> APIPost {
        APIPost(
            id: id, type: "POST", visibility: "PUBLIC", content: "Hello world",
            originalLanguage: "en", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "author1", username: "alice", displayName: "Alice", avatar: nil, avatarUrl: nil),
            likeCount: 10, commentCount: 2, repostCount: 1, viewCount: 100,
            bookmarkCount: 3, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil
        )
    }

    private func makeComment(id: String = "comment1") -> APIPostComment {
        APIPostComment(
            id: id, content: "Great post!", originalLanguage: "en",
            translations: nil, likeCount: 0, replyCount: 0, createdAt: Date(),
            author: APIAuthor(id: "author2", username: "bob", displayName: "Bob", avatar: nil, avatarUrl: nil)
        )
    }

    // MARK: - getFeed

    func testGetFeedReturnsPosts() async throws {
        let post = makePost()
        let expected = PaginatedAPIResponse(
            success: true,
            data: [post],
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: 20),
            error: nil
        )
        mock.stub("/posts/feed", result: expected)

        let result = try await service.getFeed()

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "post123")
        XCTAssertTrue(result.success)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/feed")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    // MARK: - create

    func testCreateReturnsNewPost() async throws {
        let newPost = makePost(id: "newPost1")
        let response = APIResponse(success: true, data: newPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.create(content: "Hello world", type: "POST", visibility: "PUBLIC")

        XCTAssertEqual(result.id, "newPost1")
        XCTAssertEqual(result.content, "Hello world")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - delete

    func testDeleteCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["deleted": true], error: nil)
        mock.stub("/posts/\(postId)", result: response)

        try await service.delete(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - like

    func testLikeCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "liked"], error: nil)
        mock.stub("/posts/\(postId)/like", result: response)

        try await service.like(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/like")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - unlike

    func testUnlikeCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["unliked": true], error: nil)
        mock.stub("/posts/\(postId)/like", result: response)

        try await service.unlike(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/like")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - bookmark

    func testBookmarkCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "bookmarked"], error: nil)
        mock.stub("/posts/\(postId)/bookmark", result: response)

        try await service.bookmark(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/bookmark")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - addComment

    func testAddCommentReturnsNewComment() async throws {
        let comment = makeComment()
        let response = APIResponse(success: true, data: comment, error: nil)
        mock.stub("/posts/\(postId)/comments", result: response)

        let result = try await service.addComment(postId: postId, content: "Great post!")

        XCTAssertEqual(result.id, "comment1")
        XCTAssertEqual(result.content, "Great post!")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/comments")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - likeComment

    func testLikeCommentCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "liked"], error: nil)
        mock.stub("/posts/\(postId)/comments/comment1/like", result: response)

        try await service.likeComment(postId: postId, commentId: "comment1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/comments/comment1/like")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - repost

    func testRepostCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "reposted"], error: nil)
        mock.stub("/posts/\(postId)/repost", result: response)

        try await service.repost(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRepostWithQuoteCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "reposted"], error: nil)
        mock.stub("/posts/\(postId)/repost", result: response)

        try await service.repost(postId: postId, quote: "Check this out!")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - share

    func testShareCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "shared"], error: nil)
        mock.stub("/posts/\(postId)/share", result: response)

        try await service.share(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/share")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - createStory

    func testCreateStoryReturnsPost() async throws {
        let storyPost = makePost(id: "story1")
        let response = APIResponse(success: true, data: storyPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createStory(content: "My story", storyEffects: nil)

        XCTAssertEqual(result.id, "story1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - createWithType

    func testCreateWithTypePostDelegatesToCreate() async throws {
        let post = makePost(id: "typed1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createWithType(.post, content: "Typed post")

        XCTAssertEqual(result.id, "typed1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testCreateWithTypeStoryDelegatesToCreateStory() async throws {
        let storyPost = makePost(id: "storyTyped1")
        let response = APIResponse(success: true, data: storyPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createWithType(.story, content: "Story content")

        XCTAssertEqual(result.id, "storyTyped1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testCreateWithTypeStatusDelegatesToCreate() async throws {
        let statusPost = makePost(id: "statusTyped1")
        let response = APIResponse(success: true, data: statusPost, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.createWithType(.status, content: "Feeling happy", moodEmoji: "smile")

        XCTAssertEqual(result.id, "statusTyped1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Error case

    func testGetFeedThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.getFeed()
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
}
