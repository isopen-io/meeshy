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

    // MARK: - Rank-based resolution (Prisme rule #3, 2026-08-10)

    func test_resolvedPreview_translationOutranksOriginal_returnsHigherRankTranslation() {
        // Prisme ["en", "fr"], original "fr", "en" translation available:
        // the "en" translation must win because it occupies rank 1 — the
        // original must NEVER short-circuit ahead of the rank loop.
        let conv = makeConversation(
            lastMessagePreview: "Bonjour",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: ["en": "Hello"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["en", "fr"]), "Hello")
    }

    func test_resolvedPreview_originalOutranksTranslation_returnsOriginal() {
        // Prisme ["fr", "en"], original "fr": the original wins because it
        // occupies rank 0, even though an "en" translation also exists.
        let conv = makeConversation(
            lastMessagePreview: "Bonjour",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: ["en": "Hello"]
        )
        XCTAssertEqual(conv.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"]), "Bonjour")
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

/// Cycle 61 — le prisme est ORDONNÉ, et la langue d'origine y concourt à son
/// propre RANG.
///
/// La règle précédente court-circuitait dès que la langue d'origine
/// apparaissait *quelque part* dans le prisme du lecteur, ce qui rétrogradait
/// sa langue PRIMAIRE. `CLAUDE.md` dit l'inverse noir sur blanc : « un
/// utilisateur francophone avec un iPhone en anglais voit TOUJOURS ses messages
/// en français (priorité 1) ; la locale anglaise n'intervient que si aucune
/// traduction française n'est disponible ». La locale appareil entre en 4e
/// priorité — elle ne supplante jamais une préférence in-app.
///
/// Jumeau strict de `resolve-last-message-preview.test.ts`
/// (`packages/shared/__tests__/utils/`) : les deux plateformes rendent la même
/// ligne depuis la même charge REST.
final class ConversationPrismeRankOrderTests: XCTestCase {

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

    /// Le cas de `CLAUDE.md`, littéralement : francophone, téléphone en anglais.
    func test_resolvedPreview_frenchReaderEnglishDeviceLocale_getsFrenchNotOriginal() {
        let conv = makeConversation(
            lastMessagePreview: "Hello everyone",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["fr": "Bonjour à tous"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"]),
            "Bonjour à tous"
        )
    }

    /// Même lecteur, aucune traduction française : la locale appareil sert
    /// enfin — et ce qu'elle sert est l'aperçu brut, qui EST l'anglais attendu.
    func test_resolvedPreview_deviceLocaleServesOnlyWhenInAppLanguageHasNothing() {
        let conv = makeConversation(
            lastMessagePreview: "Hello everyone",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["es": "Hola a todos"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"]),
            "Hello everyone"
        )
    }

    /// La langue primaire l'emporte sur un original écrit dans une langue
    /// secondaire du lecteur.
    func test_resolvedPreview_primaryLanguageBeatsOriginalRankedLower() {
        let conv = makeConversation(
            lastMessagePreview: "Bonjour",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: ["de": "Guten Tag"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["de", "fr"]),
            "Guten Tag"
        )
    }

    /// Symétrique : quand le rang 1 EST la langue d'origine, on s'arrête là et
    /// on ne sert pas la traduction du rang 2.
    func test_resolvedPreview_originalAtTopRank_stopsBeforeLowerRankedTranslation() {
        let conv = makeConversation(
            lastMessagePreview: "Guten Tag",
            lastMessageOriginalLanguage: "de",
            lastMessageTranslations: ["fr": "Bonjour"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["de", "fr"]),
            "Guten Tag"
        )
    }

    // MARK: - Region-tagged original competes at its NORMALIZED rank
    //
    // Mirror of the TypeScript twin's region-tag suite. `preferredContentLanguages`
    // resolves the reader's languages (region-stripped for deviceLocale), but
    // `lastMessageOriginalLanguage` arrives raw and legacy messages carry a
    // region-tagged code. With `.lowercased()` alone, `en-us` never matched the
    // normalized rank `en`, so a lower-ranked translation won — demoting the
    // reader's primary language.

    func test_resolvedPreview_regionTaggedOriginalAtPrimaryRank_returnsRawPreview() {
        let conv = makeConversation(
            lastMessagePreview: "Hello everyone",
            lastMessageOriginalLanguage: "en-US",
            lastMessageTranslations: ["fr": "Bonjour à tous"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["en", "fr"]),
            "Hello everyone"
        )
    }

    func test_resolvedPreview_regionTaggedOriginalAtTopRank_stopsBeforeLowerRankedTranslation() {
        let conv = makeConversation(
            lastMessagePreview: "Olá pessoal",
            lastMessageOriginalLanguage: "pt-BR",
            lastMessageTranslations: ["en": "Hello everyone"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["pt", "en"]),
            "Olá pessoal"
        )
    }

    func test_resolvedPreview_regionTaggedTranslationKey_matchesNormalizedReaderRank() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["fr-FR": "Bonjour"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["fr"]),
            "Bonjour"
        )
    }

    func test_resolvedPreview_regionTaggedReaderLanguage_matchesNormalizedTranslationKey() {
        let conv = makeConversation(
            lastMessagePreview: "Hello",
            lastMessageOriginalLanguage: "en",
            lastMessageTranslations: ["pt": "Olá"]
        )
        XCTAssertEqual(
            conv.resolvedLastMessagePreview(preferredLanguages: ["pt-BR"]),
            "Olá"
        )
    }
}
