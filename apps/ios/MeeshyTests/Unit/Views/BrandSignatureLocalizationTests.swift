import XCTest
@testable import Meeshy

/// Guard for `BrandSignature` (the version + credit footer shared by the splash,
/// welcome and login screens).
///
/// The VoiceOver label used to be a hardcoded English `Text(...)` literal
/// ("Meeshy version …, build …. Made with love by Services CEO."), which Xcode
/// auto-extracted into the catalog as its own untranslated key — so blind users
/// on every non-English locale heard English. The version line still resolves its
/// label through the stable `brand.signature.accessibilityLabel` key.
///
/// Since #10096 the credit reads « by services.ceo » — a BRAND, identical in every
/// locale, so it is rendered verbatim and no longer has a catalog key — and it is a
/// `Link` that opens https://services.ceo, with a localized hint and a 44 pt hit area.
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

    func test_credit_readsTheBrandVerbatim() {
        XCTAssertEqual(BrandSignature.credit, "by services.ceo")
    }

    func test_creditDestination_isThePlatform() {
        XCTAssertEqual(BrandSignature.creditDestination.absoluteString, "https://services.ceo")
    }

    /// The credit is a brand: rendered `verbatim`, never through a catalog key —
    /// a key would be auto-extracted and could drift per locale.
    func test_credit_isAVerbatimLinkToThePlatform() throws {
        let source = try brandSignatureSource()
        XCTAssertTrue(
            source.contains("Link(destination: Self.creditDestination)"),
            "Tapping the credit must open https://services.ceo.")
        XCTAssertTrue(
            source.contains("Text(verbatim: Self.credit)"),
            "The credit is a brand — rendered verbatim, never localized.")
        XCTAssertFalse(
            source.contains("\"brand.signature.credit\""),
            "The credit no longer resolves through a catalog key.")
        XCTAssertFalse(
            source.contains("Services CEO"),
            "The former credit must not linger in the signature.")
    }

    /// VoiceOver announces the credit, then where it leads; the hit area reaches
    /// 44 pt through an outset content shape that gives the layout its space back.
    func test_creditLink_isNamedHintedAndTouchable() throws {
        let source = try brandSignatureSource()
        XCTAssertTrue(source.contains("brand.signature.credit.accessibilityHint"))
        XCTAssertTrue(source.contains(".accessibilityLabel(Text(verbatim: Self.credit))"))
        XCTAssertTrue(source.contains(".contentShape(Rectangle())"))
        XCTAssertTrue(source.contains(".padding(-Self.creditHitOutset)"))
        XCTAssertGreaterThanOrEqual(
            BrandSignature.creditHitOutset * 2 + 17, 44,
            "A ~17 pt line plus the outset on both sides must reach the 44 pt HIG minimum.")
    }

    /// The version line reads `Meeshy 1.0.0 · 1` — the build number is separated
    /// from the version by a middle dot, never wrapped in parentheses.
    func test_versionLine_separatesBuildNumberWithMiddleDot() throws {
        let source = try brandSignatureSource()
        XCTAssertTrue(
            source.contains(#"Text("Meeshy \(appVersion) · \(buildNumber)")"#),
            "The version line must render as `Meeshy <version> · <build>`.")
    }

    func test_catalog_shipsTheSignatureKeysInEveryLocale_andDropsTheCreditKey() throws {
        let url = iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]

        func localizations(of key: String) -> [String: String] {
            let entry = strings?[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            return localizations.compactMapValues {
                (($0 as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
            }
        }

        let shipped: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]
        let label = localizations(of: "brand.signature.accessibilityLabel")
        let hint = localizations(of: "brand.signature.credit.accessibilityHint")
        XCTAssertEqual(Set(label.keys), shipped)
        XCTAssertEqual(Set(hint.keys), shipped)

        XCTAssertTrue(
            label.values.allSatisfy { !$0.contains("Services CEO") },
            "The version label no longer carries the credit — the link announces itself.")
        XCTAssertTrue(
            hint.values.allSatisfy { $0.contains("services.ceo") },
            "Every hint names the platform it opens.")

        XCTAssertNil(
            strings?["brand.signature.credit"],
            "The credit is a verbatim brand — its catalog key must be gone.")
        XCTAssertNil(
            strings?["Meeshy version %@, build %@. Made with love by Services CEO."],
            "The auto-extracted English literal key must be removed from the catalog.")
        XCTAssertNil(
            strings?["splash.madeWithLove"],
            "The legacy 'Made with ❤️ by' credit was replaced — the dead key must not linger.")
    }
}
