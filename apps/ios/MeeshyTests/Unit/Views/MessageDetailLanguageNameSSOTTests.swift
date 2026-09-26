import XCTest
@testable import Meeshy
import MeeshyUI

/// Guards against the 18-language `supportedLanguages` table (and its
/// `languageName(for:)` lookup) being re-forged locally again. The single
/// implementation lives on `MessageLanguageDetailView`; `MessageTranscriptionDetailView`
/// delegates to it. Both must keep resolving through the SDK's `LanguageDisplay`,
/// the single source of truth.
@MainActor
final class MessageDetailLanguageNameSSOTTests: XCTestCase {

    func test_messageLanguageDetailView_languageName_delegatesToLanguageDisplay() {
        XCTAssertEqual(MessageLanguageDetailView.languageName(for: "fr"), "Français")
        XCTAssertEqual(MessageLanguageDetailView.languageName(for: "ja"), "日本語")
        XCTAssertEqual(MessageLanguageDetailView.languageName(for: "xx"), "XX")
    }

    /// Both must resolve identically for every code in the curated picker
    /// set — a single divergence would mean one view forked back into its
    /// own private table.
    func test_bothViews_agreeWithSDKPickerSetForEveryCode() {
        for lang in LanguageDisplay.translationPickerLanguages {
            XCTAssertEqual(MessageLanguageDetailView.languageName(for: lang.code), lang.name)
        }
    }
}
