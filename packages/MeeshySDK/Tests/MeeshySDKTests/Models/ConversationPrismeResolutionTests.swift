import XCTest
@testable import MeeshySDK

/// B1 — pin `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)`
/// semantics.
///
/// The Prisme Linguistique rule (from `packages/shared/utils/conversation-helpers.ts`):
/// 1. Walk preferred languages in order.
/// 2. Return the first matching translation.
/// 3. Never fall back to an unrelated translation — return the original
///    preview when no preferred language matches. The absence of a target
///    translation means the message is already in that language OR the
///    translation hasn't been generated.
final class ConversationPrismeResolutionTests: XCTestCase {

    // MARK: - Factory

    private func makeConversation(
        lastMessagePreview: String? = nil,
        lastMessageOriginalLanguage: String? = nil,
        lastMessageTranslations: [String: String]? = nil
    ) -> MeeshyConversation {
        var c = MeeshyConversation(
            id: "conv1",
            identifier: "conv1",
            type: .direct,
            lastMessagePreview: lastMessagePreview
        )
        c.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        c.lastMessageTranslations = lastMessageTranslations
        return c
    }

    // MARK: - No translations attached → raw preview

    func test_resolvedPreview_noTranslations_returnsRawPreview() {
        let conv = makeConversation(lastMessagePreview: "Hello")
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Hello")
    }

    func test_resolvedPreview_emptyTranslations_returnsRawPreview() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageTranslations: [:]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Hello")
    }

    func test_resolvedPreview_nilPreview_returnsNil() {
        let conv = makeConversation()
        XCTAssertNil(conv.resolvedLastMessagePreview(preferredLanguages: ["fr"]))
    }

    // MARK: - Translation match

    func test_resolvedPreview_systemLanguageMatch_returnsTranslation() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["fr": "Bonjour", "es": "Hola"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr", "es"]), "Bonjour")
    }

    func test_resolvedPreview_regionalLanguageMatch_returnsSecondLang() {
        // System language has no translation → falls through to regional
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["es": "Hola"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["de", "es"]), "Hola")
    }

    // MARK: - Original language case (Prisme rule #3)

    func test_resolvedPreview_messageInPreferredLanguage_returnsRawPreview() {
        // Message originally in French; user prefers French. No translation
        // needed → original preview is canonical.
        let conv = makeConversation(
            lastMessagePreview: "Bonjour",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: ["en": "Hello"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Bonjour")
    }

    // MARK: - No match → original preview (NOT translations.first)

    func test_resolvedPreview_noMatchInPreferred_returnsOriginalNotRandomTranslation() {
        // CRITICAL: must NOT return "Hola" as a fallback. The user wanted
        // French or German; if neither exists, they get the original.
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["es": "Hola"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr", "de"]), "Hello")
    }

    func test_resolvedPreview_emptyPreferredList_returnsRawPreview() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageTranslations: ["fr": "Bonjour"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: []), "Hello")
    }

    // MARK: - Case insensitivity

    func test_resolvedPreview_caseInsensitiveMatch_returnsTranslation() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageTranslations: ["fr": "Bonjour"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["FR"]), "Bonjour")
    }

    func test_resolvedPreview_originalLangCaseInsensitive_returnsRawPreview() {
        let conv = makeConversation(
            lastMessagePreview: "Bonjour",
            lastMessageOriginalLanguage: "FR",
            lastMessageTranslations: ["en": "Hello"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Bonjour")
    }

    // MARK: - Empty strings in preferred list are skipped

    func test_resolvedPreview_emptyEntriesInPreferred_skippedGracefully() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageTranslations: ["fr": "Bonjour"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["", "fr"]),
            "Bonjour"
        )
    }
}
