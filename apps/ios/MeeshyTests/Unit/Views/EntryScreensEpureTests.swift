import XCTest
@testable import Meeshy

/// L'épure des écrans d'entrée (#17584, lot iOS 1/3, #17671) : connexion,
/// inscription, lien par e-mail, vérification, session fermée, validation du
/// compte, lien de connexion, accueil. Un libellé NOMME, une phrase ne dit pas
/// deux fois ce que dit le titre ou le bouton voisin, et les repères propres à
/// Meeshy restent LISIBLES AU REPOS (règle 7).
///
/// Les textes se testent dans le catalogue (c'est lui qui s'affiche, jamais le
/// `defaultValue`), les vues par leur source (elles ne se construisent pas hors
/// environnement), les modèles par leur comportement.
@MainActor
final class EntryScreensEpureTests: XCTestCase {

    // MARK: - Lecture du catalogue et des sources

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private static func catalog(_ relativePath: String) throws -> Catalog {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent(relativePath))
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

    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let sdkCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"
    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    private func appCode(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    private func sdkCode(_ relativePath: String) throws -> String {
        let raw = try String(contentsOf: Self.repoRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
    }

    private func specifiers(in text: String) -> [String] {
        let pattern = #"%(\d+\$)?(@|lld|d|ld)"#
        let regex = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(text.startIndex..., in: text)
        return (regex?.matches(in: text, range: range) ?? []).compactMap { Range($0.range, in: text).map { String(text[$0]) } }.sorted()
    }

    // MARK: - Le nouveau français de chaque libellé raccourci (règles 1 et 2)

    private static let appFrench: [String: String] = [
        "auth.login.two_factor.description": "Entrez le code à 6 chiffres de votre application d'authentification.",
        "auth.magiclink.email.subtitle": "Pas de mot de passe : nous envoyons un lien par e-mail.",
        "auth.magiclink.sent.heading": "Code et lien envoyés",
        "auth.signup.email.verificationNotice": "Nous envoyons un lien à cette adresse : ouvrez-le pour valider.",
        "auth.signup.password.why.detail": "Sans mot de passe, vous vous connectez toujours par un lien reçu par e-mail.",
        "auth.signup.error.phoneOwned": "Numéro déjà rattaché à un compte : saisissez-en un autre ou connectez-vous.",
        "emailVerification.subtitle.accountCreated": "Compte créé. Code et lien envoyés à **%@**.",
        "emailVerification.subtitle.activationRequired": "Activez votre compte : un code a été envoyé à **%@** pour prouver cette adresse.",
        "sessionClosed.admin.title": "Session fermée par l'équipe Meeshy",
        "sessionClosed.admin.message": "Pour protéger votre compte.",
        "sessionClosed.userRevoke.message": "Session fermée depuis un autre appareil. Pas vous ? Changez votre mot de passe.",
        "sessionClosed.password.message": "Pas vous à l'origine du changement ? Réinitialisez-le tout de suite.",
        "sessionClosed.allSignedOut.message": "Toutes les sessions du compte sont fermées.",
        "sessionClosed.activation.message": "Reconnectez-vous puis saisissez le code reçu par e-mail.",
        "activation.invite.daysLeft": "Encore %lld jours : ensuite, la connexion demandera un code.",
        "activation.invite.daysLeft.one": "Encore 1 jour : ensuite, la connexion demandera un code.",
        "activation.invite.lead": "Pour l'utiliser sans interruption.",
        "activation.email.sent": "Code envoyé à %@.",
        "activation.gate.publish": "Votre publication est conservée et partira dès le code validé.",
        "activation.gate.invite": "Votre invitation partira dès le code validé.",
        "activation.gate.link": "Votre lien sera créé dès le code validé.",
        "activation.gate.moreLinks": "Au-delà de 5 liens actifs, un code est demandé. Votre lien sera créé dès qu’il est validé.",
        "signInLink.switchAccount.message": "Ce lien ouvre un AUTRE compte que %2$@ : %1$@. N'ouvrez que s'il vous appartient.",
        "signInLink.switchAccount.messageUnknownCurrent": "Ce lien ouvre un AUTRE compte que celui qui est ouvert : %@. N'ouvrez que s'il vous appartient.",
        "signInLink.deviceConfirm.message": "Ce lien n'a pas été demandé depuis cet appareil. Il ouvre %@ : continuez seulement s'il vous appartient.",
        "signInLink.deviceConfirm.messageReplacing": "Ce lien n'a pas été demandé depuis cet appareil. Il ouvre %1$@ à la place de %2$@ (qui reste au sélecteur de comptes) : continuez seulement s'il vous appartient.",
        "onboarding.email.body": "Touche le lien reçu pour confirmer ton compte.",
        "onboarding.profile.body": "Un visage et une bannière : on te reconnaît partout.",
        "auth.signup.card.verified.lead": "Vos proches vous lisent dans votre langue.",
        "emailVerification.title": "Confirmez votre adresse e-mail",
        "emailVerification.success": "Adresse confirmée ✓",
        "emailVerification.code.a11yHint": "Entrez le code à 6 chiffres reçu par e-mail",
        "auth.magiclink.email.a11yLabel": "Adresse e-mail",
        "onboarding.story.verify": "Confirme ton adresse e-mail pour publier",
        "onboarding.friends.lead": "Ajoute 3 personnes qui te ressemblent.",
        "onboarding.global.body": "Meeshy Global, le salon où tout le monde traîne.",
        "onboarding.story.body": "Une photo, un mot : une story.",
        "onboarding.story.audience.friends": "Visible par tes amis",
        "onboarding.story.audience.public": "Visible par tout le monde",
        "onboarding.recap.body": "Tes premières étincelles sont là.",
        "onboarding.recap.empty": "Tout est prêt.",
        "onboarding.recap.tomorrow": "Demain, ta Flamme brûlera depuis %lld jours.",
        "onboarding.contacts.offer.body": "Retrouve-les, et on te prévient quand l'un d'eux arrive.",
        "onboarding.contacts.found.body": "Ajoute-les. On te prévient quand un autre arrive.",
        "onboarding.contacts.none.body": "Aucun contact n'est encore ici. Invite-les, on te prévient dès qu'un arrive.",
        "onboarding.contacts.none.body.nosms": "Aucun contact n'est encore ici. On te prévient dès qu'un arrive.",
        "onboarding.age.body": "Pour te proposer les bons espaces.",
    ]

    private static let sdkFrench: [String: String] = [
        "auth.forgotPassword.verifyIdentityPrompt": "Entrez votre nom d'utilisateur et votre e-mail complets.",
        "auth.forgotPassword.error.codeRequired": "Compte protégé : saisissez le code de votre application d'authentification.",
        "auth.forgotPassword.error.weak": "Mot de passe trop facile à deviner : choisissez-en un plus long.",
    ]

    func test_catalog_shortenedLabels_sayTheirNewFrench() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for (key, expected) in Self.appFrench {
            XCTAssertEqual(app[key]?["fr"], expected, key)
        }
        let sdk = try Self.catalog(Self.sdkCatalogPath)
        for (key, expected) in Self.sdkFrench {
            XCTAssertEqual(sdk[key]?["fr"], expected, key)
        }
    }

    func test_catalog_shortenedLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        let sdk = try Self.catalog(Self.sdkCatalogPath)
        let all = Self.appFrench.keys.map { (catalog: app, key: $0) } + Self.sdkFrench.keys.map { (catalog: sdk, key: $0) }
        for (catalog, key) in all {
            let values = catalog[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    /// Un libellé de plus de 80 caractères se justifie : la consigne de sécurité
    /// d'un lien qui ouvre un autre compte, ou la limite des liens actifs. Tout
    /// le reste du périmètre tient en une ligne.
    func test_catalog_shortenedLabels_stayUnderEightyCharacters_exceptTheSecurityAlertsAndTheLinkLimit() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        let justified: Set<String> = [
            "activation.gate.moreLinks",
            "signInLink.switchAccount.message", "signInLink.switchAccount.messageUnknownCurrent",
            "signInLink.deviceConfirm.message", "signInLink.deviceConfirm.messageReplacing",
        ]
        for key in Self.appFrench.keys where !justified.contains(key) {
            let french = try XCTUnwrap(app[key]?["fr"], key)
            XCTAssertLessThanOrEqual(french.count, 80, "\(key) : \(french)")
        }
    }

    func test_catalog_securityAlerts_keepSayingThatAnotherAccountOpens() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for key in ["signInLink.switchAccount.message", "signInLink.switchAccount.messageUnknownCurrent"] {
            XCTAssertTrue(app[key]?["fr"]?.contains("AUTRE compte") == true, key)
        }
        for key in ["signInLink.deviceConfirm.message", "signInLink.deviceConfirm.messageReplacing"] {
            XCTAssertTrue(app[key]?["fr"]?.contains("pas été demandé depuis cet appareil") == true, key)
            XCTAssertTrue(app[key]?["fr"]?.contains("s'il vous appartient") == true, key)
        }
    }

    // MARK: - Une clé sans lecteur quitte TOUTES les langues

    func test_catalog_keysNobodyReadsAnymore_areGoneFromEveryLanguage() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        XCTAssertNil(app["auth.login.create_account.hint"], "répétait « Créer un compte »")

        let unread = [
            "onboarding.friends.body", "onboarding.global.hint",
            "onboarding.story.sending.detail", "onboarding.email.waiting",
            "auth.magiclink.email.hintLabel", "auth.magiclink.email.title", "auth.magiclink.sent.codeAndLink",
            "auth.signup.subtitle", "emailVerification.nav.title", "emailVerification.noCode",
            "sessionClosed.signedOut.message", "sessionClosed.expired.message",
        ]
        let kept = unread.filter { app[$0] != nil }
        XCTAssertTrue(kept.isEmpty, "clés sans aucun lecteur, à retirer de toutes les langues : \(kept.joined(separator: ", "))")

        let sdk = try Self.catalog(Self.sdkCatalogPath)
        let orphans = sdk.keys.filter { $0.hasPrefix("auth.registration.") }.sorted()
        XCTAssertTrue(orphans.isEmpty, "24 clés sans aucun lecteur : \(orphans.joined(separator: ", "))")
    }

