import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// `PostDetailViewModel` — les COMMENTAIRES : pagination, envoi, réponses,
/// écho socket, édition, réactions, traduction.
@MainActor
final class PostDetailCommentsTests: PostDetailViewModelTestCase {

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
    /// apparaît "liké" (`commentHearts`) après chargement, les autres non.
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

        XCTAssertTrue(sut.commentHearts.isLiked("cLiked"))
        XCTAssertFalse(sut.commentHearts.isLiked("cFire"))
        XCTAssertFalse(sut.commentHearts.isLiked("cNone"))
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
        // Après un cache FRAIS, rien n'a été chargé : l'état est « je ne sais
        // pas encore » (#4868). L'assertion mesure ce qui compte — la pagination
        // n'est pas BLOQUÉE — sans affirmer qu'on sait qu'il y a une suite.
        XCTAssertNotEqual(sut.hasMoreComments, false)
        XCTAssertEqual(mock.getCommentsCallCount, 0)

        mock.getCommentsResult = .success(Self.makePaginatedComments(comments: [Self.stubComment], hasMore: true, nextCursor: "next-page"))

        await sut.loadMoreComments(postId)

        XCTAssertEqual(mock.getCommentsCallCount, 1, "Should fetch page 1 with a nil cursor to recover a real cursor")
        XCTAssertTrue(sut.comments.contains(where: { $0.id == "c1" }))

