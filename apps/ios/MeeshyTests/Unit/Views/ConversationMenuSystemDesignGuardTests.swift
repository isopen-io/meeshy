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

    /// iOS 26 (menu natif) : le déplacement par GLISSER doit exister via le
    /// `.onDrag` natif (il coexiste avec le `.contextMenu` système — c'était
    /// le long-press CUSTOM du fallback qu'il cassait), et la décision du
    /// drop doit passer par `ChipDropResolver` — le MÊME résolveur que le
    /// drop de la chip du morph custom (SSOT : pin par drop, « other » → "",
    /// no-op même section).
    func test_nativeDragToSection_existsAndRoutesThroughChipDropResolver() throws {
        let rowsSource = try source("Meeshy/Features/Main/Views/ConversationListView+Rows.swift")
        XCTAssertTrue(
            rowsSource.contains(".onDrag"),
            "Le chemin natif iOS 26 doit exposer .onDrag sur la ligne " +
            "(source du drag-to-section, coexiste avec le contextMenu système)."
        )

        let listSource = try source("Meeshy/Features/Main/Views/ConversationListView.swift")
        guard let dropRange = listSource.range(of: "func handleDrop(") else {
            XCTFail("ConversationListView doit garder handleDrop (cible du SectionDropDelegate)")
            return
        }
        let end = listSource.index(dropRange.lowerBound, offsetBy: 1600, limitedBy: listSource.endIndex) ?? listSource.endIndex
        let dropBlock = String(listSource[dropRange.lowerBound ..< end])
        XCTAssertTrue(
            dropBlock.contains("ChipDropResolver.action("),
            "handleDrop doit décider via ChipDropResolver — même sémantique que " +
            "le drop de la chip (pin par drop, other→\"\", no-op même section)."
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

    /// iOS 26+ : le builder natif doit exposer « Rechercher » et « Appeler »
    /// (décision 2026-07-14) — l'aperçu natif étant statique, ces actions
    /// vivent dans le menu, câblées sur les MÊMES chemins que les boutons de
    /// l'aperçu du fallback custom : Rechercher arme `pendingOpenSearch` puis
    /// ouvre la conversation, Appeler passe par `CallManager.shared.startCall`.
    func test_nativeContextMenuBuilder_offersSearchAndCall() throws {
        let overlaysSource = try source("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift")

        guard let builderRange = overlaysSource.range(of: "func conversationContextMenu(for") else {
            XCTFail("Le builder natif conversationContextMenu(for:) doit exister.")
            return
        }
        let blockEnd = overlaysSource.range(
            of: "// MARK: - Custom Context Menu Overlay",
            range: builderRange.lowerBound ..< overlaysSource.endIndex
        )?.lowerBound ?? overlaysSource.endIndex
        let builderBlock = String(overlaysSource[builderRange.lowerBound ..< blockEnd])

        XCTAssertTrue(
            builderBlock.contains("context.search") && builderBlock.contains("magnifyingglass"),
            "Le builder natif doit offrir « Rechercher » (icône magnifyingglass)."
        )
        XCTAssertTrue(
            builderBlock.contains("router.pendingOpenSearch = true"),
            "« Rechercher » doit armer router.pendingOpenSearch — même chemin que " +
            "le bouton onSearch de l'aperçu custom (SSOT)."
        )
        XCTAssertTrue(
            builderBlock.contains("context.call") && builderBlock.contains("phone.fill"),
            "Le builder natif doit offrir « Appeler » (icône phone.fill, DM)."
        )
        XCTAssertTrue(
            builderBlock.contains("CallManager.shared.requestPermissionsThenStartCall("),
            "« Appeler » doit passer par CallManager.shared.requestPermissionsThenStartCall — " +
            "même chemin que le bouton onCall de l'aperçu custom (SSOT). Depuis " +
            "2026-07-23 ce point d'entrée tranche micro/caméra AVANT de composer ; " +
            "`startCall` brut ne demande rien et connecterait un appel muet."
        )
    }

    // MARK: - Menu d'appui long des MESSAGES (design système par version)
    //
    // Décision produit 2026-07-14 (« hybride ») : le menu d'appui long des
    // messages adopte le design système par version d'iOS pour sa LISTE
    // d'actions (`MessageActionsMenu` : même `adaptiveGlass` + highlight au
    // press que le menu des conversations), tout en CONSERVANT la barre de
    // réactions emoji rapides et l'aperçu de bulle (`MessageOverlayMenu`).

    /// La liste d'actions du menu message rend le design système : conteneur
    /// `adaptiveGlass` (Liquid Glass iOS 26 / fallback material), rows avec
    /// highlight au press (`MenuRowHighlightButtonStyle`, partagé avec le menu
    /// conversation) et métriques Dynamic Type — jamais `.buttonStyle(.plain)`.
    func test_messageActionsMenu_rendersSystemDesign_likeConversationMenu() throws {
        let menuSource = try source("Meeshy/Features/Main/Components/MessageActionsMenu.swift")

        XCTAssertTrue(
            menuSource.contains(".adaptiveGlass(in: RoundedRectangle"),
            "MessageActionsMenu doit appliquer .adaptiveGlass sur son conteneur " +
            "(Liquid Glass iOS 26 réel + fallback), comme le menu conversation."
        )
        XCTAssertTrue(
            menuSource.contains("MenuRowHighlightButtonStyle"),
            "Les rows du menu message doivent surligner la ligne pressée (parité " +
            "menus système) via le style partagé MenuRowHighlightButtonStyle."
        )
        XCTAssertFalse(
            menuSource.contains(".buttonStyle(.plain)"),
            "MessageActionsMenu ne doit plus utiliser .buttonStyle(.plain) " +
            "(aucun highlight au press) — régression du design système."
        )
        XCTAssertTrue(
            menuSource.contains("@ScaledMetric(relativeTo: .body) private var rowMinHeight"),
            "La hauteur de row du menu message doit scaler avec Dynamic Type " +
            "(@ScaledMetric), comme les menus système et le menu conversation."
        )
    }

    /// Le chrome « natif-lean » de l'overlay message est CONSERVÉ (décision
    /// hybride) : barre de réactions emoji rapides (`EmojiReactionPicker`) +
    /// aperçu de bulle réel (`ThemedMessageBubble`) + liste d'actions restylée
    /// (`MessageActionsMenu`). Le passage au design système ne doit pas
    /// dépouiller ces surfaces.
    func test_messageOverlay_keepsEmojiBarAndBubblePreview_hybridDecision() throws {
        let overlaySource = try source("Meeshy/Features/Main/Components/MessageOverlayMenu.swift")

        XCTAssertTrue(
            overlaySource.contains("EmojiReactionPicker"),
            "MessageOverlayMenu doit garder la barre de réactions emoji rapides " +
            "(EmojiReactionPicker) — décision hybride 2026-07-14."
        )
        XCTAssertTrue(
            overlaySource.contains("ThemedMessageBubble"),
            "MessageOverlayMenu doit garder l'aperçu de bulle réel (ThemedMessageBubble)."
        )
        XCTAssertTrue(
            overlaySource.contains("MessageActionsMenu("),
            "MessageOverlayMenu doit composer la liste d'actions restylée MessageActionsMenu."
        )
    }

    // MARK: - Menu message NATIF (iOS 26 Liquid Glass) + fallback overlay
    //
    // Pivot 2026-07-14 : sur iOS 26 la bulle attache un `.contextMenu` NATIF
    // (Liquid Glass, comme les lignes de conversation) avec aperçu de la bulle
    // d'origine ; < iOS 26 garde l'overlay custom (`MessageOverlayMenu`). Deux
    // chemins par version d'OS, exactement comme `ConversationRowItem`.

    /// iOS 26+ : `.contextMenu` natif + aperçu, long-press custom coupé ;
    /// < iOS 26 : overlay custom conservé (ConditionalBubbleLongPress).
    func test_messageRow_prefersNativeMenu_oniOS26_withCustomFallback() throws {
        let listSource = try source("Meeshy/Features/Main/Views/MessageListView.swift")
        XCTAssertTrue(
            listSource.contains("if #available(iOS 26.0, *), let menu"),
            "Le .contextMenu natif des bulles doit être gaté #available(iOS 26.0, *)."
        )
        XCTAssertTrue(
            listSource.contains(".contextMenu { menu() } preview: { preview() }"),
            "Le chemin iOS 26 doit attacher le .contextMenu NATIF AVEC preview " +
            "(la vraie bulle d'origine)."
        )
        XCTAssertTrue(
            listSource.contains("ConditionalBubbleLongPress"),
            "Le long-press custom de la bulle doit être conditionnel (coupé quand " +
            "le menu natif est actif, gardé < iOS 26)."
        )

        let vcSource = try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(
            vcSource.contains(".nativeMessageContextMenu(menu: nativeMenu)"),
            "La cellule doit attacher le menu natif via .nativeMessageContextMenu(menu:)."
        )
        XCTAssertTrue(
            vcSource.contains("enableLongPress: nativeMenu == nil"),
            "La cellule doit couper le long-press custom quand le menu natif est actif."
        )
    }

    /// Le builder du menu natif (ConversationView) : rangée d'emojis en
    /// `.controlGroupStyle(.compactMenu)` (4 plus utilisés — plafond 1 ligne),
    /// actions via `MessageActionResolver` (SSOT avec l'overlay), et Supprimer
    /// qui ARME la confirmation — jamais de suppression directe.
    func test_buildNativeMessageMenu_compactRow_resolver_confirmedDelete() throws {
        let vSource = try source("Meeshy/Features/Main/Views/ConversationView.swift")

        guard let range = vSource.range(of: "func buildNativeMessageMenu(for msg: Message)") else {
            XCTFail("ConversationView doit exposer buildNativeMessageMenu(for:).")
            return
        }
        let end = vSource.index(range.lowerBound, offsetBy: 4000, limitedBy: vSource.endIndex) ?? vSource.endIndex
        let block = String(vSource[range.lowerBound ..< end])
        XCTAssertTrue(
            block.contains(".controlGroupStyle(.compactMenu)"),
            "La rangée d'emojis rapides doit utiliser .controlGroupStyle(.compactMenu) " +
            "(rangée horizontale système — sans ce style le ControlGroup empile)."
        )
        XCTAssertTrue(
            block.contains("EmojiUsageTracker.topEmojis(count: 4"),
            "La rangée rapide doit afficher 4 emojis (plafond : au-delà, " +
            ".compactMenu passe à la ligne)."
        )
        XCTAssertTrue(
            block.contains("MessageActionResolver.primaryActions(ctx)"),
            "Les actions du menu natif doivent venir de MessageActionResolver (SSOT overlay)."
        )

        guard let btnRange = vSource.range(of: "func nativeMenuButton(") else {
            XCTFail("ConversationView doit exposer nativeMenuButton(_:msg:).")
            return
        }
        // Fenêtre large : `nativeMenuButton` est un switch de 10 cas (~6 k
        // caractères) ; `.delete` est le DERNIER — la borne doit l'atteindre.
        let btnEnd = vSource.index(btnRange.lowerBound, offsetBy: 6500, limitedBy: vSource.endIndex) ?? vSource.endIndex
        let btnBlock = String(vSource[btnRange.lowerBound ..< btnEnd])
        XCTAssertTrue(
            btnBlock.contains("Button(role: .destructive)") &&
            btnBlock.contains("overlayState.deleteConfirmMessageId = msg.id"),
            "La suppression du menu natif doit être destructive ET armer " +
            "deleteConfirmMessageId (confirmation) — jamais de suppression directe."
        )
    }

    // MARK: - Aperçu du menu natif = la bulle « prise de sa position »
    //
    // Feedback device 2026-07-14 : l'aperçu doit PRÉSERVER le format de la
    // bulle/attachement d'origine, épouser son contenu (pas de « card » bordé)
    // et se mettre à l'échelle pour tenir à l'écran. Aucun padding de bordure.

    /// L'aperçu rend la bulle « standalone » dans `MessageMenuPreviewContainer`
    /// (scale-to-fit), la cellule live reste NON-standalone, et le padding qui
    /// créait l'effet bordure a disparu.
    func test_messageMenuPreview_usesStandaloneBubble_noBorderPadding() throws {
        let vcSource = try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(
            vcSource.contains("MessageMenuPreviewContainer") &&
            vcSource.contains("makeThemedBubble(true)"),
            "L'aperçu doit rendre la bulle standalone dans MessageMenuPreviewContainer."
        )
        XCTAssertTrue(
            vcSource.contains("makeThemedBubble(false)"),
            "Le contenu de cellule doit rester une bulle NON-standalone (row alignée)."
        )
        guard let range = vcSource.range(of: ".nativeMessageContextMenu(menu: nativeMenu)") else {
            XCTFail("La cellule doit attacher .nativeMessageContextMenu(menu: nativeMenu).")
            return
        }
        let end = vcSource.index(range.lowerBound, offsetBy: 600, limitedBy: vcSource.endIndex) ?? vcSource.endIndex
        let block = String(vcSource[range.lowerBound ..< end])
        XCTAssertFalse(
            block.contains(".padding(.horizontal, 6)"),
            "L'aperçu ne doit plus wrapper la bulle dans un padding (effet bordure banni)."
        )
    }

    /// La bulle « standalone » supprime les spacers d'alignement de row et hug
    /// sa largeur (fixedSize horizontal) — le platter système colle à la bulle.
    func test_bubbleStandalone_dropsRowSpacers_andHugs() throws {
        let src = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertTrue(
            src.contains("if isMe && !standalone { Spacer(minLength: 50) }") &&
            src.contains("if !isMe && !standalone { Spacer(minLength: 50) }"),
            "Les spacers d'alignement de row doivent être coupés en mode standalone."
        )
        XCTAssertTrue(
            src.contains(".fixedSize(horizontal: standalone, vertical: false)"),
            "Standalone doit hugger la largeur (fixedSize horizontal) — wrap conservé via le cap."
        )
    }

    // MARK: - Destructif message : suppression média + signalement confirmés

    /// Suppression d'un attachement via « Plus… » : modale de validation
    /// obligatoire, jamais de suppression directe (feedback device 2026-07-14).
    func test_deleteMedia_requestsConfirmation_neverDeletesDirectly() throws {
        let src = try source("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        XCTAssertTrue(
            src.contains("showDeleteMediaConfirm = true"),
            "Le pellet .deleteMedia doit armer la confirmation (showDeleteMediaConfirm)."
        )
        XCTAssertTrue(
            src.contains(".confirmationDialog(") &&
            src.contains("isPresented: $showDeleteMediaConfirm"),
            "MessageMoreSheet doit présenter une modale de confirmation de suppression média."
        )
        XCTAssertFalse(
            src.contains("case .deleteMedia: onDeleteMedia?()"),
            "La suppression directe (case .deleteMedia: onDeleteMedia?()) est bannie."
        )
    }

    /// Signalement d'un message : modale de validation avant l'envoi ;
    /// `onReport` n'est appelé QUE depuis le bouton destructif de la modale.
    func test_report_requestsConfirmation_beforeSubmit() throws {
        let src = try source("Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift")
        XCTAssertTrue(
            src.contains("showReportConfirm = true"),
            "Le bouton d'envoi doit armer la confirmation (showReportConfirm)."
        )
        XCTAssertTrue(
            src.contains(".confirmationDialog(") &&
            src.contains("isPresented: $showReportConfirm"),
            "MessageReportDetailView doit présenter une modale de confirmation de signalement."
        )
        let calls = src.components(separatedBy: "onReport?(").count - 1
        XCTAssertEqual(
            calls, 1,
            "onReport ne doit être appelé qu'une fois — depuis le bouton destructif de la modale."
        )
    }
}
