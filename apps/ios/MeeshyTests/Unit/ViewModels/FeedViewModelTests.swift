import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class FeedViewModelTests: XCTestCase {

    private var sut: FeedViewModel!
    private var mockAPI: MockAPIClientForApp!
    private var mockSocket: MockSocialSocket!
    private var mockPostService: MockPostService!
    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClientForApp()
        mockSocket = MockSocialSocket()
        mockPostService = MockPostService()
        cancellables = []
        sut = FeedViewModel(api: mockAPI, socialSocket: mockSocket, postService: mockPostService)
    }

    override func tearDown() {
        cancellables = nil
        sut = nil
        mockAPI = nil
        mockSocket = nil
        mockPostService = nil
        super.tearDown()
    }

    // MARK: - Factory Helpers

    private static func makeAPIPost(
        id: String = "post-1",
        type: String = "POST",
        content: String = "Hello world",
        authorId: String = "author-1",
        authorUsername: String = "alice",
        likeCount: Int = 5,
        commentCount: Int = 2,
        createdAt: String = "2026-01-15T12:00:00.000Z"
    ) -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "\(type)",
            "content": "\(content)",
            "createdAt": "\(createdAt)",
            "likeCount": \(likeCount),
            "commentCount": \(commentCount),
            "author": {"id": "\(authorId)", "username": "\(authorUsername)"}
        }
        """)
    }

    private static func makePaginatedResponse(
        posts: [APIPost] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else if hasMore {
            cursorJSON = """
            {"nextCursor":"cursor-next","hasMore":true,"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let postsJSON: String
        if posts.isEmpty {
            postsJSON = "[]"
        } else {
            let items = posts.map { p in
                """
                {"id":"\(p.id)","type":"\(p.type ?? "POST")","content":"\(p.content ?? "")","createdAt":"2026-01-15T12:00:00.000Z","likeCount":\(p.likeCount ?? 0),"commentCount":\(p.commentCount ?? 0),"author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
                """
            }
            postsJSON = "[\(items.joined(separator: ","))]"
        }
        return JSONStub.decode("""
        {"success":true,"data":\(postsJSON),"pagination":\(cursorJSON),"error":null}
        """)
    }

    // MARK: - loadFeed() Tests

    func test_loadFeed_success_populatesPostsAndSetsHasLoaded() async {
        let post1 = Self.makeAPIPost(id: "p1", content: "First post")
        let post2 = Self.makeAPIPost(id: "p2", content: "Second post")
        let response = Self.makePaginatedResponse(posts: [post1, post2])
        mockAPI.stub("/posts/feed", result: response)

        await sut.loadFeed()

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "p1")
        XCTAssertEqual(sut.posts[1].id, "p2")
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
    }

    func test_loadFeed_failure_showsEmptyState() async {
        mockAPI.errorToThrow = APIError.networkError(URLError(.notConnectedToInternet))

        await sut.loadFeed()

        XCTAssertTrue(sut.posts.isEmpty, "Should show empty state on failure")
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertNotNil(sut.error)
    }

    func test_loadFeed_whenAlreadyLoading_guardsAgainstDoubleLoad() async {
        let response = Self.makePaginatedResponse()
        mockAPI.stub("/posts/feed", result: response)

        // Simulate loading state
        sut.posts = []
        let task1 = Task { await sut.loadFeed() }
        let task2 = Task { await sut.loadFeed() }

        await task1.value
        await task2.value

        // The guard should prevent multiple simultaneous requests.
        // The mock API requestCount should be 1 because the second call
        // returns early when isLoading is already true.
        XCTAssertEqual(mockAPI.requestCount, 1)
    }

    func test_loadFeed_responseNotSuccess_showsEmptyState() async {
        let failResponse: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":false,"data":[],"pagination":null,"error":"Feed unavailable"}
        """)
        mockAPI.stub("/posts/feed", result: failResponse)

        await sut.loadFeed()

        XCTAssertTrue(sut.posts.isEmpty, "Should show empty state on non-success response")
        XCTAssertTrue(sut.hasLoaded)
    }

    // MARK: - likePost() Tests

    func test_likePost_optimisticSuccess_togglesIsLikedAndAdjustsCount() async {
        let post = Self.makeAPIPost(id: "like-test", likeCount: 10)
        let response = Self.makePaginatedResponse(posts: [post])
        mockAPI.stub("/posts/feed", result: response)
        await sut.loadFeed()

        XCTAssertEqual(sut.posts[0].likes, 10)
        XCTAssertFalse(sut.posts[0].isLiked)

        let likeResponse: APIResponse<[String: AnyCodable]> = JSONStub.decode("""
        {"success":true,"data":{},"error":null}
        """)
        mockAPI.stub("/posts/like-test/like", result: likeResponse)

        await sut.likePost("like-test")

        XCTAssertTrue(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 11)
    }

    func test_likePost_failure_rollsBackIsLikedAndCount() async {
        let post = Self.makeAPIPost(id: "rollback-test", likeCount: 5)
        let response = Self.makePaginatedResponse(posts: [post])
        mockAPI.stub("/posts/feed", result: response)
        await sut.loadFeed()

        // First stub the feed load, then set error for the like endpoint
        mockAPI.errorToThrow = APIError.networkError(URLError(.timedOut))

        await sut.likePost("rollback-test")

        // Optimistic toggle happens, then error reverts it
        XCTAssertFalse(sut.posts[0].isLiked, "Should revert isLiked on failure")
        XCTAssertEqual(sut.posts[0].likes, 5, "Should revert likes count on failure")
    }

    // MARK: - refresh() Tests

    func test_refresh_resetsStateAndReloads() async {
        let response = Self.makePaginatedResponse()
        mockAPI.stub("/posts/feed", result: response)

        sut.newPostsCount = 5

        await sut.refresh()

        XCTAssertEqual(sut.newPostsCount, 0, "refresh() should reset newPostsCount")
        XCTAssertTrue(sut.hasLoaded)
    }

    // MARK: - acknowledgeNewPosts() Tests

    func test_acknowledgeNewPosts_resetsCountToZero() {
        sut.newPostsCount = 7

        sut.acknowledgeNewPosts()

        XCTAssertEqual(sut.newPostsCount, 0)
    }

    // MARK: - Socket.IO Tests

    func test_socketPostCreated_insertsPostAtIndexZeroAndIncrementsNewPostsCount() async {
        let existingPost = Self.makeAPIPost(id: "existing-1", content: "Existing")
        let response = Self.makePaginatedResponse(posts: [existingPost])
        mockAPI.stub("/posts/feed", result: response)
        await sut.loadFeed()

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.newPostsCount, 0)

        sut.subscribeToSocketEvents()

        let newPost = Self.makeAPIPost(id: "socket-new", content: "From socket")
        mockSocket.simulatePostCreated(newPost)

        // Give Combine pipeline time to deliver on main queue
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "socket-new", "New post should be at index 0")
        XCTAssertEqual(sut.newPostsCount, 1)

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostCreated_deduplicatesExistingPost() async {
        let existingPost = Self.makeAPIPost(id: "dup-1", content: "Existing")
        let response = Self.makePaginatedResponse(posts: [existingPost])
        mockAPI.stub("/posts/feed", result: response)
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        let duplicatePost = Self.makeAPIPost(id: "dup-1", content: "Duplicate")
        mockSocket.simulatePostCreated(duplicatePost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1, "Duplicate post should not be added")
        XCTAssertEqual(sut.newPostsCount, 0, "Counter should not increment for duplicates")

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostDeleted_removesPostFromList() async {
        let post = Self.makeAPIPost(id: "delete-me", content: "Doomed post")
        let response = Self.makePaginatedResponse(posts: [post])
        mockAPI.stub("/posts/feed", result: response)
        await sut.loadFeed()

        XCTAssertEqual(sut.posts.count, 1)

        sut.subscribeToSocketEvents()

        mockSocket.simulatePostDeleted("delete-me")

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(sut.posts.isEmpty, "Post should be removed after socket delete event")

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - createPost() Tests

    func test_createPost_success_insertsAtIndexZero() async {
        let createdPost = Self.makeAPIPost(id: "created-1", content: "New creation")
        mockPostService.createResult = .success(createdPost)

        await sut.createPost(content: "New creation")

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "created-1")
        XCTAssertNil(sut.publishError)
        XCTAssertEqual(mockPostService.createCallCount, 1)
    }

    func test_createPost_failure_setsPublishError() async {
        mockPostService.createResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.createPost(content: "Failing post")

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertNotNil(sut.publishError)
    }

    // MARK: - loadFeed() with pagination

    func test_loadFeed_storesNextCursorAndHasMore() async {
        let post = Self.makeAPIPost(id: "paginated-1")
        let response = Self.makePaginatedResponse(posts: [post], hasMore: true, nextCursor: "abc123")
        mockAPI.stub("/posts/feed", result: response)

        await sut.loadFeed()

        XCTAssertTrue(sut.hasMore)
        XCTAssertEqual(sut.posts.count, 1)
    }

    // MARK: - subscribeToSocketEvents() connection

    func test_subscribeToSocketEvents_callsConnect() {
        sut.subscribeToSocketEvents()

        XCTAssertEqual(mockSocket.connectCallCount, 1)

        sut.unsubscribeFromSocketEvents()
    }

    func test_unsubscribeFromSocketEvents_callsUnsubscribeFeed() {
        sut.subscribeToSocketEvents()
        sut.unsubscribeFromSocketEvents()

        XCTAssertEqual(mockSocket.unsubscribeFeedCallCount, 1)
    }
}
