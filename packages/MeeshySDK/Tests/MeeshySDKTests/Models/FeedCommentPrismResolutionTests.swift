import XCTest
@testable import MeeshySDK

/// Un commentaire garde TOUTES ses traductions : un changement de langue du
/// lecteur le re-résout sans re-fetch, comme son post. Il restait dans
/// l'ancienne langue — `translatedContent` n'était résolu qu'une fois, au mapping.
final class FeedCommentPrismResolutionTests: XCTestCase {

    private let translations: [String: PostTranslation] = [
        "en": PostTranslation(text: "Hi"),
        "es": PostTranslation(text: "Hola"),
    ]

    private func makeComment(translations: [String: PostTranslation]? = nil,
                             translatedContent: String? = nil) -> FeedComment {
        FeedComment(id: "c1", author: "bob", content: "Salut", originalLanguage: "fr",
                    translatedContent: translatedContent, translations: translations)
    }

    func test_resolved_followsTheReadersLanguage_withoutRefetch() {
        let comment = makeComment(translations: translations)

        XCTAssertEqual(comment.resolved(preferredLanguages: ["es"]).displayContent, "Hola")
        XCTAssertEqual(comment.resolved(preferredLanguages: ["en"]).displayContent, "Hi")
        XCTAssertEqual(comment.resolved(preferredLanguages: ["fr", "en"]).displayContent, "Salut",
                       "la langue d'origine au rang 1 l'emporte")
        XCTAssertEqual(comment.resolved(preferredLanguages: ["de"]).displayContent, "Salut",
                       "aucune langue servie : l'original, jamais une traduction au hasard")
    }

    func test_resolved_withoutTranslations_keepsWhatItShows() {
        let legacy = makeComment(translatedContent: "Hi")
        XCTAssertEqual(legacy.resolved(preferredLanguages: ["es"]).translatedContent, "Hi")
    }

    func test_feedPostResolved_resolvesItsComments_evenWithoutPostTranslations() {
        var post = FeedPost(id: "p1", author: "alice", content: "Bonjour", originalLanguage: "fr")
        post.comments = [makeComment(translations: translations)]

        let resolved = post.resolved(preferredLanguages: ["es"])

        XCTAssertEqual(resolved.comments.first?.displayContent, "Hola")
    }

    func test_mergingTranslation_keepsANonPreferredOneForLater() {
        let comment = makeComment(translations: [:])

        let merged = comment.mergingTranslation("Hola", language: "es", preferredLanguages: ["en"])

        XCTAssertNil(merged.translatedContent, "l'espagnol n'est pas préféré aujourd'hui")
        XCTAssertEqual(merged.resolved(preferredLanguages: ["es"]).displayContent, "Hola",
                       "il sert après un changement de langue")
    }

    func test_mergingTranslation_onALegacyCommentShowingATranslation_changesNothing() {
        let legacy = makeComment(translatedContent: "Hi")
        let merged = legacy.mergingTranslation("Hola", language: "es", preferredLanguages: ["es", "en"])
        XCTAssertEqual(merged.translatedContent, "Hi")
        XCTAssertNil(merged.translations)
    }

    func test_codable_roundTrip_keepsTheTranslations() throws {
        let comment = makeComment(translations: translations)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: JSONEncoder().encode(comment))
        XCTAssertEqual(decoded.translations?["es"]?.text, "Hola")
        XCTAssertEqual(decoded.translations?.count, 2)
    }

    func test_editedContent_dropsTheTranslationsOfTheOldText() {
        let comment = makeComment(translations: translations, translatedContent: "Hi")
        let edited = comment.withEditedContent("Coucou", effectFlags: 0)
        XCTAssertNil(edited.translations)
        XCTAssertNil(edited.translatedContent)
    }
}
