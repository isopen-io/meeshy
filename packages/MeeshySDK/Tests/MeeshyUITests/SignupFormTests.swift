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
        displayName: String? = "Awa N’Diaye",
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

    /// **Le champ VIDE est valide** (#6441), pour la même raison que le mot de
    /// passe : la passerelle DÉRIVE le nom affiché de la partie locale de
    /// l'adresse quand la clé est absente. Le refuser ici rendrait le client
    /// plus STRICT que le serveur — le défaut que le doc-comment de
    /// `displayNameMaxLength` dit vouloir empêcher.
    func test_isDisplayNameValid_emptyIsValid_tooLongIsNot() {
        XCTAssertTrue(SignupForm.isDisplayNameValid(""))
        XCTAssertTrue(SignupForm.isDisplayNameValid("   "))
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

    /// L'ADRESSE est le seul champ requis (#6441) — une saisie FOURNIE doit
    /// tenir sa borne, mais son absence n'empêche rien.
    func test_canSubmit_withAnyProvidedFieldInvalid_isFalse() {
        XCTAssertFalse(makeForm(email: "pas-une-adresse").canSubmit)
        XCTAssertFalse(makeForm(password: "court").canSubmit)
        XCTAssertFalse(makeForm(displayName: "123").canSubmit)
    }

    // MARK: - Le nom affiché est FACULTATIF (#6441, ce que #6424 avait laissé)
    //
    // Directive porteur 2026-09-14 : « on met un e-mail, tu crées un compte
    // avec le pseudo pris de la première partie de l'e-mail, le display name
    // pareil ». Le formulaire doit donc laisser partir une charge qui n'en
    // porte AUCUN — et `canSubmit` cessait seul de le permettre.

    /// LE témoin de ce lot. Il ne peut pas verdir pour un motif étranger : les
    /// deux autres champs facultatifs y sont VIDES eux aussi, donc seul le
    /// relâchement du nom affiché peut l'activer.
    func test_canSubmit_withEmailAlone_isTrue() {
        XCTAssertTrue(makeForm(displayName: "", phoneDigits: "", password: "").canSubmit)
    }

    /// Le BRANCHEMENT de la loi partagée (#6479) — `PhonePlausibilityTests`
    /// mesure la règle, ce bloc mesure qu'elle gouverne bien le bouton.
    func test_canSubmit_withAnImplausiblePhone_isFalse() {
        XCTAssertFalse(makeForm(phoneDigits: "1111100000").canSubmit)
        XCTAssertFalse(makeForm(phoneDigits: "42424242").canSubmit)
        XCTAssertEqual(makeForm(phoneDigits: "1111100000").phoneRefusal, .identicalRun)
    }

    func test_canSubmit_withARealPhone_isTrue() {
        XCTAssertTrue(makeForm(phoneDigits: "0612345678").canSubmit)
    }

    func test_canSubmit_withoutEmail_isFalse() {
        XCTAssertFalse(makeForm(displayName: "", email: "", password: "").canSubmit)
    }

    func test_hasDisplayName_distinguishesTypedFromValid() {
        XCTAssertFalse(makeForm(displayName: "").hasDisplayName)
        XCTAssertFalse(makeForm(displayName: "   ").hasDisplayName)
        // Refusé par le pattern, mais bel et bien TAPÉ : les deux questions
        // sont distinctes, et c'est `hasDisplayName` qui décide si la clé part.
        XCTAssertTrue(makeForm(displayName: "123").hasDisplayName)
    }

    /// LA LOI A CHANGÉ, et le témoin avec elle (#6479).
    ///
    /// #6441 omettait la clé pour que la PASSERELLE dérive. Directive porteur
    /// 2026-09-14 : « ici on a des données et la passerelle doit utiliser ces
    /// données ». L'écran MONTRE le nom affiché dérivé — une donnée, sous les
    /// yeux de l'utilisateur, qu'il a acceptée en continuant. Elle part.
    func test_registerRequest_withoutTypedDisplayName_sendsTheDerivedOne() throws {
        let payload = try encodedPayload(makeForm(displayName: "", email: "jean.dupont@example.com"))
        XCTAssertEqual(payload["displayName"] as? String, "Jean Dupont")
        XCTAssertEqual(payload["username"] as? String, "jean-dupont")
        XCTAssertNotNil(payload["email"], "l'adresse, elle, voyage toujours")
    }

    /// Ce qui SURVIT de #6441 : la clé reste ABSENTE quand il n'y a réellement
    /// rien. Une adresse dont rien n'est slugifiable retombe sur le recours
    /// `user` — l'envoyer garantirait une collision pour tout le monde, et là
    /// on n'a justement AUCUNE donnée.
    func test_registerRequest_withAnUnslugifiableAddress_omitsBothKeys() throws {
        let payload = try encodedPayload(makeForm(displayName: "", email: "a@b.co"))
        XCTAssertNil(payload["username"])
        XCTAssertNil(payload["displayName"])
    }

    func test_registerRequest_withTypedDisplayName_carriesItTrimmed() throws {
        let payload = try encodedPayload(makeForm(displayName: "  Awa N’Diaye  "))
        XCTAssertEqual(payload["displayName"] as? String, "Awa N’Diaye")
    }

    // MARK: - Le mot de passe est FACULTATIF (#6424)
    //
    // Directive porteur 2026-09-14 : « tant qu'on n'a pas le mot de passe
    // défini, le seul moyen de se connecter c'est par lien magique ». Le
    // formulaire doit donc laisser partir une charge qui n'en porte AUCUN.
    //
    // Le témoin qui compte le plus est celui de la charge : `nil`, jamais `""`.
    // Une chaîne vide serait une VALEUR, refusée par la borne de longueur du
    // serveur — le formulaire échouerait précisément dans le cas qu'il vient
    // d'ouvrir, et le refus parlerait d'un mot de passe trop court à quelqu'un
    // qui n'en a pas voulu.

    func test_canSubmit_withoutPassword_isTrue() {
        XCTAssertTrue(makeForm(password: "").canSubmit)
    }

    func test_isPasswordValid_emptyIsValid_shortIsNot() {
        XCTAssertTrue(SignupForm.isPasswordValid(""))
        XCTAssertFalse(SignupForm.isPasswordValid("court"))
        XCTAssertTrue(SignupForm.isPasswordValid("motdepasse"))
    }

    func test_hasPassword_distinguishesTypedFromValid() {
        XCTAssertFalse(makeForm(password: "").hasPassword)
        // Trop court pour être accepté, mais bel et bien TAPÉ : les deux
        // questions sont distinctes, et c'est `hasPassword` qui décide si la
        // clé part.
        XCTAssertTrue(makeForm(password: "court").hasPassword)
    }

    func test_registerRequest_withoutPassword_omitsTheKeyEntirely() throws {
        let payload = try encodedPayload(makeForm(password: ""))
        XCTAssertNil(payload["password"],
                     "la passerelle lit l'ABSENCE de la clé ; une chaîne vide serait une valeur refusée")
    }

    func test_registerRequest_withoutPassword_stillCarriesIdentityAndEmail() throws {
        let payload = try encodedPayload(makeForm(password: ""))
        XCTAssertEqual(payload["displayName"] as? String, "Awa N’Diaye")
        XCTAssertEqual(payload["email"] as? String, "awa@example.com")
    }

    // MARK: - La charge exacte

    /// `username` A CHANGÉ DE CAMP (#6479), les deux noms d'état civil NON.
    ///
    /// #5218 retirait les trois pour ne pas faire inventer un pseudo unique à
    /// l'utilisateur. Le pseudo n'est plus INVENTÉ : il est MONTRÉ, dérivé de
    /// l'adresse, et modifiable — donc il part. `firstName`/`lastName` restent
    /// dérivés côté serveur : rien ne les saisit.
    ///
    /// Assertion sur l'ABSENCE et non sur `nil` — c'est le JSON que la
    /// passerelle lit, et un `Optional` nil encodé par erreur en `null` serait
    /// une clé PRÉSENTE à valeur nulle, que `AuthSchemas.register` refuserait.
    func test_registerRequest_carriesUsername_butNeverFirstOrLastName() throws {
        let payload = try encodedPayload(makeForm(email: "awa.ndiaye@example.com"))
        XCTAssertEqual(payload["username"] as? String, "awa-ndiaye")
        XCTAssertNil(payload["firstName"])
        XCTAssertNil(payload["lastName"])
    }

    // MARK: - Identité en direct (#7897)

    func test_effectiveIdentity_followsTheAddress_untilTouched() {
        var form = makeForm(displayName: nil, email: "jean.dupont@example.com")
        XCTAssertEqual(form.effectiveDisplayName, "Jean Dupont")
        XCTAssertEqual(form.effectiveUsername, "jean-dupont")

        form.displayName = "Johnny"
        XCTAssertEqual(form.effectiveDisplayName, "Johnny")
        XCTAssertEqual(form.effectiveUsername, "jean-dupont", "le pseudo vient de l'ADRESSE")

        form.email = "jean.martin@example.com"
        XCTAssertEqual(form.effectiveDisplayName, "Johnny")
        XCTAssertEqual(form.effectiveUsername, "jean-martin")

        form.displayName = "  "
        XCTAssertEqual(form.effectiveDisplayName, "Jean Martin")
    }

    func test_isIdentityDefined_waitsForAPseudoAndAName() {
        var form = makeForm(displayName: nil, email: "a@b.co")
        XCTAssertFalse(form.isIdentityDefined)
        form.username = "awa"
        XCTAssertFalse(form.isIdentityDefined)
        form.displayName = "Awa"
        XCTAssertTrue(form.isIdentityDefined)
        XCTAssertTrue(makeForm(displayName: nil, email: "jean.dupont@example.com").isIdentityDefined)
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
