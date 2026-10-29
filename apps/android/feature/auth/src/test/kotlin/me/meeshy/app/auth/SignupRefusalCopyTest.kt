package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupRefusal
import me.meeshy.sdk.model.auth.SignupSubmitError
import org.junit.Test

/**
 * Un refus de la passerelle se lit TOUJOURS dans nos mots : le texte serveur (motif AJV brut,
 * anglais technique) n'atteint jamais l'écran, ni sous un champ ni au-dessus du bouton.
 */
class SignupRefusalCopyTest {

    @Test
    fun aRejectedDisplayName_saysWhichCharactersAreAllowed() {
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.DISPLAY_NAME, SignupRefusal.INVALID))
            .isEqualTo(R.string.signup_display_name_invalid_characters)
    }

    @Test
    fun aRejectedEmailPhoneOrPassword_getsTheirOwnSentence() {
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.EMAIL, SignupRefusal.INVALID))
            .isEqualTo(R.string.signup_email_invalid)
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.PHONE, SignupRefusal.INVALID))
            .isEqualTo(R.string.signup_phone_invalid)
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.PASSWORD, SignupRefusal.INVALID))
            .isEqualTo(R.string.signup_error_invalid_field)
    }

    @Test
    fun typedRefusals_keepTheirSpecificSentence() {
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.EMAIL, SignupRefusal.EMAIL_TAKEN))
            .isEqualTo(R.string.signup_email_taken)
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.DISPLAY_NAME, SignupRefusal.NAME_TAKEN))
            .isEqualTo(R.string.signup_display_name_taken)
        assertThat(SignupRefusalCopy.fieldRefusal(SignupField.PHONE, SignupRefusal.PHONE_OWNERSHIP_CONFLICT))
            .isEqualTo(R.string.signup_phone_conflict)
    }

    @Test
    fun aGlobalRefusal_neverShowsTheServerText() {
        val raw = SignupSubmitError.Global("must match pattern \"^(?=.*\\p{L})\"")
        assertThat(SignupRefusalCopy.globalRefusal(raw)).isEqualTo(R.string.signup_error_rejected)
        assertThat(SignupRefusalCopy.globalRefusal(SignupSubmitError.Global(null)))
            .isEqualTo(R.string.signup_error_rejected)
    }
}
