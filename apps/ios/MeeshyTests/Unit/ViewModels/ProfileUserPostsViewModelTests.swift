import XCTest
@testable import Meeshy
import MeeshySDK

/// Non-régression du blocage de pagination du listing posts/réels du profil
/// (`ProfileUserPostsViewModel`, hébergé dans `ProfileUserPostsList.swift`).
///
/// Le bug rapporté : « un moment ça bloque au lieu de tout charger ». Chaîne
/// causale : un cache `.fresh` sert la liste SANS produire de curseur ;
/// `loadMore` était gardé par `nextCursor != nil` → sortie immédiate → la
/// fenêtre de rendu ne bougeait plus → la sentinelle one-shot ne se
/// re-déclenchait jamais ; et le `touch()` de chaque visite re-fraîchissait la
/// fenêtre SWR, rendant le blocage PERMANENT. Même famille de correctifs que
/// `FeedViewModel.loadMoreIfNeeded` et `BookmarksViewModel`
/// (vm-bookmarks-pagination-01).
@MainActor
final class ProfileUserPostsViewModelTests: XCTestCase {

    private static let userId = "profile-user-1"
    private static let cacheKey = "user:profile-user-1"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: Self.cacheKey)
        await CacheCoordinator.shared.feed.saveCursor(nextCursor: nil, hasMore: true, for: Self.cacheKey)
    }

    private func makeSUT(postService: MockPostService = MockPostService()) -> (sut: ProfileUserPostsViewModel, mock: MockPostService) {
        let sut = ProfileUserPostsViewModel(
            userId: Self.userId,
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: [])
        )
        return (sut, postService)
    }

    private static func makeFeedPost(id: String) -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "author-1", content: "Post \(id)")
    }

    private static func makeAPIPost(id: String, createdAt: String = "2026-01-15T12:00:00.000Z") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"Post \(id)","createdAt":"\(createdAt)","author":{"id":"author-1","username":"alice"}}
        """)
    }

    private static func makePage(ids: [String], hasMore: Bool, nextCursor: String?) -> PaginatedAPIResponse<[APIPost]> {
        let items = ids.map { id in
            """
            {"id":"\(id)","type":"POST","content":"Post \(id)","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"author-1","username":"alice"}}
            """
        }.joined(separator: ",")
        let cursorJSON = nextCursor.map { "{\"nextCursor\":\"\($0)\",\"hasMore\":\(hasMore),\"limit\":20}" }
            ?? "{\"hasMore\":\(hasMore),\"limit\":20}"
        return JSONStub.decode("""
        {"success":true,"data":[\(items)],"pagination":\(cursorJSON)}
        """)
    }

    // MARK: - Le test du bug rapporté

    /// Cache `.fresh` sans curseur → `loadMore` doit quand même refetcher la
    /// page 1 pour récupérer un vrai curseur, au lieu de se coincer à vie.
    func test_loadMore_afterFreshCacheOnlySession_stillFetchesDespiteNilCursor() async {
        let (sut, mock) = makeSUT()
        let seeded = (0..<8).map { Self.makeFeedPost(id: "cached-\($0)") }
        try? await CacheCoordinator.shared.feed.save(seeded, for: Self.cacheKey)

        await sut.loadInitial()
        XCTAssertEqual(sut.posts.count, 8, "cache-first : la liste sert le cache sans réseau")
        XCTAssertEqual(mock.getUserPostsCallCount, 0)
        XCTAssertTrue(sut.hasMore)

        mock.getUserPostsResultsQueue = [.success(Self.makePage(ids: ["net-1"], hasMore: true, nextCursor: "c2"))]
        await sut.loadMore()

        XCTAssertEqual(mock.getUserPostsCallCount, 1,
                       "loadMore doit partir avec cursor nil (= page 1) pour récupérer un curseur réel")
        XCTAssertNil(mock.lastGetUserPostsCursor)
        XCTAssertTrue(sut.posts.contains(where: { $0.id == "net-1" }))
    }

    /// La page 1 de recovery FUSIONNE avec la liste cachée — jamais de
    /// remplacement qui fait rétrécir 100 cartes en 20 sous le doigt.
    func test_fetchPageOne_withNonEmptyList_mergesInsteadOfReplacing() async {
        let (sut, mock) = makeSUT()
        let seeded = (0..<10).map { Self.makeFeedPost(id: "cached-\($0)") }
        try? await CacheCoordinator.shared.feed.save(seeded, for: Self.cacheKey)
        await sut.loadInitial()

        mock.getUserPostsResultsQueue = [.success(Self.makePage(ids: ["cached-0", "cached-1", "fresh-1"], hasMore: true, nextCursor: "c2"))]
        await sut.loadMore()

        XCTAssertEqual(sut.posts.count, 11,
                       "3 de la page serveur (2 déjà connus) + 8 anciens conservés — pas de rétrécissement")
        XCTAssertEqual(sut.posts.first?.id, "cached-0", "l'ordre serveur (newest-first) prime en tête")
        XCTAssertTrue(sut.posts.suffix(8).allSatisfy { $0.id.hasPrefix("cached-") },
                      "la queue cachée plus ancienne survit derrière la page serveur")
    }

    /// Une page 100 % dupliquée (curseur qui ne progresse pas) marque la
    /// pagination ÉPUISÉE au lieu de boucler sur le réseau.
    func test_loadMore_fullyDuplicatePage_marksExhaustedInsteadOfLooping() async {
        let (sut, mock) = makeSUT()
        mock.getUserPostsResultsQueue = [
            .success(Self.makePage(ids: ["p1", "p2"], hasMore: true, nextCursor: "c2")),
            .success(Self.makePage(ids: ["p1", "p2"], hasMore: true, nextCursor: "c2")),
        ]
        await sut.loadInitial()
        XCTAssertEqual(sut.posts.count, 2)

        await sut.loadMore()

        XCTAssertFalse(sut.hasMore, "zéro progrès → épuisé, pas de martèlement du gateway")
        XCTAssertEqual(sut.paginationState, .exhausted)
    }

    /// Réponse sans bloc pagination (strip Fastify) : un curseur absent ne doit
    /// pas figer la pagination si le curseur courant existe — défaut sûr
    /// `?? (nextCursor != nil)` (forme ReelsViewModel).
    func test_loadMore_lastPage_setsExhaustedState() async {
        let (sut, mock) = makeSUT()
        mock.getUserPostsResultsQueue = [
            .success(Self.makePage(ids: ["p1"], hasMore: true, nextCursor: "c2")),
            .success(Self.makePage(ids: ["p2"], hasMore: false, nextCursor: nil)),
        ]
        await sut.loadInitial()
        await sut.loadMore()

        XCTAssertFalse(sut.hasMore)
        XCTAssertEqual(sut.paginationState, .exhausted,
                       "hasMore=false serveur = on a atteint le tout premier contenu publié → zone de fin")
    }

    /// Erreur réseau : `hasMore`/curseur intacts (retenter la même page),
    /// `isLoadingMore` retombe, l'état expose l'erreur.
    func test_loadMore_networkError_keepsPaginationAliveForRetry() async {
        let (sut, mock) = makeSUT()
        mock.getUserPostsResultsQueue = [
            .success(Self.makePage(ids: ["p1"], hasMore: true, nextCursor: "c2")),
            .failure(NSError(domain: "test", code: -1009)),
            .success(Self.makePage(ids: ["p2"], hasMore: false, nextCursor: nil)),
        ]
        await sut.loadInitial()
        await sut.loadMore()

        XCTAssertTrue(sut.hasMore, "l'échec réseau ne condamne pas la pagination")
        XCTAssertFalse(sut.isLoadingMore)
        if case .error = sut.paginationState {} else {
            XCTFail("l'état doit exposer l'erreur, reçu \(sut.paginationState)")
        }

        await sut.loadMore()
        XCTAssertTrue(sut.posts.contains(where: { $0.id == "p2" }), "le retry reprend la même page")
    }

    /// Le curseur persisté (`saveCursor`) est restauré par une NOUVELLE
    /// instance : la pagination reprend au curseur profond, sans refetch page 1.
    func test_loadInitial_restoresPersistedCursorAcrossInstances() async {
        let (sut1, mock1) = makeSUT()
        mock1.getUserPostsResultsQueue = [.success(Self.makePage(ids: ["p1"], hasMore: true, nextCursor: "deep-cursor"))]
        await sut1.loadInitial()
        XCTAssertEqual(sut1.posts.count, 1)

        let (sut2, mock2) = makeSUT()
        mock2.getUserPostsResultsQueue = [.success(Self.makePage(ids: ["p2"], hasMore: false, nextCursor: nil))]
        await sut2.loadInitial()
        XCTAssertEqual(mock2.getUserPostsCallCount, 0, "cache .fresh servi sans réseau")

        await sut2.loadMore()
        XCTAssertEqual(mock2.lastGetUserPostsCursor, "deep-cursor",
                       "la nouvelle instance reprend au curseur persisté, pas à la page 1")
    }

    /// Le déclencheur par carte préfetch à ≤3 de la fin de la fenêtre rendue.
    func test_loadMoreIfNeeded_nearEndOfRenderWindow_triggersReveal() async {
        let (sut, mock) = makeSUT()
        mock.getUserPostsResultsQueue = [.success(Self.makePage(ids: (0..<8).map { "p\($0)" }, hasMore: false, nextCursor: nil))]
        await sut.loadInitial()
        XCTAssertEqual(sut.visiblePosts.count, ProfileUserPostsViewModel.initialRenderWindow)

        sut.loadMoreIfNeeded(currentPost: sut.visiblePosts[sut.visiblePosts.count - 3])
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertGreaterThan(sut.visiblePosts.count, ProfileUserPostsViewModel.initialRenderWindow,
                             "la fenêtre s'agrandit AVANT que l'utilisateur atteigne le bas")
    }
}
