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

    private func makeEmptyResponse() -> APIResponse<AnyCodable> {
        JSONStub.decode("""
        { "success": true, "data": {}, "error": null }
        """)
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
