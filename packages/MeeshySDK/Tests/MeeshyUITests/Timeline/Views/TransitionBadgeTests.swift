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
        XCTAssertTrue(badge.accessibilityComposed.contains("Fondu"))
    }

    func test_init_dissolve_label() {
        let badge = TransitionBadge(
            id: "t-2", kind: .dissolve, duration: 0.3,
            isSelected: false, isDark: false, anchorX: 200, laneHeight: 44,
            onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
        )
        XCTAssertTrue(badge.accessibilityComposed.contains("Dissolution"))
    }
}
