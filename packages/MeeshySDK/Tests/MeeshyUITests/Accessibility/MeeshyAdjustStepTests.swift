import XCTest
import SwiftUI
@testable import MeeshyUI

final class MeeshyAdjustStepTests: XCTestCase {

    func test_signed_incrementIsPositive_decrementIsNegative() {
        XCTAssertEqual(MeeshyAdjustStep.signed(0.1, .increment), 0.1)
        XCTAssertEqual(MeeshyAdjustStep.signed(0.1, .decrement), -0.1)
    }

    func test_steps_areOneTenthOfASecond_andOneHundredth() {
        XCTAssertEqual(MeeshyAdjustStep.seconds, 0.1)
        XCTAssertEqual(MeeshyAdjustStep.fraction, 0.01)
    }

    func test_nudgedFraction_movesByOneHundredth_roundedWithoutDrift() {
        XCTAssertEqual(MeeshyAdjustStep.nudgedFraction(0.12, .increment), 0.13)
        let walked = (0..<10).reduce(0.1) { value, _ in
            MeeshyAdjustStep.nudgedFraction(value, .increment) ?? value
        }
        XCTAssertEqual(walked, 0.2)
    }

    func test_nudgedFraction_clampsAndReturnsNilAtBounds() {
        XCTAssertNil(MeeshyAdjustStep.nudgedFraction(1.0, .increment))
        XCTAssertNil(MeeshyAdjustStep.nudgedFraction(0.0, .decrement))
        XCTAssertEqual(MeeshyAdjustStep.nudgedFraction(0.995, .increment), 1.0)
    }

    func test_accessibleValue_seconds_followsLocale() {
        XCTAssertTrue(MeeshyAccessibleValue.seconds(1.5, locale: Locale(identifier: "fr_FR")).contains("1,5"))
        XCTAssertTrue(MeeshyAccessibleValue.seconds(1.5, locale: Locale(identifier: "en_US")).contains("1.5"))
    }

    func test_accessibleValue_percent_followsLocale() {
        let spoken = MeeshyAccessibleValue.percent(0.8, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(spoken.contains("80"))
        XCTAssertTrue(spoken.contains("%"))
    }
}
