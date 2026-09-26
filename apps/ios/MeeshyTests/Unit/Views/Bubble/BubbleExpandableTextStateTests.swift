import XCTest
import MeeshySDK
@testable import Meeshy

/// #8147 — le texte d'un message long se replie sur son EXTRAIT (un quart,
/// coupé au mot, loi `LongMessageExcerpt`) suivi de « … », et se déplie EN
/// PLACE ; « Réduire » le replie.
@MainActor
final class BubbleExpandableTextStateTests: XCTestCase {

    private func longText(words: Int = 400) -> String {
        Array(repeating: "lecture", count: words).joined(separator: " ")
    }

    func test_displayedText_shortMessage_isTheWholeTextWithoutToggle() {
        let state = BubbleExpandableText.State(content: "Bonjour", isExpanded: false)
        XCTAssertEqual(state.displayedText, "Bonjour")
        XCTAssertFalse(state.showsReadMore)
        XCTAssertFalse(state.showsCollapse)
    }

    func test_displayedText_longCollapsed_isTheExcerptFollowedByAnEllipsis() throws {
        let text = longText()
        let excerpt = try XCTUnwrap(LongMessageExcerpt.excerpt(text))
        let state = BubbleExpandableText.State(content: text, isExpanded: false)
        XCTAssertEqual(state.displayedText, excerpt + "…")
        XCTAssertTrue(state.showsReadMore)
        XCTAssertFalse(state.showsCollapse)
    }

    func test_displayedText_longCollapsed_showsLessThanHalf() {
        let text = longText()
        let state = BubbleExpandableText.State(content: text, isExpanded: false)
        XCTAssertLessThan(state.displayedText.count * 2, text.count)
    }

    func test_displayedText_longExpanded_isTheWholeTextWithACollapseToggle() {
        let text = longText()
        let state = BubbleExpandableText.State(content: text, isExpanded: true)
        XCTAssertEqual(state.displayedText, text)
        XCTAssertFalse(state.showsReadMore)
        XCTAssertTrue(state.showsCollapse)
    }

    func test_expansion_equality_readsTheStateOnly_notTheClosure() {
        XCTAssertEqual(
            LongMessageExpansion(isExpanded: true, toggle: {}),
            LongMessageExpansion(isExpanded: true, toggle: { _ = 1 })
        )
        XCTAssertNotEqual(
            LongMessageExpansion(isExpanded: true, toggle: {}),
            LongMessageExpansion(isExpanded: false, toggle: {})
        )
    }
}
