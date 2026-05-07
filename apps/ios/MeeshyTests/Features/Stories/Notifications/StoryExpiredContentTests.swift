import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryExpiredContentTests: XCTestCase {

    // MARK: - Helpers

    private func makeReactionContext() -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Alice",
            trigger: .reaction(emoji: "🔥"),
            occurredAt: Date()
        )
    }

    private func makeCommentContext(preview: String = "Hello!") -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Bob",
            trigger: .comment(preview: preview),
            occurredAt: Date()
        )
    }

    // MARK: - Adaptive foreground

    func test_foregroundOnBackground_lightBg_returnsBlack() {
        // White luminance is 1.0, well above the 0.6 threshold → should pick black.
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(.white), .black)
    }

    func test_foregroundOnBackground_darkBg_returnsWhite() {
        // Black luminance is 0, well below the 0.6 threshold → should pick white.
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(.black), .white)
    }

    // MARK: - Init smoke

    func test_init_doesNotCrash_withReactionTrigger() {
        let view = StoryExpiredContent(storyId: "s1", context: makeReactionContext())
        XCTAssertEqual(view.storyId, "s1")
        // Touch the body to ensure no fatalError branch is hit on construction.
        _ = view.body
    }

    func test_init_doesNotCrash_withCommentTrigger() {
        let view = StoryExpiredContent(storyId: "s2", context: makeCommentContext())
        XCTAssertEqual(view.storyId, "s2")
        _ = view.body
    }
}
