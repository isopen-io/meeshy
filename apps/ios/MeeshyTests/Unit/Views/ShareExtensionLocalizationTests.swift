import XCTest
import MeeshySDK
@testable import Meeshy

/// **The share extension speaks the APP's vocabulary** (#10947).
///
/// Since the single share screen, the extension mounts the same SwiftUI view as
/// the app (`Meeshy/Features/Main/Share/`), and every word of it resolves against
/// the app catalog through `Bundle.meeshyShare` — the `.appex` climbs two levels to
/// the app that contains it. The extension's own `Localizable.xcstrings` is gone:
/// a second copy of the keys could only drift.
///
/// What stays the extension's own: its `InfoPlist.xcstrings` (the name iOS shows in
/// the system share sheet) and the locales its `Info.plist` advertises.
///
/// The extension is an `app-extension` target, so its symbols are not reachable from
/// this bundle — the assertions read its sources and resources from disk.
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

    private func extensionSources() throws -> [(name: String, code: String)] {
        let directory = iosRoot.appendingPathComponent("MeeshyShareExtension", isDirectory: true)
        return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
            .map { (name: $0.lastPathComponent, code: try String(contentsOf: $0, encoding: .utf8)) }
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

    // MARK: - One vocabulary: the app catalog

    func test_extensionSources_askNoStringOfTheirOwn() throws {
        for file in try extensionSources() {
            XCTAssertFalse(
                ShareSourceCommentStripping.strippingComments(file.code).contains("String(localized:"),
                "\(file.name) asks a string of its own: the extension's words come from the app "
                + "catalog, through `ShareSheetCopy` and `Bundle.meeshyShare`."
            )
        }
    }

    func test_extensionShipsNoSecondCopyOfTheKeys() {
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: iosRoot.appendingPathComponent("MeeshyShareExtension/Localizable.xcstrings").path),
            "A Localizable catalog inside the extension would be a second copy of the share screen's words."
        )
    }

    func test_theShareScreenWords_resolveAgainstTheContainingApp() throws {
        let source = try String(
            contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Share/ShareStringsBundle.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(source.contains("pathExtension == \"appex\""), "Bundle.meeshyShare must climb out of the .appex.")
        let copy = try String(
            contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Share/ShareSheetCopy.swift"),
            encoding: .utf8
        )
        XCTAssertFalse(copy.contains("bundle: .main"), "In the extension, .main is the .appex: its catalog has none of these keys.")
    }

    /// The extension runs in its own process: the `AppleLanguages` override the app
    /// sets at launch never reaches it, so the sheet spoke the DEVICE language under an
    /// app set to French (#11515). The App Group language is the only shared channel.
    func test_theShareScreenWords_speakTheLanguagePublishedByTheApp_notTheDevice() {
        let french = Bundle.shareCatalog(
            in: .main,
            store: ShareLanguageStoreStub(publishedCode: "fr"),
            devicePreferred: ["en-US"]
        )
        XCTAssertEqual(
            String(localized: "share.sheet.title.extension", defaultValue: "?", bundle: french),
            "Envoyer avec Meeshy"
        )

        let german = Bundle.shareCatalog(
            in: .main,
            store: ShareLanguageStoreStub(publishedCode: "de"),
            devicePreferred: ["fr-FR"]
        )
        XCTAssertEqual(
            String(localized: "share.sheet.title.extension", defaultValue: "?", bundle: german),
            "Mit Meeshy senden"
        )
    }

    func test_withoutAPublishedLanguage_theShareScreenFollowsTheDevice() {
        let catalog = Bundle.shareCatalog(
            in: .main,
            store: ShareLanguageStoreStub(publishedCode: nil),
            devicePreferred: ["es-ES"]
        )
        XCTAssertEqual(
            String(localized: "share.sheet.title.extension", defaultValue: "?", bundle: catalog),
            "Enviar con Meeshy"
        )
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

    // MARK: - The bundle Apple ingests

    /// App Store Connect refuses the whole archive — silently, hours after an
    /// "upload succeeded" — when a share extension declares its activation rule
    /// directly under `NSExtension`:
    ///
    ///   Missing Info.plist value. A value for the key 'NSExtensionAttributes'
    ///   in bundle Meeshy.app/PlugIns/MeeshyShareExtension.appex is required.
    ///
    /// The rule belongs under `NSExtensionAttributes`. Build 1257 shipped it one
    /// level too high and never appeared in ASC; nothing in the build or the test
    /// suite caught it, because the extension only reaches Apple once it is
    /// embedded in the app. This guard is the only thing standing between a
    /// misplaced key and another blind three-hour wait.
    func test_shareExtensionDeclaresItsActivationRuleUnderNSExtensionAttributes() throws {
        let data = try Data(
            contentsOf: iosRoot.appendingPathComponent("MeeshyShareExtension/Info.plist"))
        let info = try PropertyListSerialization.propertyList(
            from: data, options: [], format: nil
        ) as? [String: Any]
        let nsExtension = info?["NSExtension"] as? [String: Any]

        XCTAssertNil(
            nsExtension?["NSExtensionActivationRule"],
            "NSExtensionActivationRule must not sit directly under NSExtension — App Store "
            + "Connect rejects the archive with STATE_ERROR.VALIDATION_ERROR."
        )

        let attributes = nsExtension?["NSExtensionAttributes"] as? [String: Any]
        XCTAssertNotNil(
            attributes,
            "NSExtension must carry an NSExtensionAttributes dictionary — Apple requires it "
            + "for com.apple.share-services."
        )
        XCTAssertNotNil(
            attributes?["NSExtensionActivationRule"],
            "The activation rule must live inside NSExtensionAttributes, or the share sheet "
            + "never offers Meeshy for any content type."
        )
    }
}

private struct ShareLanguageStoreStub: InterfaceLanguageProviding {
    let publishedCode: String?
    func publish(_ code: String?) {}
}
