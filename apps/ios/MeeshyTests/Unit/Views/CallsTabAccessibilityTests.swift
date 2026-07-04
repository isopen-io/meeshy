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
}
