import XCTest
@testable import Meeshy

/// iPad ↔ iPhone : la colonne de détail ne montre jamais une conversation
/// morte. Sur iPhone, la liste n'est pas visible pendant qu'un fil est ouvert,
/// et `dismiss()` dépile l'écran ; sur iPad, la liste reste à côté du fil, et le
/// fil est posé dans la colonne de droite, hors `NavigationStack`, où
/// `dismiss()` est un no-op silencieux (`PanelBackAction`).
@MainActor
final class iPadDetailColumnCoherenceTests: XCTestCase {

    // MARK: - La conversation ouverte quitte la liste

    func test_selectionRule_closesOnlyTheConversationShown() {
        XCTAssertTrue(iPadSelectionRule.closesDetail(activeConversationId: "a", removedId: "a"))
        XCTAssertFalse(iPadSelectionRule.closesDetail(activeConversationId: "a", removedId: "b"))
        XCTAssertFalse(iPadSelectionRule.closesDetail(activeConversationId: nil, removedId: "a"))
    }

    /// Masquer ou supprimer depuis la colonne de gauche, quitter, être retiré
    /// ou banni : la ligne disparaissait, le fil restait ouvert à droite, son
    /// composer actif.
    func test_iPadRoot_closesTheDetailColumn_whenItsConversationLeavesTheList() throws {
        let root = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView.swift"))
        XCTAssertTrue(root.contains(".onReceive(conversationViewModel.conversationLeavesDetail)"))
        XCTAssertTrue(root.contains("iPadSelectionRule.closesDetail("))

        let vm = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift"))
        let drop = try XCTUnwrap(vm.range(of: "func dropConversationLeftByMe("))
        XCTAssertTrue(
            vm[drop.upperBound...].prefix(400).contains("conversationLeavesDetail.send(conversationId)"),
            "quitter, être retiré ou banni (socket) referme aussi la colonne"
        )
    }

    // MARK: - Accès retiré : le fil se referme aussi sur iPad

