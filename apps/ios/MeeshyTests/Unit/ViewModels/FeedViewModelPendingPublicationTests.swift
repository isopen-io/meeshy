import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #10321 — « Supprimer » sur une publication encore en file d'envoi la retire
/// de la file, localement, sans jamais appeler le serveur.
@MainActor
final class FeedViewModelPendingPublicationTests: XCTestCase {

    private func makeSUT(
        cancellation: PublicationCancellation = .removed
    ) -> (sut: FeedViewModel, queue: MockOfflineQueue, postService: MockPostService) {
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = cancellation
        let postService = MockPostService()
        let sut = FeedViewModel(
            api: MockAPIClientForApp(),
            socialSocket: MockSocialSocket(),
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: queue,
            feedCache: SharedFeedCache()
        )
        return (sut, queue, postService)
    }

    private func queuedPostId(_ sut: FeedViewModel, _ queue: MockOfflineQueue) async throws -> String {
        await sut.createPost(content: "En attente", originalLanguage: "fr")
        let payload = try XCTUnwrap(queue.enqueueCalls.first?.payload as? CreatePostPayload)
        XCTAssertEqual(sut.posts.first?.id, payload.clientMutationId)
        return payload.clientMutationId
    }

    func test_deletePost_onPendingPublication_withdrawsFromOutboxWithoutCallingServer() async throws {
        let (sut, queue, postService) = makeSUT(cancellation: .removed)
        let cmid = try await queuedPostId(sut, queue)

        await sut.deletePost(cmid)

        XCTAssertEqual(queue.cancelPendingPublicationCalls, [cmid])
        XCTAssertEqual(postService.deleteCallCount, 0, "un cmid n'existe pas côté serveur : aucun DELETE ne part")
        XCTAssertTrue(sut.posts.isEmpty)
    }

    func test_deletePost_onInflightPublication_removesTheCardWithoutCallingServer() async throws {
        let (sut, queue, postService) = makeSUT(cancellation: .cancelRequested)
        let cmid = try await queuedPostId(sut, queue)

        await sut.deletePost(cmid)

        XCTAssertEqual(postService.deleteCallCount, 0)
        XCTAssertTrue(sut.posts.isEmpty, "la marque d'annulation est posée : aucune carte fantôme ne reste")
    }

    func test_deletePost_whenRowAlreadyLeft_restoresTheCard() async throws {
        let (sut, queue, postService) = makeSUT(cancellation: .notFound)
        let cmid = try await queuedPostId(sut, queue)

        await sut.deletePost(cmid)

        XCTAssertEqual(postService.deleteCallCount, 0)
        XCTAssertEqual(sut.posts.map(\.id), [cmid], "le serveur fait foi : la publication partie reste visible")
    }

    func test_deletePost_whenCancellationFails_restoresTheCard() async throws {
        let (sut, queue, _) = makeSUT(cancellation: .failed)
        let cmid = try await queuedPostId(sut, queue)

        await sut.deletePost(cmid)

        XCTAssertEqual(sut.posts.map(\.id), [cmid])
    }

    func test_deletePost_onServerPost_neverTouchesTheOutbox() async {
        let (sut, queue, postService) = makeSUT()

        await sut.deletePost("665f1c2e9b1d4a0012345678")

        XCTAssertTrue(queue.cancelPendingPublicationCalls.isEmpty)
        XCTAssertEqual(postService.deleteCallCount, 1)
    }

    func test_supersedeRecoveredPost_routesThroughTheGuardedCancellation() async {
        let (sut, queue, _) = makeSUT()

        await sut.supersedeRecoveredPost(clientMutationId: "cmid_p")

        XCTAssertEqual(queue.cancelCreatePostCalls, ["cmid_p"])
    }

    // MARK: - #10331 — la carte en file se voit comme telle

    func test_pendingMarker_onQueuedCard_saysWaitingToSend() async throws {
        let (sut, queue, _) = makeSUT()
        let cmid = try await queuedPostId(sut, queue)

        XCTAssertTrue(PendingPublicationMarker.isPending(postId: cmid))
        XCTAssertEqual(UnsentPublicationsCopy.waiting,
                       String(localized: "feed.unsent.waiting", defaultValue: "En attente d'envoi", bundle: .main),
                       "ce que VoiceOver dit de l'horloge")
    }

    func test_pendingMarker_onServerPost_showsNothing() {
        XCTAssertFalse(PendingPublicationMarker.isPending(postId: "665f1c2e9b1d4a0012345678"),
                       "une publication en ligne garde son heure")
    }

    /// Annulée depuis la pastille ou le détail, la carte optimiste quitte le
    /// fil : sa ligne n'existe plus, rien ne la réconcilierait jamais.
    func test_cancellationFromAnotherSurface_dropsTheQueuedCard() async throws {
        let (sut, queue, _) = makeSUT(cancellation: .removed)
        let cmid = try await queuedPostId(sut, queue)

        _ = await PendingPublicationCancel.run(cmid, queue: queue, toasts: MockFeedbackToast())

        XCTAssertFalse(sut.posts.contains { $0.id == cmid })
    }

