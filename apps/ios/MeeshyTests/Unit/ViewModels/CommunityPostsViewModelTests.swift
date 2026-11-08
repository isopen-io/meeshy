import XCTest
@testable import Meeshy
import MeeshySDK

/// #16878 — l'onglet « Publications » du détail d'une communauté lit enfin ses
/// publications : cache d'abord, revalidation silencieuse, page suivante par
/// curseur, et un état dessiné pour le chargement, le vide, l'échec et le
/// hors-ligne.
@MainActor
final class CommunityPostsViewModelTests: XCTestCase {

    // MARK: - Fabriques

    private func makeSUT(
        communityId: String = "c1",
        service: MockPostService = MockPostService(),
        cache: InMemoryFeedPostsCache = InMemoryFeedPostsCache()
    ) -> (sut: CommunityPostsViewModel, service: MockPostService, cache: InMemoryFeedPostsCache) {
        let sut = CommunityPostsViewModel(
            communityId: communityId,
            service: service,
            languageProvider: MockLanguageProvider(preferredLanguages: ["fr"]),
            cacheProvider: { cache }
        )
        return (sut, service, cache)
    }

    private static func page(
        _ ids: [String],
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let items = ids.map { id in
            #"{"id":"\#(id)","type":"POST","content":"Bonjour \#(id)","createdAt":"2026-11-01T00:00:00.000Z","likeCount":0,"commentCount":0,"author":{"id":"a1","username":"alice"}}"#
        }
        let pagination = nextCursor.map { #"{"nextCursor":"\#($0)","hasMore":true,"limit":20}"# } ?? "null"
        return JSONStub.decode(#"{"success":true,"data":[\#(items.joined(separator: ","))],"pagination":\#(pagination),"error":null}"#)
    }

    private static func cachedPosts(_ ids: [String]) -> [FeedPost] {
        page(ids).data.map { $0.toFeedPost(preferredLanguages: ["fr"]) }
    }

    // MARK: - Cache vide : le réseau, puis le cache

    func test_load_emptyCache_fetchesTheCommunityFirstPage_andCachesIt() async {
        let (sut, service, cache) = makeSUT(communityId: "c42")
        service.getCommunityPostsResultsQueue = [.success(Self.page(["p1", "p2"], nextCursor: "k2"))]

        await sut.load()

        XCTAssertEqual(service.lastGetCommunityPostsCommunityId, "c42")
        XCTAssertNil(service.lastGetCommunityPostsCursor)
        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2"])
        XCTAssertEqual(sut.phase, .loaded)
        XCTAssertTrue(sut.hasMore)
        let stored = await cache.stored(for: CommunityPostsViewModel.cacheKey(communityId: "c42"))
        XCTAssertEqual(stored?.map(\.id), ["p1", "p2"])
    }

    func test_load_emptyServerPage_isLoadedAndEmpty_notFailed() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [.success(Self.page([]))]

        await sut.load()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertEqual(sut.phase, .loaded)
        XCTAssertFalse(sut.hasMore)
    }

    // MARK: - Cache d'abord

    func test_load_freshCache_servesItWithoutTheNetwork() async {
        let cache = InMemoryFeedPostsCache(
            seed: [CommunityPostsViewModel.cacheKey(communityId: "c1"): Self.cachedPosts(["p1"])],
            freshness: .fresh
        )
        let (sut, service, _) = makeSUT(cache: cache)

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"])
        XCTAssertEqual(sut.phase, .loaded)
        XCTAssertEqual(service.getCommunityPostsCallCount, 0)
    }

    func test_load_staleCache_isReplacedByTheRevalidatedPage() async {
        let cache = InMemoryFeedPostsCache(
            seed: [CommunityPostsViewModel.cacheKey(communityId: "c1"): Self.cachedPosts(["old"])],
            freshness: .stale
        )
        let (sut, service, _) = makeSUT(cache: cache)
        service.getCommunityPostsResultsQueue = [.success(Self.page(["new1", "new2"]))]

        await sut.load()

        XCTAssertEqual(service.getCommunityPostsCallCount, 1)
        XCTAssertEqual(sut.posts.map(\.id), ["new1", "new2"])
        XCTAssertEqual(sut.phase, .loaded)
    }

    func test_load_staleCache_networkFailure_keepsTheCachedPosts_withoutAnError() async {
        let cache = InMemoryFeedPostsCache(
            seed: [CommunityPostsViewModel.cacheKey(communityId: "c1"): Self.cachedPosts(["p1"])],
            freshness: .stale
        )
        let (sut, service, _) = makeSUT(cache: cache)
        service.getCommunityPostsResultsQueue = [.failure(URLError(.notConnectedToInternet))]

        await sut.load()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"])
        XCTAssertEqual(sut.phase, .loaded)
    }

    // MARK: - Échec et hors-ligne sur un cache vide

    func test_load_emptyCache_offline_saysOffline() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [.failure(URLError(.notConnectedToInternet))]

        await sut.load()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertEqual(sut.phase, .offline)
    }

