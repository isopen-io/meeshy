import XCTest
@testable import Meeshy

@MainActor
final class BubbleExpandableTextStateTests: XCTestCase {
    func test_truncateAtWord_returnsFullStringWhenShorterThanLimit() {
        XCTAssertEqual(BubbleExpandableText.truncateAtWord("hello", limit: 100), "hello")
    }

    func test_truncateAtWord_truncatesAtLastSpace() {
        let input = "hello world this is a test"
        let result = BubbleExpandableText.truncateAtWord(input, limit: 14)
        XCTAssertEqual(result, "hello world")
    }

    func test_truncateAtWord_fallsBackToHardCutWhenNoSpace() {
        let input = "abcdefghijklmnop"
        let result = BubbleExpandableText.truncateAtWord(input, limit: 5)
        XCTAssertEqual(result, "abcde")
    }

    func test_needsTruncation_respectsExpandedFlag() {
        let state = BubbleExpandableText.State(content: String(repeating: "x", count: 600), isExpanded: false)
        XCTAssertTrue(state.needsTruncation(limit: 512))

        let expanded = BubbleExpandableText.State(content: String(repeating: "x", count: 600), isExpanded: true)
        XCTAssertFalse(expanded.needsTruncation(limit: 512))
    }
}
