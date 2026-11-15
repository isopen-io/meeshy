import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un rafraîchissement qui échoue ne doit pas laisser l'écran plus vide que
/// le disque.**
///
/// `refresh()` vidait `posts` puis INVALIDAIT le cache, et ne partait chercher
/// qu'ensuite. Un tirer-pour-rafraîchir hors ligne laissait donc « aucun
/// favori » à l'écran ET un cache détruit — l'ouverture SUIVANTE repartait elle
/// aussi du réseau, alors que la liste était sur le disque une seconde plus tôt.
///
/// Même loi que `ConversationListViewModel.forceRefresh` (§ « Fetch-then-
/// replace ») et que `ParticipantService.loadFirstPage`.
@MainActor
final class BookmarksCachePreservationTests: XCTestCase {

    private static let cacheKey = "bookmarks"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: Self.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.feed.invalidate(for: Self.cacheKey)
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        postService: MockPostService = MockPostService()
    ) -> (sut: BookmarksViewModel, postService: MockPostService) {
        let sut = BookmarksViewModel(
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: [])
        )
        return (sut, postService)
    }

    private static func makePage(ids: [String]) -> PaginatedAPIResponse<[APIPost]> {
        let rows = ids.map { id in
            """
            {"id":"\(id)","type":"POST","content":"c-\(id)","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(rows.joined(separator: ","))],"pagination":null,"error":null}
        """)
    }

    /// Peuple l'écran ET le cache par le chemin nominal, puis coupe le réseau.
    private func makeLoadedSUT(ids: [String]) async -> (sut: BookmarksViewModel, postService: MockPostService) {
        let (sut, mock) = makeSUT()
        mock.getBookmarksResult = .success(Self.makePage(ids: ids))
        await sut.loadBookmarks()
        return (sut, mock)
    }

    private func cachedBookmarkCount() async -> Int {
        await CacheCoordinator.shared.feed.loadIgnoringExpiry(for: Self.cacheKey)?.items.count ?? 0
    }

    // MARK: - Ce que l'écran GARDE

    func test_refresh_whenNetworkFails_keepsTheBookmarksAlreadyDisplayed() async {
        let (sut, mock) = await makeLoadedSUT(ids: ["b1", "b2"])
        XCTAssertEqual(sut.posts.count, 2, "préalable : la liste est peuplée")
        mock.getBookmarksResult = .failure(URLError(.notConnectedToInternet))

        await sut.refresh()

        XCTAssertEqual(
            sut.posts.count, 2,
            "Un tirer-pour-rafraîchir hors ligne ne vide pas l'écran de ce qu'il affichait."
        )
    }

    // MARK: - Ce que le disque GARDE

    func test_refresh_whenNetworkFails_leavesTheCacheIntact() async {
        let (sut, mock) = await makeLoadedSUT(ids: ["b1", "b2"])
        let seeded = await cachedBookmarkCount()
        XCTAssertEqual(seeded, 2, "préalable : le cache est peuplé")
        mock.getBookmarksResult = .failure(URLError(.notConnectedToInternet))

        await sut.refresh()

        let cached = await cachedBookmarkCount()
        XCTAssertEqual(
            cached, 2,
            "Rien n'a remplacé la liste : elle doit rester sur le disque pour l'ouverture suivante."
        )
    }

    // MARK: - Ce que le correctif NE change pas

    func test_refresh_whenNetworkSucceeds_replacesTheListWithoutDuplicating() async {
        let (sut, mock) = await makeLoadedSUT(ids: ["b1", "b2"])
        mock.getBookmarksResult = .success(Self.makePage(ids: ["b1", "b3"]))

        await sut.refresh()

        XCTAssertEqual(
            sut.posts.map(\.id), ["b1", "b3"],
            "Un rafraîchissement REMPLACE : « b2 », retiré des favoris ailleurs, disparaît."
        )
        let cached = await cachedBookmarkCount()
        XCTAssertEqual(cached, 2, "Le disque porte la liste servie, sans doublon.")
    }

    func test_refresh_whenNetworkSucceeds_servesTheServerList() async {
        let (sut, mock) = await makeLoadedSUT(ids: ["b1"])
        mock.getBookmarksResult = .success(Self.makePage(ids: ["b1", "b2", "b3"]))

        await sut.refresh()

        XCTAssertEqual(sut.posts.count, 3)
    }
}
