import XCTest
import MeeshySDK
@testable import Meeshy

/// Prisme Linguistique — règle 3, au niveau du rang Lentille (contrat LWS-7,
/// workshop I-068 — nom cité par le contrat §LWS-7).
///
/// **Deux étages, une seule règle (E7, contrat §3.2).** La ligne 2 résout par
/// `resolveLastMessagePreview` sur DEUX chemins distincts qui doivent
/// pourtant obéir à la MÊME loi (§0 : « zéro nouvelle loi de langue ») :
/// - **préview** — `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)`
///   (SDK, GELÉ — `packages/MeeshySDK`, propriété LWS-2). `LentilleConversationRow.resolvedPreviewText`
///   (privée) ne fait qu'appeler cette méthode ; ce fichier teste donc le
///   point d'appel exact que le rang consomme, avec les mêmes conversions
///   `.lowercased()` implicites que la loi TS jumelle
///   (`packages/shared/utils/conversation-helpers.ts`).
/// - **étage agent du pont** — `LentilleBridgeLine.resolveAgentText`
///   (`Lentille/Row/LentilleBridgeLine.swift`, I-065), copie DÉLIBÉRÉE du même
///   algorithme sur `bridge.translations`/`bridge.originalLanguage` — le type
///   SDK gelé n'expose sa loi que sur les champs `lastMessage*`, jamais sur
///   `ConversationBridge` (voir le commentaire d'en-tête du fichier).
///
/// **Règle 3, verbatim (`conversation-helpers.ts`, « Règle critique du Prisme
/// (#3) »)** : « ne JAMAIS retomber sur une traduction quelconque. L'absence
/// de traduction vers une langue du lecteur signifie que le contenu est déjà
/// dans cette langue, ou qu'aucune traduction n'a été produite — servir une
/// troisième langue serait pire que l'original. »
///
/// **Id de matrice.** `packages/shared/fixtures/conformance/behaviour-matrix.json`
/// ne porte PAS d'entrée `list` dédiée à la résolution Prisme du préview :
/// c'est un comportement PRÉEXISTANT au workshop (B1, corrigé avant la
/// Lentille), réutilisé ICI sans réécriture (§0 — « la ligne 2 par
/// `resolveLastMessagePreview`, exactement le chemin de `ConversationItem` »).
/// La preuve de recette porte le critère **R4** (contrat §5 : « Prisme par
/// les résolveurs jumeaux exclusivement […] cas "prisme [fr,en], original en,
/// trad fr → Bonjour" ») ; l'étage AGENT du pont — nouveau à ce chantier — est
/// tracé par **E7** (contrat, table des écarts). `L15` (fingerprint étendu au
/// pont) et `C-030` (`BridgeFingerprintTests`) couvrent le portillon autour de
/// ces deux étages ; `LentilleRowEquatableTests` en est le jumeau au niveau du
/// rang.
@MainActor
final class LentilleRowPrismeTests: XCTestCase {

    // MARK: - Fabriques

