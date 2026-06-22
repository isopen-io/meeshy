import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class BubbleExpandableTextLayoutTests: XCTestCase {

    func test_truncateLimit_isConstant() {
        XCTAssertEqual(BubbleExpandableText.truncateLimit, 512)
    }

    func test_equatable_excludesState() {
        let text1 = BubbleExpandableText(
            content: "hello",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            linkTint: .blue
        )

        let text2 = BubbleExpandableText(
            content: "hello",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            linkTint: .blue
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
            linkTint: .blue
        )

        let text2 = BubbleExpandableText(
            content: "world",
            isMe: true,
            mentionDisplayNames: [:],
            highlightTerm: nil,
            mentionTint: .blue,
            linkTint: .blue
        )

        XCTAssertNotEqual(text1, text2)
    }

    func test_truncateAtWord_preservesShortText() {
        let short = "Short text"
        XCTAssertEqual(BubbleExpandableText.truncateAtWord(short, limit: 100), short)
    }

    func test_truncateAtWord_truncatesAtSpace() {
        let long = "This is a very long text that should be truncated at some point"
        let limit = 15 // "This is a very l"
        let expected = "This is a very"
        XCTAssertEqual(BubbleExpandableText.truncateAtWord(long, limit: limit), expected)
    }
}
