package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le cœur de l'inscription en un écran : ce qu'il refuse, ce qu'il montre, et
 * ce qu'il ENVOIE.
 *
 * Les témoins de charge (`toRegisterRequest`) sont les plus importants : ils
 * fixent la seule chose que la passerelle voit, dont les trois champs que
 * l'ancien wizard envoyait et que celui-ci n'envoie PLUS.
 */
class SignupFormTest {

    private val supportedLanguages = setOf("fr", "en", "es", "de", "pt")

    private fun valid(
        displayName: String = "Ada Lovelace",
        email: String = "ada@meeshy.me",
        password: String = "secret1",
    ) = SignupForm(displayName = displayName, email = email, password = password)

    // ---- verdict local -------------------------------------------------------

    @Test
    fun nominal_nameEmailAndPassword_areEnoughToSubmit() {
        assertThat(valid().canSubmit).isTrue()
        assertThat(valid().validate().isValid).isTrue()
    }

    @Test
    fun mononym_singleWordName_isAccepted() {
        assertThat(valid(displayName = "Ada").canSubmit).isTrue()
    }

    @Test
    fun nameWithAccentsAndApostrophe_isAccepted() {
        assertThat(valid(displayName = "Jean-Éric d'Aubigné").canSubmit).isTrue()
    }

    @Test
    fun blankName_isRefused() {
        assertThat(valid(displayName = "   ").validate().displayName)
            .isEqualTo(SignupFieldIssue.DISPLAY_NAME_REQUIRED)
    }

    @Test
    fun nameWithoutASingleLetter_isRefused() {
        assertThat(valid(displayName = "1234 !").validate().displayName)
            .isEqualTo(SignupFieldIssue.DISPLAY_NAME_REQUIRED)
    }

    @Test
    fun nameCarryingOneLetterAmongDigits_isAccepted() {
        // Le miroir client ne porte QUE la règle « au moins une lettre » : le jeu
        // de caractères borne firstName/lastName, jamais displayName.
        assertThat(valid(displayName = "R2 D2").canSubmit).isTrue()
    }

    @Test
    fun nameLongerThanTheSharedBound_isRefused() {
        val tooLong = "a".repeat(SignupForm.DISPLAY_NAME_MAX_LENGTH + 1)
        assertThat(valid(displayName = tooLong).validate().displayName)
            .isEqualTo(SignupFieldIssue.DISPLAY_NAME_TOO_LONG)
    }

    @Test
    fun nameLengthIsMeasuredAfterTrim() {
        val padded = " " + "a".repeat(SignupForm.DISPLAY_NAME_MAX_LENGTH) + " "
        assertThat(valid(displayName = padded).validate().displayName).isNull()
    }

    @Test
    fun invalidEmail_isRefused() {
        assertThat(valid(email = "ada-at-meeshy").validate().email)
            .isEqualTo(SignupFieldIssue.EMAIL_INVALID)
        assertThat(valid(email = "ada-at-meeshy").canSubmit).isFalse()
    }

    @Test
    fun passwordShorterThanSix_isRefused() {
        assertThat(valid(password = "12345").validate().password)
            .isEqualTo(SignupFieldIssue.PASSWORD_TOO_SHORT)
        assertThat(valid(password = "12345").canSubmit).isFalse()
    }

    @Test
    fun passwordOfExactlySix_isAccepted() {
        assertThat(valid(password = "123456").validate().password).isNull()
    }

    @Test
    fun phoneNeverBlocksSubmission() {
        assertThat(valid().copy(phoneDigits = "").canSubmit).isTrue()
        assertThat(valid().copy(phoneDigits = "12").canSubmit).isTrue()
        assertThat(valid().validate().issueFor(SignupField.PHONE)).isNull()
    }

    // ---- saisie du téléphone -------------------------------------------------

    @Test
    fun phoneEntry_nationalNumber_keepsOnlyDigitsAndLeavesTheCountryAlone() {
        val form = SignupForm(dialCountryIso = "BE").withPhoneEntry("04 70 12-34.56")

        assertThat(form.dialCountryIso).isEqualTo("BE")
        assertThat(form.phoneDigits).isEqualTo("0470123456")
    }

