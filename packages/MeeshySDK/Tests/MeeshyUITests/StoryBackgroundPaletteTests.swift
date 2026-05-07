import XCTest
import SwiftUI
@testable import MeeshyUI

final class StoryBackgroundPaletteTests: XCTestCase {

    @MainActor
    func test_randomBackgroundColorAsColor_returnsNonClearColor() {
        let color = StoryBackgroundPalette.randomBackgroundColorAsColor()
        XCTAssertNotEqual(color, .clear)
    }

    @MainActor
    func test_randomBackgroundColor_repeatedCalls_produceDistinctValues() {
        // Probabilistic but robust: 10 random HSB samples should yield > 1 unique value.
        var hexes: Set<String> = []
        for _ in 0..<10 {
            hexes.insert(StoryBackgroundPalette.randomBackgroundColor())
        }
        XCTAssertGreaterThan(hexes.count, 1)
    }
}
