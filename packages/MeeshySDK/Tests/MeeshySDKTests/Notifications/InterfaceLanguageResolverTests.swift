import XCTest
@testable import MeeshySDK

/// Une notification déployée ne mélange plus deux langues (#8951).
///
/// L'app force son interface dans la langue choisie par l'utilisateur ; ses
/// extensions de notification tournent dans leur propre processus, où seule la
/// langue de l'APPAREIL s'appliquait. Mesuré : « Ouvrir dans Plans » (action de
/// l'app) au-dessus de « Open in Maps » (bouton de l'extension de contenu).
/// L'app publie sa langue dans le groupe d'app ; les extensions et les
/// catégories de l'app la lisent par `InterfaceLanguageResolver`.
final class InterfaceLanguageResolverTests: XCTestCase {

    private let nseLocalizations = ["ar", "de", "en", "es", "fr", "it", "pt", "zh-Hans"]
    private let contentLocalizations = ["ar", "de", "en", "es", "fr", "it", "pt-BR", "zh-Hans"]

    // MARK: - Élection de la localisation

    func test_localization_publishedLanguageSupported_winsOverDevice() {
        let code = InterfaceLanguageResolver.localization(
            published: "fr", available: contentLocalizations, devicePreferred: ["en-US"])
        XCTAssertEqual(code, "fr")
    }

    func test_localization_nothingPublished_followsDevice() {
        let code = InterfaceLanguageResolver.localization(
            published: nil, available: contentLocalizations, devicePreferred: ["de-DE", "en-US"])
        XCTAssertEqual(code, "de")
    }

    func test_localization_publishedLanguageUnsupported_fallsBackToDevice() {
        let code = InterfaceLanguageResolver.localization(
            published: "ja", available: contentLocalizations, devicePreferred: ["es-ES"])
        XCTAssertEqual(code, "es")
    }

    func test_localization_publishedBlank_fallsBackToDevice() {
        let code = InterfaceLanguageResolver.localization(
            published: "  ", available: contentLocalizations, devicePreferred: ["it-IT"])
        XCTAssertEqual(code, "it")
    }

    func test_localization_nothingMatches_returnsNil() {
        let code = InterfaceLanguageResolver.localization(
            published: "ja", available: contentLocalizations, devicePreferred: ["ko-KR"])
        XCTAssertNil(code)
    }

    func test_localization_devicePreferencesInOrder_firstServedWins() {
        let code = InterfaceLanguageResolver.localization(
            published: nil, available: contentLocalizations, devicePreferred: ["ko-KR", "ar-SA", "en-US"])
        XCTAssertEqual(code, "ar")
    }

    func test_localization_brazilianPortuguesePublished_servesPortugueseCatalog() {
        let code = InterfaceLanguageResolver.localization(
            published: "pt-BR", available: nseLocalizations, devicePreferred: ["en-US"])
        XCTAssertEqual(code, "pt")
    }

    func test_localization_portuguesePublished_servesBrazilianCatalog() {
        let code = InterfaceLanguageResolver.localization(
            published: "pt", available: contentLocalizations, devicePreferred: ["en-US"])
        XCTAssertEqual(code, "pt-BR")
    }

    func test_localization_caseAndSeparatorDiffer_stillMatches() {
        let code = InterfaceLanguageResolver.localization(
            published: "PT_br", available: contentLocalizations, devicePreferred: ["en-US"])
        XCTAssertEqual(code, "pt-BR")
    }

    func test_localization_baseIsNeverServed() {
        let code = InterfaceLanguageResolver.localization(
            published: "Base", available: ["Base", "en", "fr"], devicePreferred: ["fr-FR"])
        XCTAssertEqual(code, "fr")
    }

    // MARK: - Bundle servi

    func test_bundle_publishedFrenchDeviceEnglish_servesFrenchStrings() throws {
        let base = try makeBundle(["en": "Open in Maps", "fr": "Ouvrir dans Plans"])
        let bundle = InterfaceLanguageResolver.bundle(
            for: base, store: StubInterfaceLanguageStore(publishedCode: "fr"), devicePreferred: ["en-US"])
        XCTAssertEqual(bundle.localizedString(forKey: "openInMaps", value: nil, table: nil), "Ouvrir dans Plans")
    }

    func test_bundle_nothingPublished_servesDeviceStrings() throws {
        let base = try makeBundle(["en": "Open in Maps", "fr": "Ouvrir dans Plans"])
        let bundle = InterfaceLanguageResolver.bundle(
            for: base, store: StubInterfaceLanguageStore(publishedCode: nil), devicePreferred: ["en-US"])
        XCTAssertEqual(bundle.localizedString(forKey: "openInMaps", value: nil, table: nil), "Open in Maps")
    }

    func test_bundle_noLocalizationMatches_returnsBaseBundle() throws {
        let base = try makeBundle(["en": "Open in Maps"])
        let bundle = InterfaceLanguageResolver.bundle(
            for: base, store: StubInterfaceLanguageStore(publishedCode: "ja"), devicePreferred: ["ko-KR"])
        XCTAssertEqual(bundle.bundleURL, base.bundleURL)
    }

    // MARK: - Magasin du groupe d'app

    func test_publish_code_isReadBack() {
        let store = AppGroupInterfaceLanguageStore(suiteName: uniqueSuite())
        store.publish("fr")
        XCTAssertEqual(store.publishedCode, "fr")
    }

    func test_publish_nil_clearsPreviousCode() {
        let store = AppGroupInterfaceLanguageStore(suiteName: uniqueSuite())
        store.publish("fr")
        store.publish(nil)
        XCTAssertNil(store.publishedCode)
    }

    func test_publish_blank_clearsPreviousCode() {
        let store = AppGroupInterfaceLanguageStore(suiteName: uniqueSuite())
        store.publish("de")
        store.publish("   ")
        XCTAssertNil(store.publishedCode)
    }

    func test_appGroupStore_defaultSuite_isTheSharedAppGroup() {
        XCTAssertEqual(AppGroupInterfaceLanguageStore.appGroupSuite, "group.me.meeshy.apps")
    }

    // MARK: - Fabriques

    private func uniqueSuite() -> String {
        "test.interface-language.\(UUID().uuidString)"
    }

    private func makeBundle(_ strings: [String: String]) throws -> Bundle {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("interface-language-\(UUID().uuidString).bundle")
        for (code, value) in strings {
            let lproj = root.appendingPathComponent("\(code).lproj")
            try FileManager.default.createDirectory(at: lproj, withIntermediateDirectories: true)
            let body = "\"openInMaps\" = \"\(value)\";\n"
            try Data(body.utf8).write(to: lproj.appendingPathComponent("Localizable.strings"))
        }
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return try XCTUnwrap(Bundle(url: root))
    }
}

private struct StubInterfaceLanguageStore: InterfaceLanguageProviding {
    let publishedCode: String?
    func publish(_ code: String?) {}
}
