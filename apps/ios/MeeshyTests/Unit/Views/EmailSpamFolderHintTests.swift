import XCTest
import MeeshyUI
@testable import Meeshy

/// **Chaque écran qui annonce un e-mail parti dit de regarder les spams** (#16937).
///
/// « Indiquer de vérifier le dossier junk, spam, courrier indésirables si la
/// boîte de réception principale n'affiche pas l'e-mail sous quelques
/// secondes… be clean and concise » (porteur, 2026-11-08). Le web le dit déjà
/// (`emailSent.checkSpam`, #16452) ; iOS le cachait derrière un (i) « Rien
/// reçu ? » sur deux écrans, le disait autrement sur un troisième, et se
/// taisait ailleurs.
///
/// UNE ligne visible, UN libellé, UN composant (`EmailSpamFolderHint`) : la
/// phrase du web mot pour mot, dans les sept langues livrées. Rien pour le
/// SMS : un texto n'a pas de dossier spam.
@MainActor
final class EmailSpamFolderHintTests: XCTestCase {

    private static let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // ios
        .deletingLastPathComponent()   // apps
        .deletingLastPathComponent()   // racine du dépôt

    private static let key = "emailSent.checkSpam"
    private static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"
    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let component = "packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/EmailSpamFolderHint.swift"

    /// Langue du catalogue iOS → suffixe du catalogue web.
    private static let webLocales: [String: String] = [
        "fr": "fr", "en": "en", "es": "es", "pt-BR": "pt", "de": "de", "it": "it", "ar": "ar",
    ]

    /// Les écrans qui annoncent qu'un e-mail est parti. `EmailCodeEntry` porte
    /// la ligne pour les quatre portes qui mènent au code reçu par e-mail
    /// (vérification d'e-mail, carte de l'inscription, invitation à activer,
    /// barrière d'activation).
    private static let hosts = [
        "packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift",
        "apps/ios/Meeshy/Features/Auth/Views/MagicLinkView.swift",
        "apps/ios/Meeshy/Features/Auth/Views/EmailCodeEntry.swift",
        "apps/ios/Meeshy/Features/Settings/Views/SecurityEmailSection.swift",
        "apps/ios/Meeshy/Features/Settings/Views/DeleteAccountView.swift",
        "apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift",
    ]

    private static let codeEntryHosts = [
        "apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift",
        "apps/ios/Meeshy/Features/Auth/Signup/SignupView+Card.swift",
        "apps/ios/Meeshy/Features/Activation/ActivationInviteView.swift",
    ]

    // MARK: - Lecture

