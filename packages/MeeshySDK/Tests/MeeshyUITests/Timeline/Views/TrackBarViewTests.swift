import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TrackBarViewTests: XCTestCase {

    func test_init_doesNotCrash_emptyContent() {
        let view = TrackBarView(
            title: "Vidéo 1",
            isLocked: false,
            isSelected: false,
            tintHex: "6366F1",
            isDark: false,
            laneWidth: 600,
            laneHeight: 44
        ) { Color.clear }
        _ = view.body
    }

    func test_lockedLabel_includesLockBadge() {
        // Locked tracks must expose 🔒 in their accessibilityLabel suffix
        let view = TrackBarView(
            title: "Vidéo 1",
            isLocked: true,
            isSelected: false,
            tintHex: "6366F1",
            isDark: false,
            laneWidth: 600,
            laneHeight: 44
        ) { Color.clear }
        XCTAssertTrue(view.accessibilityComposedLabel.contains("Vidéo 1"))
        XCTAssertTrue(view.accessibilityComposedLabel.lowercased().contains("verrouill"))
    }
}
