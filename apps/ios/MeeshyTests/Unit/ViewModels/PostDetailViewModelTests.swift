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
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) -> (sut: PostDetailViewModel, postService: MockPostService) {
        let languageProvider = MockLanguageProvider(preferredLanguages: preferredLanguages)
        let sut = PostDetailViewModel(
            postService: postService,
            languageProvider: languageProvider,
            offlineQueue: offlineQueue
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
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [root]
        sut.replyingTo = root

        await sut.sendReply("Coucou")

        XCTAssertEqual(mock.lastAddCommentParentId, "c1", "répondre à une racine se rattache à elle")
    }

    func test_sendReply_toReply_staysFlatUnderRoot() async {
        let (sut, mock) = makeSUT()
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
        XCTAssertEqual(mock.lastAddCommentParentId, "c1")
        // La nouvelle réponse s'ajoute sous c1 (et non sous r1, qui ne porte pas de fil).
        XCTAssertEqual(sut.repliesMap["c1"]?.count, 2)
        XCTAssertNil(sut.repliesMap["r1"], "aucun sous-fil créé sous une réponse")
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
}
