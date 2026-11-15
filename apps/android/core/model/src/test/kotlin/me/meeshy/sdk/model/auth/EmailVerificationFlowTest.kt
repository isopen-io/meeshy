package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmailVerificationFlowTest {

    @Test
    fun `un compte cree par cette connexion dit qu'il est cree`() {
        assertThat(EmailVerificationLead.from(accountCreated = true, passwordProven = true))
            .isEqualTo(EmailVerificationLead.ACCOUNT_CREATED)
        assertThat(EmailVerificationLead.from(accountCreated = true, passwordProven = false))
            .isEqualTo(EmailVerificationLead.ACCOUNT_CREATED)
    }

    @Test
    fun `un mot de passe tape sur un compte existant dit que l'activation est requise et ajoute l'astuce`() {
        val lead = EmailVerificationLead.from(accountCreated = false, passwordProven = true)
        assertThat(lead).isEqualTo(EmailVerificationLead.ACTIVATION_REQUIRED)
        assertThat(lead.showsInboxHint).isTrue()
    }

    @Test
    fun `sans mot de passe l'accroche dit seulement que le code est parti`() {
        val lead = EmailVerificationLead.from(accountCreated = false, passwordProven = false)
        assertThat(lead).isEqualTo(EmailVerificationLead.CODE_SENT)
        assertThat(lead.showsInboxHint).isFalse()
    }

    @Test
    fun `chaque code de la passerelle a sa phrase sous le champ`() {
        assertThat(EmailProofError.forVerification("INVALID_VERIFICATION", 400)).isEqualTo(EmailProofError.INVALID_CODE)
        assertThat(EmailProofError.forVerification("VERIFICATION_EXPIRED", 400)).isEqualTo(EmailProofError.EXPIRED_CODE)
        assertThat(EmailProofError.forVerification("WEAK_PASSWORD", 400)).isEqualTo(EmailProofError.WEAK_PASSWORD)
        assertThat(EmailProofError.forVerification("RATE_LIMITED", 429)).isEqualTo(EmailProofError.TOO_MANY_ATTEMPTS)
        assertThat(EmailProofError.forVerification(null, 429)).isEqualTo(EmailProofError.TOO_MANY_ATTEMPTS)
        assertThat(EmailProofError.forVerification("NETWORK", null)).isEqualTo(EmailProofError.OFFLINE)
        assertThat(EmailProofError.forVerification("SOMETHING_NEW", 500)).isEqualTo(EmailProofError.GENERIC)
    }

    @Test
    fun `un code inconnu rend le generique sans jamais afficher le message du serveur`() {
        assertThat(EmailProofError.forVerification("UNKNOWN", 400)).isEqualTo(EmailProofError.GENERIC)
    }

    @Test
    fun `le renvoi ne distingue que le reseau et le limiteur`() {
        assertThat(EmailProofError.forResend("NETWORK", null)).isEqualTo(EmailProofError.OFFLINE)
        assertThat(EmailProofError.forResend("RATE_LIMITED", 429)).isEqualTo(EmailProofError.TOO_MANY_ATTEMPTS)
        assertThat(EmailProofError.forResend("INVALID_VERIFICATION", 400)).isEqualTo(EmailProofError.RESEND_FAILED)
        assertThat(EmailProofError.forResend(null, 500)).isEqualTo(EmailProofError.RESEND_FAILED)
    }

    @Test
    fun `la veille dure 15 minutes au plus avec une lecture toutes les 3 secondes`() {
        assertThat(EmailVerificationWatchPolicy.INTERVAL_MS).isEqualTo(3_000L)
        assertThat(EmailVerificationWatchPolicy.withinLimit(14 * 60_000L + 59_000L)).isTrue()
        assertThat(EmailVerificationWatchPolicy.withinLimit(15 * 60_000L)).isFalse()
    }

    @Test
    fun `la veille s'arrete des que l'adresse est prouvee ou que le jeton est fini`() {
        assertThat(EmailVerificationWatchPolicy.keepsWatching(EmailVerificationWatchStatus.PENDING)).isTrue()
        assertThat(EmailVerificationWatchPolicy.keepsWatching(EmailVerificationWatchStatus.PROVEN)).isFalse()
        assertThat(EmailVerificationWatchPolicy.keepsWatching(EmailVerificationWatchStatus.ENDED)).isFalse()
    }

    @Test
    fun `le bouton verifier reutilise la porte du code a six chiffres`() {
        val gate = OtpVerificationGate()
        assertThat(gate.canVerify("12345")).isFalse()
        assertThat(gate.canVerify("123456")).isTrue()
        assertThat(gate.copy(isVerifying = true).canVerify("123456")).isFalse()
    }
}
