package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure registration recap-summary core
 * ([SummaryField] + [RegistrationSummaryRow] + [RegistrationSummary]) backing the
 * wizard's final RECAP step.
 *
 * Parity source: iOS `RegistrationViewModel.summaryItems`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`), the
 * computed `[(icon, label, value)]` the recap card renders:
 *   - always: `("at", Utilisateur, username)`, `("envelope.fill", Email, email)`,
 *     `("person.fill", Nom, "firstName lastName")`;
 *   - phone `("phone.fill", Telephone, "dialCode phoneNumber")` **only when the phone
 *     number is non-empty**;
 *   - always: `("globe", Langues, "systemLanguage / regionalLanguage")`;
 *   - bio `("text.quote", Bio, bio)` **only when the bio is non-empty**.
 *
 * SOTA note over iOS: the pure core surfaces the *rows that appear and the resolved
 * value string* keyed by a semantic [SummaryField] — the icon glyph and the localized
 * label are UI/i18n concerns the recap composable maps from the field kind, not baked
 * into this framework-free SSOT. Values are trimmed (iOS renders raw `@Published`
 * strings, occasionally with edge whitespace); the phone row additionally honours
 * `skipPhone` (a skipped phone must not resurface a stale number), and the language
 * value collapses to the system label alone when no distinct regional language was
 * chosen — both real branches iOS's always-two-values formatting lacks.
 *
 * Expectations are hand-written literals, independent of how production derives them.
 */
class RegistrationSummaryTest {

    private fun input(
        username: String = "alice",
        email: String = "alice@meeshy.me",
        firstName: String = "Alice",
        lastName: String = "Wonder",
        phoneDialCode: String = "+237",
        phoneNumber: String = "699112233",
        skipPhone: Boolean = false,
        systemLanguage: String = "fr",
        regionalLanguage: String = "en",
        bio: String = "",
    ) = RegistrationSummaryInput(
        username = username,
        email = email,
        firstName = firstName,
        lastName = lastName,
        phoneDialCode = phoneDialCode,
        phoneNumber = phoneNumber,
        skipPhone = skipPhone,
        systemLanguage = systemLanguage,
        regionalLanguage = regionalLanguage,
        bio = bio,
    )

    private fun List<RegistrationSummaryRow>.value(field: SummaryField): String? =
        firstOrNull { it.field == field }?.value

    // --- ordering & presence ---

    @Test
    fun rows_fullInput_appearInIosOrder() {
        val rows = RegistrationSummary.rows(input(bio = "Globe-trotter"))
        assertThat(rows.map { it.field }).containsExactly(
            SummaryField.USERNAME,
            SummaryField.EMAIL,
            SummaryField.NAME,
            SummaryField.PHONE,
            SummaryField.LANGUAGES,
            SummaryField.BIO,
        ).inOrder()
    }

    @Test
    fun rows_minimalInput_omitsOptionalPhoneAndBio() {
        val rows = RegistrationSummary.rows(input(phoneNumber = "", bio = "   "))
        assertThat(rows.map { it.field }).containsExactly(
            SummaryField.USERNAME,
            SummaryField.EMAIL,
            SummaryField.NAME,
            SummaryField.LANGUAGES,
        ).inOrder()
    }

    // --- username & email values ---

    @Test
    fun username_value_isTrimmed() {
        assertThat(RegistrationSummary.rows(input(username = "  bob  ")).value(SummaryField.USERNAME))
            .isEqualTo("bob")
    }

    @Test
    fun email_value_isTrimmedAndLowercased() {
        assertThat(RegistrationSummary.rows(input(email = "  ALICE@Meeshy.ME ")).value(SummaryField.EMAIL))
            .isEqualTo("alice@meeshy.me")
    }

    // --- name formatting ---

    @Test
    fun name_bothPresent_isSpaceJoined() {
        assertThat(RegistrationSummary.rows(input(firstName = "Alice", lastName = "Wonder")).value(SummaryField.NAME))
            .isEqualTo("Alice Wonder")
    }

    @Test
    fun name_firstOnly_isJustFirst() {
        assertThat(RegistrationSummary.rows(input(firstName = "Alice", lastName = "  ")).value(SummaryField.NAME))
            .isEqualTo("Alice")
    }

    @Test
    fun name_lastOnly_isJustLast() {
        assertThat(RegistrationSummary.rows(input(firstName = "", lastName = "Wonder")).value(SummaryField.NAME))
            .isEqualTo("Wonder")
    }

    @Test
    fun name_bothBlank_isEmptyButRowStillPresent() {
        val rows = RegistrationSummary.rows(input(firstName = " ", lastName = ""))
        assertThat(rows.map { it.field }).contains(SummaryField.NAME)
        assertThat(rows.value(SummaryField.NAME)).isEqualTo("")
    }

    @Test
    fun name_innerWhitespace_isTrimmedPerPart() {
        assertThat(RegistrationSummary.rows(input(firstName = "  Alice ", lastName = " Wonder  ")).value(SummaryField.NAME))
            .isEqualTo("Alice Wonder")
    }

    // --- phone row ---

    @Test
    fun phone_present_joinsDialCodeAndNumber() {
        assertThat(RegistrationSummary.rows(input(phoneDialCode = "+237", phoneNumber = "699112233")).value(SummaryField.PHONE))
            .isEqualTo("+237 699112233")
    }

    @Test
    fun phone_blankNumber_isOmitted() {
        assertThat(RegistrationSummary.rows(input(phoneNumber = "   ")).value(SummaryField.PHONE)).isNull()
    }

    @Test
    fun phone_skipped_isOmittedEvenWhenNumberLingers() {
        // A user who skipped the phone step must not have a stale number resurface.
        assertThat(RegistrationSummary.rows(input(phoneNumber = "699112233", skipPhone = true)).value(SummaryField.PHONE))
            .isNull()
    }

    @Test
    fun phone_blankDialCode_showsNumberAlone() {
        assertThat(RegistrationSummary.rows(input(phoneDialCode = "", phoneNumber = "699112233")).value(SummaryField.PHONE))
            .isEqualTo("699112233")
    }

    // --- languages row ---

    @Test
    fun languages_distinctPair_joinsBothLabels() {
        // fr -> "🇫🇷 Français", en -> "🇬🇧 English" via the LanguageData SSOT.
        assertThat(RegistrationSummary.rows(input(systemLanguage = "fr", regionalLanguage = "en")).value(SummaryField.LANGUAGES))
            .isEqualTo("${LanguageStepSelection.summaryLabel("fr")} / ${LanguageStepSelection.summaryLabel("en")}")
    }

    @Test
    fun languages_regionalEqualsSystem_collapsesToSystemAlone() {
        assertThat(RegistrationSummary.rows(input(systemLanguage = "fr", regionalLanguage = "fr")).value(SummaryField.LANGUAGES))
            .isEqualTo(LanguageStepSelection.summaryLabel("fr"))
    }

    @Test
    fun languages_blankRegional_collapsesToSystemAlone() {
        assertThat(RegistrationSummary.rows(input(systemLanguage = "es", regionalLanguage = " ")).value(SummaryField.LANGUAGES))
            .isEqualTo(LanguageStepSelection.summaryLabel("es"))
    }

    // --- bio row ---

    @Test
    fun bio_nonBlank_isTrimmed() {
        assertThat(RegistrationSummary.rows(input(bio = "  Hi there  ")).value(SummaryField.BIO))
            .isEqualTo("Hi there")
    }

    @Test
    fun bio_whitespaceOnly_isOmitted() {
        assertThat(RegistrationSummary.rows(input(bio = "   \n ")).value(SummaryField.BIO)).isNull()
    }
}
