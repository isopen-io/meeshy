import XCTest
@testable import Meeshy

@MainActor
final class BubbleLanguageFlagControllerTests: XCTestCase {

    private func makeTranslation(target: String, content: String = "Hi") -> MessageTranslation {
        MessageTranslation(
            id: "t-\(target)",
            messageId: "m1",
            sourceLanguage: "fr",
            targetLanguage: target,
            translatedContent: content,
            translationModel: "nllb",
            confidenceScore: nil
        )
    }

    func test_handleTap_originalLang_setsActiveLang() {
        let ctx = BubbleLanguageFlagController.Context(activeDisplayLangCode: nil, secondaryLangCode: nil)
        let next = BubbleLanguageFlagController.handleTap(
            code: "fr",
            current: ctx,
            messageOriginalLang: "fr",
            translations: []
        )
        XCTAssertEqual(next.activeDisplayLangCode, "fr")
        XCTAssertNil(next.secondaryLangCode)
        XCTAssertEqual(next.action, .switchPrimary)
    }

    func test_handleTap_translationLang_togglesSecondary() {
        var ctx = BubbleLanguageFlagController.Context(activeDisplayLangCode: nil, secondaryLangCode: nil)
        ctx.activeDisplayLangCode = "fr"
        let next = BubbleLanguageFlagController.handleTap(
            code: "en",
            current: ctx,
            messageOriginalLang: "fr",
            translations: [makeTranslation(target: "en")]
        )
        XCTAssertEqual(next.secondaryLangCode, "en")
        XCTAssertEqual(next.action, .openSecondary)
    }

    func test_handleTap_sameSecondary_closes() {
        var ctx = BubbleLanguageFlagController.Context(activeDisplayLangCode: nil, secondaryLangCode: nil)
        ctx.activeDisplayLangCode = "fr"
        ctx.secondaryLangCode = "en"
        let next = BubbleLanguageFlagController.handleTap(
            code: "en",
            current: ctx,
            messageOriginalLang: "fr",
            translations: [makeTranslation(target: "en")]
        )
        XCTAssertNil(next.secondaryLangCode)
        XCTAssertEqual(next.action, .closeSecondary)
    }

    func test_handleTap_missingTranslation_requestsIt() {
        let ctx = BubbleLanguageFlagController.Context(activeDisplayLangCode: nil, secondaryLangCode: nil)
        let next = BubbleLanguageFlagController.handleTap(
            code: "es",
            current: ctx,
            messageOriginalLang: "fr",
            translations: []
        )
        XCTAssertEqual(next.action, .requestTranslation(targetLang: "es"))
    }
}
