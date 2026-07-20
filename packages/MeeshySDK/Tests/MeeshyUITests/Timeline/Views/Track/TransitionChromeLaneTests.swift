import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TransitionChromeLaneTests: XCTestCase {

    func test_badgeWidth_matchesSlideTransitionDuration() {
        // Both opening and closing badges are sized to the SAME fixed
        // duration every effect actually animates over
        // (StoryRenderer.slideTransitionDuration = 0.5s) — not a
        // per-effect-configurable value, since none exists on the model.
        let geometry = TimelineGeometry(zoomScale: 1.0)
        XCTAssertEqual(
            TransitionChromeLane.badgeWidth(geometry: geometry),
            geometry.width(for: 0.5),
            accuracy: 0.01
        )
    }

    func test_init_noEffects_doesNotCrash() {
        let view = TransitionChromeLane(openingEffect: nil, closingEffect: nil,
                                        slideDuration: 10, geometry: TimelineGeometry(zoomScale: 1.0),
                                        isDark: false)
        _ = view.body
    }

    func test_init_bothEffects_doesNotCrash() {
        let view = TransitionChromeLane(openingEffect: .fade, closingEffect: .reveal,
                                        slideDuration: 10, geometry: TimelineGeometry(zoomScale: 1.0),
                                        isDark: false)
        _ = view.body
    }
}
