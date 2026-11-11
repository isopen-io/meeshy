import XCTest
import SwiftUI
@testable import MeeshyUI

final class MeeshyLabeledSliderRuleTests: XCTestCase {

    private func makeRule(range: ClosedRange<Double> = 0...100, step: Double? = nil) -> MeeshyLabeledSliderRule {
        MeeshyLabeledSliderRule(range: range, step: step)
    }

    func test_snap_belowLowerBound_clampsToLowerBound() {
        XCTAssertEqual(makeRule(range: 10...20).snap(3), 10)
    }

    func test_snap_aboveUpperBound_clampsToUpperBound() {
        XCTAssertEqual(makeRule(range: 10...20).snap(99), 20)
    }

    func test_snap_withStep_roundsToNearestStepFromLowerBound() {
        XCTAssertEqual(makeRule(range: 0...10, step: 2).snap(5.1), 6)
    }

    func test_snap_withoutStep_keepsContinuousValue() {
        XCTAssertEqual(makeRule(range: 0...10).snap(5.37), 5.37, accuracy: 1e-9)
    }

    func test_fraction_atMidpoint_isHalf() {
        XCTAssertEqual(makeRule(range: 0...200).fraction(of: 100), 0.5, accuracy: 1e-9)
    }

    func test_value_atFraction_roundTripsWithFraction() {
        let rule = makeRule(range: 0...200)
        XCTAssertEqual(rule.value(atFraction: rule.fraction(of: 50)), 50, accuracy: 1e-9)
    }

    func test_value_atFractionRTL_mirrorsFromTrailingEdge() {
        XCTAssertEqual(makeRule(range: 0...100).value(atFraction: 0.25, isRTL: true), 75, accuracy: 1e-9)
    }

    func test_adjusted_upByStep_addsOneStep() {
        XCTAssertEqual(makeRule(range: 0...10, step: 1).adjusted(4, up: true, coarse: false), 5)
    }

    func test_adjusted_continuousFine_addsOnePercentOfSpan() {
        XCTAssertEqual(makeRule(range: 0...200).adjusted(100, up: true, coarse: false), 102, accuracy: 1e-9)
    }

    func test_adjusted_coarse_addsFivePercentOfSpanRoundedToStep() {
        XCTAssertEqual(makeRule(range: 0...100, step: 1).adjusted(10, up: false, coarse: true), 5)
    }

    func test_adjusted_coarseAtLowerBound_staysAtBound() {
        XCTAssertEqual(makeRule(range: 0...100, step: 1).adjusted(0, up: false, coarse: true), 0)
    }

    func test_detentCrossed_whenPassingNeutral_isTrue() {
        XCTAssertTrue(makeRule(range: -10...10).detentCrossed(from: -0.5, to: 0.5, neutral: 0))
    }

    func test_detentCrossed_whenReachingUpperBound_isTrue() {
        XCTAssertTrue(makeRule(range: 0...10).detentCrossed(from: 9, to: 10, neutral: nil))
    }

    func test_detentCrossed_insideBetweenDetents_isFalse() {
        XCTAssertFalse(makeRule(range: 0...10).detentCrossed(from: 2, to: 3, neutral: 5))
    }

    func test_shouldEmit_sameSnappedValue_isFalse() {
        XCTAssertFalse(makeRule(range: 0...10, step: 1).shouldEmit(previous: 4, next: 4.2))
    }

    func test_shouldEmit_changedSnappedValue_isTrue() {
        XCTAssertTrue(makeRule(range: 0...10, step: 1).shouldEmit(previous: 4, next: 5))
    }
}

final class MeeshyLabeledSliderRecipeTests: XCTestCase {

    func test_resolve_resting_hasNoHalo() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: false,
                                                      isOffNeutral: false, tint: nil, reduceMotion: false)
        XCTAssertEqual(recipe.haloOpacity, 0)
        XCTAssertEqual(recipe.thumbScale, 1)
    }

    func test_resolve_pressed_scalesThumbAndShowsHalo() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: true,
                                                      isOffNeutral: false, tint: nil, reduceMotion: false)
        XCTAssertEqual(recipe.thumbScale, 1.2, accuracy: 1e-9)
        XCTAssertEqual(recipe.haloOpacity, 0.32, accuracy: 1e-9)
    }

    func test_resolve_pressedUnderReduceMotion_keepsHaloWithoutScale() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: true,
                                                      isOffNeutral: false, tint: nil, reduceMotion: true)
        XCTAssertEqual(recipe.thumbScale, 1)
        XCTAssertEqual(recipe.haloOpacity, 0.32, accuracy: 1e-9)
    }

    func test_resolve_disabled_isFortyPercentAndNoHalo() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: false, isPressed: true,
                                                      isOffNeutral: false, tint: nil, reduceMotion: false)
        XCTAssertEqual(recipe.contentOpacity, 0.4, accuracy: 1e-9)
        XCTAssertEqual(recipe.haloOpacity, 0)
    }

    func test_resolve_offNeutral_usesFullInk() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: false,
                                                      isOffNeutral: true, tint: nil, reduceMotion: false)
        XCTAssertEqual(recipe.valueOpacity, 1, accuracy: 1e-9)
    }

    func test_resolve_restingValue_usesSecondaryInk() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: false,
                                                      isOffNeutral: false, tint: nil, reduceMotion: false)
        XCTAssertEqual(recipe.valueOpacity, 0.85, accuracy: 1e-9)
    }

    func test_resolve_trackAndThumbSizes_matchPlanche() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: false,
                                                      isOffNeutral: false, tint: nil, reduceMotion: false)
        XCTAssertEqual(recipe.trackHeight, 4)
        XCTAssertEqual(recipe.thumbDiameter, 20)
    }

    func test_resolve_hitBandAtLeastTapTarget() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: false,
                                                      isOffNeutral: false, tint: nil, reduceMotion: false)
        XCTAssertGreaterThanOrEqual(recipe.hitHeight, 44)
    }
}
