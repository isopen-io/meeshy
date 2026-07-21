import XCTest

/// Source-level accessibility guard for `CallRowDialButton` (the redial menu
/// on each call-journal row in `CallsTab`). The Menu's label ("Rappeler")
/// alone doesn't tell VoiceOver users it opens a choice between an audio and
/// a video call — every comparable action elsewhere in the calling UI
/// (incoming accept/decline, in-call controls) pairs a label with a hint.
final class CallsTabAccessibilityTests: XCTestCase {

    private func callsTabSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Contacts/CallsTab.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callRowDialButton_hasAccessibilityHint() throws {
        let source = try callsTabSource()
        guard let range = source.range(of: "private struct CallRowDialButton") else {
            XCTFail("CallsTab.swift must define CallRowDialButton"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains("calls.redial") && vicinity.contains(".accessibilityLabel("),
            "CallRowDialButton must carry an accessibility label."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityHint("),
            "CallRowDialButton must carry an accessibility hint — its label alone " +
            "(\"Rappeler\") doesn't tell VoiceOver users it opens a choice between an " +
            "audio and a video call."
        )
    }

    func test_filterChip_exposesSelectedStateToVoiceOver() throws {
        let source = try callsTabSource()
        guard let range = source.range(of: "private func chip(") else {
            XCTFail("CallsTab.swift must define the filter chip() builder"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains(".accessibilityAddTraits(") && vicinity.contains("isSelected"),
            "The Tous/Manques filter chips only convey selection via color — VoiceOver " +
            "users can't tell which filter is active without an .isSelected trait."
        )
    }

    /// The row's `.accessibilityElement(children: .combine)` is overridden by an explicit
    /// `.accessibilityLabel`, which (per SwiftUI semantics) REPLACES the combined children.
    /// The composed label must therefore restate everything the row shows visually — call
    /// type (audio/video), age, and duration — otherwise VoiceOver users only hear the name
    /// and direction while sighted users also see whether it was a video call, when, and how
    /// long it lasted.
    func test_callJournalRow_accessibilityLabelIncludesTypeTimeAndDuration() throws {
        let source = try callsTabSource()
        guard let range = source.range(of: "private struct CallJournalRow") else {
            XCTFail("CallsTab.swift must define CallJournalRow"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains("rowAccessibilityLabel(name:"),
            "CallJournalRow must compose its VoiceOver label via rowAccessibilityLabel(name:)."
        )
        XCTAssertTrue(
            vicinity.contains("calls.type.video") && vicinity.contains("calls.type.audio"),
            "The composed label must announce whether the call was audio or video — the " +
            "video badge is otherwise conveyed by icon alone (WCAG 1.3.1)."
        )
        XCTAssertTrue(
            vicinity.contains("relativeTimeString") && vicinity.contains("durationLabel"),
            "The composed label must restate the call age and duration that the row shows " +
            "visually — an explicit .accessibilityLabel drops the combined children."
        )
    }
}
