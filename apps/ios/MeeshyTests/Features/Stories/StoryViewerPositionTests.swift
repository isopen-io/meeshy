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
}
