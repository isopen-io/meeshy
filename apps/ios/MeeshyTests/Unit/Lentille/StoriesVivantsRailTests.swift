import XCTest
import MeeshySDK
@testable import Meeshy

/// LWS-6 (contrat §4.3) — `StoriesVivantsRail`, vue pure. Logique testable
/// extraite dans `LentilleRailPolicy` (troncature `≤ 6`, masquage si vide),
/// exercée directement sans framework de rendu SwiftUI — même patron que
/// `LentilleStickerTests`/`SectionScrollPillTests`.
final class StoriesVivantsRailTests: XCTestCase {

    private func makeEntries(_ count: Int) -> [LentilleRailEntry] {
        (1...count).map { LentilleRailEntry(id: "entry-\($0)", displayName: "Entry \($0)") }
    }

    // MARK: - Masqué si vide

    func test_shouldRender_emptyEntries_isFalse() {
        XCTAssertFalse(LentilleRailPolicy.shouldRender([]))
    }

    func test_shouldRender_nonEmptyEntries_isTrue() {
        XCTAssertTrue(LentilleRailPolicy.shouldRender(makeEntries(1)))
    }

    func test_visibleEntries_emptyInput_isEmpty() {
        XCTAssertTrue(LentilleRailPolicy.visibleEntries([]).isEmpty)
    }

    // MARK: - `≤ 6` entrées (LentilleMetrics.Rail.maxEntries, §4.3)

    func test_visibleEntries_fewerThanMax_returnsAllUnchanged() {
        let entries = makeEntries(3)
        XCTAssertEqual(LentilleRailPolicy.visibleEntries(entries), entries)
    }

    func test_visibleEntries_exactlyMax_returnsAllUnchanged() {
        let entries = makeEntries(LentilleMetrics.Rail.maxEntries)
        XCTAssertEqual(LentilleRailPolicy.visibleEntries(entries), entries)
    }

    func test_visibleEntries_moreThanMax_truncatesToMaxEntries() {
        let entries = makeEntries(10)
        let visible = LentilleRailPolicy.visibleEntries(entries)
        XCTAssertEqual(visible.count, LentilleMetrics.Rail.maxEntries)
    }

    func test_visibleEntries_moreThanMax_keepsTheFirstEntriesInOrder() {
        let entries = makeEntries(10)
        let visible = LentilleRailPolicy.visibleEntries(entries)
        XCTAssertEqual(visible, Array(entries.prefix(LentilleMetrics.Rail.maxEntries)))
        XCTAssertEqual(visible.first?.id, "entry-1")
    }

    func test_shouldRender_moreThanMaxEntries_isTrue() {
        XCTAssertTrue(LentilleRailPolicy.shouldRender(makeEntries(10)))
    }

    // MARK: - Anneau vu / non-vu (régression : le rail peignait TOUT en gris)
    //
    // `StoryRingCell` rend l'état depuis toujours
    // (`storyState: group.hasUnviewed ? .unread : .read`). Le rail, lui,
    // n'a jamais reçu `hasUnviewed` : son anneau ne connaissait que
    // `isLive`, toujours `false` faute de modèle d'appel — donc gris pour
    // tout le monde, story fraîche comprise. Ce retrait n'est documenté
    // nulle part comme voulu : c'est une perte en route, pas un arbitrage.

    func test_ringIsAccented_whenTheGroupHasUnviewedStories() {
        let entry = LentilleRailEntry(id: "u1", displayName: "Ana", hasUnviewed: true)
        XCTAssertTrue(
            LentilleRailPolicy.ringIsAccented(entry),
            "Une story non vue doit ACCENTUER l'anneau — c'est la seule affordance qui " +
            "distingue « il y a du neuf » de « déjà tout vu »."
        )
    }

    func test_ringIsMuted_whenEverythingHasBeenViewed() {
        let entry = LentilleRailEntry(id: "u1", displayName: "Ana", hasUnviewed: false)
        XCTAssertFalse(
            LentilleRailPolicy.ringIsAccented(entry),
            "Tout vu ⇒ anneau SOURD. La pastille reste une porte ouverte, mais elle " +
            "n'appelle plus."
        )
    }