    func test_load_emptyCache_serverError_saysFailed() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [.failure(APIError.serverError(500, nil))]

        await sut.load()

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertEqual(sut.phase, .failed)
    }

    func test_retryAfterFailure_loadsThePage() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [
            .failure(APIError.serverError(500, nil)),
            .success(Self.page(["p1"]))
        ]

        await sut.load()
        await sut.refresh()

        XCTAssertEqual(sut.posts.map(\.id), ["p1"])
        XCTAssertEqual(sut.phase, .loaded)
    }

    // MARK: - Page suivante

    func test_loadMore_followsTheCursor_andDropsDuplicates() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [
            .success(Self.page(["p1", "p2"], nextCursor: "k2")),
            .success(Self.page(["p2", "p3"]))
        ]

        await sut.load()
        await sut.loadMore()

        XCTAssertEqual(service.lastGetCommunityPostsCursor, "k2")
        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2", "p3"])
        XCTAssertFalse(sut.hasMore)
    }

    func test_loadMore_withoutMorePages_doesNothing() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [.success(Self.page(["p1"]))]

        await sut.load()
        await sut.loadMore()

        XCTAssertEqual(service.getCommunityPostsCallCount, 1)
    }

    // MARK: - Gestes de la carte : optimistes, retour arrière à l'échec

    func test_toggleLike_isOptimistic_andRollsBackOnFailure() async {
        let (sut, service, _) = makeSUT()
        service.getCommunityPostsResultsQueue = [.success(Self.page(["p1"]))]
        await sut.load()
        service.likeResult = .failure(APIError.serverError(500, nil))

        await sut.toggleLike("p1")

        XCTAssertEqual(service.likeCallCount, 1)
        XCTAssertFalse(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 0)
    }

    func test_toggleLike_success_keepsTheLike_andTheCacheFollows() async {
        let (sut, service, cache) = makeSUT()
        service.getCommunityPostsResultsQueue = [.success(Self.page(["p1"]))]
        await sut.load()

        await sut.toggleLike("p1")

        XCTAssertTrue(sut.posts[0].isLiked)
        XCTAssertEqual(sut.posts[0].likes, 1)
        let stored = await cache.stored(for: CommunityPostsViewModel.cacheKey(communityId: "c1"))
        XCTAssertEqual(stored?.first?.isLiked, true)
    }
}

// MARK: - Cache en mémoire

actor InMemoryFeedPostsCache: MutableCacheStore {
    typealias Key = String
    typealias Value = FeedPost

    enum Freshness: Sendable { case fresh, stale }

    nonisolated let policy: CachePolicy = .feedPosts
    private var entries: [String: [FeedPost]]
    private let freshness: Freshness

    init(seed: [String: [FeedPost]] = [:], freshness: Freshness = .stale) {
        self.entries = seed
        self.freshness = freshness
    }

    func stored(for key: String) -> [FeedPost]? { entries[key] }

    func load(for key: String) async -> CacheResult<[FeedPost]> {
        guard let items = entries[key] else { return .empty }
        switch freshness {
        case .fresh: return .fresh(items, age: 1)
        case .stale: return .stale(items, age: 600)
        }
    }

    func invalidate(for key: String) async { entries[key] = nil }
    func invalidateAll() async { entries.removeAll() }
    func save(_ items: [FeedPost], for key: String) async throws { entries[key] = items }
    func update(for key: String, mutate: @Sendable ([FeedPost]) -> [FeedPost]) async {
        entries[key] = mutate(entries[key] ?? [])
    }
    func mergeUpdate(for key: String, mutate: @Sendable ([FeedPost]) -> [FeedPost]) async {
        entries[key] = mutate(entries[key] ?? [])
    }
}
