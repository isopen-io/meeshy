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
}
