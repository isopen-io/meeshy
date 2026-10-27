import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// The reader's reaction ledger owns what the viewer sees of the current
/// story's reactions (#13135): the count, this viewer's emojis, the optimistic
/// append and its rollback when the server refuses.
@MainActor
final class StoryReactionLedgerTests: XCTestCase {

    private func makeSUT(error: Error? = nil) -> (StoryReactionLedger, MockAPIClientForApp, MockOfflineQueue) {
        let api = MockAPIClientForApp()
        api.errorToThrow = error
        api.stub("/posts/story-0/like", result: JSONStub.decode("""
        { "success": true, "data": {}, "error": null }
        """) as APIResponse<AnyCodable>)
        let queue = MockOfflineQueue()
        return (StoryReactionLedger(service: StoryInteractionService(api: api), queue: queue), api, queue)
    }

    func test_begin_seedsTheStoryState() {
        let (sut, _, _) = makeSUT()

        sut.begin(count: 4, userReactions: ["👍"])

        XCTAssertEqual(sut.count, 4)
        XCTAssertEqual(sut.userReactions, ["👍"])
        XCTAssertTrue(sut.hasReacted)
    }

    func test_react_appliesOptimistically_once_perEmoji() {
        let (sut, _, _) = makeSUT()
        sut.begin(count: 3, userReactions: ["👍"])

        sut.react("🔥", storyId: "story-0", viewing: { "story-0" })
        sut.react("👍", storyId: "story-0", viewing: { "story-0" })

        XCTAssertEqual(sut.count, 4)
        XCTAssertEqual(sut.userReactions, ["👍", "🔥"])
    }

    func test_aServerRefusal_restoresTheSnapshot() async {
        let (sut, _, queue) = makeSUT(error: MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED"))
        sut.begin(count: 3, userReactions: ["👍"])

        await sut.react("🔥", storyId: "story-0", viewing: { "story-0" }).value

        XCTAssertEqual(sut.count, 3)
        XCTAssertEqual(sut.userReactions, ["👍"])
        XCTAssertTrue(queue.enqueueCalls.isEmpty)
    }

    func test_aRefusalAfterSwipingAway_leavesTheOtherStoryAlone() async {
        let (sut, _, _) = makeSUT(error: MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED"))
        sut.begin(count: 3, userReactions: [])
        let task = sut.react("🔥", storyId: "story-0", viewing: { "story-1" })
        sut.begin(count: 9, userReactions: ["😍"])

        await task.value

        XCTAssertEqual(sut.count, 9)
        XCTAssertEqual(sut.userReactions, ["😍"])
    }

    func test_aTransportFailure_queuesTheReaction_andKeepsTheOptimism() async throws {
        let (sut, api, queue) = makeSUT(error: MeeshyError.network(.noConnection))
        sut.begin(count: 0, userReactions: [])

        await sut.react("🔥", storyId: "story-0", viewing: { "story-0" }).value

        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(queue.enqueueCalls.first?.kind, .toggleLikePost)
        XCTAssertEqual(queue.enqueueCalls.first?.conversationId, "story-0")
        let payload = try XCTUnwrap(queue.lastPayload as? ToggleLikePostPayload)
        XCTAssertEqual(payload.postId, "story-0")
        XCTAssertEqual(payload.emoji, "🔥")
        XCTAssertTrue(payload.liked)
        XCTAssertEqual(sut.count, 1)
        XCTAssertEqual(sut.userReactions, ["🔥"])
    }

    func test_aSuccess_leavesTheQueueUntouched() async {
        let (sut, api, queue) = makeSUT()
        sut.begin(count: 0, userReactions: [])

        await sut.react("🔥", storyId: "story-0", viewing: { "story-0" }).value

        XCTAssertEqual(api.requestEndpoints.last, "/posts/story-0/like")
        XCTAssertTrue(queue.enqueueCalls.isEmpty)
        XCTAssertEqual(sut.count, 1)
    }
}
