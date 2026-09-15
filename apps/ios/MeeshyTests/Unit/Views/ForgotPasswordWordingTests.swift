import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// **« Mot de passe oublié » sert aussi à CRÉER un mot de passe** (#6644).
///
/// « La page de récupération de mot de passe doit permettre de setter le mot
/// de passe même si on a jamais eu de mot de passe ! » (directive porteur
/// 2026-09-15)
///
/// Le serveur envoie le lien à un compte qui n'a jamais eu de mot de passe
/// (#6642) — encore faut-il que l'écran le DISE. Une personne inscrite par son
/// adresse seule lit « Mot de passe oublié », conclut qu'elle n'a rien oublié,
/// et referme. La phrase dit donc ce qu'on FAIT (« choisir un nouveau mot de
/// passe »), et un (i) « Jamais eu de mot de passe ? » répond à la seule
/// question qui la retenait.
///
/// Le vocabulaire est IMPOSÉ et identique sur web-v2 et Android, dans le style
/// de #6632 : « par e-mail », la mécanique derrière un (i). Le témoin l'épingle
/// en `fr` et en `en` et exige les sept langues livrées. L'état « envoyé »
/// parle les mots de la connexion par e-mail — avec ses CLÉS, pas des jumelles.
@MainActor
final class ForgotPasswordWordingTests: XCTestCase {

    private static let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // ios
        .deletingLastPathComponent()   // apps
        .deletingLastPathComponent()   // racine du dépôt

    private static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"
    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let forgotPasswordView = "packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift"
    private static let newPasswordView = "packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyNewPasswordView.swift"

    private static let shippedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    // MARK: - Lecture

    /// `clé → langue → valeur` pour les entrées à `stringUnit` plat.
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

