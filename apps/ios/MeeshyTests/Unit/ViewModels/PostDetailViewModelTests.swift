import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class PostDetailViewModelTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: "p1")
        await CacheCoordinator.shared.comments.invalidate(for: "post-p1")
    }

    // MARK: - Factory

    private func makeSUT(
        postService: MockPostService = MockPostService(),
        preferredLanguages: [String] = [],
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        socialSocket: MockSocialSocket = MockSocialSocket()
    ) -> (sut: PostDetailViewModel, postService: MockPostService) {
        let languageProvider = MockLanguageProvider(preferredLanguages: preferredLanguages)
        let sut = PostDetailViewModel(
            postService: postService,
            languageProvider: languageProvider,
            offlineQueue: offlineQueue,
            socialSocket: socialSocket
        )
        return (sut, postService)
    }

    private static func makeAPIPost(id: String = "post-1", content: String = "Hello") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    private static let stubComment: APIPostComment = JSONStub.decode("""
    {"id":"c1","content":"Nice post","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
    """)

    private static func makePaginatedComments(
        comments: [APIPostComment],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPostComment]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let commentsJSON = comments.map { c in
            let parentField = c.parentId.map { ",\"parentId\":\"\($0)\"" } ?? ""
            return """
            {"id":"\(c.id)","content":"\(c.content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"\(c.author.id)","username":"\(c.author.username ?? "user")"}\(parentField)}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(commentsJSON.joined(separator: ","))],"pagination":\(cursorJSON),"error":null}
        """)
    }

    // MARK: - loadPost

    func test_loadPost_success_setsPost() async {
        let (sut, mock) = makeSUT()
        let apiPost = Self.makeAPIPost(id: "p1", content: "Test")
        mock.getPostResult = .success(apiPost)

        await sut.loadPost("p1")

        XCTAssertNotNil(sut.post)
        XCTAssertEqual(sut.post?.id, "p1")
        XCTAssertEqual(mock.getPostCallCount, 1)
    }

    func test_loadPost_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .failure(NSError(domain: "test", code: 404, userInfo: [NSLocalizedDescriptionKey: "Not found"]))

        await sut.loadPost("p1")

        XCTAssertNotNil(sut.error)
        XCTAssertNil(sut.post)
    }

    // MARK: - updatePost (position à l'édition)

    func test_updatePost_forwardsLocationSet_andAppliesItOptimistically() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let place = SharedPlace(latitude: 48.8584, longitude: 2.2945, name: "Tour Eiffel")

        await sut.updatePost(content: "Hello", location: .set(place))

        XCTAssertEqual(mock.lastUpdateLocation, .set(place),
                       "Le tri-état .set doit partir tel quel au service")
    }

    func test_updatePost_forwardsLocationRemove() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.updatePost(content: "Hello", location: .remove)

        XCTAssertEqual(mock.lastUpdateLocation, .remove)
    }

    func test_updatePost_withoutLocation_forwardsNil() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.updatePost(content: "Hello")

        XCTAssertNil(mock.lastUpdateLocation,
                     "Sans modification, la position ne doit pas partir (inchangée)")
    }

    // MARK: - registerDetailOpen

    func test_registerDetailOpen_recordsImpression_withDetailSource() async {
        let (sut, mock) = makeSUT()

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(mock.recordImpressionCallCount, 1)
        XCTAssertEqual(mock.lastRecordImpressionPostId, "p1")
        XCTAssertEqual(mock.lastRecordImpressionSource, "detail")
    }

    func test_registerDetailOpen_optimisticallyBumpsTotalViewAndImpression() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let beforeOpens = sut.post?.postOpenCount ?? -1
        let beforeImpr = sut.post?.impressionCount ?? -1

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(sut.post?.postOpenCount, beforeOpens + 1)
        XCTAssertEqual(sut.post?.impressionCount, beforeImpr + 1)
    }

    // MARK: - loadComments

    func test_loadComments_success_populatesComments() async {
        let (sut, mock) = makeSUT()
        let comment: APIPostComment = JSONStub.decode("""
        {"id":"c1","content":"Nice","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: [comment]))

        await sut.loadComments("p1")

        XCTAssertEqual(sut.comments.count, 1)
        XCTAssertEqual(sut.comments[0].id, "c1")
        XCTAssertEqual(mock.getCommentsCallCount, 1)
    }

    /// C5 — le like de commentaire dans le détail de post doit s'amorcer depuis
    /// l'état serveur : un commentaire déjà cœur-réagi (`currentUserReactions`)
    /// apparaît "liké" (`commentLikedIds`) après chargement, les autres non.
    func test_loadComments_seedsCommentLikedIds_fromCurrentUserReactions() async {
        let (sut, mock) = makeSUT()
        // postId unique : le store de cache `comments` est un singleton partagé —
        // une clé dédiée évite qu'un autre test ne serve ses commentaires.
        let postId = "pSeedCommentLikes"
        let response: PaginatedAPIResponse<[APIPostComment]> = JSONStub.decode("""
        {"success":true,"data":[
          {"id":"cLiked","content":"x","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"},"currentUserReactions":["\u{2764}\u{FE0F}"]},
          {"id":"cFire","content":"y","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a2","username":"bob"},"currentUserReactions":["\u{1F525}"]},
          {"id":"cNone","content":"z","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a3","username":"carol"},"currentUserReactions":[]}
        ],"pagination":null,"error":null}
        """)
        mock.getCommentsResult = .success(response)

        await sut.loadComments(postId)

        XCTAssertTrue(sut.commentLikedIds.contains("cLiked"))
        XCTAssertFalse(sut.commentLikedIds.contains("cFire"))
        XCTAssertFalse(sut.commentLikedIds.contains("cNone"))
    }

    func test_loadComments_error_keepsEmptyComments() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadComments("p1")

        XCTAssertTrue(sut.comments.isEmpty)
    }

    func test_loadComments_setsIsLoadingComments() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: []))

        XCTAssertFalse(sut.isLoadingComments)
        await sut.loadComments("p1")
        XCTAssertFalse(sut.isLoadingComments)
    }

    // MARK: - loadMoreComments

    /// Regression guard: a `.fresh` comments-cache hit in `loadComments` never
    /// touches the network, so `commentCursor` stays at its initial `nil`
    /// while `hasMoreComments` stays at its initial `true` — the old
    /// `commentCursor != nil` guard permanently stalled "load more comments"
    /// for the rest of the session. `cursor: nil` in `fetchCommentsFromNetwork`
    /// already means "fetch page 1", which is exactly what's needed to
    /// recover a real cursor.
    func test_loadMoreComments_afterFreshCacheOnlySession_stillFetchesDespiteNilCursor() async {
        let (sut, mock) = makeSUT()
        let postId = "pFreshCommentsPagination"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let seeded = (0..<3).map { FeedComment(id: "cached-\($0)", author: "Alice", content: "c\($0)") }
        try? await CacheCoordinator.shared.comments.save(seeded, for: "post-\(postId)")

        await sut.loadComments(postId) // .fresh cache hit — no network call
        XCTAssertEqual(sut.comments.count, 3)
        XCTAssertTrue(sut.hasMoreComments)
        XCTAssertEqual(mock.getCommentsCallCount, 0)

        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: [Self.stubComment], hasMore: true, nextCursor: "next-page"))

        await sut.loadMoreComments(postId)

        XCTAssertEqual(mock.getCommentsCallCount, 1, "Should fetch page 1 with a nil cursor to recover a real cursor")
        XCTAssertTrue(sut.comments.contains(where: { $0.id == "c1" }))

        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    // MARK: - loadCommentsUntilPresent (chasse paginée — commentaire notifié)

    private static func makeAPIComment(id: String) -> APIPostComment {
        JSONStub.decode("""
        {"id":"\(id)","content":"c-\(id)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    func test_loadCommentsUntilPresent_targetOnThirdPage_pagesUntilFound() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResultsQueue = [
            .success(Self.makePaginatedComments(comments: [Self.makeAPIComment(id: "p1c")], hasMore: true, nextCursor: "cur1")),
            .success(Self.makePaginatedComments(comments: [Self.makeAPIComment(id: "p2c")], hasMore: true, nextCursor: "cur2")),
            .success(Self.makePaginatedComments(comments: [Self.makeAPIComment(id: "target")], hasMore: true, nextCursor: "cur3")),
        ]

        let found = await sut.loadCommentsUntilPresent("target", postId: "post-1")

        XCTAssertTrue(found)
        XCTAssertEqual(mock.getCommentsCallCount, 3, "s'arrête dès que la cible est chargée")
        XCTAssertTrue(sut.topLevelComments.contains { $0.id == "target" })
    }

    func test_loadCommentsUntilPresent_targetAlreadyLoaded_makesNoNetworkCall() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResultsQueue = [
            .success(Self.makePaginatedComments(comments: [Self.makeAPIComment(id: "target")], hasMore: false)),
        ]
        await sut.loadMoreComments("post-1")
        mock.getCommentsCallCount = 0

        let found = await sut.loadCommentsUntilPresent("target", postId: "post-1")

        XCTAssertTrue(found)
        XCTAssertEqual(mock.getCommentsCallCount, 0)
    }

    func test_loadCommentsUntilPresent_exhaustedList_returnsFalse() async {
        let (sut, mock) = makeSUT()
        mock.getCommentsResultsQueue = [
            .success(Self.makePaginatedComments(comments: [Self.makeAPIComment(id: "other")], hasMore: false)),
        ]

        let found = await sut.loadCommentsUntilPresent("missing", postId: "post-1")

        XCTAssertFalse(found)
        XCTAssertEqual(mock.getCommentsCallCount, 1, "s'arrête quand hasMore devient faux")
    }

    // MARK: - Replies pagination (fil de réponses > 20 — endpoint paginé ASC)

    private static func makeAPIReply(id: String, parentId: String) -> APIPostComment {
        JSONStub.decode("""
        {"id":"\(id)","content":"r-\(id)","parentId":"\(parentId)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    func test_loadReplies_recordsHasMoreAndCursor() async {
        let (sut, mock) = makeSUT()
        mock.getCommentRepliesResultsQueue = [
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "r1", parentId: "cThread")],
                hasMore: true, nextCursor: "rcur1"
            )),
        ]

        await sut.loadReplies(postId: "p1", commentId: "cThread")

        XCTAssertEqual(sut.repliesMap["cThread"]?.map(\.id), ["r1"])
        XCTAssertEqual(sut.repliesHasMore["cThread"], true)
        XCTAssertEqual(sut.repliesNextCursor["cThread"], "rcur1")
    }

    func test_loadMoreReplies_appendsWithoutDuplicates() async {
        let (sut, mock) = makeSUT()
        mock.getCommentRepliesResultsQueue = [
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "r1", parentId: "cThread"),
                           Self.makeAPIReply(id: "r2", parentId: "cThread")],
                hasMore: true, nextCursor: "rcur1"
            )),
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "r2", parentId: "cThread"),
                           Self.makeAPIReply(id: "r3", parentId: "cThread")],
                hasMore: false
            )),
        ]
        await sut.loadReplies(postId: "p1", commentId: "cThread")

        await sut.loadMoreReplies("cThread", postId: "p1")

        XCTAssertEqual(sut.repliesMap["cThread"]?.map(\.id), ["r1", "r2", "r3"], "append + dédup, jamais de replace")
        XCTAssertEqual(sut.repliesHasMore["cThread"], false)
        XCTAssertEqual(mock.lastGetCommentRepliesCursor, "rcur1", "la page suivante part du curseur enregistré")
    }

    func test_loadRepliesUntilPresent_targetOnThirdPage_huntsUntilFound() async {
        let (sut, mock) = makeSUT()
        mock.getCommentRepliesResultsQueue = [
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "r1", parentId: "cThread")],
                hasMore: true, nextCursor: "rcur1"
            )),
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "r2", parentId: "cThread")],
                hasMore: true, nextCursor: "rcur2"
            )),
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "rTarget", parentId: "cThread")],
                hasMore: true, nextCursor: "rcur3"
            )),
        ]

        let found = await sut.loadRepliesUntilPresent("rTarget", in: "cThread", postId: "p1")

        XCTAssertTrue(found)
        XCTAssertEqual(mock.getCommentRepliesCallCount, 3, "s'arrête dès que la réponse ciblée est chargée")
        XCTAssertEqual(sut.repliesMap["cThread"]?.map(\.id), ["r1", "r2", "rTarget"])
    }

    func test_loadRepliesUntilPresent_exhaustedThread_returnsFalse() async {
        let (sut, mock) = makeSUT()
        mock.getCommentRepliesResultsQueue = [
            .success(Self.makePaginatedComments(
                comments: [Self.makeAPIReply(id: "r1", parentId: "cThread")],
                hasMore: false
            )),
        ]

        let found = await sut.loadRepliesUntilPresent("missing", in: "cThread", postId: "p1")

        XCTAssertFalse(found)
        XCTAssertEqual(mock.getCommentRepliesCallCount, 1, "s'arrête à l'épuisement du fil (hasMore=false)")
    }

    // MARK: - sendComment

    func test_sendComment_success_insertsOptimisticCommentAtTop() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        await sut.sendComment("New comment")

        // sendComment inserts an optimistic comment carrying a `cmid` id and
        // enqueues a createComment outbox op; the authoritative server id
        // arrives later via the `comment:added` socket broadcast.
        XCTAssertEqual(sut.comments.count, 1)
        XCTAssertEqual(sut.comments[0].content, "New comment")
        XCTAssertTrue(sut.comments[0].id.hasPrefix("cmid"))
        XCTAssertEqual(queue.enqueueCalls.count, 1)
    }

    func test_sendComment_outboxRefuses_rollsBackOptimisticInsert() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        await sut.sendComment("Failing comment")

        XCTAssertTrue(sut.comments.isEmpty)
    }

    // MARK: - likePost

    func test_likePost_togglesLikeState() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")

        let initialLikes = sut.post?.likes ?? 0
        await sut.likePost()

        XCTAssertEqual(sut.post?.isLiked, true)
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)
        XCTAssertEqual(queue.enqueueCalls.count, 1)
    }

    func test_likePost_outboxRefuses_rollsBack() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, mock) = makeSUT(offlineQueue: queue)
        let apiPost = Self.makeAPIPost(id: "p1")
        mock.getPostResult = .success(apiPost)
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()

        XCTAssertEqual(sut.post?.isLiked, false)
        XCTAssertEqual(sut.post?.likes, initialLikes)
    }

    // MARK: - Outbox terminal outcome (R5) — rollback on .exhausted

    func test_likePost_rollsBack_whenOutcomeExhausted() async {
        // R5 — a like that enqueues successfully but later EXHAUSTS its retry
        // budget (server permanently rejected it) must roll back. Before this
        // fix nobody observed the outcome, so the like was stuck forever.
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()
        XCTAssertEqual(sut.post?.isLiked, true, "optimistic like applied")
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)

        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.post?.isLiked, false, "exhausted outbox row must roll back the optimistic like")
        XCTAssertEqual(sut.post?.likes, initialLikes, "like count must revert on exhausted")
    }

    func test_likePost_doesNotRollBack_whenOutcomeApplied() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()
        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.applied(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.post?.isLiked, true, "applied outcome keeps the optimistic like")
        XCTAssertEqual(sut.post?.likes, initialLikes + 1)
    }

    // MARK: - likePost: write-through vers la clé cache détail (stores-09)

    /// Polls the detail cache key until the fire-and-forget patch task lands
    /// (or 1 s elapses) — a fixed sleep would flake under CI load.
    private func waitForCachedLikes(
        key: String,
        expected: Int
    ) async -> FeedPost? {
        var cached: FeedPost?
        for _ in 0..<50 {
            let result = await CacheCoordinator.shared.feed.load(for: key)
            cached = result.snapshot()?.first(where: { $0.id == key })
            if cached?.likes == expected { break }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return cached
    }

    func test_likePost_enqueueSucceeds_writesThroughToDetailCacheKey() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()

        let cached = await waitForCachedLikes(key: "p1", expected: initialLikes + 1)
        XCTAssertEqual(cached?.isLiked, true,
                       "le like optimiste doit être écrit sous la clé cache détail, pas seulement en RAM")
        XCTAssertEqual(cached?.likes, initialLikes + 1)
    }

    func test_likePost_outboxExhausted_rollsBackCacheKey() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialLikes = sut.post?.likes ?? 0

        await sut.likePost()
        _ = await waitForCachedLikes(key: "p1", expected: initialLikes + 1)

        guard let payload = queue.enqueueCalls.first?.payload as? ToggleLikePostPayload else {
            return XCTFail("no toggleLikePost enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)

        let cached = await waitForCachedLikes(key: "p1", expected: initialLikes)
        XCTAssertEqual(cached?.isLiked, false,
                       "le rollback doit aussi restaurer la clé cache détail (valeurs de restauration, pas optimistes)")
        XCTAssertEqual(cached?.likes, initialLikes)
    }

    func test_sendComment_rollsBack_whenOutcomeExhausted() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.sendComment("doomed comment")
        XCTAssertEqual(sut.comments.count, 1, "optimistic comment inserted")
        XCTAssertEqual(sut.comments[0].content, "doomed comment")

        guard let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload else {
            return XCTFail("no createComment enqueue")
        }
        try? await waitForContinuation(in: queue, for: payload.clientMutationId)
        queue.emitOutcome(.exhausted(cmid: payload.clientMutationId), for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.comments.isEmpty, "optimistic comment must be removed on exhausted")
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

    // MARK: - deleteComment

    func test_deleteComment_topLevel_removesOptimisticallyAndCallsService() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let comment = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [comment]
        sut.post?.commentCount = 1

        await sut.deleteComment(comment)

        XCTAssertTrue(sut.comments.isEmpty)
        XCTAssertEqual(mock.deleteCommentCallCount, 1)
        XCTAssertEqual(mock.lastDeleteCommentPostId, "p1")
        XCTAssertEqual(mock.lastDeleteCommentCommentId, "c1")
        XCTAssertEqual(sut.post?.commentCount, 0)
    }

    func test_deleteComment_topLevel_subtractsReplyCountFromTotal() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let comment = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 2)
        sut.comments = [comment]
        sut.post?.commentCount = 3 // 1 racine + 2 réponses

        await sut.deleteComment(comment)

        XCTAssertEqual(sut.post?.commentCount, 0, "racine + ses réponses retirées du total")
    }

    func test_deleteComment_failure_rollsBack() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        mock.deleteCommentResult = .failure(NSError(domain: "test", code: 500))
        let comment = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [comment]
        sut.post?.commentCount = 1

        await sut.deleteComment(comment)

        XCTAssertEqual(sut.comments.count, 1, "le commentaire est restauré si l'API échoue")
        XCTAssertEqual(sut.comments[0].id, "c1")
        XCTAssertEqual(sut.post?.commentCount, 1)
    }

    func test_deleteComment_reply_decrementsParentReplyCount() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let parent = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 1)
        let reply = FeedComment(id: "r1", author: "bob", authorId: "a2", content: "Reply", parentId: "c1")
        sut.comments = [parent]
        sut.repliesMap = ["c1": [reply]]
        sut.post?.commentCount = 2

        await sut.deleteComment(reply)

        XCTAssertEqual(sut.repliesMap["c1"]?.isEmpty, true)
        XCTAssertEqual(sut.comments.first(where: { $0.id == "c1" })?.replies, 0)
        XCTAssertEqual(sut.post?.commentCount, 1)
        XCTAssertEqual(mock.lastDeleteCommentCommentId, "r1")
    }

    // MARK: - preloadReplyPreviews

    func test_preloadReplyPreviews_loadsRepliesForCommentsWithReplies() async {
        await CacheCoordinator.shared.comments.invalidate(for: "replies-c1")
        let (sut, mock) = makeSUT()
        sut.comments = [FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 2)]

        await sut.preloadReplyPreviews(postId: "p1")

        XCTAssertEqual(mock.getCommentRepliesCallCount, 1, "les réponses d'un commentaire racine sont préchargées")
    }

    func test_preloadReplyPreviews_skipsCommentsWithoutReplies() async {
        let (sut, mock) = makeSUT()
        sut.comments = [FeedComment(id: "c2", author: "alice", authorId: "a1", content: "Top", replies: 0)]

        await sut.preloadReplyPreviews(postId: "p1")

        XCTAssertEqual(mock.getCommentRepliesCallCount, 0, "pas de précharge si aucun sous-commentaire")
    }

    // MARK: - sendReply (flat 2-level threading)

    func test_sendReply_toRootComment_usesRootAsParent() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [root]
        sut.replyingTo = root

        await sut.sendReply("Coucou", effectFlags: 4)

        XCTAssertEqual(queue.enqueueCalls.first?.kind, .createComment,
                       "une réponse texte transite par l'outbox durable, pas par un appel direct")
        let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload
        XCTAssertEqual(payload?.parentCommentId, "c1", "répondre à une racine se rattache à elle")
        XCTAssertEqual(payload?.effectFlags, 4, "effectFlags survit à l'enfilement")
    }

    func test_sendReply_toReply_staysFlatUnderRoot() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 1)
        let reply = FeedComment(id: "r1", author: "bob", authorId: "a2", authorUsername: "bob", content: "Reply", parentId: "c1")
        sut.comments = [root]
        sut.repliesMap = ["c1": [reply]]
        // Répondre à une réponse de niveau 2 …
        sut.replyingTo = reply

        await sut.sendReply("@bob ok")

        // … reste plat au niveau 2 : rattaché au MÊME parent racine (c1), pas à r1.
        let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload
        XCTAssertEqual(payload?.parentCommentId, "c1")
        // La nouvelle réponse s'ajoute sous c1 (et non sous r1, qui ne porte pas de fil).
        XCTAssertEqual(sut.repliesMap["c1"]?.count, 2)
        XCTAssertNil(sut.repliesMap["r1"], "aucun sous-fil créé sous une réponse")
    }

    /// La réponse optimiste apparaît AVANT toute confirmation réseau, keyée
    /// par cmid (réconciliée plus tard par l'écho socket comment:added).
    func test_sendReply_insertsOptimisticReplyInRepliesMap() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [root]
        sut.replyingTo = root

        await sut.sendReply("Coucou")

        XCTAssertEqual(sut.repliesMap["c1"]?.first?.id.hasPrefix("cmid") ?? false, true,
                       "la réponse optimiste est keyée par cmid, pas par un id serveur")
        XCTAssertEqual(sut.comments.first?.replies, 1, "le compteur du parent est incrémenté")
        XCTAssertTrue(sut.expandedThreads.contains("c1"), "le fil est déplié pour montrer la réponse")
    }

    func test_sendReply_enqueueRefused_rollsBackOptimistic() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.addCommentResult = .failure(NSError(domain: "test", code: 500))
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let initialCount = sut.post?.commentCount ?? 0
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [root]
        sut.replyingTo = root

        await sut.sendReply("Coucou")

        XCTAssertEqual(sut.repliesMap["c1"]?.isEmpty ?? true, true,
                       "l'enfilement refusé doit retirer la réponse optimiste")
        XCTAssertEqual(sut.comments.first?.replies, 0, "le compteur du parent est restauré")
        XCTAssertEqual(sut.post?.commentCount, initialCount)
    }

    // MARK: - comment:added echo reconciliation (anti-doublon)

    /// L'écho de NOTRE propre envoi porte le cmid ré-émis par le gateway : il
    /// doit REMPLACER la ligne optimiste (id local = cmid) au lieu d'en insérer
    /// une seconde sous l'id serveur — c'était le doublon visible « pendant un
    /// temps » après chaque publication de commentaire depuis le détail.
    func test_commentAdded_withCmid_replacesOptimisticTopLevelRow() async {
        let queue = MockOfflineQueue()
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, offlineQueue: queue, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        await sut.sendComment("Hello")
        guard let cmid = (queue.enqueueCalls.first?.payload as? CreateCommentPayload)?.clientMutationId else {
            return XCTFail("no createComment enqueue")
        }
        XCTAssertEqual(sut.comments.count, 1, "ligne optimiste posée")

        let echo: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"p1","clientMutationId":"\(cmid)","comment":{"id":"srv-1","content":"Hello","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"me","username":"me"}},"commentCount":1}
        """)
        socket.commentAdded.send(echo)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.comments.count, 1, "l'écho remplace la ligne optimiste — jamais de doublon")
        XCTAssertEqual(sut.comments.first?.id, "srv-1")
    }

    /// Même contrat pour une réponse : réconciliation en place dans le fil ET
    /// pas de second incrément du compteur du parent (déjà bumpé à l'insertion
    /// optimiste de sendReply).
    func test_commentAdded_withCmid_replacesOptimisticReply_withoutDoubleCountingParent() async {
        let queue = MockOfflineQueue()
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, offlineQueue: queue, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [root]
        sut.replyingTo = root

        await sut.sendReply("Coucou")
        guard let cmid = (queue.enqueueCalls.first?.payload as? CreateCommentPayload)?.clientMutationId else {
            return XCTFail("no createComment enqueue")
        }
        XCTAssertEqual(sut.repliesMap["c1"]?.count, 1, "réponse optimiste posée")
        XCTAssertEqual(sut.comments.first?.replies, 1, "compteur du parent bumpé par l'optimiste")

        let echo: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"p1","clientMutationId":"\(cmid)","comment":{"id":"srv-r1","content":"Coucou","parentId":"c1","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"me","username":"me"}},"commentCount":2}
        """)
        socket.commentAdded.send(echo)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.repliesMap["c1"]?.count, 1, "l'écho remplace la réponse optimiste — pas de doublon")
        XCTAssertEqual(sut.repliesMap["c1"]?.first?.id, "srv-r1")
        XCTAssertEqual(sut.comments.first?.replies, 1,
                       "le compteur du parent ne doit PAS être ré-incrémenté par l'écho de notre propre réponse")
    }

    /// Sans cmid (client legacy), le commentaire d'un TIERS s'insère
    /// normalement — la réconciliation ne doit pas gober les vrais nouveaux.
    func test_commentAdded_withoutCmid_insertsThirdPartyComment() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        let echo: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"p1","comment":{"id":"c-other","content":"Salut","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"other","username":"other"}},"commentCount":1}
        """)
        socket.commentAdded.send(echo)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.comments.count, 1)
        XCTAssertEqual(sut.comments.first?.id, "c-other")
    }

    // MARK: - Édition de commentaire (PATCH + écho comment:updated)

    /// L'édition remplace la ligne EN PLACE (contenu + effets) et PATCHe le
    /// serveur ; le contenu modifié invalide la traduction locale (le pipeline
    /// régénère, l'écho comment:translation-updated re-remplira).
    func test_updateComment_replacesRowInPlace_andPatchesServer() async {
        let mock = MockPostService()
        mock.updateCommentResult = .success(Self.stubComment)
        let (sut, _) = makeSUT(postService: mock)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let original = FeedComment(id: "c1", author: "moi", authorId: "me", content: "Avant",
                                   translatedContent: "Before", currentUserReactions: nil)
        sut.comments = [original]

        await sut.updateComment(original, content: "Après", effectFlags: 65536)

        XCTAssertEqual(sut.comments.count, 1, "édition = remplacement, jamais d'insertion")
        XCTAssertEqual(sut.comments.first?.content, "Après")
        XCTAssertEqual(sut.comments.first?.effectFlags, 65536, "les effets visuels éditent avec le texte")
        XCTAssertNil(sut.comments.first?.translatedContent,
                     "la traduction décrivait l'ANCIEN texte — invalidée localement")
        XCTAssertEqual(mock.updateCommentCallCount, 1)
        XCTAssertEqual(mock.lastUpdateCommentContent, "Après")
        XCTAssertEqual(mock.lastUpdateCommentEffectFlags, 65536)
    }

    func test_updateComment_serverRejects_rollsBackTheRow() async {
        let mock = MockPostService()
        mock.updateCommentResult = .failure(NSError(domain: "test", code: 403))
        let (sut, _) = makeSUT(postService: mock)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let original = FeedComment(id: "c1", author: "moi", authorId: "me", content: "Avant")
        sut.comments = [original]

        await sut.updateComment(original, content: "Après", effectFlags: 0)

        XCTAssertEqual(sut.comments.first?.content, "Avant", "refus serveur → rollback complet")
    }

    /// L'écho `comment:updated` d'un AUTRE appareil remplace la ligne en place.
    func test_commentUpdatedEcho_replacesRowInPlace() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        sut.comments = [FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Avant")]

        let echo: SocketCommentUpdatedData = JSONStub.decode("""
        {"postId":"p1","comment":{"id":"c1","content":"Après","effectFlags":131072,"createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"alice"}}}
        """)
        socket.commentUpdated.send(echo)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.comments.count, 1)
        XCTAssertEqual(sut.comments.first?.content, "Après")
        XCTAssertEqual(sut.comments.first?.effectFlags, 131072,
                       "les effets (pulse) voyagent dans l'écho et rendent dans toutes les vues")
    }

    // MARK: - Réactions de commentaire : agrégat absolu (anti double-compte)

    /// L'événement cœur porte l'agrégat ABSOLU : la réconciliation pose
    /// `likes = count` et PURGE le delta optimiste. L'ancien ±1 laissait le
    /// delta de sa propre réaction empilé pour toute la session → dès que la
    /// base était rafraîchie, `likes + delta` comptait DOUBLE.
    func test_commentReactionAdded_appliesAbsoluteCountAndPurgesDelta() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        sut.comments = [FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", likes: 2)]
        sut.commentLikeDelta["c1"] = 1

        let event: SocketCommentReactionUpdateEvent = JSONStub.decode("""
        {"commentId":"c1","postId":"p1","userId":"me","emoji":"\u{2764}\u{FE0F}","action":"added","aggregation":{"emoji":"\u{2764}\u{FE0F}","count":3,"userIds":["me","u2","u3"],"hasCurrentUser":true}}
        """)
        socket.commentReactionAdded.send(event)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.comments.first?.likes, 3, "le count absolu de l'agrégat fait autorité")
        XCTAssertNil(sut.commentLikeDelta["c1"], "le delta optimiste est purgé — likes + delta ne compte plus double")
    }

    func test_commentReactionAggregate_updatesReplyRowInsideRepliesMap() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        sut.comments = [FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 1)]
        sut.repliesMap = ["c1": [FeedComment(id: "r1", author: "bob", authorId: "a2", content: "Reply", likes: 0, parentId: "c1")]]
        sut.commentLikeDelta["r1"] = 1

        sut.applyCommentReactionAggregate(commentId: "r1", count: 5, reactorUserIds: ["u9"], actorUserId: "u9")

        XCTAssertEqual(sut.repliesMap["c1"]?.first?.likes, 5)
        XCTAssertNil(sut.commentLikeDelta["r1"])
    }

    /// L'agrégat d'un TIERS ne connaît pas un like local encore en vol : il ne
    /// doit ni éteindre le cœur ni faire régresser le compte affiché. Seul un
    /// événement dont JE suis l'acteur fait autorité pour retirer mon cœur.
    func test_commentReactionAggregate_thirdPartyEvent_preservesInFlightOwnHeart() async throws {
        // Le résolveur lit AuthManager.shared (non injectable ici) : sans
        // session, la branche « mon cœur » est inerte — rien à vérifier.
        guard let myId = AuthManager.shared.currentUser?.id, myId != "u9" else {
            throw XCTSkip("nécessite une session utilisateur courante")
        }
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        sut.comments = [FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", likes: 1)]
        sut.commentLikedIds.insert("c1")

        // Tiers "u9" like pendant que MON like n'est pas encore persisté
        // (absent de userIds) : cœur préservé, mon like compté par-dessus.
        sut.applyCommentReactionAggregate(commentId: "c1", count: 1, reactorUserIds: ["u9"], actorUserId: "u9")
        XCTAssertTrue(sut.commentLikedIds.contains("c1"), "le cœur en vol n'est pas éteint par l'agrégat d'un tiers")
        XCTAssertEqual(sut.comments.first?.likes, 2, "le like en vol est compté par-dessus l'agrégat du tiers")

        // Événement dont JE suis l'acteur (unlike depuis un autre appareil) :
        // l'agrégat fait autorité et retire le cœur.
        sut.applyCommentReactionAggregate(commentId: "c1", count: 1, reactorUserIds: ["u9"], actorUserId: myId)
        XCTAssertFalse(sut.commentLikedIds.contains("c1"), "mon propre événement fait autorité pour mon cœur")
        XCTAssertEqual(sut.comments.first?.likes, 1)
    }

    // MARK: - topLevelComments

    func test_topLevelComments_filtersParentComments() async {
        let (sut, mock) = makeSUT()
        let comments: [APIPostComment] = [
            JSONStub.decode("""
            {"id":"c1","content":"Top","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
            """),
            JSONStub.decode("""
            {"id":"c2","content":"Reply","parentId":"c1","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a2","username":"bob"}}
            """)
        ]
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: comments))

        await sut.loadComments("p1")

        XCTAssertEqual(sut.topLevelComments.count, 1)
        XCTAssertEqual(sut.topLevelComments[0].id, "c1")
    }

    // MARK: - resolveCommentTranslation

    func test_resolveCommentTranslation_matchesPreferred_returnsTranslation() {
        let entry: APIPostTranslationEntry = JSONStub.decode("""
        {"text":"Bonjour","translationModel":null,"confidenceScore":null}
        """)
        let translations: [String: APIPostTranslationEntry] = ["fr": entry]

        let result = PostDetailViewModel.resolveCommentTranslation(
            translations: translations, originalLanguage: "en", preferredLanguages: ["fr"]
        )

        XCTAssertEqual(result, "Bonjour")
    }

    func test_resolveCommentTranslation_originalMatchesPreferred_returnsNil() {
        let entry: APIPostTranslationEntry = JSONStub.decode("""
        {"text":"Bonjour","translationModel":null,"confidenceScore":null}
        """)
        let translations: [String: APIPostTranslationEntry] = ["fr": entry]

        let result = PostDetailViewModel.resolveCommentTranslation(
            translations: translations, originalLanguage: "fr", preferredLanguages: ["fr"]
        )

        XCTAssertNil(result)
    }

    func test_resolveCommentTranslation_noTranslations_returnsNil() {
        let result = PostDetailViewModel.resolveCommentTranslation(
            translations: nil, originalLanguage: "en", preferredLanguages: ["fr"]
        )

        XCTAssertNil(result)
    }

    // MARK: - LanguageProviding DI

    /// `userLanguage` must come from the injected provider, not from
    /// `AuthManager.shared`. Without DI this test would be flaky because
    /// other suites pollute the singleton with their own `currentUser`.
    func test_userLanguage_usesInjectedLanguageProvider() {
        let (sut, _) = makeSUT(preferredLanguages: ["es", "pt"])

        XCTAssertEqual(sut.userLanguage, "es")
        XCTAssertEqual(sut.preferredLanguages, ["es", "pt"])
    }

    /// Empty preferred-languages list falls back to `"en"` (matches the
    /// FeedViewModel contract).
    func test_userLanguage_emptyProvider_fallsBackToEnglish() {
        let (sut, _) = makeSUT(preferredLanguages: [])

        XCTAssertEqual(sut.userLanguage, "en")
    }


    // MARK: - Fabriques d'événements socket
    //
    // `SocketPostLikedData` / `SocketPostUnlikedData` sont `Decodable` sans init
    // public : leur init memberwise est internal au SDK. On les construit donc
    // par décodage, comme le reste des stubs de ce fichier.

    private static func makeLiked(postId: String, userId: String, likeCount: Int) -> SocketPostLikedData {
        JSONStub.decode("""
        {"postId":"\(postId)","userId":"\(userId)","emoji":"\u{2764}\u{FE0F}","likeCount":\(likeCount),"reactionSummary":{}}
        """)
    }

    private static func makeUnliked(postId: String, userId: String, likeCount: Int) -> SocketPostUnlikedData {
        JSONStub.decode("""
        {"postId":"\(postId)","userId":"\(userId)","likeCount":\(likeCount),"reactionSummary":{}}
        """)
    }

    // MARK: - Like temps réel (post:liked / post:unliked)

    /// Le détail n'écoutait QUE les commentaires : un like posé depuis le feed,
    /// depuis le pager de réels ou par un autre utilisateur n'atteignait jamais
    /// l'écran ouvert, dont le compteur restait figé jusqu'au prochain fetch.
    func test_postLiked_appliesAbsoluteServerCountToTheDisplayedPost() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        socket.postLiked.send(Self.makeLiked(postId: "p1", userId: "other", likeCount: 17))
        await Task.yield()

        XCTAssertEqual(sut.post?.likes, 17)
    }

    func test_postUnliked_appliesAbsoluteServerCountToTheDisplayedPost() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        socket.postUnliked.send(Self.makeUnliked(postId: "p1", userId: "other", likeCount: 4))
        await Task.yield()

        XCTAssertEqual(sut.post?.likes, 4)
    }

    /// Un événement portant sur un AUTRE post ne doit pas écraser le compteur
    /// du post affiché (le filtre par postId est la seule garde).
    func test_postLiked_forAnotherPost_leavesTheDisplayedPostUntouched() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        let before = sut.post?.likes

        socket.postLiked.send(Self.makeLiked(postId: "another", userId: "other", likeCount: 999))
        await Task.yield()

        XCTAssertEqual(sut.post?.likes, before)
    }

    /// Le like d'un TIERS monte le compteur sans allumer le cœur de
    /// l'utilisateur courant.
    func test_postLiked_byAnotherUser_doesNotFlipIsLiked() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")

        socket.postLiked.send(Self.makeLiked(postId: "p1", userId: "definitely-not-me", likeCount: 17))
        await Task.yield()

        XCTAssertEqual(sut.post?.isLiked, false)
    }

    // MARK: - Reconnect (didReconnect) — vm-reconnect-stories-detail-01

    /// La room du post est re-jointe au .connect (le flux VIVANT reprend),
    /// mais les événements émis PENDANT la coupure restent irréconciliés :
    /// le reconnect doit refetch le post (compteurs absolus) + la page 1.
    func test_subscribeToSocket_reconnect_refetchesPostAndCommentsPage1() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1", content: "Fresh"))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        sut.subscribeToSocket("p1")
        let postsBefore = mock.getPostCallCount
        let commentsBefore = mock.getCommentsCallCount

        socket.didReconnect.send(())
        try? await waitForCondition(timeout: 5.0) {
            mock.getPostCallCount > postsBefore && mock.getCommentsCallCount > commentsBefore
        }

        XCTAssertEqual(mock.getPostCallCount, postsBefore + 1,
                       "le reconnect refetch le post pour les compteurs absolus")
        XCTAssertEqual(mock.getCommentsCallCount, commentsBefore + 1,
                       "le reconnect refetch la page 1 des commentaires")
    }

    /// La page 1 refetchée peut recouvrir des commentaires déjà affichés :
    /// la dédup par id rend l'append idempotent — jamais de flash-vide.
    func test_subscribeToSocket_reconnect_dedupesExistingComments() async {
        let socket = MockSocialSocket()
        let mock = MockPostService()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: [Self.stubComment]))
        let (sut, _) = makeSUT(postService: mock, socialSocket: socket)
        await sut.loadPost("p1")
        await sut.loadComments("p1")
        sut.subscribeToSocket("p1")
        XCTAssertEqual(sut.comments.count, 1)
        let commentsCallsBefore = mock.getCommentsCallCount

        socket.didReconnect.send(())
        try? await waitForCondition(timeout: 5.0) { mock.getCommentsCallCount > commentsCallsBefore }

        XCTAssertEqual(sut.comments.count, 1,
                       "même page 1 → dédup par id, pas de doublon ni de flash-vide")
    }

    // MARK: - L2c/F1 — une mutation reçue À DISTANCE doit réécrire sa clé de cache

    private static func makeCommentDeleted(postId: String, commentId: String, commentCount: Int) -> SocketCommentDeletedData {
        JSONStub.decode("""
        {"postId":"\(postId)","commentId":"\(commentId)","commentCount":\(commentCount)}
        """)
    }

    private static func makeCommentMediaUpdated(postId: String, commentId: String, parentId: String? = nil) -> SocketCommentMediaUpdatedData {
        let parent = parentId.map { "\"parentId\":\"\($0)\"," } ?? ""
        return JSONStub.decode("""
        {"postId":"\(postId)","commentId":"\(commentId)","comment":{"id":"\(commentId)",\(parent)"content":"","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"},"media":[{"id":"m1","fileUrl":"https://cdn/audio.m4a","mimeType":"audio/m4a","transcription":{"text":"salut","language":"fr"}}]}}
        """)
    }

    /// Poll la clé de cache : la réécriture part dans un `Task` détaché du
    /// sink, donc invisible à un simple `await Task.yield()`.
    private func cachedComments(
        _ key: String,
        timeout: TimeInterval = 5.0,
        until predicate: ([FeedComment]) -> Bool
    ) async -> [FeedComment] {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let snapshot = await CacheCoordinator.shared.comments.load(for: key).snapshot(), predicate(snapshot) {
                return snapshot
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return await CacheCoordinator.shared.comments.load(for: key).snapshot() ?? []
    }

    /// `comment:deleted` d'un autre appareil ne muait que la mémoire : la
    /// version cachée ressuscitait le commentaire supprimé à la ré-ouverture
    /// (feuille, détail et overlay story lisent la MÊME clé).
    func test_commentDeleted_socketEcho_rewritesTheCachedTopLevelPage() async {
        let postId = "pDeletedSink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        sut.comments = [
            FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Reste"),
            FeedComment(id: "c2", author: "bob", authorId: "a2", content: "Part")
        ]
        try? await CacheCoordinator.shared.comments.save(sut.comments, for: "post-\(postId)")
        sut.subscribeToSocket(postId)

        socket.commentDeleted.send(Self.makeCommentDeleted(postId: postId, commentId: "c2", commentCount: 1))

        let cached = await cachedComments("post-\(postId)") { page in page.allSatisfy { $0.id != "c2" } }
        XCTAssertEqual(cached.map(\.id), ["c1"],
                       "sans réécriture, le commentaire supprimé revient de la clé cachée")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    /// Une RÉPONSE supprimée touche DEUX clés : son fil, et la page top-level
    /// dont le compteur de réponses du parent vient de bouger.
    func test_commentDeleted_ofAReply_rewritesBothTheThreadAndTheTopLevelKeys() async {
        let postId = "pDeletedReplySink"
        let parentId = "cReplySink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        await CacheCoordinator.shared.comments.invalidate(for: "replies-\(parentId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        let parent = FeedComment(id: parentId, author: "alice", authorId: "a1", content: "Top", replies: 1)
        let reply = FeedComment(id: "r1", author: "bob", authorId: "a2", content: "Reply", parentId: parentId)
        sut.comments = [parent]
        sut.repliesMap = [parentId: [reply]]
        try? await CacheCoordinator.shared.comments.save(sut.comments, for: "post-\(postId)")
        try? await CacheCoordinator.shared.comments.save([reply], for: "replies-\(parentId)")
        sut.subscribeToSocket(postId)

        socket.commentDeleted.send(Self.makeCommentDeleted(postId: postId, commentId: "r1", commentCount: 1))

        let thread = await cachedComments("replies-\(parentId)") { $0.isEmpty }
        XCTAssertTrue(thread.isEmpty, "la réponse supprimée sort de son fil en cache")
        let page = await cachedComments("post-\(postId)") { page in page.first?.replies == 0 }
        XCTAssertEqual(page.first?.replies, 0,
                       "le compteur du parent a bougé : `post-` est la SECONDE clé touchée")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        await CacheCoordinator.shared.comments.invalidate(for: "replies-\(parentId)")
    }

    /// `comment:media-updated` porte la transcription et les variantes TTS —
    /// elles ne vivaient qu'en mémoire, et l'écran suivant reservait le média NU.
    func test_commentMediaUpdated_socketEcho_rewritesTheCachedTopLevelPage() async {
        let postId = "pMediaSink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        sut.comments = [FeedComment(id: "cAudio", author: "alice", authorId: "a1", content: "")]
        try? await CacheCoordinator.shared.comments.save(sut.comments, for: "post-\(postId)")
        sut.subscribeToSocket(postId)

        socket.commentMediaUpdated.send(Self.makeCommentMediaUpdated(postId: postId, commentId: "cAudio"))

        let cached = await cachedComments("post-\(postId)") { page in page.first?.media.isEmpty == false }
        XCTAssertEqual(cached.first?.media.count, 1,
                       "le média enrichi doit atterrir en cache, pas seulement en mémoire")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    /// Garde NÉGATIVE : un sink qui tire avant le premier chargement écrirait
    /// une page VIDE par-dessus la page déjà cachée sous la même clé.
    func test_commentDeleted_beforeAnythingIsLoaded_neverOverwritesTheCachedPage() async {
        let postId = "pDeletedNoopSink"
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
        let socket = MockSocialSocket()
        let (sut, _) = makeSUT(socialSocket: socket)
        let seeded = (0..<20).map { FeedComment(id: "cached-\($0)", author: "alice", authorId: "a1", content: "c\($0)") }
        try? await CacheCoordinator.shared.comments.save(seeded, for: "post-\(postId)")
        sut.subscribeToSocket(postId)

        socket.commentDeleted.send(Self.makeCommentDeleted(postId: postId, commentId: "absent", commentCount: 20))
        try? await Task.sleep(nanoseconds: 300_000_000)

        let cached = await CacheCoordinator.shared.comments.load(for: "post-\(postId)").snapshot() ?? []
        XCTAssertEqual(cached.count, 20,
                       "rien n'a bougé en mémoire : rien ne doit être écrit")
        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    // MARK: - L2c/F1 — `CommentsSheetView.commentCacheWrites` (la feuille n'est pas instrumentable)

    func test_commentCacheWrites_topLevelPageNotLoaded_neverWritesThePostKey() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: nil,
            repliesMap: ["c1": [FeedComment(id: "r1", author: "bob", content: "Reply", parentId: "c1")]],
            touchedThreadIds: ["c1"]
        )

        XCTAssertEqual(writes.map(\.key), ["replies-c1"],
                       "écrire le repli `post.comments` écraserait la page complète déjà cachée")
    }

    func test_commentCacheWrites_threadNotMounted_skipsTheOrphanKey() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: [FeedComment(id: "c1", author: "alice", content: "Top")],
            repliesMap: [:],
            touchedThreadIds: ["c1"]
        )

        XCTAssertEqual(writes.map(\.key), ["post-p1"],
                       "la clé orpheline d'un top-level supprimé n'est jamais écrite : plus rien ne la relira")
    }

    func test_commentCacheWrites_deletedReply_writesBothTheThreadAndThePostKeys() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: [FeedComment(id: "c1", author: "alice", content: "Top")],
            repliesMap: ["c1": []],
            touchedThreadIds: ["c1"]
        )

        XCTAssertEqual(writes.map(\.key), ["replies-c1", "post-p1"])
    }

    func test_commentCacheWrites_dropsUnconfirmedOptimisticRows() {
        let writes = CommentsSheetView.commentCacheWrites(
            postId: "p1",
            liveComments: [
                FeedComment(id: "cmid_pending", author: "moi", content: "En vol"),
                FeedComment(id: "c1", author: "alice", content: "Top")
            ],
            repliesMap: [:],
            touchedThreadIds: []
        )

        XCTAssertEqual(writes.first?.comments.map(\.id), ["c1"],
                       "une ligne optimiste persistée resterait en cache pour toujours : le serveur ne la renverra jamais")
    }
}