    // MARK: - #14879 — l'annulation survit au fil démonté

    /// Depuis le détail, la racine iPhone démonte le fil : son modèle meurt et
    /// n'entend pas l'annulation. Le fil remonté au retour relisait sa carte
    /// dans le cache — carte fantôme, vignette cassée, que rien ne retirait.
    func test_aFeedMountedAfterTheCancellation_neverReloadsItsCardFromCache() async {
        let cmid = ClientMutationId.generate()
        let cache = PendingFeedCache(posts: [FeedPost(id: cmid, author: "Moi", content: "En attente"),
                                             FeedPost(id: "665f1c2e9b1d4a0012345678", author: "Awa", content: "En ligne")])
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .removed

        _ = await PendingPublicationCancel.run(cmid, queue: queue, toasts: MockFeedbackToast())
        let sut = FeedViewModel(
            api: MockAPIClientForApp(),
            socialSocket: MockSocialSocket(),
            postService: MockPostService(),
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: queue,
            feedCache: cache
        )
        await sut.loadFeed()

        XCTAssertEqual(sut.posts.map(\.id), ["665f1c2e9b1d4a0012345678"])
    }

    func test_run_dropsTheCardFromTheFeedCache() async {
        let cmid = ClientMutationId.generate()
        let cache = PendingFeedCache(posts: [FeedPost(id: cmid, author: "Moi", content: "En attente")])
        let queue = MockOfflineQueue()
        queue.cancelPendingPublicationResult = .removed

        _ = await PendingPublicationCancel.run(cmid, queue: queue, toasts: MockFeedbackToast(), feedCache: cache)

        XCTAssertEqual(cache.removedIds, [cmid])
    }

    /// La carte d'une publication DÉJÀ annulée ne dit plus « vient de partir » :
    /// elle quitte le fil, et le verdict est celui de l'annulation.
    func test_deletePost_onACardWhoseSendWasAlreadyCancelled_dropsItAndSaysCancelled() async throws {
        let (sut, queue, _) = makeSUT(cancellation: .removed)
        let cmid = try await queuedPostId(sut, queue)
        let toasts = MockFeedbackToast()
        _ = await PendingPublicationCancel.run(cmid, queue: queue, toasts: MockFeedbackToast())
        queue.cancelPendingPublicationResult = .notFound

        let stopped = await PendingPublicationCancel.run(cmid, queue: queue, toasts: toasts)

        XCTAssertTrue(stopped)
        XCTAssertEqual(toasts.successMessages, [UnsentPublicationsCopy.deleted])
        XCTAssertTrue(toasts.errorMessages.isEmpty, "« vient de partir » serait faux : elle a été annulée")
        XCTAssertFalse(sut.posts.contains { $0.id == cmid })
    }

    // MARK: - Décision du porteur (#14879) : l'horloge seule

    func test_pendingCard_showsTheSendingClockOfAMessage_neverALabel() throws {
        let entete = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedPostCard+Header.swift"))
        XCTAssertTrue(entete.contains("BubbleDeliveryCheck(status: .sending"),
                      "même glyphe et même teinte que l'horloge d'un message en envoi")
        XCTAssertFalse(entete.contains("clock.arrow.circlepath"), "aucun libellé « En attente d'envoi » sur la carte")
    }

    func test_theFeeds_mountNoUnsentPublicationsRow() throws {
        for fil in ["Meeshy/Features/Main/Views/FeedView.swift", "Meeshy/Features/Main/Views/RootViewComponents.swift"] {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(fil))
            XCTAssertFalse(source.contains("UnsentPublicationsEntry"), "\(fil) : aucune rangée « N publication(s) non envoyée(s) »")
        }
    }

    func test_pendingCardMenu_offersOnlyWhatALocalCardCanDo() throws {
        let entete = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedPostCard+Header.swift"))
        let garde = try XCTUnwrap(entete.range(of: "if !PendingPublicationMarker.isPending(postId: post.id) {"))
        XCTAssertTrue(entete[garde.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("FeedPostOnlineMenuItems("),
                      "partager, enregistrer, épingler, modifier : rien de cela n'existe pour une carte en file")
    }
}

/// Cache du fil en mémoire : ce qu'un fil remonté relit, et ce que
/// l'annulation en retire.
@MainActor
private final class PendingFeedCache: FeedCacheStoring {
    nonisolated deinit {}
    private var posts: [FeedPost]
    private(set) var removedIds: [String] = []

    init(posts: [FeedPost]) { self.posts = posts }

    func load(for key: String) async -> CacheResult<[FeedPost]> {
        posts.isEmpty ? .empty : .fresh(posts, age: 0)
    }

    func save(_ items: [FeedPost], for key: String) async throws { posts = items }

    func savePreservingFreshness(_ items: [FeedPost], for key: String) async throws { posts = items }

    func patchEverywhere(itemId: String, mutate: @Sendable (inout FeedPost) -> Void) async {}

    func removeEverywhere(itemId: String) async {
        removedIds.append(itemId)
        posts.removeAll { $0.id == itemId }
    }
}
