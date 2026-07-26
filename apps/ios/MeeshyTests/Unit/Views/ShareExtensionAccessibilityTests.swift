import XCTest
@testable import Meeshy

/// Source-introspection guards for the Share Extension's send sheet.
///
/// `MeeshyShareExtension` is a separate `app-extension` target, so its types are
/// not linkable from `MeeshyTests`. These tests therefore assert on the source
/// text — the same idiom used by `ConversationInfoSheetAccessibilityTests` and
/// `CallViewAccessibilityTests`.
@MainActor
final class ShareExtensionAccessibilityTests: XCTestCase {

    private func shareSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("MeeshyShareExtension/ShareViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The vicinity following a source anchor, so an assertion targets the
    /// construct next to that anchor rather than any same-token occurrence
    /// elsewhere in the file.
    private func vicinity(after anchor: String, in source: String, span: Int = 400) throws -> String {
        guard let range = source.range(of: anchor) else {
            XCTFail("ShareViewController must contain \(anchor)")
            return ""
        }
        let end = source.index(range.upperBound, offsetBy: span, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.upperBound ..< end])
    }

    // MARK: - Contact row

    func test_contactRow_exposesSingleAccessibilityElementNamedAfterTheContact() throws {
        // The row is built from an avatar, a name, a status and a checkmark.
        // Without an explicit element VoiceOver stops on each fragment and never
        // conveys that the row as a whole is the thing you activate.
        let source = try shareSource()
        let nearRow = try vicinity(after: "struct ContactRow: View", in: source, span: 2200)
        XCTAssertTrue(
            nearRow.contains(".accessibilityElement(children: .ignore)"),
            "ContactRow must collapse its avatar/name/status/checkmark fragments into one " +
            "accessibility element so VoiceOver offers a single actionable stop."
        )
        XCTAssertTrue(
            nearRow.contains(".accessibilityLabel(contact.name)"),
            "ContactRow's accessible name must be the contact's name."
        )
        XCTAssertTrue(
            nearRow.contains(".accessibilityValue(contact.status ?? \"\")"),
            "The contact's presence status must be exposed as the element's value, not lost " +
            "when the fragments are collapsed."
        )
    }

    func test_contactRow_announcesSelectionBeyondColour() throws {
        // Selection was signalled by a blue tint plus a checkmark glyph only —
        // colour/shape alone (WCAG 1.4.1). The `.isSelected` trait lets iOS
        // announce the state in the user's own language, with no new i18n key.
        let source = try shareSource()
        let nearRow = try vicinity(after: "struct ContactRow: View", in: source, span: 2200)
        XCTAssertTrue(
            nearRow.contains(".accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])"),
            "The selected contact must carry the .isSelected trait so VoiceOver announces the " +
            "current choice instead of leaving it to the blue tint and checkmark."
        )
    }

    func test_contactRow_isActivatedByARealButton() throws {
        // `.onTapGesture` on a plain container gives no `.isButton` trait, no
        // press feedback and no Full Keyboard Access focus. A real Button does.
        let source = try shareSource()
        XCTAssertFalse(
            source.contains(".onTapGesture"),
            "Contact selection must go through a Button, not a bare .onTapGesture container."
        )
        let nearList = try vicinity(after: "ForEach(filteredContacts)", in: source, span: 400)
        XCTAssertTrue(
            nearList.contains("selectedContactId = contact.id") && nearList.contains(".buttonStyle(.plain)"),
            "The contact row must be wrapped in a Button with .buttonStyle(.plain) so the native " +
            "control behaviour is gained without altering the row's appearance."
        )
    }

    // MARK: - Action buttons

    func test_actionButtons_areLocalized() throws {
        // "Cancel" / "Send" / the navigation title were raw literals while the
        // rest of the file already used the String(localized:defaultValue:) form.
        let source = try shareSource()
        XCTAssertFalse(
            source.contains("Button(\"Cancel\")") || source.contains("Button(\"Send\")"),
            "The sheet's action buttons must not carry raw string literals."
        )
        for key in ["share.cancel", "share.send", "share.title"] {
            XCTAssertTrue(
                source.contains("String(localized: \"\(key)\""),
                "\(key) must be declared with String(localized:defaultValue:), matching the " +
                "share.* convention already used by this file."
            )
        }
    }

    func test_sendButton_labelStaysLegibleWhileDisabled() throws {
        // The label was hard-coded to .white over a Color.secondary.opacity(0.2)
        // fill while no contact was picked — white on near-white, ~1.2:1.
        let source = try shareSource()
        XCTAssertTrue(
            source.contains(".foregroundColor(selectedContactId != nil ? .white : .secondary)"),
            "The Send button's label colour must follow its enabled state; .white over the " +
            "disabled grey fill fails WCAG 1.4.3 and reads as a blank button."
        )
    }

    func test_actionButtons_areTappableAcrossTheirWholePill() throws {
        // `.frame(maxWidth:).padding()` applied *outside* a Button styles the
        // pill but leaves the hit region on the text glyph alone. Moving both
        // inside the label makes the whole 44pt-tall pill the touch target.
        let source = try shareSource()
        let nearActions = try vicinity(after: "// Action buttons", in: source, span: 1200)
        XCTAssertEqual(
            nearActions.components(separatedBy: "} label: {").count - 1, 2,
            "Both action buttons must use the trailing-label form so their styling can live inside the label."
        )
        // Text -> .frame(maxWidth: .infinity) -> .padding(), i.e. the sizing sits on the
        // label's own content, which is what defines a Button's hit region.
        let sizedLabels = nearActions.components(
            separatedBy: ".frame(maxWidth: .infinity)\n                            .padding()"
        ).count - 1
        XCTAssertEqual(
            sizedLabels, 2,
            "Both action buttons must carry .frame(maxWidth: .infinity) and .padding() inside their " +
            "label so the entire pill is tappable, not just the text glyph."
        )
    }
}
