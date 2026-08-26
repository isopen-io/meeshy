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
                    .appendingPathComponent("Meeshy/Features/Main/Views/AffiliateCreateView.swift"),
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

    // MARK: - Field labelling

    func test_bothTextFields_carryAnAccessibilityLabel() throws {
        let code = try code
        XCTAssertEqual(
            code.components(separatedBy: "TextField(").count - 1, 2,
            "Guard: this screen is expected to have exactly two fields — if that changes, the "
            + "assertions below no longer cover all of them."
        )
        XCTAssertEqual(
            code.components(separatedBy: ".accessibilityLabel(").count - 1, 3,
            "Two fields plus the primary CTA must each carry an explicit label."
        )
    }

    /// The label must be the **visible caption**, not a new string: reusing the
    /// caption's own key keeps voice and screen in step and adds no i18n key.
    func test_fieldLabels_reuseTheVisibleCaptionKeys() throws {
        let code = try code
        for key in ["affiliate.create.name.label", "affiliate.create.maxUses.label"] {
            XCTAssertEqual(
                code.components(separatedBy: key).count - 1, 2,
                "\(key) must appear twice: once rendering the caption, once labelling its field."
            )
        }
    }

    /// Once the caption is the field's label, leaving it visible to VoiceOver
    /// makes it a second stop that reads the same words.
    func test_captions_areHiddenFromVoiceOver() throws {
        let code = try code
        XCTAssertGreaterThanOrEqual(
            code.components(separatedBy: ".accessibilityHidden(true)").count - 1, 3,
            "Both field captions and the decorative CTA glyph must be hidden."
        )
    }

    // MARK: - Primary action

    /// The `link.badge.plus` glyph sits inside the button's label next to the
    /// text, so VoiceOver reads the SF Symbol name ahead of the real label.
    /// Same treatment as the repost glyph in `ComposerMoodSurface.republicationBanner`.
    func test_ctaGlyph_isHiddenAndButtonIsLabelled() throws {
        let code = try code
        let glyph = try XCTUnwrap(code.range(of: "Image(systemName: \"link.badge.plus\")"))
        let window = String(code[glyph.lowerBound...].prefix(220))
        XCTAssertTrue(
            window.contains(".accessibilityHidden(true)"),
            "The CTA glyph must be hidden — anchored to the glyph, since the file hides other views too."
        )
        XCTAssertTrue(
            code.contains(".accessibilityLabel(String(localized: \"affiliate.create.button\""),
            "The CTA keeps an explicit label so hiding the glyph cannot leave it unnamed."
        )
    }

    // MARK: - In-flight state (226i)

    /// While creating, the glyph is swapped for a bare `ProgressView`: sighted
    /// users see a spinner, VoiceOver users hear only "dimmed" and cannot tell
    /// whether the tap registered. The twin button (`CreateTrackingLinkView:136`)
    /// and the mood composer (`MeeshyComposerHost.publishButton`) both carry that transient
    /// state as an `accessibilityValue`; this screen was the last holdout.
    func test_busyState_isCarriedAsAnAccessibilityValue() throws {
        let code = try code
        XCTAssertTrue(
            code.contains(".accessibilityValue(isCreating"),
            "The in-flight state must be exposed as a value on the CTA, not left silent."
        )
        // Reuses the tracking-link key — same action, same words, already
        // localised in 7 locales. A screen-specific key would add an untranslated
        // string for no semantic gain.
        XCTAssertTrue(
            code.contains("a11y.tracking.create.in-progress"),
            "The busy value must reuse the existing localised key rather than mint a new one."
        )
        XCTAssertFalse(
            code.contains("a11y.affiliate.create.in-progress"),
            "No screen-specific busy key should be introduced."
        )
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
