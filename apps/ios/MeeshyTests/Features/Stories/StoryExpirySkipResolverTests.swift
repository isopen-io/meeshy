import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// Un groupe dont la fin est expirée ne doit pas fermer le lecteur.
///
/// Le cache du tray a un TTL volontairement plus long que la fenêtre de
/// visibilité de 24 h (pour éviter de re-télécharger avatars et métadonnées
/// au démarrage à froid), donc le lecteur reçoit régulièrement des stories
/// déjà expirées côté serveur. Le comportement historique était : « toute la
/// fin du groupe est expirée → fermer le lecteur ». Pour un utilisateur qui
/// parcourt cinq auteurs, tomber sur un auteur dont les stories viennent
/// d'expirer éjectait de TOUTE la session de lecture — les auteurs suivants
/// devenaient inatteignables sans rouvrir le tray.
///
/// Règle retenue : on saute vers le prochain groupe qui a réellement quelque
/// chose à montrer, et on ne ferme qu'en dernier recours.
final class StoryExpirySkipResolverTests: XCTestCase {

    // MARK: - Fixtures

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeStory(id: String,
                           expired: Bool = false,
                           viewed: Bool = false) -> StoryItem {
        StoryItem(
            id: id,
            content: id,
            media: [],
            storyEffects: nil,
            createdAt: now.addingTimeInterval(-3600),
            expiresAt: now.addingTimeInterval(expired ? -60 : 3600),
            isViewed: viewed
        )
    }

    private func makeGroup(_ id: String, _ stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id,
                   username: "u-\(id)",
                   avatarColor: "#6366F1",
                   avatarURL: nil,
                   stories: stories)
    }

    // MARK: - Cas nominal

    func test_currentStoryNotExpired_staysPut() {
        let group = makeGroup("a", [makeStory(id: "s0"), makeStory(id: "s1")])

        let outcome = StoryExpirySkipResolver.resolve(
            groups: [group], groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .stay)
    }

    func test_someExpiredAhead_advancesWithinGroup() {
        let group = makeGroup("a", [
            makeStory(id: "s0", expired: true),
            makeStory(id: "s1", expired: true),
            makeStory(id: "s2")
        ])

        let outcome = StoryExpirySkipResolver.resolve(
            groups: [group], groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .advanceStory(index: 2))
    }

    // MARK: - Le défaut corrigé

    func test_wholeGroupExpired_advancesToNextGroup_insteadOfClosing() {
        let expiredGroup = makeGroup("a", [
            makeStory(id: "s0", expired: true),
            makeStory(id: "s1", expired: true)
        ])
        let liveGroup = makeGroup("b", [makeStory(id: "s2")])

        let outcome = StoryExpirySkipResolver.resolve(
            groups: [expiredGroup, liveGroup], groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(
            outcome, .advanceGroup(groupIndex: 1, storyIndex: 0),
            "Un auteur dont les stories viennent d'expirer ne doit pas éjecter de toute la session de lecture"
        )
    }

    /// Le groupe suivant peut être expiré lui aussi : on continue à chercher
    /// plutôt que de fermer au premier obstacle.
    func test_severalExpiredGroupsInARow_skipsToTheFirstLiveOne() {
        let groups = [
            makeGroup("a", [makeStory(id: "s0", expired: true)]),
            makeGroup("b", [makeStory(id: "s1", expired: true)]),
            makeGroup("c", [makeStory(id: "s2", expired: true), makeStory(id: "s3")])
        ]

        let outcome = StoryExpirySkipResolver.resolve(
            groups: groups, groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .advanceGroup(groupIndex: 2, storyIndex: 1))
    }

    /// Le groupe d'entrée suit la même règle que `entryStory` : première
    /// non-vue non-expirée, sinon première non-expirée.
    func test_nextGroupEntry_prefersFirstUnviewed() {
        let groups = [
            makeGroup("a", [makeStory(id: "s0", expired: true)]),
            makeGroup("b", [
                makeStory(id: "s1", viewed: true),
                makeStory(id: "s2", viewed: false)
            ])
        ]

        let outcome = StoryExpirySkipResolver.resolve(
            groups: groups, groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .advanceGroup(groupIndex: 1, storyIndex: 1))
    }

    // MARK: - Fermeture, en dernier recours seulement

    func test_lastGroupFullyExpired_closes() {
        let groups = [
            makeGroup("a", [makeStory(id: "s0")]),
            makeGroup("b", [makeStory(id: "s1", expired: true)])
        ]

        let outcome = StoryExpirySkipResolver.resolve(
            groups: groups, groupIndex: 1, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .close,
                       "Plus rien à montrer nulle part ⇒ fermer reste correct")
    }

    // MARK: - L'auteur garde ses propres stories expirées

    /// L'auteur revisite ses stories expirées pour lire réactions et
    /// commentaires (spec 2026-06-23). On ne saute pas, on ne ferme pas.
    func test_ownExpiredGroup_neverSkipped() {
        let mine = makeGroup("me", [makeStory(id: "s0", expired: true)])

        let outcome = StoryExpirySkipResolver.resolve(
            groups: [mine], groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .stay)
    }

    // MARK: - Bornes

    func test_emptyGroup_staysPut() {
        let outcome = StoryExpirySkipResolver.resolve(
            groups: [makeGroup("a", [])], groupIndex: 0, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .stay)
    }

    func test_groupIndexOutOfRange_staysPut() {
        let outcome = StoryExpirySkipResolver.resolve(
            groups: [], groupIndex: 3, storyIndex: 0,
            currentUserId: "me", now: now
        )

        XCTAssertEqual(outcome, .stay)
    }
}
