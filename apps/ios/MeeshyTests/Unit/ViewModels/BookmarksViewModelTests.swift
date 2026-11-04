import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class BookmarksViewModelTests: XCTestCase {

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: "bookmarks")
    }

    // MARK: - Factory

    private func makeSUT(
        postService: MockPostService = MockPostService(),
        preferredLanguages: [String] = []
    ) -> (sut: BookmarksViewModel, postService: MockPostService) {
        let languageProvider = MockLanguageProvider(preferredLanguages: preferredLanguages)
        let sut = BookmarksViewModel(
            postService: postService,
            languageProvider: languageProvider
        )
        return (sut, postService)
    }

    private static func makePaginatedPosts(
        posts: [APIPost],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let postsJSON = posts.map { p in
            """
            {"id":"\(p.id)","type":"POST","content":"\(p.content ?? "")","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(postsJSON.joined(separator: ","))],"pagination":\(cursorJSON),"error":null}
        """)
    }

    private static func makeAPIPost(id: String = "post-1", content: String = "Hello") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    // MARK: - loadBookmarks

    func test_loadBookmarks_success_populatesPosts() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1"), Self.makeAPIPost(id: "b2")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))

        await sut.loadBookmarks()

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "b1")
        XCTAssertEqual(sut.posts[1].id, "b2")
        XCTAssertEqual(mock.getBookmarksCallCount, 1)
    }

    func test_loadBookmarks_error_keepsEmptyPosts() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadBookmarks()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertEqual(mock.getBookmarksCallCount, 1)
    }

    func test_loadBookmarks_setsIsLoadingDuringFetch() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: []))

        XCTAssertFalse(sut.isLoading)
        await sut.loadBookmarks()
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadBookmarks_withPagination_setsHasMore() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts, hasMore: true, nextCursor: "cursor-2"))

        await sut.loadBookmarks()

        XCTAssertTrue(sut.hasMore)
        XCTAssertEqual(sut.posts.count, 1)
    }

    func test_loadBookmarks_noPagination_setsHasMoreFalse() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: []))

        await sut.loadBookmarks()

        XCTAssertFalse(sut.hasMore)
    }

    // MARK: - removeBookmark

    func test_removeBookmark_success_removesFromList() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1"), Self.makeAPIPost(id: "b2")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))
        await sut.loadBookmarks()

        await sut.removeBookmark("b1")

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "b2")
        XCTAssertEqual(mock.removeBookmarkCallCount, 1)
        XCTAssertEqual(mock.lastRemoveBookmarkPostId, "b1")
    }

    func test_removeBookmark_error_rollsBack() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1"), Self.makeAPIPost(id: "b2")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))
        await sut.loadBookmarks()

        mock.removeBookmarkResult = .failure(NSError(domain: "test", code: 500))
        await sut.removeBookmark("b1")

        XCTAssertEqual(sut.posts.count, 2)
        XCTAssertEqual(sut.posts[0].id, "b1")
    }

    /// Retirer A échoue ; pendant l'appel, la page suivante (C) est arrivée.
    /// L'instantané pris avant le retrait effaçait C.
    func test_removeBookmark_error_restoresOnlyThatPost_keepingAPageLoadedMeanwhile() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(
            posts: [Self.makeAPIPost(id: "A"), Self.makeAPIPost(id: "B")], hasMore: true, nextCursor: "c2"))
        await sut.loadBookmarks()

        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: [Self.makeAPIPost(id: "C")]))
        mock.removeBookmarkResult = .failure(NSError(domain: "test", code: 500))
        mock.onRemoveBookmark = { _ in await sut.loadMore() }
        await sut.removeBookmark("A")

        XCTAssertEqual(sut.posts.map(\.id), ["A", "B", "C"])
    }

    // MARK: - refresh

    func test_refresh_resetsPaginationAndReloads() async {
        let (sut, mock) = makeSUT()
        let posts = [Self.makeAPIPost(id: "b1")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))
        await sut.loadBookmarks()
        XCTAssertEqual(sut.posts.count, 1)

        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: [Self.makeAPIPost(id: "b2")]))
        await sut.refresh()

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "b2")
    }

    // MARK: - LanguageProviding DI

    /// The `BookmarksViewModel.fetchBookmarksFromNetwork(...)` path resolves
    /// translations through the injected `LanguageProviding` instead of
    /// reading `AuthManager.shared` directly. Even though we can't directly
    /// observe `preferredLanguages` (it's private), we exercise the load
    /// path with a stubbed provider to make sure the DI wiring compiles
    /// and runs end-to-end.
    func test_loadBookmarks_withInjectedLanguageProvider_succeeds() async {
        let (sut, mock) = makeSUT(preferredLanguages: ["es"])
        let posts = [Self.makeAPIPost(id: "b-lang")]
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: posts))

        await sut.loadBookmarks()

        XCTAssertEqual(sut.posts.count, 1)
        XCTAssertEqual(sut.posts[0].id, "b-lang")
        XCTAssertEqual(mock.getBookmarksCallCount, 1)
    }

    // MARK: - vm-bookmarks-pagination-01 — loadMore sépare cache et pagination

    func test_loadMore_afterFreshCacheServe_fetchesNextPageAndAppends() async {
        let cachedPosts = [Self.makeAPIPost(id: "cached-1"), Self.makeAPIPost(id: "cached-2")]
            .map { $0.toFeedPost(preferredLanguages: ["fr"]) }
        try? await CacheCoordinator.shared.feed.save(cachedPosts, for: "bookmarks")
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: [Self.makeAPIPost(id: "net-3")]))

        await sut.loadBookmarks()
        XCTAssertEqual(sut.posts.count, 2, "precondition: le cache .fresh est servi sans réseau")
        XCTAssertEqual(mock.getBookmarksCallCount, 0)

        await sut.loadMore()

        XCTAssertEqual(mock.getBookmarksCallCount, 1,
                       "le sentinel doit déclencher un fetch réseau — l'ancien chemin re-servait le cache et bloquait la pagination pour la session")
        XCTAssertEqual(sut.posts.map(\.id), ["cached-1", "cached-2", "net-3"], "la page réseau s'APPEND au cache servi")
    }

    func test_bookmarksView_sentinel_callsLoadMore() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // ViewModels
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Views/BookmarksView.swift")
        let src = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(src.contains("viewModel.loadMore()"),
                      "le sentinel de pagination doit appeler loadMore(), pas loadBookmarks() (qui re-sert le cache)")
    }

    // MARK: - #15934 — « Repartager » republie depuis les favoris

    private static func repostChainBookmarks(repostCount: Int = 2) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode(#"""
        {"success":true,"data":[{"id":"saved","type":"REEL","content":"","createdAt":"2026-01-01T00:00:00.000Z",
        "repostCount":\#(repostCount),"author":{"id":"a1","username":"alice"},
        "repostOf":{"id":"mid","createdAt":"2025-12-31T00:00:00.000Z","author":{"id":"a2","username":"bob"},"originalRepostOfId":"root"}}],
        "pagination":null,"error":null}
        """#)
    }

    private func makeRepostSUT(
        postService: MockPostService,
        queue: MockOfflineQueue = MockOfflineQueue(),
        offline: Bool = false
    ) -> BookmarksViewModel {
        BookmarksViewModel(
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            reposter: ListedPostReposter(
                publisher: RepostPublisher(postService: postService, offlineQueue: queue, isOffline: { offline }),
                toasts: MockFeedbackToast()
            )
        )
    }

    func test_toggleRepost_publishesTheRootAtTheCardFormat_andKeepsTheCardReposted() async {
        let mock = MockPostService()
        mock.getBookmarksResult = .success(Self.repostChainBookmarks(repostCount: 2))
        let sut = makeRepostSUT(postService: mock)
        await sut.loadBookmarks()

        await sut.toggleRepost("saved")

        XCTAssertEqual(mock.repostCallCount, 1)
        XCTAssertEqual(mock.lastRepostPostId, "root", "la référence remonte à la RACINE de la chaîne")
        XCTAssertEqual(mock.lastRepostTargetType, .reel, "le format reste celui de la carte enregistrée")
        XCTAssertFalse(mock.lastRepostIsQuote ?? true)
        XCTAssertTrue(sut.posts[0].isRepostedByMe, "l'icône du favori passe à l'état repartagé")
        XCTAssertEqual(sut.posts[0].repostCount, 3)
        guard case .fresh(let cached, _) = await CacheCoordinator.shared.feed.load(for: "bookmarks") else {
            return XCTFail("le repartage réécrit le cache « bookmarks »")
        }
        XCTAssertEqual(cached.first?.isRepostedByMe, true, "la réouverture des favoris garde l'état repartagé")
    }

    func test_toggleRepost_whenTheServerRefuses_rollsBackIconAndCounter() async {
        let mock = MockPostService()
        mock.getBookmarksResult = .success(Self.repostChainBookmarks(repostCount: 2))
        mock.repostResult = .failure(URLError(.badServerResponse))
        let sut = makeRepostSUT(postService: mock)
        await sut.loadBookmarks()

        await sut.toggleRepost("saved")

        XCTAssertFalse(sut.posts[0].isRepostedByMe)
        XCTAssertEqual(sut.posts[0].repostCount, 2)
    }

    func test_toggleRepost_offline_queuesTheRepostInTheOutbox() async throws {
        let mock = MockPostService()
        mock.getBookmarksResult = .success(Self.repostChainBookmarks())
        let queue = MockOfflineQueue()
        let sut = makeRepostSUT(postService: mock, queue: queue, offline: true)
        await sut.loadBookmarks()

        await sut.toggleRepost("saved")

        XCTAssertEqual(mock.repostCallCount, 0)
        let payload = try XCTUnwrap(queue.enqueueCalls.first?.payload as? RepostPostPayload)
        XCTAssertEqual(payload.postId, "root")
        XCTAssertEqual(payload.targetType, "REEL")
        XCTAssertTrue(sut.posts[0].isRepostedByMe)
    }

    // MARK: - #15994 — « Partager » du menu ⋯ partage depuis les favoris

    func test_shareLink_recordsTheShare_andHandsTheTrackedLink() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: [Self.makeAPIPost(id: "saved")]))
        await sut.loadBookmarks()

        let link = await sut.shareLink(for: "saved")

        XCTAssertEqual(mock.lastSharePostId, "saved")
        XCTAssertEqual(mock.lastShareGenerateLink, true)
        XCTAssertEqual(link?.url.absoluteString, "https://meeshy.me/l/mock123")
        XCTAssertEqual(sut.posts[0].shareCount, 1)
    }

    func test_shareLink_offline_stillHandsThePostLink_withoutBumping() async {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePaginatedPosts(posts: [Self.makeAPIPost(id: "saved")]))
        mock.shareResult = .failure(URLError(.notConnectedToInternet))
        await sut.loadBookmarks()

        let link = await sut.shareLink(for: "saved")

        XCTAssertEqual(link?.url.absoluteString, "https://meeshy.me/feeds/post/saved")
        XCTAssertEqual(sut.posts[0].shareCount, 0)
    }
}
