import XCTest
import Foundation
@testable import MeeshyUI

@MainActor
final class OwnedViewsLocalizationTests: XCTestCase {

    private static let languages = ["fr", "en", "de", "es", "pt-BR", "it", "ar"]

    private func lproj(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.module.path(forResource: code, ofType: "lproj"),
            "\(code).lproj absent de Bundle.module"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    private func value(_ key: String, _ code: String) throws -> String {
        try lproj(code).localizedString(forKey: key, value: key, table: nil)
    }

    func test_errorBannerDismissHint_isLocalizedInEveryLocale() throws {
        for code in Self.languages {
            let hint = ErrorBannerView.dismissHint(in: try lproj(code))
            XCTAssertFalse(hint.isEmpty, code)
            XCTAssertNotEqual(hint, "error.banner.dismiss.hint", code)
            XCTAssertFalse(hint.contains("Double-tap"), code)
        }
        XCTAssertEqual(ErrorBannerView.dismissHint(in: try lproj("en")), "Dismisses this error message.")
        XCTAssertEqual(ErrorBannerView.dismissHint(in: try lproj("fr")), "Ferme ce message d'erreur.")
    }

    func test_stickerLibraryKeys_resolveInEveryLocale() throws {
        let keys = ["story.sticker.library.lift", "story.sticker.library.lift.a11y", "story.sticker.library.empty"]
        for code in Self.languages {
            for key in keys {
                XCTAssertNotEqual(try value(key, code), key, "\(key) absent en \(code)")
            }
        }
        XCTAssertEqual(try value("story.sticker.library.lift", "en"), "Cut out")
    }

    func test_audioTrackMuteKeys_resolveInEveryLocale() throws {
        for code in Self.languages {
            for key in ["story.audio.track.mute", "story.audio.track.unmute"] {
                XCTAssertNotEqual(try value(key, code), key, "\(key) absent en \(code)")
            }
        }
        XCTAssertEqual(try value("story.audio.track.mute", "en"), "Mute this track")
        XCTAssertEqual(try value("story.audio.track.unmute", "en"), "Unmute this track")
    }
}
