import XCTest
@testable import Meeshy

/// Un SEUL overlay de mood par présentation.
///
/// `.withStatusBubble()` est appliqué sur une quinzaine de surfaces, dont
/// certaines IMBRIQUÉES : `StoryTrayView` vit dans `ConversationListView`, et les
/// deux le posaient. Chaque hôte mesure SON conteneur et dessine dans SON
/// repère : les deux bulles apparaissaient donc à l'écran, décalées l'une de
/// l'autre — c'est le défaut rapporté sur la liste de conversations.
///
/// La frontière est la PRÉSENTATION, pas la hiérarchie de vues : une `.sheet` a
/// son propre hôte et l'overlay du présentateur y est invisible, donc elle doit
/// rendre le sien. Un simple drapeau booléen aurait privé les feuilles de bulle,
/// puisque les `EnvironmentValues` traversent les présentations.
final class StatusBubbleHostScopeTests: XCTestCase {

    private func shouldRender(host: Bool?, isPresented: Bool) -> Bool {
        StatusBubbleOverlayModifier.shouldRenderOverlay(
            hostPresentation: host, isPresented: isPresented
        )
    }

    func test_noAncestorHost_rendersTheOverlay() {
        XCTAssertTrue(shouldRender(host: nil, isPresented: false))
    }

    func test_nestedHostInSamePresentation_doesNotRenderASecondOverlay() {
        XCTAssertFalse(
            shouldRender(host: false, isPresented: false),
            "StoryTrayView dans ConversationListView : le second hôte doit rester muet, " +
            "sinon deux bulles s'affichent côte à côte."
        )
    }

    func test_sheetPresentedFromAHostedScreen_rendersItsOwnOverlay() {
        XCTAssertTrue(
            shouldRender(host: false, isPresented: true),
            "Une feuille a son propre hôte de présentation : l'overlay du présentateur " +
            "y est invisible, elle doit donc rendre le sien."
        )
    }

    func test_nestedHostInsideASheet_doesNotRenderASecondOverlay() {
        XCTAssertFalse(shouldRender(host: true, isPresented: true))
    }
}
