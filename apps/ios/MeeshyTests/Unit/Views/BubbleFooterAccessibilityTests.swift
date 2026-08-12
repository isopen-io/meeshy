import XCTest

/// Source-level accessibility guard for `BubbleFooter.footerFlagPill` — the
/// per-language flags of the message bubble's translation flag strip (the entry
/// point of the Prisme Linguistique: original + system + regional/custom +
/// device locale, tap to reveal a secondary language inline).
///
/// The active flag is signalled ONLY by visuals: a larger `.caption` font and a
/// colored underline (`RoundedRectangle`) shown when `flag.isActive`. The `Button`
/// carries an `.accessibilityLabel` (the language name) but, without an
/// `.isSelected` trait driven by `flag.isActive`, a VoiceOver user cannot tell
/// which language is currently displayed on the bubble (WCAG 1.4.1). This locks
/// down the trait so it can't regress. Mirrors the proven sibling
/// `CallsTab.chip` / `ContactsListTab` filter-pill guards.
final class BubbleFooterAccessibilityTests: XCTestCase {

    private func bubbleFooterSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_footerFlagPill_exposesActiveLanguageToVoiceOver() throws {
        let source = try bubbleFooterSource()
        guard let range = source.range(of: "private func footerFlagPill(") else {
            XCTFail("BubbleFooter.swift must define the footerFlagPill() builder"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains(".accessibilityAddTraits(") && vicinity.contains("flag.isActive"),
            "The active translation flag only conveys its state via font size and a " +
            "colored underline — VoiceOver users can't tell which language is displayed " +
            "without an .isSelected trait driven by flag.isActive."
        )
    }
}
