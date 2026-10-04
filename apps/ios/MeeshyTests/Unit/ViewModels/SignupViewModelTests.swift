import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **Où atterrit un refus, et ce que le formulaire envoie.**
///
/// `SignupViewModel` remplace `RegistrationViewModel` (#5218). Sa règle centrale
/// n'est pas « valider » — `SignupForm` le fait, et sa suite l'éprouve côté SDK —
/// mais **ranger chaque refus là où l'utilisateur le cherchera** : sous le champ
/// qu'il vise, jamais en bandeau quand il en vise un.
///
/// C'est la dimension que le wizard remplacé perdait le plus souvent : il
/// affichait « Données invalides » en bas d'un écran de huit étapes, sans dire
/// laquelle.
@MainActor
final class SignupViewModelTests: XCTestCase {

    // MARK: - Fabrique

    private func makeSUT(
        locale: Locale = Locale(identifier: "fr_FR"),
        referrals: MockPendingReferralStore = MockPendingReferralStore()
    ) -> (sut: SignupViewModel, registrar: MockSignupRegistrar) {
        let registrar = MockSignupRegistrar()
        let sut = SignupViewModel(registrar: registrar, locale: locale, referrals: referrals)
        return (sut, registrar)
    }

    private func fillValidForm(_ sut: SignupViewModel) {
        sut.form.displayName = "Awa N’Diaye"
        sut.form.email = "awa@example.com"
        sut.form.phoneDigits = "0612345678"
        sut.form.password = "motdepasse"
    }

    private func rejection(
        status: Int = 400,
        code: String? = nil,
        field: String? = nil,
        message: String = "refus",
        suggestions: [String] = [],
        violations: [APIRejection.Violation] = []
    ) -> MeeshyError {
        .rejected(APIRejection(
            statusCode: status, code: code, field: field,
            message: message, suggestions: suggestions, violations: violations
        ))
    }

    // MARK: - Activation

    func test_canSubmit_emptyForm_isFalse() {
        let (sut, _) = makeSUT()
        XCTAssertFalse(sut.canSubmit)
    }

    func test_canSubmit_requiredFieldsValid_isTrue() {
        let (sut, _) = makeSUT()
        fillValidForm(sut)
        XCTAssertTrue(sut.canSubmit)
    }

    /// #9343 — le numéro est REQUIS par l'écran (la passerelle, elle, accepte
    /// toujours une adresse seule) : sans lui, le bouton reste éteint.
    func test_canSubmit_withoutPhone_isFalse() {
        let (sut, _) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = ""
        XCTAssertFalse(sut.canSubmit)
    }

    // MARK: - Parrainage (#8075)

    func test_submit_rememberedReferral_travelsWithTheRegistration() async {
        let referrals = MockPendingReferralStore(code: "aff_42")
        let (sut, registrar) = makeSUT(referrals: referrals)
        fillValidForm(sut)

        await sut.submit()

        XCTAssertEqual(registrar.lastRegisterRequest?.affiliateToken, "aff_42")
        XCTAssertNil(registrar.lastRegisterRequest?.affiliateSessionKey, "iOS ne tient aucune clé de visite")
    }

    func test_submit_withPhone_referralStillTravels() async {
        let referrals = MockPendingReferralStore(code: "aff_42")
        let (sut, registrar) = makeSUT(referrals: referrals)
        fillValidForm(sut)
        sut.form.phoneDigits = "0612345678"

        await sut.submit()

        XCTAssertNotNil(registrar.lastRegisterRequest?.phoneNumber)
        XCTAssertEqual(registrar.lastRegisterRequest?.affiliateToken, "aff_42")
    }