    @Test
    fun phoneEntry_internationalNumber_movesItsDialCodeOntoTheCountry() {
        val form = SignupForm(dialCountryIso = "US").withPhoneEntry("+33 (0)6 12-34-56-78")

        assertThat(form.dialCountryIso).isEqualTo("FR")
        assertThat(form.phoneDigits).isEqualTo("0612345678")
    }

    @Test
    fun phoneEntry_doubleZeroForm_isTreatedAsInternational() {
        val form = SignupForm(dialCountryIso = "FR").withPhoneEntry("0049 30 123456")

        assertThat(form.dialCountryIso).isEqualTo("DE")
        assertThat(form.phoneDigits).isEqualTo("30123456")
    }

    @Test
    fun phoneEntry_internationalNumberSurvivesTheRoundTripToThePayload() {
        val request = valid().withPhoneEntry("+12025550143").toRegisterRequest()

        assertThat(request.phoneNumber).isEqualTo("2025550143")
        assertThat(request.phoneCountryCode).isEqualTo("US")
    }

    @Test
    fun phoneEntry_unknownInternationalPrefix_fallsBackToPlainDigits() {
        val form = SignupForm(dialCountryIso = "FR").withPhoneEntry("+999123456")

        assertThat(form.dialCountryIso).isEqualTo("FR")
        assertThat(form.phoneDigits).isEqualTo("999123456")
    }

    @Test
    fun phoneEntry_emptyValue_clearsTheNumber() {
        val form = SignupForm(dialCountryIso = "FR", phoneDigits = "0612345678").withPhoneEntry("")

        assertThat(form.phoneDigits).isEmpty()
        assertThat(form.dialCountryIso).isEqualTo("FR")
    }

    // ---- ce qu'on AFFICHE ----------------------------------------------------

    @Test
    fun visibleValidation_hidesTheIssuesOfStillEmptyFields() {
        val untouched = SignupForm()
        assertThat(untouched.validate().isValid).isFalse()
        val visible = untouched.visibleValidation()
        assertThat(visible.displayName).isNull()
        assertThat(visible.email).isNull()
        assertThat(visible.password).isNull()
    }

    @Test
    fun visibleValidation_showsTheIssueOfAFilledButWrongField() {
        val typed = SignupForm(displayName = "Ada", email = "nope", password = "12")
        val visible = typed.visibleValidation()
        assertThat(visible.displayName).isNull()
        assertThat(visible.email).isEqualTo(SignupFieldIssue.EMAIL_INVALID)
        assertThat(visible.password).isEqualTo(SignupFieldIssue.PASSWORD_TOO_SHORT)
    }

    @Test
    fun visibleValidation_showsABlankButNonEmptyNameAsRefused() {
        // "   " n'est pas vide au sens de la saisie : l'utilisateur a tapé quelque chose.
        assertThat(SignupForm(displayName = "   ").visibleValidation().displayName)
            .isEqualTo(SignupFieldIssue.DISPLAY_NAME_REQUIRED)
    }

    // ---- la charge envoyée ---------------------------------------------------

    @Test
    fun payload_carriesTheDisplayNameAndNeverTheWizardsThreeFields() {
        val request = valid(displayName = "  Ada Lovelace  ").toRegisterRequest()

        assertThat(request.displayName).isEqualTo("Ada Lovelace")
        assertThat(request.username).isNull()
        assertThat(request.firstName).isNull()
        assertThat(request.lastName).isNull()
    }

    @Test
    fun payload_normalizesTheEmailAndKeepsThePasswordVerbatim() {
        val request = valid(email = "  Ada@Meeshy.ME ", password = " Secret1 ").toRegisterRequest()

        assertThat(request.email).isEqualTo("ada@meeshy.me")
        assertThat(request.password).isEqualTo(" Secret1 ")
    }

    @Test
    fun payload_emptyPhone_omitsBothPhoneFields() {
        val request = valid().copy(phoneDigits = "   ").toRegisterRequest()

        assertThat(request.phoneNumber).isNull()
        assertThat(request.phoneCountryCode).isNull()
    }

    /**
     * Les chiffres partent tels que tapés, préfixe national compris, avec l'ISO
     * du pays : c'est la passerelle qui les normalise (libphonenumber), comme
     * pour le web v3. Composer `+33` + `0612345678` ici fabriquerait un E.164
     * faux, et retirer le zéro soi-même se tromperait dès l'Italie.
     */
    @Test
    fun payload_filledPhone_travelsAsTheTypedDigitsWithItsIso() {
        val request = valid().copy(dialCountryIso = "FR", phoneDigits = "06 12 34 56 78").toRegisterRequest()

        assertThat(request.phoneNumber).isEqualTo("0612345678")
        assertThat(request.phoneCountryCode).isEqualTo("FR")
    }

