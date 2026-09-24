import XCTest
@testable import Meeshy

/// Poser ou retirer une emphase (#7849) — les mêmes cas que
/// `packages/shared/__tests__/text-format.test.ts`.
final class ComposerTextFormatTests: XCTestCase {

    private func toggle(_ text: String, _ selected: String, _ style: ComposerTextFormat.Style) -> ComposerTextFormat.Result {
        let chars = Array(text)
        let needle = Array(selected)
        let start = (0...(chars.count - needle.count)).first { Array(chars[$0..<($0 + needle.count)]) == needle } ?? 0
        return ComposerTextFormat.toggle(text: text, start: start, end: start + needle.count, style: style)
    }

    func test_toggle_wrapsSelection_keepsWordSelected() {
        XCTAssertEqual(toggle("un mot fort", "mot", .bold), .init(text: "un **mot** fort", start: 5, end: 8))
    }

    func test_toggle_fourStyles_useRendererMarkers() {
        XCTAssertEqual(toggle("un mot", "mot", .italic).text, "un *mot*")
        XCTAssertEqual(toggle("un mot", "mot", .underline).text, "un __mot__")
        XCTAssertEqual(toggle("un mot", "mot", .strikethrough).text, "un ~~mot~~")
    }

    func test_toggle_edgeWhitespace_staysOutside() {
        XCTAssertEqual(toggle("un mot fort", " mot ", .bold).text, "un **mot** fort")
    }

    func test_toggle_emptySelection_insertsPair_caretInside() {
        XCTAssertEqual(ComposerTextFormat.toggle(text: "ab", start: 1, end: 1, style: .strikethrough),
                       .init(text: "a~~~~b", start: 3, end: 3))
    }

    func test_toggle_again_removesEmphasis() {
        let once = toggle("un mot fort", "mot", .bold)
        XCTAssertEqual(ComposerTextFormat.toggle(text: once.text, start: once.start, end: once.end, style: .bold),
                       .init(text: "un mot fort", start: 3, end: 6))
        XCTAssertEqual(toggle("un **mot** fort", "**mot**", .bold), .init(text: "un mot fort", start: 3, end: 6))
    }

    func test_toggle_italicInsideBold_addsInsteadOfRemoving() {
        XCTAssertEqual(toggle("**mot**", "mot", .italic).text, "***mot***")
        XCTAssertEqual(toggle("***mot***", "mot", .italic).text, "**mot**")
    }

    func test_toggle_whitespaceOnlySelection_changesNothing() {
        XCTAssertEqual(ComposerTextFormat.toggle(text: "a   b", start: 1, end: 4, style: .bold).text, "a   b")
    }

    func test_toggle_emojiText_countsCharacters() {
        XCTAssertEqual(toggle("👋🏽 salut", "salut", .bold).text, "👋🏽 **salut**")
    }
}
