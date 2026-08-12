package me.meeshy.sdk.model.auth

/**
 * The semantic identity of a registration recap row, decoupled from the icon glyph
 * and localized label the recap composable maps from it.
 *
 * Mirrors the fixed set of rows iOS `RegistrationViewModel.summaryItems` emits, in
 * emission order.
 */
enum class SummaryField { USERNAME, EMAIL, NAME, PHONE, LANGUAGES, BIO }

/**
 * One rendered row of the registration recap card: which [field] it is and its
 * resolved display [value].
 */
data class RegistrationSummaryRow(val field: SummaryField, val value: String)

/**
 * The immutable field snapshot the recap summary reads — exactly the values iOS
 * `RegistrationViewModel.summaryItems` interpolates.
 */
data class RegistrationSummaryInput(
    val username: String = "",
    val email: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val phoneDialCode: String = "",
    val phoneNumber: String = "",
    val skipPhone: Boolean = false,
    val systemLanguage: String = "",
    val regionalLanguage: String = "",
    val bio: String = "",
)

/**
 * The pure recap-summary builder for the registration wizard's final RECAP step.
 *
 * Faithful port of iOS `RegistrationViewModel.summaryItems`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`): the
 * computed `[(icon, label, value)]` array the recap card renders, with the username /
 * email / name rows always present, the phone row appended only for a non-empty
 * number, the languages row always present, and the bio row appended only when non-empty.
 *
 * SOTA note: iOS returns UI tuples `(icon, label, value)` straight from a stateful
 * ViewModel, baking the SF Symbol name and the (untranslated) French label into the
 * data. Android lifts the decision — *which rows appear and each resolved value* —
 * into this framework-free SSOT keyed by a semantic [SummaryField], leaving the icon
 * and localized label to the recap composable. It also hardens three edges iOS's raw
 * interpolation lacks: values are trimmed, a skipped phone never resurfaces a stale
 * number, and the language value collapses to the system label alone when no distinct
 * regional language was chosen (rather than iOS's always `"system / regional"`).
 * [LanguageStepSelection.summaryLabel] is reused for the language labels, so the flag +
 * native-name rendering never drifts from the [me.meeshy.sdk.model.LanguageData] catalogue.
 */
object RegistrationSummary {

    /** The ordered recap rows for [input] — optional phone/bio omitted when empty. */
    fun rows(input: RegistrationSummaryInput): List<RegistrationSummaryRow> = buildList {
        add(RegistrationSummaryRow(SummaryField.USERNAME, SignupFieldValidation.normalizedUsername(input.username)))
        add(RegistrationSummaryRow(SummaryField.EMAIL, SignupFieldValidation.normalizedEmail(input.email)))
        add(RegistrationSummaryRow(SummaryField.NAME, fullName(input.firstName, input.lastName)))
        phoneValue(input)?.let { add(RegistrationSummaryRow(SummaryField.PHONE, it)) }
        add(RegistrationSummaryRow(SummaryField.LANGUAGES, languages(input.systemLanguage, input.regionalLanguage)))
        val bio = input.bio.trim()
        if (bio.isNotEmpty()) add(RegistrationSummaryRow(SummaryField.BIO, bio))
    }

    private fun fullName(firstName: String, lastName: String): String =
        listOf(firstName.trim(), lastName.trim()).filter { it.isNotEmpty() }.joinToString(" ")

    private fun phoneValue(input: RegistrationSummaryInput): String? {
        if (input.skipPhone) return null
        val number = input.phoneNumber.trim()
        if (number.isEmpty()) return null
        val dialCode = input.phoneDialCode.trim()
        return if (dialCode.isEmpty()) number else "$dialCode $number"
    }

    private fun languages(systemLanguage: String, regionalLanguage: String): String {
        val system = LanguageStepSelection.summaryLabel(systemLanguage)
        val regional = regionalLanguage.trim()
        return if (regional.isEmpty() || regional == systemLanguage.trim()) {
            system
        } else {
            "$system / ${LanguageStepSelection.summaryLabel(regional)}"
        }
    }
}
