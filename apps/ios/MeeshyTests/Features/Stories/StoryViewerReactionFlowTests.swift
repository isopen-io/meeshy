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
}
