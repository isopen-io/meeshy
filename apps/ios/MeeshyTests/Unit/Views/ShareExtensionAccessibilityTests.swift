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

    /// A whole top-level type declaration, bounded by the next one. Preferred over
    /// `vicinity(after:span:)` when the region is a type body: a fixed span silently
    /// stops covering the tail as the type grows, and can bleed into its neighbour —
    /// both of which would make an assertion pass or fail for the wrong reason.
    private func declaration(of typeName: String, in source: String) throws -> String {
        let anchor = "struct \(typeName): View"
        guard let range = source.range(of: anchor) else {
            XCTFail("ShareViewController must declare \(typeName)")
            return ""
        }
        let rest = source[range.upperBound...]
        let end = rest.range(of: "\nstruct ")?.lowerBound ?? source.endIndex
        return String(rest[..<end])
    }

    // MARK: - Contact row
    //
    // The row's VoiceOver contract (`children: .combine`, `.isButton` + `.isSelected`,
    // decorative checkmark hidden) landed via #2346 and is guarded by
    // `ShareExtensionLocalizationTests.test_contactRow_exposesButtonAndSelectionTraits`.
    // Deliberately not duplicated here — one owner per invariant, and that design is
    // the merged one.

    // MARK: - Action-button labels
    //
    // Their localization is owned by `ShareExtensionLocalizationTests`
    // (`test_actionButtonsAndTitleAreLocalized` + the catalogue-coverage tests).

    // MARK: - Shared-item preview tiles

    func test_sharedItemPreview_exposesOneNamedElementPerTile() throws {
        // Each tile is a decorative SF Symbol plus an optional caption. Un-collapsed,
        // VoiceOver read the glyph ("Doc Text Fill") as content; the .image case
        // carried no text at all and was announced as a bare, nameless image.
        let source = try shareSource()
        let nearPreview = try declaration(of: "SharedItemPreview", in: source)
        XCTAssertTrue(
            nearPreview.contains(".accessibilityElement(children: .ignore)"),
            "SharedItemPreview must collapse its glyph and caption into a single element so the " +
            "decorative SF Symbol stops being announced as content."
        )
        XCTAssertTrue(
            nearPreview.contains(".accessibilityLabel(typeName)"),
            "Every tile — including the .image case, which prints no caption — must be named " +
            "after the kind of content being shared."
        )
        XCTAssertTrue(
            nearPreview.contains(".accessibilityValue(spokenContent)"),
            "Collapsing the tile must not drop the shared text/URL preview; it belongs in the value."
        )
    }

    func test_sharedItemPreview_namesEveryContentKind() throws {
        // typeName must be total over SharedItemType: a missing case would leave a
        // tile unnamed, which is precisely the .image defect this fixes.
        let source = try shareSource()
        let nearTypeName = try vicinity(after: "private var typeName: String", in: source, span: 800)
        for key in [
            "share.type.text", "share.type.url", "share.type.image",
            "share.type.video", "share.type.file", "share.type.location"
        ] {
            XCTAssertTrue(
                nearTypeName.contains("\"\(key)\""),
                "\(key) must be part of the spoken tile name so no SharedItemType is left unnamed."
            )
        }
        // The three kinds that already print a caption must speak that same caption's
        // key, so the collapsed element cannot drift from what is on screen.
        for reusedKey in ["share.type.video", "share.type.file", "share.type.location"] {
            XCTAssertEqual(
                source.components(separatedBy: "\"\(reusedKey)\"").count - 1, 2,
                "\(reusedKey) must appear exactly twice — once as the visible caption, once as the " +
                "spoken name — rather than being duplicated under a new a11y-only key."
            )
        }
    }

    // MARK: - Section heading

    func test_sendToHeading_isExposedToTheRotor() throws {
        let source = try shareSource()
        let nearHeading = try vicinity(after: "share.sendTo", in: source, span: 300)
        XCTAssertTrue(
            nearHeading.contains(".accessibilityAddTraits(.isHeader)"),
            "The 'Send to' section title must carry .isHeader so VoiceOver's Headings rotor can " +
            "jump straight to the contact list."
        )
    }

    // MARK: - Action buttons

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
