import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import Meeshy

/// P2 follow-up to `StoryViewerReactionFlowTests`'s "spec pattern" rollback
/// tests: those tests reimplement `sendReaction`'s snapshot/rollback as local
/// variables and assert against that copy, never invoking real production
/// code.
///
/// `sendReaction`'s swipe-away guard + rollback decision is extracted into
/// the pure `StoryViewerView.reactionRollbackTarget(currentStoryId:
/// originatingStoryId:priorReactions:priorCount:)` (mirrors
/// `rollingBackOptimisticComment`/`applyingStoryCommentAdded`) — exercised
/// directly here, NOT through a live `StoryViewerView` instance. A
/// manually-constructed View's `@State` storage does not reliably retain a
/// post-construction assignment when read back after a method call
/// (confirmed empirically while investigating this exact suite — even a
/// same-scope write-then-read with zero method calls in between reads back
/// the property's default, not the assigned value), so asserting against
/// `sut`'s own `@State` after calling `sendReaction` cannot work regardless
/// of whether the production code is correct.
///
/// The success path (`sendReaction` never rolling back) is instead verified
/// against `MockAPIClientForApp`'s own call-tracking — a reference type
/// external to `sut`, the same shape of assertion
/// `StoryViewerView_PrefetchTimerIntegrationTests` uses against its injected
/// `prefetcher`/`timer` collaborators.
final class StoryViewerReactionRollbackTests: XCTestCase {

    // MARK: - Pure rollback decision

    func test_reactionRollbackTarget_sameStory_returnsPriorSnapshot() {
        let result = StoryViewerView.reactionRollbackTarget(
            currentStoryId: "story-0", originatingStoryId: "story-0",
            priorReactions: ["👍"], priorCount: 1
        )

        XCTAssertEqual(result?.reactions, ["👍"],
            "Rejected reaction must restore the exact prior snapshot, not an emptied array")
        XCTAssertEqual(result?.count, 1)
    }

    func test_reactionRollbackTarget_differentStory_returnsNil() {
        // The user swiped to another story before the network call resolved
        // — these `@State` fields now belong to that other story and must
        // not be touched.
        let result = StoryViewerView.reactionRollbackTarget(
            currentStoryId: "story-1", originatingStoryId: "story-0",
            priorReactions: ["👍"], priorCount: 1
        )

        XCTAssertNil(result,
            "A rollback for story-0 must never mutate story-1's state after the user swiped away")
    }

    func test_reactionRollbackTarget_noCurrentStory_returnsNil() {
        // Viewer dismissed entirely (currentStory nil) before the network
        // call resolved — same guard, no story left to touch.
        let result = StoryViewerView.reactionRollbackTarget(
            currentStoryId: nil, originatingStoryId: "story-0",
            priorReactions: ["👍"], priorCount: 1
        )

        XCTAssertNil(result)
    }

    // MARK: - sendReaction end-to-end (verified via the injected mock, not @State)

    private func makeStoryItem(id: String) -> StoryItem {
        StoryItem(id: id, content: "story \(id)", media: [], storyEffects: nil, createdAt: Date(), expiresAt: nil, isViewed: false)
    }

