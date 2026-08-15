import XCTest
import MeeshySDK
@testable import Meeshy

/// `LentillePeekViewModel` — ce que l'aperçu affiche (contrat LWS-8/I-072,
/// troisième point d'entrée du menu de mode).
///
/// **Suite PARTIELLE, ouverte** (le contrat le nomme explicitement pour ce
/// lot) : verrouille la CONSTRUCTION du modèle — titre, préview résolu par
/// le Prisme, délégation au MÊME `LentilleModeMenuModel` que l'encoche et le
/// sous-menu. I-073 complète (timings du geste d'appui long, intégration
/// bout en bout des deux chemins OS — voir le commentaire d'en-tête de
/// `LentillePeekView.swift` pour l'écart signalé sur le chemin natif).
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`, qui contient `Conversation`) :
/// `PeekViewModelTests`, phase 1 (nom repris tel quel du contrat §LWS-8).
final class PeekViewModelTests: XCTestCase {

    // MARK: - Fabrique

    private static let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        title: String = "Equipe Produit",
        unreadCount: Int = 0,
        lastMessagePreview: String? = "Hello",
        translations: [String: String]? = nil,
        originalLanguage: String? = nil
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-peek",
            identifier: "conv-peek",
            type: .group,
            title: title,
            lastMessageAt: Self.now,
            createdAt: Self.now,
            updatedAt: Self.now,
            unreadCount: unreadCount,
            lastMessagePreview: lastMessagePreview
        )
        conversation.lastMessageTranslations = translations
        conversation.lastMessageOriginalLanguage = originalLanguage
        return conversation
    }

    // MARK: - 1. Titre et préview

    func test_model_titleIsTheConversationDisplayName() {
        let conversation = makeConversation(title: "Equipe Produit")
        let model = LentillePeekViewModel.build(
            conversation: conversation, preference: .auto, isAnonymous: false,
            isLentilleFlagEnabled: true, preferredLanguages: []
        )
        XCTAssertEqual(model.title, conversation.displayName)
    }

    /// Prisme, règle 3 (contrat §LWS-7, re-preuve étendue à l'aperçu) : prisme
    /// `['fr','en']`, original `en`, traduction `fr` disponible ⇒ la préview
    /// affiche « Bonjour », JAMAIS « Hello ». Ce témoin prouve que l'aperçu
    /// DÉLÈGUE à `resolvedLastMessagePreview` (SDK gelé) au lieu de relire
    /// `lastMessagePreview` brut.
    func test_model_previewText_appliesThePrisme_ruleThree() {
        let conversation = makeConversation(
            lastMessagePreview: "Hello",
            translations: ["fr": "Bonjour"],
            originalLanguage: "en"
        )
        let model = LentillePeekViewModel.build(
            conversation: conversation, preference: .auto, isAnonymous: false,
            isLentilleFlagEnabled: true, preferredLanguages: ["fr", "en"]
        )
        XCTAssertEqual(
            model.previewText, "Bonjour",
            "Le lecteur doit voir SA langue préférée quand une traduction existe — jamais " +
            "l'original, jamais `translations.first` (règle 3 du Prisme)."
        )
    }

    /// Aucune traduction correspondante ⇒ repli sur l'original, jamais une
    /// chaîne vide fabriquée.
    func test_model_previewText_fallsBackToTheOriginal_whenNoTranslationMatches() {
        let conversation = makeConversation(lastMessagePreview: "Hello", translations: nil, originalLanguage: nil)
        let model = LentillePeekViewModel.build(
            conversation: conversation, preference: .auto, isAnonymous: false,
            isLentilleFlagEnabled: true, preferredLanguages: ["fr"]
        )
        XCTAssertEqual(model.previewText, "Hello")
    }

    // MARK: - 2. Délégation au MÊME modèle de menu que l'encoche et le sous-menu

    /// « Trois points d'entrée, UNE préférence » (contrat LWS-8) : le
    /// catalogue que l'aperçu montre doit être EXACTEMENT celui que
    /// `LentilleModeMenuModel.build` calcule sur les mêmes entrées — pas une
    /// seconde construction qui pourrait diverger (ex. Rivière non grisée
    /// ici par erreur de copier-coller).
    func test_model_modeMenu_isExactlyLentilleModeMenuModelBuild_onTheSameInputs() {
        let conversation = makeConversation(unreadCount: 30)
        let preference: ReadingModeOrchestrator.ReadingModePreference = .script

        let peekModel = LentillePeekViewModel.build(
            conversation: conversation, preference: preference, isAnonymous: false,
            isLentilleFlagEnabled: true, preferredLanguages: []
        )
        let expectedCapabilities = LentilleReadingModeContext.capabilities(
            for: conversation, isAnonymous: false, isLentilleFlagEnabled: true
        )
        let expectedMenu = LentilleModeMenuModel.build(capabilities: expectedCapabilities, currentPreference: preference)

        XCTAssertEqual(
            peekModel.modeMenu, expectedMenu,
            "Le menu de l'aperçu doit être identique, entrée par entrée, à celui que " +
            "l'encoche et le sous-menu construisent sur les mêmes données — sinon Rivière " +
            "pourrait, par exemple, ne pas être grisée dans CETTE seule surface."
        )
    }

    /// Discrimination (leçon 266) : deux préférences DIFFÉRENTES doivent
    /// produire des modèles de menu DIFFÉRENTS (au moins `isSelected`) —
    /// sinon le témoin de délégation ci-dessus ne prouverait rien.
    func test_model_modeMenu_changesWithThePreference() {
        let conversation = makeConversation()
        let autoModel = LentillePeekViewModel.build(
            conversation: conversation, preference: .auto, isAnonymous: false,
            isLentilleFlagEnabled: true, preferredLanguages: []
        )
        let scriptModel = LentillePeekViewModel.build(
            conversation: conversation, preference: .script, isAnonymous: false,
            isLentilleFlagEnabled: true, preferredLanguages: []
        )
        XCTAssertNotEqual(autoModel.modeMenu, scriptModel.modeMenu)
    }

    // MARK: - 3. Montage — chemin < iOS 26, derrière le drapeau, repli inchangé

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func overlaysSource() throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent(
                "Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"
            ),
            encoding: .utf8
        )
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Critère LWS-8 : l'aperçu remplace `ConversationPreviewView` sur le
    /// chemin custom (< iOS 26, `conversationContextMenuOverlay`), DERRIÈRE
    /// le drapeau — et le repli drapeau OFF reste `ConversationPreviewView`,
    /// intact.
    func test_peekView_isMountedOnce_behindTheFlag_withConversationPreviewViewAsTheOffFallback() throws {
        let raw = try overlaysSource()

        XCTAssertEqual(
            raw.components(separatedBy: "LentillePeekView(").count - 1, 1,
            "UN seul montage de l'aperçu Lentille dans ce fichier."
        )
        XCTAssertEqual(
            raw.components(separatedBy: "ConversationPreviewView(").count - 1, 1,
            "Le repli drapeau OFF (`ConversationPreviewView`) doit rester monté UNE fois " +
            "dans `conversationContextMenuOverlay` — sa disparition romprait le rendu " +
            "identique à aujourd'hui, drapeau éteint."
        )

        let normalized = normalizedCode(raw)
        XCTAssertTrue(
            normalized.contains("if LentilleFeatureFlag.isLentilleListEnabled { LentillePeekView("),
            "L'aperçu Lentille doit être monté DERRIÈRE le drapeau — jamais inconditionnel."
        )
        XCTAssertTrue(
            normalized.contains("} else { ConversationPreviewView("),
            "Le repli drapeau OFF doit être la branche `else` EXACTE du même conditionnel " +
            "— pas un second site de montage indépendant qui pourrait diverger."
        )
    }
}
