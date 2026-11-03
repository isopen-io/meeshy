package me.meeshy.app.auth

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.PhonePlausibility
import me.meeshy.sdk.model.auth.RegistrationIdentity
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupFieldIssue
import me.meeshy.sdk.model.auth.SignupFieldMessage
import me.meeshy.sdk.model.auth.SignupPhoneRefusal
import me.meeshy.sdk.model.auth.SignupRefusal
import me.meeshy.sdk.model.auth.SignupSubmitError

/**
 * Le texte d'un message de champ.
 *
 * Un refus de la passerelle est rendu dans NOS mots ([SignupRefusalCopy]) : elle répond dans sa
 * langue, pas dans celle du lecteur, et sa validation brute (motif AJV) ne se montre jamais.
 */
@Composable
internal fun fieldMessageText(field: SignupField, message: SignupFieldMessage?): String? = when (message) {
    null -> null
    is SignupFieldMessage.Local -> when (message.issue) {
        SignupFieldIssue.PHONE_TOO_SHORT ->
            stringResource(R.string.signup_phone_too_short, PhonePlausibility.MIN_DIGITS)
        SignupFieldIssue.DISPLAY_NAME_TOO_SHORT ->
            stringResource(R.string.signup_min_characters, RegistrationIdentity.NAME_MIN)
        else -> stringResource(message.issue.labelRes())
    }
    is SignupFieldMessage.Refused -> stringResource(SignupRefusalCopy.fieldRefusal(field, message.refusal))
}

/** Le refus du numéro : celui de la passerelle d'abord, puis « requis », puis le verdict local. */
@Composable
internal fun phoneErrorText(state: SignupUiState): String? {
    val message = state.messageFor(SignupField.PHONE)
    if (message != null) return fieldMessageText(SignupField.PHONE, message)
    return if (state.phoneRequiredShown) stringResource(R.string.signup_phone_required) else null
}

/** Le refus du nom affiché ; « pseudo pris » se pose sous le PSEUDO, pas ici. */
@Composable
internal fun displayNameErrorText(state: SignupUiState): String? {
    val server = (state.submitError as? SignupSubmitError.Field)
        ?.takeIf { it.target == SignupField.DISPLAY_NAME && it.refusal != SignupRefusal.NAME_TAKEN }
    if (server != null) return stringResource(SignupRefusalCopy.fieldRefusal(SignupField.DISPLAY_NAME, server.refusal))
    return state.validation.displayName?.let {
        fieldMessageText(SignupField.DISPLAY_NAME, SignupFieldMessage.Local(it))
    }
}

/** Le refus du pseudo : le pseudo pris d'abord, puis la borne violée EN DIRECT, pendant la frappe. */
@Composable
internal fun usernameErrorText(state: SignupUiState): String? {
    val taken = (state.submitError as? SignupSubmitError.Field)?.takeIf { it.refusal == SignupRefusal.NAME_TAKEN }
    if (taken != null) return stringResource(R.string.signup_display_name_taken)
    return when (state.usernameRefusal) {
        null -> null
        RegistrationIdentity.UsernameRefusal.TOO_SHORT ->
            stringResource(R.string.signup_min_characters, RegistrationIdentity.PSEUDO_MIN)
        RegistrationIdentity.UsernameRefusal.TOO_LONG ->
            stringResource(R.string.signup_username_too_long, RegistrationIdentity.PSEUDO_MAX)
        RegistrationIdentity.UsernameRefusal.INVALID_CHARACTERS ->
            stringResource(R.string.signup_username_invalid_characters)
    }
}

private fun SignupFieldIssue.labelRes(): Int = when (this) {
    SignupFieldIssue.DISPLAY_NAME_REQUIRED -> R.string.signup_display_name_required
    SignupFieldIssue.DISPLAY_NAME_TOO_SHORT -> R.string.signup_min_characters
    SignupFieldIssue.DISPLAY_NAME_TOO_LONG -> R.string.signup_display_name_too_long
    SignupFieldIssue.DISPLAY_NAME_INVALID_CHARACTERS -> R.string.signup_display_name_invalid_characters
    SignupFieldIssue.EMAIL_INVALID -> R.string.signup_email_invalid
    SignupFieldIssue.PASSWORD_TOO_SHORT -> R.string.signup_password_too_short
    SignupFieldIssue.PHONE_TOO_SHORT -> R.string.signup_phone_implausible
    SignupFieldIssue.PHONE_IMPLAUSIBLE -> R.string.signup_phone_implausible
}
