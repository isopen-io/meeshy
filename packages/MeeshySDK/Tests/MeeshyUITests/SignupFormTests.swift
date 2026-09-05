import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **La charge que l'inscription ENVOIE, et rien d'autre.**
///
/// `SignupForm` remplace `RegistrationViewModel` (#5218) : la validation locale
/// reste le miroir exact de `AuthSchemas.register`
/// (`packages/shared/utils/validation.ts`), mais trois champs ont disparu de la
/// charge — `username`, `firstName`, `lastName` — parce que la passerelle les
/// DÉRIVE de `displayName`. Une suite qui ne vérifierait que « le formulaire
/// valide bien » raterait la moitié du lot : l'autre moitié est ce qui part.
///
/// `Bundle.module` étant `@MainActor` sous l'isolation par défaut de MeeshyUI,
/// et `CountryPicker.countries` avec lui, la classe est `@MainActor`.
@MainActor
final class SignupFormTests: XCTestCase {

    // MARK: - Fabriques

    private func makeForm(
        displayName: String = "Awa N’Diaye",
        email: String = "awa@example.com",
        phoneDigits: String = "",
        password: String = "motdepasse",
        countryISO: String = "FR",
        systemLanguage: String = "fr",
        regionalLanguage: String = "en"
    ) -> SignupForm {
        SignupForm(
            displayName: displayName,
            email: email,
            phoneDigits: phoneDigits,
            password: password,
            country: CountryPicker.countries.first { $0.id == countryISO } ?? CountryPicker.countries[0],
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage
        )
    }

