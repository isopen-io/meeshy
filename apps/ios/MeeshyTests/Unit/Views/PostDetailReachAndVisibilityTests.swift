import XCTest
import CoreGraphics
import MeeshyUI
@testable import Meeshy

@MainActor
final class PostDetailReachAndVisibilityTests: XCTestCase {

    // MARK: PostReachFormatter.components — comptes
    //
    // Les assertions ne NOMMENT plus les chaînes rendues (« 1.2k », « 3.4M ») :
    // depuis que les comptes viennent de `CompactCountLabel`, ce sont les données
    // CLDR de Foundation qui décident du séparateur, du suffixe et de la
    // précision. Les figer produirait une suite qui rougit à une mise à jour d'iOS
    // sans qu'aucun défaut n'existe. Ce qui se teste ici, c'est l'INVARIANT que
    // l'ancien code violait — la sensibilité à la locale — plus le contrat de
    // `components` lui-même, qui n'a jamais dépendu du rendu du nombre.

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")

    /// LA régression. L'abrégé fait maison rendait « 1.2k » dans TOUTES les
    /// langues : son invariance à la locale ÉTAIT le bug, donc la variance en est
    /// la preuve. Ce test échouait avant la délégation et passe après, sans
    /// nommer une seule chaîne CLDR.
    func test_components_countsFollowTheReadersLocale() {
        let fr = PostReachFormatter.components(username: "marie", isAuthor: true, viewCount: 1_500, impressionCount: 1_500, locale: french)
        let en = PostReachFormatter.components(username: "marie", isAuthor: true, viewCount: 1_500, impressionCount: 1_500, locale: english)
        XCTAssertNotEqual(fr.views, en.views, "1 500 ne s'abrège pas de la même façon en français et en anglais — le point décimal anglais y est un séparateur de MILLIERS.")
    }

    /// Le rendu délégué reste bien celui de la source unique : `components` ne
    /// doit pas reformater par-dessus.
    func test_components_countsMatchTheSingleSource() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: true, viewCount: 1_200, impressionCount: 3_400, locale: french)
        XCTAssertEqual(c.views, CompactCountLabel.text(1_200, locale: french))
        XCTAssertEqual(c.impressions, CompactCountLabel.text(3_400, locale: french))
    }

    /// Sous le millier, aucune abréviation nulle part : la ligne de portée reste
    /// le nombre exact.
    func test_components_belowOneThousand_rendersTheExactCount() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: true, viewCount: 999, impressionCount: 0, locale: english)
        XCTAssertEqual(c.views, "999")
        XCTAssertEqual(c.impressions, "0")
    }

    /// Les magnitudes restent distinguables — un abrégé qui rendrait la même
    /// chose pour 1 500 et 1 500 000 serait pire que pas d'abrégé du tout.
    func test_components_distinctMagnitudes_renderDistinctly() {
        let thousands = PostReachFormatter.components(username: nil, isAuthor: true, viewCount: 1_500, impressionCount: 0, locale: english)
        let millions = PostReachFormatter.components(username: nil, isAuthor: true, viewCount: 1_500_000, impressionCount: 0, locale: english)
        XCTAssertNotEqual(thousands.views, millions.views)
    }

    // MARK: PostReachFormatter.components — contrat auteur
    func test_components_author_hasPseudoAndStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: true, viewCount: 1_200, impressionCount: 3_400, locale: english)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertNotNil(c.views)
        XCTAssertNotNil(c.impressions)
    }

    func test_components_nonAuthor_hasPseudoNoStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: false, viewCount: 1_200, impressionCount: 3_400, locale: english)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertNil(c.views)
        XCTAssertNil(c.impressions)
    }

    func test_components_noUsername_pseudoNil() {
        let empty = PostReachFormatter.components(username: "", isAuthor: false, viewCount: 0, impressionCount: 0, locale: english)
        XCTAssertNil(empty.pseudo)
        let nilName = PostReachFormatter.components(username: nil, isAuthor: false, viewCount: 0, impressionCount: 0, locale: english)
        XCTAssertNil(nilName.pseudo)
    }

    // MARK: StoryCanvasVisibility.isVisible — named-space frame, 0 = top of viewport
    func test_isVisible_fullyAbove_isFalse() {
        XCTAssertFalse(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: -300, width: 300, height: 200), viewportHeight: 800))
    }

    func test_isVisible_fullyBelow_isFalse() {
        XCTAssertFalse(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: 900, width: 300, height: 200), viewportHeight: 800))
    }

    func test_isVisible_partiallyOnScreen_isTrue() {
        XCTAssertTrue(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: -50, width: 300, height: 200), viewportHeight: 800))
        XCTAssertTrue(StoryCanvasVisibility.isVisible(canvasFrame: CGRect(x: 0, y: 400, width: 300, height: 200), viewportHeight: 800))
    }

    // MARK: StoryDetailPlaybackPolicy.isPaused — truth table (RF3)
    // Shared by the native story canvas AND the STORY-repost canvas so the off-screen
    // + call-aware pause policy can't drift between the two paths.
    func test_storyDetailPlaybackPolicy_playsWhenVisibleAndNoCall() {
        XCTAssertFalse(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: false))
    }

    func test_storyDetailPlaybackPolicy_pausesWhenOffScreen() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false, callActive: false))
    }

    func test_storyDetailPlaybackPolicy_pausesDuringCall_evenWhenVisible() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: true))
    }

    func test_storyDetailPlaybackPolicy_pausesWhenOffScreenAndCall() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false, callActive: true))
    }
}
