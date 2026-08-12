import XCTest
@testable import MeeshySDK

final class DisplayNameTests: XCTestCase {

    func test_shorterThanLimit_returnsUnchanged() {
        XCTAssertEqual(DisplayName.truncated("Alice"), "Alice")
    }

    func test_exactlyAtLimit_returnsUnchanged() {
        let name = String(repeating: "a", count: 16)
        XCTAssertEqual(DisplayName.truncated(name), name,
                       "16 caractères tiennent : pas d'ellipse sur la limite elle-même")
    }

    func test_oneOverLimit_truncatesAndAppendsEllipsis() {
        let name = String(repeating: "a", count: 17)
        XCTAssertEqual(DisplayName.truncated(name), String(repeating: "a", count: 16) + "\u{2026}")
    }

    func test_truncation_keepsSixteenCharactersBeforeEllipsis() {
        let result = DisplayName.truncated("Jean-Baptiste Poquelin")
        XCTAssertEqual(result, "Jean-Baptiste Po\u{2026}")
        XCTAssertEqual(result.dropLast().count, 16)
    }

    func test_truncation_stripsTrailingWhitespaceBeforeEllipsis() {
        // Le 16e caractère EST l'espace : sans trim on afficherait
        // « Marie-Christine …» avec l'ellipse détachée du nom.
        XCTAssertEqual(DisplayName.truncated("Marie-Christine Dupont"),
                       "Marie-Christine\u{2026}")
    }

    func test_countsGraphemes_notUTF16Units() {
        // 17 emoji composés : chacun pèse plusieurs unités UTF-16 mais UN
        // caractère — la coupe doit tomber sur le 17e, pas au milieu du 3e.
        let name = String(repeating: "👩‍👩‍👧", count: 17)
        let result = DisplayName.truncated(name)
        XCTAssertEqual(result.dropLast().count, 16)
        XCTAssertTrue(result.hasSuffix("\u{2026}"))
    }

    func test_customLimit_isHonoured() {
        XCTAssertEqual(DisplayName.truncated("abcdefghij", limit: 4), "abcd\u{2026}")
    }

    func test_nonPositiveLimit_returnsEmpty() {
        XCTAssertEqual(DisplayName.truncated("Alice", limit: 0), "")
    }

    func test_emptyName_returnsEmpty() {
        XCTAssertEqual(DisplayName.truncated(""), "")
    }
}
