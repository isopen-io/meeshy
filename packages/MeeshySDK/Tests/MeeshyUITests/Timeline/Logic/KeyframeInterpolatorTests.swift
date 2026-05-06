import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

final class KeyframeInterpolatorTests: XCTestCase {

    // MARK: - Lerpable: Float

    func test_float_lerp_atZero_returnsFrom() {
        XCTAssertEqual(Float.lerp(from: 10, to: 20, t: 0), 10, accuracy: 0.0001)
    }

    func test_float_lerp_atOne_returnsTo() {
        XCTAssertEqual(Float.lerp(from: 10, to: 20, t: 1), 20, accuracy: 0.0001)
    }

    func test_float_lerp_atMidpoint_returnsAverage() {
        XCTAssertEqual(Float.lerp(from: 10, to: 20, t: 0.5), 15, accuracy: 0.0001)
    }

    // MARK: - Lerpable: CGFloat

    func test_cgFloat_lerp_atMidpoint() {
        let result = CGFloat.lerp(from: 0, to: 10, t: 0.5)
        XCTAssertEqual(result, 5, accuracy: 0.0001)
    }

    // MARK: - Lerpable: CGPoint

    func test_cgPoint_lerp_componentWise() {
        let result = CGPoint.lerp(from: CGPoint(x: 0, y: 0),
                                  to: CGPoint(x: 10, y: 20),
                                  t: 0.5)
        XCTAssertEqual(result.x, 5, accuracy: 0.0001)
        XCTAssertEqual(result.y, 10, accuracy: 0.0001)
    }

    // MARK: - Lerpable: CGSize

    func test_cgSize_lerp_componentWise() {
        let result = CGSize.lerp(from: CGSize(width: 100, height: 200),
                                 to: CGSize(width: 200, height: 100),
                                 t: 0.25)
        XCTAssertEqual(result.width,  125, accuracy: 0.0001)
        XCTAssertEqual(result.height, 175, accuracy: 0.0001)
    }

    // MARK: - Lerpable: extrapolation past 1.0 (no clamping in the protocol itself)

    func test_float_lerp_pastOne_extrapolates() {
        XCTAssertEqual(Float.lerp(from: 0, to: 10, t: 1.5), 15, accuracy: 0.0001)
    }

    // MARK: - KeyframeInterpolator.interpolate — degenerate

    func test_interpolate_emptyKeyframes_returnsNil() {
        let result: Float? = KeyframeInterpolator.interpolate(
            keyframes: [],
            at: 0.5
        )
        XCTAssertNil(result)
    }

    func test_interpolate_singleKeyframe_atKeyframeTime_returnsValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 42.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertNotNil(result)
        XCTAssertEqual(result!, 42.0, accuracy: 0.0001 as Float)
    }

    func test_interpolate_singleKeyframe_afterKeyframeTime_returnsValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 42.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 5.0)
        XCTAssertNotNil(result)
        XCTAssertEqual(result!, 42.0, accuracy: 0.0001 as Float)
    }

    // MARK: - KeyframeInterpolator — clamp

    func test_interpolate_beforeFirstKeyframe_clampsToFirstValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 10.0, easing: .linear),
            (time: 3.0, value: 30.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 0.0)
        XCTAssertEqual(result!, 10.0, accuracy: 0.0001 as Float)
    }

    func test_interpolate_afterLastKeyframe_clampsToLastValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 10.0, easing: .linear),
            (time: 3.0, value: 30.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 100.0)
        XCTAssertEqual(result!, 30.0, accuracy: 0.0001 as Float)
    }

    func test_interpolate_negativeTime_clampsToFirstValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 5.0, easing: .linear),
            (time: 2.0, value: 25.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: -1.0)
        XCTAssertEqual(result!, 5.0, accuracy: 0.0001 as Float)
    }

    // MARK: - KeyframeInterpolator — N keyframes linear

    func test_interpolate_twoKeyframes_atMidpoint_returnsAverage() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .linear),
            (time: 2.0, value: 10.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result!, 5.0, accuracy: 0.0001 as Float)
    }

    func test_interpolate_threeKeyframes_secondSegment() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,   easing: .linear),
            (time: 1.0, value: 10.0,  easing: .linear),
            (time: 2.0, value: 100.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.5)
        XCTAssertEqual(result!, 55.0, accuracy: 0.0001 as Float)
    }

    // MARK: - KeyframeInterpolator — easing

    func test_interpolate_easeIn_atMidpoint_isLessThanLinearMid() {
        // For easeIn (t*t), at t=0.5 the eased value is 0.25, so the result
        // is 0 + (10 - 0) * 0.25 = 2.5 (less than linear which would be 5.0)
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .easeIn),
            (time: 2.0, value: 10.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result!, 2.5, accuracy: 0.0001 as Float)
    }

    func test_interpolate_easeOut_atMidpoint_isGreaterThanLinearMid() {
        // For easeOut (1 - (1-t)^2), at t=0.5 the eased value is 0.75
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .easeOut),
            (time: 2.0, value: 10.0, easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result!, 7.5, accuracy: 0.0001 as Float)
    }

    func test_interpolate_easingComesFromOriginKeyframe_notDestination() {
        // Verify the easing of the *origin* keyframe is applied, not the destination.
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .easeIn),
            (time: 2.0, value: 10.0, easing: .easeOut)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result!, 2.5, accuracy: 0.0001 as Float)
    }

    // MARK: - KeyframeInterpolator — unsorted input

    func test_interpolate_unsortedKeyframes_sortsBeforeUsing() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 2.0, value: 100.0, easing: .linear),
            (time: 0.0, value: 0.0,   easing: .linear),
            (time: 1.0, value: 10.0,  easing: .linear)
        ]
        let result: Float? = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.5)
        XCTAssertEqual(result!, 55.0, accuracy: 0.0001 as Float)
    }
}
