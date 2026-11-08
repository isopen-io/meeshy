import XCTest
import MeeshySDK
@testable import Meeshy

/// #16321 — **un réel à plusieurs médias dit combien il en porte par ses
/// points, jamais par un compteur « n / M ».**
///
/// Recette porteur du 2026-11-05 : le carrousel d'images d'un réel dessinait
/// ses points ○ ○ ○ ET, au coin haut, la pastille « 2 / 3 » — deux fois le
/// même fait. La règle ci-dessous élit UN indicateur par réel : les points du
/// carrousel quand le carrousel les dessine, des points tapables menant à la
/// galerie quand le média affiché n'en a pas (réel mixte, scène), rien sinon.
final class ReelMediaIndicatorTests: XCTestCase {

    func test_resolve_singleMedia_showsNothing() {
        XCTAssertEqual(
            ReelMediaIndicator.resolve(isScene: false, primaryType: .image, visualCount: 1, currentIndex: 0),
            .none
        )
    }

    func test_resolve_imageCarousel_keepsOnlyTheCarouselDots() {
        XCTAssertEqual(
            ReelMediaIndicator.resolve(isScene: false, primaryType: .image, visualCount: 3, currentIndex: 1),
            .carouselDots
        )
    }

    func test_resolve_mixedVideoReel_showsGalleryDotsOnTheVisibleMedia() {
        XCTAssertEqual(
            ReelMediaIndicator.resolve(isScene: false, primaryType: .video, visualCount: 3, currentIndex: 0),
            .galleryDots(total: 3, currentIndex: 0)
        )
    }

    func test_resolve_sceneReelWithSeveralMedia_showsGalleryDots() {
        XCTAssertEqual(
            ReelMediaIndicator.resolve(isScene: true, primaryType: .image, visualCount: 2, currentIndex: 1),
            .galleryDots(total: 2, currentIndex: 1)
        )
    }

    func test_resolve_outOfRangeIndex_isClampedToTheLastDot() {
        XCTAssertEqual(
            ReelMediaIndicator.resolve(isScene: false, primaryType: .video, visualCount: 2, currentIndex: 7),
            .galleryDots(total: 2, currentIndex: 1)
        )
    }

    /// Le compteur textuel est la forme que la recette a refusée. Aucune
    /// mesure de rendu ne la voit sans instrumenter SwiftUI : la garde de
    /// source est ici la seule mesure possible.
    func test_reelChrome_noLongerPaintsAnIndexOverTotalCounter() throws {
        let carousel = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ReelsPlayerView+Carousel.swift")
        let host = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ReelsPlayerView.swift")
            + MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ReelPageView.swift")

        XCTAssertFalse(carousel.contains("Text(\"\\(currentIndex + 1) / \\(total)\")"),
                       "le réel ne peint plus de compteur « n / M » : ses points le disent déjà")
        XCTAssertFalse(host.contains("ReelMediaCountBadge("),
                       "la pastille-compteur n'est plus montée sur le réel")
    }
}
