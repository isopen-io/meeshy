import XCTest
@testable import Meeshy

@MainActor
final class ComposeLanguageTests: XCTestCase {
    func test_composeLanguage_detectsEnglishContent() {
        let lang = ConversationViewModel.composeLanguage(
            for: "How are you doing today my friend?", preferred: ["fr", "en"])
        XCTAssertEqual(lang, "en")
    }

    func test_composeLanguage_detectsFrenchContent() {
        let lang = ConversationViewModel.composeLanguage(
            for: "Bonjour, est-ce que tu peux m'aider s'il te plaît ?", preferred: ["en", "fr"])
        XCTAssertEqual(lang, "fr")
    }

    func test_composeLanguage_shortText_fallsBackToPrimary() {
        let lang = ConversationViewModel.composeLanguage(for: "Ok", preferred: ["fr", "en"])
        XCTAssertEqual(lang, "fr")
    }

    func test_composeLanguage_emptyPreferred_defaultsFr() {
        let lang = ConversationViewModel.composeLanguage(for: "Ok", preferred: [])
        XCTAssertEqual(lang, "fr")
    }
}
