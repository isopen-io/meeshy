import XCTest
@testable import MeeshyUI

/// `translationPickerLanguages` is the SSOT for the 18-language picker set
/// previously copied byte-for-byte across three app-side message-detail
/// views (`MessageDetailSheet`, `MessageLanguageDetailView`,
/// `MessageTranscriptionDetailView`), each with its own `languageName(for:)`.
@MainActor
final class LanguageDisplayTests: XCTestCase {

    func test_translationPickerLanguages_hasEighteenEntriesInCuratedOrder() {
        let expectedCodes = [
            "fr", "en", "es", "de", "ar", "zh", "pt", "it", "ja",
            "ko", "ru", "hi", "tr", "nl", "pl", "vi", "th", "sv"
        ]
        XCTAssertEqual(LanguageDisplay.translationPickerLanguages.map(\.code), expectedCodes)
    }

    func test_translationPickerLanguages_everyEntryMatchesFromCodeLookup() {
        for entry in LanguageDisplay.translationPickerLanguages {
            let looked = LanguageDisplay.from(code: entry.code)
            XCTAssertEqual(looked?.flag, entry.flag, "flag mismatch for \(entry.code)")
            XCTAssertEqual(looked?.name, entry.name, "name mismatch for \(entry.code)")
            XCTAssertEqual(looked?.color, entry.color, "color mismatch for \(entry.code)")
        }
    }

    func test_translationPickerLanguages_frenchEntry_usesNativeDisplayName() {
        let fr = LanguageDisplay.translationPickerLanguages.first { $0.code == "fr" }
        XCTAssertEqual(fr?.name, "Français")
        XCTAssertEqual(fr?.flag, "🇫🇷")
    }
}
