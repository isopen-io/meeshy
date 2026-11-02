package me.meeshy.app.auth

import androidx.annotation.StringRes
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupRefusal
import me.meeshy.sdk.model.auth.SignupSubmitError

/**
 * La phrase, dans la langue du lecteur, de chaque refus de la passerelle.
 *
 * Le texte du serveur n'est JAMAIS rendu : une validation Fastify répond un motif AJV brut
 * (`must match pattern "…"`), en anglais technique, qui n'était pas destiné à l'écran. Chaque
 * refus est donc traduit par son champ et son motif, avec un repli générique localisé.
 */
internal object SignupRefusalCopy {

    @StringRes
    fun fieldRefusal(field: SignupField, refusal: SignupRefusal): Int = when (refusal) {
        SignupRefusal.PHONE_OWNERSHIP_CONFLICT -> R.string.signup_phone_conflict
        SignupRefusal.PHONE_INVALID -> R.string.signup_phone_invalid
        SignupRefusal.EMAIL_TAKEN -> R.string.signup_email_taken
        SignupRefusal.NAME_TAKEN -> R.string.signup_display_name_taken
        SignupRefusal.INVALID -> when (field) {
            SignupField.DISPLAY_NAME -> R.string.signup_display_name_invalid_characters
            SignupField.EMAIL -> R.string.signup_email_invalid
            SignupField.PHONE -> R.string.signup_phone_invalid
            SignupField.PASSWORD -> R.string.signup_error_invalid_field
        }
    }

    @StringRes
    @Suppress("UNUSED_PARAMETER")
    fun globalRefusal(error: SignupSubmitError.Global): Int = R.string.signup_error_rejected
}
