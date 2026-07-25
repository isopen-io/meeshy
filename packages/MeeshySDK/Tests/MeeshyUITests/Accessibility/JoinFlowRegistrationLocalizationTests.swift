import XCTest
@testable import MeeshyUI

/// Deep links & join flow lane (2026-07-20 audit backlog, item P3) —
/// `JoinFlowViewModel` and `RegistrationViewModel` used to assign hardcoded
/// French error strings directly to their `@Published` state
/// (`errorMessage`, `usernameError`, `emailError`, `phoneError`), bypassing
/// the i18n catalog entirely — an English/Spanish/German/Portuguese user
/// would see raw French error copy regardless of their configured language.
/// Both now route through `String(localized:defaultValue:bundle:)` against
/// the MeeshyUI `Localizable.xcstrings` catalog (`joinFlow.error.*` /
/// `auth.registration.*` keys).
///
/// `Bundle.module` is `@MainActor`-isolated under MeeshyUI's
/// `defaultIsolation(MainActor)` (see `feedback_bundle_module_mainactor_isolation.md`);
/// the test class is therefore `@MainActor`.
@MainActor
final class JoinFlowRegistrationLocalizationTests: XCTestCase {

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

    private static let registrationErrorKeys: [String] = [
        "auth.registration.usernameTaken",
        "auth.registration.verificationFailed",
        "auth.registration.emailTaken",
        "auth.registration.phoneInvalid",
        "auth.registration.phoneTaken",
        "auth.registration.registrationFailed",
    ]

    // MARK: - Catalog completeness (proves the keys exist and are translated,
    // not just present with an empty/echoed value)

    func test_joinFlowErrorKeys_resolveInAll5Locales() {
        assertResolvesInAllLocales(Self.joinFlowErrorKeys)
    }

    func test_registrationErrorKeys_resolveInAll5Locales() {
        assertResolvesInAllLocales(Self.registrationErrorKeys)
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

    func test_registrationViewModel_errorsRouteThroughCatalog_notRawFrenchLiterals() throws {
        let source = try sdkSource("Sources/MeeshyUI/Auth/RegistrationViewModel.swift")

        XCTAssertTrue(source.contains(#"String(localized: "auth.registration.usernameTaken", defaultValue: "Ce pseudo est deja pris!", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "auth.registration.verificationFailed", defaultValue: "Verification non effectuee", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "auth.registration.emailTaken", defaultValue: "Cet email est deja utilise!", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "auth.registration.phoneInvalid", defaultValue: "Ce numero semble invalide", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "auth.registration.phoneTaken", defaultValue: "Ce numero est deja utilise!", bundle: .module)"#))
        XCTAssertTrue(source.contains(#"String(localized: "auth.registration.registrationFailed", defaultValue: "Erreur lors de l'inscription", bundle: .module)"#))

        // Regression guard: the old bare-literal assignments must be gone.
        XCTAssertFalse(source.contains(#"usernameError = "Ce pseudo est deja pris!""#))
        XCTAssertFalse(source.contains(#"usernameError = "Verification non effectuee""#))
        XCTAssertFalse(source.contains(#"emailError = "Cet email est deja utilise!""#))
        XCTAssertFalse(source.contains(#"emailError = "Verification non effectuee""#))
        XCTAssertFalse(source.contains(#"phoneError = "Ce numero semble invalide""#))
        XCTAssertFalse(source.contains(#"phoneError = "Ce numero est deja utilise!""#))
        XCTAssertFalse(source.contains(#"phoneError = "Verification non effectuee""#))
        XCTAssertFalse(source.contains(#"?? "Erreur lors de l'inscription""#))
    }
}
