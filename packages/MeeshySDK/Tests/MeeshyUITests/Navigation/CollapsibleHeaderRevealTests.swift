import XCTest
import SwiftUI
@testable import MeeshyUI

// Pure-logic suite — NOT @MainActor (MeeshyUI defaultIsolation is MainActor;
// the function under test is `nonisolated`, so the test must stay off the actor).
final class CollapsibleHeaderRevealTests: XCTestCase {

    func test_revealOpacity_atRest_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_belowStartThreshold_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.5), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_atStartThreshold_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.6), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_fullyCollapsed_isOne() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 1), 1, accuracy: 0.0001)
    }

    func test_revealOpacity_midReveal_isHalf() {
        // start=0.6 → midpoint of the reveal band [0.6, 1.0] is 0.8
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.8), 0.5, accuracy: 0.0001)
    }

    func test_revealOpacity_isClampedAboveOne() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 1.5), 1, accuracy: 0.0001)
    }

    // MARK: - pinnedAccessoryReveal

    private func reveal(_ offset: CGFloat, start: CGFloat = 70, end: CGFloat = 140) -> CGFloat {
        CollapsibleHeaderMetrics.pinnedAccessoryReveal(scrollOffset: offset, start: start, end: end)
    }

    func test_pinnedAccessoryReveal_atRest_isZero() {
        XCTAssertEqual(reveal(0), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_beforeStart_isZero() {
        // scrolled 50pt (offset -50), start is 70 → still hidden
        XCTAssertEqual(reveal(-50), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_atStart_isZero() {
        XCTAssertEqual(reveal(-70), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_midBand_isHalf() {
        // midpoint of [70, 140] is 105
        XCTAssertEqual(reveal(-105), 0.5, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_atEnd_isOne() {
        XCTAssertEqual(reveal(-140), 1, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_pastEnd_isClampedToOne() {
        XCTAssertEqual(reveal(-300), 1, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_positiveOverscroll_isZero() {
        // pull-to-refresh overscroll (positive offset) must never reveal
        XCTAssertEqual(reveal(40), 0, accuracy: 0.0001)
    }

    func test_pinnedAccessoryReveal_degenerateBand_isStep() {
        // start == end → step function at the threshold
        XCTAssertEqual(reveal(-100, start: 120, end: 120), 0, accuracy: 0.0001)
        XCTAssertEqual(reveal(-120, start: 120, end: 120), 1, accuracy: 0.0001)
    }

    // MARK: - inlineAccessoryReveal
    //
    // Le titre et la trail se partagent UNE fente : le header fait disparaître
    // « Meeshy Feed » sur exactement la courbe qui fait apparaître la trail
    // (directive user 2026-08-13). D'où une courbe NOMMÉE, sans bornes à
    // repasser — deux appelants qui recopient 78/148 finissent par diverger, et
    // la fente se retrouve vide, ou occupée deux fois.

    private func inline(_ offset: CGFloat) -> CGFloat {
        CollapsibleHeaderMetrics.inlineAccessoryReveal(scrollOffset: offset)
    }

    func test_inlineAccessoryReveal_atRest_leavesTheTitleInPlace() {
        XCTAssertEqual(inline(0), 0, accuracy: 0.0001)
    }

    func test_inlineAccessoryReveal_beforeTheFullTrailIsHidden_stillLeavesTheTitle() {
        // La grande trail est encore visible sous le header : la remplacer déjà
        // dans la barre afficherait la même rangée deux fois.
        XCTAssertEqual(inline(-CollapsibleHeaderMetrics.inlineAccessoryRevealStart), 0, accuracy: 0.0001)
    }

    func test_inlineAccessoryReveal_midHandover_isHalf() {
        let start = CollapsibleHeaderMetrics.inlineAccessoryRevealStart
        let end = CollapsibleHeaderMetrics.inlineAccessoryRevealEnd
        XCTAssertEqual(inline(-(start + end) / 2), 0.5, accuracy: 0.0001)
    }

    func test_inlineAccessoryReveal_onceScrolledPast_theTrailOwnsTheSlot() {
        XCTAssertEqual(inline(-CollapsibleHeaderMetrics.inlineAccessoryRevealEnd), 1, accuracy: 0.0001)
        XCTAssertEqual(inline(-600), 1, accuracy: 0.0001)
    }

    func test_inlineAccessoryReveal_overscroll_neverRevealsTheTrail() {
        // Pull-to-refresh : offset positif. La trail n'a rien à y faire.
        XCTAssertEqual(inline(90), 0, accuracy: 0.0001)
    }

    func test_inlineAccessoryHandoverStartsOnlyAfterTheHeaderHasFullyCollapsed() {
        // La bascule ne commence QU'APRÈS la fin du repli du titre (progress
        // atteint 1 à 60pt) : sinon le titre rétrécirait ET s'effacerait en même
        // temps, deux animations pour un seul geste.
        XCTAssertGreaterThan(CollapsibleHeaderMetrics.inlineAccessoryRevealStart, 60)
        XCTAssertGreaterThan(
            CollapsibleHeaderMetrics.inlineAccessoryRevealEnd,
            CollapsibleHeaderMetrics.inlineAccessoryRevealStart
        )
    }

    func test_theBarGrowsEnoughToHostTheAccessoryAndNeverExceedsTheExpandedHeight() {
        // Une ligne de titre de 44pt ne peut pas héberger un anneau de 50pt : la
        // barre grandit. Mais elle ne doit jamais DÉPASSER sa hauteur dépliée,
        // sinon le header grossit quand on scrolle.
        XCTAssertGreaterThan(
            CollapsibleHeaderMetrics.accessoryCollapsedHeight,
            CollapsibleHeaderMetrics.collapsedHeight
        )
        XCTAssertGreaterThanOrEqual(
            CollapsibleHeaderMetrics.accessoryCollapsedHeight,
            CollapsibleHeaderMetrics.inlineAccessoryHeight
        )
        XCTAssertLessThanOrEqual(
            CollapsibleHeaderMetrics.accessoryCollapsedHeight,
            CollapsibleHeaderMetrics.expandedHeight
        )
    }
}