    private static let pinnedDate = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        lastMessagePreview: String,
        originalLanguage: String?,
        translations: [String: String]?
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-prisme",
            identifier: "conv-prisme",
            type: .group,
            title: "Equipe Produit",
            lastMessageAt: Self.pinnedDate,
            createdAt: Self.pinnedDate,
            updatedAt: Self.pinnedDate,
            unreadCount: 4,
            lastMessagePreview: lastMessagePreview
        )
        conversation.lastMessageOriginalLanguage = originalLanguage
        conversation.lastMessageTranslations = translations
        return conversation
    }

    private func makeAgentBridge(
        unreadCount: Int = 4,
        text: String?,
        translations: [String: String]?,
        originalLanguage: String?
    ) -> ConversationBridge {
        ConversationBridge(
            kind: .agent,
            unreadCount: unreadCount,
            suggestedMode: .resume,
            text: text,
            translations: translations,
            originalLanguage: originalLanguage
        )
    }

    // MARK: - Étage préview — règle 3, le cas nommé par le contrat

    /// Le cas EXPLICITEMENT nommé par le contrat (§LWS-7, R4) : prisme
    /// `['fr', 'en']`, message original `en`, traduction `fr` disponible ⇒ la
    /// ligne 2 affiche « Bonjour », **jamais** « Hello ». Appelé exactement
    /// comme le rang l'appelle (`preferredContentLanguages` ordonné, aucune
    /// résolution locale).
    func test_preview_rule3_prismeFrEn_originalEn_translationFr_returnsBonjour_neverHello() {
        let conversation = makeConversation(
            lastMessagePreview: "Hello",
            originalLanguage: "en",
            translations: ["fr": "Bonjour"]
        )
        let resolved = conversation.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"])
        XCTAssertEqual(resolved, "Bonjour")
        XCTAssertNotEqual(resolved, "Hello")
    }

    /// Règle 3 — aucune traduction correspondante ⇒ l'original, **jamais**
    /// une traduction quelconque (`translations.first` n'a de toute façon
    /// aucun ordre garanti sur un `Dictionary` : deux traductions PRÉSENTES,
    /// ni l'une ni l'autre ne doit être choisie).
    func test_preview_rule3_noMatchingTranslation_returnsOriginal_neverAnyOtherTranslation() {
        let conversation = makeConversation(
            lastMessagePreview: "Hello",
            originalLanguage: "en",
            translations: ["es": "Hola", "de": "Hallo"]
        )
        let resolved = conversation.resolvedLastMessagePreview(preferredLanguages: ["it"])
        XCTAssertEqual(resolved, "Hello", "aucune traduction vers 'it' ⇒ l'original, jamais 'es' ou 'de'")
        XCTAssertNotEqual(resolved, "Hola")
        XCTAssertNotEqual(resolved, "Hallo")
    }

    /// Nuance « rang, pas appartenance » (commentaire de
    /// `conversation-helpers.ts`) : la langue d'origine ne court-circuite PAS
    /// globalement dès qu'elle apparaît dans le prisme — elle ne gagne qu'à
    /// SON PROPRE rang. Prisme `['fr', 'en']`, original `en`, traduction `fr`
    /// disponible ⇒ `fr` (rang 1) gagne AVANT que `en` (rang 2, l'original)
    /// ne soit même consulté. C'est le test jumeau du premier, formulé du
    /// point de vue du rang plutôt que du résultat attendu.
    func test_preview_rule3_originalLanguageWinsOnlyAtItsOwnRank_notAsGlobalShortCircuit() {
        let conversation = makeConversation(
            lastMessagePreview: "Hello",
            originalLanguage: "en",
            translations: ["fr": "Bonjour"]
        )
        // `en` en tête de prisme ⇒ l'original gagne à SON rang (1), sans
        // même consulter `fr`.
        XCTAssertEqual(conversation.resolvedLastMessagePreview(preferredLanguages: ["en", "fr"]), "Hello")
        // `fr` en tête ⇒ la traduction gagne à SON rang (1), avant que `en`
        // (rang 2, l'original) ne soit consulté — c'est le cas du contrat.
        XCTAssertEqual(conversation.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"]), "Bonjour")
    }

    // MARK: - Étage agent du pont — même règle, même paire (E7)

    /// Jumeau du cas nommé par le contrat, à l'étage AGENT du pont. Même
    /// prisme, même langue d'origine, même traduction disponible — la SEULE
    /// différence avec le test préview ci-dessus est le point d'entrée
    /// (`LentilleBridgeLine.resolveAgentText` plutôt que
    /// `resolvedLastMessagePreview`), précisément pour prouver qu'aucune
    /// SECONDE loi de langue n'a été inventée pour le pont (contrat §5.2,
    /// conséquence 2 — « zéro nouvelle loi de langue »).
    func test_bridgeAgentStage_rule3_prismeFrEn_originalEn_translationFr_returnsBonjour_neverHello() {
        let bridge = makeAgentBridge(text: "Hello", translations: ["fr": "Bonjour"], originalLanguage: "en")
        let resolved = LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: ["fr", "en"])
        XCTAssertEqual(resolved, "Bonjour")
        XCTAssertNotEqual(resolved, "Hello")
    }

    /// Règle 3 côté pont : aucune traduction correspondante ⇒ `bridge.text`
    /// (l'« original » du pont), jamais une traduction quelconque parmi
    /// celles réellement présentes.
    func test_bridgeAgentStage_rule3_noMatchingTranslation_returnsBridgeText_neverAnyOtherTranslation() {
        let bridge = makeAgentBridge(text: "Hello", translations: ["es": "Hola", "de": "Hallo"], originalLanguage: "en")
        let resolved = LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: ["it"])
        XCTAssertEqual(resolved, "Hello")
        XCTAssertNotEqual(resolved, "Hola")
        XCTAssertNotEqual(resolved, "Hallo")
    }

    /// Même nuance de rang qu'à l'étage préview, rejouée sur le pont : `en`
    /// en tête de prisme fait gagner l'original à SON rang, sans même
    /// consulter la traduction `fr` disponible plus bas.
    func test_bridgeAgentStage_rule3_originalLanguageWinsOnlyAtItsOwnRank() {
        let bridge = makeAgentBridge(text: "Hello", translations: ["fr": "Bonjour"], originalLanguage: "en")
        XCTAssertEqual(LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: ["en", "fr"]), "Hello")
        XCTAssertEqual(LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: ["fr", "en"]), "Bonjour")
    }

    // MARK: - Parité stricte entre les deux étages, sur la MÊME paire (E7)

    /// Le critère E7 en toutes lettres : l'étage agent du pont voyage avec
    /// « la MÊME paire `translations` + `originalLanguage` que le préview »
    /// pour que le client réapplique la même résolution. Ce test construit
    /// UN SEUL jeu `(text, translations, originalLanguage)`, le fait
    /// traverser les DEUX résolveurs, et exige un résultat identique — la
    /// preuve directe qu'aucune divergence n'a été introduite entre les deux
    /// chemins.
    func test_bridgeAgentStage_and_preview_resolveIdentically_onTheSamePair_E7Parity() {
        let text = "Hello"
        let originalLanguage = "en"
        let translations = ["fr": "Bonjour", "es": "Hola"]
        let preferredLanguages = ["fr", "en"]

        let conversation = makeConversation(
            lastMessagePreview: text,
            originalLanguage: originalLanguage,
            translations: translations
        )
        let bridge = makeAgentBridge(text: text, translations: translations, originalLanguage: originalLanguage)

        let previewResolved = conversation.resolvedLastMessagePreview(preferredLanguages: preferredLanguages)
        let bridgeResolved = LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: preferredLanguages)

        XCTAssertEqual(
            previewResolved, bridgeResolved,
            "E7 : l'étage agent du pont doit résoudre EXACTEMENT comme le préview sur la même paire translations/originalLanguage — même règle, deux points d'entrée"
        )
        XCTAssertEqual(bridgeResolved, "Bonjour")
    }

    /// Pendant de parité côté repli : sans traduction correspondante, les
    /// deux étages replient sur leur propre « original » (`lastMessagePreview`
    /// / `bridge.text`) — jamais l'un vers la valeur de l'autre.
    func test_bridgeAgentStage_and_preview_fallBackIdentically_whenNoTranslationMatches_E7Parity() {
        let text = "Hello"
        let originalLanguage = "en"
        let translations = ["es": "Hola"]
        let preferredLanguages = ["it"]

        let conversation = makeConversation(
            lastMessagePreview: text,
            originalLanguage: originalLanguage,
            translations: translations
        )
        let bridge = makeAgentBridge(text: text, translations: translations, originalLanguage: originalLanguage)

        XCTAssertEqual(conversation.resolvedLastMessagePreview(preferredLanguages: preferredLanguages), "Hello")
        XCTAssertEqual(LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: preferredLanguages), "Hello")
    }

    // MARK: - Pont sans texte agent ni traduction — repli terminal

    /// `bridge.translations == nil` (jeu de traductions absent, pas
    /// seulement vide) ⇒ replie directement sur `bridge.text`, comme
    /// `resolvedLastMessagePreview` replie sur `lastMessagePreview` quand
    /// `lastMessageTranslations == nil` (même garde `guard let … else`,
    /// même comportement aux deux extrémités du pont).
    func test_bridgeAgentStage_nilTranslations_returnsBridgeTextDirectly() {
        let bridge = makeAgentBridge(text: "Hello", translations: nil, originalLanguage: "en")
        XCTAssertEqual(LentilleBridgeLine.resolveAgentText(bridge: bridge, preferredLanguages: ["fr", "en"]), "Hello")
    }
}
