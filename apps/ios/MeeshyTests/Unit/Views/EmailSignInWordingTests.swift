import XCTest

/// **Se connecter et s'inscrire se lisent en une ligne : « par e-mail », la
/// mécanique derrière un (i)** (#6626, directive porteur 2026-09-15).
///
/// « L'utilisateur a besoin de savoir qu'il va se connecter par e-mail et non
/// de savoir que c'est magic-mail… Garder la baguette magique mais être clair
/// et simple. »
///
/// Le mot « magique » ne décrit pas ce que la personne fait : elle tape son
/// adresse et ouvre un e-mail. Il décrit une TECHNIQUE, et la technique n'a rien
/// à faire dans un libellé. Ce qui explique le fonctionnement reste disponible,
/// mais REPLIÉ derrière le même (i) que les notes de l'inscription.
///
/// Le vocabulaire est IMPOSÉ et identique sur les trois clients : web-v2 et
/// Android portent les mêmes phrases. Le témoin l'épingle en `fr` et en `en`
/// pour que la dérive d'un client se voie sans avoir à ouvrir les deux autres.
final class EmailSignInWordingTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let loginView = "Meeshy/Features/Main/Views/LoginView.swift"
    private static let magicLinkView = "Meeshy/Features/Main/Views/MagicLinkView.swift"
    private static let signupView = "Meeshy/Features/Auth/Signup/SignupView.swift"
    private static let infoHint = "Meeshy/Features/Auth/AuthInfoHint.swift"
    private static let catalogPath = "Meeshy/Localizable.xcstrings"

    private static let shippedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Source privée de ses lignes de commentaire : un doc-comment qui cite
    /// « lien magique » pour dire pourquoi il a disparu ne doit pas faire rougir
    /// la garde qui l'interdit dans ce que l'utilisateur LIT.
    private func code(_ relativePath: String) throws -> String {
        try source(relativePath)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// `clé → langue → valeur` pour les entrées à `stringUnit` plat.
    private func catalog() throws -> [String: [String: String]] {
        let data = try Data(contentsOf: Self.iosRoot.appendingPathComponent(Self.catalogPath))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: [String: Any]])
        return strings.mapValues { entry in
            let localizations = entry["localizations"] as? [String: [String: Any]] ?? [:]
            return localizations.compactMapValues { unit in
                (unit["stringUnit"] as? [String: Any])?["value"] as? String
            }
        }
    }

    private func matches(of pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            Range(match.range(at: 1), in: text).map { String(text[$0]) }
        }
    }

    private func authKeys(in code: String) -> Set<String> {
        Set(matches(of: #"localized:\s*"(auth\.[A-Za-z0-9_.]+)""#, in: code))
    }

    private func defaultValues(in code: String) -> [String] {
        matches(of: #"defaultValue:\s*"((?:[^"\\]|\\.)*)""#, in: code)
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Le mot, dans les formes que le catalogue a réellement portées : « lien
    /// magique », « Magic Link », « enlace mágico », « link magico »,
    /// « الرابط السحري ».
    static func saysMagic(_ text: String) -> Bool {
        text.range(of: #"m[aá]gi[cq]|سحر"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    // MARK: - Le détecteur voit ce qu'il doit voir

    /// Sans ce témoin, un détecteur trop étroit rendrait la garde verte par
    /// omission — et « immagine » (italien) doit rester hors de sa portée.
    func test_magicDetector_recognizesEveryShippedFormAndNothingElse() {
        for form in ["Renvoyer le lien magique", "Magic Link senden", "Enviar el enlace mágico",
                     "Invia il link magico", "Send the magic link", "إرسال الرابط السحري"] {
            XCTAssertTrue(Self.saysMagic(form), "« \(form) » doit être reconnu")
        }
        for innocent in ["Immagine condivisa", "Imagine", "Se connecter par e-mail"] {
            XCTAssertFalse(Self.saysMagic(innocent), "« \(innocent) » n'est pas le mot visé")
        }
    }

    // MARK: - Aucun libellé visible ne dit « magique »

    /// Toutes les clés `auth.*` que les trois écrans RENDENT, dans les sept
    /// langues, plus les `defaultValue:` que le compilateur embarque.
    func test_authScreens_noVisibleLabelSaysMagic() throws {
        let catalog = try catalog()
        var offenders: [String] = []
        var scannedKeys = 0

        for path in [Self.loginView, Self.magicLinkView, Self.signupView] {
            let body = try code(path)
            let keys = authKeys(in: body)
            scannedKeys += keys.count
            for key in keys.sorted() {
                for (lang, value) in (catalog[key] ?? [:]).sorted(by: { $0.key < $1.key })
                where Self.saysMagic(value) {
                    offenders.append("\(key) [\(lang)] « \(value) »")
                }
            }
            for literal in defaultValues(in: body) where Self.saysMagic(literal) {
                offenders.append("\(path) defaultValue « \(literal) »")
            }
        }

        XCTAssertGreaterThan(scannedKeys, 30, "le balayage ne voit plus les écrans — il serait vert par omission")
        XCTAssertTrue(
            offenders.isEmpty,
            "L'utilisateur se connecte PAR E-MAIL ; la technique ne se nomme pas dans un libellé (#6626) :\n"
            + offenders.joined(separator: "\n")
        )
    }

    // MARK: - Le vocabulaire imposé, identique sur les trois clients

    private static let imposedVocabulary: [(key: String, fr: String, en: String)] = [
        ("auth.login.passwordless", "Se connecter par e-mail", "Sign in with email"),
        ("auth.magiclink.title", "Connexion par e-mail", "Email sign-in"),
        ("auth.magiclink.email.title", "Votre adresse e-mail", "Your email address"),
        ("auth.magiclink.email.hintLabel", "Comment ça marche", "How it works"),
        ("auth.magiclink.email.subtitle",
         "Pas de mot de passe à retenir : nous vous envoyons un lien par e-mail. Ouvrez-le et vous êtes connecté.",
         "No password to remember: we email you a link. Open it and you're signed in."),
        ("auth.magiclink.send", "Recevoir le lien", "Get the link"),
        ("auth.magiclink.resendLabel", "Renvoyer le lien", "Resend the link"),
        ("auth.magiclink.sent.title", "E-mail envoyé", "Email sent"),
        ("auth.magiclink.sent.subtitle", "Ouvrez le lien reçu à", "Open the link sent to"),
        ("auth.magiclink.sent.hintLabel", "Rien reçu ?", "Nothing received?"),
        ("auth.magiclink.sent.spamHint",
         "Regardez vos indésirables (spam) : le message peut y être tombé.",
         "Check your spam folder: the message may have landed there."),
        ("auth.signup.email.hintLabel", "Pourquoi un lien", "Why a link"),
    ]

    func test_imposedVocabulary_isServedInFrenchAndEnglish_andShippedInEveryLocale() throws {
        let catalog = try catalog()
        for entry in Self.imposedVocabulary {
            let values = catalog[entry.key] ?? [:]
            XCTAssertEqual(values["fr"], entry.fr, "\(entry.key) [fr]")
            XCTAssertEqual(values["en"], entry.en, "\(entry.key) [en]")
            XCTAssertEqual(Set(values.keys), Self.shippedLocales,
                           "\(entry.key) doit être traduite dans les sept langues livrées")
        }
    }

    /// La clé retirée de l'écran quitte aussi le catalogue : une entrée que
    /// rien ne rend est une traduction à tenir pour personne.
    func test_redundantInstructionsLine_isGoneFromScreenAndCatalog() throws {
        XCTAssertFalse(try code(Self.magicLinkView).contains("auth.magiclink.instructions"),
                       "« Ouvrez votre email et cliquez sur le lien » répétait le sous-titre")
        XCTAssertNil(try catalog()["auth.magiclink.instructions"])
    }

    // MARK: - L'entrée de connexion garde la baguette

    func test_loginEntry_readsSignInWithEmail_besideTheWand() throws {
        let body = try code(Self.loginView)
        let start = try XCTUnwrap(body.range(of: "showMagicLink = true"),
                                  "l'entrée qui ouvre la connexion par e-mail est introuvable")
        let end = try XCTUnwrap(body.range(of: "auth.login.forgot_password", range: start.upperBound..<body.endIndex))
        let entry = body[start.lowerBound..<end.lowerBound]

        XCTAssertTrue(entry.contains("auth.login.passwordless"))
        XCTAssertTrue(entry.contains("\"wand.and.stars\""),
                      "la baguette reste l'icône de la connexion par e-mail — c'est le mot qui part, pas le signe")
    }

    // MARK: - La mécanique derrière un (i)

    func test_magicLinkView_explainsItsMechanicBehindTwoInfoHints() throws {
        let body = try code(Self.magicLinkView)

        XCTAssertEqual(occurrences(of: "AuthInfoHintButton(", in: body), 2,
                       "« Comment ça marche » à la saisie, « Rien reçu ? » après l'envoi")
        XCTAssertEqual(occurrences(of: "AuthInfoHintText(", in: body), 2,
                       "chaque (i) déplie SON texte, sous sa ligne")
        XCTAssertTrue(body.contains("auth.magiclink.email.hintLabel"))
        XCTAssertTrue(body.contains("auth.magiclink.sent.hintLabel"))
        XCTAssertTrue(body.contains("auth.magiclink.sent.spamHint"))
        XCTAssertTrue(matches(of: #"(Text\(String\(localized:\s*"auth\.magiclink\.email\.subtitle")"#, in: body).isEmpty,
                      "le « comment ça marche » ne se pose plus en clair : il est le texte du (i)")
        XCTAssertTrue(body.contains("\"wand.and.stars\""), "le héros de l'écran reste la baguette")
    }

    /// REPLIÉ ne veut pas dire ABSENT : le champ d'adresse porte le même texte
    /// en `accessibilityHint`, comme les champs de l'inscription.
    func test_magicLinkView_emailFieldCarriesTheFoldedExplanationForVoiceOver() throws {
        let body = try code(Self.magicLinkView)
        XCTAssertTrue(body.contains(".accessibilityHint(howItWorksHint.text)"),
                      "VoiceOver énonce le fonctionnement sans avoir à trouver le (i)")
    }

    // MARK: - UN composant (i), deux écrans

    func test_infoHint_isOneComponentSharedBySignupAndMagicLink() throws {
        let hint = try code(Self.infoHint)
        XCTAssertTrue(hint.contains("\"info.circle\""))
        XCTAssertTrue(hint.contains("HapticFeedback.light()"), "déplier un (i) se sent, sur les deux écrans")
        XCTAssertTrue(hint.contains("meeshyTapTarget()"), "le (i) est un glyphe : sa cible ne peut pas être son dessin")
        XCTAssertTrue(hint.contains("accessibilityLabel(hint.buttonLabel)"),
                      "plusieurs (i) sur un écran ne se distinguent que par ce qu'ils annoncent")
        XCTAssertTrue(hint.contains("accessibilityValue(hint.text)"))

        for path in [Self.signupView, Self.magicLinkView] {
            let body = try code(path)
            XCTAssertTrue(body.contains("AuthInfoHintButton("), "\(path) monte le (i) partagé")
            XCTAssertFalse(body.contains("Image(systemName: \"info.circle\")"),
                           "\(path) : un (i) recopié sur place est une jumelle qui divergera")
        }
    }
}
