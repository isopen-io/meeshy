import XCTest
@testable import MeeshySDK

/// What a comment row shows of its translation — the same for a post comment
/// and a story comment (#13133): the text, the translated chip's language,
/// and whether "Translate" is offered.
final class FeedCommentTranslationDisplayTests: XCTestCase {

    private func comment(originalLanguage: String? = "fr", translatedContent: String? = nil,
                         translations: [String: PostTranslation]? = nil) -> FeedComment {
        FeedComment(id: "c1", author: "bob", content: "Salut", originalLanguage: originalLanguage,
                    translatedContent: translatedContent, translations: translations)
    }

    func test_hasServedTranslation_needsBothATranslationAndAnOriginalLanguage() {
        XCTAssertTrue(comment(translatedContent: "Hi").hasServedTranslation)
        XCTAssertFalse(comment(translatedContent: nil).hasServedTranslation)
        XCTAssertFalse(comment(originalLanguage: nil, translatedContent: "Hi").hasServedTranslation)
    }

    func test_shownText_servesTheTranslationUnlessTheOriginalIsAsked() {
        let translated = comment(translatedContent: "Hi")

        XCTAssertEqual(translated.shownText(showOriginal: false), "Hi")
        XCTAssertEqual(translated.shownText(showOriginal: true), "Salut")
        XCTAssertEqual(comment().shownText(showOriginal: false), "Salut")
    }

    func test_translatedChipLanguage_namesTheServedRank_notTheFirstReaderLanguage() {
        let served = comment(translatedContent: "Hi", translations: ["en": PostTranslation(text: "Hi")])

        XCTAssertEqual(served.translatedChipLanguage(readerLanguages: ["de", "en"]), "en")
    }

    func test_translatedChipLanguage_withoutAMap_fallsBackToTheFirstReaderLanguage_thenFrench() {
        XCTAssertEqual(comment(translatedContent: "Hi").translatedChipLanguage(readerLanguages: ["EN"]), "en")
        XCTAssertEqual(comment(translatedContent: "Hi").translatedChipLanguage(readerLanguages: []), "fr")
    }

    func test_offersTranslationRequest_onlyWithoutTranslation_andAForeignOriginal() {
        XCTAssertTrue(comment(originalLanguage: "es").offersTranslationRequest(readerLanguages: ["fr"]))
        XCTAssertFalse(comment(originalLanguage: "FR").offersTranslationRequest(readerLanguages: ["fr"]))
        XCTAssertFalse(comment(originalLanguage: nil).offersTranslationRequest(readerLanguages: ["fr"]))
        XCTAssertFalse(comment(originalLanguage: "es", translatedContent: "Salut").offersTranslationRequest(readerLanguages: ["fr"]))
        XCTAssertTrue(comment(originalLanguage: "es").offersTranslationRequest(readerLanguages: []),
                      "no reader language: French is the fallback")
    }

    func test_translationRequestLanguage_isTheReaderFirstLanguage_lowercased_thenFrench() {
        XCTAssertEqual(FeedComment.translationRequestLanguage(readerLanguages: ["EN", "fr"]), "en")
        XCTAssertEqual(FeedComment.translationRequestLanguage(readerLanguages: []), "fr")
    }
}
