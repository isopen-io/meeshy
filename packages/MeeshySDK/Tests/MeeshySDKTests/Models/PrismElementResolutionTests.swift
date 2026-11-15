import XCTest
@testable import MeeshySDK

final class PrismElementResolutionTests: XCTestCase {

    private struct Row: Equatable {
        let target: String
        let text: String
    }

    private func resolve(_ rows: [Row], original: String?, prism: [String]) -> Row? {
        PrismTranslationResolver.resolveElement(
            originalLanguage: original,
            elements: rows,
            languageOf: { $0.target },
            isServable: { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty },
            preferredLanguages: prism
        )
    }

    func test_regionalPrism_matchesPlainTranslationKey() {
        let rows = [Row(target: "en", text: "Hello")]
        XCTAssertEqual(resolve(rows, original: "fr", prism: ["en-US"]), rows[0])
    }

    func test_regionalTranslationKey_matchesPlainPrism() {
        let rows = [Row(target: "en-US", text: "Hello")]
        XCTAssertEqual(resolve(rows, original: "fr", prism: ["en"]), rows[0])
    }

    func test_originalUppercased_shortCircuitsAtItsRank() {
        let rows = [Row(target: "fr", text: "Bonjour")]
        XCTAssertNil(resolve(rows, original: "EN", prism: ["en", "fr"]))
    }

    func test_originalAtLowerRank_doesNotDemotePrimaryTranslation() {
        let rows = [Row(target: "fr", text: "Bonjour")]
        XCTAssertEqual(resolve(rows, original: "en", prism: ["fr", "en"]), rows[0])
    }

    func test_translationAtSecondRank_isServedWhenFirstIsMissing() {
        let rows = [Row(target: "es", text: "Hola")]
        XCTAssertEqual(resolve(rows, original: "fr", prism: ["de", "es"]), rows[0])
    }

    func test_blankTranslation_fallsToNextRank() {
        let rows = [Row(target: "de", text: "  "), Row(target: "es", text: "Hola")]
        XCTAssertEqual(resolve(rows, original: "fr", prism: ["de", "es"]), rows[1])
    }

    func test_noMatch_returnsNil_neverFirst() {
        XCTAssertNil(resolve([Row(target: "de", text: "Hallo")], original: "en", prism: ["fr"]))
    }
}
