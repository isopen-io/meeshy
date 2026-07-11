import XCTest
@testable import Meeshy

/// Source-analysis guards for the conversation long-press menu.
///
/// Trois invariants produit (2026-07-10, étendus 2026-07-11) :
/// 1. **Tout callback destructif passe par une confirmation système** : la
///    suppression d'une conversation (menu natif, menu custom ET swipe
///    « hide ») ne doit JAMAIS appeler `deleteConversation` directement —
///    elle arme `deleteTargetConversation`, consommé par l'unique
///    `confirmationDialog` de `ConversationListView` (rendu natif de l'OS
///    courant, Liquid Glass sur iOS 26).
/// 2. **Le menu custom rend le design système de la version d'iOS courante**
///    via les wrappers `Compatibility/` du SDK : conteneur `adaptiveGlass`
///    (vrai `glassEffect` iOS 26, fallback material avant), rows avec
///    highlight au press (parité UIMenu) et métriques Dynamic Type.
/// 3. **Le long-press préfère le menu NATIF quand Liquid Glass existe** :
///    sur iOS 26+ la ligne attache le `.contextMenu` système (rendu Liquid
///    Glass natif) ; les iOS antérieurs retombent sur l'overlay custom
///    (`RowPressBounceModifier` → `ConversationContextMenuView`).
@MainActor
final class ConversationMenuSystemDesignGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Destructive confirmation

    /// Le SEUL call site de `deleteConversation(conversationId:` dans la liste
    /// doit vivre dans le `confirmationDialog` de suppression.
    func test_deleteConversation_onlyCallSite_isInsideConfirmationDialog() throws {
        let listSource = try source("Meeshy/Features/Main/Views/ConversationListView.swift")

        let callSites = listSource.components(separatedBy: "conversationViewModel.deleteConversation(conversationId:").count - 1
        XCTAssertEqual(
            callSites, 1,
            "ConversationListView doit contenir exactement UN appel à " +
            "deleteConversation — celui du confirmationDialog. Tout nouveau " +
            "chemin de suppression doit armer `deleteTargetConversation` à la place."
        )

        guard let dialogRange = listSource.range(of: "conversation.delete.confirm.title") else {
            XCTFail("ConversationListView doit présenter le confirmationDialog de suppression (clé conversation.delete.confirm.title)")
            return
        }
        let end = listSource.index(dialogRange.lowerBound, offsetBy: 1600, limitedBy: listSource.endIndex) ?? listSource.endIndex
        let dialogBlock = String(listSource[dialogRange.lowerBound ..< end])
        XCTAssertTrue(
            dialogBlock.contains("conversationViewModel.deleteConversation(conversationId:"),
            "L'appel deleteConversation doit être DANS le bloc du confirmationDialog de suppression."
        )
        XCTAssertTrue(
            dialogBlock.contains("role: .destructive"),
            "Le bouton de confirmation de suppression doit porter role: .destructive (rendu rouge système)."
        )
    }

    /// L'overlay du menu custom ne supprime jamais directement : `onDelete`
    /// arme la cible de confirmation.
    func test_contextMenuOverlay_onDelete_requestsConfirmation_neverDeletesDirectly() throws {
        let overlaysSource = try source("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift")

        XCTAssertFalse(
            overlaysSource.contains("conversationViewModel.deleteConversation("),
            "ConversationListView+Overlays ne doit contenir AUCUN appel direct à " +
            "deleteConversation — le menu custom route par deleteTargetConversation " +
            "vers le confirmationDialog système."
        )

        guard let onDeleteRange = overlaysSource.range(of: "onDelete: {") else {
            XCTFail("L'overlay doit câbler le callback onDelete du menu custom")
            return
        }
        let end = overlaysSource.index(onDeleteRange.lowerBound, offsetBy: 400, limitedBy: overlaysSource.endIndex) ?? overlaysSource.endIndex
        let block = String(overlaysSource[onDeleteRange.lowerBound ..< end])
        XCTAssertTrue(
            block.contains("deleteTargetConversation = conversation"),
            "onDelete doit armer deleteTargetConversation (confirmation système) au lieu de supprimer."
        )
    }

    /// Le swipe « hide » (masquer/supprimer) passe lui aussi par la confirmation.
    func test_swipeHideAction_requestsConfirmation() throws {
        let listSource = try source("Meeshy/Features/Main/Views/ConversationListView.swift")

        guard let hideRange = listSource.range(of: "SwipeLabels.hide") else {
            XCTFail("La liste doit exposer l'action de swipe « hide »")
            return
        }
        let end = listSource.index(hideRange.lowerBound, offsetBy: 300, limitedBy: listSource.endIndex) ?? listSource.endIndex
        let block = String(listSource[hideRange.lowerBound ..< end])
        XCTAssertTrue(
            block.contains("deleteTargetConversation = conversation"),
            "Le swipe « hide » doit armer deleteTargetConversation — jamais de suppression directe."
        )
    }

    // MARK: - System design (Liquid Glass via Compatibility)

    /// Le conteneur du menu custom doit rester sur le wrapper Compatibility
    /// `adaptiveGlass` — vrai Liquid Glass iOS 26, fallback material avant —
    /// jamais un fond opaque maison.
    func test_conversationContextMenu_usesAdaptiveGlassContainer() throws {
        let menuSource = try source("Meeshy/Features/Main/Views/ConversationContextMenuView.swift")
        XCTAssertTrue(
            menuSource.contains(".adaptiveGlass(in: RoundedRectangle"),
            "ConversationContextMenuView doit appliquer .adaptiveGlass sur son conteneur " +
            "(gate iOS 26 réel + fallback, propriété des wrappers Compatibility du SDK)."
        )
    }

    /// Les rows du menu doivent garder la parité système : highlight au press
    /// et métriques Dynamic Type (`@ScaledMetric`), comme UIMenu.
    func test_conversationContextMenu_rows_haveSystemParity() throws {
        let menuSource = try source("Meeshy/Features/Main/Views/ConversationContextMenuView.swift")
        XCTAssertTrue(
            menuSource.contains("MenuRowHighlightButtonStyle"),
            "Les rows du menu doivent surligner la ligne pressée (parité menus système) " +
            "via MenuRowHighlightButtonStyle — pas .buttonStyle(.plain)."
        )
        XCTAssertTrue(
            menuSource.contains("@ScaledMetric(relativeTo: .body) private var rowMinHeight"),
            "La hauteur de row doit scaler avec Dynamic Type (@ScaledMetric), " +
            "comme MessageActionsMenu et les menus natifs."
        )
    }

    // MARK: - Menu natif Liquid Glass (iOS 26) + fallback custom

    /// La ligne doit préférer le `.contextMenu` NATIF (rendu Liquid Glass
    /// système) quand l'OS le fournit, et garder l'overlay custom
    /// (`RowPressBounceModifier` → `onLongPress`) comme fallback < iOS 26.
    func test_conversationRow_prefersNativeMenu_oniOS26_withCustomFallback() throws {
        let rowsSource = try source("Meeshy/Features/Main/Views/ConversationListView+Rows.swift")

        XCTAssertTrue(
            rowsSource.contains("if #available(iOS 26.0, *)"),
            "ConversationRowItem doit gater le menu natif Liquid Glass derrière " +
            "#available(iOS 26.0, *) — jamais de détection runtime maison."
        )
        XCTAssertTrue(
            rowsSource.contains(".contextMenu {"),
            "Le chemin iOS 26 doit attacher le .contextMenu NATIF " +
            "(rendu Liquid Glass système, preview comprise)."
        )
        XCTAssertTrue(
            rowsSource.contains("RowPressBounceModifier(onTap:"),
            "Le fallback < iOS 26 doit rester l'overlay custom " +
            "(RowPressBounceModifier → ConversationContextMenuView)."
        )
    }

    /// CAUSE RACINE des « icônes absentes sur iOS 26 » (élucidée 2026-07-11) :
    /// `MeeshyRefreshableScroll` posait `.tint(.clear)` sur TOUT le ScrollView
    /// pour masquer le spinner natif du `.refreshable`. L'environnement tint
    /// se propage au contenu, et sur iOS 26 les icônes des menus contextuels
    /// (rendu Liquid Glass) suivent le tint → icônes transparentes, app-wide.
    /// Le spinner est masqué par le proxy `UIRefreshControl.appearance()`
    /// (AppDelegate — mécanisme documenté comme le seul efficace iOS 17+) ;
    /// AUCUN wrapper de scroll ne doit re-poser un tint clear d'environnement.
    func test_refreshableScrollWrapper_neverTintsContentClear() throws {
        let wrapperSource = try source("../../packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyRefreshableScroll.swift")
        // CODE seulement — le fichier documente l'interdit dans ses
        // commentaires, qui contiennent donc la chaîne cherchée.
        let codeLines = wrapperSource
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        XCTAssertFalse(
            codeLines.contains(".tint(.clear)") || codeLines.contains(".tint(Color.clear)"),
            "MeeshyRefreshableScroll ne doit pas appliquer .tint(.clear) à son contenu : " +
            "le tint d'environnement rend invisibles les icônes des menus contextuels " +
            "natifs iOS 26. Le spinner natif est masqué par UIRefreshControl.appearance() " +
            "dans AppDelegate."
        )
    }

    /// Le builder du menu natif doit exister et garder la parité d'actions
    /// avec le menu custom — dont Renommer, la divergence historique qui
    /// avait justifié la suppression du premier builder (#1811).
    func test_nativeContextMenuBuilder_exists_withRenameParity() throws {
        let overlaysSource = try source("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift")

        guard let builderRange = overlaysSource.range(of: "func conversationContextMenu(for") else {
            XCTFail(
                "ConversationListView+Overlays doit exposer le builder natif " +
                "conversationContextMenu(for:) — chemin iOS 26 du long-press."
            )
            return
        }
        // Fenêtre large : le builder fait ~10 500 caractères (le Delete est
        // tout en bas) — borné par le MARK de l'overlay custom qui le suit.
        let blockEnd = overlaysSource.range(
            of: "// MARK: - Custom Context Menu Overlay",
            range: builderRange.lowerBound ..< overlaysSource.endIndex
        )?.lowerBound ?? overlaysSource.endIndex
        let builderBlock = String(overlaysSource[builderRange.lowerBound ..< blockEnd])
        XCTAssertTrue(
            builderBlock.contains("context.rename"),
            "Le builder natif doit offrir Renommer (parité menu custom)."
        )
        XCTAssertTrue(
            builderBlock.contains("deleteTargetConversation = conversation"),
            "Le Delete du builder natif doit armer deleteTargetConversation " +
            "(confirmation système) — jamais de suppression directe."
        )
    }
}
