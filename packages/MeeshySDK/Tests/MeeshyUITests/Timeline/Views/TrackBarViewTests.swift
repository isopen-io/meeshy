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

    func test_labelColumnWidth_isNarrowTwoLineColumn() {
        // Colonne deux-lignes (icône + durée / type) : bien plus étroite que
        // l'ancienne colonne texte 72pt tout en tenant "IMAGE_1"/"3,2 s".
        // Elle DOIT égaler `TimelineScrubArea.laneLabelWidth` (offset
        // ruler/playhead) sinon ticks et pistes se désalignent (round 2026-07-19).
        XCTAssertEqual(TrackBarView<Color>.labelColumnWidth, 52, accuracy: 0.01)
        XCTAssertEqual(TrackBarView<Color>.labelColumnWidth,
                       TimelineScrubArea<Color>.laneLabelWidth, accuracy: 0.01,
                       "La colonne d'étiquette et l'offset ruler/playhead doivent rester en lockstep.")
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

    func test_accessibilityLabel_appendsDurationWhenPresent() {
        let view = TrackBarView(
            title: "Vidéo 1", isLocked: false, isSelected: false,
            tintHex: "6366F1", isDark: false, laneWidth: 600, laneHeight: 52,
            iconName: "video.fill", durationLabel: "3,2 s", typeLabel: "VIDEO_1"
        ) { Color.clear }
        XCTAssertEqual(view.accessibilityComposedLabel, "Vidéo 1 — 3,2 s")
    }

    func test_formatTrackDuration_subMinute_usesSecondsWithComma() {
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(3.2), "3,2 s")
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(0), "0,0 s")
    }

    func test_formatTrackDuration_overMinute_usesClock() {
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(64), "1:04")
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(125), "2:05")
    }
}
