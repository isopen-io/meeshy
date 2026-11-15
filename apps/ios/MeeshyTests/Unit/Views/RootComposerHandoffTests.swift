import XCTest
@testable import Meeshy

/// Une fenêtre d'iPad passée de compact à regular démonte la racine qui
/// portait le composer de story : chaque racine a son `StoryViewModel`, et la
/// couverture du composer partait avec. Le brouillon annoncé au démontage est
/// tenu AU-DESSUS des racines, et seule la racine qui ne présente pas déjà le
/// composer le rouvre — la sortante le présente encore, l'entrante non, quel
/// que soit l'ordre de montage.
@MainActor
final class RootComposerHandoffTests: XCTestCase {

    private let outgoing = UUID(), incoming = UUID()

    func test_theIncomingRoot_reopensTheTornDownDraft_once() {
        let handoff = RootNavigationHandoff()
        handoff.rootAppeared(incoming)
        handoff.noteComposerTornDown(draftId: "d1")
        XCTAssertEqual(handoff.takeComposerToReopen(presentingComposer: false, root: incoming), "d1")
        XCTAssertNil(handoff.takeComposerToReopen(presentingComposer: false, root: incoming), "rouvert une fois")
    }

    /// La racine sortante, détachée mais dont un rappel tourne encore, ne
    /// consomme jamais le brouillon dans une hiérarchie morte.
    func test_aDetachedRoot_neverTakesIt_whateverTheMountOrder() {
        let handoff = RootNavigationHandoff()
        handoff.rootAppeared(outgoing)
        handoff.rootAppeared(incoming)
        handoff.rootDisappeared(outgoing)
        handoff.noteComposerTornDown(draftId: "d0")
        XCTAssertNil(handoff.takeComposerToReopen(presentingComposer: false, root: outgoing))
        XCTAssertEqual(handoff.takeComposerToReopen(presentingComposer: false, root: incoming), "d0")
    }

    /// La racine sortante présente encore le composer : elle ne prend rien, et
    /// l'entrante, montée après, trouve le brouillon.
    func test_theOutgoingRoot_neverTakesIt() {
        let handoff = RootNavigationHandoff()
        handoff.rootAppeared(outgoing)
        handoff.noteComposerTornDown(draftId: "d2")
        XCTAssertNil(handoff.takeComposerToReopen(presentingComposer: true, root: outgoing))
        handoff.rootAppeared(incoming)
        XCTAssertEqual(handoff.takeComposerToReopen(presentingComposer: false, root: incoming), "d2")
    }

    /// Le composer recouvert par sa propre caméra puis revenu : l'annonce ne
    /// vaut plus — un redimensionnement plus tard ne le rouvrirait pas à tort.
    func test_theComposerComingBack_clearsTheAnnouncement() {
        let handoff = RootNavigationHandoff()
        handoff.rootAppeared(incoming)
        handoff.noteComposerTornDown(draftId: "d3")
        handoff.composerAppeared()
        XCTAssertNil(handoff.takeComposerToReopen(presentingComposer: false, root: incoming))
    }

    func test_theRoots_wireTheHandoff() throws {
        let adaptive = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/AdaptiveRootView.swift"))
        XCTAssertTrue(adaptive.contains("for: .storyComposerTornDown"))
        XCTAssertTrue(adaptive.contains("for: .storyComposerAppeared"))
        let shared = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift"))
        XCTAssertTrue(shared.contains("presentingComposer: storyViewModel.showStoryComposer, root: rootToken)"))
        XCTAssertTrue(shared.contains("navigationHandoff?.rootAppeared(rootToken)"))
        XCTAssertTrue(shared.contains("navigationHandoff?.rootDisappeared(rootToken)"))
        XCTAssertTrue(shared.contains("storyViewModel.openComposer(resumingDraftId:"))
    }
}