    /// Source privée de ses lignes de commentaire : un doc-comment qui cite
    /// « réinitialisation » pour dire pourquoi le mot est parti ne doit pas
    /// faire rougir la garde qui l'interdit dans ce que l'utilisateur LIT.
    private func code(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.repoRoot.appendingPathComponent(relativePath), encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// Chaque `String(localized:defaultValue:)` de l'écran : sa clé et le
    /// français que le compilateur embarque.
    private func localizedCalls(in body: String) -> [(key: String, defaultValue: String)] {
        let pattern = #"localized:\s*"([A-Za-z0-9_.]+)",\s*defaultValue:\s*"((?:[^"\\]|\\.)*)""#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(body.startIndex..., in: body)
        return regex.matches(in: body, range: range).compactMap { match in
            guard let key = Range(match.range(at: 1), in: body),
                  let value = Range(match.range(at: 2), in: body) else { return nil }
            return (String(body[key]), String(body[value]).replacingOccurrences(of: "\\\"", with: "\""))
        }
    }

    // MARK: - Le vocabulaire imposé, identique sur les trois clients

    private static let imposedVocabulary: [(key: String, fr: String, en: String)] = [
        ("auth.forgotPassword.title", "Mot de passe oublié", "Forgot password"),
        ("auth.forgotPassword.emailPrompt",
         "Recevez par e-mail un lien pour choisir un nouveau mot de passe.",
         "Get a link by email to choose a new password."),
        ("auth.forgotPassword.noPassword.hintLabel", "Jamais eu de mot de passe ?", "Never had a password?"),
        ("auth.forgotPassword.noPassword.hint",
         "Ce même lien vous permet d'en créer un.",
         "The same link lets you create one."),
        ("auth.forgotPassword.newPasswordTitle", "Nouveau mot de passe", "New password"),
        ("auth.forgotPassword.reset", "Enregistrer le mot de passe", "Save password"),
        ("auth.forgotPassword.resetSuccess", "Mot de passe enregistré", "Password saved"),
    ]

    func test_imposedVocabulary_isServedInFrenchAndEnglish_andShippedInEveryLocale() throws {
        let catalog = try catalog(Self.sdkCatalogPath)
        for entry in Self.imposedVocabulary {
            let values = catalog[entry.key] ?? [:]
            XCTAssertEqual(values["fr"], entry.fr, "\(entry.key) [fr]")
            XCTAssertEqual(values["en"], entry.en, "\(entry.key) [en]")
            XCTAssertEqual(Set(values.keys), Self.shippedLocales,
                           "\(entry.key) doit être traduite dans les sept langues livrées")
        }
    }

    /// La porte ne change pas de nom : c'est celle que la personne sans mot de
    /// passe doit pousser, et c'est l'écran derrière qui lui dit qu'elle peut.
    func test_loginEntry_keepsItsForgotPasswordLabel() throws {
        let values = try catalog(Self.appCatalogPath)["auth.login.forgot_password"] ?? [:]
        XCTAssertEqual(values["fr"], "Mot de passe oublié ?")
        XCTAssertEqual(values["en"], "Forgot password?")
    }

    // MARK: - Les mots de la connexion par e-mail, pas des jumelles

    /// « Recevoir le lien », « E-mail envoyé », « Ouvrez le lien reçu à »,
    /// « Rien reçu ? » : l'état envoyé dit exactement ce que dit la connexion
    /// par e-mail, il emploie donc ses clés. Une copie au catalogue du SDK
    /// divergerait à la première retouche d'un seul des deux écrans — et les
    /// trois entrées qu'elle remplace portaient encore « Envoyer », « Email
    /// envoye ! » et « un lien de réinitialisation ».
    func test_sentState_speaksTheEmailSignInKeys_notTwins() throws {
        let keys = Set(localizedCalls(in: try code(Self.forgotPasswordView)).map { $0.key })
        for borrowed in ["auth.magiclink.send", "auth.magiclink.sent.title", "auth.magiclink.sent.subtitle",
                         "auth.magiclink.sent.hintLabel", "auth.magiclink.sent.spamHint"] {
            XCTAssertTrue(keys.contains(borrowed), "« Mot de passe oublié » doit rendre \(borrowed)")
        }

        let sdk = try catalog(Self.sdkCatalogPath)
        for twin in ["auth.forgotPassword.send", "auth.forgotPassword.emailSent", "auth.forgot.sent_message"] {
            XCTAssertNil(sdk[twin], "\(twin) : une jumelle que plus rien ne rend")
        }
    }

    // MARK: - Chaque libellé est traduit, et son défaut EST le catalogue

    /// Le français embarqué (`defaultValue:`) et celui du catalogue sont la même
    /// phrase rendue par deux chemins. « Mot de passe oublie » vivait dans les
    /// deux, sans accent : rien ne les obligeait à s'accorder, rien ne les
    /// obligeait à être justes.
    func test_bothScreens_everyKeyIsTranslated_andItsDefaultIsTheCatalogFrench() throws {
        let sdk = try catalog(Self.sdkCatalogPath)
        let app = try catalog(Self.appCatalogPath)
        var scanned = 0

        for path in [Self.forgotPasswordView, Self.newPasswordView] {
            for call in localizedCalls(in: try code(path)) {
                scanned += 1
                let values = sdk[call.key] ?? app[call.key] ?? [:]
                XCTAssertEqual(Set(values.keys), Self.shippedLocales, "\(call.key) (\(path)) — sept langues")
                XCTAssertEqual(values["fr"], call.defaultValue, "\(call.key) (\(path)) — défaut ≠ catalogue")
            }
        }
        XCTAssertGreaterThan(scanned, 30, "le balayage ne voit plus les écrans — il serait vert par omission")
    }

    // MARK: - Aucun libellé visible ne dit « réinitialisation »

    /// Le mot, dans les formes que ces écrans ont réellement portées :
    /// « réinitialisation », « Reset », « Zurücksetzen », « restablecimiento »,
    /// « reimpostazione », « redefinição », « إعادة تعيين » — et « magique »,
    /// que #6632 a déjà retiré de la connexion.
    static func saysResetOrMagic(_ text: String) -> Bool {
        text.range(
            of: #"r[ée]initialis|reset|zurück(ge)?setz|restablec|reimpost|redefini|إعادة (ال)?تعيين|m[aá]gi[cq]|سحر"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    func test_resetDetector_recognizesEveryShippedFormAndNothingElse() {
        for form in ["Mot de passe reinitialise !", "Password reset!", "Passwort zurückgesetzt!",
                     "¡Contraseña restablecida!", "Password reimpostata!", "Senha redefinida!",
                     "خطأ أثناء إعادة التعيين", "Envoyer le lien magique"] {
            XCTAssertTrue(Self.saysResetOrMagic(form), "« \(form) » doit être reconnu")
        }
        for innocent in ["Enregistrer le mot de passe", "Save password", "Immagine", "Recevoir le lien"] {
            XCTAssertFalse(Self.saysResetOrMagic(innocent), "« \(innocent) » n'est pas le mot visé")
        }
    }

    func test_bothScreens_noVisibleLabelSaysResetOrMagic() throws {
        let sdk = try catalog(Self.sdkCatalogPath)
        let app = try catalog(Self.appCatalogPath)
        var offenders: [String] = []

        for path in [Self.forgotPasswordView, Self.newPasswordView] {
            for call in localizedCalls(in: try code(path)) {
                let values = sdk[call.key] ?? app[call.key] ?? [:]
                for (lang, value) in values.sorted(by: { $0.key < $1.key }) where Self.saysResetOrMagic(value) {
                    offenders.append("\(call.key) [\(lang)] « \(value) »")
                }
                if Self.saysResetOrMagic(call.defaultValue) {
                    offenders.append("\(path) defaultValue « \(call.defaultValue) »")
                }
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "On y CHOISIT un mot de passe, qu'on en ait eu un ou jamais — rien n'y est « réinitialisé » :\n"
            + offenders.joined(separator: "\n")
        )
    }

    // MARK: - Le (i) est RENDU sur l'étape e-mail

    /// Le catalogue peut porter la question sans que l'écran la monte. Monté,
    /// l'écran annonce un (i) dont le libellé est « Jamais eu de mot de passe ? »
    /// dans la langue de l'hôte — quelle qu'elle soit, d'où la comparaison aux
    /// sept valeurs du catalogue plutôt qu'à un littéral français.
    func test_emailStep_rendersTheNeverHadAPasswordHint() throws {
        let screen = RenderedScreen(MeeshyForgotPasswordView())
        defer { screen.dismount() }

        XCTAssertNotNil(screen.frame(of: "auth.forgotPassword.noPasswordHint"),
                        "le (i) « Jamais eu de mot de passe ? » n'est pas rendu sur l'étape e-mail")
        let announced = screen.node("auth.forgotPassword.noPasswordHint")?.label ?? ""
        let questions = Set((try catalog(Self.sdkCatalogPath)["auth.forgotPassword.noPassword.hintLabel"] ?? [:]).values)
        XCTAssertTrue(questions.contains(announced),
                      "le (i) annonce « \(announced) » — pas la question du catalogue")
    }
}
