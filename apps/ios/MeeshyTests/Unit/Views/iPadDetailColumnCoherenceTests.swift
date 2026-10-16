import XCTest
@testable import Meeshy

/// iPad ↔ iPhone : la colonne de détail ne montre jamais une conversation
/// morte. Sur iPhone, la liste n'est pas visible pendant qu'un fil est ouvert,
/// et `dismiss()` dépile l'écran ; sur iPad, la liste reste à côté du fil, et le
/// fil est posé dans la colonne de droite, hors `NavigationStack`, où
/// `dismiss()` est un no-op silencieux (`PanelBackAction`).
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
        let drop = try XCTUnwrap(vm.range(of: "private func dropConversationLeftByMe("))
        XCTAssertTrue(
            vm[drop.upperBound...].prefix(400).contains("conversationLeavesDetail.send(conversationId)"),
            "quitter, être retiré ou banni (socket) referme aussi la colonne"
        )
    }

    // MARK: - Accès retiré : le fil se referme aussi sur iPad

    func test_accessRevoked_leavesThroughTheRouter_notADismissThatIsANoOpOnIPad() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView.swift"))
        let handler = try XCTUnwrap(view.range(of: ".adaptiveOnChange(of: viewModel.accessRevoked)"))
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
        XCTAssertTrue(view.contains(".adaptiveOnChange(of: router.pendingOpenSearch)"))
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
        let leave = try XCTUnwrap(view.range(of: ".onDisappear {\n                composerText.flushPendingChange()\n"))
        XCTAssertTrue(view[leave.upperBound...].prefix(200).contains("persistDraftAttachmentsForBackground()"))
    }
}