    private func catalog(_ relativePath: String) throws -> [String: [String: String]] {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent(relativePath))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: [String: Any]])
        return strings.mapValues { entry in
            let localizations = entry["localizations"] as? [String: [String: Any]] ?? [:]
            return localizations.compactMapValues { unit in
                (unit["stringUnit"] as? [String: Any])?["value"] as? String
            }
        }
    }

    private func code(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.repoRoot.appendingPathComponent(relativePath), encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") && !$0.trimmingCharacters(in: .whitespaces).hasPrefix("///") }
            .joined(separator: "\n")
    }

    private func webSentence(locale: String) throws -> String {
        let path = "apps/web/src/lib/interface-catalogs/catalog-\(locale)-verify-email.ts"
        let source = try String(contentsOf: Self.repoRoot.appendingPathComponent(path), encoding: .utf8)
        let pattern = #"'emailSent\.checkSpam':\s*'((?:[^'\\]|\\.)*)'"#
        let regex = try NSRegularExpression(pattern: pattern)
        let match = try XCTUnwrap(regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
                                  "\(path) ne porte plus emailSent.checkSpam")
        let range = try XCTUnwrap(Range(match.range(at: 1), in: source))
        return String(source[range]).replacingOccurrences(of: "\\'", with: "'")
    }

    // MARK: - Le libellé

    func test_text_resolvesFromTheCatalog_notTheRawKey() {
        XCTAssertFalse(EmailSpamFolderHint.text.isEmpty)
        XCTAssertNotEqual(EmailSpamFolderHint.text, Self.key)
    }

    func test_catalog_checkSpam_isTheWebSentenceInEverySevenLocales() throws {
        let values = try catalog(Self.sdkCatalogPath)[Self.key] ?? [:]

        XCTAssertEqual(Set(values.keys), Set(Self.webLocales.keys), "sept langues livrées")
        for (iosLocale, webLocale) in Self.webLocales {
            XCTAssertEqual(values[iosLocale], try webSentence(locale: webLocale), "\(Self.key) [\(iosLocale)]")
        }
    }

    func test_component_defaultValue_isTheCatalogFrench() throws {
        let body = try code(Self.component)
        let french = try XCTUnwrap(try catalog(Self.sdkCatalogPath)[Self.key]?["fr"])

        XCTAssertTrue(body.contains("defaultValue: \"\(french)\""), "le défaut embarqué EST le français du catalogue")
        XCTAssertTrue(body.contains("bundle: .module"), "le libellé vit au catalogue de MeeshyUI, une seule fois")
    }

    func test_component_isACaptionLine_neverABanner() throws {
        let body = try code(Self.component)

        XCTAssertTrue(body.contains(".font(.caption)"), "Dynamic Type : une police sémantique")
        XCTAssertTrue(body.contains(".foregroundStyle(.secondary)"))
        XCTAssertFalse(body.contains(".background("), "une ligne discrète, pas une bannière")
        XCTAssertFalse(body.contains("accessibilityHidden"), "VoiceOver la lit")
    }

    // MARK: - Chaque écran « e-mail envoyé » la rend

    func test_emailSentScreens_renderTheSharedHint() throws {
        for path in Self.hosts {
            XCTAssertTrue(try code(path).contains("EmailSpamFolderHint("), "\(path) annonce un e-mail parti sans dire de regarder les spams")
        }
    }

    func test_codeByEmailScreens_mountEmailCodeEntry_whichCarriesTheHint() throws {
        for path in Self.codeEntryHosts {
            XCTAssertTrue(try code(path).contains("EmailCodeEntry(viewModel:"), "\(path) ne passe plus par EmailCodeEntry")
        }
    }

    /// La connexion par e-mail pose sa ligne SOUS « Code et lien envoyés à » :
    /// le champ de code qu'elle monte se tait, sans quoi l'écran la dirait deux fois.
    func test_magicLink_saysItOnce() throws {
        let body = try code("apps/ios/Meeshy/Features/Auth/Views/MagicLinkView.swift")

        XCTAssertEqual(body.components(separatedBy: "EmailSpamFolderHint(").count - 1, 1)
        XCTAssertTrue(body.contains("EmailCodeEntry(viewModel: codeEntry, showsSpamFolderHint: false)"))
    }

    // MARK: - Les jumelles sont parties

    func test_foldedAndTwinSpamHints_areGoneFromScreensAndCatalogs() throws {
        let retired = ["auth.magiclink.sent.spamHint", "auth.magiclink.sent.hintLabel", "emailVerification.inboxHint"]
        let sources = try (Self.hosts + Self.codeEntryHosts + ["apps/ios/Meeshy/Features/Auth/ViewModels/EmailVerificationViewModel.swift"])
            .map { try code($0) }
            .joined(separator: "\n")
        let app = try catalog(Self.appCatalogPath)
        let sdk = try catalog(Self.sdkCatalogPath)

        for key in retired {
            XCTAssertFalse(sources.contains(key), "\(key) : une seconde façon de dire la même chose")
            XCTAssertNil(app[key], "\(key) reste au catalogue de l'app sans que rien ne la rende")
            XCTAssertNil(sdk[key], "\(key) reste au catalogue du SDK sans que rien ne la rende")
        }
    }

    /// Un SMS n'a pas de dossier spam : le parcours par téléphone ne dit rien.
    func test_phoneCodeSentLine_saysNothingAboutSpam() throws {
        let security = try code("apps/ios/Meeshy/Features/Settings/Views/SecurityPhoneSection.swift")
        let start = try XCTUnwrap(security.range(of: "settings.security.phone.code_sent"))
        let tail = security[start.lowerBound...].prefix(600)

        XCTAssertFalse(tail.contains("EmailSpamFolderHint("))
    }
}
