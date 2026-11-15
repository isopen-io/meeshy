package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La passerelle motive ses refus de preuve par SMS dans le champ `error` (chaîne
 * machine) : un 400 sans `code`, que `ApiError` rend sous `HTTP_400`. Chaque motif
 * servi aujourd'hui, par `PhonePasswordResetService` et `PhoneTransferService`,
 * a ici son verdict — et un motif inconnu n'en emporte aucun.
 */
class PhoneProofRefusalTest {

    private fun refusal(message: String?, httpStatus: Int? = 400, code: String? = "HTTP_400") =
        PhoneProofRefusal.from(httpStatus = httpStatus, code = code, message = message)

    @Test
    fun `les motifs de la recuperation par telephone`() {
        assertThat(refusal("invalid_phone")).isEqualTo(PhoneProofRefusal.INVALID_PHONE)
        assertThat(refusal("user_not_found")).isEqualTo(PhoneProofRefusal.ACCOUNT_NOT_FOUND)
        assertThat(refusal("phone_not_verified")).isEqualTo(PhoneProofRefusal.PHONE_NOT_VERIFIED)
        assertThat(refusal("identity_mismatch")).isEqualTo(PhoneProofRefusal.IDENTITY_MISMATCH)
        assertThat(refusal("invalid_code")).isEqualTo(PhoneProofRefusal.CODE_INVALID)
        assertThat(refusal("code_expired")).isEqualTo(PhoneProofRefusal.CODE_EXPIRED)
        assertThat(refusal("max_attempts_exceeded")).isEqualTo(PhoneProofRefusal.ATTEMPTS_EXHAUSTED)
        assertThat(refusal("sms_send_failed")).isEqualTo(PhoneProofRefusal.SMS_FAILED)
    }

    @Test
    fun `un jeton d'etape inconnu, perime ou hors etape recommence le parcours`() {
        listOf("invalid_token", "token_expired", "invalid_step", "transfer_expired", "invalid_transfer_type", "invalid_transfer_token")
            .forEach { assertThat(refusal(it)).isEqualTo(PhoneProofRefusal.SESSION_EXPIRED) }
    }

    @Test
    fun `les motifs du transfert de numero`() {
        assertThat(refusal("phone_not_found")).isEqualTo(PhoneProofRefusal.ACCOUNT_NOT_FOUND)
        assertThat(refusal("Numéro de téléphone invalide")).isEqualTo(PhoneProofRefusal.INVALID_PHONE)
    }

    @Test
    fun `un 429 demande d'attendre, quel que soit son texte`() {
        assertThat(refusal("Trop de demandes", httpStatus = 429, code = "RATE_LIMITED")).isEqualTo(PhoneProofRefusal.RATE_LIMITED)
        assertThat(refusal("rate_limited")).isEqualTo(PhoneProofRefusal.RATE_LIMITED)
    }

    @Test
    fun `une panne de transport n'est pas un refus`() {
        assertThat(refusal("timeout", httpStatus = null, code = "NETWORK")).isEqualTo(PhoneProofRefusal.OFFLINE)
    }

    @Test
    fun `un code type servi demain prime sur le texte`() {
        assertThat(refusal("Erreur", code = "INVALID_CODE")).isEqualTo(PhoneProofRefusal.CODE_INVALID)
        assertThat(refusal("Erreur", code = "max-attempts-exceeded")).isEqualTo(PhoneProofRefusal.ATTEMPTS_EXHAUSTED)
    }

    @Test
    fun `la casse et les espaces ne changent pas le motif`() {
        assertThat(refusal("  Identity_Mismatch ")).isEqualTo(PhoneProofRefusal.IDENTITY_MISMATCH)
    }

    @Test
    fun `un motif inconnu ou absent est un echec, jamais une exception`() {
        assertThat(refusal("quelque_chose_de_neuf")).isEqualTo(PhoneProofRefusal.FAILED)
        assertThat(refusal(null, code = null)).isEqualTo(PhoneProofRefusal.FAILED)
        assertThat(refusal("internal_error", httpStatus = 500, code = "HTTP_500")).isEqualTo(PhoneProofRefusal.FAILED)
    }
}
