package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.PasswordEntry

/**
 * An immutable snapshot of the registration wizard's field state, as read by the
 * per-step proceed gate.
 *
 * These are exactly the `@Published` inputs iOS `RegistrationViewModel.canProceed`
 * consults. Availability flags are tri-state (`null` = not yet probed) so an
 * un-answered server check is distinct from a confirmed-taken one, matching iOS's
 * `Bool?` availability properties.
 */
data class RegistrationFields(
    val username: String = "",
    val usernameAvailable: Boolean? = null,
    /**
     * The PHONE step's selected dial-code country (iOS `selectedCountry`), defaulting to
     * [CountryCatalog.priority]'s head (`"FR"`, mirrors `CountryPicker.countries[0]`). Display-only
     * for the gate (the digit-count check in [SignupFieldValidation.isPhoneValidLocally] never reads
     * it) — it feeds the E.164 probe/register payload and the recap's dial-code prefix instead.
     */
    val countryIso: String = CountryCatalog.priority.first(),
    val phoneNumber: String = "",
    val phoneAvailable: Boolean? = null,
    val skipPhone: Boolean = false,
    val email: String = "",
    val emailAvailable: Boolean? = null,
    val firstName: String = "",
    val lastName: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val systemLanguage: String = "",
    val regionalLanguage: String = "",
    /** The PROFILE step's optional bio text — feeds the RECAP summary's [me.meeshy.sdk.model.auth.SummaryField.BIO] row. */
    val bio: String = "",
    val acceptTerms: Boolean = false,
)

/**
 * The unified per-step "may the wizard advance?" gate for the 8-step gamified
 * registration flow.
 *
 * Faithful port of iOS `RegistrationViewModel.canProceed`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`), the
 * computed `switch currentStep` var gating the bottom bar's Next/Register button.
 *
 * SOTA note: iOS spreads this eight-arm decision inside a stateful ViewModel
 * computed var that reads `@Published` fields directly, re-inlining the username /
 * email / phone / password rules that also live elsewhere. Android lifts the whole
 * decision into one framework-free SSOT over an immutable [RegistrationFields]
 * snapshot and **reuses the already-shipped per-field cores** rather than
 * re-implementing their rules:
 *  - [RegistrationStep.PSEUDO] / [RegistrationStep.PHONE] / [RegistrationStep.EMAIL]
 *    → [SignupAvailabilityPolicy]'s per-step gates (local validity AND server
 *    availability, phone honouring [RegistrationFields.skipPhone]);
 *  - [RegistrationStep.PASSWORD] → [PasswordEntry] (length ≥ 8 AND confirm match).
 *
 * The four arms with no prior core are encoded here directly, verbatim from iOS:
 *  - [RegistrationStep.IDENTITY] → first & last name both non-blank (iOS trims both
 *    with `.whitespacesAndNewlines` before the empty check → [String.isNotBlank]);
 *  - [RegistrationStep.LANGUAGE] → a system language is chosen (iOS
 *    `!systemLanguage.isEmpty`; the value is a picker-sourced language code);
 *  - [RegistrationStep.PROFILE] → always allowed (the optional photo/bio step);
 *  - [RegistrationStep.RECAP] → the terms checkbox is ticked.
 *
 * The app-side `RegistrationViewModel` feeds this boolean straight into
 * [RegistrationStepNavigator.advance], keeping the ViewModel a thin caller.
 */
object RegistrationStepGate {

    /** True when the wizard sitting on [step] with [fields] may advance. */
    fun canProceed(step: RegistrationStep, fields: RegistrationFields): Boolean = when (step) {
        RegistrationStep.PSEUDO ->
            SignupAvailabilityPolicy.usernameStepCanProceed(fields.username, fields.usernameAvailable)

        RegistrationStep.PHONE ->
            SignupAvailabilityPolicy.phoneStepCanProceed(
                phoneNumber = fields.phoneNumber,
                phoneAvailable = fields.phoneAvailable,
                skipPhone = fields.skipPhone,
            )

        RegistrationStep.EMAIL ->
            SignupAvailabilityPolicy.emailStepCanProceed(fields.email, fields.emailAvailable)

        RegistrationStep.IDENTITY ->
            fields.firstName.isNotBlank() && fields.lastName.isNotBlank()

        RegistrationStep.PASSWORD ->
            PasswordEntry.evaluate(fields.password, fields.confirmPassword).canProceed

        RegistrationStep.LANGUAGE ->
            fields.systemLanguage.isNotEmpty()

        RegistrationStep.PROFILE -> true

        RegistrationStep.RECAP -> fields.acceptTerms
    }
}
