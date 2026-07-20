import XCTest

/// Source-level accessibility guard for `MessageMoreSheet` (the "Plus…" grid of
/// exploration pellets shown from a message's long-press menu).
///
/// Two VoiceOver gaps this locks down:
///  1. An exploration pellet's *open* state (its inline content is expanded) was
///     signalled ONLY by color — fill/stroke opacity and label tint — with no
///     `.isSelected` trait, so a VoiceOver user could not tell which pellet was
///     active (WCAG 1.4.1). The `pellet(_:index:)` builder must add the trait.
///  2. The inline header's close button is an icon-only `xmark.circle.fill`
///     `Button` with `.buttonStyle(.plain)`; without an `.accessibilityLabel`
///     VoiceOver falls back to the raw symbol name.
final class MessageMoreSheetAccessibilityTests: XCTestCase {

    private func messageMoreSheetSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_pellet_exposesActiveStateToVoiceOver() throws {
        let source = try messageMoreSheetSource()
        guard let range = source.range(of: "private func pellet(") else {
            XCTFail("MessageMoreSheet.swift must define the pellet() builder"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains(".accessibilityAddTraits(") && vicinity.contains("isActive"),
            "An open exploration pellet only conveys its active state via color — " +
            "VoiceOver users can't tell which pellet is expanded without an " +
            ".isSelected trait driven by isActive."
        )
    }

    func test_inlineCloseButton_hasAccessibilityLabel() throws {
        let source = try messageMoreSheetSource()
        guard let range = source.range(of: "xmark.circle.fill") else {
            XCTFail("MessageMoreSheet.swift must render the inline close button"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel(") && vicinity.contains("common.close"),
            "The icon-only inline close button must carry an accessibility label " +
            "(reusing the SSOT common.close key) — otherwise VoiceOver reads the " +
            "raw SF Symbol name."
        )
    }
}
