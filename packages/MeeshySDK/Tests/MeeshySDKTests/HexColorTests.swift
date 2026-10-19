import XCTest
@testable import MeeshySDK

final class HexColorTests: XCTestCase {
    func test_init_sixDigitsWithHash_parsesOpaque() {
        let c = HexColor(hex: "#FF8000")
        XCTAssertEqual(c?.r, 1)
        XCTAssertEqual(c?.g ?? 0, 128.0 / 255, accuracy: 1e-9)
        XCTAssertEqual(c?.b, 0)
        XCTAssertEqual(c?.a, 1)
    }

    func test_init_withoutHashAndLowercase_matchesUppercase() {
        XCTAssertEqual(HexColor(hex: "6366f1"), HexColor(hex: "#6366F1"))
    }

    func test_init_eightDigits_alphaIsLast() {
        let c = HexColor(hex: "000000A6")
        XCTAssertEqual(c?.r, 0)
        XCTAssertEqual(c?.b, 0)
        XCTAssertEqual(c?.a ?? 0, 166.0 / 255, accuracy: 1e-9)
    }

    func test_init_surroundingWhitespace_isIgnored() {
        XCTAssertEqual(HexColor(hex: "  #112233\n"), HexColor(hex: "112233"))
    }

    func test_init_threeDigitsOrInvalidLength_returnsNil() {
        XCTAssertNil(HexColor(hex: "#FFF"))
        XCTAssertNil(HexColor(hex: "1234567"))
        XCTAssertNil(HexColor(hex: ""))
    }

    func test_init_nonHexText_returnsNil() {
        XCTAssertNil(HexColor(hex: "ZZZZZZ"))
    }
}
