import XCTest

/// Source-level accessibility guard for `StepLanguageView` (the onboarding
/// language-preference step in `OnboardingStepViews.swift`). Both selection
/// surfaces on this screen conveyed their active state through color/fill
/// only — the `languageTargetTab` segmented selector (Langue principale /
/// Langue régionale) and each `languageCard` in the language grid. VoiceOver
/// users could not tell which target tab was active nor which language was
/// selected. Mirror of `CallsTabAccessibilityTests.test_filterChip_…`.
final class OnboardingLanguageStepAccessibilityTests: XCTestCase {

    private func onboardingStepSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_languageTargetTab_exposesSelectedStateToVoiceOver() throws {
        let source = try onboardingStepSource()
        guard let range = source.range(of: "private func languageTargetTab(") else {
            XCTFail("OnboardingStepViews.swift must define languageTargetTab()"); return
        }
        let vicinity = String(source[range.lowerBound...])
        guard let end = vicinity.range(of: "private func languageCard(") else {
            XCTFail("Could not bound languageTargetTab()"); return
        }
        let body = String(vicinity[..<end.lowerBound])
        XCTAssertTrue(
            body.contains(".accessibilityAddTraits(isActive ? .isSelected : [])"),
            "The Langue principale / Langue régionale target tabs only convey the active " +
            "segment via fill color — VoiceOver users need an .isSelected trait to know " +
            "which target they are editing."
        )
    }

    func test_languageCard_exposesSelectedStateToVoiceOver() throws {
        let source = try onboardingStepSource()
        guard let range = source.range(of: "private func languageCard(") else {
            XCTFail("OnboardingStepViews.swift must define languageCard()"); return
        }
        let vicinity = String(source[range.lowerBound...])
        guard let end = vicinity.range(of: "private var conversationExampleCard") else {
            XCTFail("Could not bound languageCard()"); return
        }
        let body = String(vicinity[..<end.lowerBound])
        XCTAssertTrue(
            body.contains(".accessibilityAddTraits(isSelected ? .isSelected : [])"),
            "Each language card only signals selection through a checkmark glyph + color — " +
            "the selected card needs an .isSelected trait so VoiceOver announces it as selected."
        )
        XCTAssertTrue(
            body.contains("\"checkmark.circle.fill\"") && body.contains(".accessibilityHidden(true)"),
            "The selection checkmark glyph is decorative once the .isSelected trait carries " +
            "the state — it must be hidden from VoiceOver to avoid a raw 'checkmark circle fill' " +
            "announcement inside the card label."
        )
    }
}
