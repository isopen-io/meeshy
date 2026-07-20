import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// `StoryViewerView.entryStory(of:)` décide de la slide d'entrée d'un groupe
/// voisin — même règle que le prefetch inter-groupes. Elle sert désormais
/// aussi de PRÉDICAT DE GATING pour les deux placeholders de transition entre
/// groupes (`neighborCubeGroup` et `presentGroupIntroIfNeeded`) : un groupe
/// dont `entryStory(of:)` retourne `nil` (toutes les stories vues+expirées, ou
/// toutes expirées) n'a RIEN à montrer — le placeholder ThumbHash ne doit
/// alors jamais apparaître pour lui (directive user : « on affiche
/// UNIQUEMENT quand le groupe suivant est l'utilisateur concerné et qu'il y a
/// effectivement des stories à afficher »).
///
/// `entryStory(of:)` est `static` (aucune dépendance à `self`/`@State`) —
/// testable directement sans instancier la View, pattern déjà établi dans ce
/// repo pour `StoryViewerView.computeLikedIds`/`viewerLanguageChain`.
final class StoryViewerNeighborEntryTests: XCTestCase {

    private let referenceNow = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeStory(
        id: String,
        isViewed: Bool,
        expiresAt: Date?
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: "story \(id)",
            media: [],
            storyEffects: nil,
            createdAt: referenceNow.addingTimeInterval(-3600),
            expiresAt: expiresAt,
            isViewed: isViewed
        )
    }

    private func makeGroup(stories: [StoryItem]) -> StoryGroup {
        StoryGroup(
            id: "author-1",
            username: "alice",
            avatarColor: "#6366F1",
            avatarURL: nil,
            stories: stories
        )
    }

    // MARK: - entryStory(of:)

    func test_entryStory_allExpired_returnsNil() {
        let expired = referenceNow.addingTimeInterval(-60)
        let group = makeGroup(stories: [
            makeStory(id: "s1", isViewed: false, expiresAt: expired),
            makeStory(id: "s2", isViewed: true, expiresAt: expired),
        ])
        XCTAssertNil(
            StoryViewerView.entryStory(of: group, now: referenceNow),
            "Un groupe dont TOUTES les stories sont expirées n'a rien à afficher — " +
            "entryStory doit retourner nil (gate pour les placeholders de transition)."
        )
    }

    func test_entryStory_hasUnviewedNonExpired_returnsFirstUnviewed() {
        let future = referenceNow.addingTimeInterval(3600)
        let group = makeGroup(stories: [
            makeStory(id: "s1", isViewed: true, expiresAt: future),
            makeStory(id: "s2", isViewed: false, expiresAt: future),
            makeStory(id: "s3", isViewed: false, expiresAt: future),
        ])
        XCTAssertEqual(
            StoryViewerView.entryStory(of: group, now: referenceNow)?.id, "s2",
            "Priorité à la première story NON-VUE non-expirée."
        )
    }

    func test_entryStory_allViewedButOneNonExpired_returnsFirstNonExpired() {
        let expired = referenceNow.addingTimeInterval(-60)
        let future = referenceNow.addingTimeInterval(3600)
        let group = makeGroup(stories: [
            makeStory(id: "s1", isViewed: true, expiresAt: expired),
            makeStory(id: "s2", isViewed: true, expiresAt: future),
        ])
        XCTAssertEqual(
            StoryViewerView.entryStory(of: group, now: referenceNow)?.id, "s2",
            "Aucune story non-vue → repli sur la première story non-expirée (même vue)."
        )
    }
}
