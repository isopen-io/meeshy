import XCTest
import SwiftUI
@testable import MeeshyUI

/// Loi de phase du pull-to-refresh (`MeeshyPullPhaseLaw`), isolee de la vue
/// apres le bug Lentille du 2026-08-21 : un conteneur a `safeAreaInset` haut
/// decalait l'offset de repos et laissait l'indicateur coince en `.pulling`.
/// La loi ne connait que la DISTANCE de pull (0 au repos) : c'est au suivi
/// d'offset de la fournir relative a l'inset.
final class MeeshyPullPhaseLawTests: XCTestCase {

    private let threshold: CGFloat = 90

    func test_atRest_idleStaysIdle_withoutPublishing() {
        XCTAssertNil(MeeshyPullPhaseLaw.next(phase: .idle, pullDistance: 0, threshold: threshold))
    }

    func test_partialPull_reportsProgressTowardsTheThreshold() {
        XCTAssertEqual(
            MeeshyPullPhaseLaw.next(phase: .idle, pullDistance: 45, threshold: threshold),
            .pulling(progress: 0.5)
        )
    }

    func test_reachingTheThreshold_arms_once() {
        XCTAssertEqual(MeeshyPullPhaseLaw.next(phase: .pulling(progress: 0.9), pullDistance: 90, threshold: threshold), .armed)
        XCTAssertNil(MeeshyPullPhaseLaw.next(phase: .armed, pullDistance: 120, threshold: threshold))
    }

    func test_releasingBackToRest_returnsToIdle_fromAnyLiveState() {
        XCTAssertEqual(MeeshyPullPhaseLaw.next(phase: .armed, pullDistance: 0, threshold: threshold), .idle)
        XCTAssertEqual(MeeshyPullPhaseLaw.next(phase: .pulling(progress: 0.3), pullDistance: 0, threshold: threshold), .idle)
    }

    func test_refreshSequence_ownsThePhase_scrollTicksNeverInterfere() {
        XCTAssertNil(MeeshyPullPhaseLaw.next(phase: .refreshing, pullDistance: 40, threshold: threshold))
        XCTAssertNil(MeeshyPullPhaseLaw.next(phase: .completing, pullDistance: 0, threshold: threshold))
    }

    func test_negativeDistance_isRest() {
        XCTAssertEqual(MeeshyPullPhaseLaw.next(phase: .armed, pullDistance: -12, threshold: threshold), .idle)
    }
}
