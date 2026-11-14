import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure des réglages, lot iOS 2/3 (#17584, #17652), second passage : un libellé NOMME (« Boutique », « E-mail du support »,
/// « Inclure »), une redite sort (« À propos de Meeshy »), et les trois fonctionnalités d'« À propos » disent au repos
/// ce qu'elles sont (règle 7) avec les phrases d'orientation déjà traduites des Réglages.
@MainActor
final class EpureReglagesFichesTests: XCTestCase {

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private func app() throws -> Catalog {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        return strings.reduce(into: Catalog()) { result, entry in
            let localizations = ((entry.value as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            result[entry.key] = localizations.reduce(into: [String: String]()) { values, locale in
                if let unit = (locale.value as? [String: Any])?["stringUnit"] as? [String: Any], let value = unit["value"] as? String {
                    values[locale.key] = value
                }
            }
        }
    }

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/" + relativePath), encoding: .utf8))
    }

    private func shippedSources() throws -> String {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { Self.repoRoot.appendingPathComponent($0) }
        return try roots.flatMap { root -> [String] in
            let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
            return try (walker?.allObjects as? [URL] ?? [])
                .filter { $0.pathExtension == "swift" }
                .map { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)) }
        }.joined(separator: "\n")
    }

    private static let views = "Features/Settings/Views/"
    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    // MARK: - Règle 1 : « Packs et téléchargements » devient « Boutique »

    func test_packs_rowAndSheet_areNamedByTheShopWord_theLexiconOne() throws {
        let settings = try code(Self.views + "SettingsView.swift")
        let packs = try code(Self.views + "PacksSettingsView.swift")
        XCTAssertFalse(settings.contains("settings.packs.title"))
        XCTAssertFalse(packs.contains("settings.packs.title"))
        XCTAssertTrue(settings.contains("\"settings.packs.shop\""))
        XCTAssertTrue(packs.contains("title: String(localized: \"settings.packs.shop\""))
        XCTAssertTrue(settings.contains("SettingsOrientation.packs"), "la phrase d'orientation du jeu reste visible sous la rangée")
        XCTAssertEqual(try app()["settings.packs.shop"]?["fr"], "Boutique")
    }

    func test_packsTitle_hasNoReaderLeft_soItLeavesTheSevenLanguages() throws {
        XCTAssertNil(try app()["settings.packs.title"])
        XCTAssertFalse(try shippedSources().contains("\"settings.packs.title\""))
    }

    func test_packs_myPacks_staysAsIs() throws {
        XCTAssertEqual(try app()["settings.packs.mine"]?["fr"], "Mes packs")
    }

    // MARK: - Règle 2 : « À propos de Meeshy » redit le titre de l'écran

    func test_about_linkAbout_isGone_butTheStoreRequiredPagesStay() throws {
        XCTAssertNil(try app()["about.link.about"])
        let view = try code(Self.views + "AboutView.swift")
        XCTAssertFalse(view.contains("about.link.about\""))
        XCTAssertFalse(view.contains("https://meeshy.me/about"))
        XCTAssertTrue(view.contains("\"settings.terms\""))
        XCTAssertTrue(view.contains("\"settings.privacy_policy\""))
        XCTAssertTrue(view.contains("\"about.link.website\""))
    }

    // MARK: - Règle 7 : les fonctionnalités disent ce qu'elles sont, au repos

    func test_about_features_eachCarryAVisibleSentence_reusingTheSettingsOnes() throws {
        let view = try code(Self.views + "AboutView.swift")
        XCTAssertTrue(view.contains("settings.privacy.encryption.summary"))
        XCTAssertTrue(view.contains("settings.voice.orientation"))
        XCTAssertTrue(view.contains("about.feature.translation.summary"))
        XCTAssertFalse(view.contains("MeeshyInfoNote"), "la phrase est l'unique explication de la feature : pas un (i)")
    }

    func test_about_features_sentencesAreShort_andTranslatedInTheSixOtherLanguages() throws {
        let app = try app()
        let values = try XCTUnwrap(app["about.feature.translation.summary"])
        XCTAssertEqual(values["fr"], "Chaque message se lit dans votre langue.")
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(values[language], language)
            XCTAssertNotEqual(value, values["fr"], "\(language) : copié du français")
        }
        for key in ["about.feature.translation.summary", "settings.privacy.encryption.summary", "settings.voice.orientation"] {
            for (language, value) in try XCTUnwrap(app[key]) { XCTAssertLessThanOrEqual(value.count, 80, "\(key) [\(language)]") }
        }
    }

    func test_about_encryptionLabel_isTheOneOfThePrivacyScreen() throws {
        XCTAssertEqual(try app()["about.feature.encryption"]?["fr"], "Chiffrement de bout en bout")
    }

    // MARK: - Règle 1 : « E-mail » selon le lexique

    func test_support_emailLabel_followsTheLexicon_inEveryLanguage() throws {
        let values = try XCTUnwrap(app()["support.contact.email"])
        XCTAssertEqual(values["fr"], "E-mail du support")
        XCTAssertEqual(values["it"], "E-mail del supporto")
        XCTAssertEqual(values["ar"], "البريد الإلكتروني للدعم")
        XCTAssertFalse(values.values.contains { $0.contains("Email del") || $0.contains("Email du") })
        for language in Self.otherLanguages { XCTAssertNotEqual(values[language], values["fr"], language) }
    }

    // MARK: - Règle 3 : le titre de section porte le verbe

    func test_dataExport_contentSection_isTitledByTheVerb_inNormalCase() throws {
        let values = try XCTUnwrap(app()["settings.data.export.section.content"])
        XCTAssertEqual(values["fr"], "Inclure")
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(values[language], language)
            XCTAssertNotEqual(value, "Inclure", language)
            XCTAssertNotEqual(value, value.uppercased(), "\(language) : la casse haute écrite en dur disparaît")
        }
        let rows = try app()
        XCTAssertEqual(rows["settings.data.export.content.messages"]?["fr"], "Messages")
        XCTAssertEqual(rows["settings.data.export.content.contacts"]?["fr"], "Contacts")
    }
}
