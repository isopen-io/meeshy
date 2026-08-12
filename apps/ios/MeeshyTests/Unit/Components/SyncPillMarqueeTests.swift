import XCTest
@testable import Meeshy

final class SyncPillMarqueeTests: XCTestCase {

    func test_shouldScroll_textNarrowerThanAvailable_returnsFalse() {
        XCTAssertFalse(SyncPillMarquee.shouldScroll(textWidth: 80, availableWidth: 120))
    }

    func test_shouldScroll_textWiderThanAvailable_returnsTrue() {
        XCTAssertTrue(SyncPillMarquee.shouldScroll(textWidth: 200, availableWidth: 120))
    }

    func test_shouldScroll_textExactlyAtThreshold_returnsFalse() {
        // Pile au bord : ne PAS déclencher un défilement pour un pixel de trop
        // dû à l'arrondi flottant — le seuil est strictement supérieur.
        XCTAssertFalse(SyncPillMarquee.shouldScroll(textWidth: 120, availableWidth: 120))
    }

    func test_scrollDuration_isProportionalToTextWidth() {
        let short = SyncPillMarquee.scrollDuration(textWidth: 100)
        let long = SyncPillMarquee.scrollDuration(textWidth: 200)
        XCTAssertEqual(long, short * 2, accuracy: 0.001)
    }

    func test_scrollDuration_hasAMinimumFloor() {
        // Un texte à peine plus large que le seuil ne doit pas défiler en un
        // clin d'œil imperceptible — plancher d'1 s.
        XCTAssertGreaterThanOrEqual(SyncPillMarquee.scrollDuration(textWidth: 1), 1.0)
    }

    func test_pointsPerSecond_isPositive() {
        XCTAssertGreaterThan(SyncPillMarquee.pointsPerSecond, 0)
    }
}
