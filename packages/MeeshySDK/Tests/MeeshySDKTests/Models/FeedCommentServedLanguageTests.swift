import XCTest
@testable import MeeshySDK

/// **La puce d'un commentaire dit la langue SERVIE, pas le rang 1 (#11875).**
///
/// Le texte d'un commentaire descend le Prisme ordonné (`resolved`) ; sa puce de
/// langue, elle, affichait `prism.first`. Un commentaire traduit au rang 2
/// annonçait le rang 1 : le Prisme annoncé sans être appliqué (cycle 123). Les
/// témoins s'écrivent sur un rang autre que le premier (leçon 261).
final class FeedCommentServedLanguageTests: XCTestCase {

    private func spanishComment() -> FeedComment {
        FeedComment(author: "Ana", content: "Hola a todos", originalLanguage: "es",
                    translations: ["en": PostTranslation(text: "Hello everyone"),
                                   "fr": PostTranslation(text: "Bonjour à tous")])
    }

    func test_rankTwo_servedLanguage_isTheTranslationActuallyShown() {
        let prism = ["de", "en"]
        let comment = spanishComment().resolved(preferredLanguages: prism)

        XCTAssertEqual(comment.translatedContent, "Hello everyone")
        XCTAssertEqual(comment.servedLanguage(preferredLanguages: prism), "en",
                       "la puce dit « en » — jamais « de », le rang 1 qui n'a rien servi")
    }

    func test_originalAtItsRank_servesNoTranslationLanguage() {
        XCTAssertNil(spanishComment().servedLanguage(preferredLanguages: ["de", "es", "en"]),
                     "la langue d'origine concourt à son rang : l'original est servi")
    }

    func test_aCommentWithoutItsMap_cannotName_whatItServes() {
        let cached = FeedComment(author: "Ana", content: "Hola", originalLanguage: "es", translatedContent: "Hello")

        XCTAssertNil(cached.servedLanguage(preferredLanguages: ["en"]))
    }
}
