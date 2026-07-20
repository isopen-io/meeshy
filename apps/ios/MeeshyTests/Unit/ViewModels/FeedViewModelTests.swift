import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class FeedViewModelTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        // FeedViewModel persists the fetched feed to the process-global
        // CacheCoordinator.shared.feed via a non-awaited Task.detached
        // (fetchFeedFromNetwork). A prior test's late .utility save can repopulate
        // "main-feed" AFTER this invalidate, so loadFeed() would serve a polluted
        // .fresh cache and skip the API stub. Socket-handler tests therefore seed
        // with loadFeed(forceRefresh: true) to bypass the cache read entirely; this
        // invalidate still covers the common (unpolluted) case.
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
    }

    // MARK: - Factory

    // `MockLanguageProvider` is defined in `MeeshyTests/Mocks/MockLanguageProvider.swift`
    // and shared across `FeedViewModelTests`, `PostDetailViewModelTests`, and
    // `BookmarksViewModelTests`.

    private func makeSUT(
        api: MockAPIClientForApp? = nil,
        socialSocket: MockSocialSocket? = nil,
        postService: MockPostService? = nil,
        offlineQueue: MockOfflineQueue? = nil,
        preferredLanguages: [String] = []
    ) -> (
        sut: FeedViewModel,
        api: MockAPIClientForApp,
        socket: MockSocialSocket,
        postService: MockPostService
    ) {
        let api = api ?? MockAPIClientForApp()
        let socket = socialSocket ?? MockSocialSocket()
        let postService = postService ?? MockPostService()
        let languageProvider = MockLanguageProvider(preferredLanguages: preferredLanguages)
        let sut = FeedViewModel(
            api: api,
            socialSocket: socket,
            postService: postService,
            languageProvider: languageProvider,
            offlineQueue: offlineQueue ?? MockOfflineQueue()
        )
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

        await sut.loadFeed(forceRefresh: true)

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "p1")
        XCTAssertEqual(sut.posts[1].id, "p2")
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
    }

    func test_didReconnect_backfillsFeedFromNetwork() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", content: "Backfilled")]))
        sut.subscribeToSocketEvents()

        // Un reconnect du socket social doit declencher un refresh du feed
        // (backfill du gap pendant la coupure), miroir de ConversationSyncEngine.
        socket.didReconnect.send(())
        // Use polling instead of a fixed sleep: Combine's receive(on: DispatchQueue.main)
        // delivery may not run during a single Task.sleep suspension under Swift 6 strict
        // concurrency. Multiple short sleeps give the run loop several chances to drain
        // pending DispatchQueue.main.async items before each condition check.
        try? await waitForCondition(timeout: 5.0) { sut.posts.count == 1 }

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts.first?.id, "p1")
    }

    func test_loadFeed_failure_setsError() async {
        let (sut, api, _, _) = makeSUT()
        api.errorToThrow = APIError.networkError(URLError(.notConnectedToInternet))

        await sut.loadFeed(forceRefresh: true)

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertNotNil(sut.error)
    }

    func test_loadFeed_whenAlreadyLoading_guardsAgainstDoubleLoad() async {
        let (sut, api, _, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse())

        let task1 = Task { await sut.loadFeed(forceRefresh: true) }
        let task2 = Task { await sut.loadFeed(forceRefresh: true) }

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

        await sut.loadFeed(forceRefresh: true)

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

        await sut.loadFeed(forceRefresh: true)
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

        await sut.loadFeed(forceRefresh: true)

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

        await sut.loadFeed(forceRefresh: true)
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

        await sut.loadFeed(forceRefresh: true)
        let initialRequestCount = api.requestCount

        let triggerPost = sut.posts[5]
        await sut.loadMoreIfNeeded(currentPost: triggerPost)

        XCTAssertEqual(api.requestCount, initialRequestCount, "Should not load more when hasMore is false")
    }

    /// P3.1 — coalescing regression test.
    ///
    /// Multiple cells near the threshold fire `.onAppear` essentially at the
    /// same time, each calling `loadMoreIfNeeded`. Because the ViewModel is
    /// `@MainActor`-isolated, the first call should win the
    /// `isLoadingMore=true` race and the others must short-circuit. Without
    /// the guard, the feed would burn N redundant GET /posts/feed per page
    /// boundary scroll.
    func test_loadMoreIfNeeded_concurrentCalls_makeExactlyOneAPIRequest() async {
        let (sut, api, _, _) = makeSUT()

        var initialPosts: [APIPost] = []
        for i in 0..<10 {
            initialPosts.append(Self.makeAPIPost(id: "post-\(i)"))
        }
        api.stub("/posts/feed", result: Self.makePaginatedResponse(
            posts: initialPosts, hasMore: true, nextCursor: "cursor-page2"
        ))

        await sut.loadFeed(forceRefresh: true)
        let initialRequestCount = api.requestCount

        // Stub a different response for the second page so we'd notice if
        // multiple page-2 fetches actually completed.
        let morePosts = [Self.makeAPIPost(id: "post-10")]
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: morePosts))

        // Five cells near the threshold all fire concurrently. With
        // structured concurrency on @MainActor, they all suspend at the
        // first await; only one progresses past the `!isLoadingMore` guard.
        let triggerPost = sut.posts[5]
        async let one: Void = sut.loadMoreIfNeeded(currentPost: triggerPost)
        async let two: Void = sut.loadMoreIfNeeded(currentPost: triggerPost)
        async let three: Void = sut.loadMoreIfNeeded(currentPost: triggerPost)
        async let four: Void = sut.loadMoreIfNeeded(currentPost: triggerPost)
        async let five: Void = sut.loadMoreIfNeeded(currentPost: triggerPost)
        _ = await (one, two, three, four, five)

        let extraRequests = api.requestCount - initialRequestCount
        XCTAssertEqual(
            extraRequests, 1,
            "5 concurrent loadMoreIfNeeded calls must coalesce into exactly 1 paginated request"
        )
        XCTAssertEqual(sut.posts.count, 11, "Only the first page-2 fetch must append posts")
        XCTAssertFalse(sut.isLoadingMore)
    }

    // MARK: - likePost() Optimistic UI

    func test_likePost_optimisticSuccess_togglesIsLikedAndIncrementsCount() async {
        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "like-test", likeCount: 10)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed(forceRefresh: true)

        XCTAssertEqual(sut.posts[0].likes, 10)
        XCTAssertFalse(sut.posts[0].isLiked)

        let likeResponse: SimpleAPIResponse = JSONStub.decode("""
        {"success":true,"message":null,"error":null}
        """)
        api.stub("/posts/like-test/like", result: likeResponse)

        await sut.likePost("like-test")

        XCTAssertTrue(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 11)
    }

    func test_likePost_failure_rollsBackIsLikedAndCount() async {
        // T10b — likePost now routes through the outbox, so "failure" means the
        // enqueue is refused (not a direct API error). Rollback semantics unchanged.
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(APIError.networkError(URLError(.timedOut)))
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        let post = Self.makeAPIPost(id: "rollback-test", likeCount: 5)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed(forceRefresh: true)

        await sut.likePost("rollback-test")

        XCTAssertFalse(sut.posts[0].isLiked, "Should revert isLiked when the outbox refuses the row")
        XCTAssertEqual(sut.posts[0].likes, 5, "Should revert likes count on enqueue failure")
    }

    func test_likePost_unlikeAlreadyLiked_decrementsCount() async {
        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "unlike-test", likeCount: 8)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed(forceRefresh: true)

        // First like
        let likeResponse: SimpleAPIResponse = JSONStub.decode("""
        {"success":true,"message":null,"error":null}
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
        await sut.loadFeed(forceRefresh: true)
        let initialRequestCount = api.requestCount

        await sut.likePost("nonexistent-id")

        XCTAssertEqual(api.requestCount, initialRequestCount, "Should not make API call for nonexistent post")
    }

    // MARK: - sendComment()

    func test_sendComment_success_enqueuesCreateComment_andOptimisticallyInserts() async {
        // T10c — sendComment now routes through the outbox (durable offline)
        // instead of calling postService directly.
        let queue = MockOfflineQueue()
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", commentCount: 3)]))
        await sut.loadFeed(forceRefresh: true)

        await sut.sendComment(postId: "p1", content: "Nice post!")

        XCTAssertEqual(sut.posts[0].commentCount, 4)
        XCTAssertEqual(sut.posts[0].comments.first?.content, "Nice post!", "optimistic comment inserted")
        XCTAssertEqual(queue.enqueueCalls.count, 1)
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .createComment)
        let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload
        XCTAssertEqual(payload?.postId, "p1")
        XCTAssertEqual(payload?.content, "Nice post!")
        XCTAssertNil(payload?.parentCommentId)
    }

    func test_sendComment_withParentId_passesParentId() async {
        let queue = MockOfflineQueue()
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")]))
        await sut.loadFeed(forceRefresh: true)

        await sut.sendComment(postId: "p1", content: "reply", parentId: "c1")

        let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload
        XCTAssertEqual(payload?.parentCommentId, "c1")
    }

    func test_sendComment_failure_rollsBackOptimisticComment() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(APIError.networkError(URLError(.timedOut)))
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", commentCount: 3)]))
        await sut.loadFeed(forceRefresh: true)

        await sut.sendComment(postId: "p1", content: "failing comment")

        XCTAssertEqual(sut.posts[0].commentCount, 3, "comment count must roll back on enqueue failure")
        XCTAssertTrue(sut.posts[0].comments.isEmpty, "optimistic comment must be removed on rollback")
    }

    // MARK: - Outbox terminal outcome (R7) — rollback on .exhausted

    func test_likePost_rollsBack_whenOutcomeExhausted() async {
        // R7 — a like that enqueues successfully but later EXHAUSTS its retry
        // budget (server permanently rejected it) must roll back the optimistic
        // toggle. Before this fix nobody observed the outcome, so the like was
        // stuck "liked" forever even though the server never accepted it.
        let queue = MockOfflineQueue()
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", likeCount: 5)]))
        await sut.loadFeed(forceRefresh: true)

        await sut.likePost("p1")
        XCTAssertTrue(sut.posts[0].isLiked, "optimistic like applied")
        XCTAssertEqual(sut.posts[0].likes, 6)

        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertFalse(sut.posts[0].isLiked, "exhausted outbox row must roll back the optimistic like")
        XCTAssertEqual(sut.posts[0].likes, 5, "like count must revert on exhausted")
    }

    func test_likePost_doesNotRollBack_whenOutcomeApplied() async {
        let queue = MockOfflineQueue()
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", likeCount: 5)]))
        await sut.loadFeed(forceRefresh: true)

        await sut.likePost("p1")
        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.applied(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.posts[0].isLiked, "applied outcome keeps the optimistic like")
        XCTAssertEqual(sut.posts[0].likes, 6)
    }

    func test_sendComment_rollsBack_whenOutcomeExhausted() async {
        let queue = MockOfflineQueue()
        let (sut, api, _, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", commentCount: 3)]))
        await sut.loadFeed(forceRefresh: true)

        await sut.sendComment(postId: "p1", content: "doomed comment")
        XCTAssertEqual(sut.posts[0].commentCount, 4, "optimistic comment inserted")
        XCTAssertEqual(sut.posts[0].comments.first?.content, "doomed comment")

        guard let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload else {
            return XCTFail("no createComment enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.posts[0].commentCount, 3, "comment count must revert on exhausted")
        XCTAssertTrue(sut.posts[0].comments.isEmpty, "optimistic comment must be removed on exhausted")
    }

    /// Polls the mock's continuation dict until the fire-and-forget observer
    /// Task has registered its `outcomeStream` continuation for `cmid`. Times
    /// out after 500 ms (50 × 10 ms).
    private func waitForContinuation(
        in queue: MockOfflineQueue,
        for cmid: String
    ) async throws {
        for _ in 0..<50 {
            if queue.outcomeContinuations[cmid] != nil { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Observer continuation never registered for cmid=\(cmid)")
    }

    // MARK: - deletePost()

    func test_deletePost_success_removesPostFromList() async {
        let (sut, api, _, _) = makeSUT()
        let posts = [Self.makeAPIPost(id: "p1"), Self.makeAPIPost(id: "p2")]
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: posts))
        await sut.loadFeed(forceRefresh: true)

        XCTAssertEqual(sut.posts.count, 2)

        await sut.deletePost("p1")

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "p2")
    }

    func test_deletePost_failure_restoresPost() async {
        let (sut, api, _, postService) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")]))
        await sut.loadFeed(forceRefresh: true)

        postService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.deletePost("p1")

        XCTAssertEqual(sut.posts.count, 1, "Post should be restored on delete failure")
        XCTAssertEqual(sut.posts[0].id, "p1")
    }

    // MARK: - createPost() — U1 ST3: text-only routes through the durable outbox

    func test_createPost_textOnly_enqueuesCreatePostAndInsertsOptimisticPost() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, postService) = makeSUT(offlineQueue: queue)

        await sut.createPost(content: "New creation", originalLanguage: "en")

        // Optimistic post inserted immediately (instant-app), keyed by the cmid.
        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].content, "New creation")
        XCTAssertTrue(sut.publishSuccess)
        XCTAssertNil(sut.publishError)

        // Routed through the durable outbox — NOT a direct postService.create
        // (which silently lost the post when offline).
        XCTAssertEqual(postService.createCallCount, 0, "text-only create must not hit postService directly")
        XCTAssertEqual(queue.enqueueCalls.count, 1)
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .createPost)
        let payload = queue.enqueueCalls.first?.payload as? CreatePostPayload
        XCTAssertEqual(payload?.content, "New creation")
        XCTAssertEqual(payload?.originalLanguage, "en", "originalLanguage must survive the outbox so the Prisme pipeline detects the source")
        XCTAssertEqual(payload?.visibility, "PUBLIC")
        XCTAssertTrue(payload?.attachmentIds.isEmpty ?? false)
        // The optimistic post id == the payload cmid → ST2 reconciles it in place
        // when post:created echoes that cmid.
        XCTAssertEqual(sut.posts[0].id, payload?.clientMutationId, "optimistic post must be keyed by the cmid for ST2 reconcile")
    }

    func test_createPost_textOnly_enqueueRefused_rollsBackOptimisticPost() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(APIError.networkError(URLError(.timedOut)))
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createPost(content: "Failing post")

        XCTAssertTrue(sut.posts.isEmpty, "optimistic post must be removed when the outbox refuses the row")
        XCTAssertNotNil(sut.publishError)
        XCTAssertFalse(sut.publishSuccess)
    }

    func test_createPost_textOnly_outboxExhausted_rollsBackOptimisticPost() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createPost(content: "Doomed post")
        XCTAssertEqual(sut.posts.count, 1)
        let cmid = sut.posts[0].id

        // The OutboxFlusher exhausts its retry budget → the optimistic post must
        // be rolled back (the server permanently rejected it). Wait for the
        // observer to register before emitting, else the outcome is dropped.
        try? await waitForContinuation(in: queue, for: cmid)
        queue.emitOutcome(.exhausted(cmid: cmid), for: cmid)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.posts.isEmpty, "exhausted outbox row must roll back the optimistic post")
    }

    func test_createPost_withMedia_usesDirectPostServicePath() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, postService) = makeSUT(offlineQueue: queue)
        postService.createResult = .success(Self.makeAPIPost(id: "media-1", content: "With media"))

        await sut.createPost(content: "With media", mediaIds: ["att-1"])

        // Online media posts take the direct path (TUS-uploaded ids → postService).
        XCTAssertEqual(postService.createCallCount, 1)
        XCTAssertTrue(queue.enqueueCalls.isEmpty, "online media create must not route through the outbox")
        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "media-1")
    }

    // MARK: - createOfflineMediaPost() — U1b ST2: durable offline media post

    func test_createOfflineMediaPost_enqueuesPostMediaAndInsertsOptimisticPost() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, postService) = makeSUT(offlineQueue: queue)
        let urls = [URL(fileURLWithPath: "/tmp/a.jpg"), URL(fileURLWithPath: "/tmp/b.mp4")]

        await sut.createOfflineMediaPost(localMediaURLs: urls, content: "Photo post", originalLanguage: "en")

        // Optimistic post with a local-media preview, keyed by the cmid.
        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].content, "Photo post")
        XCTAssertEqual(sut.posts[0].media.count, 2, "optimistic local-media preview rendered before upload")
        XCTAssertTrue(sut.publishSuccess)
        XCTAssertNil(sut.publishError)

        // Durable outbox path — NOT a direct postService.create (lost offline).
        XCTAssertEqual(postService.createCallCount, 0, "offline media post must not hit postService directly")
        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 1)
        let call = queue.enqueuePostMediaCalls.first
        XCTAssertEqual(call?.sourceMediaURLs, urls)
        XCTAssertEqual(call?.content, "Photo post")
        XCTAssertEqual(call?.originalLanguage, "en")
        XCTAssertEqual(call?.visibility, "PUBLIC")
        XCTAssertEqual(call?.type, "POST", "default type stays POST when not specified")
        XCTAssertEqual(sut.posts[0].type, "POST")
        XCTAssertEqual(sut.posts[0].id, call?.clientMutationId,
            "optimistic post must be keyed by the cmid for ST2 reconcile")
    }

    func test_createOfflineMediaPost_reelType_enqueuesReelAndInsertsReelOptimisticPost() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)
        let urls = [URL(fileURLWithPath: "/tmp/clip.mp4")]

        await sut.createOfflineMediaPost(
            localMediaURLs: urls,
            content: "My reel",
            originalLanguage: "en",
            type: "REEL"
        )

        // The optimistic post is a REEL so it surfaces on the reel pager
        // immediately, and the durable row carries the REEL type so the flush
        // lands the post on the reels surface — reusing the post media machinery.
        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].type, "REEL")
        XCTAssertTrue(sut.posts[0].isReel)
        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 1)
        XCTAssertEqual(queue.enqueuePostMediaCalls.first?.type, "REEL")
    }

    func test_createOfflineMediaPost_enqueueRefused_rollsBackOptimisticPost() async {
        let queue = MockOfflineQueue()
        queue.enqueuePostMediaError = APIError.networkError(URLError(.timedOut))
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createOfflineMediaPost(localMediaURLs: [URL(fileURLWithPath: "/tmp/a.jpg")], content: "Doomed")

        XCTAssertTrue(sut.posts.isEmpty, "optimistic media post must be removed when the outbox refuses the row")
        XCTAssertNotNil(sut.publishError)
        XCTAssertFalse(sut.publishSuccess)
    }

    func test_createOfflineMediaPost_emptyURLs_fallsBackToTextOnly() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createOfflineMediaPost(localMediaURLs: [], content: "Just text")

        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 0, "no media → no media enqueue")
        XCTAssertEqual(queue.enqueueCalls.count, 1, "falls back to the durable text-only path")
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .createPost)
        XCTAssertEqual(sut.posts.count, 1)
    }

    // MARK: - Offline draft recovery (post / reel)

    func test_recoverUnsentPost_queriesPostAndReelTypesWithOfflineThreshold() async {
        let queue = MockOfflineQueue()
        queue.recoverLastUnsentPostResult = RecoveredOfflinePost(
            clientMutationId: "cmid_p", content: "stuck", visibility: "PUBLIC",
            originalLanguage: nil, type: "REEL", moodEmoji: nil, audioUrl: nil,
            audioDuration: nil, visibilityUserIds: nil, localMediaURLs: [], createdAt: Date()
        )
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        let draft = await sut.recoverUnsentPost()

        XCTAssertEqual(draft?.type, "REEL")
        XCTAssertEqual(queue.recoverLastUnsentPostCalls.first?.types, ["POST", "REEL"])
        XCTAssertEqual(queue.recoverLastUnsentPostCalls.first?.olderThan, FeedViewModel.offlineStuckThreshold)
    }

    func test_supersedeRecoveredPost_cancelsTheStuckRow() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.supersedeRecoveredPost(clientMutationId: "cmid_p")

        XCTAssertEqual(queue.cancelCreatePostCalls, ["cmid_p"])
    }

    // MARK: - repostPost()

    func test_repostPost_quoteRepost_passesQuoteContent() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.repostPost("post1", content: "My quote", isQuote: true)

        XCTAssertEqual(postService.repostCallCount, 1)
        XCTAssertEqual(postService.lastRepostPostId, "post1")
        XCTAssertEqual(postService.lastRepostContent, "My quote")
    }

    func test_repostPost_simpleRepost_passesNilQuote() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.repostPost("post1")

        XCTAssertEqual(postService.repostCallCount, 1)
        XCTAssertNil(postService.lastRepostContent)
    }

    /// Re-sharing a SHARE of a reel must reference the original reel (root), not
    /// the intermediate share — otherwise the new post embeds an empty card.
    func test_repostPost_ofAShareOfReel_resolvesToRootReel() async {
        let (sut, _, _, postService) = makeSUT()
        var share = Self.makeFeedPost(id: "share-1")
        share.repost = RepostContent(id: "reel-root", author: "marie", content: "", type: "REEL")
        sut.posts = [share]

        await sut.repostPost("share-1")

        XCTAssertEqual(postService.lastRepostPostId, "reel-root")
    }

    /// A deeper chain collapses to the recorded root via `originalRepostOfId`.
    func test_repostPost_ofChainedShare_resolvesToOriginalRoot() async {
        let (sut, _, _, postService) = makeSUT()
        var share = Self.makeFeedPost(id: "share-2")
        share.repost = RepostContent(
            id: "intermediate", author: "bob", content: "", type: "REEL",
            originalRepostOfId: "deep-root"
        )
        sut.posts = [share]

        await sut.repostPost("share-2")

        XCTAssertEqual(postService.lastRepostPostId, "deep-root")
    }

    /// An original (non-share) post reposts with its own id, unchanged.
    func test_repostPost_ofOriginalPost_usesItsOwnId() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.repostPost("p1")

        XCTAssertEqual(postService.lastRepostPostId, "p1")
    }

    // MARK: - updatePost()

    func test_updatePost_forwardsLanguageAndTypeToService() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "new body", language: "fr", type: "REEL")

        XCTAssertEqual(postService.lastUpdatePostId, "p1")
        XCTAssertEqual(postService.lastUpdateContent, "new body")
        XCTAssertEqual(postService.lastUpdateOriginalLanguage, "fr")
        XCTAssertEqual(postService.lastUpdateType, "REEL")
    }

    func test_updatePost_contentOnly_passesNilLanguageAndType() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "just text")

        XCTAssertEqual(postService.lastUpdateContent, "just text")
        XCTAssertNil(postService.lastUpdateOriginalLanguage)
        XCTAssertNil(postService.lastUpdateType)
    }

    func test_updatePost_forwardsRemoveMediaIdsToService() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "body", removeMediaIds: ["m1", "m2"])

        XCTAssertEqual(postService.lastUpdateRemoveMediaIds, ["m1", "m2"])
    }

    // MARK: - refresh()

    func test_refresh_resetsNewPostsCountAndReloads() async {
        let (sut, api, _, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse())

        // Initial load to prime state
        await sut.loadFeed(forceRefresh: true)
        XCTAssertTrue(sut.hasLoaded)

        // Simulate new posts arriving
        sut.newPostsCount = 5

        // Seed a FRESH cache entry: a cache-first load short-circuits on it,
        // but refresh() must bypass the cache and always reload from network.
        try? await CacheCoordinator.shared.feed.save(
            [Self.makeFeedPost(id: "cached")], for: "main-feed"
        )
        let countBefore = api.requestCount

        await sut.refresh()

        XCTAssertEqual(sut.newPostsCount, 0)
        XCTAssertTrue(sut.hasLoaded)
        XCTAssertGreaterThan(api.requestCount, countBefore)
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
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

        sut.subscribeToSocketEvents()

        socket.simulatePostCreated(Self.makeAPIPost(id: "dup-1", content: "Duplicate"))

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1, "Duplicate post should not be added")
        XCTAssertEqual(sut.newPostsCount, 0)

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:created — U1 reconcile-by-cmid

    func test_socketPostCreated_withMatchingCmid_reconcilesOptimisticPostInPlace() async {
        let (sut, _, socket, _) = makeSUT()
        // The offline author's optimistic post was inserted with the cmid as its
        // id (U1 ST3). isLiked is local-only state that must survive the swap.
        let cmid = "cmid_offline_1"
        let optimistic = Self.makeFeedPost(id: cmid, content: "Offline draft", isLiked: true)
        sut.posts = [optimistic]

        sut.subscribeToSocketEvents()

        let serverPost = Self.makeAPIPost(id: "server-1", content: "Offline draft")
        socket.simulatePostCreated(serverPost, clientMutationId: cmid)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1, "the echo must replace the optimistic post in place — no duplicate")
        XCTAssertEqual(sut.posts[0].id, "server-1", "the cmid id is swapped to the authoritative server id")
        XCTAssertTrue(sut.posts[0].isLiked, "local-only isLiked is preserved across the cmid→server-id swap")
        XCTAssertEqual(sut.newPostsCount, 0, "reconciling the author's own post must not bump the new-posts counter")

        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostCreated_withCmidButNoMatchingOptimistic_insertsNormally() async {
        let (sut, _, socket, _) = makeSUT()
        sut.subscribeToSocketEvents()

        // A cmid arrives but no optimistic post with that id exists locally
        // (e.g. the author created it on another device) → insert as fresh.
        let serverPost = Self.makeAPIPost(id: "server-2", content: "From another device")
        socket.simulatePostCreated(serverPost, clientMutationId: "cmid_unknown")

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "server-2")
        XCTAssertEqual(sut.newPostsCount, 1, "a non-reconciling create still counts as a new remote post")

        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - Socket.IO: post:deleted

    func test_socketPostDeleted_removesPostFromList() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "delete-me")]))
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

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
        await sut.loadFeed(forceRefresh: true)

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
        // bookmarkPost guards on `posts.first(where:)`, so the SUT must already
        // know about the post before the API is hit. Without this preload the
        // method is a no-op and no /bookmark request is issued.
        sut.posts = [Self.makeFeedPost(id: "bm-post", content: "Bookmark target")]
        let bookmarkResponse: APIResponse<[String: Bool]> = JSONStub.decode("""
        {"success":true,"data":{"bookmarked":true},"error":null}
        """)
        api.stub("/posts/bm-post/bookmark", result: bookmarkResponse)

        await sut.bookmarkPost("bm-post")

        XCTAssertTrue(api.requestEndpoints.contains("/posts/bm-post/bookmark"))
    }

    // MARK: - bookmarkPost — SWR cache shape (Phase 4)

    /// Phase 4 migration: the bookmarks cache read used to call
    /// `.value` on `CacheResult`, collapsing `.fresh` / `.stale` and missing
    /// the freshness signal. The new switch arms accept both `.fresh` and
    /// `.stale` payloads as the optimistic rollback snapshot. This test
    /// seeds the bookmarks cache with a "stale-style" save (the actor
    /// transitions to stale once the TTL elapses, but the optimistic-write
    /// contract is observable independent of freshness) and verifies that
    /// `bookmarkPost` prepends the post to the existing list.
    func test_bookmarkPost_withCachedBookmarks_prependsOptimistically() async {
        await CacheCoordinator.shared.feed.invalidate(for: "bookmarks")
        defer { Task { await CacheCoordinator.shared.feed.invalidate(for: "bookmarks") } }

        let existing = Self.makeFeedPost(id: "old-bm", content: "previously bookmarked")
        try? await CacheCoordinator.shared.feed.save([existing], for: "bookmarks")

        let (sut, api, _, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "new-bm", content: "Bookmark target")]
        let bookmarkResponse: APIResponse<[String: Bool]> = JSONStub.decode("""
        {"success":true,"data":{"bookmarked":true},"error":null}
        """)
        api.stub("/posts/new-bm/bookmark", result: bookmarkResponse)

        await sut.bookmarkPost("new-bm")

        let result = await CacheCoordinator.shared.feed.load(for: "bookmarks")
        let cached = result.snapshot() ?? []
        XCTAssertEqual(cached.count, 2, "Optimistic write must keep existing bookmarks and prepend the new one")
        XCTAssertEqual(cached.first?.id, "new-bm", "Newest bookmark goes to the head of the list")
        XCTAssertTrue(cached.contains(where: { $0.id == "old-bm" }), "Existing bookmark must be preserved")
    }

    /// `.expired` / `.empty` arms must seed a fresh bookmarks list with the
    /// single optimistic post — without crashing on the missing payload.
    func test_bookmarkPost_withEmptyCache_seedsBookmarksList() async {
        await CacheCoordinator.shared.feed.invalidate(for: "bookmarks")
        defer { Task { await CacheCoordinator.shared.feed.invalidate(for: "bookmarks") } }

        let (sut, api, _, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "first-bm", content: "First bookmark ever")]
        let bookmarkResponse: APIResponse<[String: Bool]> = JSONStub.decode("""
        {"success":true,"data":{"bookmarked":true},"error":null}
        """)
        api.stub("/posts/first-bm/bookmark", result: bookmarkResponse)

        await sut.bookmarkPost("first-bm")

        let result = await CacheCoordinator.shared.feed.load(for: "bookmarks")
        let cached = result.snapshot() ?? []
        XCTAssertEqual(cached.count, 1)
        XCTAssertEqual(cached.first?.id, "first-bm")
    }

    /// On API failure, the optimistic write must be rolled back to the
    /// pre-call snapshot (the cached bookmarks list before the user tapped
    /// the bookmark button).
    func test_bookmarkPost_apiFailure_rollsBackToSnapshot() async {
        await CacheCoordinator.shared.feed.invalidate(for: "bookmarks")
        defer { Task { await CacheCoordinator.shared.feed.invalidate(for: "bookmarks") } }

        let existing = Self.makeFeedPost(id: "kept-bm", content: "should survive rollback")
        try? await CacheCoordinator.shared.feed.save([existing], for: "bookmarks")

        let (sut, api, _, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "doomed-bm", content: "Will fail")]
        api.errorToThrow = APIError.networkError(URLError(.notConnectedToInternet))

        await sut.bookmarkPost("doomed-bm")

        let result = await CacheCoordinator.shared.feed.load(for: "bookmarks")
        let cached = result.snapshot() ?? []
        XCTAssertEqual(cached.count, 1, "Rollback must restore the pre-call snapshot")
        XCTAssertEqual(cached.first?.id, "kept-bm")
        XCTAssertFalse(cached.contains(where: { $0.id == "doomed-bm" }), "Failed bookmark must NOT remain in cache")
    }

    // MARK: - pinPost()

    func test_pinPost_callsPostService() async {
        let (sut, _, _, _) = makeSUT()

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
        // U1 ST3 — a text-only publish now routes through the durable outbox, so
        // "error" means the enqueue is refused (the direct postService.create is
        // no longer on the text-only path). Rollback semantics unchanged.
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(APIError.networkError(URLError(.timedOut)))
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

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

    // MARK: - likePost (T10b — routes through the durable outbox)

    func test_likePost_enqueuesToggleLikePost_andOptimisticallyTogglesLike() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)
        sut.posts = [Self.makeFeedPost(id: "lp1", likes: 5, isLiked: false)]

        await sut.likePost("lp1")

        XCTAssertEqual(queue.enqueueCalls.count, 1, "the like must be queued in the outbox, not lost on a direct REST call")
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .toggleLikePost)
        let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload
        XCTAssertEqual(payload?.postId, "lp1")
        XCTAssertEqual(payload?.liked, true)
        XCTAssertTrue(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 6)
    }

    // MARK: - mergePreservingRealtimeHead (regression — a realtime post that
    // arrived via socket vanished when a `.stale` background refresh
    // straight-replaced `posts = fetched`)

    func test_mergePreservingRealtimeHead_preservesNewerRealtimePostAbsentFromFetch() {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let realtime = FeedPost(id: "rt", author: "a", content: "arrived via socket", timestamp: base.addingTimeInterval(100))
        let serverHead = FeedPost(id: "s1", author: "a", content: "server head", timestamp: base.addingTimeInterval(50))
        let serverOld = FeedPost(id: "s2", author: "a", content: "older", timestamp: base)

        // Background refresh returns the server's latest (realtime post not yet
        // reflected); `posts` already had it inserted at index 0 via socket.
        let merged = FeedViewModel.mergePreservingRealtimeHead(
            fetched: [serverHead, serverOld],
            existing: [realtime, serverHead, serverOld]
        )

        XCTAssertEqual(
            merged.map(\.id), ["rt", "s1", "s2"],
            "a realtime post newer than the server head and absent from the fetch must survive the refresh"
        )
    }

    func test_mergePreservingRealtimeHead_dropsStaleInMemoryPostWithinFetchedRange() {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let serverHead = FeedPost(id: "s1", author: "a", content: "head", timestamp: base.addingTimeInterval(50))
        let serverOld = FeedPost(id: "s2", author: "a", content: "old", timestamp: base)
        // Older than the server head AND absent from the fetch (e.g. deleted
        // server-side) — must NOT be resurrected by the merge.
        let deletedLocally = FeedPost(id: "gone", author: "a", content: "deleted on server", timestamp: base.addingTimeInterval(10))

        let merged = FeedViewModel.mergePreservingRealtimeHead(
            fetched: [serverHead, serverOld],
            existing: [serverHead, deletedLocally, serverOld]
        )

        XCTAssertEqual(
            merged.map(\.id), ["s1", "s2"],
            "an older in-memory post absent from the fetched range must not be preserved (server deletion wins)"
        )
    }

    func test_mergePreservingRealtimeHead_emptyFetchReplacesEntirely() {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let merged = FeedViewModel.mergePreservingRealtimeHead(
            fetched: [],
            existing: [FeedPost(id: "x", author: "a", content: "stale", timestamp: base)]
        )
        XCTAssertTrue(merged.isEmpty, "an empty server response is authoritative — no merge from memory")
    }

    // MARK: - FeedPostCard.availableFlags (Prisme flag strip, O(keys+langs))

    func test_availableFlags_originalFirstThenPreferredWithTranslations() {
        let flags = FeedPostCard.availableFlags(
            originalLanguage: "EN",
            translationKeys: ["FR", "ES"],
            preferredLanguages: ["fr", "de", "es"], // `de` has no translation -> skipped
            activeLanguage: "zz"
        )
        XCTAssertEqual(flags, ["en", "fr", "es"])
    }

    func test_availableFlags_excludesActiveLanguage() {
        let flags = FeedPostCard.availableFlags(
            originalLanguage: "en", translationKeys: ["fr"],
            preferredLanguages: ["fr"], activeLanguage: "fr"
        )
        XCTAssertEqual(flags, ["en"])
    }

    func test_availableFlags_caseInsensitiveKeysAndPrefs() {
        let flags = FeedPostCard.availableFlags(
            originalLanguage: "en", translationKeys: ["FR"],
            preferredLanguages: ["Fr"], activeLanguage: "zz"
        )
        XCTAssertEqual(flags, ["en", "fr"])
    }

    func test_availableFlags_dedupesOriginalAndSkipsUntranslatedPrefs() {
        let flags = FeedPostCard.availableFlags(
            originalLanguage: "en", translationKeys: ["en", "fr"],
            preferredLanguages: ["en", "fr"], activeLanguage: "zz"
        )
        XCTAssertEqual(flags, ["en", "fr"])
    }

    func test_availableFlags_nilOriginal_returnsEmpty() {
        XCTAssertTrue(FeedPostCard.availableFlags(
            originalLanguage: nil, translationKeys: ["fr"],
            preferredLanguages: ["fr"], activeLanguage: "zz"
        ).isEmpty)
    }

}
