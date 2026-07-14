import Foundation
import Testing
@testable import MeeshySDK

/// P6 — Prisme Linguistique: another user's story text/content must resolve to
/// the viewer's language even when the preferred code carries a region qualifier
/// or different casing ("en-US" ~ "en", "FR" ~ "fr") than the translation keys,
/// WITHOUT breaking chain priority.
struct StoryPrismeLanguageMatchTests {

    // MARK: - resolvedText (StoryTextObject)

    @Test func resolvedText_exactMatch_stillWins() {
        let obj = StoryTextObject(id: "t", text: "Hello", translations: ["fr": "Bonjour"])
        #expect(obj.resolvedText(preferredLanguages: ["fr"]) == "Bonjour")
    }

    @Test func resolvedText_regionQualifiedPreferred_matchesBaseTranslation() {
        let obj = StoryTextObject(id: "t", text: "Hello", translations: ["en": "Hi there"])
        #expect(obj.resolvedText(preferredLanguages: ["en-US"]) == "Hi there")
    }

    @Test func resolvedText_caseInsensitivePreferred_matches() {
        let obj = StoryTextObject(id: "t", text: "Hello", translations: ["fr": "Bonjour"])
        #expect(obj.resolvedText(preferredLanguages: ["FR"]) == "Bonjour")
    }

    @Test func resolvedText_priority_normalizedHigherBeatsExactLower() {
        // Preferred chain: fr-FR (region) then en (exact). fr-FR must resolve the
        // higher-priority "fr" translation before the exact lower-priority "en".
        let obj = StoryTextObject(id: "t", text: "Hello",
                                  translations: ["fr": "Bonjour", "en": "Hi"])
        #expect(obj.resolvedText(preferredLanguages: ["fr-FR", "en"]) == "Bonjour")
    }

    @Test func resolvedText_noMatch_returnsOriginal() {
        // Prisme rule: no matching translation → original text (never .first).
        let obj = StoryTextObject(id: "t", text: "Hello", translations: ["es": "Hola"])
        #expect(obj.resolvedText(preferredLanguages: ["de"]) == "Hello")
    }

    // MARK: - resolvedContent (StoryItem)

    @Test func resolvedContent_regionQualifiedPreferred_matchesBase() {
        let item = StoryItem(
            id: "s1", content: "Original",
            translations: [StoryTranslation(language: "en", content: "Translated")]
        )
        #expect(item.resolvedContent(preferredLanguages: ["en-GB"]) == "Translated")
    }

    @Test func resolvedContent_noMatch_returnsOriginal() {
        let item = StoryItem(
            id: "s1", content: "Original",
            translations: [StoryTranslation(language: "es", content: "Hola")]
        )
        #expect(item.resolvedContent(preferredLanguages: ["de"]) == "Original")
    }
}
