import XCTest
import SwiftUI
@testable import Meeshy

final class LentilleRowScaledHeightTests: XCTestCase {

    func test_rowHeight_atDefaultSize_equals84() {
        XCTAssertEqual(LentilleMetrics.Row.height(for: .large), 84)
        XCTAssertEqual(LentilleMetrics.Row.height, 84)
    }

    func test_rowHeight_atAccessibilityXXXL_isGreaterThanDefaultAndFitsTwoLines() {
        let height = LentilleMetrics.Row.height(for: .accessibility5)
        XCTAssertGreaterThan(height, LentilleMetrics.Row.height(for: .large))
        XCTAssertGreaterThanOrEqual(height, LentilleMetrics.Row.height * 1.5)
        XCTAssertLessThanOrEqual(height, LentilleMetrics.Row.height * LentilleMetrics.Row.maxScale)
    }

    func test_rowHeight_growsMonotonicallyWithTextSize() {
        let sizes: [DynamicTypeSize] = [.large, .xLarge, .xxLarge, .xxxLarge, .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5]
        let heights = sizes.map { LentilleMetrics.Row.height(for: $0) }
        XCTAssertEqual(heights, heights.sorted())
    }
}
