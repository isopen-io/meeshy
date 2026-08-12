import XCTest
@testable import MeeshySDK

final class LinkPreviewFetcherTests: XCTestCase {

    // MARK: - trimmedDecoded — named entities

    func test_trimmedDecoded_decodesAmpersand() {
        XCTAssertEqual("Bread &amp; Butter".trimmedDecoded, "Bread & Butter")
    }

    func test_trimmedDecoded_decodesLtGt() {
        XCTAssertEqual("&lt;tag&gt;".trimmedDecoded, "<tag>")
    }

    func test_trimmedDecoded_decodesQuotAndApos() {
        XCTAssertEqual("say &quot;hi&quot; &amp; &#39;bye&#39;".trimmedDecoded, "say \"hi\" & 'bye'")
    }

    func test_trimmedDecoded_decodesNbsp() {
        XCTAssertEqual("Hello&nbsp;World".trimmedDecoded, "Hello World")
    }

    func test_trimmedDecoded_decodesDashesAndEllipsis() {
        XCTAssertEqual("A&mdash;B&ndash;C&hellip;".trimmedDecoded, "A—B–C…")
    }

    // MARK: - trimmedDecoded — numeric decimal entities

    func test_trimmedDecoded_decodesCopyrightDecimal() {
        XCTAssertEqual("&#169; 2024 Company".trimmedDecoded, "© 2024 Company")
    }

    func test_trimmedDecoded_decodesRegisteredDecimal() {
        XCTAssertEqual("Meeshy&#174;".trimmedDecoded, "Meeshy®")
    }

    func test_trimmedDecoded_decodesMultipleDecimalEntities() {
        XCTAssertEqual("&#65;&#66;&#67;".trimmedDecoded, "ABC")
    }

    func test_trimmedDecoded_decodesEmojiViaDecimal() {
        // 😀 = U+1F600 = decimal 128512
        XCTAssertEqual("Hello &#128512;".trimmedDecoded, "Hello 😀")
    }

    // MARK: - trimmedDecoded — numeric hex entities

    func test_trimmedDecoded_decodesCopyrightHex() {
        XCTAssertEqual("&#xA9; 2024".trimmedDecoded, "© 2024")
    }

    func test_trimmedDecoded_decodesRegisteredHex() {
        XCTAssertEqual("&#xAE;".trimmedDecoded, "®")
    }

    func test_trimmedDecoded_decodesHexCaseInsensitive() {
        XCTAssertEqual("&#xa9;".trimmedDecoded, "©")
    }

    func test_trimmedDecoded_decodesMultipleHexEntities() {
        XCTAssertEqual("&#x41;&#x42;&#x43;".trimmedDecoded, "ABC")
    }

    func test_trimmedDecoded_decodesMixedNumericAndNamed() {
        XCTAssertEqual("&#169; &amp; &#xAE;".trimmedDecoded, "© & ®")
    }

    // MARK: - trimmedDecoded — whitespace trimming

    func test_trimmedDecoded_trimsLeadingAndTrailingWhitespace() {
        XCTAssertEqual("  Hello  ".trimmedDecoded, "Hello")
    }

    func test_trimmedDecoded_preservesInternalWhitespace() {
        XCTAssertEqual("Hello World".trimmedDecoded, "Hello World")
    }

    // MARK: - trimmedDecoded — edge cases

    func test_trimmedDecoded_emptyStringRemainsEmpty() {
        XCTAssertEqual("".trimmedDecoded, "")
    }

    func test_trimmedDecoded_noEntitiesUnchanged() {
        XCTAssertEqual("Plain text without entities".trimmedDecoded, "Plain text without entities")
    }

    func test_trimmedDecoded_invalidEntityLeftAsIs() {
        // &#xZZZZ; is not valid hex — should not crash and should be left alone
        let input = "&#xZZZZ;"
        let result = input.trimmedDecoded
        XCTAssertEqual(result, "&#xZZZZ;")
    }

    // MARK: - firstURL

    func test_firstURL_extractsHttpsLink() {
        let text = "Check out https://meeshy.me for details"
        XCTAssertEqual(LinkPreviewFetcher.firstURL(in: text), "https://meeshy.me")
    }

    func test_firstURL_extractsHttpLink() {
        let text = "Visit http://example.com now"
        XCTAssertEqual(LinkPreviewFetcher.firstURL(in: text), "http://example.com")
    }

    func test_firstURL_returnsNilForPlainText() {
        XCTAssertNil(LinkPreviewFetcher.firstURL(in: "No links here"))
    }

    func test_firstURL_returnsNilForEmptyString() {
        XCTAssertNil(LinkPreviewFetcher.firstURL(in: ""))
    }

    func test_firstURL_ignoresMailtoLinks() {
        XCTAssertNil(LinkPreviewFetcher.firstURL(in: "Contact us at mailto:test@example.com"))
    }

    func test_firstURL_returnsFirstUrlWhenMultiplePresent() {
        let text = "See https://first.com and https://second.com"
        XCTAssertEqual(LinkPreviewFetcher.firstURL(in: text), "https://first.com")
    }
}
