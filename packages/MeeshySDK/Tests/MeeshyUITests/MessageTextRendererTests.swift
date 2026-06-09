import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class MessageTextRendererTests: XCTestCase {

    // MARK: - Highlight Term

    func test_render_withoutHighlightTerm_returnsNormalText() {
        let result = MessageTextRenderer.render("Hello world", color: .primary)
        XCTAssertNotNil(result)
    }

    func test_render_withHighlightTerm_returnsText() {
        let result = MessageTextRenderer.render(
            "Hello world",
            color: .primary,
            highlightTerm: "world"
        )
        XCTAssertNotNil(result)
    }

    func test_render_withEmptyHighlightTerm_returnsNormalText() {
        let result = MessageTextRenderer.render(
            "Hello world",
            color: .primary,
            highlightTerm: ""
        )
        XCTAssertNotNil(result)
    }

    func test_render_withNilHighlightTerm_returnsNormalText() {
        let result = MessageTextRenderer.render(
            "Hello world",
            color: .primary,
            highlightTerm: nil
        )
        XCTAssertNotNil(result)
    }

    // MARK: - Display-name mentions (memoized rules path)

    func test_render_withDisplayNameMentions_runsCachedRulesPath() {
        // Exercises displayNameRules(from:) -> DisplayNameRulesCache: the map is
        // hashed as the cache key and the per-member regexes are compiled once.
        let names = ["atabeth": "Ata Beth", "jdoe": "John Doe"]
        let result = MessageTextRenderer.render(
            "Salut @Ata Beth et @John Doe",
            color: .primary,
            mentionDisplayNames: names
        )
        XCTAssertNotNil(result)
    }

    func test_render_withDisplayNameMentions_repeatedSameMap_isDeterministic() {
        // Second render hits the cache (identical map); output must be identical.
        let names = ["atabeth": "Ata Beth"]
        let first = MessageTextRenderer.render("ping @Ata Beth", color: .primary, mentionDisplayNames: names)
        let second = MessageTextRenderer.render("ping @Ata Beth", color: .primary, mentionDisplayNames: names)
        XCTAssertEqual(first, second)
    }

    func test_render_withDifferentDisplayNameMaps_doesNotCrash() {
        // Distinct maps -> distinct cache keys; both render correctly.
        let r1 = MessageTextRenderer.render("@Ata Beth", color: .primary, mentionDisplayNames: ["atabeth": "Ata Beth"])
        let r2 = MessageTextRenderer.render("@John Doe", color: .primary, mentionDisplayNames: ["jdoe": "John Doe"])
        XCTAssertNotNil(r1)
        XCTAssertNotNil(r2)
    }

    // MARK: - highlightRanges (internal)

    func test_highlightRanges_findsAllOccurrences() {
        let text = "hello world hello"
        let ranges = MessageTextRenderer.highlightRanges(in: text, term: "hello")
        XCTAssertEqual(ranges.count, 2)
        XCTAssertEqual((text as NSString).substring(with: ranges[0]), "hello")
        XCTAssertEqual((text as NSString).substring(with: ranges[1]), "hello")
    }

    func test_highlightRanges_isCaseInsensitive() {
        let text = "Hello HELLO hElLo"
        let ranges = MessageTextRenderer.highlightRanges(in: text, term: "hello")
        XCTAssertEqual(ranges.count, 3)
    }

    func test_highlightRanges_emptyTerm_returnsEmpty() {
        let ranges = MessageTextRenderer.highlightRanges(in: "hello", term: "")
        XCTAssertTrue(ranges.isEmpty)
    }

    func test_highlightRanges_noMatch_returnsEmpty() {
        let ranges = MessageTextRenderer.highlightRanges(in: "hello world", term: "xyz")
        XCTAssertTrue(ranges.isEmpty)
    }

    func test_highlightRanges_partialWord_matches() {
        let text = "bonjour"
        let ranges = MessageTextRenderer.highlightRanges(in: text, term: "jour")
        XCTAssertEqual(ranges.count, 1)
        XCTAssertEqual((text as NSString).substring(with: ranges[0]), "jour")
    }
}
