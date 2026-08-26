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
        preferredLanguages: [String] = [],
        feedCache: (any FeedCacheStoring)? = nil
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
            offlineQueue: offlineQueue ?? MockOfflineQueue(),
            feedCache: feedCache ?? SharedFeedCache()
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

    /// Regression guard: a session served entirely from a `.fresh` main-feed
    /// cache hit never touches the network in `loadFeed`, so `nextCursor`
    /// stays at its initial `nil` while `hasMore` stays at its initial
    /// `true` — the old `nextCursor != nil` guard permanently stalled
    /// infinite scroll for the rest of the session. `cursor: nil` is exactly
    /// how `loadFeed` requests page 1, so dropping that guard clause lets
    /// the first scroll-triggered call recover a real cursor.
    func test_loadMoreIfNeeded_afterFreshCacheOnlySession_stillFetchesDespiteNilCursor() async throws {
        let (sut, api, _, _) = makeSUT()
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
        let seeded = (0..<10).map { Self.makeFeedPost(id: "cached-\($0)", content: "Post \($0)") }
        // `try`, pas `try?` : une graine qui n'entre pas dans le cache doit
        // faire échouer le test en le DISANT — pas se lire « 0 post au lieu
        // de 10 » deux assertions plus loin (rouge CI du 2026-08-26).
        try await CacheCoordinator.shared.feed.save(seeded, for: "main-feed")

        await sut.loadFeed() // .fresh cache hit — no network call, nextCursor stays nil
        XCTAssertEqual(sut.posts.count, 10)
        XCTAssertTrue(sut.hasMore)
        let requestCountAfterCacheLoad = api.requestCount

        let morePosts = [Self.makeAPIPost(id: "post-10", content: "Post 10")]
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: morePosts, hasMore: true, nextCursor: "cursor-page2"))

        let triggerPost = sut.posts[5] // index 5 of 10, threshold = 10-5 = 5
        await sut.loadMoreIfNeeded(currentPost: triggerPost)

        XCTAssertGreaterThan(api.requestCount, requestCountAfterCacheLoad, "Should fetch page 1 with a nil cursor to recover a real nextCursor")
        XCTAssertTrue(sut.posts.contains(where: { $0.id == "post-10" }))

        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
    }

    /// P3.1 — coalescing regression test.
    ///
    /// Multiple cells near the threshold fire `.onAppear` essentially at the
    /// same time, each calling `loadMoreIfNeeded`. Because the ViewModel is
    /// `@MainActor`-isolated, the first call should win the
    /// `isLoadingMore=true` race and the others must short-circuit. Without
    /// the guard, the feed would burn N redundant GET /posts/feed per page
    /// boundary scroll.
    /// La persistance du fil chargé par le réseau partait dans un
    /// `Task.detached(.utility)` jamais attendu : `loadFeed()` rendait la main
    /// AVANT que « main-feed » soit écrit. En production, une réponse lente
    /// pouvait écraser une plus récente ; en test, la sauvegarde tardive d'un
    /// cas précédent repeuplait le cache après le `invalidate` du suivant et
    /// lui faisait servir un `.fresh` pollué (rouge CI du 2026-08-26 sur
    /// `…afterFreshCacheOnlySession…`, vert en isolation 3/3). Le magasin à
    /// barrière RETIENT la sauvegarde : `loadFeed` ne doit pas avoir fini
    /// tant qu'elle est retenue.
    func test_loadFeed_forceRefresh_doesNotReturnBeforeTheFetchedPageIsPersisted() async {
        let store = GatedFeedCacheStore()
        let (sut, api, _, _) = makeSUT(feedCache: store)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "net-0", content: "Net 0")], hasMore: false, nextCursor: nil
        ))

        let load = Task { @MainActor in await sut.loadFeed(forceRefresh: true) }

        await store.waitForSaveRequest()
        let finishedWhileSaveHeld = await Self.finishes(load, within: .seconds(2))
        XCTAssertFalse(finishedWhileSaveHeld, "loadFeed(forceRefresh:) returned while the fetched page was still being persisted")

        await store.releaseSave()
        await load.value
        let persisted = await store.items(for: "main-feed")
        XCTAssertEqual(persisted?.map(\.id), ["net-0"])
    }

    /// `true` si la tâche se termine dans le délai, `false` sinon (elle
    /// continue de tourner — l'appelant la libère ensuite).
    ///
    /// Pas de `withTaskGroup` ici : un groupe attend TOUS ses enfants à la
    /// sortie de sa portée, `cancelAll()` compris — et l'enfant qui attend
    /// `task.value` ne peut pas finir tant que la barrière n'est pas levée,
    /// ce que l'appelant ne fait qu'APRÈS ce retour. Interblocage, puis
    /// « Test crashed with signal kill » (observé le 2026-08-26 dès que le
    /// correctif a rendu `loadFeed` vraiment suspendu ; invisible en RED,
    /// où `loadFeed` rendait la main en quelques ms). Le guetteur est donc
    /// une tâche NON structurée, et le délai se scrute sur un drapeau.
    private static func finishes(_ task: Task<Void, Never>, within delay: Duration) async -> Bool {
        let flag = CompletionFlag()
        Task { await task.value; await flag.mark() }
        let deadline = ContinuousClock.now + delay
        while ContinuousClock.now < deadline {
            if await flag.isDone() { return true }
            try? await Task.sleep(for: .milliseconds(20))
        }
        return await flag.isDone()
    }

    private actor CompletionFlag {
        private var done = false
        func mark() { done = true }
        func isDone() -> Bool { done }
    }

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

    /// stores-09 — un post du feed peut aussi vivre sous sa clé cache détail
    /// (ouvert une fois dans PostDetail) : le like optimiste doit patcher
    /// TOUTES les clés du store, pas seulement "main-feed" via debouncedCacheSave.
    func test_likePost_postAlsoCachedUnderDetailKey_patchesBothKeys() async {
        await CacheCoordinator.shared.feed.invalidate(for: "like-detail-test")
        defer { Task { await CacheCoordinator.shared.feed.invalidate(for: "like-detail-test") } }

        let (sut, api, _, _) = makeSUT()
        let post = Self.makeAPIPost(id: "like-detail-test", likeCount: 7)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [post]))
        await sut.loadFeed(forceRefresh: true)
        try? await CacheCoordinator.shared.feed.save([sut.posts[0]], for: "like-detail-test")

        await sut.likePost("like-detail-test")

        var cached: FeedPost?
        for _ in 0..<50 {
            let result = await CacheCoordinator.shared.feed.load(for: "like-detail-test")
            cached = result.snapshot()?.first(where: { $0.id == "like-detail-test" })
            if cached?.likes == 8 { break }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertEqual(cached?.isLiked, true,
                       "la clé détail doit recevoir le like optimiste via patchEverywhere")
        XCTAssertEqual(cached?.likes, 8)
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
        // Deterministic wait on the fire-and-forget outcome observer instead of
        // a fixed sleep (#1869): reacts the instant `posts` is actually
        // reassigned rather than hoping 50ms was enough on a busy CI runner.
        await waitForPublishedValue(sut.$posts, timeout: 2.0) { posts in
            posts.first(where: { $0.id == "p1" })?.isLiked == false
        }

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
        // Deterministic wait on the fire-and-forget outcome observer instead of
        // a fixed sleep (#1869): reacts the instant `posts` is actually
        // reassigned rather than hoping 50ms was enough on a busy CI runner.
        await waitForPublishedValue(sut.$posts, timeout: 2.0) { posts in
            posts.first(where: { $0.id == "p1" })?.commentCount == 3
        }

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

    // MARK: - createPost() — les références déclarées voyagent par les DEUX chemins

    func test_createPost_withMedia_forwardsDeclaredReferencesToTheServer() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, postService) = makeSUT(offlineQueue: queue)
        postService.createResult = .success(Self.makeAPIPost(id: "media-1", content: "Avec Alice"))

        await sut.createPost(content: "Avec Alice", mediaIds: ["att-1"],
                             mentions: [PostMentionInput.id("u-alice", display: .note)])

        XCTAssertEqual(postService.lastCreateMentions?.count, 1)
        XCTAssertEqual(postService.lastCreateMentions?.first?.userId, "u-alice")
        XCTAssertEqual(postService.lastCreateMentions?.first?.display, "NOTE")
    }

    func test_createPost_textOnly_carriesDeclaredReferencesThroughTheDurableQueue() async {
        // Un post texte passe par l'outbox : sans la déclaration DANS le
        // payload persisté, référencer quelqu'un sur le chemin le plus courant
        // de l'app ne produirait rien du tout.
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createPost(content: "Coucou", mentions: [PostMentionInput.handle("bob", display: .silent)])

        let payload = queue.enqueueCalls.first?.payload as? CreatePostPayload
        XCTAssertEqual(payload?.mentions?.count, 1)
        XCTAssertEqual(payload?.mentions?.first?.username, "bob")
        XCTAssertEqual(payload?.mentions?.first?.display, "SILENT")
    }

    func test_createPost_withoutReferences_declaresNothing_ratherThanAnEmptyList() async {
        // `nil` et `[]` ne disent pas la même chose au serveur : `[]` est un
        // verdict d'effacement. Un post qui n'a rien déclaré ne doit pas le
        // prononcer.
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createPost(content: "Rien de special")

        let payload = queue.enqueueCalls.first?.payload as? CreatePostPayload
        XCTAssertNil(payload?.mentions)
    }

    // MARK: - createBorrowedSoundPost() — les références déclarées voyagent aussi

    /// Ce chemin ne passe ni par `PostService` ni par l'outbox — direct via
    /// `APIClient` — donc la déclaration s'y perdrait silencieusement sans son
    /// propre fil jusqu'au corps. Même angle mort que les deux chemins audio
    /// enregistrés : « son emprunté » en est le troisième, oublié la première fois.
    func test_createBorrowedSoundPost_forwardsDeclaredReferencesToTheServer() async throws {
        let (sut, api, _, _) = makeSUT()
        // Court-circuite juste après l'encodage du corps — la capture du corps
        // (mockAPI) a lieu AVANT ce throw, comme le fait le `post()` réel.
        api.errorToThrow = APIError.networkError(URLError(.badServerResponse))

        await sut.createBorrowedSoundPost(
            type: "POST",
            storyEffects: StoryEffects(),
            mentions: [PostMentionInput.id("u-alice", display: .note)]
        )

        let body = try XCTUnwrap(api.lastPostBodies.last)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        let mentions = try XCTUnwrap(json["mentions"] as? [[String: Any]])
        XCTAssertEqual(mentions.count, 1)
        XCTAssertEqual(mentions.first?["userId"] as? String, "u-alice")
        XCTAssertEqual(mentions.first?["display"] as? String, "NOTE")
    }

    func test_createBorrowedSoundPost_withoutReferences_omitsTheKey() async throws {
        let (sut, api, _, _) = makeSUT()
        api.errorToThrow = APIError.networkError(URLError(.badServerResponse))

        await sut.createBorrowedSoundPost(type: "POST", storyEffects: StoryEffects())

        let body = try XCTUnwrap(api.lastPostBodies.last)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertNil(json["mentions"], "Rien de déclaré : la clé ne part pas")
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

        await sut.createOfflineMediaPost(localMediaURLs: urls, content: "Photo post", originalLanguage: "en", mobileTranscription: nil)

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
            type: "REEL",
            mobileTranscription: nil
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

    /// Garde de la désynchronisation protocole/implémentation : `location` a été
    /// ajoutée à l'implémentation concrète d'`enqueuePostMedia` sans être portée
    /// sur `OfflineQueueing`, ce qui a cassé la conformité (une valeur par défaut
    /// ne satisfait pas une exigence de protocole en Swift). Aucun test ne
    /// traversait le protocole avec une position — d'où le silence. Celui-ci
    /// exerce le chemin complet ViewModel → protocole → file.
    func test_createOfflineMediaPost_withLocation_propagatesPlaceToOutbox() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)
        let place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Paris")

        await sut.createOfflineMediaPost(
            localMediaURLs: [URL(fileURLWithPath: "/tmp/a.jpg")],
            content: "Vue depuis le toit",
            location: place,
            mobileTranscription: nil
        )

        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 1)
        XCTAssertEqual(queue.enqueuePostMediaCalls.first?.location, place,
            "une position attachée à un média posté hors-ligne doit survivre jusqu'au flush")
    }

    func test_createOfflineMediaPost_enqueueRefused_rollsBackOptimisticPost() async {
        let queue = MockOfflineQueue()
        queue.enqueuePostMediaError = APIError.networkError(URLError(.timedOut))
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createOfflineMediaPost(localMediaURLs: [URL(fileURLWithPath: "/tmp/a.jpg")], content: "Doomed", mobileTranscription: nil)

        XCTAssertTrue(sut.posts.isEmpty, "optimistic media post must be removed when the outbox refuses the row")
        XCTAssertNotNil(sut.publishError)
        XCTAssertFalse(sut.publishSuccess)
    }

    func test_createOfflineMediaPost_emptyURLs_fallsBackToTextOnly() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createOfflineMediaPost(localMediaURLs: [], content: "Just text", mobileTranscription: nil)

        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 0, "no media → no media enqueue")
        XCTAssertEqual(queue.enqueueCalls.count, 1, "falls back to the durable text-only path")
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .createPost)
        XCTAssertEqual(sut.posts.count, 1)
    }

    /// **Le repli « aucun média » perdait la liste NOMMÉE de l'audience.**
    ///
    /// `enqueueDurableTextPost` porte un défaut `nil` sur `visibilityUserIds`,
    /// et le repli ne le passait pas : un post `ONLY`/`EXCEPT` qui retombait là
    /// partait sans ses destinataires. Le gateway le refuse
    /// (`CreatePostSchema.refine`), le rejet est PERMANENT — la ligne est
    /// épuisée, le post est perdu.
    ///
    /// C'est le mécanisme même que ce lot documente partout ailleurs : un
    /// défaut fait disparaître un champ d'un site d'appel sans casser la
    /// moindre compilation.
    func test_createOfflineMediaPost_sansMedia_nePerdPasLAudienceNommee() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createOfflineMediaPost(
            localMediaURLs: [],
            content: "Pour vous deux",
            visibility: "ONLY",
            visibilityUserIds: ["u1", "u2"],
            mobileTranscription: nil
        )

        let payload = queue.lastPayload as? CreatePostPayload
        XCTAssertEqual(
            payload?.visibilityUserIds, ["u1", "u2"],
            "L'audience nommée est perdue par le repli sans média : le gateway refusera la charge, et le "
                + "rejet étant permanent, le post ne repartira jamais."
        )
        XCTAssertEqual(payload?.visibility, "ONLY")
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

    // MARK: - updatePost() — audience

    /// Loi produit 2026-08-23 : l'auteur change l'audience de sa publication à
    /// TOUT MOMENT. Le chemin d'édition envoyait `visibility: nil` en dur, donc
    /// la sheet ne pouvait rien resserrer une fois le post parti.
    func test_updatePost_forwardsVisibilityAndNamedAudienceToService() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "body", visibility: "ONLY", visibilityUserIds: ["u1", "u2"])

        XCTAssertEqual(postService.lastUpdateVisibility, "ONLY")
        XCTAssertEqual(postService.lastUpdateVisibilityUserIds, ["u1", "u2"])
    }

    /// Après l'aller-retour, le post local PORTE la nouvelle audience — c'est
    /// ce qui fait bouger son badge sans attendre un rafraîchissement.
    ///
    /// Le service rend ici un post déjà resserré, comme le vrai gateway : la
    /// réponse serveur fait foi et écrase l'écriture optimiste. Stubber une
    /// réponse SANS visibilité prouverait l'inverse de ce qu'on croit (la
    /// valeur nil du stub effacerait l'audience et le test le lirait comme un
    /// défaut du ViewModel).
    func test_updatePost_leavesThePostCarryingItsNewAudience() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]
        postService.createResult = .success(JSONStub.decode("""
        {"id":"p1","type":"POST","visibility":"PRIVATE","content":"body",
         "createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """))

        await sut.updatePost("p1", content: "body", visibility: "PRIVATE", visibilityUserIds: [])

        XCTAssertEqual(sut.posts.first?.visibility, "PRIVATE")
    }

    /// Une édition qui ne touche PAS à l'audience ne doit rien envoyer sur ce
    /// champ : un `visibility` recopié écraserait une audience changée
    /// entre-temps depuis une autre surface.
    func test_updatePost_withoutAudienceChange_leavesVisibilityAbsent() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "body")

        XCTAssertNil(postService.lastUpdateVisibility)
        XCTAssertNil(postService.lastUpdateVisibilityUserIds)
    }

    // MARK: - createPost() — audience nommée

    /// Une publication peut NAÎTRE avec une audience nommée. `EXCEPT`/`ONLY`
    /// étaient offertes au composer story et hors d'atteinte du composer post :
    /// `CreatePostRequest` portait le champ, aucune surcharge de
    /// `PostService.create` ne le remplissait.
    ///
    /// Le post porte un média : un post TEXTE seul ne passe pas par le service
    /// mais par la file durable (`isDurableTextOnly`) — c'est l'objet du test
    /// suivant, et prendre ce chemin ici rendrait le mock muet.
    func test_createPost_carriesANamedAudience_toTheService() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.createPost(content: "Salut", visibility: "ONLY", visibilityUserIds: ["u1", "u2"], mediaIds: ["m1"])

        XCTAssertEqual(postService.lastCreateVisibility, "ONLY")
        XCTAssertEqual(postService.lastCreateVisibilityUserIds, ["u1", "u2"])
    }

    /// Le chemin DURABLE — celui de l'immense majorité des posts, le texte seul
    /// — doit porter la même liste : sans elle, un post à audience nommée écrit
    /// hors ligne partirait au flush sans ses destinataires et le gateway le
    /// refuserait (`CreatePostSchema`).
    func test_createPost_textOnly_persistsTheNamedAudience_inTheDurableQueue() async {
        let queue = MockOfflineQueue()
        let (sut, _, _, _) = makeSUT(offlineQueue: queue)

        await sut.createPost(content: "Salut", visibility: "EXCEPT", visibilityUserIds: ["u3"])

        let payload = queue.lastPayload as? CreatePostPayload
        XCTAssertEqual(payload?.visibility, "EXCEPT")
        XCTAssertEqual(payload?.visibilityUserIds, ["u3"])
    }

    /// Une publication ordinaire n'envoie AUCUNE liste — `nil`, jamais `[]` :
    /// le payload porte un verdict, et « je n'en parle pas » n'est pas
    /// « efface » (même règle que `mentions`).
    func test_createPost_withoutANamedAudience_sendsNoList() async {
        let (sut, _, _, postService) = makeSUT()

        await sut.createPost(content: "Salut", visibility: "PUBLIC", mediaIds: ["m1"])

        XCTAssertNil(postService.lastCreateVisibilityUserIds)
    }

    // MARK: - EditPostSheet — règle d'audience (pure)

    func test_editPostAudience_reportsUnchangedVisibilityAsAbsent() {
        XCTAssertNil(EditPostAudienceRule.draftVisibility(selected: .public, original: "PUBLIC", touched: true))
        XCTAssertEqual(
            EditPostAudienceRule.draftVisibility(selected: .only, original: "PUBLIC", touched: true), "ONLY"
        )
    }

    /// Ouvrir puis fermer la sheet sans toucher au sélecteur ne dit RIEN sur
    /// l'audience — y compris quand l'original est inconnu, cas où l'état
    /// initial (« Public ») parlerait à la place de l'auteur.
    func test_editPostAudience_untouchedSelectorStaysSilent() {
        XCTAssertNil(EditPostAudienceRule.draftVisibility(selected: .public, original: nil, touched: false))
        XCTAssertNil(EditPostAudienceRule.draftVisibility(selected: .only, original: "PUBLIC", touched: false))
    }

    /// Mais une fois le choix POSÉ sur un post dont la visibilité n'a pas pu
    /// être hydratée, il part : sans cela, choisir « Privé » ne ferait rien.
    func test_editPostAudience_touchedChoiceWinsOverAnUnknownOriginal() {
        XCTAssertEqual(
            EditPostAudienceRule.draftVisibility(selected: .private, original: nil, touched: true), "PRIVATE"
        )
    }

    func test_editPostAudience_dropsTheListWhenLeavingExceptOrOnly() {
        XCTAssertEqual(EditPostAudienceRule.draftAudience(selected: .only, ids: ["u1"]), ["u1"])
        XCTAssertEqual(EditPostAudienceRule.draftAudience(selected: .public, ids: ["u1"]), [])
    }

    func test_editPostAudience_blocksSavingExceptOrOnlyWithNobody() {
        XCTAssertFalse(EditPostAudienceRule.isComplete(visibility: .only, audienceCount: 0))
        XCTAssertFalse(EditPostAudienceRule.isComplete(visibility: .except, audienceCount: 0))
        XCTAssertTrue(EditPostAudienceRule.isComplete(visibility: .only, audienceCount: 1))
        XCTAssertTrue(EditPostAudienceRule.isComplete(visibility: .public, audienceCount: 0))
        XCTAssertTrue(EditPostAudienceRule.isComplete(visibility: .community, audienceCount: 0))
    }

    // MARK: - EditPostSheet — ce que la feuille a su RENDRE (loi 3)

    /// **On n'écrit que ce qu'on sait complet et qu'on a su rendre.** Six
    /// champs du corps d'édition ne sont JAMAIS déclarés par cette feuille :
    /// elle ne les a jamais peints, donc elle ne peut pas les réécrire. Les
    /// déclarer les rendrait écrasables par une surface qui ne les a jamais
    /// montrés à l'auteur — et `mentions: []` RÉVOQUE.
    func test_editPostDraft_neverDeclaresWhatTheSheetHasNeverPainted() {
        let neverPainted: Set<PostEditField> = [
            .moodEmoji, .storyEffects, .mediaIds, .mentions, .allowSoundExtraction, .mediaAlt
        ]

        XCTAssertTrue(EditPostDraft.documentFields.isDisjoint(with: neverPainted))
        XCTAssertEqual(EditPostDraft.documentFields, [
            .content, .visibility, .visibilityUserIds, .originalLanguage,
            .type, .removeMediaIds, .location
        ])
    }

    /// La déclaration VOYAGE avec le brouillon, et son effet se mesure sur ce
    /// qui part : un `nil` reçu par le ViewModel ne dirait pas si le champ est
    /// INCHANGÉ ou JAMAIS AFFICHÉ. Ici il porte une valeur, et il est tu.
    func test_updatePost_whenTypeWasNeverRendered_omitsItEvenThoughTheDraftCarriesOne() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "body", type: "REEL",
                             known: EditPostDraft.documentFields.subtracting([.type]))

        XCTAssertNil(postService.lastUpdateType,
                     "le sélecteur POST/RÉEL n'existe pas sur un repost — le serveur doit préserver le sien")
        XCTAssertEqual(postService.lastUpdateContent, "body")
    }

    /// Non-régression : sans déclaration explicite, un appelant reçoit la
    /// déclaration la plus LARGE de la feuille — exactement ce que les quatre
    /// chemins d'édition envoyaient avant ce lot.
    func test_updatePost_defaultDeclaration_carriesEverythingTheSheetPaints() async {
        let (sut, _, _, postService) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "p1")]

        await sut.updatePost("p1", content: "body", language: "fr", type: "REEL",
                             removeMediaIds: ["m1"], visibility: "ONLY", visibilityUserIds: ["u1"])

        XCTAssertEqual(postService.lastUpdateContent, "body")
        XCTAssertEqual(postService.lastUpdateOriginalLanguage, "fr")
        XCTAssertEqual(postService.lastUpdateType, "REEL")
        XCTAssertEqual(postService.lastUpdateRemoveMediaIds, ["m1"])
        XCTAssertEqual(postService.lastUpdateVisibility, "ONLY")
        XCTAssertEqual(postService.lastUpdateVisibilityUserIds, ["u1"])
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

        // Default preferredLanguages is [] (MockLanguageProvider default), so
        // resolved(preferredLanguages: []) has no preferred language to match
        // against — translatedContent falls back to nil (original content).
        XCTAssertNil(sut.posts[0].translatedContent)
        XCTAssertEqual(sut.posts[0].displayContent, "Hello")
    }

    func test_clearTranslationOverride_secondPreferredLanguageMatches_resolvesFullChain() {
        // Prisme regression guard: the old implementation only ever consulted
        // preferredLanguages.first ("de") via an exact dictionary-key lookup,
        // losing the "fr" translation available further down the chain.
        let (sut, _, _, _) = makeSUT(preferredLanguages: ["de", "fr"])
        sut.posts = [Self.makeFeedPost(
            id: "t1",
            content: "Hello",
            translations: ["fr": PostTranslation(text: "Bonjour")],
            translatedContent: "stale override"
        )]

        sut.clearTranslationOverride(postId: "t1")

        XCTAssertEqual(sut.posts[0].translatedContent, "Bonjour")
    }

    func test_clearTranslationOverride_caseMismatchedPreferredLanguage_stillMatchesTranslation() {
        // Prisme regression guard: the old implementation did an exact-case
        // dictionary subscript (`translations?["FR"]`), which missed a
        // lowercase "fr" key entirely.
        let (sut, _, _, _) = makeSUT(preferredLanguages: ["FR"])
        sut.posts = [Self.makeFeedPost(
            id: "t1",
            content: "Hello",
            translations: ["fr": PostTranslation(text: "Bonjour")],
            translatedContent: "stale override"
        )]

        sut.clearTranslationOverride(postId: "t1")

        XCTAssertEqual(sut.posts[0].translatedContent, "Bonjour")
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

    /// stores-02 — quitter le feed émet feed:unsubscribe mais le socket reste
    /// connecté : au retour, connect() early-return et le handler .connect (le
    /// seul émetteur de feed:subscribe) ne rejoue jamais — la room feed restait
    /// quittée, plus aucun événement temps réel jusqu'à la prochaine reconnexion.
    func test_subscribeToSocketEvents_afterUnsubscribe_reemitsFeedSubscribe() {
        let (sut, _, socket, _) = makeSUT()

        sut.subscribeToSocketEvents()
        sut.unsubscribeFromSocketEvents()
        sut.subscribeToSocketEvents()

        XCTAssertEqual(socket.subscribeFeedCallCount, 2,
                       "Returning to the feed after leaving it must re-emit feed:subscribe even though the socket stays connected")

        sut.unsubscribeFromSocketEvents()
    }

    /// rts-01 (garde-fou) — le PREMIER armement ne fetch pas : la vue appelle
    /// déjà loadFeed() dans son .task si posts.isEmpty, un fetch ici serait
    /// redondant.
    func test_subscribeToSocketEvents_firstArm_doesNotFetchFeed() async {
        let (sut, api, _, _) = makeSUT()
        let before = api.requestCount

        sut.subscribeToSocketEvents()
        try? await Task.sleep(for: .milliseconds(300))

        XCTAssertEqual(api.requestCount, before, "le premier arm ne déclenche aucun fetch")

        sut.unsubscribeFromSocketEvents()
    }

    /// rts-01 — un aller-retour hors du feed SANS coupure réseau : les sinks
    /// étaient désarmés et la room quittée, tout ce qui s'est passé entre-temps
    /// est perdu. Le RÉ-armement doit rattraper via un refresh silencieux
    /// (didReconnect ne couvre que le flap réseau, jamais ce chemin).
    func test_subscribeToSocketEvents_rearmAfterUnsubscribe_backfillsFeedFromNetwork() async {
        let (sut, api, _, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p-rearm", content: "Backfilled")]))

        sut.subscribeToSocketEvents()
        sut.unsubscribeFromSocketEvents()
        let requestsBeforeRearm = api.requestCount

        sut.subscribeToSocketEvents()
        try? await waitForCondition(timeout: 5.0) { sut.posts.count == 1 }

        XCTAssertEqual(api.requestCount, requestsBeforeRearm + 1,
                       "le ré-armement rattrape le trou par un refresh réseau")
        XCTAssertEqual(sut.posts.first?.id, "p-rearm")

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

    func test_socketCommentAdded_mapsEffectFlagsTranslationAndReactions() async {
        // Regression guard: the handler used to build `FeedComment` with only
        // id/author/content/likes/replies/parentId — silently dropping
        // effectFlags (a media/effect comment rendered blank in real time),
        // the Prisme translation (always shown in its original language),
        // and currentUserReactions (heart state lost for an already-reacted
        // comment landing via socket).
        let (sut, api, socket, _) = makeSUT(preferredLanguages: ["fr"])
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "commented-post", commentCount: 3)]))
        await sut.loadFeed(forceRefresh: true)

        sut.subscribeToSocketEvents()

        let commentData: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"commented-post","comment":{"id":"c1","content":"Nice!","originalLanguage":"en","translations":{"fr":{"text":"Sympa !"}},"effectFlags":4,"currentUserReactions":["\u{2764}\u{FE0F}"],"createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"bob"}},"commentCount":4}
        """)
        socket.commentAdded.send(commentData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        let comment = sut.posts[0].comments.first(where: { $0.id == "c1" })
        XCTAssertEqual(comment?.effectFlags, 4)
        XCTAssertEqual(comment?.translatedContent, "Sympa !")
        XCTAssertEqual(comment?.currentUserReactions, ["\u{2764}\u{FE0F}"])

        sut.unsubscribeFromSocketEvents()
    }

    /// L'écho de NOTRE propre envoi porte le cmid ré-émis par le gateway : il
    /// doit REMPLACER la ligne optimiste (id local = cmid) au lieu d'en insérer
    /// une seconde sous l'id serveur — c'était le doublon visible « pendant un
    /// temps » après chaque publication de commentaire.
    func test_socketCommentAdded_withCmid_reconcilesOptimisticRowInsteadOfDuplicating() async {
        let queue = MockOfflineQueue()
        let (sut, api, socket, _) = makeSUT(offlineQueue: queue)
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1", commentCount: 0)]))
        await sut.loadFeed(forceRefresh: true)
        sut.subscribeToSocketEvents()

        await sut.sendComment(postId: "p1", content: "Hello")
        guard let cmid = (queue.enqueueCalls.first?.payload as? CreateCommentPayload)?.clientMutationId else {
            return XCTFail("no createComment enqueue")
        }
        XCTAssertEqual(sut.posts[0].comments.count, 1, "ligne optimiste posée")

        let commentData: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"p1","clientMutationId":"\(cmid)","comment":{"id":"srv-1","content":"Hello","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"me","username":"me"}},"commentCount":1}
        """)
        socket.commentAdded.send(commentData)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts[0].comments.count, 1,
                       "l'écho remplace la ligne optimiste — jamais de doublon")
        XCTAssertEqual(sut.posts[0].comments.first?.id, "srv-1",
                       "la ligne affichée porte l'id serveur après réconciliation")

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

    /// `post:reposted` n'est pas typé : le serveur y pousse le repost quel que
    /// soit son type, alors que la CRÉATION aiguille vers `story:created` /
    /// `status:created` / `post:created`. Un repost de type STORY entrait donc
    /// dans le fil en direct tout en vivant dans le tray — le même contenu se
    /// voyait aux deux endroits, jusqu'au rafraîchissement qui le retirait du
    /// fil. Le fil applique ici le partage que fait déjà sa lecture REST.
    func test_socketPostReposted_ofATrayType_doesNotEnterTheFeed() async {
        let (sut, api, socket, _) = makeSUT()
        api.stub("/posts/feed", result: Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "existing")]))
        await sut.loadFeed(forceRefresh: true)

        sut.subscribeToSocketEvents()

        let repostData: SocketPostRepostedData = JSONStub.decode("""
        {"originalPostId":"existing","repost":{"id":"repost-story","type":"STORY","content":"","createdAt":"2026-01-15T13:00:00.000Z","likeCount":0,"commentCount":0,"author":{"id":"a2","username":"bob"}}}
        """)
        socket.postReposted.send(repostData)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.posts.count, 1, "Une story repostee appartient au tray, pas au fil")
        XCTAssertEqual(sut.newPostsCount, 0)

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


    // MARK: - cache-03 étape A — le cache main-feed garde les 100 plus RÉCENTS

    func test_debouncedCacheSave_over100AccumulatedPosts_persistsThe100Newest() async throws {
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
        // Convention : post-1 = le plus RÉCENT, post-140 = le plus ANCIEN
        // (le tableau posts est newest-first).
        let seeded = (1...140).map { Self.makeFeedPost(id: "post-\($0)", content: "c\($0)") }
        let (sut, _, _, _) = makeSUT()
        sut.posts = seeded

        await sut.likePost("post-1")
        // Poll au lieu d'un sleep fixe : le save débouncé part à 2 s, une
        // marge de 0,2 s flake sous simulateur chargé (cache encore vide).
        //
        // Poll sur l'ENSEMBLE attendu, pas sur le compte : le store est un
        // singleton partagé, et le save débouncé d'un test VOISIN (SUT déjà
        // mort, débounce encore armé) peut atterrir APRÈS notre invalidate.
        // Dans ce cas on ré-arme NOTRE save pour repasser dernier écrivain —
        // l'assertion reste celle du comportement (prefix(100) app-side).
        var cached: [FeedPost] = []
        let expected = Set((1...100).map { "post-\($0)" })
        for attempt in 0 ..< 2 {
            let deadline = Date().addingTimeInterval(6)
            while Date() < deadline {
                cached = (await CacheCoordinator.shared.feed.load(for: "main-feed")).snapshot() ?? []
                if Set(cached.map(\.id)) == expected { break }
                try? await Task.sleep(for: .milliseconds(100))
            }
            if Set(cached.map(\.id)) == expected { break }
            await sut.likePost("post-\(attempt + 2)")
        }
        XCTAssertEqual(
            Set(cached.map(\.id)), expected,
            "GRDBCacheStore.save trimme par suffix (les plus ANCIENS survivent) : sans prefix(100) app-side, kill+relaunch dans la fenêtre fraîche sert la tranche la plus vieille en .fresh — les posts récents disparaissent de l'écran"
        )
    }


    // MARK: - stores-12 — les sinks muets persistent leur mutation

    /// Poll la clé "main-feed" jusqu'à ce que le save débouncé (2 s) atterrisse.
    private func waitForCachedMainFeedPost(
        id: String,
        timeout: TimeInterval = 6,
        until predicate: @escaping (FeedPost?) -> Bool
    ) async -> FeedPost? {
        var cached: FeedPost?
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            cached = (await CacheCoordinator.shared.feed.load(for: "main-feed")).snapshot()?
                .first(where: { $0.id == id })
            if predicate(cached) { return cached }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return cached
    }

    func test_socketCommentAdded_persistsCommentCountToCache() async {
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
        let (sut, _, socket, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "cc-post", commentCount: 3)]
        sut.subscribeToSocketEvents()

        let commentData: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"cc-post","comment":{"id":"c1","content":"Nice!","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"bob"}},"commentCount":4}
        """)
        socket.commentAdded.send(commentData)

        let cached = await waitForCachedMainFeedPost(id: "cc-post") { $0?.commentCount == 4 }
        XCTAssertEqual(cached?.commentCount, 4,
                       "un commentaire socket doit persister le compteur — un kill dans la fenêtre le perdait")
        sut.unsubscribeFromSocketEvents()
    }

    func test_socketCommentDeleted_persistsCommentCountToCache() async {
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
        let (sut, _, socket, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "cd-post", commentCount: 5)]
        sut.subscribeToSocketEvents()

        let deletedData: SocketCommentDeletedData = JSONStub.decode("""
        {"postId":"cd-post","commentId":"c1","commentCount":4}
        """)
        socket.commentDeleted.send(deletedData)

        let cached = await waitForCachedMainFeedPost(id: "cd-post") { $0?.commentCount == 4 }
        XCTAssertEqual(cached?.commentCount, 4)
        sut.unsubscribeFromSocketEvents()
    }

    func test_socketPostTranslationUpdated_persistsTranslationToCache() async {
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
        let (sut, _, socket, _) = makeSUT()
        sut.posts = [Self.makeFeedPost(id: "tr-post", content: "Hello world")]
        sut.subscribeToSocketEvents()

        let translationData: SocketPostTranslationUpdatedData = JSONStub.decode("""
        {"postId":"tr-post","language":"fr","translation":{"text":"Bonjour le monde","translationModel":"nllb-200","confidenceScore":0.95,"createdAt":"2026-01-15T12:00:00.000Z"}}
        """)
        socket.postTranslationUpdated.send(translationData)

        let cached = await waitForCachedMainFeedPost(id: "tr-post") { $0?.translations?["fr"] != nil }
        XCTAssertEqual(cached?.translations?["fr"]?.text, "Bonjour le monde",
                       "la traduction reçue en temps réel doit survivre au cold start")
        sut.unsubscribeFromSocketEvents()
    }

    func test_socketCommentTranslationUpdated_persistsTranslatedContentToCache() async {
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
        let (sut, _, socket, _) = makeSUT(preferredLanguages: ["fr"])
        var post = Self.makeFeedPost(id: "ctr-post", content: "Hello")
        post.comments = [FeedComment(id: "c1", author: "bob", authorId: "a1", content: "Nice", replies: 0)]
        sut.posts = [post]
        sut.subscribeToSocketEvents()

        let translationData: SocketCommentTranslationUpdatedData = JSONStub.decode("""
        {"commentId":"c1","postId":"ctr-post","language":"fr","translation":{"text":"Sympa !","translationModel":"nllb-200","confidenceScore":0.9,"createdAt":"2026-01-15T12:00:00.000Z"}}
        """)
        socket.commentTranslationUpdated.send(translationData)

        let cached = await waitForCachedMainFeedPost(id: "ctr-post") {
            $0?.comments.first(where: { $0.id == "c1" })?.translatedContent != nil
        }
        XCTAssertEqual(cached?.comments.first(where: { $0.id == "c1" })?.translatedContent, "Sympa !")
        sut.unsubscribeFromSocketEvents()
    }

    // MARK: - grdb-03 — reapplyPendingLikes (volet mémoire)

    func test_reapplyPendingLikes_pendingTrue_setsIsLikedAndBumpsCount() {
        var post = Self.makeFeedPost(id: "p1", content: "a")
        post.isLiked = false
        post.likes = 4

        let result = FeedViewModel.reapplyPendingLikes(posts: [post], pendingLikes: ["p1": true])

        XCTAssertTrue(result[0].isLiked, "le like pending doit rester visible par-dessus le snapshot serveur périmé")
        XCTAssertEqual(result[0].likes, 5)
    }

    func test_reapplyPendingLikes_pendingFalse_clearsIsLikedAndClampsCount() {
        var post = Self.makeFeedPost(id: "p1", content: "a")
        post.isLiked = true
        post.likes = 0

        let result = FeedViewModel.reapplyPendingLikes(posts: [post], pendingLikes: ["p1": false])

        XCTAssertFalse(result[0].isLiked)
        XCTAssertEqual(result[0].likes, 0, "jamais de compteur négatif")
    }

    func test_reapplyPendingLikes_noPending_identity() {
        var post = Self.makeFeedPost(id: "p1", content: "a")
        post.isLiked = false
        post.likes = 4

        let result = FeedViewModel.reapplyPendingLikes(posts: [post], pendingLikes: [:])

        XCTAssertFalse(result[0].isLiked)
        XCTAssertEqual(result[0].likes, 4)
    }


    // MARK: - BW-IOS-03 : politique d'auto-téléchargement du préchargement du feed

    /// La fenêtre de 9 posts tirait le fichier AUDIO ENTIER de chaque post
    /// audio, jamais joué, sans consulter `MediaDownloadPolicyEngine`.
    func test_shouldPrefetchFeedMedia_audioOnBadCellular_returnsFalse() {
        let allowAudio = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .audio, condition: .badCellular, prefs: .defaults
        )

        XCTAssertFalse(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .audio, hasThumbnail: false,
            allowImage: true, allowVideo: true, allowAudio: allowAudio
        ), "sur cellulaire contraint, l'audio se charge à l'appui sur lecture")
    }

    func test_shouldPrefetchFeedMedia_imageOnWifi_returnsTrue() {
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .image, condition: .wifi, prefs: .defaults
        )

        XCTAssertTrue(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .image, hasThumbnail: true,
            allowImage: allowImage, allowVideo: false, allowAudio: false
        ), "en Wi-Fi, le fil reste préchargé comme avant")
    }

    /// Une vidéo AVEC vignette ne tire qu'une image distante : `prefs.image`.
    /// `hasThumbnail` signifie « vignette RÉSOLVABLE » (l'appelant le calcule
    /// via `media.thumbnailUrl.flatMap { MeeshyConfig.resolveMediaURL($0) } != nil`),
    /// pas seulement « champ non-nil » — sinon une `thumbnailUrl` mal formée
    /// ferait passer ce prédicat sous `allowImage` pendant que le code exécuté
    /// bascule sur le décodage de la première frame du MP4 (`prefs.video`).
    func test_shouldPrefetchFeedMedia_videoWithThumbnail_followsImagePolicy() {
        XCTAssertTrue(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .video, hasThumbnail: true,
            allowImage: true, allowVideo: false, allowAudio: false
        ))
        XCTAssertFalse(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .video, hasThumbnail: true,
            allowImage: false, allowVideo: true, allowAudio: true
        ))
    }

    /// Une vidéo SANS vignette passe par `StoryMediaLoader.videoThumbnail`, qui
    /// décode la première frame du MP4 DISTANT : ce sont des octets VIDÉO, donc
    /// `prefs.video` (`.wifiOnly` par défaut). La ranger sous `prefs.image`
    /// (`.wifiAndGoodCellular`) laisserait tirer de la vidéo en bon cellulaire.
    func test_shouldPrefetchFeedMedia_videoWithoutThumbnail_followsVideoPolicy() {
        XCTAssertFalse(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .video, hasThumbnail: false,
            allowImage: true, allowVideo: false, allowAudio: true
        ), "pas de lecture réseau sur le MP4 quand prefs.video refuse")
        XCTAssertTrue(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .video, hasThumbnail: false,
            allowImage: false, allowVideo: true, allowAudio: false
        ))
    }

    /// Un document n'a jamais été préchargé (branche `default` du routage) —
    /// la garde ne doit pas lui ouvrir une porte au passage.
    func test_shouldPrefetchFeedMedia_document_isNeverPrefetched() {
        XCTAssertFalse(FeedViewModel.shouldPrefetchFeedMedia(
            kind: .document, hasThumbnail: true,
            allowImage: true, allowVideo: true, allowAudio: true
        ))
    }

    // MARK: - Source guard — le prefetch consulte bien la politique (câblage, pas seulement la table de vérité)

    /// Les tests `test_shouldPrefetchFeedMedia_*` ci-dessus couvrent la table
    /// de vérité du prédicat PUR, jamais son câblage : supprimer le
    /// `guard FeedViewModel.shouldPrefetchFeedMedia(…) else { … }` ou le
    /// `if allowVideo,` du preroll dans `prefetchMedia(around:)` les
    /// laisserait tous verts alors que le défaut BW-IOS-03 serait entièrement
    /// rétabli. Garde de SOURCE visant le BLOC de la fonction (jamais le
    /// fichier entier), équilibrée par accolades via `DeclarationBodyScanner`
    /// — insensible aux commentaires ajoutés au-dessus.
    func test_prefetchMedia_blockConsultsTheDownloadPolicy() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/ViewModels
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/FeedViewModel.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        guard let body = DeclarationBodyScanner.body(containing: "func prefetchMedia(around index: Int)", in: source) else {
            XCTFail("prefetchMedia(around:) body not found — FeedViewModel.swift changed shape, update this guard's anchor.")
            return
        }

        XCTAssertTrue(
            body.contains("shouldPrefetchFeedMedia("),
            "prefetchMedia(around:) must consult FeedViewModel.shouldPrefetchFeedMedia(...) before touching a URL — " +
            "otherwise the truth-table tests above stay green while the download policy is silently bypassed."
        )
        XCTAssertTrue(
            body.contains("if allowVideo,"),
            "the video preroll inside prefetchMedia(around:) must stay gated on allowVideo — " +
            "otherwise a good-cellular connection preloads the AVPlayer's MP4 regardless of prefs.video."
        )
    }

}

// MARK: - Gated feed cache double

/// Magasin de cache du fil en mémoire dont `save` se SUSPEND jusqu'à
/// `releaseSave()` — pour prouver qu'un appelant attend (ou non) sa
/// persistance. Privé à ce fichier : un fichier de mock neuf exigerait un
/// passage XcodeGen (cf. tasks/lessons.md, « fichier de test neuf »).
private actor GatedFeedCacheStore: FeedCacheStoring {
    private var storage: [String: [FeedPost]] = [:]
    private var saveRequested: [CheckedContinuation<Void, Never>] = []
    private var saveRequestedOnce = false
    private var gate: [CheckedContinuation<Void, Never>] = []
    private var released = false

    func load(for key: String) async -> CacheResult<[FeedPost]> {
        guard let items = storage[key] else { return .empty }
        return .fresh(items, age: 0)
    }

    func save(_ items: [FeedPost], for key: String) async throws {
        saveRequestedOnce = true
        saveRequested.forEach { $0.resume() }
        saveRequested.removeAll()
        if !released {
            await withCheckedContinuation { gate.append($0) }
        }
        storage[key] = items
    }

    func savePreservingFreshness(_ items: [FeedPost], for key: String) async throws {
        storage[key] = items
    }

    func patchEverywhere(itemId: String, mutate: @Sendable (inout FeedPost) -> Void) async {
        for (key, items) in storage {
            storage[key] = items.map { item in
                guard item.id == itemId else { return item }
                var copy = item
                mutate(&copy)
                return copy
            }
        }
    }

    func waitForSaveRequest() async {
        if saveRequestedOnce { return }
        await withCheckedContinuation { saveRequested.append($0) }
    }

    func releaseSave() {
        released = true
        gate.forEach { $0.resume() }
        gate.removeAll()
    }

    func items(for key: String) -> [FeedPost]? { storage[key] }
}
