import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleEquatableTests: XCTestCase {

    func test_bubbleBackground_sameInputs_equal() {
        let a = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        XCTAssertEqual(a, b)
    }

    func test_bubbleBackground_differentTheme_notEqual() {
        let a = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: true)
        XCTAssertNotEqual(a, b)
    }

    func test_editedIndicator_savingState_notEqual() {
        let a = BubbleEditedIndicator(isMe: false, isSaving: false, hasEditHistory: false, isDark: false)
        let b = BubbleEditedIndicator(isMe: false, isSaving: true, hasEditHistory: false, isDark: false)
        XCTAssertNotEqual(a, b)
    }

    func test_footer_sameModel_equal() {
        let model = BubbleFooterModel(
            sender: nil, flags: [], showsTranslate: false,
            timestamp: "12:34", delivery: .read, isOffline: false, isMe: true
        )
        let a = BubbleFooter(model: model, actions: .none, style: .overlay, isDark: false)
        let b = BubbleFooter(model: model, actions: .none, style: .overlay, isDark: false)
        XCTAssertEqual(a, b)
    }

    func test_footer_differentTimestamp_notEqual() {
        let base = BubbleFooterModel(
            sender: nil, flags: [], showsTranslate: false,
            timestamp: "12:34", delivery: .sent, isOffline: false, isMe: true
        )
        var other = base
        other.timestamp = "12:35"
        let a = BubbleFooter(model: base, actions: .none, style: .row, isDark: false)
        let b = BubbleFooter(model: other, actions: .none, style: .row, isDark: false)
        XCTAssertNotEqual(a, b)
    }

    func test_pinnedIndicator_isStateless() {
        XCTAssertEqual(
            BubblePinnedIndicator(),
            BubblePinnedIndicator()
        )
    }

    func test_reactionsOverlay_sameSummaries_equal() {
        // MeeshyReactionSummary has no latestAt field — drop the spec template
        // value, the manual Equatable on BubbleReactionsOverlay projects
        // (emoji, count, includesMe) only.
        let s = [ReactionSummary(emoji: "👍", count: 2, includesMe: true)]
        let a = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: s,
            isMe: false,
            isDark: true,
            isLastReceivedMessage: true,
            accentHex: "FFF"
        )
        let b = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: s,
            isMe: false,
            isDark: true,
            isLastReceivedMessage: true,
            accentHex: "FFF"
        )
        XCTAssertEqual(a, b)
    }

    func test_reactionsOverlay_callbackDifference_stillEqual() {
        // Les callbacks ne participent PAS à l'égalité.
        var a = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: [],
            isMe: false,
            isDark: false,
            isLastReceivedMessage: false,
            accentHex: "F"
        )
        let b = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: [],
            isMe: false,
            isDark: false,
            isLastReceivedMessage: false,
            accentHex: "F"
        )
        a.onAddReaction = { _ in }
        XCTAssertEqual(a, b)
    }
}

/// Garde de l'animation d'entree des reactions. La pile produit ne doit animer
/// QUE les reactions reellement ajoutees (toggle local / socket temps reel),
/// jamais celles qui scrollent simplement dans le viewport (cellule recyclee).
@MainActor
final class ReactionAnimationGateTests: XCTestCase {

    override func setUp() {
        super.setUp()
        ReactionAnimationGate.resetForTesting()
    }

    override func tearDown() {
        ReactionAnimationGate.resetForTesting()
        super.tearDown()
    }

    /// LE cas du bug : une reaction existante, jamais marquee, ne doit pas
    /// animer quand sa bulle (re)apparait au scroll.
    func test_shouldAnimate_unmarked_isFalse() {
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "👍"))
    }

    /// Une reaction marquee (ajout reel) anime — et UNIQUEMENT cette cle.
    func test_markAdded_thenShouldAnimate_isTrue_forThatKeyOnly() {
        let t = Date()
        ReactionAnimationGate.now = { t }
        ReactionAnimationGate.markAdded(messageId: "m1", emoji: "👍")
        XCTAssertTrue(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "👍"))
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "❤️"))
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m2", emoji: "👍"))
    }

    /// Passe la fenetre d'animation, un scroll-in ulterieur rend la reaction
    /// statiquement (plus d'animation).
    func test_markAdded_expiresAfterWindow() {
        var t = Date()
        ReactionAnimationGate.now = { t }
        ReactionAnimationGate.markAdded(messageId: "m1", emoji: "👍")
        t = t.addingTimeInterval(ReactionAnimationGate.window + 0.1)
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "👍"))
    }
}
