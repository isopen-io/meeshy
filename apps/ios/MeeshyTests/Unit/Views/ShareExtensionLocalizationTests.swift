import XCTest
@testable import Meeshy

/// An app extension ships its own bundle: it cannot read the host app's string
/// catalog. `MeeshyShareExtension` used `String(localized:defaultValue:)` in five
/// places while its target carried **no** `Localizable.xcstrings`, so every locale
/// silently fell back to the English `defaultValue` — the extension was English-only
/// no matter the device language. Three further strings were raw literals.
///
/// 221i added `MeeshyShareExtension/Localizable.xcstrings` (picked up automatically by
/// the target's recursive `sources:` glob in `project.yml` — same wiring as
/// `MeeshyNotificationExtension`). This suite pins the invariant: every key the source
/// asks for exists in the catalog, translated into every locale the extension declares.
@MainActor
final class ShareExtensionLocalizationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private var sourceURL: URL {
        iosRoot.appendingPathComponent("MeeshyShareExtension/ShareViewController.swift")
    }

    private var catalogURL: URL {
        iosRoot.appendingPathComponent("MeeshyShareExtension/Localizable.xcstrings")
    }

    /// The locales the extension's `Info.plist` declares, which is also the app's set.
    private let declaredLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    // MARK: - Helpers

    private func catalog() throws -> [String: Any] {
        let data = try Data(contentsOf: catalogURL)
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [String: Any])
    }

    /// Keys requested by `String(localized: "…"` in the extension's source.
    private func requestedKeys() throws -> Set<String> {
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let pattern = #"String\(localized:\s*"([^"]+)""#
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        let keys = regex.matches(in: source, range: range).compactMap { match -> String? in
            guard let captured = Range(match.range(at: 1), in: source) else { return nil }
            return String(source[captured])
        }
        return Set(keys)
    }

    // MARK: - Tests

    func test_shareExtension_shipsAStringCatalog() throws {
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: catalogURL.path),
            "MeeshyShareExtension must ship its own Localizable.xcstrings: an app extension has its " +
            "own bundle and cannot read the host app's catalog, so without one every String(localized:) " +
            "falls back to its English defaultValue in every locale."
        )
    }

    func test_everyRequestedKey_existsInTheCatalog() throws {
        let strings = try XCTUnwrap(catalog()["strings"] as? [String: Any])
        let requested = try requestedKeys()

        XCTAssertFalse(requested.isEmpty, "The regex found no localized key — the source or the pattern drifted.")
        XCTAssertEqual(
            requested.subtracting(strings.keys), [],
            "These keys are requested by ShareViewController but absent from the extension's catalog, " +
            "so they render as their English defaultValue in every locale."
        )
    }

    func test_everyKey_isTranslatedIntoEveryDeclaredLocale() throws {
        let strings = try XCTUnwrap(catalog()["strings"] as? [String: Any])

        for (key, entry) in strings {
            let entry = try XCTUnwrap(entry as? [String: Any], "\(key): malformed entry")
            let localizations = try XCTUnwrap(
                entry["localizations"] as? [String: Any],
                "\(key): no localizations"
            )
            XCTAssertEqual(
                declaredLocales.subtracting(localizations.keys), [],
                "\(key) is missing locales declared in MeeshyShareExtension/Info.plist."
            )
            for locale in declaredLocales {
                let unit = try XCTUnwrap(
                    (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any],
                    "\(key)/\(locale): no stringUnit"
                )
                XCTAssertEqual(unit["state"] as? String, "translated", "\(key)/\(locale) is not translated.")
                let value = (unit["value"] as? String) ?? ""
                XCTAssertFalse(value.isEmpty, "\(key)/\(locale) is empty.")
            }
        }
    }

    func test_noUserFacingLiteralRemains() throws {
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        // `Button("…")` and `.navigationTitle("…")` take a LocalizedStringKey, which
        // resolves against the bundle — but with a bare literal the key IS the English
        // copy, which is neither greppable nor part of the catalog's key namespace.
        for pattern in [#"Button\(""#, #"\.navigationTitle\(""#] {
            let regex = try NSRegularExpression(pattern: pattern)
            let range = NSRange(source.startIndex..<source.endIndex, in: source)
            XCTAssertEqual(
                regex.numberOfMatches(in: source, range: range), 0,
                "ShareViewController still passes a raw string literal (\(pattern)). Route it through " +
                "String(localized:defaultValue:) in the share.* namespace and add it to the catalog."
            )
        }
    }
}
