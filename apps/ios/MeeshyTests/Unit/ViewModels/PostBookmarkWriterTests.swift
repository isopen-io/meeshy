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
        private(set) var inserted: [String] = []
        private(set) var removed: [String] = []

        func insert(_ post: FeedPost) async { inserted.append(post.id) }

        func remove(postId: String) async { removed.append(postId) }
    }

    @MainActor
    private final class RejectionCounter {
        private(set) var count = 0
        func reject() { count += 1 }
    }

    @MainActor
    private struct Rig {
        let sut: PostBookmarkWriter
        let queue: MockOfflineQueue
        let favorites: RecordingFavorites
        let toasts: MockFeedbackToast
        let rejections: RejectionCounter

        func write(bookmarked: Bool, postId: String = "p1", post: FeedPost?) async {
            let rejections = rejections
            await sut.write(bookmarked: bookmarked, postId: postId, post: post, onRejected: { rejections.reject() })
        }

        var payload: ToggleBookmarkPostPayload? { queue.lastPayload as? ToggleBookmarkPostPayload }
    }

    private static func post(_ id: String = "p1", bookmarked: Bool = false, count: Int = 2) -> FeedPost {
        var post = FeedPost(id: id, author: "alice", content: "#paris")
        post.isBookmarkedByMe = bookmarked
        post.bookmarkCount = count
        return post
    }

    private func makeRig(queue: MockOfflineQueue = MockOfflineQueue()) -> Rig {
        let favorites = RecordingFavorites()
        let toasts = MockFeedbackToast()
        return Rig(
            sut: PostBookmarkWriter(queue: queue, favorites: favorites, toasts: toasts),
            queue: queue, favorites: favorites, toasts: toasts, rejections: RejectionCounter()
        )
    }

    private static let added = String(localized: "post.bookmark.added", defaultValue: "Ajouté aux favoris", bundle: .main)
    private static let removed = String(localized: "post.bookmark.removed", defaultValue: "Retiré des favoris", bundle: .main)
    private static let failed = String(localized: "post.bookmark.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main)

    // MARK: - Enregistrer : la ligne durable

    func test_write_bookmarking_queuesTheWantedState_underTheCard() async {
        let rig = makeRig()

        await rig.write(bookmarked: true, post: Self.post())

        XCTAssertEqual(rig.queue.enqueueCalls.map(\.kind), [.toggleBookmarkPost],
                       "le favori part par la file durable, comme le like : hors ligne il attend au lieu d'échouer")
        XCTAssertEqual(rig.queue.enqueueCalls.first?.conversationId, "p1", "ancré sur la carte : la dernière intention gagne")
        XCTAssertEqual(rig.payload?.postId, "p1")
        XCTAssertEqual(rig.payload?.bookmarked, true)
        XCTAssertEqual(rig.payload?.clientMutationId.isEmpty, false, "le rejeu voyage sous un X-Client-Mutation-Id")
    }

    func test_write_bookmarking_putsThePostInFavorites_andSaysSo_withoutWaitingForTheNetwork() async {
        let rig = makeRig()

        await rig.write(bookmarked: true, post: Self.post())

        XCTAssertEqual(rig.favorites.inserted, ["p1"])
        XCTAssertEqual(rig.toasts.successMessages, [Self.added])
        XCTAssertTrue(rig.toasts.errorMessages.isEmpty)
        XCTAssertEqual(rig.rejections.count, 0)
    }

    /// **Le témoin hors ligne** : la ligne attend le réseau. Rien ne revient
    /// de la file — ni « appliqué » ni « épuisé » — et la bascule tient.
    func test_write_offline_theQueuedBookmarkStaysOn_untilTheQueueAnswers() async throws {
        let rig = makeRig()

        await rig.write(bookmarked: true, post: Self.post())
        let cmid = try XCTUnwrap(rig.payload?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        XCTAssertEqual(rig.rejections.count, 0, "hors ligne, « Enregistrer » ne se défait pas")
        XCTAssertTrue(rig.favorites.removed.isEmpty)
        XCTAssertTrue(rig.toasts.errorMessages.isEmpty)
    }

    func test_write_replayApplied_changesNothingMore() async throws {
        let rig = makeRig()
        await rig.write(bookmarked: true, post: Self.post())
        let cmid = try XCTUnwrap(rig.payload?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        rig.queue.emitOutcome(.applied(cmid: cmid), for: cmid)
        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(rig.rejections.count, 0)
        XCTAssertTrue(rig.toasts.errorMessages.isEmpty)
    }

    func test_write_serverRefusesTheReplay_undoesOnlyThisBookmark_andSaysTheFailure() async throws {
        let rig = makeRig()
        await rig.write(bookmarked: true, post: Self.post())
        let cmid = try XCTUnwrap(rig.payload?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        rig.queue.emitOutcome(.exhausted(cmid: cmid), for: cmid)

        try await waitForCondition(timeout: 2) { rig.rejections.count == 1 }
        XCTAssertEqual(rig.favorites.removed, ["p1"], "le post quitte les favoris en cache — lui seul, pas une photo du cache")
        XCTAssertEqual(rig.toasts.errorMessages, [Self.failed])
    }

    func test_write_queueRefusesTheRow_undoesAtOnce() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(OfflineQueueError.poolNotConfigured)
        let rig = makeRig(queue: queue)

        await rig.write(bookmarked: true, post: Self.post())

        XCTAssertEqual(rig.rejections.count, 1, "l'appelant défait sa bascule")
        XCTAssertEqual(rig.favorites.removed, ["p1"])
        XCTAssertEqual(rig.toasts.errorMessages, [Self.failed])
        XCTAssertTrue(rig.toasts.successMessages.isEmpty)
    }

    func test_write_bookmarkingWithoutTheCard_stillQueues_butLeavesTheFavoritesCacheAlone() async {
        let rig = makeRig()

        await rig.write(bookmarked: true, post: nil)

        XCTAssertEqual(rig.queue.enqueueCalls.count, 1)
        XCTAssertTrue(rig.favorites.inserted.isEmpty, "rien à ranger sans la carte")
    }

    // MARK: - Retirer

    func test_write_unbookmarking_queuesTheRemoval_andLeavesFavoritesAtOnce() async {
        let rig = makeRig()

        await rig.write(bookmarked: false, post: Self.post(bookmarked: true))

        XCTAssertEqual(rig.payload?.bookmarked, false)
        XCTAssertEqual(rig.favorites.removed, ["p1"], "retiré hors ligne, le post quitte l'onglet Favoris tout de suite")
        XCTAssertTrue(rig.favorites.inserted.isEmpty)
        XCTAssertEqual(rig.toasts.successMessages, [Self.removed])
    }

    func test_write_removalRefused_putsThePostBackInFavorites() async throws {
        let rig = makeRig()
        await rig.write(bookmarked: false, post: Self.post(bookmarked: true))
        let cmid = try XCTUnwrap(rig.payload?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        rig.queue.emitOutcome(.exhausted(cmid: cmid), for: cmid)

        try await waitForCondition(timeout: 2) { rig.rejections.count == 1 }
        XCTAssertEqual(rig.favorites.inserted, ["p1"])
        XCTAssertEqual(rig.toasts.errorMessages, [Self.failed])
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

    // MARK: - Un fil relu ne défait pas un favori en route (#15997)

    func test_reapplying_aFavoriteStillInTheQueue_survivesTheServerSnapshot() {
        let relu = [Self.post("p1", bookmarked: false, count: 2), Self.post("p2", bookmarked: true, count: 1)]

        let fil = PostBookmarkMutation.reapplying(relu, pending: ["p1": true, "p2": false])

        XCTAssertEqual(fil.map(\.isBookmarkedByMe), [true, false])
        XCTAssertEqual(fil.map(\.bookmarkCount), [3, 0])
    }

    func test_reapplying_aSnapshotThatAlreadyCarriesTheFavorite_countsItOnce() {
        let relu = [Self.post("p1", bookmarked: true, count: 3), Self.post("p3", count: 7)]

        let fil = PostBookmarkMutation.reapplying(relu, pending: ["p1": true])

        XCTAssertEqual(fil.map(\.bookmarkCount), [3, 7], "le serveur l'a déjà reçu : rien à reposer")
    }
}
