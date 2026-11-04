import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **« Enregistrer » a UN écrivain** (#15994).
///
/// Le fil iPhone, le fil iPad, le détail, le profil et les réels écrivaient
/// chacun leur favori — trois décodages différents de la même réponse, deux
/// miroirs du cache des favoris sur cinq, trois jeux de toasts. Les résultats
/// d'un hashtag n'en avaient aucun : le bouton y était rendu, avec son
/// compteur, et ne faisait rien. `PostBookmarkWriter` porte ce qui ne diffère
/// pas d'une surface à l'autre : l'envoi, le cache des favoris, et le retour à
/// l'utilisateur.
@MainActor
final class PostBookmarkWriterTests: XCTestCase {

    private final class RecordingFavorites: FavoritesCacheMirroring {
        var previous: [FeedPost] = []
        private(set) var inserted: [String] = []
        private(set) var removed: [String] = []
        private(set) var restored: [[String]] = []

        func insert(_ post: FeedPost) async -> [FeedPost] {
            inserted.append(post.id)
            return previous
        }

        func remove(postId: String) async { removed.append(postId) }

        func restore(_ previous: [FeedPost]) async { restored.append(previous.map(\.id)) }
    }

    private static func post(_ id: String = "p1", bookmarked: Bool = false, count: Int = 2) -> FeedPost {
        var post = FeedPost(id: id, author: "alice", content: "#paris")
        post.isBookmarkedByMe = bookmarked
        post.bookmarkCount = count
        return post
    }

    private func makeSUT(
        service: MockPostService = MockPostService(),
        favorites: RecordingFavorites = RecordingFavorites(),
        toasts: MockFeedbackToast = MockFeedbackToast()
    ) -> PostBookmarkWriter {
        PostBookmarkWriter(service: service, favorites: favorites, toasts: toasts)
    }

    // MARK: - Enregistrer

    func test_write_bookmarking_sendsTheBookmark_putsThePostInFavorites_andSaysSo() async {
        let service = MockPostService()
        let favorites = RecordingFavorites()
        let toasts = MockFeedbackToast()

        let ok = await makeSUT(service: service, favorites: favorites, toasts: toasts)
            .write(bookmarked: true, postId: "p1", post: Self.post())

        XCTAssertTrue(ok)
        XCTAssertEqual(service.bookmarkCallCount, 1)
        XCTAssertEqual(service.lastBookmarkPostId, "p1")
        XCTAssertEqual(service.removeBookmarkCallCount, 0)
        XCTAssertEqual(favorites.inserted, ["p1"], "le post rejoint les favoris en cache avant la réponse du réseau")
        XCTAssertEqual(toasts.successMessages, [String(localized: "post.bookmark.added", defaultValue: "Ajouté aux favoris", bundle: .main)])
        XCTAssertTrue(toasts.errorMessages.isEmpty)
    }

    func test_write_bookmarkingRefused_restoresTheFavoritesCache_andSaysTheFailure() async {
        let service = MockPostService()
        service.bookmarkResult = .failure(URLError(.notConnectedToInternet))
        let favorites = RecordingFavorites()
        favorites.previous = [Self.post("older")]
        let toasts = MockFeedbackToast()

        let ok = await makeSUT(service: service, favorites: favorites, toasts: toasts)
            .write(bookmarked: true, postId: "p1", post: Self.post())

        XCTAssertFalse(ok, "l'appelant doit défaire sa bascule")
        XCTAssertEqual(favorites.restored, [["older"]], "le cache des favoris revient à ce qu'il était")
        XCTAssertEqual(toasts.errorMessages, [String(localized: "post.bookmark.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main)])
        XCTAssertTrue(toasts.successMessages.isEmpty)
    }

    func test_write_bookmarkingWithoutTheCard_stillSends_butLeavesTheFavoritesCacheAlone() async {
        let service = MockPostService()
        service.bookmarkResult = .failure(URLError(.badServerResponse))
        let favorites = RecordingFavorites()

        _ = await makeSUT(service: service, favorites: favorites).write(bookmarked: true, postId: "p1", post: nil)

        XCTAssertEqual(service.bookmarkCallCount, 1)
        XCTAssertTrue(favorites.inserted.isEmpty, "rien à ranger sans la carte")
        XCTAssertTrue(favorites.restored.isEmpty, "et surtout pas de cache vidé à l'échec")
    }

    // MARK: - Retirer

    func test_write_unbookmarking_removesFromFavorites_afterTheServerConfirms() async {
        let service = MockPostService()
        let favorites = RecordingFavorites()
        let toasts = MockFeedbackToast()

        let ok = await makeSUT(service: service, favorites: favorites, toasts: toasts)
            .write(bookmarked: false, postId: "p1", post: Self.post(bookmarked: true))

        XCTAssertTrue(ok)
        XCTAssertEqual(service.removeBookmarkCallCount, 1)
        XCTAssertEqual(service.bookmarkCallCount, 0)
        XCTAssertTrue(favorites.inserted.isEmpty)
        XCTAssertEqual(favorites.removed, ["p1"])
        XCTAssertEqual(toasts.successMessages, [String(localized: "post.bookmark.removed", defaultValue: "Retiré des favoris", bundle: .main)])
    }

    func test_write_unbookmarkingRefused_keepsTheFavoritesCache_andSaysTheFailure() async {
        let service = MockPostService()
        service.removeBookmarkResult = .failure(URLError(.badServerResponse))
        let favorites = RecordingFavorites()
        let toasts = MockFeedbackToast()

        let ok = await makeSUT(service: service, favorites: favorites, toasts: toasts)
            .write(bookmarked: false, postId: "p1", post: Self.post(bookmarked: true))

        XCTAssertFalse(ok)
        XCTAssertTrue(favorites.removed.isEmpty, "un retrait refusé laisse le post dans les favoris")
        XCTAssertEqual(toasts.errorMessages.count, 1)
    }

    // MARK: - La bascule optimiste

    func test_mutation_bookmarking_flipsTheFlagAndMovesTheCounterTogether() {
        let next = PostBookmarkMutation.setting(Self.post(count: 2), bookmarked: true)

        XCTAssertTrue(next.isBookmarkedByMe)
        XCTAssertEqual(next.bookmarkCount, 3)
    }

    func test_mutation_unbookmarking_neverGoesBelowZero() {
        let next = PostBookmarkMutation.setting(Self.post(bookmarked: true, count: 0), bookmarked: false)

        XCTAssertFalse(next.isBookmarkedByMe)
        XCTAssertEqual(next.bookmarkCount, 0)
    }

    func test_mutation_settingTheStateTheCardAlreadyHas_changesNothing() {
        let card = Self.post(bookmarked: true, count: 5)

        XCTAssertEqual(PostBookmarkMutation.setting(card, bookmarked: true).bookmarkCount, 5,
                       "un retour arrière rejoué ne déplace pas le compteur deux fois")
    }

    func test_mutation_touchesOnlyTheBookmark() {
        var card = Self.post()
        card.isLiked = true
        card.likes = 4

        let next = PostBookmarkMutation.setting(card, bookmarked: true)

        XCTAssertTrue(next.isLiked)
        XCTAssertEqual(next.likes, 4)
    }
}
