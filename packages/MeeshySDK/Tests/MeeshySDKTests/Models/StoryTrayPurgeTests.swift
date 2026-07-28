import XCTest
@testable import MeeshySDK

/// Réconciliation locale des stories MORTES — celles que le cache du tray
/// continue de porter alors qu'elles n'existent plus côté serveur.
///
/// Deux façons de mourir, un seul geste de purge :
/// - **supprimée** par son auteur — portée par `deletedIds` (tombstones du
///   delta-sync `GET /posts/feed/stories?updatedSince`, ou event socket
///   `story:deleted` reçu en session) ;
/// - **expirée** — la fenêtre de 21 h est passée (`StoryItem.isExpired(at:)`).
///
/// Jusqu'ici l'expiry ne faisait que MASQUER (le tray filtre les groupes
/// entièrement expirés) et SAUTER (le lecteur skippe les slides mortes) : rien
/// n'effaçait jamais quoi que ce soit. Une story disparue du serveur restait
/// donc dans le cache local — illisible ET indéboulonnable — jusqu'à
/// l'expiration du cache 24 h ou un pull-to-refresh.
///
/// L'auteur garde l'accès à ses PROPRES stories expirées pour y lire réactions
/// et commentaires (spec 2026-06-23) : l'expiry ne purge donc jamais son
/// groupe. Une suppression explicite, elle, vaut pour tout le monde, auteur
/// compris — elle traduit une volonté, pas un délai.
final class StoryTrayPurgeTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_000_000)
    private let me = "user-me"

    // MARK: - Factories

    private func alive(_ id: String) -> StoryItem {
        StoryItem(id: id, content: nil,
                  createdAt: now.addingTimeInterval(-60),
                  expiresAt: now.addingTimeInterval(3600))
    }

    private func expired(_ id: String) -> StoryItem {
        StoryItem(id: id, content: nil,
                  createdAt: now.addingTimeInterval(-7200),
                  expiresAt: now.addingTimeInterval(-1))
    }

    private func group(_ id: String, _ stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id, username: id, avatarColor: "FFFFFF", stories: stories)
    }

    // MARK: - Expiry (auteurs tiers)

    func test_purge_removesExpiredStoryOfAnotherAuthor() {
        let groups = [group("alice", [expired("s1"), alive("s2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["s2"])
    }

    func test_purge_dropsGroupWhoseStoriesAllExpired() {
        let groups = [group("alice", [expired("s1")]), group("bob", [alive("s2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(purged.map(\.id), ["bob"])
    }

    func test_purge_keepsLiveStoriesUntouchedAndPreservesOrder() {
        let groups = [group("alice", [alive("s1")]), group("bob", [alive("s2"), alive("s3")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(purged.map(\.id), ["alice", "bob"])
        XCTAssertEqual(purged.flatMap { $0.stories.map(\.id) }, ["s1", "s2", "s3"])
    }

    // MARK: - Expiry (mes propres stories — spec 2026-06-23)

    func test_purge_keepsMyOwnExpiredStories() {
        let groups = [group(me, [expired("mine-1"), alive("mine-2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["mine-1", "mine-2"])
    }

    func test_purge_keepsMyGroupEvenWhenFullyExpired() {
        let groups = [group(me, [expired("mine-1")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(purged.map(\.id), [me])
    }

    func test_purge_withoutSession_appliesExpiryToEveryone() {
        // Pas d'utilisateur courant = aucune exception auteur à accorder.
        let groups = [group("alice", [expired("s1")])]
        XCTAssertTrue(groups.purgingDeadStories(currentUserId: nil, now: now).isEmpty)
    }

    // MARK: - Suppression explicite

    func test_purge_removesDeletedStoryOfAnotherAuthor() {
        let groups = [group("alice", [alive("s1"), alive("s2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, deletedIds: ["s1"], now: now)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["s2"])
    }

    func test_purge_removesMyOwnDeletedStory() {
        // Supprimée depuis un autre appareil : la volonté de l'auteur prime sur
        // l'exception d'expiry qui lui est accordée.
        let groups = [group(me, [alive("mine-1"), alive("mine-2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, deletedIds: ["mine-1"], now: now)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["mine-2"])
    }

    func test_purge_removesMyOwnExpiredStoryWhenExplicitlyDeleted() {
        let groups = [group(me, [expired("mine-1")])]
        let purged = groups.purgingDeadStories(currentUserId: me, deletedIds: ["mine-1"], now: now)
        XCTAssertTrue(purged.isEmpty)
    }

    func test_purge_dropsGroupEmptiedByDeletion() {
        let groups = [group("alice", [alive("s1")]), group("bob", [alive("s2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, deletedIds: ["s1"], now: now)
        XCTAssertEqual(purged.map(\.id), ["bob"])
    }

    func test_purge_ignoresUnknownDeletedIds() {
        let groups = [group("alice", [alive("s1")])]
        let purged = groups.purgingDeadStories(currentUserId: me, deletedIds: ["ghost"], now: now)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["s1"])
    }

    // MARK: - Retrait ciblé (now: nil)
    //
    // Un event socket `story:deleted` annonce UNE disparition. S'en servir pour
    // balayer aussi tout ce qui a expiré ferait retirer, sur un event ciblé,
    // des stories dont l'event ne parle pas.

    func test_purge_withoutClock_removesOnlyTheDeletedIds() {
        let groups = [group("alice", [expired("s1"), alive("s2")])]
        let purged = groups.purgingDeadStories(currentUserId: me, deletedIds: ["s2"], now: nil)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["s1"])
    }

    func test_purge_withoutClock_leavesExpiredStoriesAlone() {
        let groups = [group("alice", [expired("s1")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: nil)
        XCTAssertEqual(purged.first?.stories.map(\.id), ["s1"])
    }

    func test_deadStoryIds_withoutClock_listsOnlyDeletedIds() {
        let groups = [group("alice", [expired("s1"), alive("s2")])]
        XCTAssertEqual(groups.deadStoryIds(currentUserId: me, deletedIds: ["s2"], now: nil), ["s2"])
    }

    // MARK: - Invariants

    func test_purge_dropsAlreadyEmptyGroup() {
        // Un groupe sans story n'affiche rien et ne s'ouvre pas : le garder en
        // cache ne sert qu'à faire survivre une bulle morte.
        let groups = [group("alice", []), group("bob", [alive("s1")])]
        XCTAssertEqual(groups.purgingDeadStories(currentUserId: me, now: now).map(\.id), ["bob"])
    }

    func test_purge_isIdempotent() {
        let groups = [group("alice", [expired("s1"), alive("s2")]), group(me, [expired("mine-1")])]
        let once = groups.purgingDeadStories(currentUserId: me, now: now)
        let twice = once.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(once.map(\.id), twice.map(\.id))
        XCTAssertEqual(once.flatMap { $0.stories.map(\.id) }, twice.flatMap { $0.stories.map(\.id) })
    }

    func test_purge_nothingToRemove_returnsEquivalentTray() {
        let groups = [group("alice", [alive("s1")]), group(me, [alive("mine-1")])]
        let purged = groups.purgingDeadStories(currentUserId: me, now: now)
        XCTAssertEqual(purged.map(\.id), groups.map(\.id))
        XCTAssertEqual(purged.flatMap { $0.stories.map(\.id) }, groups.flatMap { $0.stories.map(\.id) })
    }

    // MARK: - Ids des stories retirées (pour libérer leurs médias du disque)

    func test_deadStoryIds_listsWhatThePurgeRemoves() {
        let groups = [group("alice", [expired("s1"), alive("s2")]), group(me, [expired("mine-1")])]
        let dead = groups.deadStoryIds(currentUserId: me, deletedIds: ["s2"], now: now)
        XCTAssertEqual(dead, ["s1", "s2"])
    }

    func test_deadStoryIds_emptyWhenTrayIsHealthy() {
        let groups = [group("alice", [alive("s1")])]
        XCTAssertTrue(groups.deadStoryIds(currentUserId: me, now: now).isEmpty)
    }
}
