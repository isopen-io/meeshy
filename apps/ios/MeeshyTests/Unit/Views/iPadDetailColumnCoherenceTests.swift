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
        XCTAssertTrue(root.contains(".onReceive(conversationViewModel.conversationRemoved)"))
        XCTAssertTrue(root.contains("iPadSelectionRule.closesDetail("))

        let vm = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift"))
        let drop = try XCTUnwrap(vm.range(of: "private func dropConversationLeftByMe("))
        XCTAssertTrue(
            vm[drop.upperBound...].prefix(400).contains("conversationRemoved.send(conversationId)"),
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
}
