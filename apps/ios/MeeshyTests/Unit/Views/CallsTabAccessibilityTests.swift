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

    /// Loud by construction (`XCTFail`, never a silent skip) AND bounded: an
    /// unbounded `source[range.lowerBound...]` window (the previous shape of
    /// this helper) can silently match content belonging to a LATER,
    /// unrelated declaration and let an assertion pass for the wrong reason.
    /// `endMarker` is therefore mandatory except where the start marker is
    /// provably the last declaration in the file (`endMarker: nil`), which is
    /// the sole legitimate case for an open-ended window.
    private func vicinity(
        in source: String,
        from startMarker: String,
        to endMarker: String?,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> String? {
        guard let start = source.range(of: startMarker) else {
            XCTFail("CallsTab.swift: start marker not found — \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let endMarker else {
            return String(source[start.lowerBound...])
        }
        guard let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex) else {
            XCTFail("CallsTab.swift: end marker not found — \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_callRowDialButton_hasAccessibilityHint() throws {
        let source = try callsTabSource()
        // `CallRowDialButton` is the last declaration in the file — no next
        // sibling to bound against, so an open-ended window is legitimate here.
        guard let vicinity = vicinity(in: source, from: "private struct CallRowDialButton", to: nil) else { return }
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
        guard let vicinity = vicinity(in: source, from: "private func chip(", to: "// MARK: - Content") else { return }
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
        guard let vicinity = vicinity(
            in: source, from: "private struct CallJournalRow", to: "// MARK: - Dial Button (audio / video menu)"
        ) else { return }
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