    func test_ringIsAccented_forALiveEntry_evenWhenEverythingWasViewed() {
        let entry = LentilleRailEntry(id: "u1", displayName: "Ana", hasUnviewed: false, isLive: true)
        XCTAssertTrue(
            LentilleRailPolicy.ringIsAccented(entry),
            "Un direct en cours accentue l'anneau indépendamment des stories — les deux " +
            "causes vivent dans UNE règle, jamais dans deux couleurs calculées ailleurs."
        )
    }

    // MARK: - Budget d'animation : ≤ maxEntries ressorts `repeatForever`

    /// Chaque humeur monte une pastille qui « respire » (`repeatForever`).
    /// La borne du rail est donc AUSSI un budget d'animation : la troncature
    /// doit tenir même quand tout le monde a posé un mood.
    func test_visibleEntries_boundTheNumberOfAnimatedMoodBadges() {
        let entries = (1...20).map {
            LentilleRailEntry(id: "u\($0)", displayName: "U\($0)", moodEmoji: "\u{1F642}")
        }
        let animated = LentilleRailPolicy.visibleEntries(entries).filter { $0.moodEmoji != nil }
        XCTAssertEqual(animated.count, LentilleMetrics.Rail.maxEntries)
    }

    // MARK: - Mappage (ConversationListView) — filtre

    private func makeStory(id: String = "story-1", viewed: Bool = false, expired: Bool = false) -> StoryItem {
        StoryItem(
            id: id,
            createdAt: Date(timeIntervalSince1970: 1_000_000),
            expiresAt: Date(timeIntervalSince1970: expired ? 1_000_100 : 9_000_000_000),
            isViewed: viewed
        )
    }

    private func makeGroup(
        id: String,
        username: String = "Ana",
        avatarColor: String = "#123456",
        avatarURL: String? = nil,
        stories: [StoryItem]? = nil
    ) -> StoryGroup {
        StoryGroup(
            id: id,
            username: username,
            avatarColor: avatarColor,
            avatarURL: avatarURL,
            stories: stories ?? [makeStory()]
        )
    }

    private var referenceNow: Date { Date(timeIntervalSince1970: 1_000_500) }

    func test_railStoryGroups_dropsMyOwnGroup() {
        let groups = [makeGroup(id: "me"), makeGroup(id: "other")]
        let kept = ConversationListView.railStoryGroups(groups, excludingUserId: "me", now: referenceNow)
        XCTAssertEqual(kept.map(\.id), ["other"])
    }

    func test_railStoryGroups_dropsFullyExpiredGroups() {
        let groups = [
            makeGroup(id: "expired", stories: [makeStory(expired: true)]),
            makeGroup(id: "live")
        ]
        let kept = ConversationListView.railStoryGroups(groups, excludingUserId: "me", now: referenceNow)
        XCTAssertEqual(
            kept.map(\.id), ["live"],
            "Un groupe entièrement expiré ouvrirait puis refermerait le viewer " +
            "(tap-puis-flash) — même filtre que le tray."
        )
    }

    func test_railStoryGroups_keepsAGroupWithAtLeastOneLiveStory() {
        let mixed = makeGroup(id: "mixed", stories: [makeStory(id: "a", expired: true), makeStory(id: "b")])
        let kept = ConversationListView.railStoryGroups([mixed], excludingUserId: "me", now: referenceNow)
        XCTAssertEqual(kept.map(\.id), ["mixed"])
    }

    // MARK: - Mappage — la preview, le mood, l'état vu

    func test_railEntry_carriesTheCoverResolvedByTheSharedHelper() {
        let entry = ConversationListView.railEntry(
            group: makeGroup(id: "u1", avatarURL: "https://cdn/avatar.jpg"),
            coverURL: "file:///caches/cover-u1.jpg",
            moodEmoji: nil
        )
        XCTAssertEqual(
            entry.previewURL, "file:///caches/cover-u1.jpg",
            "La pastille doit montrer la STORY, pas l'avatar : c'est l'exigence du rail " +
            "(déjà tenue par le tray via `latestStoryThumbnailURL`)."
        )
    }

