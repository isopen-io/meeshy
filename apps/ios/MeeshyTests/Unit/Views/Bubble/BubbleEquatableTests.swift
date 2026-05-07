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

    func test_mediaTimestampOverlay_sameInputs_equal() {
        let a = BubbleMediaTimestampOverlay(time: "12:34", isMe: true, deliveryStatus: .read)
        let b = BubbleMediaTimestampOverlay(time: "12:34", isMe: true, deliveryStatus: .read)
        XCTAssertEqual(a, b)
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
