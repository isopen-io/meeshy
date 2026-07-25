import XCTest

/// Source-level accessibility guard for the contact row in `ContactsListTab`.
///
/// The row applies `.accessibilityElement(children: .combine)` and then an
/// explicit `.accessibilityLabel`, which (per SwiftUI semantics) REPLACES the
/// combined children. The composed label must therefore restate everything the
/// row shows visually — the display name, the `@username`, and the presence
/// detail ("en ligne" / "vu il y a X" / "hors ligne") — otherwise VoiceOver
/// users only hear the name and a generic online/offline flag while sighted
/// users also read the handle and when the contact was last seen.
final class ContactsListTabAccessibilityTests: XCTestCase {

    private func contactsListTabSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Contacts/ContactsListTab.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_contactRow_composesAccessibilityLabelViaHelper() throws {
        let source = try contactsListTabSource()
        XCTAssertTrue(
            source.contains(".accessibilityLabel(contactRowAccessibilityLabel(user, isOnline: isOnline))"),
            "The contact row must compose its VoiceOver label via contactRowAccessibilityLabel(_:isOnline:)."
        )
    }

    func test_contactRowAccessibilityLabel_restatesHandleAndPresence() throws {
        let source = try contactsListTabSource()
        guard let range = source.range(of: "private func contactRowAccessibilityLabel(") else {
            XCTFail("ContactsListTab.swift must define contactRowAccessibilityLabel(_:isOnline:)"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains("@\\(user.username)"),
            "The composed label must restate the @username the row shows visually — an " +
            "explicit .accessibilityLabel drops the combined children."
        )
        XCTAssertTrue(
            vicinity.contains("contacts.list.last-seen") && vicinity.contains("relativeTimeString"),
            "The composed label must restate the 'last seen X' relative time that the row " +
            "shows visually when the contact is offline (WCAG 1.3.1)."
        )
        XCTAssertTrue(
            vicinity.contains("contacts.list.online.lower") && vicinity.contains("contacts.list.offline.lower"),
            "The composed label must announce the online/offline presence state."
        )
    }
}
