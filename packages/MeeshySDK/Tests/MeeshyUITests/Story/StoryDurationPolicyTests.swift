import XCTest
@testable import MeeshyUI

final class StoryDurationPolicyTests: XCTestCase {

    func test_bgVideo_2_5s_yieldsExactly_7_5s() {
        // 6 / 2.5 = 2.4 → ceil = 3 → 3 × 2.5 = 7.5
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 5.0,
            backgroundMediaDuration: 2.5
        )
        XCTAssertEqual(r, 7.5, accuracy: 0.001)
    }

    func test_bgVideo_5_9s_yieldsExactly_11_8s() {
        // 6 / 5.9 ≈ 1.017 → ceil = 2 → 2 × 5.9 = 11.8
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 5.0,
            backgroundMediaDuration: 5.9
        )
        XCTAssertEqual(r, 11.8, accuracy: 0.001)
    }

    func test_bgVideo_6_0s_yieldsIntrinsic_noMultiplication() {
        // 6 == 6 → guard fail (d < 6 is false) → return intrinsic
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 6.0,
            backgroundMediaDuration: 6.0
        )
        XCTAssertEqual(r, 6.0, accuracy: 0.001)
    }

    func test_bgAudio_4s_yieldsExactly_8s() {
        // 6 / 4 = 1.5 → ceil = 2 → 2 × 4 = 8
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 5.0,
            backgroundMediaDuration: 4.0
        )
        XCTAssertEqual(r, 8.0, accuracy: 0.001)
    }

    func test_noBgMedia_fallsBackToIntrinsic() {
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 10.0,
            backgroundMediaDuration: nil
        )
        XCTAssertEqual(r, 10.0, accuracy: 0.001)
    }

    func test_bgMediaZero_fallsBackToIntrinsic() {
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 10.0,
            backgroundMediaDuration: 0
        )
        XCTAssertEqual(r, 10.0, accuracy: 0.001)
    }

    func test_intrinsicLargerThanLoopTotal_keepsIntrinsic() {
        // bgVideo 2s → 3 loops = 6s, mais intrinsic 10s → keep 10s
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 10.0,
            backgroundMediaDuration: 2.0
        )
        XCTAssertEqual(r, 10.0, accuracy: 0.001)
    }

    func test_bgMediaNegative_fallsBackToIntrinsic() {
        // Guard `d > 0` doit catch les valeurs négatives (mauvaise donnée)
        let r = StoryDurationPolicy.adjustedDuration(
            intrinsic: 4.0,
            backgroundMediaDuration: -1.0
        )
        XCTAssertEqual(r, 4.0, accuracy: 0.001)
    }

    func test_minimumLoopAccumulation_constantIsSixSeconds() {
        XCTAssertEqual(StoryDurationPolicy.minimumLoopAccumulation, 6.0)
    }
}
