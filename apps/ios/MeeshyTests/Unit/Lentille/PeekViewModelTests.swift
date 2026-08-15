import XCTest
import MeeshySDK
@testable import Meeshy

/// `LentillePeekViewModel` — ce que l'aperçu affiche (contrat LWS-8/I-072,
/// troisième point d'entrée du menu de mode).
///
/// **Suite COMPLÉTÉE par I-073.** I-072 verrouillait la CONSTRUCTION du
/// modèle — titre, préview résolu par le Prisme, délégation au MÊME
/// `LentilleModeMenuModel` que l'encoche et le sous-menu.
///
/// **I-073 ajoute** : les gardes source des timings/cotes gelés
/// (`Lentille/Mode/` ne redéfinit ni le spring 0.55/0.25 de
/// `RowPressBounceModifier`, ni le littéral `70` de la zone d'exclusion
/// avatar) et le verrouillage exécutable de l'écart déjà signalé par
/// l'en-tête de `LentillePeekView.swift` — le chemin natif iOS 26+ n'est
/// PAS câblé sur `LentillePeekView` (fichier `+Rows.swift`, propriété
/// LWS-7, hors périmètre d'édition de cette tâche) : DÉFAUT RÉEL DOCUMENTÉ,
/// NON CORRIGÉ.
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

    /// I-073 — DÉFAUT RÉEL DOCUMENTÉ, NON CORRIGÉ. Critère LWS-8 littéral :
    /// « `LentillePeekView` en `preview:` des DEUX chemins OS ». Le chemin
    /// natif iOS 26+ (`.contextMenu(menuItems:preview:)`,
    /// `ConversationListView+Rows.swift:125-142`) appartient à LWS-7 (mux de
    /// rang, contrat §1.4), PAS à LWS-8 — ce fichier de test NE PEUT PAS
    /// éditer `+Rows.swift` sans violer la règle d'or des contrats (un agent
    /// n'édite jamais un fichier dont il n'est pas propriétaire). L'écart est
    /// déjà signalé par l'en-tête de `LentillePeekView.swift` lui-même : ce
    /// témoin le VERROUILLE en test exécutable, pour qu'un lecteur qui ne
    /// lit pas les commentaires de production le voie quand même rougir s'il
    /// disparaît silencieusement (ex. `+Rows.swift` réécrit sans que
    /// personne ne recâble la preview).
    ///
    /// Conséquence produit concrète : sous Lentille ON, un utilisateur iOS
    /// 26+ qui déclenche le menu contextuel NATIF (pas l'overlay custom < iOS
    /// 26) voit encore l'ancienne `ConversationPreviewView`, jamais
    /// `LentillePeekView` — le troisième point d'entrée du menu de mode
    /// (contrat « trois points d'entrée, une préférence ») n'existe donc que
    /// sur UN SEUL des deux chemins d'appui long.
    func test_nativeContextMenuPreviewPath_stillUsesTheOldPreview_documentedLWS7ScopeGap() throws {
        let rowsRaw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent(
                "Meeshy/Features/Main/Views/ConversationListView+Rows.swift"
            ),
            encoding: .utf8
        )

        XCTAssertEqual(
            rowsRaw.components(separatedBy: "LentillePeekView(").count - 1, 0,
            "`ConversationListView+Rows.swift` (chemin natif iOS 26+) contient désormais " +
            "`LentillePeekView(` : l'écart documenté par cette suite et par l'en-tête de " +
            "`LentillePeekView.swift` a été comblé — mettre ce test à jour (il doit alors " +
            "vérifier la présence, pas l'absence) plutôt que le supprimer en silence."
        )
        XCTAssertEqual(
            rowsRaw.components(separatedBy: "ConversationPreviewView(").count - 1, 1,
            "Le chemin natif doit continuer d'utiliser `ConversationPreviewView` tant que " +
            "l'écart n'est pas comblé — sa disparition SANS remplacement par " +
            "`LentillePeekView` casserait l'aperçu du chemin natif purement et simplement."
        )
    }

    // MARK: - 4. Gardes de source — timings et cotes gelés NON redéfinis dans Lentille/Mode/

    private static var modeDirectory: URL {
        Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Mode")
    }

    /// Découverte dynamique (leçon 257) — jamais une liste de fichiers
    /// recopiée à la main : un fichier ajouté demain à `Lentille/Mode/`
    /// entre automatiquement sous cette garde.
    private func modeSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.modeDirectory, includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    func test_guardDiscoversAtLeastOneModeSourceFile_neverSilentlyEmpty() throws {
        XCTAssertFalse(
            try modeSources().isEmpty,
            "La garde n'a chargé AUCUN fichier depuis `\(Self.modeDirectory.path)` — elle " +
            "passerait alors au vert sans rien vérifier (leçon 257)."
        )
    }

    /// Critère LWS-8 : « timings, spring 0.55/0.25 … gelés ». Le spring peu
    /// amorti du rebond de long-press (`RowPressBounceModifier
    /// .spring(response: 0.55, dampingFraction: 0.25)`) vit dans
    /// `ConversationListView+Rows.swift` et SEULEMENT là — `Lentille/Mode/`
    /// ne doit jamais recomposer sa propre paire `(0.55, 0.25)`, ce qui
    /// romprait la synchronisation (documentée dans le commentaire du
    /// modifier) entre le rebond de la ligne et l'émergence de l'aperçu.
    func test_modeFiles_neverRedefineTheFrozenPressBounceSpring() throws {
        for source in try modeSources() {
            for forbidden in ["0.55", "0.25"] {
                XCTAssertEqual(
                    source.code.components(separatedBy: forbidden).count - 1, 0,
                    "\(source.name) contient « \(forbidden) » (source BRUTE, commentaires " +
                    "compris) : les timings du geste d'appui long sont GELÉS dans " +
                    "`RowPressBounceModifier` (`ConversationListView+Rows.swift`) — " +
                    "critère LWS-8, « timings … gelés »."
                )
            }
        }
    }

    /// Critère LWS-8 : « zone d'exclusion avatar 70 pt … consommée pas
    /// recalculée ». La bande avant de la ligne réservée aux gestes de
    /// l'avatar (`ConversationRowMetrics.avatarInteractionExclusionWidth` =
    /// `MeeshySpacing.md + AvatarContext.conversationList.ringSize`, soit
    /// `12 + 58 = 70`) est calculée UNE fois dans
    /// `ConversationListView+Rows.swift` ; `Lentille/Mode/` (l'aperçu compris)
    /// ne doit jamais recomposer son propre littéral `70` pour la même
    /// notion — la CONSOMMER, jamais la RECALCULER.
    ///
    /// Recherche par LIMITE DE MOT (`\b70\b`), pas par sous-chaîne brute :
    /// `Lentille/Mode/` cite abondamment des identifiants de tâche comme
    /// `I-070` en commentaire, et `"70"` y est une sous-chaîne de `"070"` —
    /// une garde en sous-chaîne braillerait sur CHAQUE renvoi à I-070 sans
    /// jamais avoir vu la cote. `\b` ne coupe pas entre deux chiffres : il ne
    /// matche donc pas à l'intérieur de `070`, seulement un `70` isolé.
    func test_modeFiles_neverHardcodeTheAvatarExclusionZoneAsALiteral() throws {
        let pattern = "\\b70\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour la zone d'exclusion avatar — corriger le motif avant de faire confiance à ce témoin.")
            return
        }
        for source in try modeSources() {
            let range = NSRange(source.code.startIndex..<source.code.endIndex, in: source.code)
            let matches = regex.numberOfMatches(in: source.code, range: range)
            XCTAssertEqual(
                matches, 0,
                "\(source.name) contient un « 70 » isolé (pas un renvoi `I-070`) : si c'est " +
                "la zone d'exclusion avatar, elle doit être LUE sur " +
                "`ConversationRowMetrics.avatarInteractionExclusionWidth`, jamais réécrite " +
                "en dur ici — deux constantes qui dérivent au premier ajustement de " +
                "`MeeshySpacing.md` ou de l'anneau d'avatar."
            )
        }
    }
}