    func test_railEntry_fallsBackToTheAuthorAvatar_whenNoCoverResolves() {
        let entry = ConversationListView.railEntry(
            group: makeGroup(id: "u1", avatarURL: "https://cdn/avatar.jpg"),
            coverURL: nil,
            moodEmoji: nil
        )
        XCTAssertEqual(entry.previewURL, "https://cdn/avatar.jpg")
    }

    func test_railEntry_propagatesTheAuthorsMood() {
        let entry = ConversationListView.railEntry(
            group: makeGroup(id: "u1"),
            coverURL: nil,
            moodEmoji: "\u{1F60E}"
        )
        XCTAssertEqual(entry.moodEmoji, "\u{1F60E}")
    }

    func test_railEntry_withoutMood_carriesNoBadge() {
        let entry = ConversationListView.railEntry(group: makeGroup(id: "u1"), coverURL: nil, moodEmoji: nil)
        XCTAssertNil(entry.moodEmoji)
    }

    func test_railEntry_carriesTheUnviewedStateOfTheGroup() {
        let fresh = ConversationListView.railEntry(
            group: makeGroup(id: "u1", stories: [makeStory(viewed: false)]),
            coverURL: nil,
            moodEmoji: nil
        )
        let seen = ConversationListView.railEntry(
            group: makeGroup(id: "u2", stories: [makeStory(viewed: true)]),
            coverURL: nil,
            moodEmoji: nil
        )
        XCTAssertTrue(fresh.hasUnviewed)
        XCTAssertFalse(seen.hasUnviewed)
    }

    func test_railEntry_carriesTheAuthorAccentColor_soTheFallbackIsNeverAnEmptyCircle() {
        let entry = ConversationListView.railEntry(
            group: makeGroup(id: "u1", avatarColor: "#FF8800", avatarURL: nil),
            coverURL: nil,
            moodEmoji: nil
        )
        XCTAssertEqual(
            entry.accentColor, "#FF8800",
            "Sans teinte, un auteur sans avatar NI couverture rendait un cercle vide — " +
            "le défaut le plus visible du rail."
        )
    }

    func test_railEntry_keepsTheGroupIdentity() {
        let entry = ConversationListView.railEntry(
            group: makeGroup(id: "u1", username: "Ana", avatarURL: "https://cdn/a.jpg"),
            coverURL: "file:///cover.jpg",
            moodEmoji: nil
        )
        XCTAssertEqual(entry.id, "u1")
        XCTAssertEqual(entry.displayName, "Ana")
        XCTAssertEqual(
            entry.avatarURL, "https://cdn/a.jpg",
            "L'avatar reste porté À CÔTÉ de la couverture : il est l'identité de la " +
            "personne, la couverture n'est que ce qu'elle publie."
        )
    }

    // MARK: - Mappage — la pastille « moi »

    func test_railSelfEntry_prefersTheCoverOfMyActiveStory() {
        let entry = ConversationListView.railSelfEntry(
            displayName: "Moi",
            avatarURL: "https://cdn/me.jpg",
            accentColor: "#00AAFF",
            coverURL: "file:///caches/cover-me.jpg",
            hasActiveStory: true,
            moodEmoji: "\u{1F60E}",
            actionLabel: "Gérer"
        )
        XCTAssertEqual(entry.previewURL, "file:///caches/cover-me.jpg")
        XCTAssertEqual(entry.accentColor, "#00AAFF")
        XCTAssertTrue(entry.hasActiveStory)
    }

    func test_railSelfEntry_fallsBackToMyAvatar_whenIHaveNoStory() {
        let entry = ConversationListView.railSelfEntry(
            displayName: "Moi",
            avatarURL: "https://cdn/me.jpg",
            accentColor: "#00AAFF",
            coverURL: nil,
            hasActiveStory: false,
            moodEmoji: nil,
            actionLabel: nil
        )
        XCTAssertEqual(entry.previewURL, "https://cdn/me.jpg")
        XCTAssertFalse(entry.hasActiveStory)
    }
}
