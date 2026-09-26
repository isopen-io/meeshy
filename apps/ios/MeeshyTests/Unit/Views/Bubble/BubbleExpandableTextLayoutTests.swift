import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleExpandableTextLayoutTests: XCTestCase {

    /// #8147 — le seuil de « Lire la suite » reste celui d'aujourd'hui : il
    /// appartient désormais à la loi partagée, jamais à la vue.
    func test_readMoreThreshold_isTheSharedLawThreshold() {
        XCTAssertEqual(LongMessageExcerpt.threshold, 512)
    }

    func test_equatable_excludesState() {
        let text1 = BubbleExpandableText(
            content: "hello",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            hashtagTint: .purple,
            linkTint: .blue,
            isDark: false
        )

        let text2 = BubbleExpandableText(
            content: "hello",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            hashtagTint: .purple,
            linkTint: .blue,
            isDark: false
        )

        XCTAssertEqual(text1, text2)
    }

    func test_equatable_detectsContentChange() {
        let text1 = BubbleExpandableText(
            content: "hello",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            hashtagTint: .purple,
            linkTint: .blue,
            isDark: false
        )

        let text2 = BubbleExpandableText(
            content: "world",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            hashtagTint: .purple,
            linkTint: .blue,
            isDark: false
        )

        XCTAssertNotEqual(text1, text2)
    }

    func test_equatable_detectsExpansionChange() {
        let make: (Bool) -> BubbleExpandableText = { isExpanded in
            BubbleExpandableText(
                content: "hello",
                isMe: true,
                mentionDisplayNames: [:],
                highlightTerm: nil,
                mentionTint: .blue,
                hashtagTint: .purple,
                linkTint: .blue,
                isDark: false,
                expansion: LongMessageExpansion(isExpanded: isExpanded, toggle: {})
            )
        }
        XCTAssertNotEqual(make(true), make(false))
    }
}
