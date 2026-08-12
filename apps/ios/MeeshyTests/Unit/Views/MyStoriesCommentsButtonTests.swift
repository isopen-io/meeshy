import XCTest
@testable import Meeshy

// MARK: - MyStoriesCommentsButtonTests
//
// Task 8 : ouverture de `CommentsSheetView` (celle des posts, réutilisée telle
// quelle) sur les commentaires d'une story de « Mes stories ».
//
// NOTE 2026-08-02 : les 7 gardes de source qui épinglaient l'ordre
// œil/bulle/ellipsis et les actions VoiceOver de `MyStoryRow` ont été retirées
// avec la rangée elle-même — morte depuis la migration en grille (70f74364c),
// elles validaient une vue que plus rien ne rendait pendant que le câblage
// VIVANT (`MyStoryCard`/`MyStoryActionBar`, `handlePublishedGlyph`) restait
// sans garde. Le chemin vivant est couvert par les tests de
// `MyStoryCardPresentation` (glyphes par kind) ; seul reste ici le résolveur
// cache-first, toujours branché dans `MyStoriesView.openComments`.
//
// `@MainActor` : `MyStoriesCommentsResolver` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
// annoté y est donc main-actor-isolé par défaut.
@MainActor
final class MyStoriesCommentsButtonTests: XCTestCase {

    func test_shouldUseCache_cachedPostPresent_returnsTrue() {
        XCTAssertTrue(MyStoriesCommentsResolver.shouldUseCache(cachedPost: Optional(1)))
    }

    func test_shouldUseCache_cachedPostAbsent_returnsFalse() {
        XCTAssertFalse(MyStoriesCommentsResolver.shouldUseCache(cachedPost: Optional<Int>.none))
    }
}
