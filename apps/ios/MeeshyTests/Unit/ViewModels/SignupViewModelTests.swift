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
        locale: Locale = Locale(identifier: "fr_FR")
    ) -> (sut: SignupViewModel, registrar: MockSignupRegistrar) {
        let registrar = MockSignupRegistrar()
        let sut = SignupViewModel(registrar: registrar, locale: locale)
        return (sut, registrar)
    }

    private func fillValidForm(_ sut: SignupViewModel) {
        sut.form.displayName = "Awa N’Diaye"
        sut.form.email = "awa@example.com"
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

    func test_canSubmit_threeRequiredFieldsValid_isTrue() {
        let (sut, _) = makeSUT()
        fillValidForm(sut)
        XCTAssertTrue(sut.canSubmit)
    }

    /// Le téléphone n'est pas requis, et il n'est pas non plus annoncé
    /// facultatif : le bouton ne l'attend simplement pas.
    func test_canSubmit_withoutPhone_isTrue() {
        let (sut, _) = makeSUT()
        fillValidForm(sut)
        XCTAssertTrue(sut.form.phoneDigits.isEmpty)
        XCTAssertTrue(sut.canSubmit)
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
        XCTAssertNil(registrar.lastRegisterRequest?.username,
                     "la passerelle dérive le pseudo — le client ne l'envoie plus (#5218)")
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
        XCTAssertEqual(sut.error(for: .email), "Cette adresse est déjà utilisée")
        XCTAssertTrue(sut.emailAlreadyRegistered,
                      "l'écran doit pouvoir offrir « Se connecter » sous le champ")
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
    /// l'utilisateur peut corriger est celle-là. L'envoyer au bandeau laisserait
    /// « ce pseudo est déjà pris » flotter au-dessus d'un écran sans champ pseudo.
    func test_usernameTaken_landsUnderTheDisplayNameField() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 409, code: "USERNAME_TAKEN", field: "username",
                      message: "Ce nom est déjà pris", suggestions: ["awa2", "awa_nd"])
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.error(for: .displayName), "Ce nom est déjà pris")
        XCTAssertNil(sut.bannerError)
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
    /// visible en bandeau, sinon le bouton redevient actif sans explication.
    func test_violationOnAnUnshownField_fallsBackToTheBanner() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(code: "VALIDATION_ERROR", message: "Données invalides", violations: [
                .init(path: "regionalLanguage", message: "Langue inconnue"),
            ])
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.bannerError, "Données invalides")
        XCTAssertNil(sut.error(for: .displayName))
        XCTAssertNil(sut.error(for: .email))
    }

    /// Un code que le client ne connaît pas ne doit pas disparaître : le refus
    /// reste lisible, faute de mieux, en bandeau.
    func test_unknownCode_fallsBackToTheBanner() async {
        let (sut, registrar) = makeSUT()
        fillValidForm(sut)
        registrar.registerResult = .failure(
            rejection(status: 400, code: "SOMETHING_NEW", message: "Refus inattendu")
        )

        _ = await sut.submit()

        XCTAssertEqual(sut.bannerError, "Refus inattendu")
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
        XCTAssertTrue(
            SignupViewModel.phoneOwnershipConflictMessage.contains("vide"),
            "le seul refus dont l'écran connaît le remède doit le DIRE : laisser le champ vide"
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

        registrar.registerResult = .success(())
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

    func test_serverFieldNames_derivedFromDisplayName_allLandOnDisplayName() {
        for name in ["displayName", "username", "firstName", "lastName"] {
            XCTAssertEqual(SignupViewModel.field(forServerName: name), .displayName, name)
        }
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
}
