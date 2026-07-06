import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// F6 — `StoryMediaLayer.layoutSublayers()` must (re)derive `cornerRadius` from
/// the CURRENT bounds, proportional to the short side. `configure(...)` already
/// stamps the radius once, but a recycled layer whose bounds are mutated directly
/// by the gesture fast-path (`StoryCanvasUIView`) relies on `layoutSublayers` to
/// keep the rounding (and the foreground frame border that reuses it) correct.
@MainActor
final class StoryMediaLayerLayoutTests: XCTestCase {

    func test_layoutSublayers_setsCornerRadiusProportionalToShortSide() {
        let layer = StoryMediaLayer()
        layer.bounds = CGRect(x: 0, y: 0, width: 200, height: 120)

        layer.layoutSublayers()

        let expected = min(layer.bounds.width, layer.bounds.height)
            * StoryMediaLayer.cornerRadiusFraction
        XCTAssertEqual(layer.cornerRadius, expected, accuracy: 0.01,
                       "cornerRadius must equal min(bounds) × cornerRadiusFraction")
        XCTAssertGreaterThan(layer.cornerRadius, 0)
    }

    func test_layoutSublayers_recomputesCornerRadius_afterBoundsChange() {
        let layer = StoryMediaLayer()
        layer.bounds = CGRect(x: 0, y: 0, width: 100, height: 300)
        layer.layoutSublayers()
        XCTAssertEqual(layer.cornerRadius,
                       100 * StoryMediaLayer.cornerRadiusFraction, accuracy: 0.01,
                       "short side is the width (100) on first layout")

        // Gesture fast-path mutates bounds directly (no reconfigure) — the radius
        // must follow the new short side on the next layout pass.
        layer.bounds = CGRect(x: 0, y: 0, width: 400, height: 80)
        layer.layoutSublayers()
        XCTAssertEqual(layer.cornerRadius,
                       80 * StoryMediaLayer.cornerRadiusFraction, accuracy: 0.01,
                       "short side is now the height (80) → radius recomputed")
    }
}