    private func makeGroup(stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: "author-1", username: "alice", avatarColor: "#6366F1", avatarURL: nil, stories: stories)
    }

    @MainActor
    private func makeSUT() -> StoryViewerView {
        let group = makeGroup(stories: [makeStoryItem(id: "story-0")])
        let binding = Binding(get: { true }, set: { _ in })
        return StoryViewerView(viewModel: StoryViewModel(), groups: [group], currentGroupIndex: 0, isPresented: binding)
    }

    @MainActor
    private func makeEmptyResponse() -> APIResponse<AnyCodable> {
        JSONStub.decode("""
        { "success": true, "data": {}, "error": null }
        """)
    }

    // MARK: - Recovery decision (pure)

    /// Une coupure réseau n'est pas un refus : la réaction doit rejoindre la
    /// file, comme le commentaire de story. `MeeshyError.network` est la forme
    /// que `APIClient` donne à tout `URLError` de transport.
    func test_reactionRecovery_forNetworkFailure_queuesForReplay() {
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.network(.noConnection)), .queueForReplay)
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.network(.timeout)), .queueForReplay)
        XCTAssertEqual(StoryReactionRecovery.decide(for: URLError(.notConnectedToInternet)), .queueForReplay,
                       "Un URLError brut est normalisé en `.network` par `MeeshyError.from` — même verdict")
    }

    /// Le refus du serveur — le 409 `REACTION_LIMIT_REACHED` que cite
    /// `sendReaction`, un 403, un 404 — rembobine TOUJOURS : le rejouer depuis
    /// la file rendrait le même refus, avec un emoji fantôme entre-temps.
    func test_reactionRecovery_forServerRefusal_rollsBack() {
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED")), .rollback)
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.forbidden(reason: nil, body: nil)), .rollback)
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.server(statusCode: 404, message: "Post not found")), .rollback)
        XCTAssertEqual(StoryReactionRecovery.decide(for: NSError(domain: "test", code: -1)), .rollback,
                       "Une erreur locale inconnue n'est pas une panne de transport")
    }

    // MARK: - sendReaction offline (verified via the injected queue, not @State)

    /// Réagir hors ligne ne doit pas perdre la réaction.
    ///
    /// Le commentaire de story a sa file depuis longtemps ; la réaction, elle,
    /// se contentait de rembobiner l'affichage et la mutation disparaissait.
    /// Elle emprunte désormais le kind `toggleLikePost` — le gateway sert la
    /// réaction de story sur `POST /posts/:id/like` et la journalise sous ce
    /// nom ; un kind dédié dupliquerait une mutation qu'il traite comme une
    /// seule. L'emoji doit voyager jusqu'à la ligne enfilée.
    @MainActor
    func test_sendReaction_whenTheNetworkFails_queuesItInsteadOfLosingIt() async throws {
        let sut = makeSUT()
        let api = MockAPIClientForApp()
        api.errorToThrow = MeeshyError.network(.noConnection)
        let queue = MockOfflineQueue()

        await sut.sendReaction(emoji: "🔥", priorReactions: [], priorCount: 0,
                               interactionService: StoryInteractionService(api: api),
                               offlineQueue: queue).value

        XCTAssertEqual(api.postCount, 1, "Le POST direct est tenté d'abord — la file n'est que le recours")
        XCTAssertEqual(queue.enqueueCalls.count, 1, "La réaction a été perdue au lieu d'être mise en file.")
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .toggleLikePost)
        XCTAssertEqual(queue.enqueueCalls.first?.conversationId, "story-0",
                       "La ligne se range sous la story, comme le commentaire de story")
        let payload = try XCTUnwrap(queue.lastPayload as? ToggleLikePostPayload)
        XCTAssertEqual(payload.postId, "story-0")
        XCTAssertEqual(payload.emoji, "🔥", "L'emoji doit voyager jusqu'à la file.")
        XCTAssertTrue(payload.liked)
    }

    /// Un refus du serveur ne va PAS en file : la ligne y rendrait le même
    /// refus au rejeu. Le rembobinage (couvert par `reactionRollbackTarget`
    /// ci-dessus) reste la seule issue — et la file ne voit rien passer.
    @MainActor
    func test_sendReaction_whenTheServerRefuses_rollsBackWithoutQueueing() async {
        let sut = makeSUT()
        let api = MockAPIClientForApp()
        api.errorToThrow = MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED")
        let queue = MockOfflineQueue()

        await sut.sendReaction(emoji: "🔥", priorReactions: [], priorCount: 0,
                               interactionService: StoryInteractionService(api: api),
                               offlineQueue: queue).value

        XCTAssertEqual(api.postCount, 1)
        XCTAssertTrue(queue.enqueueCalls.isEmpty,
                      "Un 409 REACTION_LIMIT_REACHED est un refus, pas une coupure : rien ne doit être enfilé")
    }

    /// Le succès n'enfile rien non plus : la file est un recours, jamais un
    /// second envoi.
    @MainActor
    func test_sendReaction_whenThePostSucceeds_leavesTheQueueUntouched() async {
        let sut = makeSUT()
        let api = MockAPIClientForApp()
        api.stub("/posts/story-0/like", result: makeEmptyResponse())
        let queue = MockOfflineQueue()

        await sut.sendReaction(emoji: "🔥", priorReactions: [], priorCount: 0,
                               interactionService: StoryInteractionService(api: api),
                               offlineQueue: queue).value

        XCTAssertEqual(api.postCount, 1)
        XCTAssertTrue(queue.enqueueCalls.isEmpty)
    }

    @MainActor
    func test_sendReaction_hitsCorrectEndpointWithGivenEmoji() async {
        let sut = makeSUT()
        let api = MockAPIClientForApp()
        api.stub("/posts/story-0/like", result: makeEmptyResponse())

        sut.sendReaction(emoji: "🔥", priorReactions: [], priorCount: 0, interactionService: StoryInteractionService(api: api))

        // Give the fire-and-forget Task a grace period to reach the network call.
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, "/posts/story-0/like")
    }
}
