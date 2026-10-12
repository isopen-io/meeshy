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
}