    func test_accessRevoked_leavesThroughTheRouter_notADismissThatIsANoOpOnIPad() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView.swift"))
        XCTAssertTrue(view.contains("accessRevoked: viewModel.accessRevoked"), "le cycle de vie observe la révocation")
        let handler = try XCTUnwrap(view.range(of: "private func conversationAccessWasRevoked() {"))
        let body = String(view[handler.upperBound...].prefix(500))
        XCTAssertTrue(body.contains("router.pop()"), "le même retour que le bouton de l'en-tête — il referme la colonne iPad")
        XCTAssertTrue(body.contains("if anonymousSession != nil { dismiss() }"), "l'invité, présenté, se ferme")
    }

    // MARK: - Écrans posés en racine du panneau : leur croix ferme le panneau

    /// Une notification « nouvelle humeur » ouvre le projecteur dans le
    /// panneau ; sa barre est masquée (pas de chevron de repli) et sa croix
    /// appelait `dismiss()`, no-op là — l'écran ne se fermait plus.
    func test_moodSpotlight_closesThroughThePanel() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Views/MoodSpotlight/MoodSpotlightView.swift"))
        XCTAssertTrue(code.contains("PanelBackAction"))
        XCTAssertFalse(code.contains("HapticFeedback.light()\n                dismiss()"))
    }

    // MARK: - « Rechercher » sur la conversation déjà ouverte

    /// Sur iPad la liste reste à côté : choisir « Rechercher » sur la
    /// conversation ouverte ne recrée pas la vue, et le drapeau lu par le seul
    /// `.task` initial restait levé — la recherche s'ouvrait dans la suivante.
    func test_openSearch_isConsumedAlsoWhenTheConversationIsAlreadyOpen() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView.swift"))
        XCTAssertTrue(view.contains("pendingOpenSearch: router.pendingOpenSearch"))
        XCTAssertTrue(view.contains(".adaptiveOnChange(of: signals.pendingOpenSearch)"))
        XCTAssertTrue(view.contains("await consumePendingOpenSearch()"))
    }

    // MARK: - Le compteur de signets se recale sur iPhone comme sur iPad

    func test_iPhoneFeed_reconcilesTheBookmarkDelta_likeTheIPadFeed() throws {
        let overlay = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootViewComponents.swift"))
        XCTAssertTrue(overlay.contains(".onReceive(SocialSocketManager.shared.postBookmarked"),
                      "sans ce recalage, le +1 optimiste s'ajoutait au compteur absolu du serveur")
        XCTAssertTrue(overlay.contains("postBookmarkDelta[payload.postId] = nil"))
    }

    /// Réglages d'une communauté dans le panneau : « Annuler » appelait
    /// `dismiss()`, no-op là ; il revient désormais au détail, comme sur iPhone.
    func test_communitySettingsCancel_returnsToTheDetailOnIPad() throws {
        let panels = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView+Panels.swift"))
        XCTAssertTrue(panels.contains("onCancel: { rightPanelRoute = .communityDetail(community.id) }"))
    }

    /// Sur iPad, une page du panneau (cloche, réglages, lien) REMPLACE la
    /// conversation au lieu de la couvrir : la vue est détruite, et le plateau
    /// des pièces jointes — écrit au brouillon seulement en arrière-plan —
    /// disparaissait en silence.
    func test_leavingTheConversation_savesTheTrayToTheDraft() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView.swift"))
        let leave = try XCTUnwrap(view.range(of: "private func conversationDidDisappear() {\n        composerText.flushPendingChange()\n"))
        XCTAssertTrue(view[leave.upperBound...].prefix(200).contains("persistDraftAttachmentsForBackground()"))
    }

    /// Bloquer, supprimer depuis la liste : la confirmation s'ancre sur un POINT de la liste — posée sur la liste
    /// entière, elle devenait sur iPad un popover présenté sur la conversation voisine, « Annuler » caché.
    func test_listConfirmations_areAnchoredOnAPoint() throws {
        // L'unité réunit la vue et ses extensions : toutes ses confirmations doivent être celles de l'ancre.
        let list = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift"))
        XCTAssertTrue(list.contains(".overlay { listConfirmationAnchor }"))
        let anchor = AppSourceGuard.stripComments(try String(contentsOf: try XCTUnwrap(
            AppSourceGuard.unitURLs("Meeshy/Features/Main/Views/ConversationListView.swift")
                .first { $0.lastPathComponent == "ConversationListView+ConfirmationAnchor.swift" }), encoding: .utf8))
        XCTAssertTrue(anchor.contains(".frame(width: 1, height: 1)"))
        XCTAssertEqual(anchor.components(separatedBy: ".confirmationDialog(").count - 1, 2)
        XCTAssertEqual(list.components(separatedBy: ".confirmationDialog(").count - 1, 2, "aucune confirmation posée sur la liste entière")
    }

    /// Glisser une rangée de conversation un peu trop loin, sur le composer d'à côté : l'identifiant brut ne se pose
    /// plus dans le message — la rangée porte une marque que le composer refuse.
    func test_aConversationRowDrag_isRefusedByTheComposer() {
        let row = ConversationDragItemProvider(conversationId: "65f0a1b2c3d4e5f6a7b8c9d0", title: "Alice", opensWindow: false)
        XCTAssertTrue(ComposerDropTargetModifier.carriesAConversationRow([row]))
        XCTAssertFalse(ComposerDropTargetModifier.carriesAConversationRow([NSItemProvider(object: "bonjour" as NSString)]))
    }

    /// Fenêtre principale et fenêtre détachée au premier plan à la fois : la scène qui tient la fenêtre CLÉ — celle où
    /// l'utilisateur agit — reçoit les feuilles et les mesures, jamais une scène prise au hasard de l'ensemble.
    @MainActor
    func test_twoForegroundScenes_theOneHoldingTheKeyWindowWins() {
        struct Scene { let name: String; let foreground: Bool; let key: Bool }
        let scenes = [Scene(name: "main", foreground: true, key: false), Scene(name: "detached", foreground: true, key: true),
                      Scene(name: "bg", foreground: false, key: false)]
        XCTAssertEqual(DeviceLayout.pickActive(scenes, isForeground: \.foreground, holdsKey: \.key)?.name, "detached")
        let noKey = [Scene(name: "bg", foreground: false, key: true), Scene(name: "main", foreground: true, key: false)]
        XCTAssertEqual(DeviceLayout.pickActive(noKey, isForeground: \.foreground, holdsKey: \.key)?.name, "main")
    }

    /// Une notification touchée pendant qu'une fenêtre détachée est devant : la fenêtre principale, où la navigation
    /// a lieu, revient d'abord — sinon la cible s'ouvrait dans une fenêtre invisible.
    func test_aTappedPush_bringsTheMainWindowForward_whenItIsNotInFront() throws {
        XCTAssertTrue(MainWindowRegistry.needsActivation(.background))
        XCTAssertTrue(MainWindowRegistry.needsActivation(.foregroundInactive))
        XCTAssertFalse(MainWindowRegistry.needsActivation(.foregroundActive))
        let handler = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Services/NotificationActionHandler.swift"))
        XCTAssertTrue(handler.contains("MainWindowRegistry.shared.bringPrimaryForwardIfHidden()"))
    }

    func test_resizableHandle_declaresColumnResizePointer() throws {
        let panels = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView+Panels.swift"))
        let handle = try XCTUnwrap(panels.range(of: "struct iPadResizableHandle: View {"))
        XCTAssertTrue(panels[handle.upperBound...].contains(".meeshyColumnResizePointer()"))
    }

    func test_conversationDrop_disabledAcceptsNoType() {
        XCTAssertEqual(ComposerDropTargetModifier.acceptedTypes(isEnabled: false), [])
        XCTAssertFalse(ComposerDropTargetModifier.acceptedTypes(isEnabled: true).isEmpty)
    }

    func test_acceptsDrops_onlyWhenTheComposerIsShown() {
        XCTAssertTrue(ComposerDropTargetModifier.acceptsDrops(
            isSelecting: false, isBlockedDirect: false, isClosed: false, isWriteRestricted: false, isPreview: false))
        XCTAssertFalse(ComposerDropTargetModifier.acceptsDrops(
            isSelecting: true, isBlockedDirect: false, isClosed: false, isWriteRestricted: false, isPreview: false))
        XCTAssertFalse(ComposerDropTargetModifier.acceptsDrops(
            isSelecting: false, isBlockedDirect: true, isClosed: false, isWriteRestricted: false, isPreview: false))
        XCTAssertFalse(ComposerDropTargetModifier.acceptsDrops(
            isSelecting: false, isBlockedDirect: false, isClosed: true, isWriteRestricted: false, isPreview: false))
        XCTAssertFalse(ComposerDropTargetModifier.acceptsDrops(
            isSelecting: false, isBlockedDirect: false, isClosed: false, isWriteRestricted: true, isPreview: false))
    }

    func test_acceptsDrops_neverInTheNotificationPreview() {
        XCTAssertFalse(ComposerDropTargetModifier.acceptsDrops(
            isSelecting: false, isBlockedDirect: false, isClosed: false, isWriteRestricted: false, isPreview: true))
    }

    func test_conversationView_hostsTheDropOnTheWholeBody_withTheComposerAllowance() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView.swift"))
        XCTAssertTrue(view.contains("ComposerDropTargetModifier("))
        XCTAssertTrue(view.contains("ingestRespectingGuestAllowance"))
    }
}
