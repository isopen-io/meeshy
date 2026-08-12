import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TransitionChromeLaneTests: XCTestCase {

    /// Both opening and closing badges are sized to the SAME fixed duration
    /// every effect actually animates over (`StoryRenderer.slideTransitionDuration`)
    /// — not a per-effect-configurable value, since none exists on the model.
    ///
    /// The expectation is DERIVED from that constant instead of restating its
    /// current value: it has already moved twice (0.5 → 1.2), and the literal
    /// left behind by the last move turned this witness red on `main` while
    /// the badge was sized exactly as intended.
    func test_badgeWidth_matchesSlideTransitionDuration() {
        let geometry = TimelineGeometry(zoomScale: 1.0)
        XCTAssertEqual(
            TransitionChromeLane.badgeWidth(geometry: geometry),
            geometry.width(for: Float(StoryRenderer.slideTransitionDuration)),
            accuracy: 0.01
        )
    }

    /// The regression the lane's own comment documents: sizing the badge on the
    /// SLIDE duration pushed the closing badge off-screen and widened the whole
    /// timeline container. A badge is a fixed transition window, so it stays far
    /// narrower than a typical slide however long that slide is.
    func test_badgeWidth_isTransitionWindow_notSlideDuration() {
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let tenSecondSlide = geometry.width(for: 10)
        XCTAssertLessThan(TransitionChromeLane.badgeWidth(geometry: geometry), tenSecondSlide)
    }

    /// The badge is a duration rendered through the timeline's px-per-second
    /// contract, so it must breathe with zoom rather than be a fixed point size.
    func test_badgeWidth_scalesWithZoom() {
        let zoomedOut = TransitionChromeLane.badgeWidth(geometry: TimelineGeometry(zoomScale: 1.0))
        let zoomedIn = TransitionChromeLane.badgeWidth(geometry: TimelineGeometry(zoomScale: 2.0))
        XCTAssertEqual(zoomedIn, zoomedOut * 2, accuracy: 0.01)
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
