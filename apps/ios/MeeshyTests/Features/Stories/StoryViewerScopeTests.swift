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

// MARK: - Mes stories : seules les barres des stories EN COURS (#7887)

/// Directive porteur 2026-09-25 : « dans les barres de stories, il ne faut
/// indiquer que les stories en cours ». `StoryViewModel` garde exprès TOUTES
/// les stories de l'auteur dans son propre groupe (ouvrir une archive depuis
/// « Mes stories ») ; le lecteur traçait donc une barre par archive.
final class StoryViewerLiveStoriesTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func story(_ id: String, expiresIn seconds: TimeInterval) -> StoryItem {
        StoryItem(id: id, createdAt: now.addingTimeInterval(-3600),
                  expiresAt: now.addingTimeInterval(seconds))
    }

    private func group(_ id: String, _ stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id, username: "u-\(id)", avatarColor: "#6366F1",
                   avatarURL: nil, stories: stories)
    }

    func test_myGroup_keepsOnlyTheLiveStories() {
        let mine = group("me", [story("old1", expiresIn: -7200), story("live1", expiresIn: 600),
                                story("old2", expiresIn: -60), story("live2", expiresIn: 3600)])

        let scoped = StoryViewerScope.liveOnly([mine], authorId: "me", keeping: nil, now: now)

        XCTAssertEqual(scoped.first?.stories.map(\.id), ["live1", "live2"],
                       "une barre par story EN COURS, jamais une par archive")
    }

    func test_myGroup_keepsTheArchiveIOpenedExplicitly() {
        let mine = group("me", [story("old1", expiresIn: -7200), story("live1", expiresIn: 600)])

        let scoped = StoryViewerScope.liveOnly([mine], authorId: "me", keeping: "old1", now: now)

        XCTAssertEqual(scoped.first?.stories.map(\.id), ["old1", "live1"],
                       "ouvrir une archive depuis « Mes stories » la montre — et elle seule parmi les archives")
    }

    func test_otherAuthors_areLeftUntouched() {
        let theirs = group("them", [story("ref", expiresIn: -60), story("live", expiresIn: 600)])

        let scoped = StoryViewerScope.liveOnly([theirs], authorId: "me", keeping: nil, now: now)

        XCTAssertEqual(scoped.first?.stories.map(\.id), ["ref", "live"],
                       "les autres auteurs sont déjà filtrés par le modèle (droit de référence compris)")
    }

    func test_myGroup_withNothingLive_isKeptWhole_soTheViewerNeverOpensEmpty() {
        let mine = group("me", [story("old1", expiresIn: -7200)])

        let scoped = StoryViewerScope.liveOnly([mine], authorId: "me", keeping: nil, now: now)

        XCTAssertEqual(scoped.first?.stories.map(\.id), ["old1"])
    }

    func test_storyIndex_followsTheSameStoryIntoTheScopedGroup() {
        let original = group("me", [story("old1", expiresIn: -7200), story("live1", expiresIn: 600),
                                    story("live2", expiresIn: 900)])
        let scoped = StoryViewerScope.liveOnly([original], authorId: "me", keeping: nil, now: now)[0]

        XCTAssertEqual(StoryViewerScope.storyIndex(2, from: original, into: scoped), 1)
        XCTAssertEqual(StoryViewerScope.storyIndex(0, from: original, into: scoped), 0,
                       "une archive écartée retombe sur la première story en cours")
    }
}

// MARK: - StoryViewerContainer.isGroupReadyToPresent (Fix A — bouton commentaires manquant sur entrée notification)

/// `StoryViewerContainer.body` bascule sur `StoryViewerView` dès que
/// `viewModel.groupIndex(forUserId:)` existe — y compris à la TOUTE
/// PREMIÈRE évaluation, AVANT que `.task(id:)` n'ait eu la moindre chance
/// de tourner (une `Task` non structurée créée par `.task` ne s'exécute
/// jamais de façon synchrone avec le rendu qui l'a déclenchée). Ce verrou
/// pur garantit que, sur une entrée notification (`postId` connu), le
/// premier montage de `StoryViewerView` — et donc le tout premier
/// `.onAppear` de `StoryActionSidebarView`, qui gèle son rail d'actions une
/// fois pour toutes — voit toujours des données déjà fusionnées avec le
/// cache frais (voir `StoryViewModel.refreshFromCachedPostIfAvailable`).
final class StoryViewerContainerReadinessTests: XCTestCase {

    func test_isGroupReadyToPresent_groupMissing_neverReady() {
        XCTAssertFalse(StoryViewerContainer.isGroupReadyToPresent(
            groupExists: false, postId: nil, freshnessCheckedPostId: nil))
        XCTAssertFalse(StoryViewerContainer.isGroupReadyToPresent(
            groupExists: false, postId: "p1", freshnessCheckedPostId: "p1"))
    }

    func test_isGroupReadyToPresent_noPostId_readyAsSoonAsGroupExists() {
        XCTAssertTrue(StoryViewerContainer.isGroupReadyToPresent(
            groupExists: true, postId: nil, freshnessCheckedPostId: nil),
            "Non-notification entry points (tray tap, profile, feed…) must keep the instant cache-first fast path")
    }

    func test_isGroupReadyToPresent_notificationPostId_blocksUntilThatExactPostIdIsFreshnessChecked() {
        XCTAssertFalse(StoryViewerContainer.isGroupReadyToPresent(
            groupExists: true, postId: "p1", freshnessCheckedPostId: nil),
            "The author's group can already sit in the tray (a different story) while THIS post hasn't been freshness-checked yet")
        XCTAssertFalse(StoryViewerContainer.isGroupReadyToPresent(
            groupExists: true, postId: "p1", freshnessCheckedPostId: "some-other-post"))
    }

    func test_isGroupReadyToPresent_notificationPostId_readyOnceThatExactPostIdIsFreshnessChecked() {
        XCTAssertTrue(StoryViewerContainer.isGroupReadyToPresent(
            groupExists: true, postId: "p1", freshnessCheckedPostId: "p1"))
    }
}
