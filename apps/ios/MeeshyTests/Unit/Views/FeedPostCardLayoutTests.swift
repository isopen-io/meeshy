import XCTest
import CoreGraphics
@testable import Meeshy

/// Hauteur du média d'une carte de POST — carte non immersive : le texte est
/// affiché, puis le média.
///
/// Le défaut corrigé le 2026-08-10 : `mediaPreview` imposait
/// `.frame(height: 220)` par-dessus une cellule qui calculait déjà sa hauteur
/// depuis le ratio source. Les deux se contredisaient et un clip vertical
/// s'affichait en timbre-poste letterboxé au centre de la carte.
final class FeedPostCardLayoutTests: XCTestCase {

    private let cardWidth: CGFloat = 400

    func test_postCardMediaHeight_portrait_isCappedAtMaxTallRatio() {
        // 9:16 → ratio h/w = 1.78, au-dessus du plafond 1.4.
        // C'est LE cas cassé : le clip vertical letterboxait.
        let h = postCardMediaHeight(mediaWidth: 1080, mediaHeight: 1920, cardWidth: cardWidth)
        XCTAssertEqual(h, 560) // 400 × 1.4
    }

    func test_postCardMediaHeight_landscape_isFlooredAtMinRatio() {
        // 16:9 → ratio h/w = 0.5625, sous le plancher 0.75.
        let h = postCardMediaHeight(mediaWidth: 1920, mediaHeight: 1080, cardWidth: cardWidth)
        XCTAssertEqual(h, 300) // 400 × 0.75
    }

    func test_postCardMediaHeight_squareIsInsideBounds_usesSourceRatio() {
        let h = postCardMediaHeight(mediaWidth: 1000, mediaHeight: 1000, cardWidth: cardWidth)
        XCTAssertEqual(h, 400) // 400 × 1.0
    }

    func test_postCardMediaHeight_fourFive_usesSourceRatio() {
        // 4:5 → 1.25, dans les bornes : ni rogné ni étiré.
        let h = postCardMediaHeight(mediaWidth: 1080, mediaHeight: 1350, cardWidth: cardWidth)
        XCTAssertEqual(h, 500) // 400 × 1.25
    }

    func test_postCardMediaHeight_unknownDimensions_fallsBackToMinRatio() {
        XCTAssertEqual(postCardMediaHeight(mediaWidth: nil, mediaHeight: nil, cardWidth: cardWidth), 300)
    }

    func test_postCardMediaHeight_zeroDimensions_fallsBackToMinRatio() {
        XCTAssertEqual(postCardMediaHeight(mediaWidth: 0, mediaHeight: 0, cardWidth: cardWidth), 300)
    }
}
