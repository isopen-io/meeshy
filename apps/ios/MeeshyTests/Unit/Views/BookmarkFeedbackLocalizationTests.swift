import XCTest
@testable import Meeshy

/// Iteration 218i — the bookmark feedback toasts must be localized.
///
/// The three toasts a user sees after saving or unsaving a post lived as
/// **raw French sentences used as localization keys**:
///
/// ```swift
/// String(localized: "Retire des favoris", defaultValue: "Retire des favoris")
/// ```
///
/// A key absent from `Localizable.xcstrings` has no translations, so
/// `String(localized:)` falls back to its `defaultValue` — French — for every
/// user, whatever their locale. The strings were also triplicated across
/// `FeedView`, `RootViewComponents` and `PostDetailView` (and one site in
/// `PostDetailView` passed a bare `String`, not localized at all), so each copy
/// would have to be found and fixed separately.
///
/// They now go through `post.bookmark.{added,removed,error}`, which exist in the
/// catalog with all seven locales the app ships. Two of the French values were
/// also missing their accents (« Retire »/« Ajoute » → « Retiré »/« Ajouté »).
///
/// The catalog assertions matter more than the source ones: a namespaced key
/// that nobody translated is no better than a French sentence. This suite
/// therefore reads `Localizable.xcstrings` and fails if a key is referenced but
/// unshipped in any locale.
@MainActor
final class BookmarkFeedbackLocalizationTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let bookmarkKeys = [
        "post.bookmark.added",
        "post.bookmark.removed",
        "post.bookmark.error"
    ]

    /// Every locale the catalog ships. A key translated in only some of them
    /// silently falls back to French for the rest.
    private static let shippedLocales = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    /// The three call sites that drive the bookmark toasts.
    private static let callSites = [
        "Meeshy/Features/Main/Views/FeedView.swift",
        "Meeshy/Features/Main/Views/RootViewComponents.swift",
        "Meeshy/Features/Main/Views/PostDetailView.swift"
    ]

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func catalog() throws -> [String: Any] {
        let url = Self.appRoot.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let strings = (object as? [String: Any])?["strings"] as? [String: Any]
        return try XCTUnwrap(strings, "Localizable.xcstrings must expose a `strings` object")
    }

    // MARK: - The keys ship in every locale

    func test_bookmarkKeys_areTranslatedInEveryShippedLocale() throws {
        let strings = try catalog()

        for key in Self.bookmarkKeys {
            let entry = try XCTUnwrap(
                strings[key] as? [String: Any],
                "\(key) must exist in Localizable.xcstrings — a key that is only a defaultValue " +
                "in source renders in French for every user."
            )
            let localizations = try XCTUnwrap(
                entry["localizations"] as? [String: Any],
                "\(key) must carry localizations."
            )

            for locale in Self.shippedLocales {
                let unit = (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
                let value = unit?["value"] as? String
                XCTAssertFalse(
                    (value ?? "").isEmpty,
                    "\(key) is missing a \(locale) translation — that locale would fall back to French."
                )
                XCTAssertEqual(
                    unit?["state"] as? String, "translated",
                    "\(key) [\(locale)] must be marked translated, not stale or needs_review."
                )
            }
        }
    }

    /// The French source values are the ones the accents were missing from.
    func test_frenchBookmarkValues_carryTheirAccents() throws {
        let strings = try catalog()

        let french = try Self.bookmarkKeys.map { key -> String in
            let entry = strings[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any]
            let unit = (localizations?["fr"] as? [String: Any])?["stringUnit"] as? [String: Any]
            return try XCTUnwrap(unit?["value"] as? String, "\(key) needs a French value")
        }

        XCTAssertEqual(french[0], "Ajouté aux favoris")
        XCTAssertEqual(french[1], "Retiré des favoris")
        XCTAssertEqual(french[2], "Erreur lors de l'enregistrement")
    }

    // MARK: - Call sites go through the keys

    func test_bookmarkCallSites_useTheSharedKeys() throws {
        for path in Self.callSites {
            let source = try source(path)

            XCTAssertTrue(
                source.contains("String(localized: \"post.bookmark."),
                "\(path) must raise its bookmark toast through the post.bookmark.* keys."
            )
            for raw in ["\"Retire des favoris\"", "\"Ajoute aux favoris\""] {
                XCTAssertFalse(
                    source.contains(raw),
                    "\(path) must not reintroduce \(raw) as a localization key: a raw French " +
                    "sentence has no catalog entry, so every locale renders French."
                )
            }
        }
    }

    /// `PostDetailView` raised its failure toast with a bare `String` — not even
    /// wrapped in `String(localized:)`, so it could never be translated.
    func test_postDetailView_localizesItsFailureToast() throws {
        let source = try source("Meeshy/Features/Main/Views/PostDetailView.swift")

        XCTAssertFalse(
            source.contains("showError(\"Erreur lors de l'enregistrement\")"),
            "The failure toast must not be raised from a bare String literal."
        )
        XCTAssertTrue(
            source.contains("showError(String(localized: \"post.bookmark.error\""),
            "The failure toast must go through post.bookmark.error like its two siblings."
        )
    }
}
