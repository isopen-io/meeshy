import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class MeeshyMotionAnimationTests: XCTestCase {

    private struct SampleError: Error {}

    func test_animation_reduceOn_isNil() {
        XCTAssertNil(MeeshyMotion.animation(.easeIn, reduce: true))
    }

    func test_animation_reduceOff_isUnchanged() {
        XCTAssertEqual(MeeshyMotion.animation(.easeIn, reduce: false), .easeIn)
    }

    func test_animation_nilStaysNil() {
        XCTAssertNil(MeeshyMotion.animation(nil, reduce: false))
        XCTAssertNil(MeeshyMotion.animation(nil, reduce: true))
    }

    func test_meeshyWithAnimation_returnsBodyResult_inBothModes() {
        let reduced = meeshyWithAnimation(.easeIn, reduceMotion: true) { 42 }
        let animated = meeshyWithAnimation(.easeIn, reduceMotion: false) { 42 }
        XCTAssertEqual(reduced, 42)
        XCTAssertEqual(animated, 42)
    }

    func test_meeshyWithAnimation_rethrows() {
        XCTAssertThrowsError(try meeshyWithAnimation(.default, reduceMotion: false) { throw SampleError() })
    }
    // MARK: - Racine du mouvement (#18354)

    func test_rootAnimation_reduceOn_isNil() {
        XCTAssertNil(MeeshyMotion.rootAnimation(.spring, reduce: true, preserved: false))
    }

    func test_rootAnimation_reduceOff_keepsAnimation() {
        XCTAssertEqual(MeeshyMotion.rootAnimation(.spring, reduce: false, preserved: false), .spring)
    }

    func test_rootAnimation_preservedUnderReduce_keepsAnimation() {
        XCTAssertEqual(
            MeeshyMotion.rootAnimation(MeeshyMotion.reducedFade, reduce: true, preserved: true),
            MeeshyMotion.reducedFade
        )
    }

    func test_reducedFade_lastsTheKitReducedStowDuration() {
        XCTAssertEqual(MeeshyMotion.reducedFade, .easeOut(duration: MeeshyGlassPillRecipe.reducedStowDuration))
    }

    func test_transition_reduceOn_servesReducedVariant() {
        let full = AnyTransition.move(edge: .bottom)
        let reduced = AnyTransition.scale
        let served = MeeshyMotion.transition(full, reduced: reduced, reduce: true)
        XCTAssertTrue(sameTransition(served, reduced))
        XCTAssertFalse(sameTransition(served, full))
    }

    func test_transition_reduceOff_servesFullVariant() {
        let full = AnyTransition.move(edge: .bottom)
        let reduced = AnyTransition.scale
        XCTAssertTrue(sameTransition(MeeshyMotion.transition(full, reduced: reduced, reduce: false), full))
    }

    func test_meeshyWithAnimationReduced_returnsBodyResult_inBothModes() {
        let reduced = meeshyWithAnimation(.spring, reduced: MeeshyMotion.reducedFade, reduceMotion: true) { 7 }
        let animated = meeshyWithAnimation(.spring, reduced: MeeshyMotion.reducedFade, reduceMotion: false) { 7 }
        XCTAssertEqual(reduced, 7)
        XCTAssertEqual(animated, 7)
    }

    private func sameTransition(_ lhs: AnyTransition, _ rhs: AnyTransition) -> Bool {
        withUnsafeBytes(of: lhs) { left in withUnsafeBytes(of: rhs) { right in left.elementsEqual(right) } }
    }
}
