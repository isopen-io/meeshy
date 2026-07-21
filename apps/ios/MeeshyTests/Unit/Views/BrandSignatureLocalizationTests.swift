import XCTest

/// Source-level localization guard for `BrandSignature` (the version + credit
/// footer shared by the splash and login screens).
///
/// The VoiceOver label used to be a hardcoded English `Text(...)` literal
/// ("Meeshy version …, build …. Made with love by Services CEO."), which Xcode
/// auto-extracted into the catalog as its own untranslated key — so blind users
/// on every non-English locale heard English while the visible credit
/// (`splash.madeWithLove`) was fully localized. This locks down the fix: the
/// label must resolve through the stable `brand.signature.accessibilityLabel`
/// key, and that key must ship translations for every language the sibling
/// `splash.madeWithLove` covers.
final class BrandSignatureLocalizationTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Views
            .deletingLastPathComponent() // Unit
            .deletingLastPathComponent() // MeeshyTests
            .deletingLastPathComponent() // ios
    }

    private func brandSignatureSource() throws -> String {
        let url = iosRoot.appendingPathComponent(
            "Meeshy/Features/Main/Components/BrandSignature.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_accessibilityLabel_isLocalizedNotHardcodedEnglish() throws {
        let source = try brandSignatureSource()
        XCTAssertTrue(
            source.contains("brand.signature.accessibilityLabel"),
            "BrandSignature must resolve its VoiceOver label through the stable "
                + "localized key brand.signature.accessibilityLabel.")
        XCTAssertFalse(
            source.contains(#".accessibilityLabel(Text("Meeshy version"#),
            "The VoiceOver label must not be a hardcoded English Text literal — "
                + "it gets auto-extracted as its own untranslated catalog key.")
    }

    func test_catalog_shipsAllSplashLanguagesForBrandSignatureLabel() throws {
        let url = iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]

        func languages(of key: String) -> Set<String> {
            let entry = strings?[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any]
            return Set(localizations?.keys ?? [:].keys)
        }

        let signatureLangs = languages(of: "brand.signature.accessibilityLabel")
        XCTAssertFalse(
            signatureLangs.isEmpty,
            "brand.signature.accessibilityLabel must exist in the catalog.")

        let splashLangs = languages(of: "splash.madeWithLove")
        XCTAssertTrue(
            splashLangs.isSubset(of: signatureLangs),
            "The signature a11y label must cover every language of the sibling "
                + "visible credit splash.madeWithLove. Missing: "
                + "\(splashLangs.subtracting(signatureLangs).sorted())")

        XCTAssertNil(
            strings?["Meeshy version %@, build %@. Made with love by Services CEO."],
            "The auto-extracted English literal key must be removed from the catalog.")
    }
}