    /// Décode la charge en dictionnaire — la seule façon d'observer une ABSENCE.
    /// Un `XCTAssertNil(request.phoneNumber)` ne dirait rien de ce que le
    /// serveur reçoit ; ce que le serveur reçoit est un JSON sans la clé.
    private func encodedPayload(_ form: SignupForm) throws -> [String: Any] {
        let data = try JSONEncoder().encode(form.registerRequest())
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Nom affiché (miroir de personNamePatternSource)

    func test_isDisplayNameValid_plainName_isValid() {
        XCTAssertTrue(SignupForm.isDisplayNameValid("Alice"))
    }

    func test_isDisplayNameValid_typographicApostrophe_isValid() {
        // Le clavier iOS insère U+2019 par défaut (smart punctuation).
        XCTAssertTrue(SignupForm.isDisplayNameValid("N\u{2019}Diaye"))
    }

    func test_isDisplayNameValid_straightAndModifierApostrophes_areValid() {
        XCTAssertTrue(SignupForm.isDisplayNameValid("N'Diaye"))
        XCTAssertTrue(SignupForm.isDisplayNameValid("Ma\u{02BC}lik"))
    }

    func test_isDisplayNameValid_accentsAndCompoundNames_areValid() {
        XCTAssertTrue(SignupForm.isDisplayNameValid("Jean-Claude"))
        XCTAssertTrue(SignupForm.isDisplayNameValid("de la Fontaine"))
        XCTAssertTrue(SignupForm.isDisplayNameValid("Émilie"))
        XCTAssertTrue(SignupForm.isDisplayNameValid("St. John"))
    }

    func test_isDisplayNameValid_decomposedDiacritics_areValid() {
        // NFD : e + U+0301 (combining acute) — couvert par \p{M} côté serveur.
        XCTAssertTrue(SignupForm.isDisplayNameValid("Jose\u{0301}"))
    }

    func test_isDisplayNameValid_digitsOrSymbols_areInvalid() {
        XCTAssertFalse(SignupForm.isDisplayNameValid("123"))
        XCTAssertFalse(SignupForm.isDisplayNameValid("Alice3"))
        XCTAssertFalse(SignupForm.isDisplayNameValid("Alice!"))
        XCTAssertFalse(SignupForm.isDisplayNameValid("Alice@meeshy"))
    }

    func test_isDisplayNameValid_emptyOrTooLong_isInvalid() {
        XCTAssertFalse(SignupForm.isDisplayNameValid(""))
        XCTAssertFalse(SignupForm.isDisplayNameValid("   "))
        XCTAssertFalse(
            SignupForm.isDisplayNameValid(String(repeating: "a", count: SignupForm.displayNameMaxLength + 1))
        )
    }

    /// **Le miroir ne doit pas être plus STRICT que le serveur.** `displayName`
    /// y vaut 100 caractères ; les 50 de `firstName`/`lastName` ne le
    /// gouvernent plus depuis que la passerelle les dérive. Un client plus
    /// strict refuse localement une saisie que le serveur aurait acceptée — et
    /// aucun témoin, d'aucun côté, ne rougit.
    func test_displayNameMaxLength_matchesTheServerSchema() {
        XCTAssertEqual(SignupForm.displayNameMaxLength, 100)
        XCTAssertTrue(SignupForm.isDisplayNameValid(String(repeating: "a", count: 100)))
    }

    // MARK: - E-mail (rapprochement du z.email serveur)

    func test_isEmailValid_wellFormedAddress_isValid() {
        XCTAssertTrue(SignupForm.isEmailValid("alice@example.com"))
    }

    func test_isEmailValid_shapesTheServerRefuses_areInvalid() {
        // « a@b » et « alice@com. » passaient l'ancien check (« contient @ et . »).
        XCTAssertFalse(SignupForm.isEmailValid("a@b"))
        XCTAssertFalse(SignupForm.isEmailValid("alice@com."))
        XCTAssertFalse(SignupForm.isEmailValid("alice @example.com"))
        XCTAssertFalse(SignupForm.isEmailValid(""))
    }

    // MARK: - Mot de passe

    func test_isPasswordValid_atTheMinimum_isValid() {
        XCTAssertEqual(SignupForm.passwordMinLength, 6)
        XCTAssertTrue(SignupForm.isPasswordValid("abcdef"))
    }

    func test_isPasswordValid_belowTheMinimum_isInvalid() {
        XCTAssertFalse(SignupForm.isPasswordValid("abcde"))
    }

    // MARK: - Activation du bouton

    func test_canSubmit_withTheThreeRequiredFields_isTrue() {
        XCTAssertTrue(makeForm().canSubmit)
    }

    /// **Le téléphone n'entre PAS dans l'activation.** C'est la règle produit du
    /// lot : il n'est ni requis, ni annoncé facultatif — un formulaire qui
    /// resterait gris tant qu'il est vide le rendrait obligatoire en pratique.
    func test_canSubmit_withoutPhone_isTrue() {
        XCTAssertTrue(makeForm(phoneDigits: "").canSubmit)
    }

    func test_canSubmit_withAnyRequiredFieldInvalid_isFalse() {
        XCTAssertFalse(makeForm(displayName: "").canSubmit)
        XCTAssertFalse(makeForm(email: "pas-une-adresse").canSubmit)
        XCTAssertFalse(makeForm(password: "court").canSubmit)
    }

    // MARK: - La charge exacte

    /// Le cœur du lot : trois clés que le client N'ENVOIE PLUS.
    ///
    /// Assertion sur l'ABSENCE et non sur `nil` — c'est le JSON que la
    /// passerelle lit, et un `Optional` nil encodé par erreur en `null` serait
    /// une clé PRÉSENTE à valeur nulle, que `AuthSchemas.register` refuserait.
    func test_registerRequest_neverCarriesUsernameFirstNameOrLastName() throws {
        let payload = try encodedPayload(makeForm())
        XCTAssertNil(payload["username"])
        XCTAssertNil(payload["firstName"])
        XCTAssertNil(payload["lastName"])
    }

    func test_registerRequest_carriesTheIdentityAsDisplayName() throws {
        let payload = try encodedPayload(makeForm(displayName: "  Awa N’Diaye  "))
        XCTAssertEqual(payload["displayName"] as? String, "Awa N’Diaye")
    }

    func test_registerRequest_lowercasesAndTrimsTheEmail() throws {
        let payload = try encodedPayload(makeForm(email: "  Awa@Example.COM "))
        XCTAssertEqual(payload["email"] as? String, "awa@example.com")
    }

    func test_registerRequest_carriesThePasswordVerbatim() throws {
        let payload = try encodedPayload(makeForm(password: "  mot de passe  "))
        XCTAssertEqual(payload["password"] as? String, "  mot de passe  ",
                       "un mot de passe se transmet tel quel : le rogner changerait le secret")
    }

    /// Un téléphone vide n'est pas « nul », il est ABSENT — et son pays avec.
    /// Un `phoneCountryCode` seul décrirait un pays qui ne qualifie rien.
    func test_registerRequest_emptyPhone_omitsBothPhoneKeys() throws {
        let payload = try encodedPayload(makeForm(phoneDigits: ""))
        XCTAssertNil(payload["phoneNumber"])
        XCTAssertNil(payload["phoneCountryCode"])
    }

    /// Les chiffres partent tels que tapés, avec l'ISO du pays : c'est la
    /// passerelle qui les normalise (libphonenumber), comme pour le web v3.
    /// Composer `+33` + les chiffres ici fabriquerait un E.164 faux dès qu'un
    /// préfixe national est tapé, et retirer ce zéro soi-même se tromperait dès
    /// l'Italie.
    func test_registerRequest_filledPhone_carriesTheTypedDigitsAndISO2() throws {
        let payload = try encodedPayload(makeForm(phoneDigits: "612345678", countryISO: "FR"))
        XCTAssertEqual(payload["phoneNumber"] as? String, "612345678")
        XCTAssertEqual(payload["phoneCountryCode"] as? String, "FR")
    }

    /// Un numéro collé depuis un carnet d'adresses arrive avec des espaces et
    /// des points ; seuls les chiffres partent — préfixe national compris, la
    /// passerelle sait quoi en faire.
    func test_registerRequest_strippsEverythingButDigitsFromThePhone() throws {
        let payload = try encodedPayload(makeForm(phoneDigits: "06 12.34-56 78", countryISO: "FR"))
        XCTAssertEqual(payload["phoneNumber"] as? String, "0612345678")
    }

    /// Un champ téléphone qui ne contient AUCUN chiffre (des espaces collés)
    /// reste un champ vide : rien ne part.
    func test_registerRequest_phoneWithoutAnyDigit_omitsBothPhoneKeys() throws {
        let payload = try encodedPayload(makeForm(phoneDigits: "   "))
        XCTAssertNil(payload["phoneNumber"])
        XCTAssertNil(payload["phoneCountryCode"])
    }

    func test_registerRequest_carriesBothPrismRanks() throws {
        let payload = try encodedPayload(makeForm(systemLanguage: "fr", regionalLanguage: "en"))
        XCTAssertEqual(payload["systemLanguage"] as? String, "fr")
        XCTAssertEqual(payload["regionalLanguage"] as? String, "en")
    }

    // MARK: - Défauts déduits de la locale

    func test_defaultSystemLanguage_supportedDeviceLanguage_isTheDeviceLanguage() {
        XCTAssertEqual(SignupForm.defaultSystemLanguage(for: Locale(identifier: "es_ES")), "es")
        XCTAssertEqual(SignupForm.defaultSystemLanguage(for: Locale(identifier: "en_US")), "en")
    }

    /// Une langue que Meeshy ne sert pas retombe sur `fr`, jamais sur un code
    /// inconnu que le serveur refuserait.
    func test_defaultSystemLanguage_unsupportedDeviceLanguage_fallsBackToFrench() {
        XCTAssertEqual(SignupForm.defaultSystemLanguage(for: Locale(identifier: "cy_GB")), "fr")
    }

    func test_defaultRegionalLanguage_regionDiffersFromRank1_takesTheRegionLanguage() {
        // Un anglophone au Canada : rang 1 anglais, rang 2 français (la région).
        XCTAssertEqual(
            SignupForm.defaultRegionalLanguage(for: Locale(identifier: "en_CA"), systemLanguage: "en"),
            "fr"
        )
    }

    /// Quand la région redit le rang 1, le rang 2 doit apporter autre chose :
    /// l'anglais, la langue de repli la plus servie — ou le français si le rang 1
    /// est déjà l'anglais.
    func test_defaultRegionalLanguage_regionMatchesRank1_widensInstead() {
        XCTAssertEqual(
            SignupForm.defaultRegionalLanguage(for: Locale(identifier: "fr_FR"), systemLanguage: "fr"),
            "en"
        )
        XCTAssertEqual(
            SignupForm.defaultRegionalLanguage(for: Locale(identifier: "en_US"), systemLanguage: "en"),
            "fr"
        )
    }

    func test_defaultCountry_knownRegion_isPreselected() {
        XCTAssertEqual(SignupForm.defaultCountry(for: Locale(identifier: "fr_CM")).id, "CM")
        XCTAssertEqual(SignupForm.defaultCountry(for: Locale(identifier: "pt_BR")).id, "BR")
    }

    /// Sans région exploitable, le premier de la liste — la France, tête de
    /// `CountryPicker.countries` par ordre de priorité.
    ///
    /// `ZZ` est le code CLDR « région inconnue » : il ne peut pas figurer dans la
    /// table d'indicatifs, ce qui rend le repli déterministe. Une locale sans
    /// région du tout (`"eo"`) le serait moins — Foundation est libre d'en
    /// inférer une.
    func test_defaultCountry_unknownRegion_fallsBackToTheFirstOfTheList() {
        XCTAssertEqual(
            SignupForm.defaultCountry(for: Locale(identifier: "fr_ZZ")).id,
            CountryPicker.countries[0].id
        )
    }

    /// Une forme neuve est DÉJÀ configurée : pays, langue lue, langue régionale.
    /// C'est ce qui permet à l'écran de n'avoir aucun réglage obligatoire.
    func test_init_fromLocale_prefillsCountryAndBothLanguageRanks() {
        let form = SignupForm(locale: Locale(identifier: "pt_BR"))
        XCTAssertEqual(form.country.id, "BR")
        XCTAssertEqual(form.systemLanguage, "pt")
        XCTAssertEqual(form.regionalLanguage, "en")
        XCTAssertFalse(form.canSubmit, "une forme vierge n'est pas envoyable")
    }

    // MARK: - Libellé de la pastille

    func test_systemLanguageNativeName_isTheNativeSpelling() {
        XCTAssertEqual(makeForm(systemLanguage: "fr").systemLanguageNativeName, "Français")
        XCTAssertEqual(makeForm(systemLanguage: "en").systemLanguageNativeName, "English")
    }

    /// Un code inconnu ne doit jamais rendre une pastille vide : elle affiche le
    /// code, ce qui est laid mais lisible — un libellé vide ne l'est pas.
    func test_systemLanguageNativeName_unknownCode_fallsBackToTheCode() {
        XCTAssertEqual(makeForm(systemLanguage: "zz").systemLanguageNativeName, "ZZ")
    }
}
