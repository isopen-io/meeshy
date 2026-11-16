import XCTest
import SwiftUI
@testable import MeeshyUI

/// #18722, #18723 — l'aperçu d'appui long (conversation ou message) se pose
/// avec un léger rebond : le ressort de fin DÉPASSE sa place d'un peu, puis
/// s'y pose. Sous « Réduire les animations », aucun ressort.
final class PreviewSettleSpringTests: XCTestCase {

    func test_dampingFraction_isUnderdampedEnoughForTheBounceToBeSeen() {
        XCTAssertGreaterThanOrEqual(PreviewSettleSpring.dampingFraction, 0.70)
        XCTAssertLessThanOrEqual(PreviewSettleSpring.dampingFraction, 0.75)
    }

    func test_overshoot_ofAnUnderdampedSpring_isLight() {
        let overshoot = PreviewSettleSpring.overshoot(dampingFraction: PreviewSettleSpring.dampingFraction)
        XCTAssertGreaterThan(overshoot, 0.02, "un rebond qu'on VOIT")
        XCTAssertLessThan(overshoot, 0.06, "un rebond LÉGER")
    }

    func test_overshoot_ofTheFormerSpring_wasInvisible() {
        XCTAssertLessThan(PreviewSettleSpring.overshoot(dampingFraction: 0.86), 0.006)
    }

    func test_overshoot_ofACriticallyDampedSpring_isZero() {
        XCTAssertEqual(PreviewSettleSpring.overshoot(dampingFraction: 1), 0)
        XCTAssertEqual(PreviewSettleSpring.overshoot(dampingFraction: 1.4), 0)
    }

    func test_overshoot_decreasesWithDamping() {
        let samples = stride(from: 0.3, through: 0.99, by: 0.05).map { PreviewSettleSpring.overshoot(dampingFraction: $0) }
        XCTAssertEqual(samples, samples.sorted(by: >))
    }

    func test_messagePop_peaksJustAboveFullSize() {
        let peak = 1 + (1 - PreviewSettleSpring.messageStartScale) * PreviewSettleSpring.overshoot(dampingFraction: PreviewSettleSpring.popDampingFraction)
        XCTAssertGreaterThan(peak, 1.006, "la bulle dépasse sa taille")
        XCTAssertLessThan(peak, 1.03, "d'un rien")
    }

    func test_bound_letsTheOvershootThrough_butNeverRunsAway() {
        XCTAssertEqual(PreviewSettleSpring.bounded(1.03), 1.03, accuracy: 0.0001)
        XCTAssertEqual(PreviewSettleSpring.bounded(3), PreviewSettleSpring.maximumProgress)
        XCTAssertEqual(PreviewSettleSpring.bounded(-0.2), 0, "le retour ne passe jamais sous la source")
    }

    func test_tokens_areBuiltFromTheLaw() {
        XCTAssertEqual(MeeshyAnimation.previewMorph,
                       Animation.spring(response: PreviewSettleSpring.response, dampingFraction: PreviewSettleSpring.dampingFraction))
        XCTAssertEqual(MeeshyAnimation.messagePreviewSettle,
                       Animation.spring(response: PreviewSettleSpring.messageResponse, dampingFraction: PreviewSettleSpring.dampingFraction))
        XCTAssertEqual(MeeshyAnimation.messagePreviewPop,
                       Animation.spring(response: PreviewSettleSpring.messageResponse, dampingFraction: PreviewSettleSpring.popDampingFraction))
    }
}
