import XCTest
@testable import MeeshyUI

/// Deep links & join flow lane (2026-07-20 audit backlog, item P3) —
/// `JoinFlowViewModel` used to assign hardcoded French error strings directly
/// to its `@Published` state (`errorMessage`), bypassing the i18n catalog
/// entirely — an English/Spanish/German/Portuguese user would see raw French
/// error copy regardless of their configured language. It now routes through
/// `String(localized:defaultValue:bundle:)` against the MeeshyUI
/// `Localizable.xcstrings` catalog (`joinFlow.error.*` keys).
///
/// **La moitié « inscription » de cette suite est partie au #5218**, avec son
/// sujet : `RegistrationViewModel` (le wizard en huit étapes) est supprimé, et
/// l'écran qui le remplace — `SignupView` — vit côté APP, donc ses clés
/// (`auth.signup.*`) sont dans le catalogue de l'app et gardées par
/// `LocalizationConsistencyTests`, qui l'épingle parmi les écrans
/// « fully localized ». Garder ici des assertions sur un fichier supprimé ne
/// compilerait pas ; les garder sur des CLÉS orphelines attesterait d'un
/// produit qui ne dit plus rien.
///
/// `Bundle.module` is `@MainActor`-isolated under MeeshyUI's
/// `defaultIsolation(MainActor)` (see `feedback_bundle_module_mainactor_isolation.md`);
/// the test class is therefore `@MainActor`.
@MainActor
final class JoinFlowLocalizationTests: XCTestCase {

    // MARK: - Constants

    /// The 5 product locales every catalog key MUST ship translations for.
    private static let requiredLocales: Set<String> = [
        "fr", "en", "de", "es", "pt-BR"
    ]

    private static let joinFlowErrorKeys: [String] = [
        "joinFlow.error.linkNotFound",
        "joinFlow.error.unknown",
        "joinFlow.error.loadFailed",
        "joinFlow.error.tooManyUsers",
        "joinFlow.error.joinFailed",
        "joinFlow.error.unexpected",
    ]

    // MARK: - Catalog completeness (proves the keys exist and are translated,
    // not just present with an empty/echoed value)

    func test_joinFlowErrorKeys_resolveInAll5Locales() {
        assertResolvesInAllLocales(Self.joinFlowErrorKeys)
    }

    private func assertResolvesInAllLocales(
        _ keys: [String],
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        for key in keys {
            for localeId in Self.requiredLocales.sorted() {
                let locale = Locale(identifier: localeId)
                let value = String(
                    localized: String.LocalizationValue(key),
                    bundle: .module,
                    locale: locale
                )
                XCTAssertNotEqual(
                    value, key,
                    "Key '\(key)' returned itself raw for locale '\(localeId)' — translation missing in Localizable.xcstrings",
                    file: file, line: line
                )
                XCTAssertFalse(
                    value.isEmpty,
                    "Key '\(key)' resolved to empty for locale '\(localeId)'",
                    file: file, line: line
                )
            }
        }
    }

    // MARK: - Source-guard: production code actually calls through the
    // catalog (not just "the catalog happens to have unused keys")

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Accessibility/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_joinFlowViewModel_errorsRouteThroughCatalog_notRawFrenchLiterals() throws {
        let source = try sdkSource("Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift")

        XCTAssertTrue(source.contains(#"String(localized: "joinFlow.error.linkNotFound", defaultValue: "Ce lien de conversation est introuvable", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "joinFlow.error.unknown", defaultValue: "Erreur inconnue", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "joinFlow.error.loadFailed", defaultValue: "Impossible de charger les informations du lien", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "joinFlow.error.tooManyUsers", defaultValue: "Trop d'utilisateurs connectes", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "joinFlow.error.joinFailed", defaultValue: "Erreur lors de la connexion", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "joinFlow.error.unexpected", defaultValue: "Erreur inattendue", bundle: .module)"#))

        // Regression guard: the old bare-literal assignments must be gone —
        // if this fails, someone reverted to hardcoded, non-localized copy.
        XCTAssertFalse(source.contains(#"message = "Ce lien de conversation est introuvable""#))
        XCTAssertFalse(source.contains(#"?? "Erreur inconnue""#))
        XCTAssertFalse(source.contains(#"let message = "Impossible de charger les informations du lien""#))
        XCTAssertFalse(source.contains(#"errorMessage = "Trop d'utilisateurs connectes""#))
        XCTAssertFalse(source.contains(#"?? "Erreur lors de la connexion""#))
        XCTAssertFalse(source.contains(#"errorMessage = "Erreur inattendue""#))
    }
}
