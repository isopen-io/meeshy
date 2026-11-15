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

    // MARK: - offset(elapsed:) — le décalage est une loi du TEMPS ÉCOULÉ (#9883)

    func test_offset_atTheStart_isTheRestPosition() {
        XCTAssertEqual(SyncPillMarquee.offset(elapsed: 0, textWidth: 300, availableWidth: 120), 0)
    }

    func test_offset_firstPass_slidesLeftAtTheNominalSpeed() {
        let offset = SyncPillMarquee.offset(elapsed: 2, textWidth: 300, availableWidth: 120)
        XCTAssertEqual(offset, -CGFloat(SyncPillMarquee.pointsPerSecond * 2), accuracy: 0.001)
    }

    func test_offset_afterTheTextLeft_reentersFromTheRightEdge() {
        let leaves = (300 + SyncPillMarquee.gap) / CGFloat(SyncPillMarquee.pointsPerSecond)
        let offset = SyncPillMarquee.offset(elapsed: Double(leaves) + 0.001, textWidth: 300, availableWidth: 120)
        XCTAssertEqual(offset, 120, accuracy: 0.1, "après la sortie, le texte revient du bord droit du viewport")
    }

    func test_offset_isPeriodic_afterTheFirstPass() {
        let firstPass = Double((300 + SyncPillMarquee.gap) / CGFloat(SyncPillMarquee.pointsPerSecond))
        let lap = Double((120 + 300 + SyncPillMarquee.gap) / CGFloat(SyncPillMarquee.pointsPerSecond))
        let a = SyncPillMarquee.offset(elapsed: firstPass + 1, textWidth: 300, availableWidth: 120)
        let b = SyncPillMarquee.offset(elapsed: firstPass + 1 + lap, textWidth: 300, availableWidth: 120)
        XCTAssertEqual(a, b, accuracy: 0.001)
    }

    func test_offset_neverMovesRight_withinALap() {
        var previous = SyncPillMarquee.offset(elapsed: 0, textWidth: 300, availableWidth: 120)
        for step in 1...200 {
            let current = SyncPillMarquee.offset(elapsed: Double(step) * 0.05, textWidth: 300, availableWidth: 120)
            // Un seul saut vers la droite par tour : le retour du bord droit.
            if current > previous { XCTAssertEqual(current, 120, accuracy: 2) }
            previous = current
        }
    }

    func test_offset_negativeElapsed_staysAtRest() {
        XCTAssertEqual(SyncPillMarquee.offset(elapsed: -3, textWidth: 300, availableWidth: 120), 0)
    }
}