    func test_submit_withoutReferral_sendsNoAffiliateToken() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)

        await sut.submit()

        XCTAssertNil(registrar.lastRegisterRequest?.affiliateToken)
    }

    func test_submit_accountCreatedWithSession_forgetsTheReferral() async {
        let referrals = MockPendingReferralStore(code: "aff_42")
        let (sut, registrar) = makeSUT(referrals: referrals)
        registrar.registerResult = .success(.authenticated)
        fillValidForm(sut)

        await sut.submit()

        XCTAssertNil(referrals.code)
        XCTAssertEqual(referrals.forgetCallCount, 1)
    }

    func test_submit_accountCreatedAwaitingVerification_forgetsTheReferral() async {
        let referrals = MockPendingReferralStore(code: "aff_42")
        let (sut, registrar) = makeSUT(referrals: referrals)
        registrar.registerResult = .success(.verificationRequired(PendingEmailVerification(email: "awa@example.com", accountCreated: true)))
        fillValidForm(sut)

        await sut.submit()

        XCTAssertNotNil(sut.pendingVerification)
        XCTAssertNil(referrals.code, "le compte existe déjà, rattaché : le code a servi")
    }

    func test_submit_rejected_keepsTheReferral() async {
        let referrals = MockPendingReferralStore(code: "aff_42")
        let (sut, registrar) = makeSUT(referrals: referrals)
        registrar.registerResult = .failure(rejection(status: 409, code: "EMAIL_TAKEN", field: "email"))
        fillValidForm(sut)

        await sut.submit()

        XCTAssertEqual(referrals.code, "aff_42", "aucun compte créé : le code attend le prochain essai")
        XCTAssertEqual(referrals.forgetCallCount, 0)
    }

    func test_submit_phoneConflict_keepsTheReferral() async {
        let referrals = MockPendingReferralStore(code: "aff_42")
        let (sut, registrar) = makeSUT(referrals: referrals)
        registrar.registerResult = .failure(PhoneOwnershipConflict())
        fillValidForm(sut)

        await sut.submit()

        XCTAssertEqual(referrals.code, "aff_42")
    }

    // MARK: - Envoi

    func test_submit_invalidForm_doesNotCallTheNetwork() async {
        let (sut, registrar) = makeSUT()
        let created = await sut.submit()
        XCTAssertFalse(created)
        XCTAssertEqual(registrar.registerCallCount, 0,
                       "un formulaire incomplet ne doit rien envoyer — la validation est locale")
    }

    func test_submit_validForm_sendsExactlyOnceAndReportsSuccess() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        let created = await sut.submit()
        XCTAssertTrue(created)
        XCTAssertEqual(registrar.registerCallCount, 1)
        XCTAssertFalse(sut.isSubmitting, "l'indicateur doit retomber, succès ou non")
    }

    /// **Aucun appel réseau ne PRÉCÈDE l'envoi.** Le wizard remplacé en tenait
    /// trois (pseudo, e-mail, téléphone), chacun avec une seconde de
    /// temporisation. Ici, taper ne déclenche rien.
    func test_typing_neverCallsTheNetworkBeforeSubmit() {
        let (sut, registrar) = makeSUT()
        sut.form.displayName = "A"
        sut.form.displayName = "Aw"
        sut.form.email = "a@b.co"
        sut.form.phoneDigits = "0612345678"
        XCTAssertEqual(registrar.registerCallCount, 0)
    }

    func test_submit_carriesTheFormPayload() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = "612345678"
        _ = await sut.submit()

        XCTAssertEqual(registrar.lastRegisterRequest?.displayName, "Awa N’Diaye")
        XCTAssertEqual(registrar.lastRegisterRequest?.email, "awa@example.com")
        XCTAssertEqual(registrar.lastRegisterRequest?.phoneNumber, "612345678")
        XCTAssertEqual(registrar.lastRegisterRequest?.phoneCountryCode, "FR")
        // LA LOI A CHANGÉ (#6479). #5218 retirait le pseudo pour ne pas le faire
        // INVENTER à l'utilisateur. Il n'est plus inventé : il est MONTRÉ,
        // dérivé de l'adresse, et modifiable — donc il part, et la passerelle
        // n'a plus rien à générer. Depuis #7897 il vient de l'ADRESSE.
        XCTAssertEqual(registrar.lastRegisterRequest?.username, "awa")
    }

    // MARK: - Table code → champ

    func test_emailTaken_landsUnderTheEmailFieldAndOffersSignIn() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 409, code: "EMAIL_TAKEN", field: "email",
                      message: "Cette adresse est déjà utilisée")
        )

        let created = await sut.submit()

        XCTAssertFalse(created)
        // #8216 — le champ dit qu'un COMPTE existe, jamais le texte serveur.
        XCTAssertEqual(sut.error(for: .email), SignupViewModel.emailTakenMessage)
        XCTAssertTrue(sut.emailAlreadyRegistered,
                      "l'écran doit pouvoir offrir le lien de connexion sous le champ")
        XCTAssertNil(sut.bannerError, "un refus qui vise un champ ne va PAS au bandeau")
    }

    func test_phoneInvalid_landsUnderThePhoneField() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(code: "PHONE_INVALID", field: "phoneNumber", message: "Numéro invalide")
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.error(for: .phoneNumber), "Numéro invalide")
        XCTAssertNil(sut.error(for: .email))
    }

    /// **`USERNAME_TAKEN` vise le NOM AFFICHÉ.** Le client n'envoie plus de
    /// pseudo : la passerelle le dérive du nom, donc la seule saisie que
    /// L'écran A un champ pseudo depuis #6479, et il ENVOIE sa valeur : le refus
    /// se pose donc SOUS lui. Avant, il se repliait sur le nom affiché faute de
    /// saisie — l'envoyer au bandeau aurait laissé « ce pseudo est déjà pris »
    /// flotter au-dessus d'un écran sans champ pseudo.
    func test_usernameTaken_landsUnderTheUsernameField() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 409, code: "USERNAME_TAKEN", field: "username",
                      message: "Ce nom est déjà pris", suggestions: ["awa2", "awa_nd"])
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.error(for: .username), "Ce nom est déjà pris")
        XCTAssertNil(sut.bannerError)
        // La contrepartie d'ENVOYER le pseudo : une collision est un REFUS, plus
        // un renommage silencieux. Les valeurs libres doivent remonter, sinon
        // ce refus est un mur.
        XCTAssertEqual(sut.usernameSuggestions, ["awa2", "awa_nd"])
    }

    /// Un `VALIDATION_ERROR` ne pose PAS de `field` à la racine : il énumère ses
    /// violations, et c'est `path` qui désigne la saisie. Sans cette lecture, un
    /// refus de validation s'afficherait en bandeau alors qu'il vise très
    /// précisément deux champs.
    func test_validationError_splitsItsViolationsAcrossTheirOwnFields() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(code: "VALIDATION_ERROR", message: "Données invalides", violations: [
                .init(path: "email", message: "Adresse invalide"),
                .init(path: "password", message: "Trop court"),
            ])
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.error(for: .email), "Adresse invalide")
        XCTAssertEqual(sut.error(for: .password), "Trop court")
        XCTAssertNil(sut.error(for: .displayName))
        XCTAssertNil(sut.bannerError)
    }

    /// Une violation sur un champ que l'écran ne montre pas (la langue régionale
    /// est déduite, jamais saisie) ne peut se poser nulle part : elle DOIT rester
    /// visible en bandeau, sinon le bouton redevient actif sans explication —
    /// mais le bandeau reste un message HUMAIN (#5325), jamais `rejection.message`
    /// tel quel : le serveur peut y mettre n'importe quel texte, y compris
    /// technique.
    func test_violationOnAnUnshownField_fallsBackToTheHumanBanner() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(code: "VALIDATION_ERROR", message: "Données invalides", violations: [
                .init(path: "regionalLanguage", message: "Langue inconnue"),
            ])
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.bannerError, "\(SignupViewModel.rejectionGenericMessage) (VALIDATION_ERROR)")
        XCTAssertNil(sut.error(for: .displayName))
        XCTAssertNil(sut.error(for: .email))
    }

    /// Un code que le client ne connaît pas ne doit pas disparaître : le refus
    /// reste lisible en bandeau — mais jamais avec la phrase brute du serveur,
    /// que le code SOIT connu du client ou non. Le code machine l'accompagne
    /// pour le support.
    func test_unknownCode_fallsBackToTheHumanBannerWithItsCode() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 400, code: "SOMETHING_NEW", message: "Refus inattendu")
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.bannerError, "\(SignupViewModel.rejectionGenericMessage) (SOMETHING_NEW)")
    }

    /// **Le cas qui a motivé #5325.** Une passerelle plus ancienne que l'app
    /// (contrat pré-#5218, qui exigeait encore `username`) refuse la requête
    /// AVANT d'atteindre `sendError` : c'est la validation Fastify par défaut
    /// qui répond, sans `code`, sans `field`, sans `violations` — juste un
    /// `message` technique en anglais qui nomme une clé que ce client
    /// n'envoie plus. Rien ne doit distinguer ce cas d'un code inconnu : la
    /// clé de validation, quelle qu'elle soit, ne doit JAMAIS atteindre
    /// l'écran telle quelle, et le statut HTTP sert de repère au support à
    /// défaut de code machine.
    func test_unmappedValidationKeyWithNoCode_neverLeaksTheRawGatewayText() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 400, message: "body must have required property 'username'")
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.bannerError, "\(SignupViewModel.rejectionGenericMessage) (400)")
        XCTAssertFalse(
            sut.bannerError?.contains("username") ?? true,
            "le texte technique du serveur ne doit jamais atteindre l'écran"
        )
        XCTAssertTrue(SignupField.allCases.allSatisfy { sut.error(for: $0) == nil })
    }

    // MARK: - Le conflit de numéro (un 200 qui ne crée rien)

    func test_phoneOwnershipConflict_landsUnderThePhoneWithItsRemedy() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = "612345678"
        registrar.registerResult = .failure(PhoneOwnershipConflict())

        let created = await sut.submit()

        XCTAssertFalse(created)
        XCTAssertEqual(sut.error(for: .phoneNumber), SignupViewModel.phoneOwnershipConflictMessage)
        // **Le REMÈDE, pas le MOT** (2026-09-06). Ce témoin cherchait « vide »
        // dans le message. Or `String(localized:bundle:)` suit la locale du
        // BUNDLE : en CI, le simulateur démarre en anglais et rend « Leave it
        // empty to continue » — pas de « vide ». Le témoin passait sur une
        // machine française et tombait en intégration, alors que le catalogue
        // est complet et juste sur les sept langues.
        //
        // > Un test qui affirme un MOT teste la locale de la machine qui
        // > l'exécute. Ce qui distingue ce refus des autres n'est pas son
        // > vocabulaire : c'est qu'il porte une SORTIE là où les autres
        // > constatent un échec. Cela se mesure sans lire un seul mot.
        XCTAssertFalse(
            SignupViewModel.phoneOwnershipConflictMessage.isEmpty,
            "le seul refus dont l'écran connaît le remède doit le DIRE"
        )
        XCTAssertNotEqual(
            SignupViewModel.phoneOwnershipConflictMessage,
            SignupViewModel.genericFailureMessage,
            "… et le dire AUTREMENT que l'échec générique : sans texte propre, le remède n'existe pas"
        )
        XCTAssertNotEqual(
            SignupViewModel.phoneOwnershipConflictMessage,
            SignupViewModel.networkUnavailableMessage,
            "… et autrement que la panne réseau, qui ne propose aucune sortie à l'auteur"
        )
        XCTAssertNil(sut.bannerError)
    }

    // MARK: - Réseau

    func test_networkUnavailable_goesToTheBannerNotToAField() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(MeeshyError.network(.noConnection))

        _ = await sut.submit()

        XCTAssertEqual(sut.bannerError, SignupViewModel.networkUnavailableMessage)
        XCTAssertTrue(SignupField.allCases.allSatisfy { sut.error(for: $0) == nil },
                      "une panne réseau n'accuse aucune saisie")
    }

    // MARK: - Un refus ne survit pas à la correction qu'il a provoquée

    func test_secondSubmit_clearsThePreviousRejection() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 409, code: "EMAIL_TAKEN", field: "email", message: "déjà utilisée")
        )
        _ = await sut.submit()
        XCTAssertNotNil(sut.error(for: .email))
        XCTAssertTrue(sut.emailAlreadyRegistered)

        registrar.registerResult = .success(.authenticated)
        sut.form.email = "autre@example.com"
        let created = await sut.submit()

        XCTAssertTrue(created)
        XCTAssertNil(sut.error(for: .email))
        XCTAssertFalse(sut.emailAlreadyRegistered)
        XCTAssertNil(sut.bannerError)
    }

    // MARK: - Défauts de la locale

    func test_init_prefillsFromTheInjectedLocale() {
        let (sut, _) = makeSUT(locale: Locale(identifier: "es_MX"))
        XCTAssertEqual(sut.form.country.id, "MX")
        XCTAssertEqual(sut.form.systemLanguage, "es")
        XCTAssertEqual(sut.form.regionalLanguage, "en",
                       "la région redit le rang 1 : le rang 2 élargit au lieu de répéter")
    }

    // MARK: - La table, éprouvée sur elle-même

    /// LA TABLE A CHANGÉ (#6479) : `username` a sa propre saisie et ne se replie
    /// plus. Les deux noms d'état civil, eux, restent dérivés du nom affiché —
    /// c'est la seule saisie qui permet de les changer.
    func test_serverFieldNames_civilNames_landOnDisplayName() {
        for name in ["displayName", "firstName", "lastName"] {
            XCTAssertEqual(SignupViewModel.field(forServerName: name), .displayName, name)
        }
    }

    func test_serverFieldName_username_landsOnItsOwnField() {
        XCTAssertEqual(SignupViewModel.field(forServerName: "username"), .username)
    }

    func test_serverFieldNames_phonePair_landsOnThePhoneField() {
        XCTAssertEqual(SignupViewModel.field(forServerName: "phoneNumber"), .phoneNumber)
        XCTAssertEqual(SignupViewModel.field(forServerName: "phoneCountryCode"), .phoneNumber)
    }

    /// Les deux rangs du Prisme ne sont mappés sur AUCUN champ : la langue
    /// régionale ne se montre pas, et un refus dessus est un défaut serveur —
    /// pas une faute de saisie.
    func test_serverFieldNames_prismRanks_areNotFieldErrors() {
        XCTAssertNil(SignupViewModel.field(forServerName: "systemLanguage"))
        XCTAssertNil(SignupViewModel.field(forServerName: "regionalLanguage"))
    }

    /// Le repli par CODE suit la même règle que le repli par NOM DE CHAMP
    /// (#6479) : `USERNAME_TAKEN` vise le pseudo, qui a sa propre saisie
    /// depuis que l'écran l'envoie — jamais le nom affiché.
    func test_fieldForCode_usernameTaken_targetsTheUsernameInput() {
        XCTAssertEqual(SignupViewModel.field(forCode: "USERNAME_TAKEN"), .username)
    }

    // MARK: - Le numéro, requis par l'écran (#9343)

    /// Plus d'alerte « Continuer quand même » : sans numéro, rien ne part et le
    /// refus se dit sous le champ.
    func test_requestSubmit_withoutPhone_sendsNothingAndSaysWhyUnderThePhone() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = ""

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .rejected)
        XCTAssertEqual(registrar.registerCallCount, 0)
        XCTAssertEqual(sut.error(for: .phoneNumber), SignupViewModel.phoneRefusalMessage(.missing))
    }

    func test_submit_withoutPhone_sendsNothing() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = "   "

        let created = await sut.submit()

        XCTAssertFalse(created)
        XCTAssertEqual(registrar.registerCallCount, 0)
    }

    func test_requestSubmit_withPhone_sendsTheNumberAndItsCountry() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = "612345678"

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .created)
        XCTAssertEqual(registrar.registerCallCount, 1)
        XCTAssertEqual(registrar.lastRegisterRequest?.phoneNumber, "612345678")
        XCTAssertEqual(registrar.lastRegisterRequest?.phoneCountryCode, "FR")
    }

    func test_requestSubmit_invalidForm_sendsNothing() async {
        let (sut, registrar) = makeSUT()

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .rejected)
        XCTAssertEqual(registrar.registerCallCount, 0)
    }

    func test_requestSubmit_withPhone_serverRefusal_isRejected() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = "612345678"
        registrar.registerResult = .failure(rejection(status: 409, code: "EMAIL_TAKEN", field: "email"))

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .rejected)
    }

    /// Pendant la première frappe, rien ne s'affiche ; le champ QUITTÉ avec
    /// une saisie implausible dit pourquoi.
    func test_phoneRefusal_saysNothingWhileTyping_thenSpeaksOnceTheFieldIsLeft() {
        let (sut, _) = makeSUT()
        sut.form.phoneDigits = "061234"
        XCTAssertNil(sut.error(for: .phoneNumber))

        sut.notePhoneFieldLeft()

        XCTAssertEqual(sut.error(for: .phoneNumber), SignupViewModel.phoneRefusalMessage(.implausible(.tooShort)))
    }

    /// Un champ quitté VIDE ne gronde pas : on peut aller choisir son pays.
    func test_phoneFieldLeftEmpty_saysNothing() {
        let (sut, _) = makeSUT()
        sut.notePhoneFieldLeft()
        XCTAssertNil(sut.error(for: .phoneNumber))
    }

    func test_phoneRefusalMessages_areDistinctAndNeverEmpty() {
        let missing = SignupViewModel.phoneRefusalMessage(.missing)
        let tooShort = SignupViewModel.phoneRefusalMessage(.implausible(.tooShort))
        let implausible = SignupViewModel.phoneRefusalMessage(.implausible(.identicalRun))
        XCTAssertFalse(missing.isEmpty)
        XCTAssertTrue(tooShort.contains("\(PhonePlausibility.minDigits)"), "la borne vient de PhonePlausibility, jamais d'un littéral")
        XCTAssertEqual(Set([missing, tooShort, implausible]).count, 3)
        XCTAssertEqual(SignupViewModel.phoneRefusalMessage(.implausible(.repeatedPattern)), implausible)
    }

    /// Avec un numéro, la session est ouverte : rien à vérifier avant d'entrer.
    func test_requestSubmit_withPhone_authenticated_exposesNoPendingVerification() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.phoneDigits = "612345678"
        registrar.registerResult = .success(.authenticated)

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .created)
        XCTAssertNil(sut.pendingVerification)
    }

    /// Un nouvel envoi efface l'adresse en attente d'un envoi précédent.
    func test_submit_clearsAPreviousPendingVerification() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .success(.verificationRequired(PendingEmailVerification(email: "awa@example.com", accountCreated: true)))
        await sut.submit()
        registrar.registerResult = .failure(rejection(status: 409, code: "EMAIL_TAKEN", field: "email"))

        await sut.submit()

        XCTAssertNil(sut.pendingVerification)
    }

    // MARK: - La borne du pseudo (#8082)

    /// Recette 2026-09-26 : `direction_recette` (17 caractères) passait l'écran,
    /// la passerelle le refusait, et l'app disait « réessayez ». La borne se
    /// dit désormais PENDANT la saisie, sous le pseudo, et rien ne part.
    func test_tooLongUsername_showsTheBoundUnderTheFieldWhileTyping() {
        let (sut, _) = makeSUT()
        fillValidForm(sut)

        sut.form.username = "direction_recette"

        XCTAssertEqual(sut.error(for: .username), SignupViewModel.usernameRefusalMessage(.tooLong))
        XCTAssertTrue(sut.error(for: .username)?.contains("16") ?? false)
        XCTAssertFalse(sut.canSubmit)
    }

    func test_tooLongUsername_submitSendsNothing() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        sut.form.username = "direction_recette"

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .rejected)
        XCTAssertEqual(registrar.registerCallCount, 0)
    }

    func test_validUsername_hasNoFieldMessage() {
        let (sut, _) = makeSUT()
        fillValidForm(sut)

        sut.form.username = "direction_recett"

        XCTAssertNil(sut.error(for: .username))
        XCTAssertTrue(sut.canSubmit)
    }

    /// La passerelle sert `violations: [{ path: "username", message: "must NOT
    /// have more than 16 characters" }]` : le refus se pose SOUS le pseudo,
    /// dans la langue du lecteur — jamais le texte d'Ajv, jamais « réessayez ».
    func test_schemaRefusalOnUsername_landsUnderTheFieldInTheReadersLanguage() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(code: "VALIDATION_ERROR", message: "body/username must NOT have more than 16 characters", violations: [
                .init(path: "username", message: "must NOT have more than 16 characters"),
            ])
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.error(for: .username), SignupViewModel.usernameRuleMessage)
        XCTAssertNil(sut.bannerError)
    }

    // MARK: - Adresse déjà utilisée : le lien de connexion en un geste (#8216)

    private func makeTakenSUT() async -> (sut: SignupViewModel, requester: MockSignInLinkRequester) {
        let registrar = MockSignupRegistrar()
        let requester = MockSignInLinkRequester()
        let sut = SignupViewModel(
            registrar: registrar,
            locale: Locale(identifier: "fr_FR"),
            referrals: MockPendingReferralStore(),
            linkRequester: requester
        )
        fillValidForm(sut)
        sut.form.email = "  Awa@Example.com "
        registrar.registerResult = .failure(
            rejection(status: 409, code: "EMAIL_TAKEN", field: "email", message: "Email already used")
        )
        _ = await sut.submit()
        return (sut, requester)
    }

    func test_emailTaken_fieldSaysAnAccountAlreadyExists() async {
        let (sut, _) = await makeTakenSUT()

        XCTAssertTrue(sut.showsEmailTakenActions)
        XCTAssertEqual(sut.error(for: .email), SignupViewModel.emailTakenMessage)
    }

    func test_requestSignInLink_afterEmailTaken_sendsTheLinkToTheTypedAddress() async {
        let (sut, requester) = await makeTakenSUT()

        let sent = await sut.requestSignInLink()

        XCTAssertTrue(sent)
        XCTAssertEqual(requester.requestCallCount, 1)
        XCTAssertEqual(requester.lastRequestedEmail, "awa@example.com")
        XCTAssertEqual(sut.signInLink?.email, "awa@example.com")
        XCTAssertEqual(sut.signInLink?.dispatch.pendingSessionToken, "attente-8216")
    }

    func test_requestSignInLink_emailEditedSinceTheRefusal_sendsNothing() async {
        let (sut, requester) = await makeTakenSUT()
        sut.form.email = "autre@example.com"

        let sent = await sut.requestSignInLink()

        XCTAssertFalse(sent)
        XCTAssertFalse(sut.showsEmailTakenActions)
        XCTAssertNil(sut.error(for: .email), "le refus ne vaut que pour l'adresse refusée")
        XCTAssertEqual(requester.requestCallCount, 0)
        XCTAssertNil(sut.signInLink)
    }

    func test_requestSignInLink_withoutEmailTaken_sendsNothing() async {
        let requester = MockSignInLinkRequester()
        let sut = SignupViewModel(
            registrar: MockSignupRegistrar(),
            locale: Locale(identifier: "fr_FR"),
            referrals: MockPendingReferralStore(),
            linkRequester: requester
        )
        fillValidForm(sut)

        let sent = await sut.requestSignInLink()

        XCTAssertFalse(sent)
        XCTAssertEqual(requester.requestCallCount, 0)
    }

    func test_requestSignInLink_offline_saysSoUnderTheActionsAndPresentsNothing() async {
        let (sut, requester) = await makeTakenSUT()
        requester.requestResult = .failure(URLError(.notConnectedToInternet))

        let sent = await sut.requestSignInLink()

        XCTAssertFalse(sent)
        XCTAssertNil(sut.signInLink)
        XCTAssertEqual(sut.signInLinkError, EmailProofErrorText.sendMessage(for: URLError(.notConnectedToInternet)))
        XCTAssertFalse(sut.isRequestingSignInLink)
    }

    func test_loginEmail_validAddress_travelsTrimmed() {
        let (sut, _) = makeSUT()
        sut.form.email = " awa@example.com "
        XCTAssertEqual(sut.loginEmail, "awa@example.com")
    }

    func test_loginEmail_incompleteAddress_doesNotTravel() {
        let (sut, _) = makeSUT()
        sut.form.email = "awa@"
        XCTAssertNil(sut.loginEmail)
    }

    // MARK: - « Est-ce vous ? » (#8214 × #8216)

    private func makeOwnedSUT() async -> (sut: SignupViewModel, registrar: MockSignupRegistrar) {
        let registrar = MockSignupRegistrar()
        let sut = SignupViewModel(
            registrar: registrar,
            locale: Locale(identifier: "fr_FR"),
            referrals: MockPendingReferralStore(),
            linkRequester: MockSignInLinkRequester()
        )
        fillValidForm(sut)
        registrar.registerResult = .failure(MeeshyError.rejected(APIRejection(
            statusCode: 409, code: "EMAIL_TAKEN", field: "email", message: "x",
            emailOwner: .init(maskedDisplayName: "A** N*****", maskedUsername: "a**a", avatar: nil)
        )))
        _ = await sut.submit()
        return (sut, registrar)
    }

    func test_emailTaken_withOwner_exposesTheMaskedOwner() async {
        let (sut, _) = await makeOwnedSUT()
        XCTAssertEqual(sut.emailOwner?.maskedDisplayName, "A** N*****")
        XCTAssertEqual(sut.emailOwner?.maskedUsername, "a**a")
        XCTAssertTrue(sut.showsEmailTakenActions)
    }

    func test_emailTaken_withoutOwner_fallsBackToRecoveryOnly() async {
        let (sut, _) = await makeTakenSUT()
        XCTAssertNil(sut.emailOwner)
        XCTAssertTrue(sut.showsEmailTakenActions)
    }

    func test_claimEmail_resendsTheSameRegistrationWithClaimEmail_andAwaitsTheCode() async {
        let (sut, registrar) = await makeOwnedSUT()
        let first = registrar.lastRegisterRequest
        let pending = PendingEmailVerification(email: "awa@example.com", accountCreated: true, pendingSessionToken: nil)
        registrar.registerResult = .success(.verificationRequired(pending))

        let claimed = await sut.claimEmail()

        XCTAssertTrue(claimed)
        XCTAssertEqual(registrar.registerCallCount, 2)
        XCTAssertEqual(registrar.lastRegisterRequest?.claimEmail, true)
        XCTAssertEqual(registrar.lastRegisterRequest?.email, first?.email)
        XCTAssertEqual(registrar.lastRegisterRequest?.username, first?.username)
        XCTAssertEqual(sut.pendingVerification, pending)
    }

    /// #9343 — « Ce n'est pas moi » ne consulte pas le bouton principal : il
    /// hérite pourtant de la règle. Numéro effacé ⇒ rien ne part, et le refus
    /// se dit sous le champ.
    func test_claimEmail_withoutPhone_sendsNothingAndSaysWhy() async {
        let (sut, registrar) = await makeOwnedSUT()
        sut.form.phoneDigits = ""

        let claimed = await sut.claimEmail()

        XCTAssertFalse(claimed)
        XCTAssertEqual(registrar.registerCallCount, 1)
        XCTAssertEqual(sut.error(for: .phoneNumber), SignupViewModel.phoneRefusalMessage(.missing))
    }

    func test_claimEmail_withoutEmailTaken_sendsNothing() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        let claimed = await sut.claimEmail()
        XCTAssertFalse(claimed)
        XCTAssertEqual(registrar.registerCallCount, 0)
    }

    func test_loginEmailHandoff_isTakenOnce() {
        let handoff = LoginEmailHandoff()
        handoff.hold("awa@example.com")
        XCTAssertEqual(handoff.take(), "awa@example.com")
        XCTAssertNil(handoff.take())
    }
}
