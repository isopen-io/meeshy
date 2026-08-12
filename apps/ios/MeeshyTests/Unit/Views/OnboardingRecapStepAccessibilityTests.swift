import XCTest

/// Source-level accessibility guard for `StepRecapView.termsCheckbox` (the
/// terms-of-service consent checkbox in `OnboardingStepViews.swift` that gates
/// account creation). Its checked/unchecked state was conveyed to sighted users
/// only through the success-green fill + a checkmark glyph — VoiceOver users had
/// no way to tell whether they had accepted the terms. The state is now carried
/// by an `.isSelected` trait on the button, and the decorative checkmark is
/// hidden so it is not announced raw inside the label. Mirror of
/// `OnboardingLanguageStepAccessibilityTests` / `CallsTabAccessibilityTests`.
final class OnboardingRecapStepAccessibilityTests: XCTestCase {

    private func onboardingStepSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func termsCheckboxBody() throws -> String {
        let source = try onboardingStepSource()
        guard let range = source.range(of: "private var termsCheckbox: some View {") else {
            XCTFail("OnboardingStepViews.swift must define termsCheckbox"); return ""
        }
        let vicinity = String(source[range.lowerBound...])
        guard let end = vicinity.range(of: "private var termsSheet: some View {") else {
            XCTFail("Could not bound termsCheckbox"); return ""
        }
        return String(vicinity[..<end.lowerBound])
    }

    func test_termsCheckbox_exposesSelectedStateToVoiceOver() throws {
        let body = try termsCheckboxBody()
        XCTAssertTrue(
            body.contains(".accessibilityAddTraits(viewModel.acceptTerms ? .isSelected : [])"),
            "The terms-of-service consent checkbox only signals acceptance via a green fill + " +
            "checkmark — the accepted state needs an .isSelected trait so VoiceOver announces " +
            "the consent as selected (WCAG 1.4.1)."
        )
    }

    func test_termsCheckbox_hidesDecorativeCheckmarkFromVoiceOver() throws {
        let body = try termsCheckboxBody()
        XCTAssertTrue(
            body.contains("\"checkmark\"") && body.contains(".accessibilityHidden(true)"),
            "Once the .isSelected trait carries the accepted state, the checkmark glyph is " +
            "decorative and must be hidden from VoiceOver to avoid a raw 'checkmark' announcement " +
            "inside the checkbox label."
        )
    }
}
