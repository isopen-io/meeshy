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
            author: APIAuthor(id: "author1", username: "alice", displayName: "Alice", avatar: nil),
            likeCount: 10, commentCount: 2, repostCount: 1, viewCount: 100, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 3, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil,
            originalRepostOfId: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, mentionedUsers: nil, viaUsername: nil
        )
    }

    private func makeComment(id: String = "comment1") -> APIPostComment {
        APIPostComment(
            id: id, content: "Great post!", originalLanguage: "en",
            parentId: nil,
            translations: nil, likeCount: 0, replyCount: 0,
            effectFlags: nil,
            createdAt: Date(),
            author: APIAuthor(id: "author2", username: "bob", displayName: "Bob", avatar: nil),
            currentUserReactions: nil,
            media: nil
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
        let post = makePost()
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/\(postId)/repost", result: response)

        _ = try await service.repost(postId: postId)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRepostWithQuoteCallsCorrectEndpoint() async throws {
        let post = makePost()
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/\(postId)/repost", result: response)

        _ = try await service.repost(postId: postId, content: "Check this out!", isQuote: true)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/repost")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - repost with targetType (B.5)

    func test_RepostRequest_encodes_targetType() throws {
        let req = RepostRequest(content: "hi", isQuote: false, targetType: "POST")
        let data = try JSONEncoder().encode(req)
        let json = String(data: data, encoding: .utf8) ?? ""
        XCTAssertTrue(json.contains("\"targetType\":\"POST\""), "Expected JSON to contain targetType:POST, got: \(json)")
    }

    func test_PostService_repost_sends_targetType() async throws {
        let post = makePost(id: "story-1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts/story-1/repost", result: response)

        _ = try await service.repost(postId: "story-1", targetType: .post, content: "Mon commentaire", isQuote: false)

        XCTAssertEqual(mock.lastRequest?.path, "/posts/story-1/repost")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["targetType"] as? String, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["content"] as? String, "Mon commentaire")
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

    // MARK: - create / createStory with repostOfId (B.5c)

    func test_create_includes_repostOfId_when_provided() async throws {
        let post = makePost(id: "newPost1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.create(content: "x", type: "POST", repostOfId: "root-1")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["repostOfId"] as? String, "root-1")
    }

    func test_createStory_includes_repostOfId_when_provided() async throws {
        let post = makePost(id: "story1")
        let response = APIResponse(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.createStory(content: "x", storyEffects: nil, repostOfId: "root-1")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["repostOfId"] as? String, "root-1")
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

    func test_recordEngagement_postsBatch_toEngagementEndpoint() async throws {
        let response = APIResponse(success: true, data: ["recorded": 1], error: nil)
        mock.stub("/posts/engagement/batch", result: response)

        let session = EngagementSession(
            sessionId: "s1", userId: "u1", postId: "p1", contentType: .reel, surface: .reels,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000, watchMs: 3800,
            mediaDurationMs: 15000, completed: false, truncated: false, consent: "granted",
            actions: [], watchSamples: []
        )

        try await service.recordEngagement([session])

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/engagement/batch")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_recordEngagement_emptyArray_doesNotCallNetwork() async throws {
        try await service.recordEngagement([])
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_recordImpression_postsTo_singleImpressionEndpoint() async throws {
        let response = APIResponse(success: true, data: ["recorded": true], error: nil)
        mock.stub("/posts/\(postId)/impression", result: response)

        try await service.recordImpression(postId: postId, source: "detail")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/\(postId)/impression")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }
}
