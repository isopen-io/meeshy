import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - StoryExportPreflightTests
//
// Règle de résolution de la langue gravée, partagée par « Partager » (sheet
// avec sélecteur) et « Enregistrer » (sans sheet, résolution automatique).
// Deux implémentations divergentes graveraient des langues différentes selon
// le bouton — d'où l'extraction en helper pur testé ici.

@MainActor
final class StoryExportPreflightTests: XCTestCase {

    private func makeStory(translations: [StoryTranslation]?) -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects(),
                  translations: translations)
    }

    // MARK: availableLanguages

    func test_availableLanguages_preservesPayloadOrder() {
        let story = makeStory(translations: [
            StoryTranslation(language: "fr", content: "Bonjour"),
            StoryTranslation(language: "en", content: "Hello"),
            StoryTranslation(language: "es", content: "Hola"),
        ])
        XCTAssertEqual(StoryExportLanguageResolver.availableLanguages(story: story), ["fr", "en", "es"])
    }

    func test_availableLanguages_dropsDuplicates() {
        let story = makeStory(translations: [
            StoryTranslation(language: "fr", content: "Bonjour"),
            StoryTranslation(language: "fr", content: "Salut"),
            StoryTranslation(language: "en", content: "Hello"),
        ])
        XCTAssertEqual(StoryExportLanguageResolver.availableLanguages(story: story), ["fr", "en"])
    }

    func test_availableLanguages_nilTranslations_isEmpty() {
        XCTAssertEqual(StoryExportLanguageResolver.availableLanguages(story: makeStory(translations: nil)), [])
    }

    // MARK: defaultLanguage

    func test_defaultLanguage_preferredPresent_isSelected() {
        XCTAssertEqual(
            StoryExportLanguageResolver.defaultLanguage(available: ["fr", "en"], preferred: ["en", "fr"]),
            "en"
        )
    }

    func test_defaultLanguage_preferredAbsent_fallsBackToOriginal() {
        XCTAssertNil(StoryExportLanguageResolver.defaultLanguage(available: ["fr", "en"], preferred: ["de"]))
    }

    func test_defaultLanguage_noAvailable_fallsBackToOriginal() {
        XCTAssertNil(StoryExportLanguageResolver.defaultLanguage(available: [], preferred: ["fr"]))
    }

    func test_defaultLanguage_noPreferred_fallsBackToOriginal() {
        XCTAssertNil(StoryExportLanguageResolver.defaultLanguage(available: ["fr"], preferred: []))
    }

    /// La première préférence GAGNE, même si une préférence plus tardive est
    /// aussi disponible — sinon l'ordre de préférence de l'utilisateur ne
    /// voudrait rien dire.
    func test_defaultLanguage_firstPreferenceWins() {
        XCTAssertEqual(
            StoryExportLanguageResolver.defaultLanguage(available: ["fr", "en"], preferred: ["fr", "en"]),
            "fr"
        )
    }
}