    /// Android lit le même catalogue (apps/android/i18n/manifest) : une clé
    /// qu'iOS n'affiche plus mais qu'Android affiche encore garde ses sept
    /// langues, sinon la génération des chaînes Android échoue.
    func test_catalog_keysAndroidStillReads_keepTheirSevenLanguages() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for key in ["onboarding.friends.badge", "auth.password.change.current.section", "auth.password.change.new.section"] {
            let values = try XCTUnwrap(app[key], key)
            XCTAssertEqual(Set(values.keys), Set(["fr"] + Self.otherLanguages), key)
        }
    }

    // MARK: - Connexion

    func test_login_createAccountButton_hasNoHintRepeatingItsName() throws {
        let view = try appCode("Meeshy/Features/Auth/Views/LoginView.swift")
        XCTAssertFalse(view.contains("auth.login.create_account.hint"))
        XCTAssertTrue(view.contains("auth.login.create_account"), "le bouton reste")
    }

    // MARK: - Lien par e-mail : la phrase propre à Meeshy se lit au repos (règle 7)

    func test_magicLink_inputStep_saysWhatHappensAtRest_withoutAnInfoButton() throws {
        let view = try appCode("Meeshy/Features/Auth/Views/MagicLinkView.swift")
        XCTAssertTrue(view.contains("auth.magiclink.email.subtitle"), "la phrase est rendue")
        XCTAssertFalse(view.contains("AuthInfoHint"), "plus de (i) : la phrase est visible, pas rangée")
        XCTAssertFalse(view.contains("auth.magiclink.email.hintLabel"))
        XCTAssertFalse(view.contains("auth.magiclink.email.title"), "le titre de bloc répétait la ligne du champ")
        XCTAssertTrue(view.contains("\"wand.and.stars\""), "le héros de l'écran reste la baguette")
    }

    func test_magicLink_sentStep_hasOneTitle_andTheAddressBelow() throws {
        let view = try appCode("Meeshy/Features/Auth/Views/MagicLinkView.swift")
        XCTAssertEqual(view.components(separatedBy: "auth.magiclink.sent.heading").count - 1, 1)
        XCTAssertFalse(view.contains("auth.magiclink.sent.codeAndLink"))
        XCTAssertFalse(view.contains("auth.magiclink.sent.title"), "« E-mail envoyé » + « Code et lien envoyés à » disaient deux fois la même chose")
        XCTAssertTrue(view.contains("Text(email)"), "l'adresse reste sous le titre")
        XCTAssertTrue(view.contains("EmailSpamFolderHint()"))
    }

    // MARK: - Inscription

    func test_signup_header_hasNoSubtitleRepeatingTheLanguageChip() throws {
        let view = try appCode("Meeshy/Features/Auth/Signup/SignupView.swift")
        XCTAssertFalse(view.contains("auth.signup.subtitle"))
        XCTAssertTrue(view.contains("auth.signup.language.chip"), "la puce du Prisme reste visible")
        XCTAssertTrue(view.contains("auth.signup.title"))
    }

    func test_signup_passwordQuestion_staysVisible_andItsAnswerStaysBehindIt() throws {
        let view = try appCode("Meeshy/Features/Auth/Signup/SignupView+Card.swift")
        XCTAssertTrue(view.contains("auth.signup.password.why"))
        XCTAssertTrue(view.contains("auth.signup.password.why.detail"))
    }

    // MARK: - Vérification de l'e-mail

    func test_emailVerification_hasNoBarTitleOverTheTitle_norQuestionOverTheResendButton() throws {
        let view = try appCode("Meeshy/Features/Auth/Views/EmailVerificationView.swift")
        XCTAssertFalse(view.contains("emailVerification.nav.title"))
        XCTAssertFalse(view.contains("emailVerification.noCode"))
        XCTAssertTrue(view.contains("emailVerification.title"))
        XCTAssertTrue(view.contains("emailVerification.resendButton"), "le bouton reste")
    }

    func test_emailVerification_everyLead_namesTheAddress_inOneLine() {
        let leads: [EmailVerificationLead] = [.accountCreated, .activationRequired, .codeSent]
        for lead in leads {
            let subtitle = lead.subtitle(email: "ada@meeshy.me")
            XCTAssertTrue(subtitle.contains("**ada@meeshy.me**"), "\(lead)")
            XCTAssertFalse(subtitle.contains("\n"), "\(lead)")
        }
    }

    // MARK: - Session fermée

    func test_sessionClosed_expired_saysItsTitleAndLetsTheButtonSayTheRest() {
        XCTAssertNil(SessionClosedNoticeCopy(reason: .sessionExpired).message)
    }

    func test_sessionClosed_everyOtherReason_keepsAShortMessage_thatDoesNotRepeatTheTitle() {
        for reason in SessionRevocationReason.allCases where ![.sessionExpired, .logout, .unknown].contains(reason) {
            let copy = SessionClosedNoticeCopy(reason: reason)
            let message = copy.message ?? ""
            XCTAssertFalse(message.isEmpty, "\(reason)")
            XCTAssertNotEqual(message, copy.title, "\(reason)")
        }
    }

    func test_sessionClosed_simpleLogout_saysItsTitleOnly_theButtonSaysTheRest() {
        XCTAssertNil(SessionClosedNoticeCopy(reason: .logout).message)
        XCTAssertNil(SessionClosedNoticeCopy(reason: .unknown).message)
    }

    func test_sessionClosed_view_rendersNoMessageWhenThereIsNone() throws {
        let view = try appCode("Meeshy/Features/Auth/SessionClosedNoticeView.swift")
        XCTAssertTrue(view.contains("if let message = copy.message"), "pas d'espace réservé pour un message absent")
    }

    // MARK: - Lien de connexion : l'alerte garde ses deux noms de compte, dans l'ordre du catalogue

    func test_signInLink_switchAccount_passesTheIncomingAccountFirst_thenTheOpenOne() throws {
        let opener = try appCode("Meeshy/Features/Auth/SignInLinkOpener.swift")
        XCTAssertTrue(opener.contains("incomingLabel, currentLabel"), "%1$@ = le compte du lien, %2$@ = le compte ouvert (Android lit les mêmes positions)")
    }

    // MARK: - Accueil

    func test_onboarding_cards_haveNoWaitingLine_noEditHint_noRepeatedReward() throws {
        let cards = try appCode("Meeshy/Features/Onboarding/OnboardingCards.swift")
        XCTAssertFalse(cards.contains("onboarding.email.waiting"), "la carte attend en silence : l'adresse et le lien suffisent")
        XCTAssertFalse(cards.contains("onboarding.global.hint"), "le champ modifiable se voit")
        XCTAssertTrue(cards.contains("onboarding.email.address"), "l'adresse reste")

        let illustrations = try appCode("Meeshy/Features/Onboarding/OnboardingIllustrations.swift")
        XCTAssertFalse(illustrations.contains("onboarding.friends.badge"), "le gain est dit une fois, sous la liste")
        XCTAssertTrue(illustrations.contains("onboarding.story.badge"), "le badge 24 h reste : il dit la durée")
    }

    func test_onboarding_friendsCard_saysTheGainOnce_andTheBodyNoLongerCarriesIt() throws {
        let card = try appCode("Meeshy/Features/Onboarding/OnboardingFriendsCard.swift")
        XCTAssertTrue(card.contains("onboarding.friends.lead"))
        XCTAssertFalse(card.contains("\"onboarding.friends.body\""))
        XCTAssertTrue(card.contains("onboarding.friends.pending"), "le gain reste dit une fois")
    }

    func test_onboarding_ageCard_hasNoSentenceAboveTheSkipButton() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        XCTAssertFalse(app["onboarding.age.body"]?["fr"]?.contains("Tu peux passer") ?? true)
        let card = try appCode("Meeshy/Features/Onboarding/OnboardingAgeCard.swift")
        XCTAssertTrue(card.contains("onboarding.age.skip"), "le bouton Passer reste")
    }

    func test_onboarding_recap_neverTellsTheUserToHurryNotToHurry() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for key in ["onboarding.recap.body", "onboarding.recap.empty", "onboarding.recap.tomorrow"] {
            let french = try XCTUnwrap(app[key]?["fr"], key)
            XCTAssertFalse(french.contains("rien ne presse"), key)
            XCTAssertFalse(french.contains("reviens quand tu veux"), key)
        }
    }

    // MARK: - Le mot de passe oublié et le nouveau mot de passe (SDK)

    func test_forgotPassword_prompt_asksForTheTwoFieldsAndNothingElse() throws {
        let view = try sdkCode("packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift")
        XCTAssertTrue(view.contains("auth.forgotPassword.verifyIdentityPrompt"))
        let sdk = try Self.catalog(Self.sdkCatalogPath)
        XCTAssertFalse(sdk["auth.forgotPassword.verifyIdentityPrompt"]?["fr"]?.contains("Pour vérifier votre identité") ?? true)
    }

    // MARK: - Épure 2/3 : un état tient en une ligne, un mot pour une idée

    func test_onboarding_profileCard_hasNoBenefitChips_theOrientationSentenceStays() throws {
        let card = try appCode("Meeshy/Features/Onboarding/OnboardingProfileCard.swift")
        XCTAssertFalse(card.contains("onboarding.profile.benefit"), "les pastilles redisent la phrase d'orientation")
        XCTAssertTrue(card.contains("onboarding.profile.body"), "la phrase d'orientation reste visible")
    }

    func test_onboarding_storyStates_areOneLine_theButtonCarriesTheAction() throws {
        let cards = try appCode("Meeshy/Features/Onboarding/OnboardingCards.swift")
        XCTAssertFalse(cards.contains("onboarding.story.sending.detail"))
        XCTAssertFalse(cards.contains("onboarding.story.failed.detail"))
        XCTAssertTrue(cards.contains("onboarding.story.retry"), "le bouton Réessayer porte l'action")
    }

    func test_catalog_failedDetailAndProfileChips_areGoneFromEveryLanguage() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for key in ["onboarding.story.failed.detail", "onboarding.profile.benefit.visibility", "onboarding.profile.benefit.contacts"] {
            XCTAssertNil(app[key], key)
        }
    }

    func test_catalog_entryScreens_sayEmailTheSameWay_inFrench() throws {
        let app = try Self.catalog(Self.appCatalogPath)
        for key in ["emailVerification.title", "emailVerification.success", "emailVerification.code.a11yHint",
                    "auth.magiclink.email.a11yLabel", "onboarding.story.verify"] {
            let french = try XCTUnwrap(app[key]?["fr"], key)
            XCTAssertFalse(french.contains("email"), "« e-mail » partout : \(key)")
            XCTAssertFalse(french.contains("courriel"), key)
        }
    }
}