        await CacheCoordinator.shared.comments.invalidate(for: "post-\(postId)")
    }

    // MARK: - loadCommentsUntilPresent (chasse paginée — commentaire notifié)

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

        await sut.sendComment("New comment", originalLanguage: "en")

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

        await sut.sendComment("Failing comment", originalLanguage: "en")

        XCTAssertTrue(sut.comments.isEmpty)
    }

    // MARK: - Langue d'écriture sur la LIGNE OPTIMISTE (#6587)

    //
    // `FeedComment.originalLanguage` n'est pas décoratif : il alimente la
    // descente du prisme (`resolveCommentTranslation`) et la pastille
    // `LanguageFlagChip`. Le lot #6587 a fait voyager la langue déclarée
    // jusqu'au serveur ; la ligne que l'auteur VOIT pendant ce temps ne la
    // portait pas — il lisait donc son propre commentaire frais SANS pastille,
    // et la ligne était PERSISTÉE ainsi (`savePreservingFreshness` suit
    // l'enfilement), donc l'écart survivait à un redémarrage jusqu'à l'écho
    // socket. C'est « qui AFFICHE ce que tu résous » appliqué à la valeur que
    // le lot venait de rendre disponible.
    //
    // La langue déclarée est délibérément DIFFÉRENTE de celle que le contenu
    // suggère : un témoin qui déclarerait « fr » sur du français ne pourrait
    // pas distinguer une déclaration servie d'une devinette.

    func test_sendComment_stampsTheAuthoredLanguageOnTheOptimisticRow() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")

        await sut.sendComment("Ceci a tout l'air d'être du français", originalLanguage: "de")

        XCTAssertEqual(sut.comments.first?.originalLanguage, "de",
                       "la ligne optimiste doit porter la langue de la pastille, pas nil")
        let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload
        XCTAssertEqual(payload?.originalLanguage, sut.comments.first?.originalLanguage,
                       "la ligne AFFICHÉE et la ligne ENVOYÉE déclarent la même langue")
    }

    func test_sendReply_stampsTheAuthoredLanguageOnTheOptimisticReply() async {
        let queue = MockOfflineQueue()
        let (sut, mock) = makeSUT(offlineQueue: queue)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let root = FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 0)
        sut.comments = [root]
        sut.replyingTo = root

        await sut.sendReply("Ceci a tout l'air d'être du français", originalLanguage: "de")

        XCTAssertEqual(sut.repliesMap["c1"]?.first?.originalLanguage, "de",
                       "la réponse optimiste doit porter la langue de la pastille, pas nil")
        let payload = queue.enqueueCalls.first?.payload as? CreateCommentPayload
        XCTAssertEqual(payload?.originalLanguage, sut.repliesMap["c1"]?.first?.originalLanguage,
                       "la réponse AFFICHÉE et la réponse ENVOYÉE déclarent la même langue")
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

        await sut.sendReply("Coucou", originalLanguage: "en", effectFlags: 4)

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

        await sut.sendReply("@bob ok", originalLanguage: "en")

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

        await sut.sendReply("Coucou", originalLanguage: "en")

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

        await sut.sendReply("Coucou", originalLanguage: "en")

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

        await sut.sendComment("Hello", originalLanguage: "en")
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

        await sut.sendReply("Coucou", originalLanguage: "en")
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

        await sut.updateComment(original, content: "Après", effectFlags: 65536, originalLanguage: nil)

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

        await sut.updateComment(original, content: "Après", effectFlags: 0, originalLanguage: nil)

        XCTAssertEqual(sut.comments.first?.content, "Avant", "refus serveur → rollback complet")
    }

    /// #16930 — la passerelle refuse le PATCH d'un commentaire quand le fil est
    /// fermé (`403 COMMENTS_DISABLED`) : la ligne revient, et la page se ferme
    /// tout de suite, comme après un envoi refusé — sans attendre `post:updated`.
    func test_updateComment_refusedBecauseCommentsAreClosed_rollsBackAndClosesThePage() async {
        let mock = MockPostService()
        mock.updateCommentResult = .failure(MeeshyError.forbidden(
            reason: "Les commentaires sont désactivés",
            body: Data(#"{"success":false,"error":"Les commentaires sont désactivés","code":"COMMENTS_DISABLED"}"#.utf8)))
        let (sut, _) = makeSUT(postService: mock)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let original = FeedComment(id: "c1", author: "moi", authorId: "me", content: "Avant")
        sut.comments = [original]
        XCTAssertFalse(sut.commentsClosed)

        await sut.updateComment(original, content: "Après", effectFlags: 0, originalLanguage: nil)

        XCTAssertEqual(sut.comments.first?.content, "Avant")
        XCTAssertTrue(sut.commentsClosed)
    }

    func test_updateComment_refusedForAnotherReason_leavesThePageOpen() async {
        let mock = MockPostService()
        mock.updateCommentResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))
        let (sut, _) = makeSUT(postService: mock)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let original = FeedComment(id: "c1", author: "moi", authorId: "me", content: "Avant")
        sut.comments = [original]

        await sut.updateComment(original, content: "Après", effectFlags: 0, originalLanguage: nil)

        XCTAssertEqual(sut.comments.first?.content, "Avant")
        XCTAssertFalse(sut.commentsClosed)
    }

    /// #6600 — la langue de la pastille traverse le ViewModel jusqu'au service :
    /// corriger un commentaire la DÉCLARE, la passerelle ne la remet plus à null.
    func test_updateComment_withDeclaredLanguage_forwardsItToTheService() async {
        let mock = MockPostService()
        mock.updateCommentResult = .success(Self.stubComment)
        let (sut, _) = makeSUT(postService: mock)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let original = FeedComment(id: "c1", author: "moi", authorId: "me", content: "Hola", originalLanguage: "es")
        sut.comments = [original]

        await sut.updateComment(original, content: "Hola a todos", effectFlags: 0, originalLanguage: "es")

        XCTAssertEqual(mock.updateCommentCallCount, 1)
        XCTAssertEqual(mock.lastUpdateCommentOriginalLanguage, "es")
    }

    /// Repli : une édition sans langue déclarée n'en invente aucune.
    func test_updateComment_withoutDeclaredLanguage_sendsNone() async {
        let mock = MockPostService()
        mock.updateCommentResult = .success(Self.stubComment)
        let (sut, _) = makeSUT(postService: mock)
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        let original = FeedComment(id: "c1", author: "moi", authorId: "me", content: "Avant")
        sut.comments = [original]

        await sut.updateComment(original, content: "Après", effectFlags: 0, originalLanguage: nil)

        XCTAssertEqual(mock.updateCommentCallCount, 1)
        XCTAssertNil(mock.lastUpdateCommentOriginalLanguage)
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
        sut.commentHearts.markLiked(["c1"])
        _ = sut.commentHearts.begin("c1")

        let event: SocketCommentReactionUpdateEvent = JSONStub.decode("""
        {"commentId":"c1","postId":"p1","userId":"me","emoji":"\u{2764}\u{FE0F}","action":"added","aggregation":{"emoji":"\u{2764}\u{FE0F}","count":3,"userIds":["me","u2","u3"],"hasCurrentUser":true}}
        """)
        socket.commentReactionAdded.send(event)
        await Task.yield()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.comments.first?.likes, 3, "le count absolu de l'agrégat fait autorité")
        XCTAssertNil(sut.commentHearts.likeDelta["c1"], "le delta optimiste est purgé — likes + delta ne compte plus double")
    }

    func test_commentReactionAggregate_updatesReplyRowInsideRepliesMap() async {
        let (sut, mock) = makeSUT()
        mock.getPostResult = .success(Self.makeAPIPost(id: "p1"))
        await sut.loadPost("p1")
        sut.comments = [FeedComment(id: "c1", author: "alice", authorId: "a1", content: "Top", replies: 1)]
        sut.repliesMap = ["c1": [FeedComment(id: "r1", author: "bob", authorId: "a2", content: "Reply", likes: 0, parentId: "c1")]]
        sut.commentHearts.markLiked(["r1"])
        _ = sut.commentHearts.begin("r1")

        sut.applyCommentReactionAggregate(commentId: "r1", count: 5, reactorUserIds: ["u9"], actorUserId: "u9")

        XCTAssertEqual(sut.repliesMap["c1"]?.first?.likes, 5)
        XCTAssertNil(sut.commentHearts.likeDelta["r1"])
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
        _ = sut.commentHearts.begin("c1")

        // Tiers "u9" like pendant que MON like n'est pas encore persisté
        // (absent de userIds) : cœur préservé, mon like compté par-dessus.
        sut.applyCommentReactionAggregate(commentId: "c1", count: 1, reactorUserIds: ["u9"], actorUserId: "u9")
        XCTAssertTrue(sut.commentHearts.isLiked("c1"), "le cœur en vol n'est pas éteint par l'agrégat d'un tiers")
        XCTAssertEqual(sut.comments.first?.likes, 2, "le like en vol est compté par-dessus l'agrégat du tiers")

        // Événement dont JE suis l'acteur (unlike depuis un autre appareil) :
        // l'agrégat fait autorité et retire le cœur.
        sut.applyCommentReactionAggregate(commentId: "c1", count: 1, reactorUserIds: ["u9"], actorUserId: myId)
        XCTAssertFalse(sut.commentHearts.isLiked("c1"), "mon propre événement fait autorité pour mon cœur")
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
}
