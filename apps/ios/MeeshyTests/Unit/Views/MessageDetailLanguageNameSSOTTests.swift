import XCTest
@testable import Meeshy
import MeeshyUI

/// Guards against the 18-language `supportedLanguages` table (and its
/// `languageName(for:)` lookup) being re-forged locally again in any of the
/// three message-detail views — they must all delegate to the SDK's
/// `LanguageDisplay`, the single source of truth.
@MainActor
final class MessageDetailLanguageNameSSOTTests: XCTestCase {

    func test_messageDetailSheet_languageName_delegatesToLanguageDisplay() {
        XCTAssertEqual(MessageDetailSheet.languageName(for: "fr"), "Français")
        XCTAssertEqual(MessageDetailSheet.languageName(for: "en"), "English")
        XCTAssertEqual(MessageDetailSheet.languageName(for: "xx"), "XX", "Unknown codes must still fall back to uppercased")
    }

    func test_messageLanguageDetailView_languageName_delegatesToLanguageDisplay() {
        XCTAssertEqual(MessageLanguageDetailView.languageName(for: "fr"), "Français")
        XCTAssertEqual(MessageLanguageDetailView.languageName(for: "ja"), "日本語")
        XCTAssertEqual(MessageLanguageDetailView.languageName(for: "xx"), "XX")
    }

    func test_messageTranscriptionDetailView_languageName_delegatesToLanguageDisplay() {
        XCTAssertEqual(MessageTranscriptionDetailView.languageName(for: "fr"), "Français")
        XCTAssertEqual(MessageTranscriptionDetailView.languageName(for: "de"), "Deutsch")
        XCTAssertEqual(MessageTranscriptionDetailView.languageName(for: "xx"), "XX")
    }

    /// All three must resolve identically for every code in the curated
    /// picker set — a single divergence would mean one view forked back
    /// into its own private table.
    func test_allThreeViews_agreeWithSDKPickerSetForEveryCode() {
        for lang in LanguageDisplay.translationPickerLanguages {
            XCTAssertEqual(MessageDetailSheet.languageName(for: lang.code), lang.name)
            XCTAssertEqual(MessageLanguageDetailView.languageName(for: lang.code), lang.name)
            XCTAssertEqual(MessageTranscriptionDetailView.languageName(for: lang.code), lang.name)
        }
    }
}
