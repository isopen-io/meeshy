import XCTest
import CoreGraphics
import MeeshyUI
@testable import Meeshy

@MainActor
final class PostDetailReachAndVisibilityTests: XCTestCase {

    // MARK: PostReachFormatter.components — ce qu'il lui reste à décider
    //
    // 238i avait doté ce type d'un paramètre `locale` et de tests de propriété
    // sur les comptes. 239i les DÉPLACE plutôt qu'il ne les supprime : le rendu
    // d'un compte de portée appartient désormais à `ReachMetricLabel`, qui doit
    // recevoir l'entier — pour en dire l'abrégé à l'écran ET la valeur exacte à
    // VoiceOver. La couverture de locale vit donc dans
    // `ReachMetricLabelTests`, où la règle vit maintenant.
    //
    // Ce qui reste ici est ce que ce type seul décide : le pseudo, et le fait
    // que les statistiques soient réservées à l'auteur.

    func test_components_author_hasPseudoAndShowsStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: true)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertTrue(c.showsStats)
    }

    func test_components_nonAuthor_hasPseudobutHidesStats() {
        let c = PostReachFormatter.components(username: "marie", isAuthor: false)
        XCTAssertEqual(c.pseudo, "@marie")
        XCTAssertFalse(c.showsStats, "Les statistiques de portée sont privées : seul l'auteur les voit.")
    }

    func test_components_noUsername_pseudoNil() {
        XCTAssertNil(PostReachFormatter.components(username: "", isAuthor: false).pseudo)
        XCTAssertNil(PostReachFormatter.components(username: nil, isAuthor: false).pseudo)
    }

    /// Le pseudo ne dépend pas de la qualité d'auteur — un lecteur voit le
    /// `@pseudo` de l'auteur sans voir ses chiffres.
    func test_components_pseudoIsIndependentOfAuthorship() {
        XCTAssertEqual(PostReachFormatter.components(username: "marie", isAuthor: true).pseudo,
                       PostReachFormatter.components(username: "marie", isAuthor: false).pseudo)
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
