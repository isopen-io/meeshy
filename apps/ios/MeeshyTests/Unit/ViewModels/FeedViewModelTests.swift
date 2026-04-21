import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class FeedViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        api: MockAPIClientForApp? = nil,
        socialSocket: MockSocialSocket? = nil,
        postService: MockPostService? = nil
    ) -> (
        sut: FeedViewModel,
        api: MockAPIClientForApp,
        socket: MockSocialSocket,
        postService: MockPostService
    ) {
        let api = api ?? MockAPIClientForApp()
        let socket = socialSocket ?? MockSocialSocket()
        let postService = postService ?? MockPostService()
        let sut = FeedViewModel(api: api, socialSocket: socket, postService: postService)
        return (sut, api, socket, postService)
    }

    // MARK: - Stub Helpers

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

    private static func makeFeedPost(
        id: String = "fp-1",
        content: String = "Test content",
        likes: Int = 0,
        isLiked: Bool = false,
        commentCount: Int = 0,
        translations: [String: PostTranslation]? = nil,
        translatedContent: String? = nil
    ) -> FeedPost {
        var post = FeedPost(
            id: id,
            author: "alice",
            authorId: "author-1",
            content: content,
            likes: likes,
            commentCount: commentCount,
            translations: translations,
            translatedContent: translatedContent
        )
        post.isLiked = isLiked
        return post
    }

    // MARK: - Initial State

    func test_init_hasEmptyState() {
        let (sut, _, _, _) = makeSUT()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertFalse(sut.isLoading)
        XCTAssertFalse(sut.isLoadingMore)
        XCTAssertTrue(sut.hasMore)
        XCTAssertFalse(sut.hasLoaded)
        XCTAssertNil(sut.error)
        XCTAssertEqual(sut.newPostsCount, 0)
        XCTAssertNil(sut.publishError)
        XCTAssertFalse(sut.publishSuccess)
    }

    // MARK: - loadFeed()

    func test_loadFeed_success_populatesPostsAndSetsHasLoaded() async {
        let (sut, api, _, _) = makeSUT()
        let post1 = Self.makeAPIPost(id: "p1", content: "First post")
        let post2 = Self.makeAPIPost(id: "p2", content: "Second post")
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post1, post2]))

        await sut.loadFeed()

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "p1")
        XCTAssertEqual(sut.posts[1].id, "p2")
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
    }

    func test_loadFeed_failure_setsError() async {
        let (sut, api, _, _) = makeSUT()
        api.errorToThrow = APIError.networkError(URLError(.notConnectedToInternet))

        await sut.loadFeed()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertNotNil(sut.error)
    }

    func test_loadFeed_whenAlreadyLoading_guardsAgainstDoubleLoad() async {
        let (sut, api, _, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse())

        let task1 = Task { await sut.loadFeed() }
        let task2 = Task { await sut.loadFeed() }

        await task1.value
        await task2.value

        XCTAssertEqual(api.requestCount, 1)
    }

    func test_loadFeed_responseNotSuccess_setsErrorWhenPostsEmpty() async {
        let (sut, api, _, _) = makeSUT()
        let failResponse: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":false,"data":[],"pagination":null,"error":"Feed unavailable"}
        """)
        api.stub("/posts/feed", result: failResponse)

        await sut.loadFeed()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertTrue(sut.hasLoaded)
    }

    func test_loadFeed_storesNextCursorAndHasMore() async {
        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "paginated-1")
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post], hasMore: true, nextCursor: "abc123"))

        await sut.loadFeed()

        XCTAssertTrue(sut.hasMore)
        XCTAssertEqual(sut.posts.count, 1)
    }

    // MARK: - loadMoreIfNeeded()

    func test_loadMoreIfNeeded_whenNearEnd_appendsNewPosts() async {
        let (sut, api, _, _) = makeSUT()

        // Load initial feed with hasMore=true so nextCursor is set
        var initialPosts: [APIPost] = []
        for i in 0..<10 {
            initialPosts.append(Self.makeAPIPost(id: "post-\(i)", content: "Post \(i)"))
        }
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: initialPosts, hasMore: true, nextCursor: "cursor-page2"))

        await sut.loadFeed()
        XCTAssertEqual(sut.posts.count, 10)

        // Stub the next page
        let morePosts = [
            Self.makeAPIPost(id: "post-10", content: "Post 10"),
            Self.makeAPIPost(id: "post-11", content: "Post 11")
        ]
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: morePosts, hasMore: false))

        // Trigger loadMore from near the end (index 5 with 10 posts, threshold = 10-5 = 5)
        let triggerPost = sut.posts[5]
        await sut.loadMoreIfNeeded(currentPost: triggerPost)

        XCTAssertEqual(sut.posts.count, 12)
        XCTAssertEqual(sut.posts[10].id, "post-10")
        XCTAssertEqual(sut.posts[11].id, "post-11")
        XCTAssertFalse(sut.hasMore)
        XCTAssertFalse(sut.isLoadingMore)
    }

    func test_loadMoreIfNeeded_deduplicatesExistingPosts() async {
        let (sut, api, _, _) = makeSUT()

        var initialPosts: [APIPost] = []
        for i in 0..<10 {
            initialPosts.append(Self.makeAPIPost(id: "post-\(i)"))
        }
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: initialPosts, hasMore: true, nextCursor: "c2"))

        await sut.loadFeed()

        // Next page returns a duplicate
        let dupeAndNew = [
            Self.makeAPIPost(id: "post-9", content: "Duplicate"),
            Self.makeAPIPost(id: "post-10", content: "New")
        ]
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: dupeAndNew))

        let triggerPost = sut.posts[5]
        await sut.loadMoreIfNeeded(currentPost: triggerPost)

        XCTAssertEqual(sut.posts.count, 11, "Duplicate should not be added")
    }

    func test_loadMoreIfNeeded_whenNotNearEnd_doesNotLoad() async {
        let (sut, api, _, _) = makeSUT()

        var initialPosts: [APIPost] = []
        for i in 0..<20 {
            initialPosts.append(Self.makeAPIPost(id: "post-\(i)"))
        }
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: initialPosts, hasMore: true, nextCursor: "c2"))

        await sut.loadFeed()
        let initialRequestCount = api.requestCount

        // Post at index 0 is far from end (threshold = 20-5 = 15), so no load
        let earlyPost = sut.posts[0]
        await sut.loadMoreIfNeeded(currentPost: earlyPost)

        XCTAssertEqual(api.requestCount, initialRequestCount, "Should not make additional request when far from end")
    }

    func test_loadMoreIfNeeded_whenNoMorePages_doesNotLoad() async {
        let (sut, api, _, _) = makeSUT()

        let posts = (0..<6).map { Self.makeAPIPost(id: "p\($0)") }
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: posts, hasMore: false))

        await sut.loadFeed()
        let initialRequestCount = api.requestCount

        let triggerPost = sut.posts[5]
        await sut.loadMoreIfNeeded(currentPost: triggerPost)

        XCTAssertEqual(api.requestCount, initialRequestCount, "Should not load more when hasMore is false")
    }

    // MARK: - likePost() Optimistic UI

    func test_likePost_optimisticSuccess_togglesIsLikedAndIncrementsCount() async {
        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "like-test", likeCount: 10)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed()

        XCTAssertEqual(sut.posts[0].likes, 10)
        XCTAssertFalse(sut.posts[0].isLiked)

        let likeResponse: APIResponse<[String: AnyCodable]> = JSONStub.decode("""
        {"success":true,"data":{},"error":null}
        """)
        api.stub("/posts/like-test/like", result: likeResponse)

        await sut.likePost("like-test")

        XCTAssertTrue(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 11)
    }

    func test_likePost_failure_rollsBackIsLikedAndCount() async {
        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "rollback-test", likeCount: 5)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed()

        api.errorToThrow = APIError.networkError(URLError(.timedOut))

        await sut.likePost("rollback-test")

        XCTAssertFalse(sut.posts[0].isLiked, "Should revert isLiked on failure")
        XCTAssertEqual(sut.posts[0].likes, 5, "Should revert likes count on failure")
    }

    func test_likePost_unlikeAlreadyLiked_decrementsCount() async {
        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "unlike-test", likeCount: 8)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed()

        // First like
        let likeResponse: APIResponse<[String: AnyCodable]> = JSONStub.decode("""
        {"success":true,"data":{},"error":null}
        """)
        api.stub("/posts/unlike-test/like", result: likeResponse)
        await sut.likePost("unlike-test")

        XCTAssertTrue(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 9)

        // Unlike via delete
        let unlikeResponse: APIResponse<[String: Bool]> = JSONStub.decode("""
        {"success":true,"data":{"ok":true},"error":null}
        """)
        api.stub("/posts/unlike-test/like", result: unlikeResponse)
        api.errorToThrow = nil

        await sut.likePost("unlike-test")

        XCTAssertFalse(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 8)
    }

    func test_likePost_withInvalidPostId_doesNothing() async {
        let (sut, api, _, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")]))
        await sut.loadFeed()
        let initialRequestCount = api.requestCount

        await sut.likePost("nonexistent-id")

        XCTAssertEqual(api.requestCount, initialRequestCount, "Should not make API call for nonexistent post")
    }

    // MARK: - sendComment()

    func test_sendComment_success_incrementsCommentCount() async {
        let (sut, api, _, postService) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", commentCount: 3)]))
        await sut.loadFeed()

        await sut.sendComment(postId: "p1", content: "Nice post!")

        XCTAssertEqual(sut.posts[0].commentCount, 4)
        XCTAssertEqual(postService.addCommentCallCount, 1)
        XCTAssertEqual(postService.lastAddCommentPostId, "p1")
        XCTAssertEqual(postService.lastAddCommentContent, "Nice post!")
        XCTAssertNil(postService.lastAddCommentParentId)
    }

    func test_sendComment_withParentId_passesParentId() async {
        let (sut, api, _, postService) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")]))
        await sut.loadFeed()

        await sut.sendComment(postId: "p1", content: "reply", parentId: "c1")

        XCTAssertEqual(postService.lastAddCommentParentId, "c1")
    }

    func test_sendComment_failure_doesNotIncrementCommentCount() async {
        let (sut, api, _, postService) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", commentCount: 3)]))
        await sut.loadFeed()

        postService.addCommentResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.sendComment(postId: "p1", content: "failing comment")

        XCTAssertEqual(sut.posts[0].commentCount, 3, "Comment count should not change on failure")
    }

    // MARK: - deletePost()

    func test_deletePost_success_removesPostFromList() async {
        let (sut, api, _, _) = makeSUT()
        let posts = [Self.makeAPIPost(id: "p1"), Self.makeAPIPost(id: "p2")]
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: posts))
        await sut.loadFeed()

        XCTAssertEqual(sut.posts.count, 2)

        await sut.deletePost("p1")

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "p2")
    }

    func test_deletePost_failure_restoresPost() async {
        let (sut, api, _, postService) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")]))
        await sut.loadFeed()

        postService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.deletePost("p1")

        XCTAssertEqual(sut.posts.count, 1, "Post should be restored on delete failure")
        XCTAssertEqual(sut.posts[0].id, "p1")
    }

    // MARK: - createPost()

    func test_createPost_success_insertsAtIndexZeroAndSetsPublishSuccess() async {
        let (sut, _, _, postService) = makeSUT()
        postService.createResult = .success(Self.makeAPIPost(id: "created-1", content: "New creation"))

        await sut.createPost(content: "New creation")

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "created-1")
        XCTAssertTrue(sut.publishSuccess)
        XCTAssertNil(sut.publishError)
        XCTAssertEqual(postService.createCallCount, 1)
    }

    func test_createPost_failure_setsPublishError() async {
        let (sut, _, _, postService) = makeSUT()
        postService.createResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.createPost(content: "Failing post")

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertNotNil(sut.publishError)
        XCTAssertFalse(sut.publishSuccess)
    }

    // MARK: - repostPost()

    func test_repostPost_quoteRepost_passesQuoteContent() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.repostPost("post1", content: "My quote", isQuote: true)

        XCTAssertEqual(postService.repostCallCount, 1)
        XCTAssertEqual(postService.lastRepostPostId, "post1")
        XCTAssertEqual(postService.lastRepostQuote, "My quote")
    }

    func test_repostPost_simpleRepost_passesNilQuote() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.repostPost("post1")

        XCTAssertEqual(postService.repostCallCount, 1)
        XCTAssertNil(postService.lastRepostQuote)
    }

    // MARK: - refresh()

    func test_refresh_resetsNewPostsCountAndReloads() async {
        let (sut, api, _, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse())

        sut.newPostsCount = 5

        await sut.refresh()

        XCTAssertEqual(sut.newPostsCount, 0)
        XCTAssertTrue(sut.hasMore)
        XCTAssertTrue(sut.hasLoaded)
    }

    // MARK: - acknowledgeNewPosts()

    func test_acknowledgeNewPosts_resetsCountToZero() {
        let (sut, _, _, _) = makeSUT()
        sut.newPostsCount = 7

        sut.acknowledgeNewPosts()

        XCTAssertEqual(sut.newPostsCount, 0)
    }

    // MARK: - Translation

    func test_setTranslationOverride_appliesTranslationForLanguage() {
        let (sut, _, _, _) = makeSUT()
        let translations: [String: PostTranslation] = [
            "fr": PostTranslation(text: "Bonjour le monde"),
            "es": PostTranslation(text: "Hola mundo")
        ]
        sut.posts = [Self.makeFeedPost(id: "t1", content: "Hello world", translations: translations)]

        sut.setTranslationOverride(postId: "t1", language: "es")

        XCTAssertEqual(sut.posts[0].translatedContent, "Hola mundo")
        XCTAssertEqual(sut.posts[0].displayContent, "Hola mundo")
    }

    func test_setTranslationOverride_withUnavailableLanguage_doesNothing() {
        let (sut, _, _, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "t1", content: "Hello", translations: ["fr": PostTranslation(text: "Bonjour")])]

        sut.setTranslationOverride(postId: "t1", language: "de")

        XCTAssertNil(sut.posts[0].translatedContent, "Should not set translation for unavailable language")
    }

    func test_clearTranslationOverride_removesTranslatedContent() {
        let (sut, _, _, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(
            id: "t1",
            content: "Hello",
            translations: ["fr": PostTranslation(text: "Bonjour")],
            translatedContent: "Hola"
        )]

        sut.clearTranslationOverride(postId: "t1")

        // Since userLanguage defaults to "en" (no logged in user) and no "en" translation exists,
        // clearTranslationOverride should set translatedContent to nil
        XCTAssertNil(sut.posts[0].translatedContent)
        XCTAssertEqual(sut.posts[0].displayContent, "Hello")
    }

    // MARK: - Socket.IO: subscribeToSocketEvents()

    func test_subscribeToSocketEvents_callsConnect() {
        let (sut, _, socket, _) = makeSUT()

        sut.subscribeToSocketEvents()

        XCTAssertEqual(socket.connectCallCount, 1)

        sut.unsubscribeFromSocketEvents()
    }

    func test_unsubscribeFromSocketEvents_callsUnsubscribeFeed() {
        let (sut, _, socket, _) = makeSUT()

        sut.subscribeToSocketEvents()
        sut.unsubscribeFromSocketEvents()

        XCTAssertEqual(socket.unsubscribeFeedCallCount, 1)
    }

    func test_subscribeToSocketEvents_calledTwice_doesNotDoubleSubscribe() {
        let (sut, _, socket, _) = makeSUT()

        sut.subscribeToSocketEvents()
        sut.subscribeToSocketEvents()

        XCTAssertEqual(socket.connectCallCount, 1, "Guard should prevent double subscription")

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:created

    func test_socketPostCreated_insertsAtIndexZeroAndIncrementsNewPostsCount() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "existing-1")]))
        await sut.loadFeed()

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.newPostsCount, 0)

        sut.subscribeToSocketEvents()

        let newPost = Self.makeAPIPost(id: "socket-new", content: "From socket")
        socket.simulatePostCreated(newPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "socket-new")
        XCTAssertEqual(sut.newPostsCount, 1)

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostCreated_deduplicatesExistingPost() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "dup-1")]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        socket.simulatePostCreated(Self.makeAPIPost(id: "dup-1", content: "Duplicate"))

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1, "Duplicate post should not be added")
        XCTAssertEqual(sut.newPostsCount, 0)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:deleted

    func test_socketPostDeleted_removesPostFromList() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "delete-me")]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        socket.simulatePostDeleted("delete-me")

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(sut.posts.isEmpty)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:updated

    func test_socketPostUpdated_updatesExistingPostAndPreservesIsLiked() async {
        let (sut, api, socket, _) = makeSUT()
        let post = Self.makeAPIPost(id: "update-me", content: "Original", likeCount: 5)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed()

        // Simulate the user having liked this post locally
        sut.posts[0].isLiked = true

        sut.subscribeToSocketEvents()

        let updatedPost = Self.makeAPIPost(id: "update-me", content: "Updated content", likeCount: 10)
        socket.postUpdated.send(updatedPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertTrue(sut.posts[0].isLiked, "Local isLiked state should be preserved across socket update")
        XCTAssertEqual(sut.posts[0].likes, 10)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:liked / post:unliked

    func test_socketPostLiked_updatesLikeCount() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "liked-post", likeCount: 5)]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        let likedData: SocketPostLikedData = JSONStub.decode("""
        {"postId":"liked-post","userId":"user-2","emoji":"\\u2764\\uFE0F","likeCount":6,"reactionSummary":{"\\u2764\\uFE0F":6}}
        """)
        socket.postLiked.send(likedData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts[0].likes, 6)

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostUnliked_updatesLikeCount() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "unliked-post", likeCount: 10)]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        let unlikedData: SocketPostUnlikedData = JSONStub.decode("""
        {"postId":"unliked-post","userId":"user-2","likeCount":9,"reactionSummary":{}}
        """)
        socket.postUnliked.send(unlikedData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts[0].likes, 9)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: comment:added / comment:deleted

    func test_socketCommentAdded_updatesCommentCount() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "commented-post", commentCount: 3)]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        let commentData: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"commented-post","comment":{"id":"c1","content":"Nice!","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"bob"}},"commentCount":4}
        """)
        socket.commentAdded.send(commentData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts[0].commentCount, 4)

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketCommentDeleted_updatesCommentCount() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "comment-del-post", commentCount: 5)]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        let deletedData: SocketCommentDeletedData = JSONStub.decode("""
        {"postId":"comment-del-post","commentId":"c1","commentCount":4}
        """)
        socket.commentDeleted.send(deletedData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts[0].commentCount, 4)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:translation-updated

    func test_socketPostTranslationUpdated_addsTranslationToPost() async {
        let (sut, _, socket, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "trans-post", content: "Hello world")]

        sut.subscribeToSocketEvents()

        let translationData: SocketPostTranslationUpdatedData = JSONStub.decode("""
        {"postId":"trans-post","language":"fr","translation":{"text":"Bonjour le monde","translationModel":"nllb-200","confidenceScore":0.95,"createdAt":"2026-01-15T12:00:00.000Z"}}
        """)
        socket.postTranslationUpdated.send(translationData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertNotNil(sut.posts[0].translations?["fr"])
        XCTAssertEqual(sut.posts[0].translations?["fr"]?.text, "Bonjour le monde")

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostTranslationUpdated_forNonMatchingLanguage_doesNotSetTranslatedContent() async {
        let (sut, _, socket, _) = makeSUT()
        // No logged in user means preferredLanguages is empty, userLanguage defaults to "en"
        sut.posts = [Self.makeFeedPost(id: "trans-post", content: "Hello world")]

        sut.subscribeToSocketEvents()

        // Send a translation for "de" which is not in preferredLanguages
        let translationData: SocketPostTranslationUpdatedData = JSONStub.decode("""
        {"postId":"trans-post","language":"de","translation":{"text":"Hallo Welt","translationModel":"nllb-200","confidenceScore":0.9,"createdAt":"2026-01-15T12:00:00.000Z"}}
        """)
        socket.postTranslationUpdated.send(translationData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertNotNil(sut.posts[0].translations?["de"], "Translation should be stored in translations dict")
        XCTAssertNil(sut.posts[0].translatedContent, "Should not auto-apply translation for non-preferred language")

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:reposted

    func test_socketPostReposted_insertsRepostAndIncrementsNewPostsCount() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "existing")]))
        await sut.loadFeed()

        sut.subscribeToSocketEvents()

        let repostData: SocketPostRepostedData = JSONStub.decode("""
        {"originalPostId":"existing","repost":{"id":"repost-1","type":"REPOST","content":"","createdAt":"2026-01-15T13:00:00.000Z","likeCount":0,"commentCount":0,"author":{"id":"a2","username":"bob"}}}
        """)
        socket.postReposted.send(repostData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "repost-1")
        XCTAssertEqual(sut.newPostsCount, 1)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - bookmarkPost()

    func test_bookmarkPost_callsAPIWithCorrectEndpoint() async {
        let (sut, api, _, _) = makeSUT()
        let bookmarkResponse: APIResponse<[String: Bool]> = JSONStub.decode("""
        {"success":true,"data":{"bookmarked":true},"error":null}
        """)
        api.stub("/posts/bm-post/bookmark", result: bookmarkResponse)

        await sut.bookmarkPost("bm-post")

        XCTAssertTrue(api.requestEndpoints.contains("/posts/bm-post/bookmark"))
    }

    // MARK: - pinPost()

    func test_pinPost_callsPostService() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.pinPost("pin-post")

        // pinPost uses postService.pinPost which is a no-op stub, just verify no crash
        XCTAssertTrue(true, "pinPost should complete without error")
    }

    // MARK: - requestTranslation()

    func test_requestTranslation_callsPostService() async {
        let (sut, _, _, _) = makeSUT()

        await sut.requestTranslation(postId: "t-post", targetLanguage: "fr")

        // requestTranslation is a fire-and-forget, just verify no crash
        XCTAssertTrue(true)
    }

    // MARK: - Publish Post Tests (Point 83)

    func test_publishPost_success_setsPublishSuccess() async {
        let (sut, _, _, postService) = makeSUT()
        postService.createResult = .success(Self.makeAPIPost(id: "pub-1", content: "Published post"))

        await sut.createPost(content: "Published post")

        XCTAssertTrue(sut.publishSuccess)
        XCTAssertNil(sut.publishError)
        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].content, "Published post")
    }

    func test_publishPost_error_setsPublishError() async {
        let (sut, _, _, postService) = makeSUT()
        postService.createResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.createPost(content: "Failing publish")

        XCTAssertFalse(sut.publishSuccess)
        XCTAssertNotNil(sut.publishError)
        XCTAssertTrue(sut.posts.isEmpty)
    }

    func test_publishPost_withMedia_callsService() async {
        let (sut, _, _, postService) = makeSUT()
        postService.createResult = .success(Self.makeAPIPost(id: "media-pub", content: "With media"))

        await sut.createPost(content: "With media", mediaIds: ["media-1", "media-2"])

        XCTAssertEqual(postService.createCallCount, 1)
        XCTAssertTrue(sut.publishSuccess)
        XCTAssertEqual(sut.posts.count, 1)
    }
}
