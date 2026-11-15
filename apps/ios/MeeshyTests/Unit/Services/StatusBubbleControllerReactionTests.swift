import XCTest
import MeeshySDK
@testable import Meeshy

/// La bulle d'humeur ne propose de réagir qu'à l'humeur d'un AUTRE, par le
/// handler injecté depuis la racine (#18110).
@MainActor
final class StatusBubbleControllerReactionTests: XCTestCase {

    private func makeSUT(currentUserId: String? = "me") -> StatusBubbleController {
        let sut = StatusBubbleController(postService: MockPostService(), currentUserId: { currentUserId })
        sut.reactionHandler = MoodReactionHandler(react: { _, _ in .sent }, placed: { _ in [] })
        return sut
    }

    private func makeEntry(userId: String) -> StatusEntry {
        StatusEntry(id: "s1", userId: userId, username: "alice", avatarColor: "6366F1", moodEmoji: "\u{1F389}")
    }

    func test_reactions_othersMood_servesTheInjectedHandler() async {
        let sut = makeSUT()

        let handler = sut.reactions(for: makeEntry(userId: "author"))

        let outcome = await handler?.react("s1", "\u{1F525}")
        XCTAssertEqual(outcome, .sent)
    }

    func test_reactions_ownMood_servesNothing() {
        let sut = makeSUT()

        XCTAssertNil(sut.reactions(for: makeEntry(userId: "me")))
    }

    func test_reactions_noHandlerWired_servesNothing() {
        let sut = StatusBubbleController(postService: MockPostService(), currentUserId: { "me" })

        XCTAssertNil(sut.reactions(for: makeEntry(userId: "author")))
    }
}