    @Test
    fun payload_phoneOfAnotherCountry_carriesThatCountrysIso() {
        val request = valid().copy(dialCountryIso = "US", phoneDigits = "2025550143").toRegisterRequest()

        assertThat(request.phoneNumber).isEqualTo("2025550143")
        assertThat(request.phoneCountryCode).isEqualTo("US")
    }

    @Test
    fun payload_carriesBothReadingLanguages() {
        val request = valid().copy(systemLanguage = "es", regionalLanguage = "en").toRegisterRequest()

        assertThat(request.systemLanguage).isEqualTo("es")
        assertThat(request.regionalLanguage).isEqualTo("en")
    }

    @Test
    fun payload_regionalEqualToSystem_isOmitted() {
        val request = valid().copy(systemLanguage = "fr", regionalLanguage = "fr").toRegisterRequest()

        assertThat(request.systemLanguage).isEqualTo("fr")
        assertThat(request.regionalLanguage).isNull()
    }

    @Test
    fun payload_blankSystemLanguage_fallsBackRatherThanTravellingEmpty() {
        val request = valid().copy(systemLanguage = "  ", regionalLanguage = "  ").toRegisterRequest()

        assertThat(request.systemLanguage).isEqualTo(SignupRegionInference.DEFAULT_LANGUAGE)
        assertThat(request.regionalLanguage).isNull()
    }

    // ---- pré-remplissage depuis la locale ------------------------------------

    @Test
    fun defaults_unresolvableLocale_fallsBackToFrenchAndThePriorityCountry() {
        val form = SignupForm.defaults(
            deviceLanguage = null,
            deviceRegion = null,
            supportedLanguageCodes = supportedLanguages,
            knownCountryCodes = CountryCatalog.dialCodes.keys,
        )

        assertThat(form.systemLanguage).isEqualTo("fr")
        assertThat(form.regionalLanguage).isEqualTo("en")
        assertThat(form.dialCountryIso).isEqualTo(CountryCatalog.priority.first())
    }

    @Test
    fun defaults_supportedDeviceLanguage_becomesTheReadingLanguage() {
        val form = SignupForm.defaults(
            deviceLanguage = "ES",
            deviceRegion = "MX",
            supportedLanguageCodes = supportedLanguages,
            knownCountryCodes = CountryCatalog.dialCodes.keys,
        )

        assertThat(form.systemLanguage).isEqualTo("es")
        assertThat(form.dialCountryIso).isEqualTo("MX")
    }

    @Test
    fun defaults_unknownDeviceRegion_keepsThePriorityCountry() {
        val form = SignupForm.defaults(
            deviceLanguage = "fr",
            deviceRegion = "ZZ",
            supportedLanguageCodes = supportedLanguages,
            knownCountryCodes = CountryCatalog.dialCodes.keys,
        )

        assertThat(form.dialCountryIso).isEqualTo(CountryCatalog.priority.first())
    }

    @Test
    fun defaults_leaveEveryTypedFieldEmpty() {
        val form = SignupForm.defaults(
            deviceLanguage = "fr",
            deviceRegion = "FR",
            supportedLanguageCodes = supportedLanguages,
            knownCountryCodes = CountryCatalog.dialCodes.keys,
        )

        assertThat(form.displayName).isEmpty()
        assertThat(form.email).isEmpty()
        assertThat(form.phoneDigits).isEmpty()
        assertThat(form.password).isEmpty()
        assertThat(form.canSubmit).isFalse()
    }

    @Test
    fun dialCode_resolvesFromTheSelectedCountry() {
        assertThat(SignupForm(dialCountryIso = "DE").dialCode).isEqualTo("+49")
        assertThat(SignupForm(dialCountryIso = "ZZ").dialCode).isEmpty()
    }

    @Test
    fun hasPhone_ignoresFormattingThatCarriesNoDigit() {
        assertThat(SignupForm(phoneDigits = " () - ").hasPhone).isFalse()
        assertThat(SignupForm(phoneDigits = "0").hasPhone).isTrue()
    }
}
