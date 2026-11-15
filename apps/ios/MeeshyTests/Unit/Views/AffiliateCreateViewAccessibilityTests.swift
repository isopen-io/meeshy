import XCTest
@testable import Meeshy

/// `AffiliateCreateView` is the twin of `CreateTrackingLinkView`: both are
/// "create a link" forms with two text fields, a primary CTA and an inline error.
/// The tracking-link screen had already been made accessible; the affiliate one
/// never was, so the same four defects survived on it alone.
///
/// The pivotal one is the field labelling. A `Text` placed *above* a `TextField`
/// is a separate accessibility element — it does not become the field's label.
/// VoiceOver therefore announced each field by its **placeholder**
/// ("Ex: Invitation Twitter", "Illimite"), which says nothing about what the
/// field is for (WCAG 1.3.1 / 3.3.2).
@MainActor
final class AffiliateCreateViewAccessibilityTests: XCTestCase {

    private var source: String {
        get throws {
            try String(
                contentsOf: URL(fileURLWithPath: #filePath)
                    .deletingLastPathComponent()
                    .deletingLastPathComponent()
                    .deletingLastPathComponent()
                    .deletingLastPathComponent()
                    .appendingPathComponent("Meeshy/Features/Links/Views/AffiliateCreateView.swift"),
                encoding: .utf8
            )
        }
    }

    /// Code with comment lines stripped — the doc-comments deliberately name the
    /// very APIs under test, so a raw `contains` would pass on prose alone.
    private var code: String {
        get throws {
            try source
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
        }
    }

    private var formFieldSource: String {
        get throws {
            try String(
                contentsOf: URL(fileURLWithPath: #filePath)
                    .deletingLastPathComponent()
                    .deletingLastPathComponent()
                    .deletingLastPathComponent()
                    .deletingLastPathComponent()
                    .appendingPathComponent("Meeshy/Features/Links/Views/LinksHubView.swift"),
                encoding: .utf8
            )
        }
    }

    // MARK: - Field labelling (retournée au kit, #18429)

    /// The two fields are the kit's `MeeshyField`, through the links form field
    /// that renders the visible caption above it. No hand-rolled `TextField` is left.
    func test_bothFields_areKitFieldsThroughTheLinksFormField() throws {
        let code = try code
        XCTAssertEqual(
            code.components(separatedBy: "LinksFormField(").count - 1, 2,
            "Guard: this screen is expected to have exactly two fields — if that changes, the "
            + "assertions below no longer cover all of them."
        )
        XCTAssertFalse(code.contains("TextField("), "The fields are the kit's MeeshyField, never a hand-rolled TextField.")
    }

    /// The label must be the **visible caption**, not a new string: one key per
    /// field, which the links form field renders AND gives to the kit field as its name.
    func test_fieldLabels_reuseTheVisibleCaptionKeys() throws {
        let code = try code
        for key in ["affiliate.create.name.label", "affiliate.create.maxUses.label"] {
            XCTAssertEqual(code.components(separatedBy: key).count - 1, 1, "\(key) names its field once.")
        }
        let field = try formFieldSource
        let declaration = try XCTUnwrap(field.range(of: "struct LinksFormField"))
        let body = String(field[declaration.lowerBound...].prefix(1400))
        XCTAssertTrue(body.contains("Text(label)"), "The caption stays visible.")
        XCTAssertTrue(body.contains(".accessibilityHidden(true)"), "The visible caption is hidden: the kit field already carries it as its name.")
        XCTAssertTrue(body.contains("MeeshyField(\n                accessibilityLabel ?? label"), "The kit field is named by the caption.")
    }

    // MARK: - Primary action

    /// The CTA is the kit's primary button, named by its own title.
    func test_cta_isTheKitPrimaryButton() throws {
        let code = try code
        XCTAssertTrue(code.contains("MeeshySplitActionButton("))
        XCTAssertTrue(code.contains("\"affiliate.create.button\""))
        XCTAssertFalse(code.contains("Image(systemName: \"link.badge.plus\")"), "No decorative glyph left to hide.")
    }

    // MARK: - In-flight state (226i)

    /// While creating, the kit button becomes a ring and SAYS it — the busy title
    /// reuses the tracking-link key, already localised in 7 locales.
    func test_busyState_isSaidByTheKitButton() throws {
        let code = try code
        XCTAssertTrue(code.contains("phase: isCreating"), "The in-flight state drives the button phase.")
        XCTAssertTrue(code.contains(".busy(progress: nil, title: String(localized: \"a11y.tracking.create.in-progress\""))
        XCTAssertFalse(code.contains("a11y.affiliate.create.in-progress"), "No screen-specific busy key should be introduced.")
    }

    // MARK: - Error feedback

    /// The error renders inside the form, well away from the focused CTA, so
    /// VoiceOver never reaches it on its own: the haptic fires and nothing is
    /// said. `CreateTrackingLinkView` announces on the identical failure path.
    func test_createFailure_announcesTheErrorToVoiceOver() throws {
        let code = try code
        XCTAssertTrue(
            code.contains("UIAccessibility.post(notification: .announcement, argument: message)"),
            "A failed creation must be announced, not merely rendered."
        )
        let haptic = try XCTUnwrap(code.range(of: "HapticFeedback.error()"))
        let window = String(code[haptic.lowerBound...].prefix(200))
        XCTAssertTrue(
            window.contains("UIAccessibility.post"),
            "The announcement must sit on the failure path itself, next to the error haptic."
        )
    }
}
