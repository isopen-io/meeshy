import XCTest
@testable import Meeshy
import MeeshyUI

/// #8143 — la carte « amis trouvés » : initiales de lettres, libellé VoiceOver
/// complet même sans langue connue.
@MainActor
final class OnboardingFriendsFoundTests: XCTestCase {

    func test_accessibilitySummary_noKnownLanguage_omitsTheSpeaksClause() {
        let label = OnboardingSuggestionRow.accessibilitySummary(displayName: "Maman", username: "maman", languages: [], didFail: false)
        XCTAssertEqual(label, "Maman, @maman")
    }

    func test_accessibilitySummary_blankLanguageCodes_omitsTheSpeaksClause() {
        let label = OnboardingSuggestionRow.accessibilitySummary(displayName: "Théo (foot)", username: "theo", languages: [""], didFail: false)
        XCTAssertEqual(label, "Théo (foot), @theo")
    }

    func test_accessibilitySummary_withLanguages_keepsTheSpeaksClause() {
        let label = OnboardingSuggestionRow.accessibilitySummary(displayName: "Lina", username: "lina", languages: ["fr"], didFail: false)
        XCTAssertTrue(label.hasPrefix("Lina"))
        XCTAssertNotEqual(label, "Lina, @lina")
    }

    func test_contactSheetInitials_addressBookName_keepsOnlyLetters() {
        XCTAssertEqual(ContactCardDetailSheet.initials("Théo (foot)"), "TF")
        XCTAssertEqual(MeeshyAvatar.initials(for: "Théo (foot)"), "TF")
    }
}
