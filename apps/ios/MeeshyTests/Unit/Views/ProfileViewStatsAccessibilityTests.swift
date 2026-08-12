import XCTest

/// Source-level accessibility guard for the stats card in `ProfileView.statsSection`.
///
/// The three `statCard`s live inside a `Button` that opens the detailed-stats
/// screen. Without an accessibility grouping, VoiceOver read the values and
/// their labels as scattered fragments and never announced that tapping the
/// card opens anything. The button must expose a single, coherent element:
/// an `.accessibilityElement(children: .ignore)` with a composed label pairing
/// each value with its noun, plus a hint describing the (non-obvious) action.
final class ProfileViewStatsAccessibilityTests: XCTestCase {

    private func profileViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ProfileView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_statsSection_collapsesButtonIntoOneElementWithHint() throws {
        let source = try profileViewSource()
        guard let range = source.range(of: "private var statsSection") else {
            XCTFail("ProfileView.swift must define statsSection"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .ignore)"),
            "The stats Button must collapse its stat-card fragments into one VoiceOver element."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel(statsAccessibilityLabel)"),
            "The stats Button must expose a composed label via statsAccessibilityLabel."
        )
        XCTAssertTrue(
            vicinity.contains("profile.stats.a11y.hint"),
            "The stats Button must carry a hint — the card looks static but opens the detailed-stats screen."
        )
    }

    func test_statsAccessibilityLabel_pairsEachValueWithItsNoun() throws {
        let source = try profileViewSource()
        guard let range = source.range(of: "private var statsAccessibilityLabel") else {
            XCTFail("ProfileView.swift must define statsAccessibilityLabel"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains("profile.section.stats"),
            "The composed label must frame the values with the 'Statistiques' section title."
        )
        for key in ["profile.stats.messages", "profile.stats.conversations", "profile.stats.friends"] {
            XCTAssertTrue(
                vicinity.contains(key),
                "The composed label must restate the \(key) card so each value is paired with its noun."
            )
        }
    }
}
