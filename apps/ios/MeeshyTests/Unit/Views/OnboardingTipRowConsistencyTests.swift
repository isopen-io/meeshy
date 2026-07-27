import XCTest

/// Source-level guard for the onboarding info-card "tip" rows and the skip
/// control of `OnboardingStepViews.swift` (225i).
///
/// Four step views — pseudo, phone, email, identity — each carried a
/// byte-identical `private func tipRow(icon:text:)` whose only difference was the
/// glyph tint, across 17 call sites. None hid the glyph, so VoiceOver announced
/// the SF Symbol name ("Checkmark Circle", "Key Horizontal", "Hand Raised") before
/// every tip: 17 rows of decorative noise on the first screens of the app.
///
/// The skip button had a second, separate defect: a `.accessibilityLabel` that
/// REPLACED its visible label with a different string in a different language
/// ("Skip step" over "Passer cette étape"), so the accessible name did not contain
/// the visible one — WCAG 2.5.3 Label in Name. Removing the override lets the
/// button's own localized label be its name.
///
/// Mirror of `OnboardingRecapStepAccessibilityTests` /
/// `OnboardingLanguageStepAccessibilityTests`.
final class OnboardingTipRowConsistencyTests: XCTestCase {

    private func onboardingStepSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The source with full-line `//` comments removed. Without this, a comment that
    /// merely NAMES the construct under test satisfies a `contains` assertion or
    /// inflates a count — a trap this suite would otherwise walk into, since the
    /// production doc comment on `OnboardingTipRow` names both `tipRow` and
    /// `accessibilityHidden` (precedent 221i).
    private func code(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var index = haystack.startIndex
        while let found = haystack.range(of: needle, range: index..<haystack.endIndex) {
            count += 1
            index = found.upperBound
        }
        return count
    }

    // MARK: - Design system

    func test_tipRow_isASingleSharedComponent() throws {
        let source = code(try onboardingStepSource())

        XCTAssertTrue(
            source.contains("struct OnboardingTipRow: View {"),
            "The four duplicated tipRow helpers must be backed by one shared component."
        )
        XCTAssertEqual(
            occurrences(of: "Image(systemName: icon).font(.caption).foregroundColor(", in: source), 0,
            "No step view may reimplement the tip-row body: the glyph+caption layout lives "
            + "in OnboardingTipRow, and a local copy would drift out of its accessibility contract."
        )
        XCTAssertEqual(
            occurrences(of: "private func tipRow(icon: String, text: String) -> some View {", in: source),
            occurrences(of: "OnboardingTipRow(icon: icon, text: text, tint:", in: source),
            "Every remaining tipRow helper must be a thin wrapper that only supplies its tint "
            + "to OnboardingTipRow — the one difference the four copies ever had."
        )
    }

    // MARK: - Accessibility

    func test_tipRow_hidesItsDecorativeGlyphFromVoiceOver() throws {
        let source = code(try onboardingStepSource())
        guard let range = source.range(of: "struct OnboardingTipRow: View {"),
              let end = source.range(of: "struct GlassTextField: View {") else {
            XCTFail("Could not bound OnboardingTipRow"); return
        }
        let body = String(source[range.lowerBound..<end.lowerBound])

        XCTAssertTrue(
            body.contains(".accessibilityHidden(true)"),
            "The tip glyph is decorative — the caption carries the whole meaning — so it must be "
            + "hidden, otherwise VoiceOver reads the SF Symbol name before every tip (precedent 90i)."
        )
    }

    func test_tipRow_glyphColumnGrowsWithDynamicType() throws {
        let source = code(try onboardingStepSource())
        guard let range = source.range(of: "struct OnboardingTipRow: View {"),
              let end = source.range(of: "struct GlassTextField: View {") else {
            XCTFail("Could not bound OnboardingTipRow"); return
        }
        let body = String(source[range.lowerBound..<end.lowerBound])

        XCTAssertTrue(
            body.contains("@ScaledMetric(relativeTo: .caption)") && body.contains("= 16"),
            "The glyph gutter aligns every caption of a card on one edge, so it cannot be sized "
            + "to the glyph — but a hard 16pt lets a `.caption` symbol outgrow its column at the "
            + "accessibility text sizes. @ScaledMetric keeps 16pt at the default size and grows "
            + "the gutter with the caption beside it."
        )
        XCTAssertTrue(
            body.contains(".frame(width: glyphColumn)"),
            "The glyph must be laid out in the scaled gutter, not a literal width."
        )
        XCTAssertFalse(
            body.contains(".frame(width: 16)"),
            "The glyph column must not be pinned to a text-size-independent width."
        )
    }

    func test_skipButton_keepsItsVisibleLabelAsItsAccessibleName() throws {
        let source = code(try onboardingStepSource())

        XCTAssertFalse(
            source.contains("onboarding.step.skip\""),
            "The skip button must not override its visible label with a separate a11y string: "
            + "`onboarding.step.skip` (\"Skip step\") replaced the visible "
            + "`onboarding.skip-step` (\"Passer cette étape\"), so the accessible name neither "
            + "contained nor even matched the language of the visible one (WCAG 2.5.3 Label in Name)."
        )
        XCTAssertTrue(
            source.contains("String(localized: \"onboarding.skip-step\""),
            "The skip button still needs its visible localized label — it is now also its "
            + "accessible name."
        )
    }
}
