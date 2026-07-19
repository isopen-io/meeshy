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

    func test_labelColumnWidth_isNarrowIconOnlyColumn() {
        XCTAssertEqual(TrackBarView<Color>.labelColumnWidth, 32, accuracy: 0.01,
                       "Track label column must be icon-only width, not the old 72pt text+icon column — it was stealing horizontal space from the actual timeline (user report 2026-07-18).")
    }

    func test_accessibilityLabel_stillIncludesFullTitle_afterTextRemoval() {
        // Even though the on-screen label drops the Text, VoiceOver users must
        // still hear the full track name — accessibilityComposedLabel is
        // unaffected by the visual change.
        let view = TrackBarView(
            title: "Vidéo 1", isLocked: false, isSelected: false,
            tintHex: "6366F1", isDark: false, laneWidth: 600, laneHeight: 44,
            iconName: "video.fill"
        ) { Color.clear }
        XCTAssertEqual(view.accessibilityComposedLabel, "Vidéo 1")
    }
}
