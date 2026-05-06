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
}
