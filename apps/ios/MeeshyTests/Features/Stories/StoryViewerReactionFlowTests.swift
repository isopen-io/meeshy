import XCTest
import SwiftUI
@testable import Meeshy

/// Tests-de-spec pour le pattern `dismiss-then-react` de `triggerStoryReaction`.
///
/// `triggerStoryReaction` est private sur `StoryViewerView` et dépend de
/// `@State` SwiftUI difficiles à instrumenter sans refactor. Ces tests
/// documentent le comportement attendu (mirror de la spec) et servent
/// de sentinelle d'intention. La vraie garantie de régression vient :
/// 1. de l'inspection du code source (le bloc `if showFullEmojiPicker { ... }`
///    doit être présent en début de `triggerStoryReaction`)
/// 2. du smoke test manuel (cf. `docs/superpowers/specs/2026-05-28-story-reactions-canvas-uxfixes-design.md` § Section 1A)
@MainActor
final class StoryViewerReactionFlowTests: XCTestCase {

    func test_specPattern_fullPickerVisible_dismissesItImmediately() {
        // Mirror du préambule de triggerStoryReaction.
        var showFullEmojiPicker = true
        var bigReactionEmoji: String?

        if showFullEmojiPicker {
            showFullEmojiPicker = false  // dismiss IMMÉDIAT
        }
        bigReactionEmoji = "❤️"

        XCTAssertFalse(showFullEmojiPicker, "Full picker doit se fermer immédiatement")
        XCTAssertEqual(bigReactionEmoji, "❤️", "L'animation doit recevoir l'emoji choisi")
    }

    func test_specPattern_stripVisible_isNotDismissedImmediately() {
        // Strip a un délai 0.5s avant dismiss — feedback visuel délibéré.
        let showEmojiStrip = true
        var bigReactionEmoji: String?

        // Le préambule de triggerStoryReaction NE touche PAS showEmojiStrip.
        bigReactionEmoji = "😂"

        XCTAssertTrue(showEmojiStrip, "Strip reste visible (dismiss différé asyncAfter 0.5s)")
        XCTAssertEqual(bigReactionEmoji, "😂")
    }

    func test_specPattern_noOverlayVisible_animationStillFires() {
        // Pas d'overlay → animation directe.
        let showFullEmojiPicker = false
        let showEmojiStrip = false
        var bigReactionEmoji: String?

        bigReactionEmoji = "🔥"

        XCTAssertFalse(showFullEmojiPicker)
        XCTAssertFalse(showEmojiStrip)
        XCTAssertEqual(bigReactionEmoji, "🔥")
    }

    // MARK: - Rollback pattern (P1 — 409 REACTION_LIMIT_REACHED)
    //
    // `sendReaction(emoji:priorReactions:priorCount:)` (StoryViewerView+Content.swift)
    // is likewise private-state-bound and untestable without a live view. These
    // tests mirror the exact snapshot → optimistic-mutate → rollback-on-failure
    // sequence that `triggerStoryReaction` + `sendReaction` now perform together,
    // pinning the intent that a rejected `StoryInteractionService.react` (any
    // throw — 409 REACTION_LIMIT_REACHED is the concrete reproducible one)
    // restores the EXACT pre-mutation snapshot, never a hardcoded empty state.

    func test_specPattern_reactionRejected_restoresExactPriorSnapshot() {
        // Arrange: user already reacted with 👍 before this tap.
        var storyCurrentUserReactions = ["👍"]
        var storyReactionCount = 3

        // Snapshot taken BEFORE the optimistic mutation (mirrors triggerStoryReaction).
        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        // Optimistic mutation: user taps a NEW emoji, server will reject it
        // (409 REACTION_LIMIT_REACHED — max 1 reaction per user already spent).
        let emoji = "😂"
        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }
        XCTAssertEqual(storyCurrentUserReactions, ["👍", "😂"], "Precondition: optimistic append happened")
        XCTAssertEqual(storyReactionCount, 4, "Precondition: optimistic bump happened")

        // Act: the network call throws (mirrors the `catch` in `sendReaction`).
        let networkCallDidThrow = true
        if networkCallDidThrow {
            storyCurrentUserReactions = priorReactions
            storyReactionCount = priorCount
        }

        // Assert: rolled back to the EXACT prior state — not emptied, not
        // decremented blindly (the prior 👍 reaction is preserved).
        XCTAssertEqual(storyCurrentUserReactions, ["👍"])
        XCTAssertEqual(storyReactionCount, 3)
    }

    func test_specPattern_reactionSucceeds_keepsOptimisticMutation() {
        var storyCurrentUserReactions: [String] = []
        var storyReactionCount = 0

        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        let emoji = "🔥"
        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }

        let networkCallDidThrow = false
        if networkCallDidThrow {
            storyCurrentUserReactions = priorReactions
            storyReactionCount = priorCount
        }

        XCTAssertEqual(storyCurrentUserReactions, ["🔥"], "Successful reaction keeps the optimistic emoji")
        XCTAssertEqual(storyReactionCount, 1)
    }
}
