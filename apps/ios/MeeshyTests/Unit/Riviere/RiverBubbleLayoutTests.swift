import XCTest
@testable import Meeshy

/// `RiverBubbleLayout.initials` — pur, testable sans monter `RiverBubbleView`
/// (§ « ce que tu peux éprouver sans runtime UIKit complet »).
final class RiverBubbleLayoutTests: XCTestCase {

    func test_initials_twoWords_takesFirstLetterOfEach() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Marie Curie"), "MC")
    }

    func test_initials_oneWord_takesFirstLetterOnly() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Bob"), "B")
    }

    func test_initials_threeWords_takesOnlyFirstTwo() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Jean de La Fontaine"), "JD")
    }

    func test_initials_uppercasesLowercaseInput() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "marie curie"), "MC")
    }

    func test_initials_extraWhitespace_isIgnored() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "  Marie   Curie  "), "MC")
    }

    func test_initials_emptyName_returnsPlaceholder() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: ""), "?")
    }

    func test_initials_whitespaceOnlyName_returnsPlaceholder() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "   "), "?")
    }

    func test_initials_toi_isTreatedAsAnyOtherWord_noSpecialCase() {
        // Le SENS de « Toi » (résolution `isViewer`) est une affaire de
        // l'appelant, jamais de ce calcul purement typographique.
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Toi"), "T")
    }
}
