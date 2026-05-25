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
