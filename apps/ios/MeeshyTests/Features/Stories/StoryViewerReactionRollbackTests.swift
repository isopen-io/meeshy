import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import Meeshy

/// P2 follow-up to `StoryViewerReactionFlowTests`'s "spec pattern" rollback
/// tests: those tests reimplement `sendReaction`'s snapshot/rollback as local
/// variables and assert against that copy, never invoking the real
/// `StoryViewerView.sendReaction` — so a future edit that reorders the
/// restore or drops the `currentStory?.id == story.id` swipe-away guard would
/// not fail any test.
///
/// `sendReaction` now takes an injectable `interactionService` (defaulting to
/// the real `StoryInteractionService()`), so these tests exercise the actual
/// production method end-to-end against a `MockAPIClientForApp`, using the
/// same `Task.sleep` polling pattern already established in
/// `PostDetailViewModelTests` for observing fire-and-forget `Task { }` work.
@MainActor
final class StoryViewerReactionRollbackTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStoryItem(id: String) -> StoryItem {
        StoryItem(
            id: id,
            content: "story \(id)",
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        )
    }

    private func makeGroup(id: String = "author-1", stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id, username: "alice", avatarColor: "#6366F1", avatarURL: nil, stories: stories)
    }

    private func makeSUT(storyIds: [String] = ["story-0"]) -> StoryViewerView {
        let group = makeGroup(stories: storyIds.map(makeStoryItem))
        let binding = Binding(get: { true }, set: { _ in })
        let view = StoryViewerView(
            viewModel: StoryViewModel(),
            groups: [group],
            currentGroupIndex: 0,
            isPresented: binding
        )
        view.currentStoryIndex = 0
        return view
    }

    private func makeEmptyResponse() -> APIResponse<AnyCodable> {
        JSONStub.decode("""
        { "success": true, "data": {}, "error": null }
        """)
    }

    /// Polls until either the rollback fires or the timeout elapses — the
    /// `Task { }` inside `sendReaction` isn't awaitable from the caller.
    private func waitUntil(
        timeoutMS: Int = 500,
        _ predicate: () -> Bool
    ) async {
        for _ in 0..<(timeoutMS / 10) {
            if predicate() { return }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    // MARK: - Rejected reaction rolls back the REAL method

    func test_sendReaction_rejected_rollsBackToExactPriorSnapshot() async {
        let sut = makeSUT()
        sut.storyCurrentUserReactions = ["👍", "😂"]
        sut.storyReactionCount = 4
        let api = MockAPIClientForApp()
        api.errorToThrow = MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED")

        sut.sendReaction(
            emoji: "😂", priorReactions: ["👍"], priorCount: 3,
            interactionService: StoryInteractionService(api: api)
        )

        await waitUntil { sut.storyReactionCount == 3 }

        XCTAssertEqual(sut.storyCurrentUserReactions, ["👍"],
            "Rejected reaction must restore the exact prior snapshot, not an emptied array")
        XCTAssertEqual(sut.storyReactionCount, 3)
    }

    func test_sendReaction_succeeds_keepsOptimisticMutation() async {
        let sut = makeSUT()
        sut.storyCurrentUserReactions = ["🔥"]
        sut.storyReactionCount = 1
        let api = MockAPIClientForApp()
        api.stub("/posts/story-0/like", result: makeEmptyResponse())

        sut.sendReaction(
            emoji: "🔥", priorReactions: [], priorCount: 0,
            interactionService: StoryInteractionService(api: api)
        )

        // No rollback signal to poll for on the success path — give the Task
        // a fixed grace period to run to completion before asserting.
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyCurrentUserReactions, ["🔥"],
            "A successful reaction must keep the optimistic emoji")
        XCTAssertEqual(sut.storyReactionCount, 1)
    }

    // MARK: - Swipe-away guard (the part the spec-pattern tests can't see)

    func test_sendReaction_rejectedAfterSwipingToAnotherStory_doesNotTouchNewStorysState() async {
        let sut = makeSUT(storyIds: ["story-0", "story-1"])
        sut.currentStoryIndex = 0
        sut.storyCurrentUserReactions = ["👍", "😂"]
        sut.storyReactionCount = 4
        let api = MockAPIClientForApp()
        api.errorToThrow = MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED")

        sut.sendReaction(
            emoji: "😂", priorReactions: ["👍"], priorCount: 3,
            interactionService: StoryInteractionService(api: api)
        )
        // Simulate the user swiping to a different story before the network
        // call resolves — these `@State` fields now belong to story-1.
        sut.currentStoryIndex = 1
        sut.storyCurrentUserReactions = ["🔥"]
        sut.storyReactionCount = 9

        // Give the in-flight Task time to reach (and, if the guard were
        // dropped, corrupt) the current state.
        try? await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(sut.storyCurrentUserReactions, ["🔥"],
            "A rollback for story-0 must never mutate story-1's state after the user swiped away")
        XCTAssertEqual(sut.storyReactionCount, 9)
    }
}
