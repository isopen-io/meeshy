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

    /// The bookmark toasts have ONE producer since #15994: the writer every
    /// surface goes through. They lived in three views before, each copy
    /// fixed separately.
    private static let writer = "Meeshy/Features/Main/Services/PostBookmarkWriter.swift"

    /// The surfaces that used to raise their own toasts, each read as its whole
    /// UNIT (the declaration file and its `+…` extensions, #15894).
    private static let formerCallSites = [
        "Meeshy/Features/Main/Views/FeedView.swift",
        "Meeshy/Features/Main/Views/RootViewComponents.swift",
        "Meeshy/Features/Main/Views/PostDetailView.swift"
    ]

    /// `Foo.swift` plus every `Foo+*.swift` beside it.
    private func source(_ relativePath: String) throws -> String {
        let declaration = Self.appRoot.appendingPathComponent(relativePath)
        let directory = declaration.deletingLastPathComponent()
        let stem = declaration.deletingPathExtension().lastPathComponent
        let extensions = try FileManager.default
            .contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix(stem + "+") && $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try ([declaration] + extensions)
            .map { try String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")
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

    // MARK: - The writer goes through the keys

    func test_theBookmarkWriter_usesTheSharedKeys() throws {
        let source = try source(Self.writer)

        for key in Self.bookmarkKeys {
            XCTAssertTrue(
                source.contains("String(localized: \"\(key)\""),
                "PostBookmarkWriter must raise its toasts through \(key)."
            )
        }
        for raw in ["\"Retire des favoris\"", "\"Ajoute aux favoris\"", "showError(\"Erreur lors de l'enregistrement\")"] {
            XCTAssertFalse(source.contains(raw), "PostBookmarkWriter must not use \(raw): a raw French sentence has no catalog entry.")
        }
    }

    /// A surface that raises its own bookmark toast is a second writer.
    func test_theFormerCallSites_delegateTheirToastsToTheWriter() throws {
        for path in Self.formerCallSites {
            let source = try source(path)
            XCTAssertFalse(
                source.contains("\"post.bookmark."),
                "\(path) raises a bookmark toast itself — it must go through PostBookmarkWriter."
            )
            XCTAssertTrue(source.contains("PostBookmarkWriter"), "\(path) must write its bookmark through PostBookmarkWriter.")
        }
    }
}
