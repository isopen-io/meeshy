import XCTest
@testable import MeeshySDK

/// B2 / B4 — pin `FeedPost.resolved(preferredLanguages:)` semantics for
/// the Prisme Linguistique. The viewer's preferred-content languages can
/// change mid-session; this helper flips the resolved translation without
/// re-fetching the source `APIPost`.
final class FeedPostPrismeResolutionTests: XCTestCase {

    private func makePost(
        content: String = "Hello",
        originalLanguage: String? = nil,
        translations: [String: PostTranslation]? = nil
    ) -> FeedPost {
        FeedPost(
            id: "p1",
            author: "Alice",
            content: content,
            originalLanguage: originalLanguage,
            translations: translations,
            translatedContent: nil
        )
    }

    private func makeTranslation(_ text: String) -> PostTranslation {
        PostTranslation(text: text, translationModel: "nllb-200", confidenceScore: 0.95)
    }

    // MARK: - No translations → no-op

    func test_resolved_noTranslations_returnsSelf() {
        let post = makePost()
        let resolved = post.resolved(preferredLanguages: ["fr", "es"])
        XCTAssertNil(resolved.translatedContent)
        XCTAssertEqual(resolved.content, "Hello")
    }

    // MARK: - Translation match

    func test_resolved_systemLanguageMatch_setsTranslatedContent() {
        let post = makePost(
            originalLanguage: "en",
            translations: ["fr": makeTranslation("Bonjour"), "es": makeTranslation("Hola")]
        )
        let resolved = post.resolved(preferredLanguages: ["fr", "es"])
        XCTAssertEqual(resolved.translatedContent, "Bonjour")
        XCTAssertEqual(resolved.displayContent, "Bonjour")
    }

    func test_resolved_regionalLanguageMatch_setsSecondLang() {
        let post = makePost(
            originalLanguage: "en",
            translations: ["es": makeTranslation("Hola")]
        )
        let resolved = post.resolved(preferredLanguages: ["de", "es"])
        XCTAssertEqual(resolved.translatedContent, "Hola")
    }

    // MARK: - Original language match → clear translatedContent

    func test_resolved_messageInPreferredLanguage_clearsTranslatedContent() {
        let post = makePost(
            content: "Bonjour",
            originalLanguage: "fr",
            translations: ["en": makeTranslation("Hello")]
        )
        let resolved = post.resolved(preferredLanguages: ["fr"])
        XCTAssertNil(resolved.translatedContent)
        XCTAssertEqual(resolved.displayContent, "Bonjour")
    }

    // MARK: - No match → clear translatedContent (NOT random translation)

    func test_resolved_noMatchInPreferred_clearsTranslatedContent() {
        // Critical Prisme rule: never fall back to translations.first
        let post = makePost(
            content: "Hello",
            originalLanguage: "en",
            translations: ["es": makeTranslation("Hola")]
        )
        let resolved = post.resolved(preferredLanguages: ["fr", "de"])
        XCTAssertNil(resolved.translatedContent)
        XCTAssertEqual(resolved.displayContent, "Hello")
    }

    func test_resolved_emptyPreferredList_clearsTranslatedContent() {
        let post = makePost(
            originalLanguage: "en",
            translations: ["fr": makeTranslation("Bonjour")]
        )
        let resolved = post.resolved(preferredLanguages: [])
        XCTAssertNil(resolved.translatedContent)
    }

    // MARK: - Case insensitivity

    func test_resolved_caseInsensitiveMatch_returnsTranslation() {
        let post = makePost(
            originalLanguage: "EN",
            translations: ["FR": makeTranslation("Bonjour")]
        )
        let resolved = post.resolved(preferredLanguages: ["fr"])
        XCTAssertEqual(resolved.translatedContent, "Bonjour")
    }

    // MARK: - Empty entries skipped

    func test_resolved_emptyEntriesInPreferred_skippedGracefully() {
        let post = makePost(
            originalLanguage: "en",
            translations: ["fr": makeTranslation("Bonjour")]
        )
        let resolved = post.resolved(preferredLanguages: ["", "fr"])
        XCTAssertEqual(resolved.translatedContent, "Bonjour")
    }

    // MARK: - Idempotency

    func test_resolved_calledTwice_isIdempotent() {
        let post = makePost(
            originalLanguage: "en",
            translations: ["fr": makeTranslation("Bonjour")]
        )
        let once = post.resolved(preferredLanguages: ["fr"])
        let twice = once.resolved(preferredLanguages: ["fr"])
        XCTAssertEqual(once.translatedContent, twice.translatedContent)
    }

    // MARK: - resolvedLanguageCode(preferredLanguages:)
    //
    // Companion of `resolved(preferredLanguages:)` used by FeedPostCard to
    // know which language flag is "active" — must mirror the exact same
    // deterministic algorithm, never `translations.keys.first`.

    func test_resolvedLanguageCode_originalInPreferred_returnsOriginal() {
        let post = makePost(
            originalLanguage: "fr",
            translations: ["en": makeTranslation("Hello"), "es": makeTranslation("Hola")]
        )
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["fr"]), "fr")
    }

    func test_resolvedLanguageCode_secondPreferredMatches_returnsThatLanguage() {
        // Deterministic chain order — must not depend on dictionary iteration
        // order of `translations` (which is what the old `keys.first` bug did).
        let post = makePost(
            originalLanguage: "en",
            translations: ["es": makeTranslation("Hola"), "fr": makeTranslation("Bonjour")]
        )
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["de", "fr"]), "fr")
    }

    func test_resolvedLanguageCode_noMatch_returnsOriginal() {
        let post = makePost(
            originalLanguage: "en",
            translations: ["es": makeTranslation("Hola")]
        )
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["fr", "de"]), "en")
    }

    func test_resolvedLanguageCode_noTranslations_returnsOriginal() {
        let post = makePost(originalLanguage: "fr")
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["en"]), "fr")
    }

    func test_resolvedLanguageCode_noOriginalLanguage_returnsNil() {
        let post = makePost(originalLanguage: nil, translations: ["fr": makeTranslation("Bonjour")])
        XCTAssertNil(post.resolvedLanguageCode(preferredLanguages: ["fr"]))
    }

    func test_resolvedLanguageCode_caseInsensitiveMatch_returnsLowercasedCode() {
        let post = makePost(
            originalLanguage: "EN",
            translations: ["FR": makeTranslation("Bonjour")]
        )
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["fr"]), "fr")
    }
}
