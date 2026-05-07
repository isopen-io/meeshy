import XCTest
import SwiftUI
@testable import MeeshyUI

final class ColorLuminanceTests: XCTestCase {

    func test_white_isCloseToOne() {
        let lum = Color.white.luminance
        XCTAssertGreaterThan(lum, 0.95)
        XCTAssertLessThanOrEqual(lum, 1.0)
    }

    func test_black_isCloseToZero() {
        let lum = Color.black.luminance
        XCTAssertGreaterThanOrEqual(lum, 0.0)
        XCTAssertLessThan(lum, 0.05)
    }

    func test_midGray_isCloseToWCAGLinear() {
        // sRGB 0.5 -> ~0.214 linear (WCAG)
        let lum = Color(red: 0.5, green: 0.5, blue: 0.5).luminance
        XCTAssertGreaterThan(lum, 0.18)
        XCTAssertLessThan(lum, 0.30)
    }

    func test_pureRed_hasExpectedLuminance() {
        // WCAG R coefficient: 0.2126
        let lum = Color(red: 1, green: 0, blue: 0).luminance
        XCTAssertGreaterThan(lum, 0.20)
        XCTAssertLessThan(lum, 0.24)
    }
}
