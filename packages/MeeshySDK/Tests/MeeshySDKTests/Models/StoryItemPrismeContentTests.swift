import XCTest
@testable import MeeshySDK

/// R10 — the legacy story `content` must resolve over the FULL language
/// chain (parity with textObjects), never `translations.first` (Prisme #1).
final class StoryItemPrismeContentTests: XCTestCase {

    private func makeStory(translations: [StoryTranslation]?) -> StoryItem {
        StoryItem(id: "s1", content: "original", translations: translations)
    }

    func test_chain_fallsThroughToSecondLanguage() {
        let story = makeStory(translations: [StoryTranslation(language: "es", content: "hola")])
        XCTAssertEqual(story.resolvedContent(preferredLanguages: ["fr", "es"]), "hola",
                       "fr missing → the es translation (2nd in chain) must win over the original")
    }

    func test_chainOrder_firstMatchWins() {
        let story = makeStory(translations: [
            StoryTranslation(language: "es", content: "hola"),
            StoryTranslation(language: "fr", content: "bonjour"),
        ])
        XCTAssertEqual(story.resolvedContent(preferredLanguages: ["fr", "es"]), "bonjour")
    }

    func test_noMatch_returnsOriginal_neverTranslationsFirst() {
        let story = makeStory(translations: [StoryTranslation(language: "de", content: "hallo")])
        XCTAssertEqual(story.resolvedContent(preferredLanguages: ["fr", "es"]), "original",
                       "Prisme rule #1: no chain match → ORIGINAL, never translations.first")
    }

    func test_noTranslations_returnsOriginal() {
        XCTAssertEqual(makeStory(translations: nil).resolvedContent(preferredLanguages: ["fr"]), "original")
    }
}
