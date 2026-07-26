import XCTest
@testable import Meeshy

/// Iteration 220i — the mood composer's publish CTA and VoiceOver.
///
/// `publishToolbarButton` is the **only** primary action of `StatusComposerView`,
/// and it carried no accessibility modifier at all. Two real consequences:
///
/// - **While publishing**, the button's label is a bare `ProgressView()`. With no
///   `.accessibilityLabel`, the control loses its accessible name at the exact
///   moment the user wants to know what is happening.
/// - **While disabled** (no mood picked — the composer's opening state), the only
///   perceivable difference is the *colour* of the text
///   (`MeeshyColors.brandGradient` → `theme.textMuted`). That is state conveyed by
///   colour alone (WCAG 1.4.1), and nothing — visible or spoken — says *why* the
///   action is unavailable.
///
/// The fix mirrors the proven sibling `FeedView.swift:1240-1273`, whose feed
/// composer publish button has the identical shape (`ProgressView` in flight,
/// `Text` otherwise, `.disabled(!hasContent || inFlight)`) and already carries
/// label + hint + conditional value.
///
/// The accessible name reuses the key of the **visible** text
/// (`status.composer.publish`), so the accessible name contains the displayed
/// label (WCAG 2.5.3 *Label in Name*) and survives the swap to `ProgressView`.
@MainActor
final class StatusComposerPublishAccessibilityTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let composerView = "Meeshy/Features/Main/Views/StatusComposerView.swift"
    private static let catalog = "Meeshy/Localizable.xcstrings"

    /// Locales the string catalogue ships. `fr` is the source language and is
    /// present as an explicit unit on the manually authored keys.
    private static let locales = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private static let publishingKey = "status.composer.a11y.publish.publishing"
    private static let disabledKey = "status.composer.a11y.publish.disabled"
    private static let hintKey = "status.composer.a11y.publish.hint"

    private func composerSource() throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(Self.composerView), encoding: .utf8)
    }

    /// The slice of source that starts at the `publishToolbarButton` declaration
    /// and runs to the end of its computed property (the next `// MARK:`).
    ///
    /// Anchoring matters: `StatusComposerView` already carries accessibility
    /// modifiers elsewhere (the emoji grid and the visibility capsules both got
    /// `.accessibilityAddTraits` in 184i, the decorative glyphs got
    /// `.accessibilityHidden` in 213i). A whole-file `contains` would therefore go
    /// green on those and prove nothing about the publish button.
    private func publishButtonSlice() throws -> String {
        let source = try composerSource()
        let start = try XCTUnwrap(
            source.range(of: "private var publishToolbarButton: some View {"),
            "publishToolbarButton was renamed or removed — re-anchor this suite."
        )
        let rest = source[start.upperBound...]
        guard let end = rest.range(of: "// MARK:") else { return String(rest) }
        return String(rest[..<end.lowerBound])
    }

    // MARK: - The button keeps a name, in every state

    func test_publishButton_hasAccessibleNameMatchingItsVisibleLabel() throws {
        let slice = try publishButtonSlice()

        XCTAssertTrue(
            slice.contains(".inFlightActionAccessibility("),
            "The publish button must carry an explicit accessible name: while isPublishing its own " +
            "label is a bare ProgressView, so without one the only primary action of the screen has " +
            "no accessible name. 221i moved the rule into a shared modifier — this surface must go " +
            "through it rather than re-stating it inline."
        )
        XCTAssertTrue(
            slice.contains(#"String(localized: "status.composer.publish""#),
            "The accessible name must reuse the key of the visible text (status.composer.publish) so " +
            "it contains the displayed label — WCAG 2.5.3 Label in Name — instead of introducing a " +
            "second wording VoiceOver would speak but the screen never shows."
        )
    }

    func test_publishButton_announcesTheInFlightState() throws {
        let slice = try publishButtonSlice()

        XCTAssertTrue(
            slice.contains("isInFlight:"),
            "The publish button must expose a value: the label stays constant, so the transient " +
            "states have to be carried by the value (mirrors FeedView's publish button)."
        )
        XCTAssertTrue(
            slice.contains("isPublishing") && slice.contains(Self.publishingKey),
            "The in-flight state must be spoken and must be driven by isPublishing — the ProgressView " +
            "that replaces the text is invisible to VoiceOver."
        )
    }

    func test_publishButton_explainsWhyItIsUnavailable() throws {
        let slice = try publishButtonSlice()

        XCTAssertTrue(
            slice.contains(Self.disabledKey),
            "The disabled state must state its reason. Visually it is signalled by colour only " +
            "(brandGradient → textMuted), which fails WCAG 1.4.1 on its own."
        )
        XCTAssertTrue(
            slice.contains("selectedEmoji == nil"),
            "The unavailable reason must be driven by the same condition as .disabled(), otherwise " +
            "VoiceOver can claim the button is unavailable while it is operable, or the reverse."
        )
        XCTAssertTrue(
            slice.contains(".accessibilityHint("),
            "The publish button must carry a hint describing its outcome, as its FeedView sibling does."
        )
        XCTAssertTrue(
            slice.contains(Self.hintKey),
            "The hint must come from the file's own status.composer.a11y.publish namespace."
        )
    }

    // MARK: - Accessibility-only change: the visual is untouched

    func test_publishButton_stillRendersAProgressViewInFlight() throws {
        let slice = try publishButtonSlice()

        XCTAssertTrue(
            slice.contains("if isPublishing {") && slice.contains("ProgressView()"),
            "220i is accessibility-only: the in-flight branch must still render the ProgressView, and " +
            "the text branch its localized 'Publier'."
        )
        XCTAssertTrue(
            slice.contains(".disabled(selectedEmoji == nil || isPublishing)"),
            "The enablement rule must be unchanged — the iteration adds announcements, not behaviour."
        )
    }

    // MARK: - The three new keys are actually localized

    func test_newAccessibilityKeys_areTranslatedInEveryShippedLocale() throws {
        let data = try Data(contentsOf: Self.appRoot.appendingPathComponent(Self.catalog))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])

        for key in [Self.publishingKey, Self.disabledKey, Self.hintKey] {
            let entry = try XCTUnwrap(
                strings[key] as? [String: Any],
                "\(key) is missing from Localizable.xcstrings. These three keys are authored by hand " +
                "precisely so VoiceOver speaks them translated rather than falling back to the French " +
                "defaultValue for every locale."
            )
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], "\(key) has no localizations")

            for locale in Self.locales {
                let unit = try XCTUnwrap(
                    (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any],
                    "\(key) is missing the \(locale) localization"
                )
                XCTAssertEqual(
                    unit["state"] as? String, "translated",
                    "\(key) must be translated in \(locale), not left in a needs_review state."
                )
                let value = (unit["value"] as? String) ?? ""
                XCTAssertFalse(value.isEmpty, "\(key) has an empty \(locale) value")
            }
        }
    }
}
