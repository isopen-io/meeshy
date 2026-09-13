import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

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
        // White luminance is 1.0 → picks black.
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(.white), .black)
    }

    func test_foregroundOnBackground_darkBg_returnsWhite() {
        // Black luminance is 0 → picks white.
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(.black), .white)
    }

    /// #5956 — the previous hand-picked `0.6` threshold misjudged the whole
    /// `0.179 → 0.6` luminance range. `#46BDCA` (L ≈ 0,4196) used to get white
    /// text over a story background even though black contrasts far better.
    func test_foregroundOnBackground_midRangeBg_returnsBlack() {
        XCTAssertEqual(StoryExpiredContent.foregroundOnBackground(Color(hex: "#46BDCA")), .black)
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
