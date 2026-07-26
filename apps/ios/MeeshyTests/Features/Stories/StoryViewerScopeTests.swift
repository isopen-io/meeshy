import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// `StoryViewerContainer` présentait le lecteur par DEUX appels quasi
/// identiques de dix arguments — l'un pour le mode « un seul auteur », l'autre
/// pour la navigation inter-auteurs. Ils ont divergé : la branche mono-groupe
/// avait perdu `onReplyToStory`.
///
/// Conséquence concrète : ouvrir une story depuis une conversation passe
/// `singleGroup: true` ET fournit le callback de réponse (ConversationView),
/// mais le conteneur le jetait. `StoryActionRailPlan.showsReply` valant
/// `!isOwnStory && onReplyToStory != nil`, le bouton « Répondre » disparaissait
/// sans un mot — sur le point d'entrée qui en a le plus besoin.
///
/// La portée est désormais une fonction pure, et le lecteur n'a plus qu'UN
/// site de présentation : aucun argument ne peut être oublié d'un côté.
final class StoryViewerScopeTests: XCTestCase {

    private func makeGroup(_ id: String) -> StoryGroup {
        StoryGroup(id: id, username: "u-\(id)", avatarColor: "#6366F1",
                   avatarURL: nil, stories: [])
    }

    private var groups: [StoryGroup] { ["a", "b", "c"].map(makeGroup) }

    // MARK: - Mono-auteur

    func test_singleGroup_isolatesTheResolvedAuthorAtIndexZero() {
        let scope = StoryViewerScope.resolve(all: groups, resolvedIndex: 1, singleGroup: true)

        XCTAssertEqual(scope.groups.map(\.id), ["b"])
        XCTAssertEqual(scope.currentIndex, 0,
                       "isolé, l'auteur devient le seul groupe : son index retombe à 0")
    }

    // MARK: - Navigation inter-auteurs

    func test_multiGroup_keepsEveryAuthorAndPointsAtTheResolvedOne() {
        let scope = StoryViewerScope.resolve(all: groups, resolvedIndex: 2, singleGroup: false)

        XCTAssertEqual(scope.groups.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(scope.currentIndex, 2)
    }

    // MARK: - Bornes

    /// Un index hors bornes ne doit pas faire tomber le lecteur : on retombe
    /// sur la navigation complète, qui reste lisible.
    func test_singleGroup_withOutOfRangeIndex_fallsBackToAllGroups() {
        let scope = StoryViewerScope.resolve(all: groups, resolvedIndex: 7, singleGroup: true)

        XCTAssertEqual(scope.groups.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(scope.currentIndex, 0)
    }

    func test_emptyGroups_yieldsEmptyScope() {
        let scope = StoryViewerScope.resolve(all: [], resolvedIndex: 0, singleGroup: true)

        XCTAssertTrue(scope.groups.isEmpty)
        XCTAssertEqual(scope.currentIndex, 0)
    }
}
