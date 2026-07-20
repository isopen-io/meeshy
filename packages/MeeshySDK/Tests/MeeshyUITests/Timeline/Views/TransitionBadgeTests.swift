import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class TransitionBadgeTests: XCTestCase {

    func test_init_crossfade_doesNotCrash() {
        let badge = TransitionBadge(
            id: "t-1",
            kind: .crossfade,
            duration: 0.5,
            isSelected: false,
            isDark: false,
            anchorX: 100,
            laneHeight: 44,
            onTap: {},
            onLongPress: {},
            onDurationDelta: { _ in }
        )
        _ = badge.body
        let expectedCrossfade = String(localized: "story.timeline.transition.kind.crossfade", bundle: .module)
        XCTAssertTrue(badge.accessibilityComposed.contains(expectedCrossfade))
    }

    func test_init_dissolve_rendersIdenticallyToCrossfade() {
        // Dissolve degrades to a crossfade opacity ramp everywhere it's actually
        // rendered (editor preview, reader, MP4 export — see
        // ReaderTransitionResolver.liveRenderableTransition) — the badge must not
        // promise a distinct look nothing renders. A legacy .dissolve transition
        // reads exactly like a crossfade one now.
        let dissolveBadge = TransitionBadge(
            id: "t-2", kind: .dissolve, duration: 0.3,
            isSelected: false, isDark: false, anchorX: 200, laneHeight: 44,
            onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
        )
        let crossfadeBadge = TransitionBadge(
            id: "t-1", kind: .crossfade, duration: 0.3,
            isSelected: false, isDark: false, anchorX: 200, laneHeight: 44,
            onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
        )
        let expectedCrossfade = String(localized: "story.timeline.transition.kind.crossfade", bundle: .module)
        XCTAssertTrue(dissolveBadge.accessibilityComposed.contains(expectedCrossfade))
        XCTAssertEqual(dissolveBadge.accessibilityComposed, crossfadeBadge.accessibilityComposed)
    }
}
