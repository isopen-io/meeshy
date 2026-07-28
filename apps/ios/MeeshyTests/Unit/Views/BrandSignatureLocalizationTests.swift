import XCTest

/// Source-level localization guard for `BrandSignature` (the version + credit
/// footer shared by the splash and login screens).
///
/// The VoiceOver label used to be a hardcoded English `Text(...)` literal
/// ("Meeshy version …, build …. Made with love by Services CEO."), which Xcode
/// auto-extracted into the catalog as its own untranslated key — so blind users
/// on every non-English locale heard English while the visible credit was fully
/// localized. This locks down the fix: the label must resolve through the stable
/// `brand.signature.accessibilityLabel` key, and that key must ship exactly the
/// same languages as the visible credit `brand.signature.credit`.
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

    func test_credit_isLocalizedNotHardcoded() throws {
        let source = try brandSignatureSource()
        XCTAssertTrue(
            source.contains("brand.signature.credit"),
            "The visible credit line must resolve through the localized key "
                + "brand.signature.credit.")
        XCTAssertFalse(
            source.contains(#"Text("By Services CEO")"#)
                || source.contains(#"Text("Par Services CEO")"#),
            "The credit must never be a hardcoded literal — it ships in 7 locales.")
    }

    /// The version line reads `Meeshy 1.0.0 · 1` — the build number is separated
    /// from the version by a middle dot, never wrapped in parentheses.
    func test_versionLine_separatesBuildNumberWithMiddleDot() throws {
        let source = try brandSignatureSource()
        XCTAssertTrue(
            source.contains(#"Text("Meeshy \(appVersion) · \(buildNumber)")"#),
            "The version line must render as `Meeshy <version> · <build>`.")
    }

    func test_catalog_shipsSameLanguagesForCreditAndAccessibilityLabel() throws {
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

        let creditLangs = languages(of: "brand.signature.credit")
        XCTAssertFalse(
            creditLangs.isEmpty,
            "brand.signature.credit must exist in the catalog.")

        XCTAssertEqual(
            creditLangs, signatureLangs,
            "The signature a11y label and the visible credit must cover the exact "
                + "same languages. Diff: "
                + "\(creditLangs.symmetricDifference(signatureLangs).sorted())")

        XCTAssertNil(
            strings?["Meeshy version %@, build %@. Made with love by Services CEO."],
            "The auto-extracted English literal key must be removed from the catalog.")
        XCTAssertNil(
            strings?["splash.madeWithLove"],
            "The legacy 'Made with ❤️ by' credit was replaced by "
                + "brand.signature.credit — the dead key must not linger.")
    }
}
