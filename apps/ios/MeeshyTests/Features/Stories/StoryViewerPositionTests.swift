import XCTest
@testable import Meeshy

/// Balayage des index — le lecteur de stories suit la story MONTRÉE, pas son
/// rang, quand le plateau bouge sous lui.
final class StoryViewerPositionTests: XCTestCase {

    private typealias Shape = StoryViewerPosition.GroupShape
    private typealias Landing = StoryViewerPosition.Landing

    private func shape(_ id: String, _ stories: [String]) -> Shape { Shape(id: id, storyIds: stories) }

    /// Plateau [A, B, C], lecteur sur B ; X publie et passe devant. Le rang 1
    /// montrait alors A ou X à la place de B.
    func test_reanchor_anAuthorInsertedBefore_followsTheShownStory() {
        let old = [shape("A", ["a1"]), shape("B", ["b1", "b2"]), shape("C", ["c1"])]
        let new = [shape("X", ["x1"]), shape("A", ["a1"]), shape("B", ["b1", "b2"]), shape("C", ["c1"])]
        XCTAssertEqual(StoryViewerPosition.reanchor(from: old, to: new, at: Landing(group: 1, story: 1)),
                       Landing(group: 2, story: 1))
    }

    /// b0 supprimée par son auteur : la position 1 sautait b1 pour montrer b2.
    func test_reanchor_anEarlierStoryDeleted_staysOnTheShownStory() {
        let old = [shape("B", ["b0", "b1", "b2"])]
        let new = [shape("B", ["b1", "b2"])]
        XCTAssertEqual(StoryViewerPosition.reanchor(from: old, to: new, at: Landing(group: 0, story: 1)),
                       Landing(group: 0, story: 0))
    }

    /// La story montrée elle-même disparaît : la suivante prend sa place.
    func test_reanchor_theShownStoryDeleted_landsOnItsSuccessor() {
        let old = [shape("B", ["b0", "b1", "b2"])]
        let new = [shape("B", ["b0", "b2"])]
        XCTAssertEqual(StoryViewerPosition.reanchor(from: old, to: new, at: Landing(group: 0, story: 1)),
                       Landing(group: 0, story: 1))
    }

    /// L'auteur entier disparaît : celui qui occupe son rang (borné), à sa première story.
    func test_reanchor_theShownAuthorPurged_landsOnTheAuthorNowAtItsRank() {
        let old = [shape("A", ["a1"]), shape("B", ["b1"]), shape("C", ["c1", "c2"])]
        let new = [shape("A", ["a1"])]
        XCTAssertEqual(StoryViewerPosition.reanchor(from: old, to: new, at: Landing(group: 2, story: 1)),
                       Landing(group: 0, story: 0))
        XCTAssertNil(StoryViewerPosition.reanchor(from: old, to: [], at: Landing(group: 0, story: 0)))
    }

    /// [A, B, C, D] sur D (rang 3) ; B et C purgés d'un coup → [D, A]. « Auteur
    /// précédent » lisait `groups[2]` : hors bornes, plantage.
    func test_previousGroupLanding_afterTheListShrank_staysInBounds() {
        XCTAssertEqual(StoryViewerPosition.previousGroupLanding(storyCounts: [1, 2], from: 3), Landing(group: 1, story: 1))
        XCTAssertEqual(StoryViewerPosition.previousGroupLanding(storyCounts: [1, 2], from: 1), Landing(group: 0, story: 0))
        XCTAssertNil(StoryViewerPosition.previousGroupLanding(storyCounts: [1, 2], from: 0))
        XCTAssertNil(StoryViewerPosition.previousGroupLanding(storyCounts: [], from: 3))
    }

    /// Plus aucun `groups[currentGroupIndex]` après un `-= 1` dans le lecteur.
    func test_storyViewer_noLongerSubscriptsAfterDecrementingTheGroup() throws {
        for path in ["Meeshy/Features/Main/Views/StoryViewerView.swift",
                     "Meeshy/Features/Main/Views/StoryViewerView+Navigation.swift",
                     "Meeshy/Features/Main/Views/StoryViewerView+Content.swift"] {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
            XCTAssertFalse(source.contains("currentGroupIndex -= 1"), path)
        }
    }

    /// Passage à l'auteur SUIVANT : la garde `currentGroupIndex < groups.count - 1` se lisait au tap, la closure
    /// tournait 0,38 s plus tard (fin de l'animation) sur la copie de `groups` du tap avec l'index VIVANT — qu'un
    /// `story:created` venu se trier devant avait recalé (`reanchorPosition`). `groups[currentGroupIndex]` après
    /// `+= 1` sortait du tableau : plantage.
    func test_nextGroupIndex_staysInsideTheListTheTransitionHolds() {
        XCTAssertEqual(StoryViewerPosition.nextGroupIndex(after: 0, groupCount: 3), 1)
        XCTAssertEqual(StoryViewerPosition.nextGroupIndex(after: 1, groupCount: 3), 2)
        XCTAssertNil(StoryViewerPosition.nextGroupIndex(after: 2, groupCount: 3), "recalé sur le dernier : rien après")
        XCTAssertNil(StoryViewerPosition.nextGroupIndex(after: 5, groupCount: 3), "recalé hors de la liste tenue")
        XCTAssertNil(StoryViewerPosition.nextGroupIndex(after: 0, groupCount: 0))
    }

    /// Plus aucun `groups[currentGroupIndex]` après un `+= 1` : les deux sites (tap / avance auto, fin de
    /// balayage) atterrissent par `landOnNextGroup()`, borné.
    func test_storyViewer_noLongerSubscriptsAfterIncrementingTheGroup() throws {
        for path in ["Meeshy/Features/Main/Views/StoryViewerView.swift",
                     "Meeshy/Features/Main/Views/StoryViewerView+Navigation.swift",
                     "Meeshy/Features/Main/Views/StoryViewerView+Content.swift"] {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
            XCTAssertFalse(source.contains("currentGroupIndex += 1"), path)
        }
    }

    /// Le groupe qui a ouvert le lecteur disparaît pendant qu'on regarde un
    /// autre auteur : le conteneur tombait sur un spinner que rien ne relançait.
    func test_container_closesWhenItsGroupVanishesAfterPresenting() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerContainer.swift"))
        XCTAssertTrue(source.contains(".onAppear { hasPresentedViewer = true }"))
        XCTAssertTrue(source.contains("} else if hasPresentedViewer {"))
    }

    /// Une notification de story ouvre CETTE story, sur iPhone comme sur iPad —
    /// pas la première non vue de l'auteur.
    func test_pushedStoryRoute_opensTheExactPost_onIPhoneAndIPad() throws {
        for path in ["Meeshy/Features/Main/Views/RootView.swift", "Meeshy/Features/Main/Views/iPadRootView+Navigation.swift"] {
            let source = AppSourceGuard.stripComments(try String(contentsOf: try XCTUnwrap(
                AppSourceGuard.unitURLs(path).first), encoding: .utf8))
            let route = try XCTUnwrap(source.range(of: "routeName.hasPrefix(\"storyDetail:\")"), path)
            let tail = String(source[route.upperBound...].prefix(600))
            XCTAssertTrue(tail.contains("postId: postId"), path)
        }
    }
}
