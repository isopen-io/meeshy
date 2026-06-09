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

    // MARK: - exceeds (bounded length threshold, replaces O(n) `count > limit`)

    func test_exceeds_shorterThanLimit_isFalse() {
        XCTAssertFalse(BubbleExpandableText.exceeds("hello", 10))
    }

    func test_exceeds_exactlyAtLimit_isFalse() {
        // count == limit is NOT "exceeds" — mirrors `count > limit` exactly.
        XCTAssertFalse(BubbleExpandableText.exceeds("12345", 5))
    }

    func test_exceeds_oneOverLimit_isTrue() {
        XCTAssertTrue(BubbleExpandableText.exceeds("123456", 5))
    }

    func test_exceeds_countsGraphemeClusters_notBytes() {
        // "👋🎉" is 2 characters (grapheme clusters), like String.count.
        XCTAssertFalse(BubbleExpandableText.exceeds("👋🎉", 2))
        XCTAssertTrue(BubbleExpandableText.exceeds("👋🎉a", 2))
    }

    func test_exceeds_matchesCountComparison_forBoundaryCases() {
        let cases: [(String, Int)] = [("", 0), ("a", 0), ("a", 1), ("abc", 3), ("abcd", 3)]
        for (s, limit) in cases {
            XCTAssertEqual(BubbleExpandableText.exceeds(s, limit), s.count > limit, "exceeds('\(s)', \(limit))")
        }
    }
}
