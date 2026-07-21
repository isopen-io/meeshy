import XCTest

/// Source-level accessibility guard for `ContactRow` in the Share Extension
/// (`MeeshyShareExtension/ShareViewController.swift`), the row a user taps to
/// pick which contact to share to.
///
/// The row signalled its *selected* state to sighted users with a blue
/// background tint plus a conditional `checkmark.circle.fill` glyph, but
/// carried **no** `.accessibilityAddTraits(.isSelected)` — so VoiceOver
/// announced the selected row identically to every other row (WCAG 1.4.1
/// Use of Color / 4.1.2 Name, Role, Value). It also lacked any
/// `.accessibilityElement(children: .combine)`, leaving the decorative avatar
/// initials and the checkmark glyph to be read as loose, meaningless elements.
final class ShareExtensionContactRowAccessibilityTests: XCTestCase {

    private func shareViewControllerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("MeeshyShareExtension/ShareViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func contactRowVicinity() throws -> String {
        let source = try shareViewControllerSource()
        guard let range = source.range(of: "struct ContactRow: View") else {
            XCTFail("ShareViewController.swift must define ContactRow"); return ""
        }
        return String(source[range.lowerBound...])
    }

    func test_contactRow_exposesSelectedStateToVoiceOver() throws {
        let vicinity = try contactRowVicinity()
        XCTAssertTrue(
            vicinity.contains(".accessibilityAddTraits(") && vicinity.contains(".isSelected"),
            "ContactRow conveys selection only via a blue tint + checkmark glyph — VoiceOver " +
            "users can't tell which contact is selected without an .isSelected trait."
        )
    }

    func test_contactRow_combinesChildrenIntoOneElement() throws {
        let vicinity = try contactRowVicinity()
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .combine)"),
            "ContactRow must combine its children so VoiceOver reads one coherent element " +
            "(name + status) instead of loose decorative fragments."
        )
    }

    func test_contactRow_hidesDecorativeCheckmarkGlyph() throws {
        let vicinity = try contactRowVicinity()
        guard let checkmarkRange = vicinity.range(of: "checkmark.circle.fill") else {
            XCTFail("ContactRow must render the selection checkmark glyph"); return
        }
        let afterCheckmark = String(vicinity[checkmarkRange.upperBound...])
        XCTAssertTrue(
            afterCheckmark.contains(".accessibilityHidden(true)"),
            "The selection checkmark is decorative — its meaning is now carried by the " +
            ".isSelected trait, so it must be hidden from VoiceOver."
        )
    }
}
