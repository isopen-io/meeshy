import XCTest
@testable import MeeshyUI

/// The `CountryPicker` selector button and each list row expose a VoiceOver
/// label built by `accessibilityLabel(for:)`. It reads "name, dial code" and
/// deliberately omits the emoji flag (VoiceOver vocalizes it as a verbose
/// "flag of …" that duplicates the localized country name).
final class CountryPickerAccessibilityTests: XCTestCase {

    private func makeCountry(
        id: String = "FR",
        name: String = "France",
        dialCode: String = "+33",
        flag: String = "🇫🇷"
    ) -> CountryCode {
        CountryCode(id: id, name: name, dialCode: dialCode, flag: flag)
    }

    func test_accessibilityLabel_combinesNameAndDialCode() {
        let label = CountryPicker.accessibilityLabel(for: makeCountry())
        XCTAssertEqual(label, "France, +33")
    }

    func test_accessibilityLabel_omitsEmojiFlag() {
        let label = CountryPicker.accessibilityLabel(for: makeCountry())
        XCTAssertFalse(label.contains("🇫🇷"))
    }

    func test_accessibilityLabel_usesLocalizedNameNotIsoCode() {
        let label = CountryPicker.accessibilityLabel(
            for: makeCountry(id: "DE", name: "Allemagne", dialCode: "+49")
        )
        XCTAssertEqual(label, "Allemagne, +49")
        XCTAssertFalse(label.contains("DE"))
    }
}
