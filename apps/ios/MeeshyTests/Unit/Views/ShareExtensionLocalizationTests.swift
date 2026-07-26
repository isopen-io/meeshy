import XCTest

/// `MeeshyShareExtension` shipped without any string catalogue of its own. An app
/// extension resolves `String(localized:)` against its **own** bundle (`Bundle.main`
/// is the `.appex`), so every one of its strings fell back to the English
/// `defaultValue` in all seven locales the app advertises — and three strings were
/// bare literals with no key at all.
///
/// This suite pins the contract: every key the extension asks for exists in its own
/// catalogue, translated in every locale, and the extension's `Info.plist` advertises
/// exactly the locales the app does.
///
/// The extension is an `app-extension` target, so its symbols are not reachable from
/// this bundle — the assertions read its sources and resources from disk, the same
/// way `NavigationContainerMigrationTests` sweeps them.
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

    /// The locales the app advertises in its own `Info.plist`.
    private let supportedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private func extensionSource() throws -> String {
        try String(
            contentsOf: iosRoot.appendingPathComponent("MeeshyShareExtension/ShareViewController.swift"),
            encoding: .utf8
        )
    }

    private func catalogStrings(_ relativePath: String) throws -> [String: Any] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent(relativePath))
        let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return catalog?["strings"] as? [String: Any] ?? [:]
    }

    private func localizations(of key: String, in strings: [String: Any]) -> Set<String> {
        let entry = strings[key] as? [String: Any]
        let localizations = entry?["localizations"] as? [String: Any] ?? [:]
        return Set(localizations.keys)
    }

    /// Every `String(localized: "…")` key the extension asks for, in source order.
    private func requestedKeys(in source: String) -> [String] {
        source.components(separatedBy: "String(localized: \"").dropFirst().compactMap { fragment in
            fragment.components(separatedBy: "\"").first
        }
    }

    // MARK: - Every requested key is in the extension's own catalogue

    func test_everyRequestedKeyExistsInExtensionCatalog() throws {
        let requested = Set(requestedKeys(in: try extensionSource()))
        XCTAssertFalse(requested.isEmpty, "The extension must localize its user-facing strings.")

        let strings = try catalogStrings("MeeshyShareExtension/Localizable.xcstrings")
        let missing = requested.subtracting(strings.keys)
        XCTAssertTrue(
            missing.isEmpty,
            "The extension resolves String(localized:) against its own bundle, so keys absent from " +
            "MeeshyShareExtension/Localizable.xcstrings silently fall back to their English " +
            "defaultValue in every locale. Missing: \(missing.sorted())"
        )
    }

    func test_everyExtensionStringIsTranslatedInEveryLocale() throws {
        let strings = try catalogStrings("MeeshyShareExtension/Localizable.xcstrings")
        for key in strings.keys.sorted() {
            XCTAssertEqual(
                localizations(of: key, in: strings), supportedLocales,
                "\(key) must ship in every locale the app advertises."
            )
        }
    }

    func test_shareSheetDisplayNameIsLocalized() throws {
        // CFBundleDisplayName is what iOS shows in the system share sheet — the single
        // most visible string of the extension, and the one users see before anything
        // else it renders.
        let strings = try catalogStrings("MeeshyShareExtension/InfoPlist.xcstrings")
        XCTAssertEqual(
            localizations(of: "CFBundleDisplayName", in: strings), supportedLocales,
            "The share-sheet display name must be localized in every supported locale."
        )
    }

    func test_extensionAdvertisesTheSameLocalesAsTheApp() throws {
        // A catalogue translation is unreachable if the bundle does not advertise its
        // locale, so the two lists must not drift apart.
        for plist in ["Meeshy/Info.plist", "MeeshyShareExtension/Info.plist"] {
            let data = try Data(contentsOf: iosRoot.appendingPathComponent(plist))
            let info = try PropertyListSerialization.propertyList(
                from: data, options: [], format: nil
            ) as? [String: Any]
            let advertised = Set(info?["CFBundleLocalizations"] as? [String] ?? [])
            XCTAssertEqual(
                advertised, supportedLocales,
                "\(plist) must advertise exactly the locales the catalogues are translated into."
            )
        }
    }

    // MARK: - No user-facing literal is left unkeyed

    func test_actionButtonsAndTitleAreLocalized() throws {
        let source = try extensionSource()
        for literal in ["Button(\"Cancel\")", "Button(\"Send\")", ".navigationTitle(\"Share to Meeshy\")"] {
            XCTAssertFalse(
                source.contains(literal),
                "\(literal) is a bare literal: it renders in English whatever the device language."
            )
        }
        for key in ["share.cancel", "share.send", "share.title"] {
            XCTAssertTrue(source.contains(key), "\(key) must back the corresponding control.")
        }
    }

    // MARK: - Contact rows are reachable by VoiceOver

    func test_contactRow_exposesButtonAndSelectionTraits() throws {
        // The row is picked with an .onTapGesture, so without an explicit element it
        // reaches VoiceOver as loose text with no way to activate it, and its selected
        // state is carried by a checkmark glyph and a tint alone.
        let source = try extensionSource()
        XCTAssertTrue(
            source.contains(".accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])"),
            "The contact row must expose both the button trait (it is tappable) and the selected " +
            "trait (its state must not be conveyed by colour alone)."
        )
        XCTAssertTrue(
            source.contains(".accessibilityElement(children: .combine)"),
            "The contact row must be a single accessibility element so its name, status and state " +
            "are announced together rather than as separate stops."
        )
    }
}
