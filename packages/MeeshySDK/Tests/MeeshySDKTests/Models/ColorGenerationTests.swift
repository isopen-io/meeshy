import XCTest
@testable import MeeshySDK

final class ColorGenerationTests: XCTestCase {

    func test_blendTwoColors_50_50_returnsAverage() {
        let result = DynamicColorGenerator.blendTwo("FF0000", weight1: 0.5, "0000FF", weight2: 0.5)
        XCTAssertEqual(result, "7F007F")
    }

    func test_blendTwoColors_30_70_weightsAppliedCorrectly() {
        let result = DynamicColorGenerator.blendTwo("FF6B6B", weight1: 0.30, "6366F1", weight2: 0.70)
        XCTAssertEqual(result, "9167C8")
    }

    func test_blendTwoColors_0_100_returnsSecondColor() {
        let result = DynamicColorGenerator.blendTwo("FF0000", weight1: 0.0, "6366F1", weight2: 1.0)
        XCTAssertEqual(result, "6366F1")
    }

    func test_blendTwoColors_100_0_returnsFirstColor() {
        let result = DynamicColorGenerator.blendTwo("FF6B6B", weight1: 1.0, "000000", weight2: 0.0)
        XCTAssertEqual(result, "FF6B6B")
    }

    func test_colorForName_sameInput_returnsSameOutput() {
        let color1 = DynamicColorGenerator.colorForName("Alice")
        let color2 = DynamicColorGenerator.colorForName("Alice")
        XCTAssertEqual(color1, color2)
    }

    func test_colorForName_differentInputs_returnsDifferentColors() {
        let color1 = DynamicColorGenerator.colorForName("Alice")
        let color2 = DynamicColorGenerator.colorForName("Bob")
        XCTAssertNotEqual(color1, color2)
    }
}
