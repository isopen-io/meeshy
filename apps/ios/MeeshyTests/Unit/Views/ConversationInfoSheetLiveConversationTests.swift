import XCTest
@testable import Meeshy

/// L3b/conv-settings-stale-open-view — éditer une conversation (titre,
/// description, avatar, bannière, réglages) laissait l'écran DÉJÀ OUVERT sur
/// son état d'avant.
///
/// `ConversationView.conversation` est une valeur FIGÉE, capturée au moment de
/// la navigation, et `MeeshyConversation.==`/`.hash` ne comparent que `id` :
/// rien ne force le `NavigationStack` à recomposer l'écran quand seuls les
/// champs internes changent. `ConversationSettingsView.save()` produit pourtant
/// DÉJÀ la conversation fusionnée que le serveur vient de confirmer
/// (`mergingMetadata`) — elle était jetée par le callback de la feuille d'info.
///
/// La chaîne réparée, un maillon par test :
/// `save()` → `onUpdated(merged)` → `ConversationInfoSheet.onConversationUpdated`
/// → `ConversationView.conversationOverride` → `liveConversation` → en-tête.
///
/// Aucun de ces maillons n'est montable dans ce dépôt (vues SwiftUI, aucun
/// ViewInspector installé — même constat que `RiverStreamHostSourceGuardTests`)
/// : la chaîne est verrouillée par des gardes de SOURCE, chacune accompagnée de
/// sa CONTRE-ÉPREUVE, c'est-à-dire de l'écriture qui doit la faire rougir.
///
/// La lecture passe par `AppSourceGuard.stripComments` : une garde qui lirait
/// les commentaires se satisferait de sa propre documentation.
final class ConversationInfoSheetLiveConversationTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    /// Source SANS commentaires, à blancs NORMALISÉS — les assertions portent
    /// donc sur la forme du code, jamais sur son indentation.
    private func code(_ relativePath: String) throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/\(relativePath)"),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func vicinity(after anchor: String, in source: String, span: Int) throws -> String {
        let range = try XCTUnwrap(
            source.range(of: anchor),
            "Ancre introuvable : « \(anchor) » — cette garde doit être re-pointée AVANT tout le reste."
        )
        let end = source.index(range.upperBound, offsetBy: span, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.upperBound ..< end])
    }

    private var infoSheetPath: String { "Features/Main/Components/ConversationInfoSheet.swift" }
    private var conversationViewPath: String { "Features/Main/Views/ConversationView.swift" }
    private var headerPath: String { "Features/Main/Views/ConversationView+Header.swift" }

    // MARK: - 1. La feuille d'info REMONTE la conversation fusionnée

    func test_conversationInfoSheet_forwardsTheServerMergedConversation_toItsHost() throws {
        let sheet = try code(infoSheetPath)

        XCTAssertTrue(
            sheet.contains("var onConversationUpdated: ((Conversation) -> Void)? = nil"),
            "`ConversationInfoSheet` doit exposer `onConversationUpdated` pour remonter à son hôte " +
            "la conversation fusionnée que le serveur vient de confirmer. Sans ce relais, la valeur " +
            "meurt dans la feuille et l'écran ouvert reste sur son état d'avant l'édition."
        )

        let nearSettings = try vicinity(after: "ConversationSettingsView(", in: sheet, span: 320)
        XCTAssertTrue(
            nearSettings.contains("onConversationUpdated?(updated)"),
            "Le `onUpdated` de `ConversationSettingsView` doit TRANSMETTRE son argument : c'est la " +
            "conversation déjà fusionnée (`MeeshyConversation.mergingMetadata`), le seul objet du " +
            "flux qui porte les champs confirmés par le serveur."
        )
    }

    /// Contre-épreuve du test ci-dessus : l'écriture exacte qui a produit le défaut.
    func test_conversationInfoSheet_neverDropsTheMergedConversation() throws {
        let sheet = try code(infoSheetPath)
        XCTAssertFalse(
            sheet.contains("onUpdated: { _ in dismiss() }"),
            "`onUpdated: { _ in dismiss() }` JETTE la conversation fusionnée que le serveur vient " +
            "de confirmer — c'est exactement le défaut corrigé. La feuille doit la remonter avant " +
            "de se fermer, jamais l'ignorer."
        )
    }

    // MARK: - 2. `ConversationView` CAPTURE la mise à jour

    func test_conversationView_capturesTheUpdate_whenItMountsTheInfoSheet() throws {
        let view = try code(conversationViewPath)

        XCTAssertTrue(
            view.contains("if let conv = liveConversation {"),
            "La feuille d'info doit être montée sur la conversation VIVANTE : montée sur la valeur " +
            "figée, elle rouvrirait sur le titre d'avant l'édition qu'elle vient elle-même de faire " +
            "enregistrer."
        )

        let nearSheet = try vicinity(after: "ConversationInfoSheet(", in: view, span: 220)
        XCTAssertTrue(
            nearSheet.contains("onConversationUpdated: { conversationOverride = $0 }"),
            "Le site de montage doit stocker la conversation confirmée dans `conversationOverride` " +
            "— c'est le seul écrivain de cet état, et le seul moment où le serveur dit ce que " +
            "l'écran doit désormais afficher."
        )
    }

    func test_conversationView_resolvesLiveConversation_overrideBeforeFrozenValue() throws {
        let view = try code(conversationViewPath)

        XCTAssertTrue(
            view.contains("@State private var conversationOverride: Conversation?"),
            "L'override serveur est un `@State` de `ConversationView` — la seule source vivante " +
            "d'un écran dont le paramètre `conversation` est figé à la navigation."
        )
        XCTAssertTrue(
            view.contains("var liveConversation: Conversation? { conversationOverride ?? conversation }"),
            "`liveConversation` résout l'override D'ABORD, la valeur figée ensuite, et reste " +
            "`internal` : l'extension `ConversationView+Header` vit dans un autre fichier, où un " +
            "`private` serait inaccessible."
        )
        XCTAssertFalse(
            view.contains("var liveConversation: Conversation? { conversation ?? conversationOverride }"),
            "Contre-épreuve : l'ordre inverse rendrait l'override INERTE — `conversation` n'est " +
            "`nil` que dans le flux invité, donc la valeur figée gagnerait toujours."
        )
    }

    /// La garde `FocalBetaPreviewNavigationSourceGuardTests` cherche la chaîne
    /// littérale `ConversationView(conversation: conv, previewMode: true, …)`
    /// dans `RootView.swift` : renommer ou ré-étiqueter ce paramètre la ferait
    /// rougir. Le correctif ajoute un override, il ne touche pas au paramètre.
    func test_conversationView_keepsTheFrozenConversationParameter_untouched() throws {
        let view = try code(conversationViewPath)
        XCTAssertTrue(
            view.contains("let conversation: Conversation?"),
            "Le paramètre `conversation` de `ConversationView` doit garder son nom ET son " +
            "étiquette : six sites d'appel et la garde de navigation Focal en dépendent. " +
            "L'override vit À CÔTÉ de lui, jamais à sa place."
        )
    }

    // MARK: - 3. L'en-tête LIT la conversation vivante

    func test_conversationHeader_feedsTheAvatarBand_withTheLiveConversation() throws {
        let header = try code(headerPath)
        let nearBand = try vicinity(after: "ConversationHeaderAvatarView(", in: header, span: 200)

        XCTAssertTrue(
            nearBand.contains("conversation: liveConversation,"),
            "La bande d'avatars de l'en-tête (titre + avatar, les deux seuls champs que les " +
            "réglages peuvent changer sous les yeux du lecteur) doit recevoir la conversation " +
            "VIVANTE — c'est l'unique argument qui alimente ses quatre lectures `name`/`avatarURL`."
        )
        XCTAssertFalse(
            nearBand.contains("conversation: conversation,"),
            "Contre-épreuve : repasser la valeur FIGÉE ici rendrait l'override invisible — " +
            "l'en-tête est précisément la surface où l'utilisateur constate que son édition a été " +
            "prise en compte."
        )
    }

    func test_typingHeaderBar_readsTheLiveConversation() throws {
        let view = try code(conversationViewPath)
        let nearTypingHeader = try vicinity(
            after: "private var typingHeaderBar: some View {", in: view, span: 600
        )

        XCTAssertTrue(
            nearTypingHeader.contains("name: liveConversation?.name ?? \"?\""),
            "L'en-tête réduit affiché pendant la frappe montre le MÊME titre que l'en-tête plein — " +
            "sinon l'édition ne serait visible qu'une fois le clavier refermé."
        )
        XCTAssertTrue(
            nearTypingHeader.contains(
                "avatarURL: liveConversation?.type == .direct ? liveConversation?.participantAvatarURL : liveConversation?.avatar"
            ),
            "Même règle pour l'avatar de l'en-tête réduit : une seule source, la conversation vivante."
        )
    }
}
