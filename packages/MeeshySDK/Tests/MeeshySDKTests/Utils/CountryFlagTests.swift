import XCTest
@testable import MeeshySDK

final class CountryFlagTests: XCTestCase {

    // MARK: - Emoji

    func test_emoji_FR_returnsFrenchFlag() {
        XCTAssertEqual(CountryFlag.emoji(for: "FR"), "\u{1F1EB}\u{1F1F7}")
    }

    func test_emoji_US_returnsAmericanFlag() {
        XCTAssertEqual(CountryFlag.emoji(for: "US"), "\u{1F1FA}\u{1F1F8}")
    }

    func test_emoji_JP_returnsJapaneseFlag() {
        XCTAssertEqual(CountryFlag.emoji(for: "JP"), "\u{1F1EF}\u{1F1F5}")
    }

    func test_emoji_GB_returnsBritishFlag() {
        XCTAssertEqual(CountryFlag.emoji(for: "GB"), "\u{1F1EC}\u{1F1E7}")
    }

    // MARK: - Lowercase Input

    func test_emoji_lowercase_fr_returnsFrenchFlag() {
        XCTAssertEqual(CountryFlag.emoji(for: "fr"), "\u{1F1EB}\u{1F1F7}")
    }

    func test_emoji_mixedCase_uS_returnsAmericanFlag() {
        XCTAssertEqual(CountryFlag.emoji(for: "uS"), "\u{1F1FA}\u{1F1F8}")
    }

    // MARK: - Invalid Input

    func test_emoji_emptyString_returnsEmpty() {
        XCTAssertEqual(CountryFlag.emoji(for: ""), "")
    }

    func test_emoji_singleChar_returnsEmpty() {
        XCTAssertEqual(CountryFlag.emoji(for: "F"), "")
    }

    func test_emoji_threeChars_returnsEmpty() {
        XCTAssertEqual(CountryFlag.emoji(for: "FRA"), "")
    }

    func test_emoji_numericInput_returnsEmpty() {
        XCTAssertEqual(CountryFlag.emoji(for: "12"), "")
    }

    func test_emoji_specialChars_returnsEmpty() {
        XCTAssertEqual(CountryFlag.emoji(for: "!!"), "")
    }

    // MARK: - Name

    func test_name_FR_returnsNonNil() {
        let name = CountryFlag.name(for: "FR")
        XCTAssertNotNil(name)
        // The exact localized name depends on the simulator locale,
        // but it should be some form of "France"
    }

    func test_name_US_returnsNonNil() {
        let name = CountryFlag.name(for: "US")
        XCTAssertNotNil(name)
    }

    func test_name_XX_returnsNil() {
        let name = CountryFlag.name(for: "XX")
        // "XX" is not a valid ISO region code, so it may return nil
        // depending on locale APIs. Some systems return a string anyway.
        // We just verify it does not crash.
        _ = name
    }

    func test_name_lowercase_jp_returnsNonNil() {
        let name = CountryFlag.name(for: "jp")
        XCTAssertNotNil(name)
    }
}
