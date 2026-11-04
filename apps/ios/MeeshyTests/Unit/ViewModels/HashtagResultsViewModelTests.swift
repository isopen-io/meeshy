import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class HashtagResultsViewModelTests: XCTestCase {
    private static func makeAPIPost(id: String = "post-1", content: String = "#paris") -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "POST",
            "content": "\(content)",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "likeCount": 0,
            "commentCount": 0,
            "author": {"id": "author-1", "username": "alice"}
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
            cursorJSON = #"{"nextCursor":"\#(cursor)","hasMore":\#(hasMore),"limit":20}"#
        } else if hasMore {
            cursorJSON = #"{"nextCursor":"cursor-next","hasMore":true,"limit":20}"#
        } else {
            cursorJSON = "null"
        }
        let postsJSON: String
        if posts.isEmpty {
            postsJSON = "[]"
        } else {
            let items = posts.map { p in
                #"{"id":"\#(p.id)","type":"\#(p.type ?? "POST")","content":"\#(p.content ?? "")","createdAt":"2026-01-15T12:00:00.000Z","likeCount":\#(p.likeCount ?? 0),"commentCount":\#(p.commentCount ?? 0),"author":{"id":"\#(p.author.id)","username":"\#(p.author.username ?? "user")"}}"#
            }
            postsJSON = "[\(items.joined(separator: ","))]"
        }
        return JSONStub.decode(#"{"success":true,"data":\#(postsJSON),"pagination":\#(cursorJSON),"error":null}"#)
    }

    /// Cycle 4 — un rafraîchissement pendant qu'une page arrive : la page de
    /// l'ANCIENNE liste ne se colle plus à la nouvelle.
    func test_loadMore_returningAfterARefresh_isDiscarded() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p1")], hasMore: true, nextCursor: "c2"))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()
        service.getPostsByHashtagByCursor["c2"] = Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p2")], hasMore: true, nextCursor: "c3")
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "n1")], hasMore: true, nextCursor: "n2"))
        service.duringGetPostsByHashtag = { [weak sut] cursor in
            guard cursor == "c2" else { return }
            await sut?.load()
        }

        await sut.loadMore()

        XCTAssertEqual(sut.posts.map(\.id), ["n1"], "la page 2 de l'ancienne liste ne rejoint pas la nouvelle")
        XCTAssertFalse(sut.isLoading)
    }

    func test_load_populatesPostsFromService() async {
        let service = MockPostService()
        let post = Self.makeAPIPost(id: "p1")
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [post]))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"])
        XCTAssertEqual(service.getPostsByHashtagCallCount, 1)
    }

    func test_load_setsIsLoadingFalseAfterCompletion() async {
        let service = MockPostService()
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertFalse(sut.isLoading)
    }

    func test_load_serviceThrows_leavesPostsEmpty_doesNotCrash() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .failure(URLError(.notConnectedToInternet))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)

        await sut.load()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadMore_appendsToExistingPosts_usingReturnedCursor() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p1")], hasMore: true, nextCursor: "20"))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p2")]))
        await sut.loadMore()

        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2"])
    }

    func test_loadMore_whenNoMorePages_doesNotCallServiceAgain() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(posts: [Self.makeAPIPost(id: "p1")], hasMore: false))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        await sut.loadMore()

        XCTAssertEqual(service.getPostsByHashtagCallCount, 1)
    }

    // MARK: - #10483 — chaque résultat affiché compte

    func test_recordImpression_eachAppearance_sendsAHashtagImpression() async {
        let service = MockPostService()
        let suite = "hashtag-reach-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let batcher = ImpressionBatcher(
            source: "search", surface: .hashtag, postService: service, flushDelay: 60,
            defaults: defaults, accountId: { "userA" }
        )
        let sut = HashtagResultsViewModel(tag: "paris", service: service, impressions: batcher)

        sut.recordImpression("p1")
        sut.recordImpression("p1")
        await sut.flushImpressions()

        XCTAssertEqual(service.recordedSocialEvents, [
            .impression(postId: "p1", source: "search", surface: .hashtag),
            .impression(postId: "p1", source: "search", surface: .hashtag),
        ], "Revoir un résultat le recompte : aucun dédoublonnage.")
    }

    /// Le serveur pagine par décalage : un post publié entre deux pages fait
    /// revenir le dernier montré en tête de la suivante. Un id en double dans
    /// `ForEach(posts)` rend l'identité des cellules indéfinie.
    func test_loadMore_whenThePageOverlapsTheShownOne_appendsEachPostOnce() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: ["p1", "p2", "p3"].map { Self.makeAPIPost(id: $0) }, hasMore: true, nextCursor: "3"))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: ["p3", "p4"].map { Self.makeAPIPost(id: $0) }, hasMore: false))
        await sut.loadMore()

        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2", "p3", "p4"])
    }

    /// Une requête perdue n'arrête pas le défilement infini pour toute la visite.
    func test_loadMore_afterATransientFailure_triesAgainOnTheNextScroll() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p1")], hasMore: true, nextCursor: "1"))
        let sut = HashtagResultsViewModel(tag: "paris", service: service)
        await sut.load()

        service.getPostsByHashtagResult = .failure(URLError(.networkConnectionLost))
        await sut.loadMore()
        service.getPostsByHashtagResult = .success(Self.makePaginatedResponse(
            posts: [Self.makeAPIPost(id: "p2")], hasMore: false))
        await sut.loadMore()

        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2"])
    }

    // MARK: - #15934 — « Repartager » republie depuis un hashtag

    /// Une page servie telle quelle : la carte `card` repartage `mid`, dont la
    /// racine est `root` — la chaîne que `RepostTargeting` doit remonter.
    private static func repostChainPage(repostCount: Int = 3, isRepostedByMe: Bool = false) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode(#"""
        {"success":true,"data":[{"id":"card","type":"POST","content":"#paris","createdAt":"2026-01-15T12:00:00.000Z",
        "likeCount":0,"commentCount":0,"repostCount":\#(repostCount),"isRepostedByMe":\#(isRepostedByMe),
        "author":{"id":"author-1","username":"alice"},
        "repostOf":{"id":"mid","createdAt":"2026-01-14T12:00:00.000Z","author":{"id":"author-2","username":"bob"},"originalRepostOfId":"root"}}],
        "pagination":null,"error":null}
        """#)
    }

    private func makeRepostSUT(
        service: MockPostService = MockPostService(),
        queue: MockOfflineQueue = MockOfflineQueue(),
        offline: Bool = false
    ) -> HashtagResultsViewModel {
        HashtagResultsViewModel(
            tag: "paris", service: service,
            repostPublisher: RepostPublisher(postService: service, offlineQueue: queue, isOffline: { offline })
        )
    }

    func test_toggleRepost_publishesTheRootAtTheCardFormat_andFlipsIconAndCounterAtOnce() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.repostChainPage(repostCount: 3))
        service.holdRepost(for: 5)
        let sut = makeRepostSUT(service: service)
        await sut.load()

        let task = Task { await sut.toggleRepost("card") }
        for _ in 0..<100 where !sut.posts[0].isRepostedByMe { await Task.yield() }
        XCTAssertTrue(sut.posts[0].isRepostedByMe, "l'icône bascule AVANT la réponse du réseau")
        XCTAssertEqual(sut.posts[0].repostCount, 4, "le compteur bouge avec l'icône")
        service.releaseRepost()
        await task.value

        XCTAssertEqual(service.repostCallCount, 1)
        XCTAssertEqual(service.lastRepostPostId, "root", "la référence remonte à la RACINE de la chaîne")
        XCTAssertEqual(service.lastRepostTargetType, .post, "le format reste celui de la carte")
        XCTAssertFalse(service.lastRepostIsQuote ?? true, "Repartager n'est pas Citer")
        XCTAssertNil(service.lastRepostVisibility, "l'audience est héritée de l'original")
        XCTAssertTrue(sut.posts[0].isRepostedByMe)
        XCTAssertEqual(sut.posts[0].repostCount, 4)
    }

    func test_toggleRepost_whenTheServerRefuses_rollsBackTheRepostOnly() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.repostChainPage(repostCount: 3))
        service.repostResult = .failure(URLError(.badServerResponse))
        let sut = makeRepostSUT(service: service)
        await sut.load()
        await sut.toggleLike("card")

        await sut.toggleRepost("card")

        XCTAssertFalse(sut.posts[0].isRepostedByMe, "l'échec défait la bascule")
        XCTAssertEqual(sut.posts[0].repostCount, 3, "et le compteur revient")
        XCTAssertTrue(sut.posts[0].isLiked, "le retour arrière ne défait pas un like voisin")
    }

    func test_toggleRepost_offline_queuesTheRepostInTheOutbox_andKeepsTheCardReposted() async throws {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.repostChainPage())
        let queue = MockOfflineQueue()
        let sut = makeRepostSUT(service: service, queue: queue, offline: true)
        await sut.load()

        await sut.toggleRepost("card")

        XCTAssertEqual(service.repostCallCount, 0, "hors ligne, rien ne part sur le réseau")
        let call = try XCTUnwrap(queue.enqueueCalls.first)
        XCTAssertEqual(call.kind, .repostPost)
        XCTAssertEqual((call.payload as? RepostPostPayload)?.postId, "root")
        XCTAssertTrue(sut.posts[0].isRepostedByMe, "la ligne enfilée partira au retour du réseau")
    }

    func test_toggleRepost_onACardAlreadyReposted_sendsNothing() async {
        let service = MockPostService()
        service.getPostsByHashtagResult = .success(Self.repostChainPage(repostCount: 1, isRepostedByMe: true))
        let sut = makeRepostSUT(service: service)
        await sut.load()

        await sut.toggleRepost("card")

        XCTAssertEqual(service.repostCallCount, 0, "le repartage est append-only : un second toucher n'envoie rien")
        XCTAssertEqual(sut.posts[0].repostCount, 1)
    }
}
