import XCTest
@testable import MeeshySDK

final class StatusServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: StatusService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = StatusService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeAPIPost(id: String = "post1", content: String = "Hello") -> APIPost {
        let author = APIAuthor(id: "a1", username: "testuser", displayName: "Test", avatar: nil)
        return APIPost(
            id: id, type: "STATUS", visibility: "PUBLIC", content: content,
            originalLanguage: "fr", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: nil, isQuote: false, moodEmoji: "smile", audioUrl: nil,
            audioDuration: nil, storyEffects: nil, translations: nil
        )
    }

    // MARK: - list (friends mode)

    func testListFriendsCallsCorrectEndpoint() async throws {
        let post = makeAPIPost()
        let pagination = CursorPagination(nextCursor: nil, hasMore: false, limit: 20)
        let response = PaginatedAPIResponse<[APIPost]>(
            success: true, data: [post], pagination: pagination, error: nil
        )
        mock.stub("/posts/feed/statuses", result: response)

        let result = try await service.list(mode: .friends)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/feed/statuses")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "post1")
    }

    // MARK: - list (discover mode)

    func testListDiscoverCallsCorrectEndpoint() async throws {
        let post = makeAPIPost(id: "discover1")
        let pagination = CursorPagination(nextCursor: "abc", hasMore: true, limit: 20)
        let response = PaginatedAPIResponse<[APIPost]>(
            success: true, data: [post], pagination: pagination, error: nil
        )
        mock.stub("/posts/feed/statuses/discover", result: response)

        let result = try await service.list(mode: .discover)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/feed/statuses/discover")
        XCTAssertEqual(result.data[0].id, "discover1")
        XCTAssertEqual(result.pagination?.nextCursor, "abc")
        XCTAssertEqual(result.pagination?.hasMore, true)
    }

    func testListWithCursorPassesThroughPagination() async throws {
        let pagination = CursorPagination(nextCursor: nil, hasMore: false, limit: 10)
        let response = PaginatedAPIResponse<[APIPost]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mock.stub("/posts/feed/statuses", result: response)

        let result = try await service.list(mode: .friends, cursor: "somecursor", limit: 10)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertTrue(result.data.isEmpty)
    }

    // MARK: - create

    func testCreatePostsToPostsEndpoint() async throws {
        let post = makeAPIPost(id: "newpost", content: "My status")
        let response = APIResponse<APIPost>(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.create(moodEmoji: "smile", content: "My status")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "newpost")
        XCTAssertEqual(result.moodEmoji, "smile")
    }

    func testCreateWithVisibilityAndUserIds() async throws {
        let post = makeAPIPost()
        let response = APIResponse<APIPost>(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        let result = try await service.create(
            moodEmoji: "fire",
            content: "Private status",
            visibility: "FRIENDS_ONLY",
            visibilityUserIds: ["u1", "u2"]
        )

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "post1")
    }

    func testCreateWithNilContent() async throws {
        let post = makeAPIPost()
        let response = APIResponse<APIPost>(success: true, data: post, error: nil)
        mock.stub("/posts", result: response)

        _ = try await service.create(moodEmoji: "wave", content: nil)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
    }

    // MARK: - delete

    func testDeleteCallsDeleteOnPostEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil)
        mock.stub("/posts/post123", result: response)

        try await service.delete(statusId: "post123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/post123")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - react

    func testReactPostsToLikeEndpoint() async throws {
        let response = APIResponse<[String: String]>(success: true, data: [:], error: nil)
        mock.stub("/posts/post123/like", result: response)

        try await service.react(statusId: "post123", emoji: "heart")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/post123/like")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Mode endpoint mapping

    func testFriendsModeEndpoint() {
        XCTAssertEqual(StatusService.Mode.friends.endpoint, "/posts/feed/statuses")
    }

    func testDiscoverModeEndpoint() {
        XCTAssertEqual(StatusService.Mode.discover.endpoint, "/posts/feed/statuses/discover")
    }

    // MARK: - Error handling

    func testListPropagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.list(mode: .friends)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.timeout) = error {
                // expected
            } else {
                XCTFail("Expected network timeout, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func testCreatePropagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 422, message: "Validation failed")

        do {
            _ = try await service.create(moodEmoji: "x", content: "test")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, let message) = error {
                XCTAssertEqual(code, 422)
                XCTAssertEqual(message, "Validation failed")
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func testDeletePropagatesError() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            try await service.delete(statusId: "post123")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
