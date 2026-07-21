import XCTest

/// Source-level accessibility guard for the contact row in `ContactsListTab`.
/// The row applies `.accessibilityElement(children: .combine)` and then an
/// explicit `.accessibilityLabel`, which (per SwiftUI semantics) REPLACES the
/// combined children. The composed label must therefore restate everything the
/// row shows visually — the `@username` handle and the online / last-seen line —
/// otherwise VoiceOver users only hear the display name and a bare presence word
/// while sighted users also see who the contact is (disambiguating two people
/// with the same display name) and when they were last active.
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

    func test_contactRow_accessibilityLabelIncludesHandleAndLastSeen() throws {
        let source = try contactsListTabSource()
        guard let range = source.range(of: "private func contactRowAccessibilityLabel") else {
            XCTFail("ContactsListTab.swift must define contactRowAccessibilityLabel"); return
        }
        let vicinity = String(source[range.lowerBound...])
        XCTAssertTrue(
            vicinity.contains("\"@\\(username)\""),
            "The composed contact-row label must include the @username handle — it " +
            "disambiguates two contacts sharing a display name and is dropped by the " +
            "explicit label that overrides children: .combine."
        )
        XCTAssertTrue(
            vicinity.contains("contacts.list.last-seen"),
            "The composed contact-row label must include the last-seen time for offline " +
            "contacts — sighted users read \"Vu il y a X\", VoiceOver users must too."
        )
    }

    func test_contactRow_labelDelegatesToComposedHelper() throws {
        let source = try contactsListTabSource()
        XCTAssertTrue(
            source.contains(".accessibilityLabel(contactRowAccessibilityLabel("),
            "The contact row must route its accessibilityLabel through the composed " +
            "helper rather than an inline name-plus-presence string."
        )
    }
}
